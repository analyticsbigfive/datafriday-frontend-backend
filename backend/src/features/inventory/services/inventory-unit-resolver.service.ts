import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { StockItemKind } from '../../logistics/dto/logistics.dto';

/**
 * Identité des articles comptés (clé d'article, nom normalisé, catalogue) et conditionnement utilisé pour convertir les comptages en unités.
 */
@Injectable()
export class InventoryUnitResolverService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * itemId (InventoryCount) → itemKey (nom, référentiel Logistic/StockMovement).
   * `componentIngredientId()` (front, utils/inventoryUtils.js) pose l'id d'une ligne
   * de comptage à `marketPriceId || sourceId || id` — un article readyForSale se
   * compte sous son MenuItem.id, un ingrédient/composant sous son MarketPrice.id
   * (vérifié en base 2026-08-05 : des ingrédients affichés en Live n'ont AUCUNE
   * ligne MenuItem). Les deux catalogues sont donc consultés ; MenuItem gagne en
   * cas de collision d'id. Un id résolu dans NI l'un NI l'autre reste orphelin —
   * même limitation connue que `itemNameById` plus haut (Q39/Q45).
   */
  async resolveItemKeysByIds(
    itemIds: string[],
    tenantId: string,
  ): Promise<Map<string, { name: string; kind: StockItemKind }>> {
    const m = new Map<string, { name: string; kind: StockItemKind }>();
    if (!itemIds.length) return m;
    // MarketPrice/MenuItem couvrent le cas nominal (`marketPriceId || sourceId || id`
    // résolu côté front, cf. inventoryUtils.js). Ingredient/Packaging/MenuComponent
    // couvrent le repli `sourceId`/`id` — atteint quand le référentiel /stock n'a pas
    // pu attacher de MarketPrice à l'ingrédient (mp introuvable dans
    // itemRefsForMenuItem) : sans ce repli, l'item était orphelin et silencieusement
    // exclu du push Logistic (cf. Bun - Burger, session 2026-08-26 — comptage résolu
    // sous l'id Ingredient, jamais son MarketPrice pourtant lié en base).
    // ADR-0006 (chantier 377) : le `kind` renvoyé ici EST déjà `itemRefId`'s table
    // d'origine — transmis tel quel à `logistics.reset()` pour lui éviter de
    // re-résoudre par nom ce qu'on sait déjà avec certitude.
    const [marketPrices, menuItems, ingredients, packagings, components] = await Promise.all([
      this.prisma.marketPrice.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, itemName: true } }),
      this.prisma.menuItem.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, name: true } }),
      this.prisma.ingredient.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, name: true } }),
      this.prisma.packaging.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, name: true } }),
      this.prisma.menuComponent.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, name: true } }),
    ]);
    for (const mp of marketPrices) if (mp.itemName) m.set(mp.id, { name: mp.itemName, kind: 'marketPrice' });
    for (const mi of menuItems) if (mi.name) m.set(mi.id, { name: mi.name, kind: 'menuItem' });
    for (const ing of ingredients) if (!m.has(ing.id) && ing.name) m.set(ing.id, { name: ing.name, kind: 'ingredient' });
    for (const pkg of packagings) if (!m.has(pkg.id) && pkg.name) m.set(pkg.id, { name: pkg.name, kind: 'packaging' });
    for (const comp of components) if (!m.has(comp.id) && comp.name) m.set(comp.id, { name: comp.name, kind: 'menuComponent' });
    return m;
  }

  // ── Pre-event Inventory : baseline « quantités attendues » ───────────────────
  // attendu = comptage POST-event de l'événement précédent + Σ mouvements
  // Logistic depuis ce comptage. Cycle complet :
  // docs (frontend) modules/10_POST_EVENT_INVENTORY.md §8.

  /** Miroir TS de `normalizeStr` front (src/utils/predictiveAnalytics.js:70) —
   *  MÊME normalisation des deux côtés, sinon la jointure par nom
   *  (StockMovement.itemKey = nom libre ↔ MenuItem.name) diverge. */
  normalizeName(v: unknown): string {
    if (v == null) return '';
    return String(v)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase();
  }

  /** nom normalisé → ids de catalogue du tenant portant ce nom, MenuItem d'abord, puis
   *  MarketPrice (`itemName`), puis MenuComponent. `StockMovement.itemKey` et les lignes de
   *  consommation ventes sont des NOMS libres (piège n°1 du domaine Stock) : c'est le seul
   *  pont vers le référentiel compté. Or l'inventaire compte « à 1 cran » : une ligne
   *  comptée porte l'id du MenuItem vendu tel quel, OU celui de l'ingrédient (MarketPrice)
   *  / du composant d'une recette (`componentIngredientId`, inventoryUtils.js), et la liste
   *  est dédoublonnée par NOM : « Coca-Cola CAN 33cl » est compté sous son id MarketPrice
   *  dès qu'il entre dans une recette, même si un MenuItem homonyme existe. Joindre au seul
   *  MenuItem (comportement jusqu'au 2026-09-17) laissait 70 % des lignes comptées sans
   *  attendu et hors de la feuille pre-event. Un nom est donc joint à TOUS ses ids ; le
   *  premier (MenuItem) reste l'id « principal » quand aucun comptage ne tranche. */
  async catalogIdsByNormName(tenantId: string): Promise<Map<string, string[]>> {
    const [menuItems, marketPrices, components] = await Promise.all([
      this.prisma.menuItem.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.marketPrice.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, itemName: true },
      }),
      this.prisma.menuComponent.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    const out = new Map<string, string[]>();
    const add = (name: unknown, id: string) => {
      const nk = this.normalizeName(name);
      if (!nk) return;
      const ids = out.get(nk) ?? [];
      if (!ids.includes(id)) ids.push(id);
      out.set(nk, ids);
    };
    for (const mi of menuItems) add(mi.name, mi.id);
    for (const mp of marketPrices) add(mp.itemName, mp.id);
    for (const c of components) add(c.name, c.id);
    return out;
  }

  /** Quantité par paquet du référentiel **INVENTAIRE** (BUG-239) — miroir de la
   *  résolution front (`src/utils/inventoryUtils.js:486-545`) : la fiche menu item
   *  (`inventoryNumberOfUnits`) prime, mais SEULEMENT sur une valeur d'intention
   *  (> 0 et ≠ 1 — le formulaire persiste `Number(x) || 1`, donc 1 ≡ « pas de
   *  facteur paquet »), sinon MarketPrice puis MenuComponent, sinon 1.
   *
   *  C'est la taille de paquet du champ **Packed** de l'écran de comptage. Les
   *  attendus doivent être exprimés dans CETTE unité : les exprimer dans celle de
   *  la Logistique (`resolveUnitsPerPackForItemKey`, qui donne la priorité au
   *  MarketPrice) faisait légender un champ « packs de 24 » par un nombre de
   *  packs de 12. Q39 tranchera quel référentiel fait foi *en amont* ; ici on
   *  garantit seulement que le nombre affiché et le champ qu'il légende parlent
   *  de la même chose. */
  async resolveInventoryUnitsPerPack(
    itemIds: string[],
    tenantId: string,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const ids = [...new Set(itemIds.filter(Boolean))];
    if (!ids.length) return out;

    // Un id compté peut être un MenuItem, un MarketPrice, un MenuComponent (voire un
    // Ingredient/Packaging, repli `sourceId`/`id` de componentIngredientId) : on lit
    // chaque catalogue par id, puis par NOM pour les replis croisés, comme le front
    // (`allMenuItemsData.find(mi => mi.id === data.id || mi.name === name)`, puis
    // MarketPrice par id ou nom, puis ComponentDefinition).
    const [miById, mpById, compById, ingById, pkgById] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, name: true, inventoryNumberOfUnits: true },
      }),
      this.prisma.marketPrice.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, itemName: true, packedUnits: true },
      }),
      this.prisma.menuComponent.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, name: true, packedUnits: true },
      }),
      this.prisma.ingredient.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } }),
      this.prisma.packaging.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } }),
    ]);
    const mi = new Map(miById.map((r) => [r.id, r]));
    const mp = new Map(mpById.map((r) => [r.id, r]));
    const comp = new Map(compById.map((r) => [r.id, r]));
    const nameById = new Map<string, string>();
    for (const r of miById) nameById.set(r.id, r.name);
    for (const r of mpById) if (!nameById.has(r.id)) nameById.set(r.id, r.itemName);
    for (const r of compById) if (!nameById.has(r.id)) nameById.set(r.id, r.name);
    for (const r of ingById) if (!nameById.has(r.id)) nameById.set(r.id, r.name);
    for (const r of pkgById) if (!nameById.has(r.id)) nameById.set(r.id, r.name);

    const names = [...new Set([...nameById.values()].filter(Boolean))];
    const [miByNameRows, mpByNameRows, compByNameRows] = names.length
      ? await Promise.all([
          this.prisma.menuItem.findMany({
            where: { tenantId, name: { in: names } },
            select: { name: true, inventoryNumberOfUnits: true },
          }),
          this.prisma.marketPrice.findMany({
            where: { tenantId, deletedAt: null, itemName: { in: names } },
            select: { itemName: true, packedUnits: true },
          }),
          this.prisma.menuComponent.findMany({
            where: { tenantId, deletedAt: null, name: { in: names } },
            select: { name: true, packedUnits: true },
          }),
        ])
      : [[], [], []];
    // Intention = valeur > 0 et ≠ 1 (le formulaire persiste `Number(x) || 1`).
    const intent = (v: unknown) => {
      const n = Number(v);
      return n > 0 && n !== 1 ? n : null;
    };
    const positive = (v: unknown) => {
      const n = Number(v);
      return n > 0 ? n : null;
    };
    const miIntentByName = new Map<string, number>();
    for (const r of miByNameRows) {
      const n = intent(r.inventoryNumberOfUnits);
      const nk = this.normalizeName(r.name);
      if (n && !miIntentByName.has(nk)) miIntentByName.set(nk, n);
    }
    const mpPackByName = new Map<string, number>();
    for (const r of mpByNameRows) {
      const n = positive(r.packedUnits);
      const nk = this.normalizeName(r.itemName);
      if (n && !mpPackByName.has(nk)) mpPackByName.set(nk, n);
    }
    const compPackByName = new Map<string, number>();
    for (const r of compByNameRows) {
      const n = positive(r.packedUnits);
      const nk = this.normalizeName(r.name);
      if (n && !compPackByName.has(nk)) compPackByName.set(nk, n);
    }

    for (const id of ids) {
      const nk = this.normalizeName(nameById.get(id));
      const v =
        intent(mi.get(id)?.inventoryNumberOfUnits) ??
        miIntentByName.get(nk) ??
        positive(mp.get(id)?.packedUnits) ??
        mpPackByName.get(nk) ??
        positive(comp.get(id)?.packedUnits) ??
        compPackByName.get(nk) ??
        1;
      out.set(id, v);
    }
    return out;
  }
}
