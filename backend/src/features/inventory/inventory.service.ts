import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { LogisticsService } from '../logistics/logistics.service';
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

    return this.prisma.stockReconciliation.create({
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
        },
        createdBy: userId ?? null,
      } as any,
    });
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
          ...rest
        } = l;
        return rest;
      }),
    };
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
    const previousEvent = await this.prisma.event.findFirst({
      where: { spaceId, tenantId, eventDate: { lt: event.eventDate } },
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

  /** Résout la base des quantités attendues d'un event FUTUR. Retourne
   *  baseline null si l'événement précédent n'a pas de comptage post-event
   *  (décision user 2026-07-20 : « — », jamais de 0 fabriqué — pas de mode
   *  « mouvements seuls »). */
  private async resolvePreEventBaseline(spaceId: string, tenantId: string) {
    const now = new Date();
    const previousEvent = await this.prisma.event.findFirst({
      where: { spaceId, tenantId, eventDate: { lte: now } },
      orderBy: { eventDate: 'desc' },
      select: { id: true, name: true },
    });
    if (!previousEvent) return { previousEvent: null, snapshot: null };

    // Priorité au snapshot kindé 'post-event' ; repli legacy = dernier snapshot
    // de cet event toutes phases confondues (données antérieures au kind).
    const snapshot =
      (await this.prisma.inventorySnapshot.findFirst({
        where: { tenantId, spaceId, eventId: previousEvent.id, kind: 'post-event' },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await this.prisma.inventorySnapshot.findFirst({
        where: { tenantId, spaceId, eventId: previousEvent.id },
        orderBy: { createdAt: 'desc' },
      }));

    return { previousEvent, snapshot };
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

  /** Calcule les quantités attendues (BUG-232 puis BUG-239).
   *
   *  Le calcul se fait **en unités** — la seule grandeur physique commune aux
   *  deux référentiels de conditionnement :
   *
   *  1. seed = comptage post-event précédent converti avec la taille de paquet de
   *     l'INVENTAIRE (c'est dans cette unité que le comptage a été saisi) ;
   *  2. rejeu SÉQUENTIEL des mouvements Logistic, chacun converti avec la taille
   *     de paquet de la LOGISTIQUE (c'est dans cette unité qu'il a été
   *     enregistré), clamp ≥ 0 après chaque mouvement — équivalent unitaire de
   *     `normalizeLevel` (la « casse de pack » n'est qu'un report de retenue) ;
   *  3. re-découpage final en packed/loose avec la taille de paquet de
   *     l'inventaire, et `unitsPerPack`/`units` renvoyés avec chaque entrée pour
   *     que le front n'ait plus à deviner le diviseur.
   *
   *  Chemin unique consommé par le GET pre-event-baseline ET la création de
   *  réconciliation pre-event : les deux ne peuvent pas diverger. */
  private async computeExpected(spaceId: string, tenantId: string) {
    const { previousEvent, snapshot } = await this.resolvePreEventBaseline(spaceId, tenantId);
    const empty = {
      previousEvent: previousEvent ?? null,
      snapshot: null as typeof snapshot,
      expected: null as Map<
        string,
        { packed: number; loose: number; units: number; unitsPerPack: number }
      > | null,
      movements: [] as Array<{
        elementId: string;
        itemKey: string;
        menuItemId: string | null;
        packedDelta: number;
        looseDelta: number;
      }>,
      unjoinedItemKeys: [] as string[],
    };
    if (!previousEvent || !snapshot) return empty;

    const rows = await this.prisma.stockMovement.findMany({
      where: { tenantId, spaceId, createdAt: { gt: snapshot.createdAt } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { elementId: true, itemKey: true, menuItemId: true, packedDelta: true, looseDelta: true },
    });

    // Jointure nom → MenuItem du tenant pour les mouvements sans menuItemId
    // (StockMovement.itemKey = nom libre — piège n°1 du domaine Stock).
    let idByNormName = new Map<string, string>();
    if (rows.some((m) => !m.menuItemId)) {
      const items = await this.prisma.menuItem.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      });
      idByNormName = new Map(items.map((i) => [this.normalizeName(i.name), i.id]));
    }

    // unitsPerPack par itemKey — même chaîne de résolution que la Logistique
    // (MarketPrice → MenuComponent → MenuItem.inventoryNumberOfUnits), mémoïsée.
    const uppByNormKey = new Map<string, number | null>();
    for (const m of rows) {
      const nk = this.normalizeName(m.itemKey);
      if (!uppByNormKey.has(nk)) {
        uppByNormKey.set(nk, await this.logistics.resolveUnitsPerPackForItemKey(m.itemKey, tenantId));
      }
    }

    // Taille de paquet côté INVENTAIRE, pour toutes les clés en jeu (baseline ∪
    // mouvements joignables) — c'est l'unité des champs Packed de l'écran.
    const baselineBlob = snapshot.inventoryCounts as Record<string, Record<string, any>> | null;
    const itemIdsInPlay: string[] = [];
    if (baselineBlob && typeof baselineBlob === 'object') {
      for (const byItem of Object.values(baselineBlob)) {
        for (const itemId of Object.keys(byItem ?? {})) itemIdsInPlay.push(itemId);
      }
    }
    for (const m of rows) {
      const id = m.menuItemId ?? idByNormName.get(this.normalizeName(m.itemKey));
      if (id) itemIdsInPlay.push(id);
    }
    const invUppByItemId = await this.resolveInventoryUnitsPerPack(itemIdsInPlay, tenantId);
    const invUppOf = (itemId: string) => {
      const v = Number(invUppByItemId.get(itemId));
      return v > 0 ? v : 1;
    };
    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Seed depuis le blob baseline (comptage humain, supposé ≥ 0).
    const levels = new Map<string, { packed: number; loose: number }>();
    if (baselineBlob && typeof baselineBlob === 'object') {
      for (const [shopId, byItem] of Object.entries(baselineBlob)) {
        for (const [itemId, c] of Object.entries(byItem ?? {})) {
          levels.set(`${shopId}::${itemId}`, {
            packed: Number((c as any)?.packedUnits) || 0,
            loose: Number((c as any)?.looseUnits) || 0,
          });
        }
      }
    }

    // Agrégat legacy conservé pour la compat du GET (front pas encore redéployé).
    const legacyByKey = new Map<
      string,
      { elementId: string; itemKey: string; menuItemId: string | null; packedDelta: number; looseDelta: number }
    >();
    const unjoined = new Set<string>();

    for (const m of rows) {
      const lk = `${m.elementId}::${m.menuItemId ?? this.normalizeName(m.itemKey)}`;
      const legacy = legacyByKey.get(lk) ?? {
        elementId: m.elementId,
        itemKey: m.itemKey,
        menuItemId: m.menuItemId ?? null,
        packedDelta: 0,
        looseDelta: 0,
      };
      legacy.packedDelta += m.packedDelta ?? 0;
      legacy.looseDelta += m.looseDelta ?? 0;
      legacyByKey.set(lk, legacy);

      const itemId = m.menuItemId ?? idByNormName.get(this.normalizeName(m.itemKey));
      if (!itemId) {
        unjoined.add(m.itemKey);
        continue;
      }
      const k = `${m.elementId}::${itemId}`;
      const cur = levels.get(k) ?? { packed: 0, loose: 0 };
      // Le mouvement a été SAISI dans l'unité de la LOGISTIQUE.
      const logUpp = uppByNormKey.get(this.normalizeName(m.itemKey)) ?? null;
      const invUpp = invUppOf(itemId);

      if (invUpp > 1) {
        // Conditionnement d'inventaire connu → on raisonne en UNITÉS, la seule
        // grandeur commune aux deux référentiels (BUG-239) : sans ça, un pack
        // de baseline compté en 24 était amputé par un emprunt calculé en 12.
        const mUpp = logUpp && logUpp > 0 ? logUpp : invUpp;
        const units = cur.packed * invUpp + cur.loose;
        const deltaUnits = (m.packedDelta ?? 0) * mUpp + (m.looseDelta ?? 0);
        // Clamp ≥ 0 après CHAQUE mouvement — équivalent unitaire de
        // `normalizeLevel` (l'emprunt sur les packs n'est qu'un report de retenue).
        const next = Math.max(0, round2(units + deltaUnits));
        const packed = Math.floor(next / invUpp);
        levels.set(k, { packed, loose: round2(next - packed * invUpp) });
      } else {
        // Aucun conditionnement d'inventaire connu : on ne fabrique pas de
        // conversion — canaux packed/loose séparés, sémantique Logistique
        // historique (`normalizeLevel`, casse de pack si la Logistique, elle,
        // connaît un unitsPerPack).
        const next = this.logistics.normalizeLevel(
          cur.packed + (m.packedDelta ?? 0),
          cur.loose + (m.looseDelta ?? 0),
          logUpp,
        );
        levels.set(k, { packed: next.packed, loose: next.loose });
      }
    }

    if (unjoined.size) {
      this.logger.warn(
        `Pre-event expected: ${unjoined.size} itemKey(s) non joignable(s) au référentiel, ` +
          `mouvements ignorés (attendus sous-estimés) : ${[...unjoined].join(', ')}`,
      );
    }

    // Sortie : packed/loose dans l'unité de l'INVENTAIRE, plus `units` et
    // `unitsPerPack` quand le conditionnement est connu — le front n'a alors plus
    // à deviner le diviseur (BUG-239). Conditionnement inconnu → les deux restent
    // `null` : pas de total fabriqué, le front garde son propre référentiel.
    const expected = new Map<
      string,
      { packed: number; loose: number; units: number | null; unitsPerPack: number | null }
    >();
    for (const [k, lvl] of levels) {
      const itemId = k.split('::')[1] ?? '';
      const q = invUppOf(itemId);
      expected.set(k, {
        packed: lvl.packed,
        loose: round2(lvl.loose),
        units: q > 1 ? round2(lvl.packed * q + lvl.loose) : null,
        unitsPerPack: q > 1 ? q : null,
      });
    }

    return {
      previousEvent,
      snapshot,
      expected,
      movements: [...legacyByKey.values()],
      unjoinedItemKeys: [...unjoined],
    };
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

    const { previousEvent, snapshot, expected, movements, unjoinedItemKeys } = await this.computeExpected(
      spaceId,
      tenantId,
    );
    if (!previousEvent || !snapshot) {
      return {
        previousEvent: previousEvent ?? null,
        baseline: null,
        movements: [],
        expected: null,
        unjoinedItemKeys: [],
      };
    }
    // `expected` : blob normalisé (rejeu séquentiel + casse de pack, BUG-232) —
    // la source à afficher. `baseline`/`movements` conservés pour compat (repli
    // front tant que les deux côtés ne sont pas déployés ensemble).
    const expectedBlob: Record<
      string,
      Record<string, { packed: number; loose: number; units: number; unitsPerPack: number }>
    > = {};
    for (const [k, v] of expected ?? []) {
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
      previousEvent: { id: previousEvent.id, name: previousEvent.name, snapshotAt: snapshot.createdAt },
      baseline: snapshot.inventoryCounts,
      movements,
      expected: expectedBlob,
      unjoinedItemKeys,
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

    // Attendus normalisés (rejeu séquentiel + casse de pack) — même chemin que
    // le GET pre-event-baseline (BUG-232) : hints à l'écran et lignes de
    // réconciliation ne peuvent plus diverger.
    const { snapshot, expected: expectedMap } = await this.computeExpected(spaceId, tenantId);
    const expected =
      expectedMap ??
      new Map<string, { packed: number; loose: number; units: number; unitsPerPack: number }>();

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
    const hasBaseline = snapshot != null;
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
      // Pas de baseline → attendu/écart null (« — »), jamais 0 fabriqué.
      const expectedPacked = hasBaseline ? (exp?.packed ?? 0) : null;
      const expectedLoose = hasBaseline ? round2(exp?.loose ?? 0) : null;
      const expectedUnits =
        hasBaseline && unitsPerPack
          ? round2(exp?.units ?? (exp ? exp.packed * unitsPerPack + exp.loose : 0))
          : null;
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
          baseline: hasBaseline
            ? { source: 'previous-post-event', snapshotAt: snapshot?.createdAt ?? null }
            : { source: 'none' },
          orphanLinesExcluded: orphanCount,
        },
        createdBy: userId ?? null,
      } as any,
    });
    // BUG-233 : le document persisté est complet ; la RÉPONSE est expurgée pour
    // un appelant sans `front.fb.preInventoryExpected` (il a le droit de créer,
    // pas de voir les attendus).
    return canSeeExpected ? created : this.redactPreEventDoc(created as any);
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
