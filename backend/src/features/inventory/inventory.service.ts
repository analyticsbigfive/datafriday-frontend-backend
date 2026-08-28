import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StockMovementReason } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { LogisticsService } from '../logistics/logistics.service';
import { StockItemKind } from '../logistics/dto/logistics.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { CreatePostEventReconciliationDto } from './dto/create-post-event-reconciliation.dto';

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
          baseline: { source: dto.preEventSource ?? 'none' },
          salesUnjoined: dto.salesUnjoined ?? null,
          countedProgress: dto.countedProgress ?? null,
          // Q35 Option 1 : grain de la source « Vendu » ('consumption' = explosé
          // ingrédients, 'timeline' = brut article). null = document d'avant Q35.
          salesSource: dto.salesSource ?? null,
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

  /**
   * Stock Live initialisé automatiquement depuis l'Inventaire pré-événement, à
   * « l'ouverture des portes » (décision Bertrand 2026-07-24, question #24 —
   * jamais implémentée jusqu'ici). Aucun signal « portes ouvertes » n'existe dans
   * les données (ni Weezevent ni Digifood ne remontent un scan d'entrée) : le
   * proxy technique retenu est `eventStartDate ?? eventDate`, déclenché par le
   * cron `InventoryLiveInitCronService` toutes les 5 min — même tolérance qu'un
   * webhook manqué que `WeezeventCronService.triggerLiveAggregationSafetyNet`
   * (BUG-109) : un appel redondant ne duplique rien de grave, `LogisticsService
   * .reset()` recalcule un delta nul si le stock cible est déjà atteint.
   *
   * Idempotence : marqueur `KvStore` (`live-pre-event-init:{spaceId}:{eventId}`)
   * posé uniquement APRÈS un reset réussi — si aucun comptage pré-événement
   * n'existe encore au moment du passage cron, on ne pose rien et on retente au
   * prochain tick (jamais de stock fabriqué à partir de rien, même règle que
   * `getPreEventInventory`).
   */
  async autoInitLiveStockFromPreEventInventory(
    spaceId: string,
    eventId: string,
    eventName: string | null,
    tenantId: string,
  ): Promise<{ ok: boolean; reason?: string; lineCount?: number }> {
    const already = await this.prisma.kvStore.findUnique({
      where: { uniq_kv_store: { tenantId, key: `live-pre-event-init:${spaceId}:${eventId}` } },
    });
    if (already) return { ok: false, reason: 'already-initialized' };

    const pre = await this.getPreEventInventory(spaceId, eventId, tenantId);
    if (!pre || !pre.inventoryCounts) return { ok: false, reason: 'no-pre-event-inventory' };

    const countedBlob = pre.inventoryCounts as Record<string, Record<string, any>>;
    const itemIds = new Set<string>();
    for (const byItem of Object.values(countedBlob)) for (const itemId of Object.keys(byItem ?? {})) itemIds.add(itemId);
    const itemKeyById = await this.resolveItemKeysByIds([...itemIds], tenantId);

    const lines: Array<{
      elementId: string;
      itemKey: string;
      itemKind: StockItemKind;
      itemRefId: string;
      countedPacked: number;
      countedLoose: number;
    }> = [];
    for (const [shopId, byItem] of Object.entries(countedBlob)) {
      for (const [itemId, count] of Object.entries(byItem ?? {})) {
        const resolved = itemKeyById.get(itemId);
        if (!resolved) continue; // orphelin : id absent des deux catalogues, non adressable côté Logistic
        lines.push({
          elementId: shopId,
          itemKey: resolved.name,
          itemKind: resolved.kind,
          itemRefId: itemId,
          countedPacked: Number((count as any)?.packedUnits) || 0,
          countedLoose: Number((count as any)?.looseUnits) || 0,
        });
      }
    }
    if (!lines.length) return { ok: false, reason: 'no-requirements' };

    await this.logistics.reset(spaceId, { eventId, eventName: eventName ?? undefined, lines }, tenantId, 'system-live-door-opening');

    await this.prisma.kvStore.create({
      data: {
        tenantId,
        key: `live-pre-event-init:${spaceId}:${eventId}`,
        value: { spaceId, eventId, lineCount: lines.length, source: pre.source, at: new Date().toISOString() },
      },
    });

    return { ok: true, lineCount: lines.length };
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

  /** nom normalisé → menuItemId du tenant. `StockMovement.itemKey` et les lignes
   *  de consommation ventes sont des NOMS libres (piège n°1 du domaine Stock) :
   *  c'est le seul pont vers le référentiel compté. */
  private async menuItemIdByNormName(tenantId: string): Promise<Map<string, string>> {
    const items = await this.prisma.menuItem.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    return new Map(items.map((i) => [this.normalizeName(i.name), i.id]));
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

    const items = await this.prisma.menuItem.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, name: true, inventoryNumberOfUnits: true },
    });

    const pending: Array<{ id: string; name: string }> = [];
    for (const it of items) {
      const n = Number(it.inventoryNumberOfUnits);
      if (n > 0 && n !== 1) out.set(it.id, n);
      else pending.push({ id: it.id, name: it.name });
    }
    if (!pending.length) return out;

    const names = [...new Set(pending.map((p) => p.name).filter(Boolean))];
    const [mps, comps] = await Promise.all([
      this.prisma.marketPrice.findMany({
        where: { tenantId, deletedAt: null, itemName: { in: names } },
        select: { itemName: true, packedUnits: true },
      }),
      this.prisma.menuComponent.findMany({
        where: { tenantId, deletedAt: null, name: { in: names } },
        select: { name: true, packedUnits: true },
      }),
    ]);
    const mpByName = new Map(mps.map((m) => [this.normalizeName(m.itemName), m.packedUnits]));
    const compByName = new Map(comps.map((c) => [this.normalizeName(c.name), c.packedUnits]));

    for (const p of pending) {
      const nk = this.normalizeName(p.name);
      const v = Number(mpByName.get(nk)) || Number(compByName.get(nk)) || 1;
      out.set(p.id, v > 0 ? v : 1);
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
    if (!index.size) return { expected, unjoinedItemKeys: [] as string[], asOf };

    const idByNormName = await this.menuItemIdByNormName(tenantId);
    const unjoined = new Set<string>();
    const joined: Array<{
      elementId: string;
      itemId: string;
      packed: number;
      loose: number;
      logUpp: number | null;
    }> = [];
    for (const entry of index.values()) {
      const itemId = idByNormName.get(this.normalizeName(entry.itemKey));
      if (!itemId) {
        unjoined.add(entry.itemKey);
        continue;
      }
      joined.push({
        elementId: entry.elementId,
        itemId,
        packed: entry.packed,
        loose: entry.loose,
        logUpp: entry.unitsPerPack && entry.unitsPerPack > 0 ? entry.unitsPerPack : null,
      });
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

    return { expected, unjoinedItemKeys: [...unjoined], asOf };
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

    const idByNormName = await this.menuItemIdByNormName(tenantId);
    // unitsPerPack par itemKey — même chaîne de résolution que la Logistique
    // (MarketPrice → MenuComponent → MenuItem.inventoryNumberOfUnits), mémoïsée.
    const uppByNormKey = new Map<string, number | null>();
    for (const m of rows) {
      const nk = this.normalizeName(m.itemKey);
      if (!uppByNormKey.has(nk)) {
        uppByNormKey.set(nk, await this.logistics.resolveUnitsPerPackForItemKey(m.itemKey, tenantId));
      }
    }
    const itemIds = rows
      .map((m) => m.menuItemId ?? idByNormName.get(this.normalizeName(m.itemKey)))
      .filter((id): id is string => !!id);
    const invUppByItemId = await this.resolveInventoryUnitsPerPack(itemIds, tenantId);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    for (const m of rows) {
      const itemId = m.menuItemId ?? idByNormName.get(this.normalizeName(m.itemKey));
      if (!itemId) {
        unjoined.add(m.itemKey);
        continue;
      }
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

    const [{ expected, unjoinedItemKeys, asOf }, movementNet] = await Promise.all([
      this.computeLogisticExpected(spaceId, tenantId),
      this.netMovementUnitsForEventWindow(spaceId, tenantId, event),
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
    const merged = await this.getBySpaceAndEvent(spaceId, eventId, tenantId);
    const countedBlob = (merged?.inventoryCounts ?? {}) as Record<string, Record<string, any>>;

    // Attendus à l'instant de la sauvegarde — MÊME chemin que le GET
    // pre-event-baseline (PDF v3 2026-08-21 : Total Logistic) : hints à l'écran
    // et lignes de réconciliation ne peuvent pas diverger.
    const { expected, asOf } = await this.computeLogisticExpected(spaceId, tenantId);

    // Union des clés attendu ∪ compté.
    const keys = new Set<string>(expected.keys());
    for (const [shopId, byItem] of Object.entries(countedBlob)) {
      for (const itemId of Object.keys(byItem ?? {})) keys.add(`${shopId}::${itemId}`);
    }

    // Dénormalisation noms (éléments + items) pour l'affichage/export.
    const elementIds = new Set<string>();
    const itemIds = new Set<string>();
    for (const k of keys) {
      const [el, item] = k.split('::');
      if (el) elementIds.add(el);
      if (item) itemIds.add(item);
    }
    const [elements, items] = await Promise.all([
      elementIds.size
        ? this.prisma.spaceElement.findMany({
            where: { id: { in: [...elementIds] } },
            select: { id: true, name: true },
          })
        : [],
      itemIds.size
        ? this.prisma.menuItem.findMany({
            where: { tenantId, id: { in: [...itemIds] } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const elementNameById = new Map<string, string>(
      (elements as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]),
    );
    const itemNameById = new Map<string, string>(
      (items as Array<{ id: string; name: string }>).map((i) => [i.id, i.name]),
    );

    const round2 = (n: number) => Math.round(n * 100) / 100;
    // Exclusion des lignes orphelines : comptages dont l'itemId/elementId ne résout plus aucun
    // MenuItem/SpaceElement courant (catalogue ré-importé → anciens ids supprimés). Sans nom
    // récupérable en base, ces lignes s'affichaient « — » ; on les retire du document plutôt que
    // de les afficher sans nom. Filtre sur la PRÉSENCE de l'id dans la map (`.has`), pas sur le
    // nom : un article courant au nom légitimement vide reste conservé.
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

    const lines = resolvableKeys.map((k) => {
      const [elementId, itemId] = k.split('::');
      const exp = expected.get(k) ?? null;
      const counted = countedBlob?.[elementId]?.[itemId] ?? null;
      const countedPacked = Number(counted?.packedUnits) || 0;
      const countedLoose = round2(Number(counted?.looseUnits) || 0);
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
      // Besoin prédit (Event Predict) : deuxième référence du document. L'attendu
      // ci-dessus dit « ce que la Logistique pense qu'il y a », celui-ci « ce que
      // le scénario demande d'avoir » — les deux écarts se lisent ensemble.
      const predictedRaw = predictedUnits?.[elementId]?.[itemId];
      const predicted = Number.isFinite(Number(predictedRaw)) ? round2(Number(predictedRaw)) : null;
      return {
        elementId,
        elementName: elementNameById.get(elementId) ?? '',
        itemKey: itemId,
        itemName: itemNameById.get(itemId) ?? '',
        unitsPerPack,
        expectedPacked,
        expectedLoose,
        expectedUnits,
        countedPacked,
        countedLoose,
        countedUnits,
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
        },
        createdBy: userId ?? null,
      } as any,
    });
    // Le comptage devient la nouvelle référence du registre Logistic (PDF
    // 2026-08-21). Après la création du document : un échec de recalage ne doit
    // jamais faire perdre la réconciliation.
    await this.pushCountToLogistic(spaceId, tenantId, 'pre-event', event, countedBlob, userId);

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
  ): Promise<{ ok: boolean; reason?: string; lineCount?: number }> {
    const itemIds = new Set<string>();
    for (const byItem of Object.values(countedBlob ?? {})) {
      for (const itemId of Object.keys(byItem ?? {})) itemIds.add(itemId);
    }
    if (!itemIds.size) return { ok: false, reason: 'no-counts' };

    const itemKeyById = await this.resolveItemKeysByIds([...itemIds], tenantId);
    const lines: Array<{
      elementId: string;
      itemKey: string;
      itemKind: StockItemKind;
      itemRefId: string;
      countedPacked: number;
      countedLoose: number;
    }> = [];
    for (const [elementId, byItem] of Object.entries(countedBlob)) {
      for (const [itemId, count] of Object.entries(byItem ?? {})) {
        const resolved = itemKeyById.get(itemId);
        // Orphelin des deux catalogues : non adressable côté Logistic (même
        // limitation que autoInitLiveStockFromPreEventInventory).
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
      return { ok: true, lineCount: lines.length };
    } catch (error: any) {
      this.logger.warn(
        `Recalage Logistic depuis le comptage ${phase} échoué (document conservé) — space ${spaceId} / event ${event.id} : ${error?.message}`,
      );
      return { ok: false, reason: 'reset-failed' };
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
