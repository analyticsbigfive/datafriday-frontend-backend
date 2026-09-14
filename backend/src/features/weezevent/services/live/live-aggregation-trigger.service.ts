import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { QueueService } from '../../../../core/queue/queue.service';
import { RedisService } from '../../../../core/redis/redis.service';
import { LIVE_PENDING_TTL_SEC, liveFullRebuildKey, livePendingKey } from '../../../../shared/constants/live-aggregation';
import { LiveGroup } from './live-event-window.service';

export type LiveTrigger = 'live-sync' | 'webhook-live' | 'live-reconciliation' | 'live-final';

/**
 * BUG-379-02 : point d'entrée unique pour déclencher l'agrégation d'un groupe live.
 * QueueService directement (pas AggregationService) : WeezeventModule → AggregationModule
 * fermerait un cycle de modules, cf. WebhookEventHandler.
 */
@Injectable()
export class LiveAggregationTriggerService {
    private readonly logger = new Logger(LiveAggregationTriggerService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly queueService: QueueService,
        private readonly redis: RedisService,
    ) {}

    /**
     * Job minute coalescé : au plus un job en attente par (space, intégration). Retourne
     * false si un job attend déjà (il couvrira les ventes arrivées entre-temps).
     */
    async queueMinuteAggregation(group: LiveGroup, trigger: LiveTrigger): Promise<boolean> {
        const pendingKey = livePendingKey(group.spaceId, group.integrationId);
        if (await this.redis.has(pendingKey)) return false;
        await this.redis.set(pendingKey, new Date().toISOString(), { ttl: LIVE_PENDING_TTL_SEC });

        try {
            const jobLog = await this.createJobLog(group, 'incremental', trigger);
            await this.queueService.queueAggregationJob({
                type: 'process-event-minutes',
                tenantId: group.tenantId,
                spaceId: group.spaceId,
                jobLogId: jobLog.id,
                eventIds: group.eventIds,
                integrationId: group.integrationId ?? undefined,
            });
            return true;
        } catch (err) {
            await this.redis.delete(pendingKey);
            throw err;
        }
    }

    /** Rebuild complet d'un groupe (réconciliation périodique, fin de fenêtre). */
    async queueFullRebuild(group: LiveGroup, trigger: LiveTrigger): Promise<void> {
        const jobLog = await this.createJobLog(group, 'incremental', trigger);
        await this.queueService.queueAggregationJob({
            type: 'process-events',
            tenantId: group.tenantId,
            spaceId: group.spaceId,
            jobLogId: jobLog.id,
            eventIds: group.eventIds,
            integrationId: group.integrationId ?? undefined,
        });
        for (const eventId of group.eventIds) {
            await this.redis.set(liveFullRebuildKey(eventId), new Date().toISOString(), { ttl: 2 * 24 * 3600 });
        }
        this.logger.log(`Full rebuild queued (${trigger}) for space ${group.spaceId}, events ${group.eventIds.join(',')}`);
    }

    async lastFullRebuildAt(eventId: string): Promise<Date | null> {
        const stored = await this.redis.get<string>(liveFullRebuildKey(eventId));
        return stored ? new Date(stored) : null;
    }

    private async createJobLog(group: LiveGroup, jobType: 'incremental', trigger: LiveTrigger) {
        const events = await this.prisma.event.findMany({
            where: { id: { in: group.eventIds } },
            select: { eventDate: true },
            orderBy: { eventDate: 'asc' },
        });
        const first = events[0]?.eventDate ?? new Date();
        const last = events[events.length - 1]?.eventDate ?? first;
        return this.prisma.aggregationJobLog.create({
            data: {
                tenantId: group.tenantId,
                spaceId: group.spaceId,
                jobType,
                status: 'pending',
                fromDate: first,
                toDate: last,
                metadata: { eventIds: group.eventIds, integrationId: group.integrationId ?? undefined, trigger },
            },
        });
    }
}
