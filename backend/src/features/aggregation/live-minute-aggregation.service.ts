import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { AggregationJobEnqueueData } from '../../core/queue/queue.service';
import { eventBatchCachePatterns } from '../../shared/constants/event-batch-cache';
import { EventDayFields } from '../../shared/utils/event-window.util';
import { livePendingKey, liveWatermarkKey } from '../../shared/constants/live-aggregation';
import { EventWindowResolverService } from './event-window-resolver.service';
import { EventRollupService } from './event-rollup.service';
import { SpaceIntegrationScopeService } from './space-integration-scope.service';
import { BasketAggregationService } from './basket-aggregation.service';
import {
  buildIntegrationClause,
  buildMatchClause,
  buildMinuteClause,
  insertMinuteAggSql,
  insertMinuteItemAggSql,
  isUnscopedRangeWindow,
} from './event-aggregation-sql';

/**
 * BUG-379-02 : agrégation live incrémentale. Ne recalcule que les minutes touchées par les
 * transactions écrites depuis le dernier passage (watermark Redis par event, repli sur
 * Event.calculatedAt posé par le dernier rebuild complet), au lieu de rejouer l'event entier
 * à chaque nouvelle vente (22 à 45 s par run mesurés le 12/09). Les minutes sont déduites des
 * dates réelles des transactions, jamais de l'horloge : un TPE hors ligne qui se resynchronise
 * envoie des ventes datées d'une heure avant.
 */
@Injectable()
export class LiveMinuteAggregationService {
  private readonly logger = new Logger(LiveMinuteAggregationService.name);
  /** Rejoue les transactions écrites juste avant le watermark : un item inséré après sa transaction reste couvert. */
  private static readonly OVERLAP_MS = 60_000;
  private static readonly WATERMARK_TTL_SEC = 3 * 24 * 3600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly windowResolver: EventWindowResolverService,
    private readonly eventRollup: EventRollupService,
    private readonly spaceIntegrationScope: SpaceIntegrationScopeService,
    private readonly basketAgg: BasketAggregationService,
  ) {}

  async execute(job: Job<AggregationJobEnqueueData>) {
    const { tenantId, spaceId, eventIds, integrationId, jobLogId } = job.data;
    await this.prisma.aggregationJobLog.update({ where: { id: jobLogId }, data: { status: 'running' } });
    // Levé au démarrage, pas à la fin : une vente arrivée pendant ce job doit pouvoir en enqueuer un autre.
    await this.redis.delete(livePendingKey(spaceId, integrationId));

    const events = await this.prisma.event.findMany({ where: { tenantId, spaceId, id: { in: eventIds ?? [] } } });
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { timezone: true } });
    const spaceTimezone = space?.timezone || 'Europe/Paris';
    const seasonContainerIds = await this.windowResolver.resolveSeasonContainerEventIds(tenantId);
    const allSpaceEvents: EventDayFields[] = await this.prisma.event.findMany({
      where: { tenantId, spaceId },
      select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true, eventEndTime: true, integrationId: true },
    });
    // BUG-384-02 : même frontière que le rebuild complet (clause de repli + scope du rollup).
    const spaceIntegrationIds = await this.spaceIntegrationScope.resolve(tenantId, spaceId);

    let minutesProcessed = 0;
    const errors: string[] = [];
    try {
      for (const event of events) {
        try {
          minutesProcessed += await this.aggregateEventMinutes({
            tenantId,
            spaceId,
            integrationId,
            event,
            spaceTimezone,
            seasonContainerIds,
            allSpaceEvents,
            spaceIntegrationIds,
          });
        } catch (err) {
          errors.push(`${event.name || event.id}: ${(err as Error).message}`);
        }
      }

      if (minutesProcessed > 0) {
        for (const pattern of eventBatchCachePatterns(tenantId, spaceId)) {
          await this.redis.deletePattern(pattern);
        }
      }

      const existing = await this.prisma.aggregationJobLog.findUnique({ where: { id: jobLogId }, select: { metadata: true } });
      await this.prisma.aggregationJobLog.update({
        where: { id: jobLogId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          transactionsProcessed: minutesProcessed,
          error: errors.length ? errors.join(' | ') : null,
          metadata: { ...((existing?.metadata as object) ?? {}), minutesProcessed, errorCount: errors.length },
        },
      });
    } catch (err) {
      await this.prisma.aggregationJobLog.update({
        where: { id: jobLogId },
        data: { status: 'failed', error: (err as Error).message, completedAt: new Date() },
      });
      throw err;
    }
    return { jobId: jobLogId, minutesProcessed, errors };
  }

  private async aggregateEventMinutes(input: {
    tenantId: string;
    spaceId: string;
    integrationId?: string;
    event: {
      id: string;
      eventDate: Date;
      eventStartDate: Date | null;
      eventEndDate: Date | null;
      eventEndTime: string | null;
      weezeventEventId: string | null;
      integrationId: string | null;
      calculatedAt: Date | null;
      ticketsScanned: number | null;
      ticketsSold: number | null;
    };
    spaceTimezone: string;
    seasonContainerIds: Set<string>;
    allSpaceEvents: EventDayFields[];
    spaceIntegrationIds: string[];
  }): Promise<number> {
    const { tenantId, spaceId, integrationId, event, spaceIntegrationIds } = input;
    const window = this.windowResolver.resolveEventWindow(event, input.spaceTimezone, input.seasonContainerIds, input.allSpaceEvents);
    if (isUnscopedRangeWindow(integrationId, window, spaceIntegrationIds)) {
      throw new Error(`Aucune intégration mappée à l'espace ${spaceId} : event ${event.id} non rattachable (BUG-384-02)`);
    }
    const matchClause = buildMatchClause(window, input.seasonContainerIds);
    const integrationClause = buildIntegrationClause(integrationId, window, spaceIntegrationIds);

    const watermark = await this.readWatermark(event.id, event.calculatedAt);
    const since = watermark ? new Date(watermark.getTime() - LiveMinuteAggregationService.OVERLAP_MS) : null;
    const sinceClause = since ? Prisma.sql`AND t."updatedAt" > ${since}` : Prisma.sql``;

    // Pas de filtre deletedAt : la minute d'une transaction annulée doit être recalculée aussi.
    const touched = await this.prisma.$queryRaw<Array<{ minute: Date; lastUpdatedAt: Date }>>(Prisma.sql`
      SELECT date_trunc('minute', t."transactionDate") AS "minute", MAX(t."updatedAt") AS "lastUpdatedAt"
      FROM "WeezeventTransaction" t
      WHERE t."tenantId" = ${tenantId}
        ${integrationClause}
        AND ${matchClause}
        ${sinceClause}
      GROUP BY 1
    `);
    if (!touched.length) return 0;

    const minutes = touched.map((r) => new Date(r.minute));
    const deleteWhere: Prisma.SpaceRevenueMinuteAggWhereInput = { tenantId, spaceId, weezeventEventId: event.id, minute: { in: minutes } };
    if (window.mode !== 'integration-range' && integrationId) deleteWhere.integrationId = integrationId;
    await this.prisma.spaceRevenueMinuteAgg.deleteMany({ where: deleteWhere });
    await this.prisma.spaceRevenueMinuteItemAgg.deleteMany({ where: deleteWhere as Prisma.SpaceRevenueMinuteItemAggWhereInput });

    const sqlInput = { tenantId, spaceId, eventId: event.id, integrationClause, matchClause, minuteClause: buildMinuteClause(minutes) };
    await this.prisma.$executeRaw(insertMinuteAggSql(sqlInput));
    await this.prisma.$executeRaw(insertMinuteItemAggSql(sqlInput));
    // Paniers pré-agrégés (Analyse) : mêmes minutes touchées, même purge scopée.
    await this.basketAgg.replaceForEvent(deleteWhere as Prisma.SpaceBasketMinuteAggWhereInput, sqlInput);
    await this.eventRollup.refresh(tenantId, spaceId, event, spaceIntegrationIds);

    const newWatermark = touched.reduce((max, r) => (new Date(r.lastUpdatedAt) > max ? new Date(r.lastUpdatedAt) : max), new Date(0));
    await this.redis.set(liveWatermarkKey(event.id), newWatermark.toISOString(), { ttl: LiveMinuteAggregationService.WATERMARK_TTL_SEC });

    this.logger.log(`Live minutes: event ${event.id}, ${minutes.length} minute(s) recomputed since ${since?.toISOString() ?? 'start'}`);
    return minutes.length;
  }

  private async readWatermark(eventId: string, calculatedAt: Date | null): Promise<Date | null> {
    const stored = await this.redis.get<string>(liveWatermarkKey(eventId));
    if (stored) return new Date(stored);
    return calculatedAt;
  }
}
