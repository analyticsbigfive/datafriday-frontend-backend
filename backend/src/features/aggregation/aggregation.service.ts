import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../core/database/prisma.service';
import { QueueService, AggregationJobEnqueueData } from '../../core/queue/queue.service';
import { RedisService } from '../../core/redis/redis.service';
import { eventBatchCachePatterns } from '../../shared/constants/event-batch-cache';
import { liveWatermarkKey } from '../../shared/constants/live-aggregation';
import { MappingsService } from '../mappings/mappings.service';
import { EventDayFields } from '../../shared/utils/event-window.util';
import { EventWindowResolverService } from './event-window-resolver.service';
import { EventRollupService } from './event-rollup.service';
import {
  buildIntegrationClause,
  buildMatchClause,
  insertDailyProductAggSql,
  insertMinuteAggSql,
  insertMinuteItemAggSql,
} from './event-aggregation-sql';


@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private mappingsService: MappingsService,
    // BUG-143-01 : RedisService injecté directement (RedisModule est @Global) plutôt que
    // via SpacesService — une dépendance vers SpacesService créerait un cycle de modules.
    private redis: RedisService,
    private windowResolver: EventWindowResolverService,
    private eventRollup: EventRollupService,
  ) {}

  /**
   * Get events with their processing status for a space
   */
  async getEventsTimelineStatus(tenantId: string, spaceId: string, integrationId?: string) {
    this.logger.log(`Getting events timeline status for space ${spaceId}`);

    // Vague 1 — toutes les requêtes indépendantes en parallèle (y compris la résolution des locationIds)
    const now = new Date();
    const [space, events, futureEventsCount, allJobs, dataPointGroups] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId } }),
      this.prisma.event.findMany({
        where: { tenantId, spaceId, eventDate: { lte: now } },
        orderBy: { eventDate: 'desc' },
      }),
      this.prisma.event.count({ where: { tenantId, spaceId, eventDate: { gt: now } } }),
      this.prisma.aggregationJobLog.findMany({
        where: { tenantId, spaceId },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.spaceRevenueMinuteAgg.groupBy({
        by: ['weezeventEventId'],
        where: { tenantId, spaceId },
        _count: { _all: true },
      }),
    ]);

    if (!space) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    const dataPointsByEvent = new Map(
      dataPointGroups.map((g) => [g.weezeventEventId, Number(g._count._all ?? 0)]),
    );

    // Index : event.id → dernier job (allJobs déjà triés desc par startedAt)
    const latestJobByEvent = new Map<string, (typeof allJobs)[0]>();
    for (const job of allJobs) {
      const eventIds: string[] = (job.metadata as any)?.eventIds || [];
      for (const eid of eventIds) {
        if (!latestJobByEvent.has(eid)) {
          latestJobByEvent.set(eid, job);
        }
      }
    }

    const eventsWithStatus = events.map((event) => {
      const job = latestJobByEvent.get(event.id);
      const dataPoints = dataPointsByEvent.get(event.id) ?? 0;
      // BUG-367-02 : un job "completed" en historique ne veut plus rien dire une fois les
      // données réelles purgées (Démapper, BUG-366-02) — affichait "Agrégé" à côté de "—" data
      // points, contradiction visuelle constatée par l'utilisateur. Le statut suit désormais
      // aussi l'état ACTUEL des données, pas seulement le dernier job en historique.
      const aggregationStatus = job?.status === 'completed' && dataPoints === 0 ? 'pending' : (job?.status || 'pending');
      return {
        ...event,
        aggregationStatus,
        lastProcessedAt: job?.completedAt || null,
        transactionsProcessed: job?.transactionsProcessed || 0,
        dataPoints,
      };
    });

    // Vague 2 — unregisteredDates et transactionStats sont indépendants → parallèle
    // Filtre par integrationId uniquement : suppression du tableau de 100+ locationIds en paramètre
    let unregisteredDates: any[] = [];
    let transactionStats: {
      total: number;
      matched: number;
      unmatched: number;
      unmappedLocationIds: string[];
    } | null = null;

    if (integrationId) {
      const integrationFilter = Prisma.sql`AND t."integrationId" = ${integrationId}`;
      const eventDates = events.map((e) => new Date(e.eventDate).toISOString().slice(0, 10));

      const [transactionDates, totalRow, unmappedRows] = await Promise.all([
        this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT
            DATE(t."transactionDate") as "date",
            COUNT(*)::int as "transactionCount",
            SUM(t."amount")::float as "revenue"
          FROM "WeezeventTransaction" t
          WHERE t."tenantId" = ${tenantId}
            ${integrationFilter}
            AND DATE(t."transactionDate") NOT IN (
              -- BUG-368-02 : un Event qui déclare explicitement SON intégration ne peut plus
              -- "couvrir" par coïncidence de date les transactions d'une AUTRE intégration du
              -- même space (ex. SFP-Montauban ne couvre plus les transactions PFC du 06/09
              -- s'il n'existe aucun event PFC ce jour-là) — les events legacy sans
              -- integrationId gardent l'ancien comportement (coïncidence de date seule).
              SELECT DATE(e."eventDate") FROM "Event" e
              WHERE e."tenantId" = ${tenantId} AND e."spaceId" = ${spaceId}
                AND (e."integrationId" IS NULL OR e."integrationId" = ${integrationId})
            )
          GROUP BY DATE(t."transactionDate")
          ORDER BY DATE(t."transactionDate") DESC
        `),
        eventDates.length > 0
          ? this.prisma.$queryRaw<Array<{ total: bigint; matched: bigint }>>(Prisma.sql`
              SELECT
                COUNT(*)::bigint as total,
                COUNT(*) FILTER (
                  WHERE DATE(t."transactionDate") = ANY(ARRAY[${Prisma.join(eventDates)}]::date[])
                )::bigint as matched
              FROM "WeezeventTransaction" t
              WHERE t."tenantId" = ${tenantId}
                ${integrationFilter}
            `)
          : this.prisma.$queryRaw<Array<{ total: bigint; matched: bigint }>>(Prisma.sql`
              SELECT COUNT(*)::bigint as total, 0::bigint as matched
              FROM "WeezeventTransaction" t
              WHERE t."tenantId" = ${tenantId}
                ${integrationFilter}
            `),
        this.prisma.$queryRaw<Array<{ locationId: string }>>(Prisma.sql`
          SELECT DISTINCT t."locationId"
          FROM "WeezeventTransaction" t
          LEFT JOIN "WeezeventLocationShopMapping" m
            ON m."tenantId" = ${tenantId}
            AND m."weezeventLocationId" = t."locationId"
          WHERE t."tenantId" = ${tenantId}
            ${integrationFilter}
            AND t."locationId" IS NOT NULL
            AND m."id" IS NULL
        `),
      ]);

      unregisteredDates = transactionDates;
      const total = Number(totalRow[0]?.total ?? 0);
      const matched = Number(totalRow[0]?.matched ?? 0);
      transactionStats = {
        total,
        matched,
        unmatched: total - matched,
        unmappedLocationIds: unmappedRows.map((r) => r.locationId),
      };
    }

    return {
      events: eventsWithStatus,
      unregisteredDates,
      futureEventsCount,
      transactionStats,
      summary: {
        total: events.length,
        processed: eventsWithStatus.filter((e) => e.aggregationStatus === 'completed').length,
        skipped: eventsWithStatus.filter((e) => e.aggregationStatus === 'skipped').length,
        pending: eventsWithStatus.filter((e) => e.aggregationStatus === 'pending').length,
        failed: eventsWithStatus.filter((e) => e.aggregationStatus === 'failed').length,
      },
    };
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
    await job.updateProgress(0);

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
          throw new Error(`Integration ${integrationId} is not mapped to any space. Complete step 1 of the wizard.`);
        }
        if (spaceLink.spaceId !== spaceId) {
          throw new Error(`Integration ${integrationId} is mapped to a different space (${spaceLink.spaceId}).`);
        }
      }

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

          const integrationClause = buildIntegrationClause(integrationId, window);
          const sqlInput = { tenantId, spaceId, eventId: event.id, integrationClause, matchClause };

          // Requêtes partagées avec le job live par minute (event-aggregation-sql.ts).
          const dataPoints = await this.prisma.$executeRaw(insertMinuteAggSql(sqlInput));
          await updateEventSubProgress(1);

          await this.prisma.$executeRaw(insertDailyProductAggSql({ ...sqlInput, eventDate }));
          await updateEventSubProgress(2);

          await this.prisma.$executeRaw(insertMinuteItemAggSql(sqlInput));
          await updateEventSubProgress(3);

          await this.eventRollup.refresh(tenantId, spaceId, event);
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
          results.push({ eventId: event.id, eventName: event.name, status: 'error', error: err.message });
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
        await job.updateProgress(Math.min(Math.round((processedCount / events.length) * 100), 99));
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
      await job.updateProgress(100);

      // BUG-143-01 : les endpoints batch Analyse cachent leurs réponses par event (TTL 6 h
      // pour un event passé) — sans cette purge, une re-agrégation servirait des données
      // périmées jusqu'à expiration. Mêmes motifs que SpacesService.invalidateSpaceCache.
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
              { eventId: we.externalId },
              r.integrationId,
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
   * Synchronize: cleanup + rebuild all aggregation data for a space.
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
   * Nettoie toutes les agrégats du space puis délègue à executeProcessEvents.
   */
  async executeSynchronize(job: Job<AggregationJobEnqueueData>) {
    const { tenantId, spaceId, jobLogId, integrationId } = job.data;
    this.logger.log(`Executing synchronize for space ${spaceId} (LogId: ${jobLogId})`);

    await this.prisma.aggregationJobLog.update({
      where: { id: jobLogId },
      data: { status: 'running' },
    });
    await job.updateProgress(2);

    // Phase 1: cleanup atomique (#9) — scopé par integrationId quand fourni (BUG-318-02) :
    // sinon, synchroniser l'intégration B purgeait aussi la contribution de l'intégration A pour
    // TOUT l'espace, avant de ne reconstruire que celle de B (executeProcessEvents ci-dessous est
    // déjà scopé, voir BUG-317-02).
    const cleanupWhere: any = { tenantId, spaceId };
    if (integrationId) cleanupWhere.integrationId = integrationId;
    await this.prisma.$transaction([
      this.prisma.spaceRevenueMinuteAgg.deleteMany({ where: cleanupWhere }),
      this.prisma.spaceProductRevenueDailyAgg.deleteMany({ where: cleanupWhere }),
      this.prisma.spaceRevenueMinuteItemAgg.deleteMany({ where: cleanupWhere }),
    ]);
    await job.updateProgress(5);

    // Phase 2: retraitement (executeProcessEvents gère le job log status + progression)
    const result = await this.executeProcessEvents(job);

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

  /**
   * #10 — Contexte complet du step 4 en un seul appel.
   * Bundle : timeline + transactionStats + weezeventEvents + hasMappings.
   * Remplace les 7 appels séparés du mounted() du wizard.
   *
   * BUG-029 (corrigé) : hasMappings comptait tous les LocationShopMapping du TENANT entier, sans
   * scoping par intégration — une intégration B sans aucun mapping affichait hasMappings:true dès
   * qu'une intégration A du même tenant en avait un. Délègue maintenant à
   * MappingsService.hasShopMappingForIntegration, la même source utilisée par le wizard de mapping
   * (BUG-017), pour ne plus jamais diverger. Sans integrationId (legacy, paramètre optionnel),
   * conserve l'ancien comportement tenant-wide en repli.
   */
  async getStep4Context(tenantId: string, spaceId: string, integrationId?: string) {
    const [timeline, weezeventEvents, hasMappings, seasonContainerIds] = await Promise.all([
      this.getEventsTimelineStatus(tenantId, spaceId, integrationId),
      integrationId
        ? this.prisma.salesEvent.findMany({
            where: { tenantId, integrationId },
            orderBy: { startDate: 'asc' },
          })
        : Promise.resolve([]),
      integrationId
        ? this.mappingsService.hasShopMappingForIntegration(tenantId, integrationId)
        : this.prisma.locationShopMapping.count({ where: { tenantId } }).then((count) => count > 0),
      this.windowResolver.resolveSeasonContainerEventIds(tenantId),
    ]);

    // BUG-358/338-02 : un WeezeventEvent "conteneur" (saison Weezevent groupée sous un seul id,
    // ou site Digifood) ne désigne jamais un match précis — le signaler pour que le front n'en
    // fasse pas un candidat "Créer et lier tout" (créerait un faux Event DataFriday de plusieurs
    // mois, cf. docs/bugs/361_02).
    const weezeventEventsWithFlag = weezeventEvents.map((we) => ({
      ...we,
      isSeasonContainer: seasonContainerIds.has(we.id),
    }));

    return {
      ...timeline,
      weezeventEvents: weezeventEventsWithFlag,
      hasMappings,
    };
  }

  /**
   * Breakdown par shops et articles pour un événement donné.
   * Shops : depuis SpaceRevenueMinuteAgg (a weezeventEventId) — agrégé sur toutes les minutes.
   * Articles : depuis SpaceProductRevenueDailyAgg filtré par date de l'événement
   *            (le modèle n'a pas de weezeventEventId — on filtre par day).
   */
  async getEventBreakdown(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const eventDay = new Date(event.eventDate);
    eventDay.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(eventDay);
    nextDay.setDate(nextDay.getDate() + 1);

    const [shopAggs, productAggs] = await Promise.all([
      this.prisma.spaceRevenueMinuteAgg.groupBy({
        by: ['weezeventLocationId', 'spaceElementId'],
        where: { tenantId, spaceId, weezeventEventId: eventId },
        _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      }),
      this.prisma.spaceProductRevenueDailyAgg.groupBy({
        by: ['weezeventProductId'],
        where: { tenantId, spaceId, day: { gte: eventDay, lt: nextDay } },
        _sum: { revenueHt: true, quantity: true },
      }),
    ]);

    // Resolve human-readable names for shops and products
    const locationIds = shopAggs.map((s) => s.weezeventLocationId).filter(Boolean) as string[];
    const productIds = productAggs.map((p) => p.weezeventProductId).filter(Boolean) as string[];

    const [locations, products] = await Promise.all([
      locationIds.length
        ? this.prisma.salesLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true } })
        : [],
      productIds.length
        ? this.prisma.salesProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
        : [],
    ]);

    const locationNameMap = new Map(locations.map((l) => [l.id, l.name] as [string, string]));
    const productNameMap = new Map(products.map((p) => [p.id, p.name] as [string, string]));

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      shops: shopAggs.map((s) => ({
        weezeventLocationId: s.weezeventLocationId,
        spaceElementId: s.spaceElementId,
        shopName: s.weezeventLocationId
          ? (locationNameMap.get(s.weezeventLocationId) ?? s.weezeventLocationId)
          : 'Inconnu',
        revenueHt: Number(s._sum.revenueHt ?? 0),
        transactionsCount: s._sum.transactionsCount ?? 0,
        itemsCount: s._sum.itemsCount ?? 0,
      })),
      products: productAggs.map((p) => ({
        weezeventProductId: p.weezeventProductId,
        productName: productNameMap.get(p.weezeventProductId) ?? p.weezeventProductId,
        revenueHt: Number(p._sum.revenueHt ?? 0),
        quantity: p._sum.quantity ?? 0,
      })),
    };
  }

  /**
   * Statistiques agrégées (totaux) pour un événement donné.
   */
  async getEventStats(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const agg = await this.prisma.spaceRevenueMinuteAgg.aggregate({
      where: { tenantId, spaceId, weezeventEventId: eventId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      _count: { _all: true },
    });

    const shopCount = await this.prisma.spaceRevenueMinuteAgg.findMany({
      where: { tenantId, spaceId, weezeventEventId: eventId, weezeventLocationId: { not: null } },
      select: { weezeventLocationId: true },
      distinct: ['weezeventLocationId'],
    });

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      revenueHt: Number(agg._sum.revenueHt ?? 0),
      transactionsCount: agg._sum.transactionsCount ?? 0,
      itemsCount: agg._sum.itemsCount ?? 0,
      shopCount: shopCount.length,
      aggregationRecords: agg._count._all,
    };
  }

  /**
   * CA par minute pour un événement — alimente l'onglet "CA / minute" dans le détail event.
   * Retourne chaque minute avec au moins 1 transaction, ordonnée chronologiquement.
   */
  async getEventMinuteChart(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const rows = await this.prisma.spaceRevenueMinuteAgg.groupBy({
      by: ['minute'],
      where: { tenantId, spaceId, weezeventEventId: eventId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      orderBy: { minute: 'asc' },
    });

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      data: rows.map((r) => ({
        minute: r.minute,
        revenueHt: Number(r._sum.revenueHt ?? 0),
        transactionsCount: r._sum.transactionsCount ?? 0,
        itemsCount: r._sum.itemsCount ?? 0,
      })),
    };
  }
}
