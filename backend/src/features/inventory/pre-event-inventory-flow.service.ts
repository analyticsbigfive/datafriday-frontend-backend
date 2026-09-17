import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { InventoryService } from './inventory.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import {
  resolveDoorsOpenAt,
  resolveEventTransactionWindow,
} from '../../shared/utils/event-window.util';

/** Événement tel que lu pour le flux (sélection minimale, partagée cron/service). */
export interface FlowEvent {
  id: string;
  tenantId: string;
  spaceId: string;
  name: string | null;
  eventDate: Date;
  eventStartDate: Date | null;
  eventEndDate?: Date | null;
  eventEndTime?: string | null;
  /** `Event.sessions` brut : porte l'heure d'ouverture des portes (`doorsOpening`). */
  sessions?: unknown;
  /** Fuseau du space (`Space.timezone`), dans lequel `doorsOpening` est saisi. */
  timezone: string;
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
  /** Document créé (expurgé selon `canSeeExpected`), pour l'appel manuel. */
  document?: unknown;
}

export type PreEventWindowPhase = 'no-doors-open' | 'before' | 'editing' | 'locked';

/** État de la fenêtre d'édition pre-event, exposé au front (instants UTC). */
export interface PreEventWindowState {
  phase: PreEventWindowPhase;
  doorsOpenAt: Date | null;
  editDeadline: Date | null;
  doorsOpenDone: boolean;
}

/**
 * Flux Pre-event Inventory autour de l'ouverture des portes (critères
 * d'acceptation 2026-09-14) :
 *
 *  1. Quand TOUS les articles d'un PDV sont marqués comptés (signalé par le front,
 *     staff ou invité PIN : lui seul connaît la liste explosée des articles), la
 *     réconciliation pre-event est (re)générée et la Logistique recalée avec les
 *     comptages nouveaux ou modifiés, même si les autres PDV ne sont pas finis.
 *  2. À l'ouverture des portes, même chose, une seule fois (marqueur KvStore), et
 *     la fenêtre invité pre-event est clôturée : les managers sans login
 *     n'écrivent plus.
 *  3. Pendant les 30 minutes qui suivent, les utilisateurs avec login peuvent
 *     encore modifier ; chaque écriture marque la feuille "à régénérer"
 *     (KvStore), et le cron la régénère à la minute suivante, Logistique
 *     comprise. Au-delà, l'écriture pre-event est refusée (403).
 *
 * "Doors Open" = `sessions[].doorsOpening` (heure locale du space) posée sur le
 * jour de l'event. `eventDate`/`eventStartDate` sont des jours calendaires ancrés
 * à minuit, jamais une heure : s'y replier verrouillait l'inventaire à 02:30 du
 * matin le jour du match. SANS heure renseignée : aucun verrou, aucune clôture
 * automatique ; il reste le déclencheur "PDV complet" et le passage manuel
 * (`runDoorsOpen` via l'endpoint dédié).
 *
 * UNE feuille par match : chaque régénération remplace la précédente en
 * reprenant telles quelles les lignes déjà poussées et inchangées (écarts figés)
 * et ne pousse vers Logistic que l'incrément (cf. InventoryService). Les
 * régénérations d'un même match sont sérialisées en mémoire (cron et HTTP vivent
 * dans le même process ; un second process exigerait un verrou en base).
 * Séparé d'InventoryService pour ne pas alourdir un fichier déjà dense ; ce
 * service en dépend, jamais l'inverse.
 */
@Injectable()
export class PreEventInventoryFlowService {
  private readonly logger = new Logger(PreEventInventoryFlowService.name);

  /** Fenêtre d'édition staff après l'ouverture des portes. */
  static readonly EDIT_WINDOW_MINUTES = 30;
  /** Au-delà de la fin de la fenêtre + cette marge, le passage "portes ouvertes"
   *  rattrapé (cron arrêté, redéploiement) ne pousse plus rien vers Logistic. */
  static readonly LATE_GRACE_MINUTES = 5;

  static readonly DOORS_OPEN_MARKER_PREFIX = 'live-pre-event-init';
  static readonly DIRTY_MARKER_PREFIX = 'pre-event-reco-dirty';

  /** File d'attente par match : une régénération à la fois. */
  private readonly regenerateQueues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  // ── Dates ────────────────────────────────────────────────────────────────────

  /** Instant réel d'ouverture des portes, `null` si aucune heure n'est renseignée. */
  doorsOpenAt(event: FlowEvent): Date | null {
    return resolveDoorsOpenAt(event, event.timezone || 'Europe/Paris');
  }

  editDeadline(event: FlowEvent): Date | null {
    const doorsOpen = this.doorsOpenAt(event);
    if (!doorsOpen) return null;
    return new Date(
      doorsOpen.getTime() + PreEventInventoryFlowService.EDIT_WINDOW_MINUTES * 60 * 1000,
    );
  }

  /** Fin de la fenêtre de l'event (même règle que le Live : fin déclarée, sinon
   *  journée calendaire), pour borner le cron. */
  eventWindowEnd(event: FlowEvent): Date {
    return resolveEventTransactionWindow(event, event.timezone || 'Europe/Paris').end;
  }

  windowState(
    event: FlowEvent,
    now: Date = new Date(),
  ): Omit<PreEventWindowState, 'doorsOpenDone'> {
    const doorsOpenAt = this.doorsOpenAt(event);
    const editDeadline = this.editDeadline(event);
    if (!doorsOpenAt || !editDeadline) {
      return { phase: 'no-doors-open', doorsOpenAt: null, editDeadline: null };
    }
    const phase: PreEventWindowPhase =
      now < doorsOpenAt ? 'before' : now <= editDeadline ? 'editing' : 'locked';
    return { phase, doorsOpenAt, editDeadline };
  }

  /** État de la fenêtre pour le front (une seule source de vérité, instants UTC). */
  async getWindowState(
    spaceId: string,
    eventId: string,
    tenantId: string,
  ): Promise<PreEventWindowState> {
    const event = await this.findEvent(spaceId, eventId, tenantId);
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    const state = this.windowState(event);
    const marker = await this.prisma.kvStore.findUnique({
      where: { uniq_kv_store: { tenantId, key: this.doorsOpenKey(spaceId, eventId) } },
      select: { id: true },
    });
    return { ...state, doorsOpenDone: !!marker };
  }

  // ── Écriture d'un comptage ──────────────────────────────────────────────────

  /**
   * Point d'entrée UNIQUE des écritures de comptage (staff et invité) : applique
   * le verrou des 30 minutes en phase pre-event, délègue l'upsert, puis marque la
   * feuille à régénérer si les portes sont déjà ouvertes. Hors phase pre-event
   * (post-event, ou client ancien sans `phase`), ou sans heure d'ouverture des
   * portes connue, simple délégation.
   */
  async saveCount(dto: CreateInventoryCountDto, tenantId: string, userId?: string) {
    if (dto.phase !== 'pre-event' || !dto.eventId) {
      return this.inventoryService.saveInventoryCounts(dto, tenantId, userId);
    }
    const event = await this.findEvent(dto.spaceId, dto.eventId, tenantId);
    const doorsOpen = event ? this.doorsOpenAt(event) : null;
    const deadline = event ? this.editDeadline(event) : null;
    if (!event || !doorsOpen || !deadline) {
      return this.inventoryService.saveInventoryCounts(dto, tenantId, userId);
    }
    const now = new Date();
    if (now > deadline) {
      throw new ForbiddenException(
        `Inventaire pré-événement verrouillé : plus de ${PreEventInventoryFlowService.EDIT_WINDOW_MINUTES} minutes après l'ouverture des portes.`,
      );
    }
    const afterDoorsOpen = now >= doorsOpen;
    // Pendant les 30 minutes, SEULS les éléments non comptés restent modifiables
    // (critère 9) : une ligne déjà marquée comptée à l'ouverture des portes est
    // figée, y compris contre un "reset" qui la repasserait en non compté.
    if (afterDoorsOpen && (await this.isCountedRow(dto, tenantId))) {
      throw new ForbiddenException(
        "Cet article est déjà compté : après l'ouverture des portes, seuls les éléments non comptés peuvent être modifiés.",
      );
    }
    const saved = await this.inventoryService.saveInventoryCounts(dto, tenantId, userId);
    if (afterDoorsOpen) {
      await this.markDirty(dto.spaceId, dto.eventId, tenantId);
    }
    return saved;
  }

  /** La ligne visée par ce comptage est-elle déjà marquée comptée en base ? */
  private async isCountedRow(dto: CreateInventoryCountDto, tenantId: string): Promise<boolean> {
    const row = await this.prisma.inventoryCount.findFirst({
      where: {
        tenantId,
        spaceId: dto.spaceId,
        eventId: dto.eventId ?? null,
        shopId: dto.shopId ?? null,
        itemId: dto.itemId,
      },
      select: { isCounted: true },
    });
    return !!row?.isCounted;
  }

  // ── Régénération de la feuille ──────────────────────────────────────────────

  /**
   * (Re)génère LA feuille pre-event du match depuis les comptages vivants
   * (`InventoryCount`, jamais un snapshot figé) et recale la Logistique avec
   * l'incrément (`createPreEventReconciliation` s'en charge). Les feuilles
   * pre-event précédentes du même match sont supprimées après création de la
   * nouvelle ; leurs lignes déjà poussées et leur besoin prédit sont repris.
   * Pose aussi le snapshot `kind='pre-event'` qui ferme le cycle pre↔post
   * (BUG-237, getPreEventInventory). Sérialisée par match.
   */
  regenerate(
    spaceId: string,
    eventId: string,
    tenantId: string,
    actor: string,
    trigger: PreEventRegenerateTrigger,
    extraMeta: Record<string, unknown> = {},
    options: {
      /** Besoin prédit fourni par le client (appel manuel) ; sinon celui de la feuille précédente. */
      predictedUnits?: Record<string, Record<string, number>> | null;
      canSeeExpected?: boolean;
    } = {},
  ): Promise<PreEventRegenerateResult> {
    const key = `${tenantId}:${spaceId}:${eventId}`;
    const previous = this.regenerateQueues.get(key) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() =>
        this.regenerateNow(spaceId, eventId, tenantId, actor, trigger, extraMeta, options),
      );
    this.regenerateQueues.set(key, run);
    run
      .finally(() => {
        if (this.regenerateQueues.get(key) === run) this.regenerateQueues.delete(key);
      })
      .catch(() => undefined);
    return run;
  }

  private async regenerateNow(
    spaceId: string,
    eventId: string,
    tenantId: string,
    actor: string,
    trigger: PreEventRegenerateTrigger,
    extraMeta: Record<string, unknown>,
    options: {
      predictedUnits?: Record<string, Record<string, number>> | null;
      canSeeExpected?: boolean;
    },
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
    const previousLines = previous[0]?.lines ?? null;
    const predictedUnits = options.predictedUnits ?? this.extractPredictedUnits(previousLines);

    const created = await this.inventoryService.createPreEventReconciliation(
      spaceId,
      eventId,
      tenantId,
      actor,
      options.canSeeExpected ?? true,
      predictedUnits,
      { trigger, regeneratedFrom: previous[0]?.id ?? null, ...extraMeta },
      previousLines,
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
    return { ok: true, reconciliationId: (created as any).id, lineCount, document: created };
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

  // ── Ouverture des portes (cron ou manuel) ───────────────────────────────────

  private doorsOpenKey(spaceId: string, eventId: string): string {
    return `${PreEventInventoryFlowService.DOORS_OPEN_MARKER_PREFIX}:${spaceId}:${eventId}`;
  }

  /**
   * Passage "portes ouvertes" d'un event, idempotent : le marqueur KvStore (même
   * clé que l'ancien cron live-init, pour ne pas rejouer les events déjà traités)
   * est RÉCLAMÉ avant le travail (contrainte unique : deux appels concurrents,
   * cron et bouton, ne passent pas tous les deux) et retiré si le travail échoue.
   * Clôt la fenêtre invité pre-event puis régénère la feuille. Trop tard (fenêtre
   * des 30 min largement dépassée, cron rattrapé après coup) : la fenêtre est
   * clôturée et le marqueur posé, mais rien n'est régénéré ni poussé, le comptage
   * d'avant-match ne doit pas écraser un registre qui a déjà vécu le match.
   */
  async runDoorsOpen(
    event: FlowEvent,
    actor = 'system-doors-open',
    now: Date = new Date(),
  ): Promise<PreEventRegenerateResult> {
    const key = this.doorsOpenKey(event.spaceId, event.id);
    const claimed = await this.claimMarker(event.tenantId, key, {
      spaceId: event.spaceId,
      eventId: event.id,
      actor,
      startedAt: now.toISOString(),
    });
    if (!claimed) return { ok: false, reason: 'already-initialized' };

    try {
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
          closedAt: now,
          closedBy: actor,
          pinLookupHash: null,
          pinCiphertext: null,
        },
      });
      if (closed.count) {
        this.logger.log(
          `Fenêtre invité pre-event clôturée à l'ouverture des portes : space ${event.spaceId} / event ${event.id}`,
        );
      }

      const deadline = this.editDeadline(event);
      const lateAfter = deadline
        ? deadline.getTime() + PreEventInventoryFlowService.LATE_GRACE_MINUTES * 60 * 1000
        : null;
      const result: PreEventRegenerateResult =
        lateAfter !== null && now.getTime() > lateAfter
          ? { ok: false, reason: 'late' }
          : await this.regenerate(event.spaceId, event.id, event.tenantId, actor, 'doors-open');
      if (result.reason === 'late') {
        this.logger.warn(
          `Portes ouvertes rattrapées trop tard, feuille non régénérée : space ${event.spaceId} / event ${event.id}`,
        );
      }

      await this.prisma.kvStore.update({
        where: { uniq_kv_store: { tenantId: event.tenantId, key } },
        data: {
          value: {
            spaceId: event.spaceId,
            eventId: event.id,
            actor,
            at: new Date().toISOString(),
            result: {
              ok: result.ok,
              reason: result.reason ?? null,
              lineCount: result.lineCount ?? null,
            },
          },
        },
      });
      return {
        ok: result.ok,
        reason: result.reason,
        reconciliationId: result.reconciliationId,
        lineCount: result.lineCount,
      };
    } catch (error) {
      await this.prisma.kvStore
        .delete({ where: { uniq_kv_store: { tenantId: event.tenantId, key } } })
        .catch(() => undefined);
      throw error;
    }
  }

  /** Pose le marqueur si absent. `false` si déjà présent (P2002 ou lecture). */
  private async claimMarker(
    tenantId: string,
    key: string,
    value: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await this.prisma.kvStore.create({ data: { tenantId, key, value: value as any } });
      return true;
    } catch (error: any) {
      if (error?.code === 'P2002') return false;
      throw error;
    }
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

  async findEvent(spaceId: string, eventId: string, tenantId: string): Promise<FlowEvent | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: {
        id: true,
        name: true,
        eventDate: true,
        eventStartDate: true,
        eventEndDate: true,
        eventEndTime: true,
        sessions: true,
        space: { select: { timezone: true } },
      },
    });
    if (!event) return null;
    const { space, ...rest } = event;
    return { ...rest, tenantId, spaceId, timezone: space?.timezone || 'Europe/Paris' };
  }
}
