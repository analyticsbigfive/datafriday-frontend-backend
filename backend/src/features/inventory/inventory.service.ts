import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementReason } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { LogisticsService } from '../logistics/logistics.service';
import { StockItemKind } from '../logistics/dto/logistics.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { CreatePostEventReconciliationDto } from './dto/create-post-event-reconciliation.dto';

/** État de push Logistic des lignes d'un match, clé `elementId::itemId` (cf. pushCountToLogistic). */
type LogisticPushState = Map<string, { id: string; updatedAt: Date; logisticPushedAt: Date | null }>;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logistics: LogisticsService,
  ) {}

  // ── GET /inventory/:spaceId/:eventId ────────────────────────────────────────
  // Priority: InventoryCount rows (granular, always up-to-date)
  //           → latest InventorySnapshot (full-blob save)
  //           → empty state (never 404 — prevents localStorage fallback on front)
  //
  // `phase` (BUG-237) : les deux écrans d'inventaire partagent le même eventId
  // (règle « un match = un eventId ») et `InventoryCount` n'a pas de colonne de
  // phase — sans discriminant, le Post-event s'ouvrait pré-rempli ET déjà marqué
  // « compté » par le comptage d'avant-match. En phase 'post-event', les lignes
  // dont l'`updatedAt` est antérieur à la clôture du Pre-event (snapshot
  // kind='pre-event') sont donc renvoyées comme **proposition** :
  // valeurs conservées, `isCounted=false`, drapeau `carriedFromPreEvent`.
  async getBySpaceAndEvent(
    spaceId: string,
    eventId: string,
    tenantId: string,
    phase?: 'pre-event' | 'post-event',
  ) {
    this.logger.log(`GET inventory spaceId=${spaceId} eventId=${eventId} phase=${phase ?? 'none'}`);

    const [snapshot, counts, preSnapshot] = await Promise.all([
      this.prisma.inventorySnapshot.findFirst({
        where: { tenantId, spaceId, eventId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryCount.findMany({
        where: { tenantId, spaceId, eventId },
      }),
      phase === 'post-event'
        ? this.prisma.inventorySnapshot.findFirst({
            where: { tenantId, spaceId, eventId, kind: 'pre-event' },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          })
        : Promise.resolve(null),
    ]);
    const preCutoff = preSnapshot?.createdAt ?? null;

    // buildInventoryCounts SKIPPE les lignes shopId=null (inadressables par le
    // front). Si TOUTES les lignes sont dans ce cas, l'early-return « counts > 0 »
    // renvoyait `inventoryCounts: {}` en ignorant un snapshot pourtant présent →
    // inventaire affiché vide malgré des données sauvegardées. On ne prend la
    // branche counts QUE si elle produit un objet adressable.
    const builtCounts = counts.length > 0 ? this.buildInventoryCounts(counts, preCutoff) : {};
    if (Object.keys(builtCounts).length > 0) {
      return {
        id: snapshot?.id ?? null,
        tenantId,
        spaceId,
        eventId,
        inventoryCounts: builtCounts,
        createdAt: snapshot?.createdAt ?? null,
        updatedAt: snapshot?.updatedAt ?? null,
        createdBy: snapshot?.createdBy ?? null,
      };
    }

    // Repli snapshot : en phase post, un snapshot 'pre-event' est le comptage
    // d'AVANT-match — mêmes règles que ci-dessus (proposition, pas validation).
    if (snapshot) {
      if (phase === 'post-event' && (snapshot as any).kind === 'pre-event') {
        return { ...snapshot, inventoryCounts: this.asProposal(snapshot.inventoryCounts) };
      }
      return snapshot;
    }

    // No data yet — return empty so the front doesn't fall back to localStorage
    return {
      id: null,
      tenantId,
      spaceId,
      eventId,
      inventoryCounts: {},
      createdAt: null,
      updatedAt: null,
      createdBy: null,
    };
  }

  // ── GET /inventory/:spaceId/latest ──────────────────────────────────────────
  // Returns the most recently touched inventory across all events for this space.
  // Front reads both `.inventoryCounts` and `.eventId` (SpaceRestockView:1099).
  // Returns null (not 404) when no inventory exists — front handles null via ?.
  async getLatestBySpace(spaceId: string, tenantId: string) {
    this.logger.log(`GET latest inventory spaceId=${spaceId}`);

    // Check which table has the freshest data
    const [latestCount, latestSnapshot] = await Promise.all([
      this.prisma.inventoryCount.findFirst({
        where: { tenantId, spaceId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.inventorySnapshot.findFirst({
        where: { tenantId, spaceId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const countIsNewer =
      latestCount && (!latestSnapshot || latestCount.updatedAt >= latestSnapshot.createdAt);

    if (countIsNewer) {
      // Fetch all counts for the same event as the most recent count
      const [counts, event] = await Promise.all([
        this.prisma.inventoryCount.findMany({
          where: { tenantId, spaceId, eventId: latestCount.eventId },
        }),
        latestCount.eventId
          ? this.prisma.event.findFirst({ where: { id: latestCount.eventId }, select: { name: true } })
          : null,
      ]);
      // Même garde que getBySpaceAndEvent : ne servir la branche counts que si
      // elle est adressable (lignes shopId=null skippées par buildInventoryCounts).
      const builtLatest = this.buildInventoryCounts(counts);
      if (Object.keys(builtLatest).length > 0) {
        return {
          id: null,
          tenantId,
          spaceId,
          eventId: latestCount.eventId,
          eventName: event?.name ?? null,
          inventoryCounts: builtLatest,
          createdAt: latestCount.updatedAt,
          updatedAt: latestCount.updatedAt,
          createdBy: null,
        };
      }
    }

    if (latestSnapshot) {
      // eventName dénormalisé (additif) — évite au front de charger la liste des events
      // juste pour ce libellé (cf. Logistic : plus de dépendance à analyse/loadSpace).
      const event = latestSnapshot.eventId
        ? await this.prisma.event.findFirst({ where: { id: latestSnapshot.eventId }, select: { name: true } })
        : null;
      return { ...latestSnapshot, eventName: event?.name ?? null };
    }

    return null;
  }

  // ── POST /inventory ──────────────────────────────────────────────────────────
  // Saves a full horodated snapshot (append-only).
  async upsertInventory(dto: CreateInventoryDto, tenantId: string, userId?: string) {
    this.logger.log(
      `POST /inventory spaceId=${dto.spaceId} eventId=${dto.eventId ?? 'null'} kind=${dto.kind ?? 'null'}`,
    );
    return this.prisma.inventorySnapshot.create({
      data: {
        tenantId,
        spaceId: dto.spaceId,
        eventId: dto.eventId ?? null,
        // Phase du comptage ('pre-event'/'post-event') — null = legacy. Ferme le
        // cycle pre↔post (cf. getPreEventInventory / getPreEventBaseline).
        kind: dto.kind ?? null,
        inventoryCounts: dto.inventoryCounts as any,
        createdBy: userId ?? null,
      },
    });
  }

  // ── POST /inventory-counts ───────────────────────────────────────────────────
  // Upsert a single item count. Uses findFirst + create/update instead of
  // prisma.upsert because Prisma 5.x does not support null values in compound
  // unique where clauses (eventId and shopId are both nullable).
  //
  // TOCTOU : deux saves concurrents sur la même clé passaient tous deux le
  // findFirst (existing=null) puis créaient DEUX lignes — et la contrainte
  // @@unique ne bloquait pas quand eventId/shopId est NULL (NULLS DISTINCT par
  // défaut en Postgres). L'index unique est recréé NULLS NOT DISTINCT
  // (cf. prisma/sql/2026-07-18_inventorycount_unique_nulls_not_distinct.sql) ;
  // ici on rattrape la violation P2002 du perdant de la course et on retombe
  // sur l'update de la ligne gagnante.
  async saveInventoryCounts(dto: CreateInventoryCountDto, tenantId: string, userId?: string) {
    this.logger.log(
      `POST /inventory-counts spaceId=${dto.spaceId} shopId=${dto.shopId ?? 'null'} itemId=${dto.itemId}`,
    );

    const key = {
      tenantId,
      spaceId: dto.spaceId,
      eventId: dto.eventId ?? null,
      shopId: dto.shopId ?? null,
      itemId: dto.itemId,
    };

    const existing = await this.prisma.inventoryCount.findFirst({ where: key });

    const data = {
      packedUnits: dto.packedUnits,
      looseUnits: dto.looseUnits,
      isCounted: dto.isCounted,
      storageLocation: dto.storageLocation ?? null,
      countingStatus: dto.countingStatus ?? 'pending',
      countedBy: userId ?? null,
    };

    if (existing) {
      return this.prisma.inventoryCount.update({ where: { id: existing.id }, data });
    }

    try {
      return await this.prisma.inventoryCount.create({ data: { ...key, ...data } });
    } catch (e: any) {
      // P2002 = violation d'unicité : un save concurrent a créé la ligne entre
      // notre findFirst et notre create → on met à jour la ligne existante.
      if (e?.code !== 'P2002') throw e;
      const winner = await this.prisma.inventoryCount.findFirst({ where: key });
      if (!winner) throw e;
      return this.prisma.inventoryCount.update({ where: { id: winner.id }, data });
    }
  }

  // ── Réconciliation post-événement (Post-event Inventory) ────────────────────
  // Documents d'écarts compté vs « ce qui devrait rester après les ventes »,
  // persistés dans StockReconciliation avec kind='post-event'. Distinct du reset
  // logistique (kind=null) : ne touche PAS aux StockLevel et ne déplace PAS
  // l'ancre des ventes dérivées (exclue par kind:null côté logistics.service).
  // Doc : frontend/docs/modules/10_POST_EVENT_INVENTORY.md §7.

  /** Garde d'appartenance : le space doit exister pour ce tenant (miroir de
   *  logistics.assertSpace — le scoping where:{tenantId} seul renverrait des
   *  listes vides silencieuses sur un spaceId d'un autre tenant). */
  private async assertSpace(spaceId: string, tenantId: string) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true } });
    if (!space) throw new NotFoundException(`Space ${spaceId} not found`);
  }

  // ── POST /inventory/:spaceId/reconciliations ─────────────────────────────────
  async createPostEventReconciliation(
    spaceId: string,
    dto: CreatePostEventReconciliationDto,
    tenantId: string,
    userId?: string,
  ) {
    this.logger.log(
      `POST /inventory/${spaceId}/reconciliations eventId=${dto.eventId} lines=${dto.lines?.length ?? 0}`,
    );
    await this.assertSpace(spaceId, tenantId);
    // L'event doit appartenir au même tenant/space (pas de réconciliation
    // cross-space via un eventId arbitraire — même famille de failles que les
    // fiches cross-tenant du backend).
    const event = await this.prisma.event.findFirst({
      where: { id: dto.eventId, spaceId, tenantId },
      select: { id: true, name: true },
    });
    if (!event) throw new NotFoundException(`Event ${dto.eventId} not found in space ${spaceId}`);

    const created = await this.prisma.stockReconciliation.create({
      data: {
        tenantId,
        spaceId,
        eventId: event.id,
        // Nom dénormalisé : priorité au nom réel de l'event (source de vérité DB),
        // repli sur celui envoyé par le front (event supprimé entre-temps exclu
        // par le garde ci-dessus).
        eventName: event.name ?? dto.eventName ?? null,
        kind: 'post-event',
        lines: dto.lines as any,
        // Contexte de fabrication (BUG-238/241) : provenance du stock de départ
        // et ventes écartées faute de jointure. Sans ces marqueurs, un écart
        // fabriqué par une source manquante passe pour un manquant réel.
        meta: {
          baseline: {
            source: dto.preEventSource ?? 'none',
            // Stock de départ par PdV (BUG-378-02) : repli Logistic sur les PdV
            // sans comptage pré-event, et PdV restés sans aucun stock de départ.
            fallback: dto.baselineFallback ?? null,
            uncoveredElements: dto.baselineUncoveredElements ?? null,
          },
          salesUnjoined: dto.salesUnjoined ?? null,
          countedProgress: dto.countedProgress ?? null,
          // Q35 Option 1 : grain de la source « Vendu » ('consumption' = explosé
          // ingrédients, 'timeline' = brut article). null = document d'avant Q35.
          salesSource: dto.salesSource ?? null,
          // BUG-378-02 : provenance du prédit (version par défaut au grain
          // inventaire), prédictions non jointes et clés hors périmètre compté.
          // null = document antérieur (le front n'affiche alors aucun bandeau).
          predictedSource: dto.predictedSource ?? null,
          predictedUnjoined: dto.predictedUnjoined ?? null,
          perimeterExcluded: dto.perimeterExcluded ?? null,
        },
        createdBy: userId ?? null,
      } as any,
    });

    // Le comptage d'après-match devient la nouvelle référence du registre
    // Logistic (PDF 2026-08-21) — jusqu'ici le post-event ne touchait JAMAIS aux
    // StockLevel, et l'écart constaté était donc oublié par l'attendu du match
    // suivant.
    //
    // Source du comptage : la MÊME que le snapshot (canaux packed/loose bruts).
    // Les lignes du DTO ne portent qu'un total en unités (`countedUnits`) — s'en
    // servir obligerait à refabriquer une répartition packed/loose.
    const merged = await this.getBySpaceAndEvent(spaceId, event.id, tenantId, 'post-event');
    await this.pushCountToLogistic(
      spaceId,
      tenantId,
      'post-event',
      event,
      (merged?.inventoryCounts ?? {}) as Record<string, Record<string, any>>,
      userId,
    );

    return created;
  }

  // ── GET /inventory/:spaceId/reconciliations ──────────────────────────────────
  // Liste COMMUNE aux écrans Pre-event et Post-event Inventory (décision user
  // 2026-07-20) : documents des deux kinds, badge de type côté front. Lines
  // incluses : un space compte quelques documents, pas des milliers — la vue
  // réconciliation lit `lines` tel quel, aucun 2e fetch. Les resets logistiques
  // (kind null) restent EXCLUS (liste propre à la vue Logistic).
  // `canSeeExpected=false` (BUG-233) : les lignes des documents pre-event sont
  // EXPURGÉES de leurs attendus avant envoi — le document en base reste complet.
  async listInventoryReconciliations(spaceId: string, tenantId: string, canSeeExpected = true) {
    await this.assertSpace(spaceId, tenantId);
    const docs = await this.prisma.stockReconciliation.findMany({
      where: { tenantId, spaceId, kind: { in: ['post-event', 'pre-event'] } },
      orderBy: { createdAt: 'desc' },
      // Pas de `select` : la colonne `meta` (contexte de fabrication) doit
      // remonter avec le document, et l'énumérer explicitement casserait la
      // compilation tant que `prisma generate` n'a pas été rejoué après la
      // migration. Le document entier est de toute façon scopé au tenant.
    });
    return canSeeExpected ? docs : docs.map((d) => this.redactPreEventDoc(d));
  }

  // ── DELETE /inventory/:spaceId/reconciliations/:id ───────────────────────────
  // « Repartir de zéro » : supprimer le document puis recliquer « Générer la
  // réconciliation » (le document est une photo figée — pas d'édition, une
  // régénération). Périmètre STRICT kind pre/post-event : les resets logistiques
  // (kind null, ancre temporelle des ventes dérivées) sont hors d'atteinte.
  async deleteInventoryReconciliation(spaceId: string, id: string, tenantId: string) {
    await this.assertSpace(spaceId, tenantId);
    const doc = await this.prisma.stockReconciliation.findFirst({
      where: { id, tenantId, spaceId, kind: { in: ['post-event', 'pre-event'] } },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException(`Reconciliation ${id} not found in space ${spaceId}`);
    await this.prisma.stockReconciliation.delete({ where: { id: doc.id } });
    return { id: doc.id, deleted: true };
  }

  /** BUG-233 — retire des lignes pre-event tout ce qui révèle l'attendu :
   *  `expectedPacked/Loose/Units` ET `deltaPacked/Loose/Units` (sinon
   *  reconstructible : expected = counted − delta). Les post-event (lignes
   *  fournies par le client, aucune donnée cachée) passent inchangés. */
  private redactPreEventDoc<T extends { kind?: string | null; lines?: any }>(doc: T): T {
    if (doc?.kind !== 'pre-event' || !Array.isArray(doc.lines)) return doc;
    return {
      ...doc,
      lines: doc.lines.map((l: any) => {
        if (l == null || typeof l !== 'object') return l;
        const {
          expectedPacked,
          expectedLoose,
          expectedUnits,
          deltaPacked,
          deltaLoose,
          deltaUnits,
          // `deltaVsPredicted` part aussi : counted − predicted redonnerait le
          // besoin prédit, qui relève de la même permission que l'attendu.
          // `predictedUnits` idem — c'est une donnée de pilotage, pas de comptage.
          predictedUnits: _predictedUnits,
          deltaVsPredicted,
          ...rest
        } = l;
        return rest;
      }),
    };
  }

  // ── GET /inventory/:spaceId/event-consumption/:eventId ──────────────────────
  // Ventes de l'événement EXPLOSÉES en consommation d'ingrédients (Q35 Option 1) —
  // source « Vendu » de la réconciliation post-event. Délégué à LogisticsService
  // (propriétaire de la cascade d'explosion) ; exposé ici pour porter la
  // permission de l'écran inventaire (front.fb.spaceInventory), pas celle de la
  // Logistique.
  async getEventSalesConsumption(spaceId: string, eventId: string, tenantId: string) {
    return this.logistics.deriveEventConsumption(spaceId, eventId, tenantId);
  }

  // ── GET /inventory/:spaceId/pre-event/:eventId ───────────────────────────────
  // Inventaire de référence AVANT l'événement (réconciliation POST-event).
  // Définition exacte depuis l'écran Pre-event Inventory (2026-07-20, Q19 résolue) :
  // le dernier snapshot kind='pre-event' du MÊME event — c'est littéralement le
  // comptage d'avant match. Repli LEGACY (snapshots sans kind) : le plus récent
  // strictement antérieur au JOUR de l'event. Renvoie null (200) si aucun — le
  // front laisse alors leftFromSales/missing à null (« — »), jamais 0.
  async getPreEventInventory(spaceId: string, eventId: string, tenantId: string) {
    await this.assertSpace(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, eventDate: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    // 1) Cycle fermé : comptage Pre-event Inventory de CET event.
    const preSnapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { tenantId, spaceId, eventId, kind: 'pre-event' },
      orderBy: { createdAt: 'desc' },
    });
    if (preSnapshot) {
      return {
        id: preSnapshot.id,
        eventId: preSnapshot.eventId,
        createdAt: preSnapshot.createdAt,
        source: 'pre-event' as const,
        inventoryCounts: preSnapshot.inventoryCounts,
      };
    }

    // 2) Repli SCOPÉ (BUG-241) : le comptage post-event du match PRÉCÉDENT —
    // c'est la définition du cycle (§8.1), pas « le dernier snapshot du space ».
    // L'ancien repli (`createdAt < jour de l'event`, sans filtre eventId ni kind)
    // pouvait piocher le stock d'un tout autre match : bascule silencieuse
    // interdite par la règle « un match = un eventId » (§12.4).
    // ⚠️ Approximation assumée : les mouvements Logistic entre les deux matchs ne
    // sont PAS déduits — d'où `source` renvoyé au client, qui l'archive dans le
    // document (`meta.baseline.source`) et l'affiche.
    // `isSimulated: false` (décision JLH 2026-08-20) : les events créés par
    // l'outil QA « simuler une vente » ne participent pas au cycle d'inventaire —
    // sans ce filtre, un « [Simulé] ... » intercalé devant le dernier vrai match
    // capte le repli et le pré-remplissage tombe sur un event jamais compté.
    const previousEvent = await this.prisma.event.findFirst({
      where: { spaceId, tenantId, eventDate: { lt: event.eventDate }, isSimulated: false },
      orderBy: { eventDate: 'desc' },
      select: { id: true, name: true },
    });
    if (!previousEvent) return null;

    const snapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { tenantId, spaceId, eventId: previousEvent.id, kind: 'post-event' },
      orderBy: { createdAt: 'desc' },
    });
    if (!snapshot) return null;
    return {
      id: snapshot.id,
      eventId: snapshot.eventId,
      createdAt: snapshot.createdAt,
      source: 'previous-post-event' as const,
      previousEvent,
      inventoryCounts: snapshot.inventoryCounts,
    };
  }

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
  private async resolveItemKeysByIds(
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
  private normalizeName(v: unknown): string {
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
  private async catalogIdsByNormName(tenantId: string): Promise<Map<string, string[]>> {
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
  private async resolveInventoryUnitsPerPack(
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

  /** Attendus des écrans Pre/Post-event Inventory = état Logistic « en l'état »
   *  (décision JLH 2026-08-20, remplace le rejeu snapshot + mouvements de
   *  BUG-232/239) : ce que l'écran Logistic affiche à l'instant du chargement —
   *  StockLevel − ventes dérivées depuis l'ancre logistique, casse de pack,
   *  clamp ≥ 0 (`LogisticsService.getExpectedStockIndex`, chemin partagé avec
   *  `getStock` : les deux écrans ne peuvent pas diverger).
   *
   *  Ici on ne fait que traduire ce registre (clé = NOM libre, unité = paquet
   *  LOGISTIQUE) vers le référentiel compté : jointure nom → menuItemId, puis
   *  re-découpage en packed/loose dans la taille de paquet de l'INVENTAIRE
   *  (BUG-239 : le hint doit légender le champ Packed de l'écran dans SA propre
   *  unité). `units`/`unitsPerPack` restent null quand le conditionnement
   *  d'inventaire est inconnu — pas de total fabriqué.
   *
   *  Chemin unique du GET pre-event-baseline, du GET post-event-baseline ET de
   *  la réconciliation pre-event : les trois ne peuvent pas diverger. */
  private async computeLogisticExpected(spaceId: string, tenantId: string) {
    const { index, asOf } = await this.logistics.getExpectedStockIndex(spaceId, tenantId);
    const expected = new Map<
      string,
      { packed: number; loose: number; units: number | null; unitsPerPack: number | null }
    >();
    if (!index.size) {
      return { expected, unjoinedItemKeys: [] as string[], asOf, aliasGroups: new Map<string, string[]>() };
    }

    const idsByNormName = await this.catalogIdsByNormName(tenantId);
    const unjoined = new Set<string>();
    const joined: Array<{
      elementId: string;
      itemId: string;
      packed: number;
      loose: number;
      logUpp: number | null;
    }> = [];
    // Un même niveau Logistic est exposé sous TOUS les ids de catalogue de son nom
    // (cf. catalogIdsByNormName) : l'écran et la feuille retrouvent l'attendu quel
    // que soit l'id sous lequel l'article est compté. `aliasGroups` (élément × nom →
    // ids) permet à la feuille de ne pas dupliquer une ligne « Logistic seule ».
    const aliasGroups = new Map<string, string[]>();
    for (const entry of index.values()) {
      const nk = this.normalizeName(entry.itemKey);
      const itemIds = idsByNormName.get(nk);
      if (!itemIds?.length) {
        unjoined.add(entry.itemKey);
        continue;
      }
      const groupKey = `${entry.elementId}::${nk}`;
      const group = aliasGroups.get(groupKey) ?? [];
      for (const itemId of itemIds) {
        if (!group.includes(itemId)) group.push(itemId);
        joined.push({
          elementId: entry.elementId,
          itemId,
          packed: entry.packed,
          loose: entry.loose,
          logUpp: entry.unitsPerPack && entry.unitsPerPack > 0 ? entry.unitsPerPack : null,
        });
      }
      aliasGroups.set(groupKey, group);
    }
    if (unjoined.size) {
      this.logger.warn(
        `Inventory expected: ${unjoined.size} itemKey(s) Logistic non joignable(s) au référentiel ` +
          `compté, niveaux ignorés : ${[...unjoined].join(', ')}`,
      );
    }

    const invUppByItemId = await this.resolveInventoryUnitsPerPack(
      joined.map((j) => j.itemId),
      tenantId,
    );
    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Deux clés Logistic peuvent résoudre le même article (noms libres) : on
    // agrège par (élément × article) — en unités quand le conditionnement
    // d'inventaire est connu, par canaux packed/loose sinon (sémantique
    // Logistique historique, pas de conversion fabriquée).
    for (const j of joined) {
      const k = `${j.elementId}::${j.itemId}`;
      const invUpp = Number(invUppByItemId.get(j.itemId));
      const q = invUpp > 0 ? invUpp : 1;
      const cur = expected.get(k) ?? { packed: 0, loose: 0, units: null as number | null, unitsPerPack: null as number | null };
      if (q > 1) {
        // Le niveau a été tenu dans l'unité de la LOGISTIQUE ; les unités sont la
        // seule grandeur commune aux deux référentiels (BUG-239).
        const mUpp = j.logUpp ?? q;
        const units = round2((cur.units ?? cur.packed * q + cur.loose) + j.packed * mUpp + j.loose);
        const packed = Math.floor(units / q);
        expected.set(k, { packed, loose: round2(units - packed * q), units, unitsPerPack: q });
      } else {
        expected.set(k, {
          packed: cur.packed + j.packed,
          loose: round2(cur.loose + j.loose),
          units: null,
          unitsPerPack: null,
        });
      }
    }

    return { expected, unjoinedItemKeys: [...unjoined], asOf, aliasGroups };
  }

  /** Delta NET des mouvements Logistic de la fenêtre du match, en unités, par
   *  `elementId::menuItemId` — le terme « mouvements » des lignes de
   *  réconciliation post-event (`leftFromSales = pre-event − vendu + mouvements`,
   *  cf. utils/postEventReconciliation.js ; archivé par ligne, BUG-343-01/346-01).
   *  Indépendant de l'ATTENDU affiché (état Logistic, cf. computeLogisticExpected).
   *
   *  Fenêtre : du comptage pre-event de CE match (sinon eventDate) à
   *  eventEndDate + 1 j — miroir de deriveEventConsumption. `SALE` exclus :
   *  matérialisées par les resets, déjà comptées dans les ventes dérivées
   *  (décision 2026-07-30 #2). NON clampé : la réconciliation a besoin du
   *  mouvement réel du registre, pas d'un stock physique — le dériver d'une
   *  soustraction de stocks rendrait leur clamp. */
  private async netMovementUnitsForEventWindow(
    spaceId: string,
    tenantId: string,
    event: { id: string; eventDate: Date; eventEndDate: Date | null },
  ) {
    const preSnapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { tenantId, spaceId, eventId: event.id, kind: 'pre-event' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const from = preSnapshot?.createdAt ?? event.eventDate;
    const to = new Date(event.eventEndDate ?? event.eventDate);
    to.setDate(to.getDate() + 1);

    const net = new Map<string, number>();
    const unjoined = new Set<string>();
    if (!(from < to)) return { net, unjoinedItemKeys: [...unjoined] };

    const rows = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        spaceId,
        createdAt: { gt: from, lt: to },
        reason: { notIn: [StockMovementReason.SALE] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { elementId: true, itemKey: true, menuItemId: true, packedDelta: true, looseDelta: true },
    });
    if (!rows.length) return { net, unjoinedItemKeys: [...unjoined] };

    const idsByNormName = await this.catalogIdsByNormName(tenantId);
    // Un mouvement est exposé sous tous les ids de catalogue de son nom (même règle
    // que computeLogisticExpected) : la ligne post-event comptée sous un id MarketPrice
    // retrouve ses mouvements.
    const idsFor = (m: { menuItemId: string | null; itemKey: string }) => {
      const byName = idsByNormName.get(this.normalizeName(m.itemKey)) ?? [];
      return [...new Set([...(m.menuItemId ? [m.menuItemId] : []), ...byName])];
    };
    // unitsPerPack par itemKey — même chaîne de résolution que la Logistique
    // (MarketPrice → MenuComponent → MenuItem.inventoryNumberOfUnits), mémoïsée.
    const uppByNormKey = new Map<string, number | null>();
    for (const m of rows) {
      const nk = this.normalizeName(m.itemKey);
      if (!uppByNormKey.has(nk)) {
        uppByNormKey.set(nk, await this.logistics.resolveUnitsPerPackForItemKey(m.itemKey, tenantId));
      }
    }
    const itemIds = rows.flatMap((m) => idsFor(m));
    const invUppByItemId = await this.resolveInventoryUnitsPerPack(itemIds, tenantId);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    for (const m of rows) {
      const ids = idsFor(m);
      if (!ids.length) {
        unjoined.add(m.itemKey);
        continue;
      }
      for (const itemId of ids) {
      const k = `${m.elementId}::${itemId}`;
      const invUpp = Number(invUppByItemId.get(itemId));
      // Conditionnement d'inventaire connu → delta en unités (paquet LOGISTIQUE
      // pour la conversion, BUG-239) ; inconnu → packed + loose, même convention
      // que la sortie `units` des attendus.
      const logUpp = uppByNormKey.get(this.normalizeName(m.itemKey));
      const delta =
        invUpp > 1
          ? (m.packedDelta ?? 0) * (logUpp && logUpp > 0 ? logUpp : invUpp) + (m.looseDelta ?? 0)
          : (m.packedDelta ?? 0) + (m.looseDelta ?? 0);
      net.set(k, round2((net.get(k) ?? 0) + delta));
      }
    }
    if (unjoined.size) {
      this.logger.warn(
        `Post-event movementUnits: ${unjoined.size} itemKey(s) non joignable(s) au référentiel, ` +
          `mouvements ignorés : ${[...unjoined].join(', ')}`,
      );
    }
    return { net, unjoinedItemKeys: [...unjoined] };
  }

  // ── GET /inventory/:spaceId/pre-event-baseline/:eventId ─────────────────────
  // GATING SERVEUR (front.fb.preInventoryExpected, décorateur méthode du
  // contrôleur) : un compteur sans le droit ne REÇOIT jamais les attendus — un
  // masquage client seul serait contournable et biaiserait le comptage.
  async getPreEventBaseline(spaceId: string, eventId: string, tenantId: string) {
    await this.assertSpace(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    const { expected, unjoinedItemKeys, asOf } = await this.computeLogisticExpected(spaceId, tenantId);
    const expectedBlob: Record<
      string,
      Record<string, { packed: number; loose: number; units: number | null; unitsPerPack: number | null }>
    > = {};
    for (const [k, v] of expected) {
      const [elementId, itemId] = k.split('::');
      // `units`/`unitsPerPack` (BUG-239) : le front affiche le hint dans l'unité
      // de son propre champ Packed sans avoir à redeviner le conditionnement.
      (expectedBlob[elementId] ??= {})[itemId] = {
        packed: v.packed,
        loose: v.loose,
        units: v.units,
        unitsPerPack: v.unitsPerPack,
      };
    }
    return {
      // PDF v3 (2026-08-21, dernière version — simplification owner après le
      // retour client) : « La quantité attendue sera toujours le Total sur la
      // logistique pour chaque élément. » Le registre est recalé automatiquement
      // depuis le comptage à la génération de chaque réconciliation
      // (pushCountToLogistic) : il contient donc toujours le dernier comptage.
      source: 'logistic-live',
      asOf,
      previousEvent: null,
      // Compat ancien front (gate `baseline?.baseline`) : objet vide truthy — la
      // donnée affichée vient exclusivement du blob `expected`.
      baseline: {},
      movements: [],
      expected: expectedBlob,
      unjoinedItemKeys,
    };
  }

  // ── GET /inventory/:spaceId/post-event-baseline/:eventId ────────────────────
  // Indice de référence du comptage POST-event, même gating serveur que le
  // pre-event (front.fb.preInventoryExpected, décorateur méthode du contrôleur).
  //
  // attendu = Total Logistic (PDF v3 du 2026-08-21 : « La quantité attendue sera
  // toujours le Total sur la logistique pour chaque élément »). Le registre est
  // recalé depuis le comptage à chaque génération de réconciliation
  // (pushCountToLogistic) et à l'ouverture des portes : il porte donc toujours
  // le dernier comptage physique.
  //
  // `movementUnits` reste calculé sur la FENÊTRE DU MATCH
  // (netMovementUnitsForEventWindow) : c'est le terme « mouvements » des lignes
  // de réconciliation post-event (BUG-343-01/346-01), pas l'attendu affiché.
  async getPostEventBaseline(spaceId: string, eventId: string, tenantId: string) {
    await this.assertSpace(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true, eventDate: true, eventEndDate: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    // BUG-378-02 : l'attendu Logistic sert de stock de départ à la réconciliation
    // post-event quand un PdV n'a pas de comptage pré-event. Mais le registre est
    // RECALÉ depuis le comptage d'après-match à chaque génération de document
    // (`pushCountToLogistic`, marqueur BUG-352-01) : après ce recalage il porte
    // le comptage d'arrivée, et `attendu − compté` vaudrait 0 partout. On signale
    // donc au client si le registre contient déjà le comptage post-event de CET
    // event, pour qu'il n'en fasse pas un stock de départ.
    const [{ expected, unjoinedItemKeys, asOf }, movementNet, pushedFromThisEvent] = await Promise.all([
      this.computeLogisticExpected(spaceId, tenantId),
      this.netMovementUnitsForEventWindow(spaceId, tenantId, event),
      this.prisma.stockReconciliation.findFirst({
        where: {
          tenantId,
          spaceId,
          eventId: event.id,
          kind: null,
          AND: [
            { meta: { path: ['source'], equals: 'inventory-count' } },
            { meta: { path: ['phase'], equals: 'post-event' } },
          ],
        },
        select: { id: true },
      }),
    ]);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const expectedBlob: Record<string, Record<string, unknown>> = {};
    const expectedUnitsBlob: Record<string, Record<string, number>> = {};
    const movementUnitsBlob: Record<string, Record<string, number>> = {};
    const keys = new Set<string>([...expected.keys(), ...movementNet.net.keys()]);
    for (const k of keys) {
      const [elementId, itemId] = k.split('::');
      const v = expected.get(k) ?? { packed: 0, loose: 0, units: null, unitsPerPack: null };
      (expectedBlob[elementId] ??= {})[itemId] = v;
      // Indice du total : unités quand le conditionnement d'inventaire est connu,
      // packed + loose sinon (même convention que `units`). Ventes déjà déduites
      // — et clampées ≥ 0 — par l'état Logistic (c'est le chiffre de l'écran
      // Logistic, plus un indice signé).
      (expectedUnitsBlob[elementId] ??= {})[itemId] = v.units ?? round2(v.packed + v.loose);
      (movementUnitsBlob[elementId] ??= {})[itemId] = movementNet.net.get(k) ?? 0;
    }

    return {
      source: 'logistic-live',
      asOf,
      anchorEvent: null,
      // Compat ancien front (gate `baseline?.baseline`) : objet vide truthy — la
      // donnée affichée vient des blobs `expected`/`expectedUnits`.
      baseline: {},
      movements: [],
      expected: expectedBlob,
      expectedUnits: expectedUnitsBlob,
      movementUnits: movementUnitsBlob,
      // true = le registre a déjà été recalé depuis un comptage POST-event de cet
      // event : `expectedUnits` n'est plus un stock de départ exploitable.
      holdsPostEventCount: !!pushedFromThisEvent,
      salesUnjoined: null,
      unjoinedItemKeys: [...new Set([...unjoinedItemKeys, ...movementNet.unjoinedItemKeys])],
    };
  }


  // ── POST /inventory/:spaceId/pre-event-reconciliations ──────────────────────
  // Le BACKEND construit les lignes : le client (potentiellement sans la
  // permission « attendus ») ne les a jamais eues. Lignes en packed/loose BRUTS
  // (la conversion en unités × inventoryQuantityPackaged est un référentiel
  // front — l'affichage convertit, même approche que les lignes de reset).
  async createPreEventReconciliation(
    spaceId: string,
    eventId: string,
    tenantId: string,
    userId?: string,
    canSeeExpected = true,
    // Besoin prédit fourni par le client (scénario Event Predict par défaut) :
    // le serveur ne réimplémente pas la prédiction, il l'archive.
    predictedUnits?: Record<string, Record<string, number>> | null,
    // Contexte de génération automatique (PreEventInventoryFlowService :
    // trigger, feuille remplacée...) archivé dans `meta` à côté du reste.
    extraMeta: Record<string, unknown> = {},
    // Lignes de la feuille pre-event précédente du match : une ligne validée déjà
    // poussée vers Logistic et inchangée depuis est REPRISE telle quelle (attendu et
    // écart figés au moment du comptage). La recalculer relirait un attendu Logistic
    // qui contient déjà ce comptage, et l'écart retomberait à 0 à chaque régénération.
    previousLines: unknown = null,
  ) {
    this.logger.log(`POST /inventory/${spaceId}/pre-event-reconciliations eventId=${eventId}`);
    await this.assertSpace(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    // Compté = fusion existante (InventoryCount prioritaire sur snapshot).
    // Cast : la branche snapshot renvoie un Json Prisma, mais son écriture ne
    // passe que par upsertInventory (blob objet) — jamais un scalaire.
    const merged = await this.getBySpaceAndEvent(spaceId, eventId, tenantId, 'pre-event');
    const countedBlob = (merged?.inventoryCounts ?? {}) as Record<string, Record<string, any>>;
    const pushState = await this.loadLogisticPushState(spaceId, eventId, tenantId);
    const previousByKey = new Map<string, Record<string, any>>();
    if (Array.isArray(previousLines)) {
      for (const l of previousLines as Array<Record<string, any>>) {
        if (l?.countedSource !== 'count') continue;
        if (typeof l?.elementId !== 'string' || typeof l?.itemKey !== 'string') continue;
        previousByKey.set(`${l.elementId}::${l.itemKey}`, l);
      }
    }

    // Attendus à l'instant de la sauvegarde — MÊME chemin que le GET
    // pre-event-baseline (PDF v3 2026-08-21 : Total Logistic) : hints à l'écran
    // et lignes de réconciliation ne peuvent pas diverger.
    const { expected, asOf, aliasGroups } = await this.computeLogisticExpected(spaceId, tenantId);

    // Union des clés attendu ∪ compté. L'attendu Logistic est exposé sous TOUS les ids
    // de catalogue du nom (MenuItem, MarketPrice, MenuComponent, cf. catalogIdsByNormName) :
    // pour un (élément × nom) donné, on garde les ids COMPTÉS s'il y en a, sinon le seul id
    // principal. Sans ce filtre, « Coca-Cola CAN 33cl » compté sous son id MarketPrice
    // sortait deux fois : la ligne comptée, et une ligne « (L) » sous l'id MenuItem.
    const keys = new Set<string>();
    for (const [shopId, byItem] of Object.entries(countedBlob)) {
      for (const itemId of Object.keys(byItem ?? {})) keys.add(`${shopId}::${itemId}`);
    }
    for (const [groupKey, ids] of aliasGroups) {
      const elementId = groupKey.split('::')[0];
      const counted = ids.filter((id) => countedBlob?.[elementId]?.[id] != null);
      if (counted.length) continue; // déjà dans keys via le blob compté
      keys.add(`${elementId}::${ids[0]}`);
    }

    // Dénormalisation noms (éléments + items) pour l'affichage/export. Identité article
    // résolue dans TOUS les catalogues (même chemin que le push Logistic) : une ligne
    // comptée sous un id MarketPrice ou MenuComponent n'est plus une « orpheline ».
    const elementIds = new Set<string>();
    const itemIds = new Set<string>();
    for (const k of keys) {
      const [el, item] = k.split('::');
      if (el) elementIds.add(el);
      if (item) itemIds.add(item);
    }
    const [elements, identities] = await Promise.all([
      elementIds.size
        ? this.prisma.spaceElement.findMany({
            where: { id: { in: [...elementIds] } },
            select: { id: true, name: true },
          })
        : [],
      this.resolveItemKeysByIds([...itemIds], tenantId),
    ]);
    const elementNameById = new Map<string, string>(
      (elements as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]),
    );
    const itemNameById = new Map<string, string>(
      [...identities].map(([id, v]) => [id, v.name]),
    );

    const round2 = (n: number) => Math.round(n * 100) / 100;
    // Exclusion des lignes orphelines : comptages dont l'itemId/elementId ne résout plus aucun
    // article de catalogue / SpaceElement courant (catalogue ré-importé → anciens ids
    // supprimés). Sans nom récupérable en base, ces lignes s'affichaient « — » ; on les retire
    // du document plutôt que de les afficher sans nom. Filtre sur la PRÉSENCE de l'id dans la
    // map (`.has`), pas sur le nom : un article courant au nom légitimement vide reste conservé.
    const resolvableKeys = [...keys].filter((k) => {
      const [elementId, itemId] = k.split('::');
      return elementNameById.has(elementId) && itemNameById.has(itemId);
    });
    const orphanCount = keys.size - resolvableKeys.length;
    if (orphanCount > 0) {
      this.logger.warn(
        `pre-event reconciliation ${spaceId}/${eventId}: ${orphanCount} orphan line(s) excluded ` +
          `(itemId/elementId absent du catalogue courant)`,
      );
    }
    // Conditionnement de l'INVENTAIRE par article (BUG-239) : les lignes portent
    // désormais `unitsPerPack` + les totaux en unités, pour que la vue n'ait pas
    // à reconvertir avec un référentiel potentiellement différent de celui du
    // calcul.
    const invUppByItemId = await this.resolveInventoryUnitsPerPack([...itemIds], tenantId);
    const uppOf = (itemId: string) => {
      const v = Number(invUppByItemId.get(itemId));
      return v > 0 ? v : 1;
    };

    let carriedCount = 0;
    const lines = resolvableKeys.map((k) => {
      const [elementId, itemId] = k.split('::');
      const exp = expected.get(k) ?? null;
      const counted = countedBlob?.[elementId]?.[itemId] ?? null;
      // BUG-383-02 (critère Doors Open) : une ligne sans comptage VALIDÉ prend la valeur
      // actuelle de Logistic (écart 0) et est marquée `countedSource: 'logistic'`, affichée
      // « (L) ». Le document ne peut plus contredire le registre, qui garde lui aussi cette
      // valeur (le push ne concerne que les lignes validées). Une saisie non cochée
      // « compté » n'est pas un comptage. Sans état Logistic ni comptage : 0, `'none'`.
      const isValidated = counted?.isCounted === true;
      // Besoin prédit (Event Predict) : deuxième référence du document. L'attendu
      // Logistic dit « ce que la Logistique pense qu'il y a », celui-ci « ce que
      // le scénario demande d'avoir » — les deux écarts se lisent ensemble.
      const predictedRaw = predictedUnits?.[elementId]?.[itemId];
      const predicted = Number.isFinite(Number(predictedRaw)) ? round2(Number(predictedRaw)) : null;
      // Ligne validée, déjà poussée, inchangée depuis : reprise de la feuille précédente
      // (cf. `previousLines`). Seul le besoin prédit est rafraîchi s'il est fourni.
      const previous = previousByKey.get(k);
      if (isValidated && previous && !this.isPendingLogisticPush(pushState, elementId, itemId)) {
        carriedCount += 1;
        const prevCountedUnits = Number.isFinite(Number(previous.countedUnits))
          ? Number(previous.countedUnits)
          : null;
        const keptPredicted = predicted ?? (Number.isFinite(Number(previous.predictedUnits)) ? Number(previous.predictedUnits) : null);
        return {
          ...previous,
          predictedUnits: keptPredicted,
          deltaVsPredicted:
            keptPredicted == null || prevCountedUnits == null ? null : round2(prevCountedUnits - keptPredicted),
        };
      }
      const countedSource: 'count' | 'logistic' | 'none' = isValidated ? 'count' : exp ? 'logistic' : 'none';
      const countedPacked = isValidated ? Number(counted?.packedUnits) || 0 : exp ? exp.packed : 0;
      const countedLoose = round2(isValidated ? Number(counted?.looseUnits) || 0 : exp ? exp.loose : 0);
      // Conditionnement connu (> 1) uniquement : sinon on laisse la vue
      // convertir avec le référentiel affiché, comme avant (pas de « pack de 1 »
      // fabriqué qui écraserait un conditionnement réel côté écran).
      const q = uppOf(itemId);
      const unitsPerPack = q > 1 ? q : null;
      const countedUnits = unitsPerPack ? round2(countedPacked * unitsPerPack + countedLoose) : null;
      // Article absent du registre Logistic (jamais approvisionné) → attendu/écart
      // null (« — »), jamais 0 fabriqué (décision 2026-07-20, conservée avec la
      // source « état Logistic », décision JLH 2026-08-20).
      const expectedPacked = exp ? exp.packed : null;
      const expectedLoose = exp ? round2(exp.loose) : null;
      const expectedUnits =
        exp && unitsPerPack ? round2(exp.units ?? exp.packed * unitsPerPack + exp.loose) : null;
      return {
        elementId,
        elementName: elementNameById.get(elementId) ?? '',
        itemKey: itemId,
        itemName: itemNameById.get(itemId) ?? '',
        // Catalogue d'origine de l'id (menuItem | marketPrice | menuComponent | ingredient | packaging).
        itemKind: identities.get(itemId)?.kind ?? null,
        unitsPerPack,
        expectedPacked,
        expectedLoose,
        expectedUnits,
        countedPacked,
        countedLoose,
        countedUnits,
        countedSource,
        deltaPacked: expectedPacked == null ? null : countedPacked - expectedPacked,
        deltaLoose: expectedLoose == null ? null : round2(countedLoose - expectedLoose),
        deltaUnits:
          expectedUnits == null || countedUnits == null
            ? null
            : round2(countedUnits - expectedUnits),
        predictedUnits: predicted,
        deltaVsPredicted:
          predicted == null || countedUnits == null ? null : round2(countedUnits - predicted),
      };
    });

    const created = await this.prisma.stockReconciliation.create({
      data: {
        tenantId,
        spaceId,
        eventId: event.id,
        eventName: event.name ?? null,
        kind: 'pre-event',
        lines: lines as any,
        // Contexte de fabrication (BUG-235/238/241) : ce qui a été écarté du
        // document doit rester lisible sur l'archive.
        meta: {
          baseline: { source: 'logistic-live', asOf },
          orphanLinesExcluded: orphanCount,
          // Le document porte-t-il la comparaison au scénario ? Sans marqueur, une
          // colonne prédit vide se confond avec « rien n'était prédit ».
          predictedSource: predictedUnits ? 'event-predict-default-version' : 'none',
          // Lignes reprises de la feuille précédente (déjà poussées, inchangées).
          carriedLines: carriedCount,
          ...extraMeta,
        },
        createdBy: userId ?? null,
      } as any,
    });
    // Le comptage devient la nouvelle référence du registre Logistic (PDF
    // 2026-08-21). Après la création du document : un échec de recalage ne doit
    // jamais faire perdre la réconciliation. Push incrémental : seules les lignes
    // nouvelles ou modifiées depuis leur dernier push partent vers le registre.
    const push = await this.pushCountToLogistic(
      spaceId,
      tenantId,
      'pre-event',
      event,
      countedBlob,
      userId,
      pushState,
    );
    // Résultat du push archivé sur le document : ce qui est parti vers le registre à
    // cette génération (les lignes reprises l'étaient déjà), ou pourquoi rien n'est parti.
    const metaWithPush = {
      ...((created as any).meta ?? {}),
      logisticPush: { ok: push.ok, reason: push.reason ?? null, lineCount: push.lineCount ?? 0 },
    };
    await this.prisma.stockReconciliation.update({
      where: { id: created.id },
      data: { meta: metaWithPush as any },
    });
    (created as any).meta = metaWithPush;

    // BUG-233 : le document persisté est complet ; la RÉPONSE est expurgée pour
    // un appelant sans `front.fb.preInventoryExpected` (il a le droit de créer,
    // pas de voir les attendus).
    return canSeeExpected ? created : this.redactPreEventDoc(created as any);
  }

  /**
   * Pousse un comptage d'inventaire dans le registre Logistic (PDF 2026-08-21 +
   * précision JLH : « idéalement, reset sur pre ou post event inventory quand ils
   * sont terminés et que la réconciliation est faite »).
   *
   * C'est ce qui rend la formule de l'attendu vraie par construction : le
   * registre repart toujours du dernier comptage physique, donc l'écran suivant
   * lit un total Logistic qui contient déjà le comptage (`logistic-only`) au lieu
   * de devoir l'additionner.
   *
   * ⚠️ Un reset MATÉRIALISE les ventes non couvertes en mouvements et DÉPLACE
   * l'ancre de dérivation des ventes de l'écran Logistic. La règle « documenter ≠
   * resetter » (module 10 §7.3) est donc levée ici, sciemment.
   *
   * Jamais bloquant : un échec de recalage ne doit pas empêcher la création du
   * document de réconciliation, qui est l'objet de la demande utilisateur.
   */
  private async pushCountToLogistic(
    spaceId: string,
    tenantId: string,
    phase: 'pre-event' | 'post-event',
    event: { id: string; name?: string | null },
    countedBlob: Record<string, Record<string, any>>,
    userId?: string,
    // État de push des lignes (déjà chargé par l'appelant, sinon chargé ici).
    pushState?: LogisticPushState,
  ): Promise<{ ok: boolean; reason?: string; lineCount?: number }> {
    // BUG-383-02 (règle Bertrand 2026-09-15) : seul ce qui a été COMPTÉ (validé) met à jour
    // Logistic ; le reste garde sa valeur courante. Sans ce filtre, en post-event les
    // propositions reportées du pre-event (`carriedFromPreEvent`, isCounted=false) étaient
    // poussées comme un comptage, écrasant le stock d'articles jamais recomptés.
    //
    // Push INCRÉMENTAL : une ligne validée déjà poussée et inchangée depuis
    // (`logisticPushedAt >= updatedAt`) n'est pas repoussée. Un reset remet StockLevel à la
    // valeur comptée et déplace l'ancre des ventes : repousser un comptage de la veille
    // effacerait les livraisons saisies depuis, et repousser après l'ouverture des portes
    // effacerait les ventes du début de match.
    const state = pushState ?? (await this.loadLogisticPushState(spaceId, event.id, tenantId));
    const validated: Record<string, Record<string, any>> = {};
    const itemIds = new Set<string>();
    let validatedCount = 0;
    for (const [elementId, byItem] of Object.entries(countedBlob ?? {})) {
      for (const [itemId, count] of Object.entries(byItem ?? {})) {
        if ((count as any)?.isCounted !== true) continue;
        validatedCount += 1;
        if (!this.isPendingLogisticPush(state, elementId, itemId)) continue;
        (validated[elementId] ??= {})[itemId] = count;
        itemIds.add(itemId);
      }
    }
    if (!validatedCount) return { ok: false, reason: 'no-counts' };
    if (!itemIds.size) return { ok: false, reason: 'nothing-new' };

    const itemKeyById = await this.resolveItemKeysByIds([...itemIds], tenantId);
    const lines: Array<{
      elementId: string;
      itemKey: string;
      itemKind: StockItemKind;
      itemRefId: string;
      countedPacked: number;
      countedLoose: number;
    }> = [];
    for (const [elementId, byItem] of Object.entries(validated)) {
      for (const [itemId, count] of Object.entries(byItem)) {
        const resolved = itemKeyById.get(itemId);
        // Orphelin des catalogues (resolveItemKeysByIds) : non adressable côté
        // Logistic, la ligne est écartée.
        if (!resolved) continue;
        lines.push({
          elementId,
          itemKey: resolved.name,
          itemKind: resolved.kind,
          itemRefId: itemId,
          countedPacked: Number((count as any)?.packedUnits) || 0,
          countedLoose: Number((count as any)?.looseUnits) || 0,
        });
      }
    }
    if (!lines.length) return { ok: false, reason: 'no-addressable-lines' };

    try {
      await this.logistics.reset(
        spaceId,
        { eventId: event.id, eventName: event.name ?? undefined, lines },
        tenantId,
        userId ?? `system-${phase}-reconciliation`,
        { source: 'inventory-count', phase, eventId: event.id },
      );
      this.logger.log(
        `Stock Logistic recalé depuis le comptage ${phase} — space ${spaceId} / event ${event.id} (${lines.length} ligne(s))`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Recalage Logistic depuis le comptage ${phase} échoué (document conservé) — space ${spaceId} / event ${event.id} : ${error?.message}`,
      );
      return { ok: false, reason: 'reset-failed' };
    }
    await this.markLogisticPushed(
      lines.map((l) => state.get(`${l.elementId}::${l.itemRefId}`)?.id).filter((id): id is string => !!id),
    );
    return { ok: true, lineCount: lines.length };
  }

  /** État de push par ligne validée d'un match : clé `elementId::itemId`. */
  private async loadLogisticPushState(
    spaceId: string,
    eventId: string,
    tenantId: string,
  ): Promise<LogisticPushState> {
    const rows = await this.prisma.inventoryCount.findMany({
      where: { tenantId, spaceId, eventId },
      select: { id: true, shopId: true, itemId: true, updatedAt: true, logisticPushedAt: true },
    });
    const state: LogisticPushState = new Map();
    for (const r of rows) {
      if (!r.shopId) continue;
      state.set(`${r.shopId}::${r.itemId}`, {
        id: r.id,
        updatedAt: r.updatedAt,
        logisticPushedAt: r.logisticPushedAt,
      });
    }
    return state;
  }

  /** Une ligne est à pousser si elle n'a jamais été poussée, ou a été modifiée depuis.
   *  Ligne absente de l'état (comptage issu d'un snapshot, sans `InventoryCount`) :
   *  jamais poussée, donc à pousser. */
  private isPendingLogisticPush(state: LogisticPushState, elementId: string, itemId: string): boolean {
    const row = state.get(`${elementId}::${itemId}`);
    if (!row) return true;
    if (!row.logisticPushedAt) return true;
    return row.updatedAt.getTime() > row.logisticPushedAt.getTime();
  }

  /** SQL brut : `update()` Prisma bumperait `updatedAt` (@updatedAt), et la ligne
   *  repasserait aussitôt « modifiée depuis le push ». Hors transaction du reset :
   *  un échec ici ne fait que repousser ces lignes au prochain push (delta 0). */
  private async markLogisticPushed(ids: string[]): Promise<void> {
    if (!ids.length) return;
    try {
      await this.prisma.$executeRaw`UPDATE "InventoryCount" SET "logisticPushedAt" = NOW() WHERE "id" IN (${Prisma.join(ids)})`;
    } catch (error: any) {
      this.logger.warn(`Marquage logisticPushedAt échoué (${ids.length} ligne(s)) : ${error?.message}`);
    }
  }

  /**
   * Déclenchement manuel du recalage Logistic (bouton "Update Logistic" des
   * écrans Pre/Post-event Inventory) — même chemin que le recalage automatique
   * de `createPostEventReconciliation`/`createPreEventReconciliation`
   * (`pushCountToLogistic` ci-dessus), mais sans créer de document de
   * réconciliation : permet de re-pousser un comptage mis à jour entre deux
   * réconciliations. Contrairement au recalage automatique, un échec ici est
   * remonté à l'appelant (l'utilisateur a explicitement demandé cette action).
   */
  async pushCurrentCountToLogistic(
    spaceId: string,
    eventId: string,
    tenantId: string,
    phase: 'pre-event' | 'post-event',
    userId?: string,
  ) {
    await this.assertSpace(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    const merged = await this.getBySpaceAndEvent(spaceId, event.id, tenantId, phase);
    const countedBlob = (merged?.inventoryCounts ?? {}) as Record<string, Record<string, any>>;
    const result = await this.pushCountToLogistic(spaceId, tenantId, phase, event, countedBlob, userId);
    if (!result.ok) {
      throw new BadRequestException(
        result.reason === 'no-counts' || result.reason === 'no-addressable-lines'
          ? 'Aucun item compté à pousser vers Logistic'
          : result.reason === 'nothing-new'
            ? 'Registre Logistic déjà à jour : aucun comptage modifié depuis le dernier push'
            : 'Échec de la mise à jour du registre Logistic',
      );
    }
    return result;
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  private buildInventoryCounts(
    counts: any[],
    preCutoff: Date | null = null,
  ): Record<string, Record<string, any>> {
    const result: Record<string, Record<string, any>> = {};
    for (const c of counts) {
      // shopId null → skip (front can't address it without a key)
      const shopKey = c.shopId;
      if (!shopKey) continue;
      if (!result[shopKey]) result[shopKey] = {};
      // BUG-237 : ligne figée avant la clôture du Pre-event = saisie d'avant-match.
      // On garde la valeur (proposition utile au recomptage) mais pas la validation.
      const carried = !!(preCutoff && c.updatedAt && new Date(c.updatedAt) <= preCutoff);
      result[shopKey][c.itemId] = {
        itemId: c.itemId,
        packedUnits: c.packedUnits,
        looseUnits: c.looseUnits,
        isCounted: carried ? false : c.isCounted,
        storageLocation: c.storageLocation ?? null,
        countingStatus: carried ? 'pending' : c.countingStatus,
        ...(carried ? { carriedFromPreEvent: true } : {}),
      };
    }
    return result;
  }

  /** Même règle que ci-dessus appliquée à un blob de snapshot (repli sans
   *  `InventoryCount` adressable) : valeurs conservées, validation retirée. */
  private asProposal(blob: any): Record<string, Record<string, any>> {
    if (!blob || typeof blob !== 'object') return {};
    const out: Record<string, Record<string, any>> = {};
    for (const [shopId, byItem] of Object.entries(blob as Record<string, any>)) {
      out[shopId] = {};
      for (const [itemId, c] of Object.entries((byItem ?? {}) as Record<string, any>)) {
        out[shopId][itemId] = {
          ...(c as any),
          isCounted: false,
          countingStatus: 'pending',
          carriedFromPreEvent: true,
        };
      }
    }
    return out;
  }
}
