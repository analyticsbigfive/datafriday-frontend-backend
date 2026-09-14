import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { InventoryService } from './inventory.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';

/** Événement tel que lu pour le flux (sélection minimale, partagée cron/service). */
export interface FlowEvent {
  id: string;
  tenantId: string;
  spaceId: string;
  name: string | null;
  eventDate: Date;
  eventStartDate: Date | null;
  eventEndDate?: Date | null;
}

export type PreEventRegenerateTrigger =
  | 'pdv-complete'
  | 'doors-open'
  | 'post-doors-open-edit'
  | 'manual';

export interface PreEventRegenerateResult {
  ok: boolean;
  reason?: string;
  reconciliationId?: string;
  lineCount?: number;
}

/**
 * Flux Pre-event Inventory autour de l'ouverture des portes (critères
 * d'acceptation 2026-09-14) :
 *
 *  1. Quand TOUS les articles d'un PDV sont marqués comptés (signalé par le front,
 *     staff ou invité PIN : lui seul connaît la liste explosée des articles), la
 *     réconciliation pre-event est (re)générée et la Logistique recalée avec
 *     toutes les valeurs saisies, même si les autres PDV ne sont pas finis.
 *  2. À l'ouverture des portes (`eventStartDate ?? eventDate`, aucun signal
 *     "portes ouvertes" n'existe dans les données), même chose, une seule fois
 *     (marqueur KvStore), et la fenêtre invité pre-event est clôturée : les
 *     managers sans login n'écrivent plus.
 *  3. Pendant les 30 minutes qui suivent, les utilisateurs avec login peuvent
 *     encore modifier ; chaque écriture marque la feuille "à régénérer"
 *     (KvStore), et le cron la régénère à la minute suivante, Logistique
 *     comprise. Au-delà, l'écriture pre-event est refusée (403).
 *
 * UNE feuille par match : chaque régénération remplace la précédente (le besoin
 * prédit archivé sur l'ancienne feuille est conservé, le serveur ne sait pas le
 * recalculer). Séparé d'InventoryService pour ne pas alourdir un fichier déjà
 * dense ; ce service en dépend, jamais l'inverse.
 */
@Injectable()
export class PreEventInventoryFlowService {
  private readonly logger = new Logger(PreEventInventoryFlowService.name);

  /** Fenêtre d'édition staff après l'ouverture des portes. */
  static readonly EDIT_WINDOW_MINUTES = 30;

  static readonly DOORS_OPEN_MARKER_PREFIX = 'live-pre-event-init';
  static readonly DIRTY_MARKER_PREFIX = 'pre-event-reco-dirty';

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  // ── Dates ────────────────────────────────────────────────────────────────────

  /** "Doors Open" = `eventStartDate ?? eventDate` (décision 2026-09-14, même
   *  proxy que le cron live-init historique). */
  doorsOpenAt(event: Pick<FlowEvent, 'eventDate' | 'eventStartDate'>): Date {
    return event.eventStartDate ?? event.eventDate;
  }

  editDeadline(event: Pick<FlowEvent, 'eventDate' | 'eventStartDate'>): Date {
    return new Date(
      this.doorsOpenAt(event).getTime() +
        PreEventInventoryFlowService.EDIT_WINDOW_MINUTES * 60 * 1000,
    );
  }

  // ── Écriture d'un comptage ──────────────────────────────────────────────────

  /**
   * Point d'entrée UNIQUE des écritures de comptage (staff et invité) : applique
   * le verrou des 30 minutes en phase pre-event, délègue l'upsert, puis marque la
   * feuille à régénérer si les portes sont déjà ouvertes. Hors phase pre-event
   * (post-event, ou client ancien sans `phase`), simple délégation.
   */
  async saveCount(dto: CreateInventoryCountDto, tenantId: string, userId?: string) {
    if (dto.phase !== 'pre-event' || !dto.eventId) {
      return this.inventoryService.saveInventoryCounts(dto, tenantId, userId);
    }
    const event = await this.findEvent(dto.spaceId, dto.eventId, tenantId);
    const now = new Date();
    if (event && now > this.editDeadline(event)) {
      throw new ForbiddenException(
        `Inventaire pré-événement verrouillé : plus de ${PreEventInventoryFlowService.EDIT_WINDOW_MINUTES} minutes après l'ouverture des portes.`,
      );
    }
    const saved = await this.inventoryService.saveInventoryCounts(dto, tenantId, userId);
    if (event && now >= this.doorsOpenAt(event)) {
      await this.markDirty(dto.spaceId, dto.eventId, tenantId);
    }
    return saved;
  }

  // ── Régénération de la feuille ──────────────────────────────────────────────

  /**
   * (Re)génère LA feuille pre-event du match depuis les comptages vivants
   * (`InventoryCount`, jamais un snapshot figé) et recale la Logistique
   * (`createPreEventReconciliation` s'en charge). Les feuilles pre-event
   * précédentes du même match sont supprimées ; leur besoin prédit est reporté.
   * Pose aussi le snapshot `kind='pre-event'` qui ferme le cycle pre↔post
   * (BUG-237, getPreEventInventory).
   */
  async regenerate(
    spaceId: string,
    eventId: string,
    tenantId: string,
    actor: string,
    trigger: PreEventRegenerateTrigger,
    extraMeta: Record<string, unknown> = {},
  ): Promise<PreEventRegenerateResult> {
    const event = await this.findEvent(spaceId, eventId, tenantId);
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    const merged = await this.inventoryService.getBySpaceAndEvent(
      spaceId,
      eventId,
      tenantId,
      'pre-event',
    );
    const blob = (merged?.inventoryCounts ?? {}) as Record<string, Record<string, unknown>>;
    const hasCounts = Object.values(blob).some((byItem) => Object.keys(byItem ?? {}).length > 0);
    if (!hasCounts) return { ok: false, reason: 'no-counts' };

    const previous = await this.prisma.stockReconciliation.findMany({
      where: { tenantId, spaceId, eventId, kind: 'pre-event' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, lines: true },
    });
    const predictedUnits = this.extractPredictedUnits(previous[0]?.lines);

    const created = await this.inventoryService.createPreEventReconciliation(
      spaceId,
      eventId,
      tenantId,
      actor,
      true,
      predictedUnits,
      { trigger, regeneratedFrom: previous[0]?.id ?? null, ...extraMeta },
    );

    if (previous.length) {
      await this.prisma.stockReconciliation.deleteMany({
        where: { id: { in: previous.map((p) => p.id) } },
      });
    }

    await this.inventoryService.upsertInventory(
      { spaceId, eventId, kind: 'pre-event', inventoryCounts: blob },
      tenantId,
      actor,
    );

    const lineCount = Array.isArray((created as any)?.lines)
      ? (created as any).lines.length
      : undefined;
    this.logger.log(
      `Feuille pre-event régénérée (${trigger}) : space ${spaceId} / event ${eventId} (${lineCount ?? '?'} ligne(s))`,
    );
    return { ok: true, reconciliationId: (created as any).id, lineCount };
  }

  /** Besoin prédit archivé sur une feuille existante → blob attendu par
   *  createPreEventReconciliation ({ elementId: { itemId: unités } }). null si
   *  aucune ligne n'en porte (colonnes prédit vides, comme aujourd'hui). */
  private extractPredictedUnits(lines: unknown): Record<string, Record<string, number>> | null {
    if (!Array.isArray(lines)) return null;
    const out: Record<string, Record<string, number>> = {};
    let found = false;
    for (const l of lines as Array<Record<string, unknown>>) {
      const elementId = l?.elementId;
      const itemKey = l?.itemKey;
      const predicted = Number(l?.predictedUnits);
      if (
        typeof elementId !== 'string' ||
        typeof itemKey !== 'string' ||
        !Number.isFinite(predicted)
      )
        continue;
      (out[elementId] ??= {})[itemKey] = predicted;
      found = true;
    }
    return found ? out : null;
  }

  // ── Ouverture des portes (cron) ─────────────────────────────────────────────

  /**
   * Passage "portes ouvertes" d'un event, idempotent (marqueur KvStore, même clé
   * que l'ancien cron live-init pour ne pas rejouer les events déjà traités) :
   * clôt la fenêtre invité pre-event puis régénère la feuille. Le marqueur est
   * posé même sans comptage : il n'y a rien à pousser, et une saisie staff dans
   * les 30 minutes passera par `markDirty` → `flushDirty`.
   */
  async runDoorsOpen(event: FlowEvent): Promise<PreEventRegenerateResult> {
    const key = `${PreEventInventoryFlowService.DOORS_OPEN_MARKER_PREFIX}:${event.spaceId}:${event.id}`;
    const already = await this.prisma.kvStore.findUnique({
      where: { uniq_kv_store: { tenantId: event.tenantId, key } },
    });
    if (already) return { ok: false, reason: 'already-initialized' };

    const closed = await this.prisma.inventoryWindow.updateMany({
      where: {
        tenantId: event.tenantId,
        spaceId: event.spaceId,
        eventId: event.id,
        phase: 'pre-event',
        status: 'open',
      },
      data: {
        status: 'closed',
        closedAt: new Date(),
        closedBy: 'system-doors-open',
        pinLookupHash: null,
        pinCiphertext: null,
      },
    });
    if (closed.count) {
      this.logger.log(
        `Fenêtre invité pre-event clôturée à l'ouverture des portes : space ${event.spaceId} / event ${event.id}`,
      );
    }

    const result = await this.regenerate(
      event.spaceId,
      event.id,
      event.tenantId,
      'system-doors-open',
      'doors-open',
    );

    await this.prisma.kvStore.create({
      data: {
        tenantId: event.tenantId,
        key,
        value: {
          spaceId: event.spaceId,
          eventId: event.id,
          at: new Date().toISOString(),
          result: {
            ok: result.ok,
            reason: result.reason ?? null,
            lineCount: result.lineCount ?? null,
          },
        },
      },
    });
    return result;
  }

  // ── Fenêtre des 30 minutes (cron) ───────────────────────────────────────────

  private dirtyKey(spaceId: string, eventId: string): string {
    return `${PreEventInventoryFlowService.DIRTY_MARKER_PREFIX}:${spaceId}:${eventId}`;
  }

  async markDirty(spaceId: string, eventId: string, tenantId: string): Promise<void> {
    const key = this.dirtyKey(spaceId, eventId);
    const value = { spaceId, eventId, at: new Date().toISOString() };
    await this.prisma.kvStore.upsert({
      where: { uniq_kv_store: { tenantId, key } },
      create: { tenantId, key, value },
      update: { value },
    });
  }

  /**
   * Régénère si une écriture a eu lieu depuis la dernière feuille. Le marqueur
   * est retiré AVANT la régénération : une écriture concurrente le repose et
   * sera prise au tick suivant, rien n'est perdu. En cas d'échec, il est reposé.
   */
  async flushDirty(event: FlowEvent): Promise<PreEventRegenerateResult> {
    const key = this.dirtyKey(event.spaceId, event.id);
    const dirty = await this.prisma.kvStore.findUnique({
      where: { uniq_kv_store: { tenantId: event.tenantId, key } },
    });
    if (!dirty) return { ok: false, reason: 'clean' };
    await this.prisma.kvStore.delete({ where: { id: dirty.id } });
    try {
      return await this.regenerate(
        event.spaceId,
        event.id,
        event.tenantId,
        'system-post-doors-open-edit',
        'post-doors-open-edit',
      );
    } catch (error) {
      await this.markDirty(event.spaceId, event.id, event.tenantId);
      throw error;
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  private async findEvent(
    spaceId: string,
    eventId: string,
    tenantId: string,
  ): Promise<FlowEvent | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true, eventDate: true, eventStartDate: true, eventEndDate: true },
    });
    if (!event) return null;
    return { ...event, tenantId, spaceId };
  }
}
