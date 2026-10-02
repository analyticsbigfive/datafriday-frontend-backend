import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { PostEventDraftService } from './post-event-draft.service';
import { LogisticFlushThrottle } from './logistic-flush-throttle';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import {
  resolveDoorsOpenAt,
  resolveEventTransactionWindow,
} from '../../shared/utils/event-window.util';
import { InventoryCountService } from './services/inventory-count.service';
import { InventoryReconciliationService } from './services/inventory-reconciliation.service';
import { InventoryLogisticPushService } from './services/inventory-logistic-push.service';
import type {
  FlowEvent,
  PreEventRegenerateResult,
  PreEventRegenerateTrigger,
  PreEventWindowPhase,
  PreEventWindowState,
} from './pre-event-inventory-flow.types';
import { extractPredictedUnits } from './pre-event-predicted-units';

/**
 * Flux Pre-event Inventory autour de l'ouverture des portes (critères
 * d'acceptation 2026-09-14) :
 *
 *  1. Quand TOUS les articles d'un PDV sont marqués comptés (signalé par le front,
 *     staff ou invité PIN : lui seul connaît la liste explosée des articles), la
 *     réconciliation pre-event est (re)générée et la Logistique recalée avec les
 *     comptages nouveaux ou modifiés, même si les autres PDV ne sont pas finis.
 *  2. À l'ouverture des portes, même chose, une seule fois (marqueur KvStore). La
 *     fenêtre invité pre-event n'est plus clôturée à cet instant (Bertrand
 *     2026-10-07) : chaque PDV s'arrête à sa première vente, et le directeur peut
 *     rouvrir un PDV jusqu'à la fin de l'event.
 *  3. Après les portes et jusqu'à la fin réelle de l'event, l'inventaire pre-event
 *     reste modifiable, articles déjà comptés compris ; chaque écriture marque la
 *     feuille "à régénérer" (KvStore), régénérée par le cron à la minute suivante,
 *     et l'article part vers Logistic comme avant les portes. Après la fin de
 *     l'event, l'écriture pre-event est refusée (403).
 *  4. Avant l'ouverture des portes, l'inventaire pre-event est modifiable à tout
 *     moment, sans attendre le jour du match (Ulrich 2026-10-02, revenu sur
 *     l'ouverture à minuit du 2026-09-29).
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
export class PreEventInventoryFlowService implements OnModuleDestroy {
  private readonly logger = new Logger(PreEventInventoryFlowService.name);

  /** Au-delà de la fin de la fenêtre + cette marge, le passage "portes ouvertes"
   *  rattrapé (cron arrêté, redéploiement) ne pousse plus rien vers Logistic. */
  static readonly LATE_GRACE_MINUTES = 5;

  static readonly DOORS_OPEN_MARKER_PREFIX = 'live-pre-event-init';
  static readonly DIRTY_MARKER_PREFIX = 'pre-event-reco-dirty';
  /** « À envoyer vers Logistic » : posé à chaque article marqué compté, pre ET post,
   *  staff ET invité PIN. Envoyé quelques secondes après le clic (LogisticFlushThrottle),
   *  le cron à la minute (InventoryLogisticSyncCronService) rattrape le reste. */
  static readonly LOGISTIC_DIRTY_PREFIX = 'inventory-logistic-dirty';

  /** File d'attente par match : une régénération à la fois. */
  private readonly regenerateQueues = new Map<string, Promise<unknown>>();

  /** Envoi Logistic quasi immédiat après « Marquer compté » (temps réel, 2026-10-07). */
  private readonly logisticFlush = new LogisticFlushThrottle(async (key) => {
    try {
      await this.flushLogisticDirty(key);
    } catch (error: any) {
      this.logger.warn(`Envoi Logistic immédiat en échec (le cron rattrapera) : ${key} : ${error?.message}`);
    }
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly inventoryReconciliationService: InventoryReconciliationService,
    private readonly inventoryLogisticPushService: InventoryLogisticPushService,
    // Optionnel : les tests unitaires du flux pre-event ne le fournissent pas.
    @Optional() private readonly postEventDraft?: PostEventDraftService,
  ) {}

  onModuleDestroy(): void {
    this.logisticFlush.clear();
  }

  // ── Dates ────────────────────────────────────────────────────────────────────

  /** Instant réel d'ouverture des portes, `null` si aucune heure n'est renseignée. */
  doorsOpenAt(event: FlowEvent): Date | null {
    return resolveDoorsOpenAt(event, event.timezone || 'Europe/Paris');
  }

  /** Fin de l'édition pre-event : fin réelle de l'event (retour Bertrand 2026-10-07 : le
   *  pre-event reste disponible PDV par PDV après les portes ; avant, portes + 30 min).
   *  `null` sans heure d'ouverture des portes (aucun verrou, comme avant). */
  editDeadline(event: FlowEvent): Date | null {
    if (!this.doorsOpenAt(event)) return null;
    return this.eventWindowEnd(event);
  }

  /** Fin de la fenêtre de l'event (même règle que le Live : fin déclarée, sinon
   *  journée calendaire), pour borner le cron. */
  eventWindowEnd(event: FlowEvent): Date {
    return resolveEventTransactionWindow(event, event.timezone || 'Europe/Paris').end;
  }

  windowState(event: FlowEvent, now: Date = new Date()): Omit<PreEventWindowState, 'doorsOpenDone'> {
    const doorsOpenAt = this.doorsOpenAt(event);
    const editDeadline = this.editDeadline(event);
    if (!doorsOpenAt || !editDeadline) {
      return { phase: 'no-doors-open', doorsOpenAt: null, editDeadline: null };
    }
    const phase: PreEventWindowPhase =
      now < doorsOpenAt ? 'before' : now <= editDeadline ? 'editing' : 'locked';
    return { phase, doorsOpenAt, editDeadline };
  }

  /** Portes déjà ouvertes (heure passée, ou passage « portes ouvertes » déjà fait). */
  private async isAfterDoorsOpen(event: FlowEvent, now: Date = new Date()): Promise<boolean> {
    const doorsOpen = this.doorsOpenAt(event);
    if (doorsOpen && now >= doorsOpen) return true;
    const marker = await this.prisma.kvStore.findUnique({
      where: { uniq_kv_store: { tenantId: event.tenantId, key: this.doorsOpenKey(event.spaceId, event.id) } },
      select: { id: true },
    });
    return !!marker;
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
   * le verrou de fin d'event en phase pre-event, délègue l'upsert, puis marque la
   * feuille à régénérer si les portes sont déjà ouvertes. Hors phase pre-event
   * (post-event, ou client ancien sans `phase`), ou sans heure d'ouverture des
   * portes connue, simple délégation.
   */
  async saveCount(dto: CreateInventoryCountDto, tenantId: string, userId?: string) {
    const saved = await this.saveCountGuarded(dto, tenantId, userId);
    // Document Bertrand 2026-10-06 (D1) : « Marquer compté » met la Logistique à jour,
    // pre ET post, y compris après l'ouverture des portes. Envoi regroupé à la minute :
    // chaque envoi recalcule le stock de tout l'espace (LogisticsService.reset).
    if (dto.isCounted === true && dto.eventId && (dto.phase === 'pre-event' || dto.phase === 'post-event')) {
      await this.markLogisticDirty(dto.spaceId, dto.eventId, tenantId, dto.phase);
      this.logisticFlush.schedule(this.logisticDirtyKey(dto.phase, dto.spaceId, dto.eventId));
    }
    return saved;
  }

  private async saveCountGuarded(dto: CreateInventoryCountDto, tenantId: string, userId?: string) {
    if (dto.phase !== 'pre-event' || !dto.eventId) {
      return this.inventoryCountService.saveInventoryCounts(dto, tenantId, userId);
    }
    const event = await this.findEvent(dto.spaceId, dto.eventId, tenantId);
    const now = new Date();
    const doorsOpen = event ? this.doorsOpenAt(event) : null;
    const deadline = event ? this.editDeadline(event) : null;
    if (!event || !doorsOpen || !deadline) {
      return this.inventoryCountService.saveInventoryCounts(dto, tenantId, userId);
    }
    if (now > deadline) {
      throw new ForbiddenException(
        "Inventaire pré-événement verrouillé : l'événement est terminé.",
      );
    }
    const afterDoorsOpen = now >= doorsOpen;
    const saved = await this.inventoryCountService.saveInventoryCounts(dto, tenantId, userId);
    if (afterDoorsOpen) {
      await this.markDirty(dto.spaceId, dto.eventId, tenantId);
    }
    return saved;
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
      /** PDV poussés vers Logistic (undefined = tous, [] = aucun : feuille seule). */
      pushElementIds?: string[];
      /** false : pas de snapshot (envoi de la minute) ; le snapshot est figé à l'arrêt (D15). */
      snapshot?: boolean;
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
      pushElementIds?: string[];
      snapshot?: boolean;
    },
  ): Promise<PreEventRegenerateResult> {
    const event = await this.findEvent(spaceId, eventId, tenantId);
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    const merged = await this.inventoryCountService.getBySpaceAndEvent(
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
    const predictedUnits = options.predictedUnits ?? extractPredictedUnits(previousLines);

    const created = await this.inventoryReconciliationService.createPreEventReconciliation(
      spaceId,
      eventId,
      tenantId,
      actor,
      options.canSeeExpected ?? true,
      predictedUnits,
      { trigger, regeneratedFrom: previous[0]?.id ?? null, ...extraMeta },
      previousLines,
      options.pushElementIds,
    );

    if (previous.length) {
      await this.prisma.stockReconciliation.deleteMany({
        where: { id: { in: previous.map((p) => p.id) } },
      });
    }

    if (options.snapshot !== false) {
      await this.inventoryCountService.upsertInventory(
        { spaceId, eventId, kind: 'pre-event', inventoryCounts: blob },
        tenantId,
        actor,
      );
    }

    const lineCount = Array.isArray((created as any)?.lines)
      ? (created as any).lines.length
      : undefined;
    this.logger.log(
      `Feuille pre-event régénérée (${trigger}) : space ${spaceId} / event ${eventId} (${lineCount ?? '?'} ligne(s))`,
    );
    return {
      ok: true,
      reconciliationId: (created as any).id,
      lineCount,
      document: created,
      logisticPush: (created as any)?.meta?.logisticPush ?? null,
    };
  }

  /**
   * Tous les articles d'un PDV sont comptés (staff ou invité PIN) : feuille régénérée et
   * Logistic recalée, avant comme après l'ouverture des portes (document Bertrand
   * 2026-10-06, D1 : la règle du 2026-09-29 « Logistic manuelle après les portes » est
   * abandonnée).
   */
  async regenerateOnPdvComplete(
    spaceId: string,
    eventId: string,
    tenantId: string,
    actor: string,
    elementId?: string | null,
    /** Besoin prédit fourni par l'écran ; null : celui de la feuille précédente. */
    predictedUnits: Record<string, Record<string, number>> | null = null,
  ): Promise<PreEventRegenerateResult> {
    const event = await this.findEvent(spaceId, eventId, tenantId);
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    return this.regenerate(
      spaceId,
      eventId,
      tenantId,
      actor,
      'pdv-complete',
      elementId ? { elementId } : {},
      predictedUnits ? { predictedUnits } : {},
    );
  }

  /**
   * Mise à jour MANUELLE de Logistic pour un PDV en pre-event (responsable logistique ou
   * administrateur) : la feuille est régénérée, seul ce PDV part vers le registre.
   */
  async pushElementToLogistic(
    spaceId: string,
    eventId: string,
    tenantId: string,
    actor: string,
    elementId: string,
  ): Promise<PreEventRegenerateResult> {
    return this.regenerate(spaceId, eventId, tenantId, actor, 'manual', { elementId, manualPush: true }, {
      pushElementIds: [elementId],
    });
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
   * Régénère la feuille, sans clore la fenêtre invité (Bertrand 2026-10-07). Trop tard
   * (event terminé, cron rattrapé après coup) : le marqueur est posé, mais rien n'est
   * régénéré ni poussé, le comptage
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
      // La fenêtre invité pre-event n'est plus clôturée aux portes (Bertrand 2026-10-07) :
      // chaque PDV s'arrête à sa première vente (InventoryCycleCronService), la fenêtre à
      // la fin de l'event (InventoryWindowLifecycleCronService).
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

  // ── Après les portes (cron) ─────────────────────────────────────────────────

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
      // Logistic recalée aussi (D1, document Bertrand 2026-10-06).
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

  // ── Logistique à chaque article marqué compté (D1) ──────────────────────────

  private logisticDirtyKey(phase: 'pre-event' | 'post-event', spaceId: string, eventId: string): string {
    return `${PreEventInventoryFlowService.LOGISTIC_DIRTY_PREFIX}:${phase}:${spaceId}:${eventId}`;
  }

  async markLogisticDirty(
    spaceId: string,
    eventId: string,
    tenantId: string,
    phase: 'pre-event' | 'post-event',
  ): Promise<void> {
    const key = this.logisticDirtyKey(phase, spaceId, eventId);
    const value = { spaceId, eventId, phase, at: new Date().toISOString() };
    await this.prisma.kvStore.upsert({
      where: { uniq_kv_store: { tenantId, key } },
      create: { tenantId, key, value },
      update: { value },
    });
  }

  /**
   * Envoie vers Logistic les articles marqués comptés depuis le dernier envoi, pour
   * chaque (espace, event, phase) marqué. Push INCRÉMENTAL (seules les lignes modifiées
   * depuis leur dernier envoi partent). Le marqueur est retiré AVANT l'envoi : un
   * comptage concurrent le repose et part au tick suivant ; reposé en cas d'échec.
   */
  async flushLogisticDirty(onlyKey?: string): Promise<number> {
    const markers = await this.prisma.kvStore.findMany({
      where: onlyKey
        ? { key: onlyKey }
        : { key: { startsWith: `${PreEventInventoryFlowService.LOGISTIC_DIRTY_PREFIX}:` } },
    });
    let pushed = 0;
    for (const marker of markers) {
      const v = (marker.value ?? {}) as { spaceId?: string; eventId?: string; phase?: string };
      const tenantId = marker.tenantId;
      if (!tenantId || !v.spaceId || !v.eventId || (v.phase !== 'pre-event' && v.phase !== 'post-event')) {
        await this.prisma.kvStore.delete({ where: { id: marker.id } }).catch(() => undefined);
        continue;
      }
      // Le retrait du marqueur vaut prise en charge : l'envoi immédiat et le cron (ou une
      // autre instance) peuvent lire le même marqueur, un seul l'envoie.
      const claimed = await this.prisma.kvStore.deleteMany({ where: { id: marker.id } });
      if (!claimed.count) continue;
      try {
        if (v.phase === 'pre-event') {
          // Feuille pre-event à jour + Logistic (push incrémental inclus), sans snapshot.
          const result = await this.regenerate(v.spaceId, v.eventId, tenantId, 'system-inventory-count', 'count', {}, { snapshot: false });
          if (result.ok) pushed++;
        } else {
          const result = await this.inventoryLogisticPushService.pushPendingCountToLogistic(
            v.spaceId,
            v.eventId,
            tenantId,
            v.phase,
            'system-inventory-count',
          );
          if (result.ok) pushed++;
          // Réconciliation post-event tenue à jour par le serveur (lot 4b).
          await this.postEventDraft?.rebuild(v.spaceId, v.eventId, tenantId);
        }
      } catch (error: any) {
        this.logger.warn(
          `Envoi Logistic du comptage ${v.phase} en échec (réessai au tick suivant) : space ${v.spaceId} / event ${v.eventId} : ${error?.message}`,
        );
        await this.markLogisticDirty(v.spaceId, v.eventId, tenantId, v.phase);
      }
    }
    return pushed;
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
