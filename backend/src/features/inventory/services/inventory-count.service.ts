import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateInventoryDto } from '../dto/create-inventory.dto';
import { CreateInventoryCountDto } from '../dto/create-inventory-count.dto';
import { SpaceAccessService } from '../../../core/auth/space-access.service';

/**
 * Feuilles de comptage d'inventaire : lecture par espace et match, enregistrement des comptages, remise à zéro d'un élément.
 */
@Injectable()
export class InventoryCountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  private readonly logger = new Logger(InventoryCountService.name);

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

  /**
   * Snapshot post-event FIGÉ à l'arrêt de la phase (document Bertrand 2026-10-06, D15) :
   * référence du repli « post-event du match précédent » du match suivant. Sans comptage,
   * rien n'est écrit.
   */
  async freezePostEventSnapshot(spaceId: string, eventId: string, tenantId: string, userId?: string) {
    const merged = await this.getBySpaceAndEvent(spaceId, eventId, tenantId, 'post-event');
    const blob = (merged?.inventoryCounts ?? {}) as Record<string, Record<string, unknown>>;
    const hasCounts = Object.values(blob).some((byItem) => Object.keys(byItem ?? {}).length > 0);
    if (!hasCounts) return null;
    return this.upsertInventory({ spaceId, eventId, kind: 'post-event', inventoryCounts: blob }, tenantId, userId);
  }

  /**
   * « Recompter » un PDV en post-event (demande Bertrand 2026-09-29) : ses articles repassent
   * à compter, quantités remises à 0. Le comptage d'avant-match reste intact (snapshot
   * pre-event, base de la réconciliation). Si un manager PIN avait déjà dit « J'ai terminé »
   * ou été validé, son accès redevient modifiable pour qu'il recompte.
   */
  async resetElementForRecount(
    spaceId: string,
    eventId: string,
    elementId: string,
    tenantId: string,
    userId?: string,
  ): Promise<{ resetCount: number }> {
    await this.spaceAccess.assertSpaceInTenant(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    const reset = await this.prisma.inventoryCount.updateMany({
      where: { tenantId, spaceId, eventId, shopId: elementId },
      data: {
        isCounted: false,
        countingStatus: 'pending',
        packedUnits: 0,
        looseUnits: 0,
        countedBy: userId ?? null,
      },
    });

    const windows = await this.prisma.inventoryWindow.findMany({
      where: { tenantId, spaceId, eventId, phase: 'post-event', status: 'open' },
      select: { id: true },
    });
    if (windows.length) {
      await this.prisma.guestPinAccess.updateMany({
        where: { windowId: { in: windows.map((w) => w.id) }, elementId },
        data: { submittedAt: null, validatedAt: null, validatedBy: null },
      });
    }
    this.logger.log(`Recomptage post-event : space ${spaceId} / event ${eventId} / PDV ${elementId} (${reset.count} ligne(s))`);
    return { resetCount: reset.count };
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
