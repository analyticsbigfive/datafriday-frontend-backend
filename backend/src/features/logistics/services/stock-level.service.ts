import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { pickNextEventBeforeDoorsOpen } from '../../../shared/utils/event-window.util';
import { eventSalesByElement } from '../logistics.queries';
import { LogisticsElementScopeService } from './logistics-element-scope.service';
import { RecipeExplosionService } from './recipe-explosion.service';
import { StockItemIdentityService } from './stock-item-identity.service';
import { StockReferentialService } from './stock-referential.service';
import { SalesRawRow, SHOP_TYPES } from '../logistics.types';
import { collectOrphanLevels } from './orphan-stock-levels';

/**
 * Niveaux de stock et consommation dérivée des ventes (vue stock, inventaire live, attendus).
 */
@Injectable()
export class StockLevelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly logisticsElementScopeService: LogisticsElementScopeService,
    private readonly recipeExplosionService: RecipeExplosionService,
    private readonly stockItemIdentityService: StockItemIdentityService,
    private readonly stockReferentialService: StockReferentialService,
  ) {}

  // ─── GET /logistics/:spaceId/stock ───────────────────────────────────────────

  /**
   * État courant du registre : niveaux + consommation dérivée des ventes depuis
   * l'ancre (dernier reset logistique, sinon premier mouvement). Chemin UNIQUE
   * partagé par `getStock` (écran Logistic) et `getExpectedStockIndex` (attendus
   * des écrans d'inventaire, décision JLH 2026-08-20) — les deux ne peuvent pas
   * diverger.
   */
  private async getLevelsAndConsumption(spaceId: string, tenantId: string) {
    const [allLevels, lastReco, firstMovement, elementIds] = await Promise.all([
      this.prisma.stockLevel.findMany({ where: { tenantId, spaceId } }),
      this.prisma.stockReconciliation.findFirst({
        // kind:null = resets logistiques UNIQUEMENT. Les documents 'post-event'
        // (Post-event Inventory) partagent la table mais ne matérialisent PAS les
        // ventes en mouvements SALE — les laisser déplacer l'ancre réinjecterait
        // les ventes antérieures en stock fantôme au prochain calcul dérivé.
        where: { tenantId, spaceId, kind: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, eventId: true },
      }),
      this.prisma.stockMovement.findFirst({
        where: { tenantId, spaceId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.logisticsElementScopeService.getSpaceElementIds(spaceId, tenantId),
    ]);

    // Ancre de dérivation des ventes : dernière réconciliation, sinon premier
    // mouvement (= activation de la logistique sur l'espace). Sans ancre, pas de
    // ventes décomptées (aucun stock suivi de toute façon).
    const anchorAt = lastReco?.createdAt ?? firstMovement?.createdAt ?? null;

    const consumption =
      anchorAt && elementIds.length
        ? await this.recipeExplosionService.deriveSalesRaw(tenantId, elementIds, anchorAt).then((raw) =>
            this.recipeExplosionService.explodeSalesToConsumption(raw, tenantId),
          )
        : ([] as Array<{ elementId: string; itemKey: string; quantity: number }>);

    // Niveaux pointant vers des SpaceElement disparus (le saveConfiguration v1 fait
    // du delete+recreate) : masqués — sinon la vue affiche des lignes fantômes que
    // le reset rejette ensuite (element hors espace).
    const currentIds = new Set(elementIds);
    const levels = allLevels.filter((l) => currentIds.has(l.elementId));

    // ADR-0006 (chantier 377, étape 4) : auto-guérison d'un renommage catalogue. `itemKey`
    // reste la clé de lecture (getStock/getExpectedStockIndex la comparent par nom), mais si
    // `itemRefId` est posé (double-écriture/backfill) et que l'entité référencée porte
    // aujourd'hui un nom différent, on réécrit `itemKey` à la volée sur la réponse (jamais en
    // base) — le rapprochement par nom redevient juste, sans attendre un nouveau mouvement.
    // `consumption` (vente explosée par nom, pas d'itemRefId à ce stade) reste hors périmètre :
    // portée notée dans le chantier 377, pas traitée ici.
    await this.canonicalizeLevelItemKeys(levels, tenantId);

    return { levels, consumption, anchorAt, lastRecoId: lastReco?.id ?? null };
  }

  private async canonicalizeLevelItemKeys(levels: Array<{ itemKey: string; itemKind: string | null; itemRefId: string | null }>, tenantId: string) {
    const idsByKind = new Map<string, Set<string>>();
    for (const level of levels) {
      if (!level.itemKind || !level.itemRefId) continue;
      if (!idsByKind.has(level.itemKind)) idsByKind.set(level.itemKind, new Set());
      idsByKind.get(level.itemKind)!.add(level.itemRefId);
    }
    if (!idsByKind.size) return;

    const nameById = new Map<string, string>();
    const marketPriceIds = [...(idsByKind.get('marketPrice') ?? [])];
    const ingredientIds = [...(idsByKind.get('ingredient') ?? [])];
    const packagingIds = [...(idsByKind.get('packaging') ?? [])];
    const menuComponentIds = [...(idsByKind.get('menuComponent') ?? [])];
    const menuItemIds = [...(idsByKind.get('menuItem') ?? [])];
    const [marketPrices, ingredients, packagings, components, menuItems] = await Promise.all([
      marketPriceIds.length
        ? this.prisma.marketPrice.findMany({ where: { tenantId, deletedAt: null, id: { in: marketPriceIds } }, select: { id: true, itemName: true } })
        : [],
      ingredientIds.length
        ? this.prisma.ingredient.findMany({ where: { tenantId, deletedAt: null, id: { in: ingredientIds } }, select: { id: true, name: true } })
        : [],
      packagingIds.length
        ? this.prisma.packaging.findMany({ where: { tenantId, deletedAt: null, id: { in: packagingIds } }, select: { id: true, name: true } })
        : [],
      menuComponentIds.length
        ? this.prisma.menuComponent.findMany({ where: { tenantId, deletedAt: null, id: { in: menuComponentIds } }, select: { id: true, name: true } })
        : [],
      menuItemIds.length
        ? this.prisma.menuItem.findMany({ where: { tenantId, deletedAt: null, id: { in: menuItemIds } }, select: { id: true, name: true } })
        : [],
    ]);
    for (const mp of marketPrices) nameById.set(mp.id, mp.itemName);
    for (const ing of ingredients) nameById.set(ing.id, ing.name);
    for (const pkg of packagings) nameById.set(pkg.id, pkg.name);
    for (const comp of components) nameById.set(comp.id, comp.name);
    for (const mi of menuItems) nameById.set(mi.id, mi.name);

    for (const level of levels) {
      if (!level.itemRefId) continue;
      const currentName = nameById.get(level.itemRefId);
      if (currentName && currentName !== level.itemKey) level.itemKey = currentName;
    }
  }

  /**
   * Attendu Logistic « en l'état » par `elementId::itemKey` — exactement ce que
   * l'écran Logistic affiche (StockLevel − consommation, casse de pack, clamp ≥ 0 ;
   * miroir serveur du getter front `logistics/expectedFor`). Consommé par les
   * attendus des écrans Pre/Post-event Inventory (décision JLH 2026-08-20 :
   * l'attendu d'inventaire = les chiffres Logistic au moment où on ouvre l'écran).
   */
  async getExpectedStockIndex(spaceId: string, tenantId: string) {
    const { levels, consumption, anchorAt } = await this.getLevelsAndConsumption(spaceId, tenantId);

    const levelByKey = new Map(levels.map((l) => [`${l.elementId}::${l.itemKey}`, l]));
    const consumedByKey = new Map<string, number>();
    for (const c of consumption) {
      const k = `${c.elementId}::${c.itemKey}`;
      consumedByKey.set(k, (consumedByKey.get(k) ?? 0) + (Number(c.quantity) || 0));
    }

    // Union niveaux ∪ consommation : une vente sur un niveau jamais approvisionné
    // s'affiche 0 côté Logistic (expectedFor), pas « absent » — même contrat ici.
    const index = new Map<
      string,
      { elementId: string; itemKey: string; packed: number; loose: number; unitsPerPack: number | null }
    >();
    for (const k of new Set([...levelByKey.keys(), ...consumedByKey.keys()])) {
      const level = levelByKey.get(k);
      const consumed = consumedByKey.get(k) ?? 0;
      const norm = this.stockItemIdentityService.normalizeLevel(
        level?.packedUnits ?? 0,
        (level?.looseUnits ?? 0) - consumed,
        level?.unitsPerPack,
      );
      const [elementId, ...rest] = k.split('::');
      index.set(k, {
        elementId,
        itemKey: rest.join('::'),
        packed: norm.packed,
        loose: norm.loose,
        unitsPerPack: level?.unitsPerPack ?? null,
      });
    }
    return { index, asOf: new Date(), anchorAt };
  }

  /** Prochain event de l'espace dont les portes ne sont pas encore ouvertes
   *  (cf. pickNextEventBeforeDoorsOpen). Candidats bornés à partir de la veille : un
   *  event qui finit après minuit (fin 03:00) reste candidat jusqu'à sa fin. */
  private async findNextEventBeforeDoorsOpen(spaceId: string, tenantId: string): Promise<{ id: string } | null> {
    const now = new Date();
    const [space, candidates] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { timezone: true } }),
      this.prisma.event.findMany({
        where: { spaceId, tenantId, eventDate: { gte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) } },
        orderBy: { eventDate: 'asc' },
        take: 10,
        select: {
          id: true,
          eventDate: true,
          eventStartDate: true,
          eventEndDate: true,
          eventEndTime: true,
          sessions: true,
        },
      }),
    ]);
    const next = pickNextEventBeforeDoorsOpen(candidates, space?.timezone || 'Europe/Paris', now);
    return next ? { id: next.id } : null;
  }

  async getStock(spaceId: string, tenantId: string, configId?: string, eventId?: string) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true, name: true } });
    if (!space) throw new NotFoundException(`Space ${spaceId} not found`);

    const [configurations, event, nextEvent, stockState] = await Promise.all([
      // Config n'a pas de tenantId propre (scoping via spaceId, déjà vérifié tenant plus haut).
      this.prisma.config.findMany({ where: { spaceId }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } }),
      eventId ? this.prisma.event.findFirst({ where: { id: eventId, spaceId, tenantId }, select: { configurationId: true } }) : null,
      // Prochain match pour cet espace : calibre le "besoin prédit" par défaut (retour
      // PO, sans ?event= explicite dans l'URL) sur la feuille de réarmement du prochain
      // match plutôt que rien. Même règle que SpaceInventoryView.resolveEventContext
      // (mode pré-event) : le match du jour reste « prochain » jusqu'à l'ouverture des
      // portes (eventDate est à minuit, `eventDate > now` l'excluait dès 00:00).
      this.findNextEventBeforeDoorsOpen(spaceId, tenantId),
      this.getLevelsAndConsumption(spaceId, tenantId),
    ]);
    const { levels, consumption, anchorAt, lastRecoId } = stockState;

    // Priorité : configId explicite (deep-link ?configuration=) > config de l'event
    // (deep-link ?event=, comme Space Inventory) > 1re configuration de l'espace.
    // Sentinel 'all' explicite (chantier 341, vue agrégée par défaut) : ne rentre PAS
    // dans cette résolution single-config, court-circuite directement.
    const aggregateAllConfigs = configId === 'all';
    const inConfigs = (id: string | null | undefined) => !!id && configurations.some((c) => c.id === id);
    const resolvedConfigId = aggregateAllConfigs
      ? 'all'
      : (inConfigs(configId) ? configId : null) ??
        (inConfigs(event?.configurationId) ? event!.configurationId : null) ??
        configurations[0]?.id ??
        null;

    const stockElementIds = new Set(
      levels.filter((l) => l.packedUnits > 0 || l.looseUnits > 0).map((l) => l.elementId),
    );
    const elementsWithItems = await this.stockReferentialService.getSpaceElementsWithItems(
      spaceId,
      tenantId,
      aggregateAllConfigs ? undefined : resolvedConfigId ?? undefined,
      { aggregateAllConfigs, stockElementIds },
    );

    // Chaque élément est complété par ses niveaux orphelins non vides, en ligne
    // minimale (cf. collectOrphanLevels).
    const orphanEntries = collectOrphanLevels(elementsWithItems, levels);
    // BUG-133-02 : marketPriceId est déjà connu sur le niveau (posé par le
    // mouvement qui l'a créé) — résolution groupée du packagingType, bornée aux
    // seuls ids réellement référencés par ces niveaux orphelins (jamais tout le
    // catalogue tenant), au lieu de figer packagingType à null alors que l'info
    // est à portée d'un simple hop.
    const orphanMarketPriceIds = [...new Set(orphanEntries.map((o) => o.level.marketPriceId).filter(Boolean))] as string[];
    const orphanMarketPriceById = new Map<string, { inventoryPackaging: string | null }>();
    if (orphanMarketPriceIds.length) {
      const rows = await this.prisma.marketPrice.findMany({
        where: { tenantId, id: { in: orphanMarketPriceIds }, deletedAt: null },
        select: { id: true, inventoryPackaging: true },
      });
      for (const mp of rows) orphanMarketPriceById.set(mp.id, mp);
    }
    for (const { el, level } of orphanEntries) {
      el.items.push({
        name: level.itemKey,
        id: level.itemKey,
        kind: 'product',
        // Un niveau atteint ce chemin uniquement si canonicalizeLevelItemKeys (getLevelsAndConsumption)
        // n'a pas pu le rattacher à un item courant du référentiel — vrai orphelin (article
        // supprimé du catalogue), pas juste renommé.
        refKind: null,
        unit: null,
        marketPriceId: level.marketPriceId ?? null,
        unitsPerPack: level.unitsPerPack ?? null,
        packagingType: level.marketPriceId ? orphanMarketPriceById.get(level.marketPriceId)?.inventoryPackaging ?? null : null,
        picture: null,
        usedIn: [],
      });
    }
    for (const el of elementsWithItems) {
      el.items.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }

    return {
      spaceId,
      space,
      configurations,
      resolvedConfigId,
      nextEventId: nextEvent?.id ?? null,
      anchor: anchorAt ? { at: anchorAt, reconciliationId: lastRecoId } : null,
      elements: elementsWithItems,
      levels,
      consumption,
    };
  }

  /**
   * Onglet Inventaire live du module Live (question #22 du tracker front, tranchée 2026-07-23) :
   * combinaison mouvements Restock (StockLevel) + décrément par vente en temps réel (consumption),
   * exactement le calcul de `getStock` — pas de source/formule neuve, juste reformaté en deux
   * arbres. Granularité : celle par défaut de `readyForSale` (comme le Réarmement), pas d'override.
   * Pas de configId/eventId : Live veut "maintenant", pas un instantané historique.
   *
   * Le "restant" (packedUnits/looseUnits moins consumedLoose) reste calculé côté front, comme pour
   * `getStock` (`store/modules/logistics.js`) — pas de formule dupliquée ici.
   */
  async getLiveInventory(spaceId: string, tenantId: string) {
    const { elements, levels, consumption } = await this.getStock(spaceId, tenantId);

    const levelByKey = new Map(levels.map((l) => [`${l.elementId}::${l.itemKey}`, l]));
    const consumedByKey = new Map(consumption.map((c) => [`${c.elementId}::${c.itemKey}`, c.quantity]));

    const shops = elements
      .filter((el) => SHOP_TYPES.includes(el.type))
      .map((el) => ({
        shopId: el.id,
        shopName: el.name,
        items: el.items.map((item) => {
          const level = levelByKey.get(`${el.id}::${item.name}`);
          return {
            itemKey: item.name,
            // ADR-0006 (chantier 377) : id/kind déjà résolus par le référentiel (itemRefsForMenuItem),
            // simplement propagés ici — voir CreateMovementDto.itemKind pour l'usage côté écriture.
            itemKind: item.refKind ?? null,
            itemRefId: item.id ?? null,
            unit: item.unit ?? null,
            packedUnits: level?.packedUnits ?? 0,
            looseUnits: level?.looseUnits ?? 0,
            unitsPerPack: level?.unitsPerPack ?? item.unitsPerPack ?? null,
            marketPriceId: level?.marketPriceId ?? item.marketPriceId ?? null,
            consumedLoose: consumedByKey.get(`${el.id}::${item.name}`) ?? 0,
          };
        }),
      }));

    // Index inversé item → shops (11_LIVE.md §3.2) — n'existe nulle part ailleurs, seul vrai
    // travail neuf de ce chantier : les deux vues partagent la même donnée déjà assemblée ci-dessus.
    const itemsByKey = new Map<string, { itemKey: string; itemKind: string | null; itemRefId: string | null; unit: string | null; shops: any[] }>();
    for (const shop of shops) {
      for (const item of shop.items) {
        let entry = itemsByKey.get(item.itemKey);
        if (!entry) {
          // Identité produit stable au niveau du groupe : même article, même id/kind
          // quel que soit le shop (ADR-0006, chantier 377).
          entry = { itemKey: item.itemKey, itemKind: item.itemKind, itemRefId: item.itemRefId, unit: item.unit, shops: [] };
          itemsByKey.set(item.itemKey, entry);
        }
        entry.shops.push({
          shopId: shop.shopId,
          shopName: shop.shopName,
          packedUnits: item.packedUnits,
          looseUnits: item.looseUnits,
          unitsPerPack: item.unitsPerPack,
          marketPriceId: item.marketPriceId,
          consumedLoose: item.consumedLoose,
        });
      }
    }

    return {
      shops,
      items: [...itemsByKey.values()].sort((a, b) => a.itemKey.localeCompare(b.itemKey, 'fr')),
    };
  }

  /**
   * Consommation des ventes d'UN événement, explosée en ingrédients (Q35 — Option 1,
   * décision owner 2026-07-27) : la réconciliation post-event consomme ce résultat à
   * la place des ventes brutes au grain menu item (le « Vendu » d'une ligne comptée
   * au grain ingrédient n'est plus 0 → plus de manquant fantôme sur les produits
   * préparés). Réutilise `explodeSalesToConsumption` telle quelle — le jour où Q18
   * (explosion des combos) y atterrit, la réco en hérite sans modification.
   *
   * Sélection des transactions = MIROIR de `SpaceEventTimelineService.getEventTimelineBatch`
   * (fenêtre `eventDate → endDate+1j`, scope intégration, status='V', deletedAt NULL)
   * — dupliqué à dessein comme deriveSalesRaw ↔ loadRecipeContext ; toute clause
   * modifiée ici doit l'être là-bas, cf. spaces.service.ts:1225-1252. Différence
   * assumée avec `deriveSalesRaw` : pas d'ancre StockReconciliation (le périmètre
   * est l'événement, pas « depuis le dernier reset »).
   *
   * Jamais d'écarté silencieux (BUG-238) : PdV non mappé / hors espace et produit
   * sans mapping menu item sortent dans `unjoined` (noms + unités), pas du calcul.
   */
  async deriveEventConsumption(
    spaceId: string,
    eventId: string,
    tenantId: string,
    /** D19 (document Bertrand 2026-10-06) : ventes d'un PDV arrêtées à cet instant (son
     *  dernier « Marquer compté » en post-event). PDV absent : toute la fenêtre. */
    options: {
      untilByElement?: Map<string, Date>;
      /** Ventes POSTÉRIEURES à cet instant, et seulement pour ces PDV (les autres sont
       *  exclus) : ventes faites depuis un comptage, retirées avant l'envoi vers Logistic. */
      sinceByElement?: Map<string, Date>;
    } = {},
  ) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true, eventDate: true, eventEndDate: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    const windowStart = new Date(event.eventDate);
    const windowEnd = new Date(event.eventEndDate ?? event.eventDate);
    windowEnd.setDate(windowEnd.getDate() + 1);

    // BUG-378-02 : un espace peut être alimenté par PLUSIEURS intégrations (Stade
    // Jean Bouin = PFC + SFP). Le findFirst d'origine prenait la première mappée,
    // et un match de l'autre club sortait 0 vente, sans rien de « non joint » :
    // le document affichait alors toute la consommation en manquant. Même règle
    // que le timeline (BUG-136-01) : findMany, clause IN.
    const [elementIds, locationMappings] = await Promise.all([
      this.logisticsElementScopeService.getSpaceElementIds(spaceId, tenantId),
      this.prisma.locationSpaceMapping.findMany({
        where: { tenantId, spaceId },
        select: { salesLocationId: true },
      }),
    ]);
    if (!elementIds.length) {
      return { eventId: event.id, eventName: event.name ?? null, lines: [], unjoined: null, elementNames: {} };
    }

    // Même précédence que le timeline : scope intégration si mappé, sinon mode
    // dégradé tenant-wide où seuls les PdV mappés à CET espace sont gardés (sans
    // ça, les ventes non mappées des autres espaces fuiraient dans la fenêtre).
    const integrationIds = [...new Set(locationMappings.map((m) => m.salesLocationId).filter(Boolean))];
    const integrationClause = integrationIds.length
      ? Prisma.sql`AND t."integrationId" IN (${Prisma.join(integrationIds)})`
      : Prisma.empty;
    const shopScopeClause = integrationIds.length
      ? Prisma.sql`(mem."spaceElementId" IS NULL OR mem."spaceElementId" IN (${Prisma.join(elementIds)}))`
      : Prisma.sql`mem."spaceElementId" IN (${Prisma.join(elementIds)})`;
    const bounds = [...(options.untilByElement ?? new Map<string, Date>()).entries()];
    const untilClause = bounds.length
      ? Prisma.sql`AND (
          mem."spaceElementId" IS NULL
          OR mem."spaceElementId" NOT IN (${Prisma.join(bounds.map(([id]) => id))})
          OR ${Prisma.join(
            bounds.map(([id, until]) => Prisma.sql`(mem."spaceElementId" = ${id} AND t."transactionDate" <= ${until})`),
            ' OR ',
          )}
        )`
      : Prisma.empty;
    const sinceBounds = [...(options.sinceByElement ?? new Map<string, Date>()).entries()];
    if (options.sinceByElement && !sinceBounds.length) {
      return { eventId: event.id, eventName: event.name ?? null, lines: [], unjoined: null, elementNames: {} };
    }
    const sinceClause = sinceBounds.length
      ? Prisma.sql`AND (${Prisma.join(
          sinceBounds.map(([id, since]) => Prisma.sql`(mem."spaceElementId" = ${id} AND t."transactionDate" > ${since})`),
          ' OR ',
        )})`
      : Prisma.empty;

    // Jointure mapping PdV en superset des deux conventions existantes
    // (timeline : mem sur t.locationId ; deriveSalesRaw : via WeezeventLocation
    // id OU weezeventId) — un mapping saisi sous l'une ou l'autre clé joint.
    const rows = await eventSalesByElement(
      this.prisma,
      tenantId,
      windowStart,
      windowEnd,
      integrationClause,
      shopScopeClause,
      untilClause,
      sinceClause,
    );

    const elementIdSet = new Set(elementIds);
    const joinable: SalesRawRow[] = [];
    const unjoinedShops = new Set<string>();
    const unjoinedProducts = new Set<string>();
    let unjoinedUnits = 0;
    for (const r of rows) {
      const qty = Number(r.qty ?? 0);
      if (!qty) continue;
      if (r.elementId && elementIdSet.has(r.elementId) && r.menuItemId) {
        joinable.push({
          elementId: r.elementId,
          menuItemId: r.menuItemId,
          eventId: event.id,
          eventName: event.name ?? null,
          qty,
          lastAt: windowStart,
        });
        continue;
      }
      if (!r.elementId || !elementIdSet.has(r.elementId)) {
        if (r.locationName) unjoinedShops.add(String(r.locationName));
      } else if (r.productName) {
        unjoinedProducts.add(String(r.productName));
      }
      unjoinedUnits += qty;
    }

    const lines = await this.recipeExplosionService.explodeSalesToConsumption(joinable, tenantId);

    // Noms des PdV vendeurs (BUG-378-02) : un PdV de l'espace qui vend sans être
    // dans le périmètre compté de l'écran inventaire sort en « non joint » côté
    // client, qui n'a alors AUCUNE source pour le nommer (son référentiel ne
    // contient que les PdV comptés) et affichait l'identifiant brut dans le
    // bandeau. Dictionnaire, pas un champ par ligne : le même PdV revient sur
    // des centaines de lignes.
    const elementIdsInLines = [...new Set(lines.map((l) => l.elementId).filter(Boolean))];
    const elementRows = elementIdsInLines.length
      ? await this.prisma.spaceElement.findMany({
          where: { id: { in: elementIdsInLines } },
          select: { id: true, name: true },
        })
      : [];
    const elementNames: Record<string, string> = {};
    for (const el of elementRows) if (el.name) elementNames[el.id] = el.name;

    return {
      eventId: event.id,
      eventName: event.name ?? null,
      lines,
      elementNames,
      unjoined:
        unjoinedShops.size || unjoinedProducts.size
          ? {
              shopNames: [...unjoinedShops].slice(0, 50),
              productNames: [...unjoinedProducts].slice(0, 50),
              units: Math.round(unjoinedUnits * 100) / 100,
            }
          : null,
    };
  }
}
