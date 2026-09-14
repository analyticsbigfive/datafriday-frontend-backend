import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { WeezeventIncrementalSyncService, IncrementalSyncResult } from '../weezevent-incremental-sync.service';
import { SyncTrackerService } from '../sync-tracker.service';

export type LiveSyncOutcome =
    | { status: 'skipped'; reason: 'already-running' | 'manual-job-running' }
    | { status: 'ok'; result: IncrementalSyncResult }
    | { status: 'error'; message: string; rateLimited: boolean };

/**
 * Exécute UNE sync incrémentale de transactions pour une intégration, avec les gardes de
 * l'ancien cron : jamais en parallèle d'elle-même (SyncTracker, BUG-027) ni d'une bissection
 * manuelle POST /weezevent/sync/start (WeezeventSyncJob COLLECTING, écritures concurrentes).
 */
@Injectable()
export class LiveSyncRunnerService {
    private readonly logger = new Logger(LiveSyncRunnerService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly incrementalSync: WeezeventIncrementalSyncService,
        private readonly syncTracker: SyncTrackerService,
    ) {}

    async run(tenantId: string, integrationId: string): Promise<LiveSyncOutcome> {
        if (this.syncTracker.isRunning(tenantId, 'transactions', integrationId)) {
            return { status: 'skipped', reason: 'already-running' };
        }
        const manualJob = await this.prisma.weezeventSyncJob.findFirst({
            where: { integrationId, status: 'COLLECTING' },
            select: { id: true },
        });
        if (manualJob) {
            return { status: 'skipped', reason: 'manual-job-running' };
        }

        const jobId = this.syncTracker.startSync(tenantId, 'transactions', integrationId);
        try {
            const result = await this.incrementalSync.syncTransactionsIncremental(tenantId, integrationId, {
                batchSize: 500,
                maxItems: 5000,
            });
            this.syncTracker.completeSync(jobId);
            if (result.hasMore) {
                this.logger.warn(`Integration ${integrationId}: more transactions available, next run will continue`);
            }
            return { status: 'ok', result };
        } catch (error) {
            const message = (error as Error).message ?? String(error);
            this.syncTracker.failSync(jobId, message);
            return { status: 'error', message, rateLimited: /rate limit/i.test(message) };
        }
    }
}
