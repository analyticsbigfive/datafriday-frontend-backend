import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../core/database/prisma.service';
import { QueueService, AggregationJobEnqueueData } from '../../core/queue/queue.service';
import { RedisService } from '../../core/redis/redis.service';
import { eventBatchCachePatterns } from '../../shared/constants/event-batch-cache';
import { liveWatermarkKey } from '../../shared/constants/live-aggregation';
import { EventDayFields } from '../../shared/utils/event-window.util';
import { EventWindowResolverService } from './event-window-resolver.service';
import { EventRollupService } from './event-rollup.service';
import { SpaceIntegrationScopeService } from './space-integration-scope.service';
import { BasketAggregationService } from './basket-aggregation.service';
import { SyncStaleRowsService } from './sync-stale-rows.service';
import {
  buildIntegrationClause,
  buildMatchClause,
  insertDailyProductAgg,
  insertMinuteAgg,
  insertMinuteItemAgg,
  isUnscopedRangeWindow,
} from './event-aggregation.queries';

/**
 * Jobs d'agrégation : mise en file, exécution, synchronisation, suivi, échec et exclusion d'un événement.
 */
@Injectable()
export class AggregationService {
  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private redis: RedisService,
    private windowResolver: EventWindowResolverService,
    private eventRollup: EventRollupService,
    private spaceIntegrationScope: SpaceIntegrationScopeService,
    private basketAgg: BasketAggregationService,
    private syncStaleRows: SyncStaleRowsService,
  ) {}

  private readonly logger = new Logger(AggregationService.name);

  /**
   * Progression BullMQ : purement indicative, le front lit celle d'AggregationJobLog en base.
   * Incident Jean Bouin 2026-10-01 : un Redis saturé (OOM) faisait échouer ce seul appel et
   * interrompait toute la reconstruction. Il ne doit jamais faire échouer le job.
   */
  private async reportProgress(job: Job<AggregationJobEnqueueData>, value: number) {
    try {
      await job.updateProgress(value);
    } catch (err) {
      this.logger.warn(`BullMQ progress ${value}% not recorded (LogId: ${job.data.jobLogId}): ${(err as Error).message}`);
    }
  }

  /**
   * Process events: aggregate transaction data per event.
   * Version BullMQ — crée le job log (pending) et enqueue. Retourne immédiatement.
   * Le traitement réel est effectué par AggregationProcessor → executeProcessEvents().
   */
  async processEvents(tenantId: string, spaceId: string, eventIds?: string[], integrationId?: string) {
    this.logger.log(`Queueing process-events for space ${spaceId}`);

    const where: any = { tenantId, spaceId };
    if (eventIds?.length) where.id = { in: eventIds };

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { eventDate: 'asc' },
    });

    if (events.length === 0) {
      return { processed: 0, total: 0, results: [] };
    }

    const allEventIds = eventIds || events.map((e) => e.id);

    // Pré-création du job log — ID stable pour getJobProgress pendant l'exécution async
    const jobLog = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId,
        jobType: eventIds?.length ? 'incremental' : 'full',
        status: 'pending',
        fromDate: events[0].eventDate,
        toDate: events[events.length - 1].eventDate,
        metadata: { eventIds: allEventIds },
      },
    });

    await this.queueService.queueAggregationJob({
      type: 'process-events',
      tenantId,
      spaceId,
      jobLogId: jobLog.id,
      eventIds: allEventIds,
      integrationId,
    });

    return { jobId: jobLog.id, status: 'queued', total: events.length };
  }

  /** Champs stables du metadata (trigger, integrationId) à préserver à chaque réécriture. */
  private async readJobMetadata(jobLogId: string): Promise<Record<string, unknown>> {
    const row = await this.prisma.aggregationJobLog.findUnique({ where: { id: jobLogId }, select: { metadata: true } });
    const meta = (row?.metadata ?? {}) as Record<string, unknown>;
    const { trigger, integrationId } = meta;
    return { ...(trigger ? { trigger } : {}), ...(integrationId ? { integrationId } : {}) };
  }

  /**
   * Logique d'exécution réelle — appelée par AggregationProcessor.
   * Met à jour AggregationJobLog en DB + progression BullMQ au fil du traitement.
   */
  async executeProcessEvents(job: Job<AggregationJobEnqueueData>) {
    const { tenantId, spaceId, eventIds, integrationId, jobLogId } = job.data;
    this.logger.log(`Executing process-events for space ${spaceId} (LogId: ${jobLogId})`);

    await this.prisma.aggregationJobLog.update({
      where: { id: jobLogId },
      data: { status: 'running' },
    });
    await this.reportProgress(job, 0);

    const where: any = { tenantId, spaceId };
    if (eventIds?.length) where.id = { in: eventIds };

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { eventDate: 'asc' },
    });

    const results: any[] = [];
    let processedCount = 0;

    // BUG-329-02 : nécessaire pour combiner eventEndTime (heure locale) à eventDate/eventEndDate
    // (jours calendaires) via combineDayAndLocalTime.
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { timezone: true } });
    const spaceTimezone = space?.timezone || 'Europe/Paris';

    // BUG-338-02 : calculé UNE fois pour tout le run (pas par event) — un conteneur de saison est
    // le même pour tous les matchs de cette intégration.
    const seasonContainerIds = await this.windowResolver.resolveSeasonContainerEventIds(tenantId);

    // BUG-384-02 : intégrations mappées à CET espace (étape 1 du wizard). Frontière du writer :
    // clause d'intégration de repli quand le job n'en porte pas, scope du rollup, et purge des
    // lignes étrangères déjà écrites (résidu d'un job non scopé — un delete scopé par
    // l'intégration du job, BUG-317-02, ne les touchait jamais).
    const spaceIntegrationIds = await this.spaceIntegrationScope.resolve(tenantId, spaceId);

    // Fiche 147-01 : la frontière de fenêtre (fin déclarée d'un voisin qui se termine le jour de
    // début) a besoin de TOUS les events de l'espace, pas seulement du batch — en re-agrégation
    // incrémentale (`eventIds` fourni), le voisin peut être hors batch.
    const allSpaceEvents: EventDayFields[] = eventIds?.length
      ? await this.prisma.event.findMany({
          where: { tenantId, spaceId },
          select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true, eventEndTime: true, integrationId: true },
        })
      : events;

    try {
      // Step 1 of the wizard saves `integration.id` as `weezeventLocationId` in
      // WeezeventLocationSpaceMapping. We verify the integration is mapped to this space.
      if (integrationId) {
        const spaceLink = await this.prisma.locationSpaceMapping.findFirst({
          where: { tenantId, salesLocationId: integrationId },
        });
        if (!spaceLink) {
          throw new BadRequestException(`Integration ${integrationId} is not mapped to any space. Complete step 1 of the wizard.`);
        }
        if (spaceLink.spaceId !== spaceId) {
          throw new BadRequestException(`Integration ${integrationId} is mapped to a different space (${spaceLink.spaceId}).`);
        }
      }

      // BUG-384-02 : une ligne écrite sous une intégration non mappée à l'espace n'est jamais
      // une contribution légitime — on la purge à chaque job, à l'échelle de l'espace (la
      // table daily n'a pas de clé event).
      const purged = await this.spaceIntegrationScope.purgeForeignRows(tenantId, spaceId, spaceIntegrationIds);
      if (purged) this.logger.warn(`Space ${spaceId}: ${purged} foreign-integration aggregate row(s) purged (BUG-384-02)`);

      // BUG-374-02 (2026-08-26) : `transactionsProcessed`/`job.updateProgress` n'avançaient
      // qu'une fois PAR EVENT ENTIER — pour un clic "Agréger" sur un seul event volumineux
      // (ex. SFP-Cardiff, 27 s de traitement réel pour 6327 transactions), le front restait
      // bloqué sur "Initialisation..." 0% pendant toute la durée, sans aucun mouvement visible.
      // Paliers intermédiaires DANS le traitement d'un event, sans toucher au sens de
      // `transactionsProcessed` (compte d'events ENTIÈREMENT traités, lu ailleurs — pas
      // question d'en changer l'échelle) : `metadata.currentEventStep` porte la progression
      // fine, lue par `getJobProgress` en plus du compte d'events.
      const EVENT_SUB_STEPS = 4;
      const jobMetadata = await this.readJobMetadata(jobLogId);
      const updateEventSubProgress = (step: number) =>
        this.prisma.aggregationJobLog.update({
          where: { id: jobLogId },
          data: {
            metadata: { ...jobMetadata, eventIds: events.map((e) => e.id), currentEventStep: step, currentEventTotalSteps: EVENT_SUB_STEPS },
          },
        });

      for (const event of events) {
        try {
          const eventDate = new Date(event.eventDate);

          // BUG-328/329/330/338-02 + fiche 147-01 : rattachement exact via eventId quand l'Event
          // est lié à un SalesEvent qui n'est pas un conteneur de saison, sinon fenêtre
          // minuit local → fin déclarée (repli journée pleine) avec frontière au voisin —
          // voir resolveEventWindow / resolveEventTransactionWindow.
          const window = this.windowResolver.resolveEventWindow(event, spaceTimezone, seasonContainerIds, allSpaceEvents);
          if (isUnscopedRangeWindow(integrationId, window, spaceIntegrationIds)) {
            throw new BadRequestException(
              `Aucune intégration mappée à l'espace ${spaceId} : l'event ${event.id} (fenêtre de dates seule) ` +
                `ne peut pas être rattaché à des ventes sans agréger tout le tenant (BUG-384-02). Compléter l'étape 1 du wizard.`,
            );
          }
          const matchClause = buildMatchClause(window, seasonContainerIds);

          // Efface les anciennes lignes de cet event avant re-agrégation — scopé par
          // integrationId quand il est fourni (BUG-317-02) : sinon, retraiter l'intégration B
          // effaçait aussi la contribution déjà écrite par l'intégration A pour ce même event
          // partagé (un Event DataFriday est partagé au niveau de l'espace, pas de l'intégration).
          // BUG-372-02 (2026-08-25) : même défaut que resolveSeasonContainerEventIds/matchClause
          // — en mode `integration-range`, c'est `window.integrationId` (celui de L'EVENT,
          // autoritaire) qu'il faut utiliser pour scoper la purge, jamais celui du JOB.
          // BUG-376-02 (2026-08-26) : en mode `integration-range`, ne PAS scoper la purge du
          // tout — un event avec `Event.integrationId` posé appartient désormais EXCLUSIVEMENT
          // à cette intégration (BUG-368-02) ; toute ligne taguée avec une AUTRE intégration
          // pour ce MÊME weezeventEventId est forcément un résidu de l'ancien pipeline (avant
          // que cet event ait son propre `integrationId`), jamais une contribution légitime à
          // "partager". Scoper par `window.integrationId` (comme avant ce fix) préservait ce
          // résidu indéfiniment : re-tagger PFC-Dijon avec son intégration ne purgeait que les
          // vieilles lignes déjà PFC, laissant 869 lignes historiques taguées SFP à côté des
          // nouvelles PFC — 985 points affichés = 869 (garbage) + 116 (vrai), jamais nettoyé.
          const deleteWhere: any = { tenantId, spaceId, weezeventEventId: event.id };
          if (window.mode !== 'integration-range' && integrationId) deleteWhere.integrationId = integrationId;
          await this.prisma.spaceRevenueMinuteAgg.deleteMany({ where: deleteWhere });
          await this.prisma.spaceRevenueMinuteItemAgg.deleteMany({ where: deleteWhere });

          const integrationClause = buildIntegrationClause(integrationId, window, spaceIntegrationIds);
          const sqlInput = { tenantId, spaceId, eventId: event.id, integrationClause, matchClause };

          // Requêtes partagées avec le job live par minute (event-aggregation-sql.ts).
          const dataPoints = await insertMinuteAgg(this.prisma, sqlInput);
          await updateEventSubProgress(1);

          await insertDailyProductAgg(this.prisma, { ...sqlInput, eventDate });
          await updateEventSubProgress(2);

          await insertMinuteItemAgg(this.prisma, sqlInput);
          // Paniers pré-agrégés (Analyse) : même purge scopée, même fenêtre que les tables minute.
          await this.basketAgg.replaceForEvent(deleteWhere, sqlInput);
          await updateEventSubProgress(3);

          await this.eventRollup.refresh(tenantId, spaceId, event, spaceIntegrationIds);
          // Rebuild complet = référence : le job live par minute repart d'ici.
          await this.redis.set(liveWatermarkKey(event.id), new Date().toISOString(), { ttl: 3 * 24 * 3600 });

          processedCount++;
          results.push({
            eventId: event.id, eventName: event.name, date: event.eventDate,
            dataPoints, status: 'success',
            // BUG-372-02 : intégration RÉELLE de cet event (jamais celle du job) — utilisée
            // ci-dessous par le sync auto des présences, qui a le même défaut historique.
            integrationId: window.mode === 'integration-range' ? window.integrationId : integrationId,
          });
        } catch (err) {
          results.push({ eventId: event.id, eventName: event.name, date: event.eventDate, status: 'error', error: err.message });
        }

        // Mise à jour progression DB + BullMQ après chaque event traité — currentEventStep
        // remis à 0 : sinon il resterait au palier du DERNIER `updateEventSubProgress` de CET
        // event pendant que `processedCount` a déjà avancé, faisant surcompter la fraction
        // (BUG-374-02) tant que l'event suivant n'a pas atteint son propre 1er palier.
        await this.prisma.aggregationJobLog.update({
          where: { id: jobLogId },
          data: {
            transactionsProcessed: processedCount,
            metadata: { ...jobMetadata, eventIds: events.map((e) => e.id), currentEventStep: 0, currentEventTotalSteps: EVENT_SUB_STEPS },
          },
        });
        await this.reportProgress(job, Math.min(Math.round((processedCount / events.length) * 100), 99));
      }

      // BUG-375-02 (2026-08-26) : un event en échec individuel (catch ci-dessus) n'empêchait
      // jamais le job de finir "completed" — correct (les autres events du lot doivent quand
      // même s'agréger), mais l'échec restait invisible : `error` n'était renseigné que si le
      // job ENTIER rejetait. Sur un lot de 77 events, un seul en erreur passait inaperçu. On
      // résume les échecs individuels dans `error` sans changer `status` — `getJobProgress` les
      // expose via `errorCount`/`error` pour que le front distingue "tout agrégé" de "agrégé
      // avec des trous".
      const failedResults = results.filter((r) => r.status === 'error');
      await this.prisma.aggregationJobLog.update({
        where: { id: jobLogId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          transactionsProcessed: processedCount,
          error: failedResults.length
            ? failedResults.map((r) => `${r.eventName || r.eventId}: ${r.error}`).join(' | ')
            : null,
          // errorCount à côté de eventIds (reconstruit depuis `events`, identique à la valeur
          // écrite à la création du job) — getJobProgress le lit pour distinguer un lot
          // "entièrement réussi" d'un lot "réussi avec des trous".
          // BUG-379-02 : `trigger` (live-safety-net, webhook-live, ...) doit survivre à cette
          // réécriture, sinon impossible de distinguer un job automatique d'un clic manuel.
          metadata: { ...jobMetadata, eventIds: events.map((e) => e.id), errorCount: failedResults.length },
        },
      });
      if (failedResults.length) {
        this.logger.warn(
          `Aggregation job ${jobLogId}: ${failedResults.length}/${events.length} event(s) failed — ${failedResults
            .map((r) => `${r.eventId} (${r.error})`)
            .join(', ')}`,
        );
      }
      await this.reportProgress(job, 100);

      // BUG-143-01 : les endpoints batch Analyse cachent leurs réponses par event (TTL 6 h
      // pour un event passé) — sans cette purge, une re-agrégation servirait des données
      // périmées jusqu'à expiration. Mêmes motifs que SpaceCacheService.invalidateSpaceCache.
      for (const pattern of eventBatchCachePatterns(tenantId, spaceId)) {
        await this.redis.deletePattern(pattern);
      }

      // Auto-sync attendees for each successfully processed event.
      // Finds the matching WeezeventEvent(s) by date and queues an attendees sync
      // job so that ticketsScanned / perCapita metrics are up to date automatically.
      // BUG-372-02 : `r.integrationId` (celle de CET event, posée ci-dessus) plutôt que celle du
      // job — sinon, cherchait le WeezeventEvent par date dans la MAUVAISE intégration dès que
      // le wizard ouvert diffère du club de l'event, synchronisant les présences du mauvais club
      // (ou aucune) au lieu de celles de l'event réellement traité.
      for (const r of results) {
        if (r.status !== 'success' || !r.integrationId) continue;
        try {
          const eventDate = new Date(r.date);
          const nextDay = new Date(eventDate);
          nextDay.setDate(nextDay.getDate() + 1);
          const weezeventEvents = await this.prisma.salesEvent.findMany({
            where: {
              tenantId,
              integrationId: r.integrationId,
              startDate: { gte: eventDate, lt: nextDay },
            },
            select: { id: true, externalId: true },
          });
          for (const we of weezeventEvents) {
            // BUG : `we.id` est le cuid interne DataFriday du SalesEvent, pas l'id
            // Weezevent réel — l'API attendees (`/events/:eventId/attendees`) attend
            // `externalId`. Avec `we.id`, cette synchro 404 systématiquement, pour
            // n'importe quel event, réel ou simulé (BUG-XXX, cf. docs/bugs/).
            await this.queueService.queueWeezeventSyncType(
              tenantId,
              'attendees',
              r.integrationId,
              { eventId: we.externalId },
            );
            this.logger.log(`Auto-queued attendees sync for WeezeventEvent ${we.externalId} (event ${r.eventId})`);
          }
        } catch (e) {
          // Non-blocking — attendees sync failure must not fail the aggregation job
          this.logger.warn(`Auto-attendees sync skipped for event ${r.eventId}: ${e.message}`);
        }
      }
    } catch (err) {
      await this.prisma.aggregationJobLog.update({
        where: { id: jobLogId },
        data: { status: 'failed', error: err.message, completedAt: new Date() },
      });
      throw err;
    }

    return { jobId: jobLogId, processed: processedCount, total: events.length, results };
  }

  /**
   * Synchronize: rebuild all aggregation data for a space, puis retrait des lignes non réécrites.
   * Version BullMQ — enqueue un job full rebuild. Retourne immédiatement.
   */
  async synchronize(tenantId: string, spaceId: string, integrationId?: string) {
    this.logger.log(`Queueing synchronize for space ${spaceId}`);

    const events = await this.prisma.event.findMany({
      where: { tenantId, spaceId },
      orderBy: { eventDate: 'asc' },
      select: { id: true, eventDate: true },
    });

    const jobLog = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId,
        jobType: 'full',
        status: 'pending',
        fromDate: events[0]?.eventDate ?? new Date(),
        toDate: events[events.length - 1]?.eventDate ?? new Date(),
        metadata: { eventIds: events.map((e) => e.id) },
      },
    });

    await this.queueService.queueAggregationJob({
      type: 'synchronize',
      tenantId,
      spaceId,
      jobLogId: jobLog.id,
      integrationId,
    });

    return { jobId: jobLog.id, status: 'queued' };
  }

  /**
   * Logique de synchronisation réelle — appelée par AggregationProcessor.
   * Délègue la reconstruction à executeProcessEvents puis balaie les lignes périmées.
   */
  async executeSynchronize(job: Job<AggregationJobEnqueueData>) {
    const { tenantId, spaceId, jobLogId, integrationId } = job.data;
    this.logger.log(`Executing synchronize for space ${spaceId} (LogId: ${jobLogId})`);

    await this.prisma.aggregationJobLog.update({
      where: { id: jobLogId },
      data: { status: 'running' },
    });
    await this.reportProgress(job, 2);

    // Incident Jean Bouin 2026-10-01 : plus de purge globale AVANT la reconstruction. Elle vidait
    // l'intégration entière pour l'espace, et un plantage en cours de route (puis chaque relance
    // BullMQ, qui la rejouait) laissait les events non encore retraités sans aucune donnée.
    // executeProcessEvents efface et réécrit déjà chaque event ; le balayage de fin retire le
    // reste, scopé par integrationId quand il est fourni (BUG-318-02).
    const syncStartedAt = await this.syncStaleRows.databaseNow();

    // Phase 1: retraitement (executeProcessEvents gère le job log status + progression)
    const result = await this.executeProcessEvents(job);

    // Phase 2: lignes non réécrites par ce run (events retirés, résidus), events en échec épargnés.
    const failedEvents = result.results
      .filter((r) => r.status === 'error')
      .map((r) => ({ eventId: r.eventId, date: r.date }));
    const swept = await this.syncStaleRows.purge(tenantId, spaceId, integrationId, syncStartedAt, failedEvents);
    if (swept) this.logger.log(`Synchronize ${jobLogId}: ${swept} stale aggregate row(s) removed after rebuild`);

    // Phase 3: résumé
    const summary = await this.prisma.spaceRevenueMinuteAgg.aggregate({
      where: { tenantId, spaceId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      _count: true,
    });

    return {
      ...result,
      summary: {
        totalRevenue: Number(summary._sum.revenueHt || 0),
        totalTransactions: summary._sum.transactionsCount || 0,
        totalItems: summary._sum.itemsCount || 0,
        aggregationRecords: summary._count,
      },
    };
  }

  /**
   * Marque un job log comme failed — utilisé par AggregationProcessor.onFailed.
   * updateMany (pas update) pour ne pas lever d'erreur si le job est déjà completed.
   */
  async markJobLogFailed(jobLogId: string, errorMessage: string) {
    await this.prisma.aggregationJobLog.updateMany({
      where: { id: jobLogId, status: { not: 'completed' } },
      data: { status: 'failed', error: errorMessage, completedAt: new Date() },
    });
  }

  /**
   * Get aggregation job progress — rich response for real-time progress indicator
   */
  async getJobProgress(tenantId: string, jobId: string) {
    const job = await this.prisma.aggregationJobLog.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const eventIds: string[] = (job.metadata as any)?.eventIds || [];
    const total = eventIds.length || 1;
    const current = job.transactionsProcessed || 0;
    // BUG-374-02 : fraction de progression À L'INTÉRIEUR de l'event en cours (paliers posés par
    // `updateEventSubProgress` dans executeProcessEvents) — sans ça, un event volumineux seul
    // dans le lot (`total = 1`) restait bloqué à 0% pendant tout son traitement puis sautait à
    // 100% d'un coup.
    const currentEventStep: number = (job.metadata as any)?.currentEventStep || 0;
    const currentEventTotalSteps: number = (job.metadata as any)?.currentEventTotalSteps || 1;
    const subProgress = job.status === 'running' ? currentEventStep / currentEventTotalSteps : 0;

    const percentage =
      job.status === 'completed' ? 100
      : job.status === 'failed' || job.status === 'skipped' ? 0
      : Math.min(Math.round(((current + subProgress) / total) * 100), 99);

    const elapsedMs = Date.now() - new Date(job.startedAt).getTime();
    const rowsPerSecond = elapsedMs > 0 && current > 0 ? Math.round((current / elapsedMs) * 1000) : 0;
    const estimatedTimeRemaining =
      rowsPerSecond > 0 && current < total
        ? Math.ceil((total - current) / rowsPerSecond)
        : null;

    const phase =
      job.status === 'completed' ? 'Done'
      : job.status === 'failed' ? 'Failed'
      : job.status === 'skipped' ? 'Skipped'
      : currentEventStep > 0 ? `Processing transactions... (${currentEventStep}/${currentEventTotalSteps})`
      : current === 0 ? 'Initializing...'
      : current >= total ? 'Finalizing...'
      : 'Processing transactions...';

    // Count aggregated data points written so far
    const aggregatedPoints = job.spaceId
      ? await this.prisma.spaceRevenueMinuteAgg.count({
          where: {
            tenantId,
            spaceId: job.spaceId,
            weezeventEventId: { in: eventIds.length ? eventIds : undefined },
          },
        })
      : 0;

    return {
      jobId: job.id,
      status: job.status,
      phase,
      percentage,
      current,
      total,
      rowsPerSecond,
      aggregatedPoints,
      estimatedTimeRemaining,
      error: job.error || null,
      // BUG-375-02 : distinct de `status`/`error` — un job `completed` avec `errorCount > 0`
      // a agrégé les autres events du lot mais en a raté un ou plusieurs individuellement.
      errorCount: (job.metadata as any)?.errorCount || 0,
      completedAt: job.completedAt,
    };
  }

  /**
   * Mark an event as skipped — no sales data available or deliberately excluded.
   *
   * BUG-020 (corrigé) : "skipped" doit vouloir dire "aucune donnée" — sans purge, un event
   * traité avec succès puis marqué skip a posteriori gardait ses lignes SpaceRevenueMinuteAgg
   * (dataPoints > 0) sous un statut affiché "Skipped", incohérent pour l'utilisateur. La purge et
   * la création du job log sont dans une transaction pour rester cohérentes en cas d'échec partiel.
   *
   * SpaceProductRevenueDailyAgg n'est volontairement PAS purgée ici : elle est indexée par jour
   * calendaire (pas par eventId — cf. BUG-021/BUG-016), donc purger par date risquerait de
   * supprimer les données d'un second event légitime le même jour sur le même espace.
   */
  async skipEvent(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const [{ count: purgedDataPoints }] = await this.prisma.$transaction([
      this.prisma.spaceRevenueMinuteAgg.deleteMany({
        where: { tenantId, spaceId, weezeventEventId: eventId },
      }),
      this.prisma.aggregationJobLog.create({
        data: {
          tenantId,
          spaceId,
          jobType: 'skip',
          status: 'skipped',
          fromDate: event.eventDate,
          toDate: event.eventDate,
          metadata: { eventIds: [eventId] },
        },
      }),
    ]);

    this.logger.log(
      `Event ${eventId} marked as skipped for space ${spaceId} (purged ${purgedDataPoints} existing data points)`,
    );
    return { eventId, status: 'skipped', purgedDataPoints };
  }
}
