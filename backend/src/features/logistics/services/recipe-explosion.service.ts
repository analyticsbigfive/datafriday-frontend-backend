import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { StockItemKind } from '../dto/logistics.dto';
import { salesByElementSince } from '../logistics.queries';
import { StockItemIdentityService } from './stock-item-identity.service';
import { SalesRawRow, ItemRef, ElementItem, RecipeCtx } from '../logistics.types';

/**
 * Explosion des articles vendus en articles de stock (recettes, composants, conditionnements).
 */
@Injectable()
export class RecipeExplosionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockItemIdentityService: StockItemIdentityService,
  ) {}

  // ─── Référentiel des items par élément (PDV + Storage) ───────────────────────
  // Remplace l'ancien chemin front (useInventoryData + catalogues complets
  // ingredients/menu-items/market-prices) : le backend a déjà toutes les données
  // pour ne renvoyer QUE les denrées suivies par CET espace, nommées, sans dump
  // de catalogue tenant-wide.
  // readyForSale=Yes → toujours l'article lui-même (packedUnits/inventoryPackaging
  // propres si présents), SANS exception pour le cas mono-ingrédient (BUG-048 :
  // un item readyForSale=Yes n'est plus jamais fondu dans la Market Price de son
  // ingrédient — même règle appliquée à `explodeSalesToConsumption`/`perUnit`
  // (ventes) et à `buildConsolidatedInventory` côté front, les trois restent
  // alignés). readyForSale=No → explosion ingrédients + composants (combo déplié
  // par nom, profondeur ≤ 4) ; un composant qui n'est pas un combo est lui-même
  // déplié en ses propres ingrédients/sous-composants si son readyForSale est
  // "No" (sinon compté par son propre nom + son propre packaging).
  // Différence volontaire avec perUnit : le packaging (jamais consommé à la
  // vente) est ICI ajouté en lignes directes (non récursif), pour rester suivi
  // manuellement — miroir de buildConsolidatedInventory (front, non modifié).

  recipeSelect() {
    return {
      id: true,
      name: true,
      picture: true,
      readyForSale: true,
      comboItem: true,
      numberOfPiecesRecipe: true,
      inventoryPackagingType: true,
      inventoryNumberOfUnits: true,
      inventoryUnit: true,
      ingredients: {
        select: {
          numberOfUnits: true,
          ingredient: {
            select: {
              id: true,
              name: true,
              recipeUnit: true,
              marketPrice: { select: { id: true, itemName: true, packedUnits: true, inventoryPackaging: true } },
            },
          },
        },
      },
      components: {
        select: {
          numberOfUnits: true,
          component: { select: this.componentSelect() },
        },
      },
      packagings: {
        select: {
          numberOfUnits: true,
          packaging: { select: { id: true, name: true, recipeUnit: true } },
        },
      },
    } as const;
  }

  /**
   * Recette complète d'un Component (MenuComponent), pour le dépliage récursif
   * readyForSale=No (ingrédients + sous-composants). `children` n'est chargé qu'à
   * un niveau : les petits-enfants sont résolus par élargissement itératif dans
   * `loadRecipeContext` (mêmes contraintes que le Prisma `select` statique pour les
   * combos menu item — pas de récursion arbitraire dans une seule requête).
   */
  private componentSelect() {
    return {
      id: true,
      name: true,
      unit: true,
      readyForSale: true,
      packedUnits: true,
      inventoryPackaging: true,
      numberOfUnitsRecipe: true,
      ingredients: {
        select: {
          quantity: true,
          ingredient: {
            select: {
              id: true,
              name: true,
              recipeUnit: true,
              marketPrice: { select: { id: true, itemName: true, packedUnits: true, inventoryPackaging: true } },
            },
          },
        },
      },
      children: {
        select: {
          quantity: true,
          child: { select: { id: true, name: true, unit: true } },
        },
      },
    } as const;
  }

  /**
   * Charge les menu items (ids demandés + combos référencés par nom, profondeur ≤ 4)
   * avec leur recette complète, et résout les market prices par nom d'ingrédient
   * pour ceux sans lien direct — mêmes requêtes ciblées que explodeSalesToConsumption,
   * en PARALLÈLE (indépendant : pas de risque de désync des ventes, code dupliqué
   * à dessein pour ne jamais toucher au chemin ventes déjà validé en prod).
   */
  async loadRecipeContext(seedItems: any[], tenantId: string): Promise<RecipeCtx> {
    if (!seedItems.length) {
      return { comboByName: new Map(), mpByName: new Map(), componentById: new Map(), itemRefsCache: new Map(), componentRefsCache: new Map() };
    }
    const select = this.recipeSelect();
    const comboByName = new Map<string, any>();
    let frontier = seedItems;
    for (let depth = 0; depth < 4 && frontier.length; depth++) {
      const wantedNames = new Set<string>();
      for (const item of frontier) {
        for (const line of item.components) {
          const name = line.component?.name?.trim();
          if (name && !comboByName.has(name.toLowerCase())) wantedNames.add(name);
        }
      }
      if (!wantedNames.size) break;
      const candidates = await this.prisma.menuItem.findMany({
        where: { tenantId, deletedAt: null, name: { in: [...wantedNames] } },
        select,
      });
      // BUG-002/Q18 (Bertrand, 2026-07-24) : comboItem='Yes' explose TOUJOURS en
      // ses constituants, indépendamment de son propre readyForSale — ne plus
      // exiger readyForSale='No' en plus de comboItem='Yes'.
      frontier = candidates.filter((c) => this.normYesNo(c.comboItem) === 'Yes');
      for (const c of frontier) comboByName.set(c.name.trim().toLowerCase(), c);
    }

    // BUG-133-02 : la boucle des ingrédients d'itemRefsForMenuItem (résolution mp
    // par nom, `ctx.mpByName.get(...)`) n'est atteinte QUE pour les items qui ne
    // sont pas readyForSale='Yes' seul (isCombo || readyForSale!=='Yes', même garde
    // que ligne ~890 ci-dessous) — mais AVANT ce fix, `unresolvedNames` ne
    // collectait que les items readyForSale='Yes' mono-ingrédient, une population
    // héritée d'avant BUG-048 qui ne recoupe quasiment jamais les items atteignant
    // réellement cette boucle. Résultat : pour un ingrédient sans marketPriceId
    // direct référencé par un item readyForSale='No' (le chemin d'explosion
    // principal) ou un combo, la résolution par nom n'était jamais tentée —
    // packagingType/unitsPerPack silencieusement null malgré une Market Price au
    // nom identique dans le catalogue.
    const unresolvedNames = new Set<string>();
    for (const item of [...seedItems, ...comboByName.values()]) {
      const isCombo = this.normYesNo(item.comboItem) === 'Yes';
      if (!isCombo && this.normYesNo(item.readyForSale) === 'Yes') continue;
      for (const line of item.ingredients ?? []) {
        const ing = line.ingredient;
        if (ing?.name && !ing.marketPrice) unresolvedNames.add(ing.name.trim());
      }
    }
    // Tie-break homonymes délégué à resolveMarketPricesByName (ADR-0006) — clé relocalisée en
    // minuscules ici pour la recherche insensible à la casse propre à ce référentiel (ligne
    // ~1114), le tie-break "plus ancien gagne" lui-même reste partagé avec la résolution
    // d'identité stock pour ne pas rediverger comme sur le cas "Badiane".
    const mpByName = new Map<string, { id: string; itemName: string; packedUnits: number | null; inventoryPackaging: string | null }>();
    if (unresolvedNames.size) {
      const resolved = await this.stockItemIdentityService.resolveMarketPricesByName([...unresolvedNames], tenantId);
      for (const mp of resolved.values()) mpByName.set(mp.itemName.trim().toLowerCase(), mp);
    }

    // Components (readyForSale=No à déplier) : élargissement itératif du graphe
    // ComponentComponent PAR ID (relation réelle, contrairement au combo menu item
    // matché par nom) — profondeur bornée + Set visité, un cycle parent/enfant
    // n'est jamais garanti impossible en base.
    const componentById = new Map<string, any>();
    const componentIds = new Set<string>();
    for (const item of [...seedItems, ...comboByName.values()]) {
      for (const line of item.components ?? []) {
        const comp = line.component;
        if (comp?.id) {
          componentIds.add(comp.id);
          if (!componentById.has(comp.id)) componentById.set(comp.id, comp);
        }
      }
    }
    const visited = new Set<string>(componentIds);
    let componentFrontier = [...componentIds];
    for (let depth = 0; depth < 4 && componentFrontier.length; depth++) {
      const childIds = new Set<string>();
      for (const id of componentFrontier) {
        for (const line of componentById.get(id)?.children ?? []) {
          const childId = line.child?.id;
          if (childId && !visited.has(childId)) childIds.add(childId);
        }
      }
      if (!childIds.size) break;
      const rows = await this.prisma.menuComponent.findMany({
        where: { id: { in: [...childIds] }, tenantId, deletedAt: null },
        select: this.componentSelect(),
      });
      for (const c of rows) {
        componentById.set(c.id, c);
        visited.add(c.id);
      }
      componentFrontier = rows.map((c) => c.id);
    }

    return { comboByName, mpByName, componentById, itemRefsCache: new Map(), componentRefsCache: new Map() };
  }

  /** Lignes de stock (référentiel) contribuées par UN menu item, recette dépliée. */
  private itemRefsForMenuItem(item: any, ctx: RecipeCtx, depth = 0): ItemRef[] {
    const cacheKey = `${item.id}:${depth}`;
    const cached = ctx.itemRefsCache.get(cacheKey);
    if (cached) return cached;
    const refs: ItemRef[] = [];
    for (const line of item.packagings ?? []) {
      const pkg = line.packaging;
      const name = pkg?.name?.trim();
      if (!name) continue;
      refs.push({ key: name, id: pkg.id, kind: 'packaging', refKind: 'packaging', unit: pkg.recipeUnit ?? null, marketPriceId: null, unitsPerPack: null, packagingType: null, picture: null });
    }

    const isCombo = this.normYesNo(item.comboItem) === 'Yes';
    if (!isCombo && this.normYesNo(item.readyForSale) === 'Yes') {
      // readyForSale=Yes prime toujours sur lui-même, sans exception pour le cas
      // mono-ingrédient (BUG-048) : un item readyForSale=Yes n'est JAMAIS fondu
      // dans la Market Price de son ingrédient, même si sa recette n'en a qu'un
      // seul — il est compté comme son propre produit, avec son propre packaging
      // (inventoryPackagingType/inventoryNumberOfUnits/inventoryUnit). Exception :
      // comboItem='Yes' (BUG-002/Q18 Bertrand, 2026-07-24) explose TOUJOURS en ses
      // constituants, indépendamment de son propre readyForSale — cf. `isCombo` ci-dessus.
      const selfName = item.name?.trim();
      if (selfName) {
        refs.push({
          key: selfName, id: item.id, kind: 'product', refKind: 'menuItem', unit: item.inventoryUnit ?? null, marketPriceId: null,
          unitsPerPack: item.inventoryNumberOfUnits ?? null, packagingType: item.inventoryPackagingType ?? null, picture: item.picture ?? null,
        });
      }
      ctx.itemRefsCache.set(cacheKey, refs);
      return refs;
    }

    // readyForSale = No (ou non défini), OU comboItem='Yes' (toujours exploser,
    // BUG-002/Q18) : ingrédients directs + composants (combo récursif par nom,
    // packaging déjà traité au-dessus, non récursif).
    let leafCount = 0;
    for (const line of item.ingredients ?? []) {
      const ing = line.ingredient;
      const name = ing?.name?.trim();
      if (!name) continue;
      const mp = ing.marketPrice ?? ctx.mpByName.get(name.toLowerCase());
      refs.push({
        key: name, id: mp?.id ?? ing.id, kind: 'ingredient', refKind: mp ? 'marketPrice' : 'ingredient', unit: ing.recipeUnit ?? null,
        marketPriceId: mp?.id ?? null, unitsPerPack: mp?.packedUnits ?? null, packagingType: mp?.inventoryPackaging ?? null, picture: null,
      });
      leafCount++;
    }
    for (const line of item.components ?? []) {
      const comp = line.component;
      const name = comp?.name?.trim();
      if (!name) continue;
      const combo = depth < 4 ? ctx.comboByName.get(name.toLowerCase()) : null;
      if (combo) {
        refs.push(...this.itemRefsForMenuItem(combo, ctx, depth + 1));
      } else {
        const fullComp = ctx.componentById.get(comp.id) ?? comp;
        refs.push(...this.componentRefsForComponent(fullComp, ctx));
      }
      leafCount++;
    }

    if (leafCount === 0 && !(item.packagings ?? []).length) {
      const selfName = item.name?.trim();
      if (selfName) {
        refs.push({
          key: selfName, id: item.id, kind: 'product', refKind: 'menuItem', unit: item.inventoryUnit ?? null, marketPriceId: null,
          unitsPerPack: item.inventoryNumberOfUnits ?? null, packagingType: item.inventoryPackagingType ?? null, picture: item.picture ?? null,
        });
      }
    }
    ctx.itemRefsCache.set(cacheKey, refs);
    return refs;
  }

  /**
   * Ligne de stock représentant UN Component. Depuis la décision Q13
   * (QUESTIONS_A_BERTRAND.md, 2026-08-04 : "on ne décompose plus un composant, ni
   * au stock-up, ni à l'inventaire, ni au réarmement") un Component n'est plus
   * jamais exploré au-delà de lui-même — il est tracké/transféré tel quel, comme
   * l'Inventaire (`inventoryUtils.js`) et le Réarmement (`stockPlanning.js`) le font
   * déjà. BUG-260-02 (2026-08-13) : l'ancienne garde `readyForSale==='Yes'` ne se
   * déclenchait jamais en pratique (0 des 81 Component en base n'ont ce flag à
   * 'Yes' — il n'a de sens que pour un MenuItem, pas pour un sous-composant qui
   * n'est par construction jamais vendu directement) et explosait donc
   * systématiquement le composant en ses ingrédients bruts.
   */
  private componentRefsForComponent(comp: any, ctx: RecipeCtx, depth = 0): ItemRef[] {
    const name = comp?.name?.trim();
    if (!name) return [];
    const cacheKey = `${comp.id}:${depth}`;
    const cached = ctx.componentRefsCache.get(cacheKey);
    if (cached) return cached;
    const leaf: ItemRef[] = [{
      key: name, id: comp.id, kind: 'component', refKind: 'menuComponent', unit: comp.unit ?? null, marketPriceId: null,
      unitsPerPack: comp.packedUnits ?? null, packagingType: comp.inventoryPackaging ?? null, picture: null,
    }];
    ctx.componentRefsCache.set(cacheKey, leaf);
    return leaf;
  }

  /** Agrège les refs de plusieurs menu items en items de référentiel (1re valeur non nulle gagne). */
  aggregateItems(
    menuItems: Array<{ id: string; name: string }>,
    byId: Map<string, any>,
    ctx: RecipeCtx,
  ): Map<string, ElementItem> {
    const map = new Map<string, ElementItem>();
    for (const mi of menuItems) {
      const full = byId.get(mi.id);
      if (!full) continue;
      for (const ref of this.itemRefsForMenuItem(full, ctx)) {
        // ADR-0006 (chantier 377, étape 5) : clé par id, pas par nom — deux articles homonymes
        // (même nom, catalogue différent) restent deux entrées distinctes au lieu de fusionner
        // silencieusement (BUG connu, cf. audit du chantier). `ref.id` existe toujours (id réel
        // de la table d'origine, cf. `refKind`).
        let entry = map.get(ref.id);
        if (!entry) {
          entry = { name: ref.key, id: ref.id, kind: ref.kind, refKind: ref.refKind, unit: ref.unit, marketPriceId: ref.marketPriceId, unitsPerPack: ref.unitsPerPack, packagingType: ref.packagingType, picture: ref.picture, usedIn: [] };
          map.set(ref.id, entry);
        }
        if (!entry.usedIn.some((u) => u.id === mi.id)) {
          entry.usedIn.push({ id: mi.id, name: mi.name });
        }
      }
    }
    return map;
  }

  // ─── Dérivation des ventes (read-time) ───────────────────────────────────────

  /**
   * Quantités vendues par (élément, menu item, event) via les mappings Weezevent
   * (location → SpaceElement, produit → MenuItem), bornées par `since` (exclus).
   * - `status = 'V'` : seules les ventes validées (les W/C/R — attente/annulée/
   *   remboursée — ne consomment pas de stock), même filtre que les agrégats revenu.
   * - `deletedAt IS NULL` (BUG-110) : une transaction annulée après coup (webhook
   *   `delete`) ne doit pas non plus consommer de stock — même trou que BUG-108 sur
   *   `getEventTimelineBatch`, dupliqué ici car cette requête ne passe pas par la même
   *   jointure.
   * - Jointure location via WeezeventLocation avec OR (id interne OU weezeventId
   *   externe) : certains mappings historiques stockent l'id externe
   *   (même OR-join que builder-v2.service getSpaceShops).
   */
  async deriveSalesRaw(tenantId: string, elementIds: string[], since: Date | null): Promise<SalesRawRow[]> {
    if (!elementIds.length) return [];
    const sinceFilter = since ? Prisma.sql`AND t."transactionDate" > ${since}` : Prisma.empty;
    const rows = await salesByElementSince(this.prisma, tenantId, elementIds, sinceFilter);
    return rows.map((r) => ({ ...r, qty: Number(r.qty ?? 0) }));
  }

  /** 'Yes'/'No' normalisé (mêmes règles que MenuItemsService.normYesNo). */
  private normYesNo(value: unknown): 'Yes' | 'No' | null {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    const s = String(value ?? '').trim().toLowerCase();
    if (s === 'yes' || s === 'true' || s === 'oui' || s === '1') return 'Yes';
    if (s === 'no' || s === 'false' || s === 'non' || s === '0') return 'No';
    return null;
  }

  /**
   * Explose les ventes en consommation par (élément × itemKey), en miroir du
   * référentiel front (buildConsolidatedInventory) :
   * - readyForSale=Yes → clé = nom du menu item ; 1 unité par vente. Sans exception
   *   pour le cas mono-ingrédient (BUG-048) : ne bascule plus jamais sur la Market
   *   Price de l'ingrédient, même à ingrédient unique.
   * - readyForSale=No → explosion de recette : ingrédients + composants
   *   (numberOfUnits / numberOfPiecesRecipe par unité vendue), packaging exclu ;
   *   un composant portant le nom d'un menu item combo (comboItem=Yes,
   *   readyForSale=No) est récursivement déplié (profondeur ≤ 4). Un composant qui
   *   n'est PAS un combo est lui-même déplié en ses propres ingrédients/sous-
   *   composants si son readyForSale est "No" (sinon compté par son propre nom,
   *   1 unité par vente) — profondeur ≤ 4 + cycle-guard par id (ComponentComponent
   *   est un vrai graphe, pas un matching par nom).
   */
  async explodeSalesToConsumption(raw: SalesRawRow[], tenantId: string) {
    if (!raw.length) return [];
    // Component (MenuComponent) : recette pour le dépliage readyForSale=No — pas de
    // packaging ici (exclu à dessein de la consommation, cf. docstring de la
    // fonction), `children` chargé à un niveau (petits-enfants résolus par
    // élargissement itératif ci-dessous, même contrainte que les combos par nom).
    const componentSelect = {
      id: true,
      name: true,
      readyForSale: true,
      numberOfUnitsRecipe: true,
      ingredients: {
        select: {
          quantity: true,
          ingredient: { select: { name: true, marketPrice: { select: { itemName: true } } } },
        },
      },
      children: { select: { quantity: true, child: { select: { id: true, name: true } } } },
    } as const;
    const recipeSelect = {
      id: true,
      name: true,
      readyForSale: true,
      comboItem: true,
      numberOfPiecesRecipe: true,
      ingredients: {
        select: {
          numberOfUnits: true,
          // id/marketPriceId : identité catalogue de la ligne de consommation
          // (BUG-378-02), même chaîne que le comptage front (marketPriceId → id).
          ingredient: { select: { id: true, name: true, marketPriceId: true } },
        },
      },
      components: { select: { numberOfUnits: true, component: { select: componentSelect } } },
    } as const;

    const menuItemIds = [...new Set(raw.map((r) => r.menuItemId))];
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, tenantId, deletedAt: null },
      select: recipeSelect,
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const comboByName = new Map<string, any>();

    // Charge itérativement les combos référencés par nom dans les composants
    // (le front matche component.name ↔ menuItem.name), profondeur bornée.
    let frontier = items;
    for (let depth = 0; depth < 4 && frontier.length; depth++) {
      const wantedNames = new Set<string>();
      for (const item of frontier) {
        for (const line of item.components) {
          const name = line.component?.name?.trim();
          if (name && !comboByName.has(name.toLowerCase())) wantedNames.add(name);
        }
      }
      if (!wantedNames.size) break;
      const candidates = await this.prisma.menuItem.findMany({
        where: { tenantId, deletedAt: null, name: { in: [...wantedNames] } },
        select: recipeSelect,
      });
      // BUG-002/Q18 (Bertrand, 2026-07-24) : comboItem='Yes' explose TOUJOURS en
      // ses constituants, indépendamment de son propre readyForSale — ne plus
      // exiger readyForSale='No' en plus de comboItem='Yes'.
      frontier = candidates.filter((c) => this.normYesNo(c.comboItem) === 'Yes');
      for (const c of frontier) comboByName.set(c.name.trim().toLowerCase(), c);
    }

    // Components (readyForSale=No à déplier) : élargissement itératif du graphe
    // ComponentComponent PAR ID — miroir du même bloc dans loadRecipeContext
    // (Path A), dupliqué à dessein (cf. docstring en tête de fonction).
    const componentById = new Map<string, any>();
    const componentIds = new Set<string>();
    for (const mi of [...items, ...comboByName.values()]) {
      for (const line of mi.components ?? []) {
        const comp = line.component;
        if (comp?.id) {
          componentIds.add(comp.id);
          if (!componentById.has(comp.id)) componentById.set(comp.id, comp);
        }
      }
    }
    const componentVisited = new Set<string>(componentIds);
    let componentFrontier = [...componentIds];
    for (let depth = 0; depth < 4 && componentFrontier.length; depth++) {
      const childIds = new Set<string>();
      for (const id of componentFrontier) {
        for (const line of componentById.get(id)?.children ?? []) {
          const childId = line.child?.id;
          if (childId && !componentVisited.has(childId)) childIds.add(childId);
        }
      }
      if (!childIds.size) break;
      const rows = await this.prisma.menuComponent.findMany({
        where: { id: { in: [...childIds] }, tenantId, deletedAt: null },
        select: componentSelect,
      });
      for (const c of rows) {
        componentById.set(c.id, c);
        componentVisited.add(c.id);
      }
      componentFrontier = rows.map((c) => c.id);
    }

    // BUG-260-02 (2026-08-13) : un Component compte pour 1 unité de lui-même,
    // jamais décomposé en ingrédients/sous-composants — même alignement que
    // componentRefsForComponent (Path A) sur la décision Q13 (QUESTIONS_A_BERTRAND.md,
    // 2026-08-04 : "on ne décompose plus un composant"). L'ancienne garde
    // readyForSale==='Yes' ne se déclenchait jamais en pratique (0 Component avec ce
    // flag en base) et explosait donc systématiquement en ingrédients bruts, en
    // désaccord avec le référentiel Path A une fois celui-ci corrigé.
    // Identité catalogue par clé de consommation (BUG-378-02, ADR-0006) : la clé
    // reste le NOM (contrat Logistic), mais chaque ligne renvoyée porte aussi
    // (itemKind, itemRefId) pour que la réconciliation post-event joigne par id
    // d'abord, nom en repli. Même chaîne que le comptage front
    // (`componentIngredientId` : marketPriceId → id) : un ingrédient lié à une
    // Market Price est identifié par elle, sinon par lui-même. Première identité
    // vue pour un nom gagne (deux homonymes ne peuvent pas être départagés ici).
    const identityByKey = new Map<string, { itemKind: StockItemKind; itemRefId: string }>();
    const rememberIdentity = (key: string | null | undefined, kind: StockItemKind, refId: string | null | undefined) => {
      const k = key?.trim();
      if (!k || !refId || identityByKey.has(k)) return;
      identityByKey.set(k, { itemKind: kind, itemRefId: String(refId) });
    };

    const componentPerUnitCache = new Map<string, Map<string, number>>();
    const perUnitForComponent = (comp: any): Map<string, number> => {
      const cached = componentPerUnitCache.get(comp.id);
      if (cached) return cached;
      const result = new Map<string, number>();
      const name = comp?.name?.trim();
      if (name) {
        result.set(name, 1);
        rememberIdentity(name, 'menuComponent', comp.id);
      }
      componentPerUnitCache.set(comp.id, result);
      return result;
    };

    const perUnitCache = new Map<string, Map<string, number>>();
    const perUnit = (item: any, depth = 0): Map<string, number> => {
      // Le dépliage combo est gaté par depth → le cache doit l'inclure.
      const cacheKey = `${item.id}:${depth}`;
      const cached = perUnitCache.get(cacheKey);
      if (cached) return cached;
      const result = new Map<string, number>();
      const add = (key: string | null | undefined, qty: number) => {
        const k = key?.trim();
        if (!k || !Number.isFinite(qty) || qty <= 0) return;
        result.set(k, (result.get(k) ?? 0) + qty);
      };
      // BUG-002/Q18 (Bertrand, 2026-07-24) : comboItem='Yes' explose TOUJOURS en
      // ses constituants, indépendamment de son propre readyForSale.
      const isCombo = this.normYesNo(item.comboItem) === 'Yes';
      if (!isCombo && this.normYesNo(item.readyForSale) === 'Yes') {
        add(item.name, 1);
        rememberIdentity(item.name, 'menuItem', item.id);
      } else {
        const pieces = Number(item.numberOfPiecesRecipe) > 0 ? Number(item.numberOfPiecesRecipe) : 1;
        for (const line of item.ingredients) {
          const ing = line.ingredient;
          add(ing?.name, Number(line.numberOfUnits ?? 0) / pieces);
          if (ing?.marketPriceId) rememberIdentity(ing.name, 'marketPrice', ing.marketPriceId);
          else rememberIdentity(ing?.name, 'ingredient', ing?.id);
        }
        for (const line of item.components) {
          const qty = Number(line.numberOfUnits ?? 0) / pieces;
          const name = line.component?.name?.trim();
          const combo = name && depth < 4 ? comboByName.get(name.toLowerCase()) : null;
          const compId = line.component?.id;
          const fullComp = !combo && compId ? componentById.get(compId) : null;
          if (combo) {
            for (const [k, q] of perUnit(combo, depth + 1)) add(k, q * qty);
          } else if (fullComp) {
            for (const [k, q] of perUnitForComponent(fullComp)) add(k, q * qty);
          } else {
            add(name, qty);
          }
        }
      }
      perUnitCache.set(cacheKey, result);
      return result;
    };

    const consumption = new Map<string, { elementId: string; itemKey: string; quantity: number }>();
    for (const row of raw) {
      const item = byId.get(row.menuItemId);
      if (!item) continue; // menu item supprimé depuis
      for (const [itemKey, qtyPerUnit] of perUnit(item)) {
        const key = `${row.elementId}::${itemKey}`;
        let agg = consumption.get(key);
        if (!agg) {
          agg = { elementId: row.elementId, itemKey, quantity: 0 };
          consumption.set(key, agg);
        }
        agg.quantity += qtyPerUnit * row.qty;
      }
    }
    // (itemKind, itemRefId) uniquement quand l'identité est connue : les appelants
    // Logistic (reset, simulation) ne lisent que itemKey/quantity et restent
    // indifférents ; la réconciliation post-event les exploite quand ils sont là.
    return [...consumption.values()].map((c) => ({
      ...c,
      quantity: Math.round(c.quantity * 100) / 100,
      ...(identityByKey.get(c.itemKey) ?? {}),
    }));
  }
}
