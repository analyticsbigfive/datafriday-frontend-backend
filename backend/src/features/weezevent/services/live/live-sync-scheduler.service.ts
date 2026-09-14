import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LiveEventWindowService, LiveEvent, LiveGroup } from './live-event-window.service';
import { LiveSyncRunnerService } from './live-sync-runner.service';
import { LiveAggregationTriggerService } from './live-aggregation-trigger.service';
import { WebhookHealthService } from './webhook-health.service';
import { LiveHeartbeatService } from './live-heartbeat.service';
import { LiveSyncCadenceConfig, isQuietPeriod, readCadenceConfig, resolveSyncCadence } from './live-sync-cadence';
import { LiveSyncMode } from './live-heartbeat.service';

interface IntegrationRuntime {
    tenantId: string;
    lastRunAt: Date | null;
    lastSuccessAt: Date | null;
    lastError: string | null;
    consecutiveErrors: number;
    rateLimitedUntil: Date | null;
    /** Dernière sync ayant écrit des ventes : pilote la période calme (60 s au lieu de 10 s). */
    lastNewSalesAt: Date | null;
    inFlight: boolean;
}

/**
 * BUG-379-02 : remplace le cron fixe `syncRecentTransactions` (10 min, 24h/24). La cadence de
 * sync de chaque intégration dépend de son état : event en direct ou non, webhook sain ou non,
 * 429 récent ou non (live-sync-cadence.ts). Après une sync qui a écrit des ventes pendant un
 * event, l'agrégation live par minute est mise en file immédiatement. Ne tourne que dans le
 * worker (WEEZEVENT_CRON_ENABLED, cf. WeezeventCronService).
 */
@Injectable()
export class LiveSyncSchedulerService implements OnModuleInit {
    private readonly logger = new Logger(LiveSyncSchedulerService.name);
    static readonly TICK_MS = 10_000;
    private static readonly LIVE_SNAPSHOT_TTL_MS = 30_000;
    private static readonly INTEGRATIONS_TTL_MS = 60_000;
    private static readonly RATE_LIMIT_BACKOFF_MS = 5 * 60_000;
    /** Pendant un event, pas de sync réussie depuis ce délai = alerte. */
    private static readonly STALE_LIVE_SYNC_MS = 3 * 60_000;

    private enabled = true;
    private cadence: LiveSyncCadenceConfig = readCadenceConfig(process.env);
    private readonly runtime = new Map<string, IntegrationRuntime>();
    private liveSnapshot: { at: number; events: LiveEvent[]; integrationIds: Set<string> } | null = null;
    private integrationsSnapshot: { at: number; rows: Array<{ id: string; tenantId: string }> } | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly liveWindow: LiveEventWindowService,
        private readonly runner: LiveSyncRunnerService,
        private readonly trigger: LiveAggregationTriggerService,
        private readonly webhookHealth: WebhookHealthService,
        private readonly heartbeat: LiveHeartbeatService,
    ) {}

    onModuleInit() {
        this.enabled = process.env.WEEZEVENT_CRON_ENABLED !== 'false';
        this.cadence = readCadenceConfig(process.env);
        this.logger.log(
            `Live sync scheduler ${this.enabled ? 'ENABLED' : 'DISABLED'} (live ${this.cadence.liveIntervalSec}s, quiet ${this.cadence.quietIntervalSec}s after ${this.cadence.quietAfterSec}s, webhook ${this.cadence.liveWithWebhookIntervalSec}s, idle ${this.cadence.idleIntervalSec}s)`,
        );
    }

    @Interval(LiveSyncSchedulerService.TICK_MS)
    async tick(now: Date = new Date()): Promise<void> {
        if (!this.enabled) return;
        try {
            const [live, integrations] = await Promise.all([this.getLiveSnapshot(now), this.getIntegrations(now)]);
            await this.heartbeat.beat('live-sync-scheduler');

            for (const integration of integrations) {
                const state = this.runtimeFor(integration);
                if (state.inFlight) continue;

                const isLive = live.integrationIds.has(integration.id);
                const webhookHealthy = isLive ? await this.webhookHealth.isHealthy(integration.id, now) : false;
                const rateLimited = !!state.rateLimitedUntil && state.rateLimitedUntil > now;
                const quiet = isLive && isQuietPeriod(state.lastNewSalesAt, now, this.cadence);
                const { mode, intervalSec } = resolveSyncCadence({ isLive, webhookHealthy, rateLimited, quiet }, this.cadence);

                const due = !state.lastRunAt || now.getTime() - state.lastRunAt.getTime() >= intervalSec * 1000;
                if (!due) continue;

                state.inFlight = true;
                state.lastRunAt = now;
                void this.runIntegration(integration, state, live, { mode, intervalSec, isLive, now }).finally(() => {
                    state.inFlight = false;
                });
            }
        } catch (err) {
            this.logger.error(`Live sync tick failed: ${(err as Error).message}`);
        }
    }

    private async runIntegration(
        integration: { id: string; tenantId: string },
        state: IntegrationRuntime,
        live: { events: LiveEvent[] },
        ctx: { mode: LiveSyncMode; intervalSec: number; isLive: boolean; now: Date },
    ): Promise<void> {
        const startedAt = new Date();
        let created = 0;
        try {
            const outcome = await this.runner.run(integration.tenantId, integration.id);
            if (outcome.status === 'ok') {
                state.lastSuccessAt = new Date();
                state.lastError = null;
                state.consecutiveErrors = 0;
                state.rateLimitedUntil = null;
                created = outcome.result.itemsCreated + outcome.result.itemsUpdated;
                if (created > 0) state.lastNewSalesAt = ctx.now;
                if (ctx.isLive && created > 0) {
                    await this.queueLiveAggregation(integration, live.events);
                }
            } else if (outcome.status === 'error') {
                state.lastError = outcome.message;
                state.consecutiveErrors += 1;
                if (outcome.rateLimited) {
                    state.rateLimitedUntil = new Date(Date.now() + LiveSyncSchedulerService.RATE_LIMIT_BACKOFF_MS);
                }
                this.logger.error(`Integration ${integration.id}: sync failed (${outcome.message})`);
            } else {
                this.logger.debug(`Integration ${integration.id}: sync skipped (${outcome.reason})`);
            }
        } catch (err) {
            state.lastError = (err as Error).message;
            state.consecutiveErrors += 1;
            this.logger.error(`Integration ${integration.id}: sync crashed (${state.lastError})`);
        }

        await this.heartbeat.writeSyncState(integration.id, {
            mode: ctx.mode,
            intervalSec: ctx.intervalSec,
            lastRunAt: startedAt.toISOString(),
            lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
            lastError: state.lastError,
            lastCreated: created,
            nextRunAt: new Date(startedAt.getTime() + ctx.intervalSec * 1000).toISOString(),
        });

        if (ctx.isLive) await this.alertIfStale(integration.id, state);
    }

    private async queueLiveAggregation(integration: { id: string; tenantId: string }, events: LiveEvent[]): Promise<void> {
        const own = events.filter(
            (e) => e.integrationId === integration.id || (!e.integrationId && e.tenantId === integration.tenantId),
        );
        const groups: LiveGroup[] = LiveEventWindowService.groupBySpaceAndIntegration(own);
        for (const group of groups) {
            try {
                await this.trigger.queueMinuteAggregation(group, 'live-sync');
            } catch (err) {
                this.logger.warn(`Could not queue live aggregation for space ${group.spaceId}: ${(err as Error).message}`);
            }
        }
    }

    private async alertIfStale(integrationId: string, state: IntegrationRuntime): Promise<void> {
        const reference = state.lastSuccessAt ?? state.lastRunAt;
        const stale = !reference || Date.now() - reference.getTime() > LiveSyncSchedulerService.STALE_LIVE_SYNC_MS;
        if (stale || state.consecutiveErrors >= 3) {
            await this.heartbeat.alert(
                `sync:${integrationId}`,
                `Integration ${integrationId} en direct sans sync réussie depuis ${reference?.toISOString() ?? 'jamais'} (${state.consecutiveErrors} erreur(s) consécutive(s), dernière : ${state.lastError ?? 'aucune'})`,
            );
        }
    }

    private runtimeFor(integration: { id: string; tenantId: string }): IntegrationRuntime {
        let state = this.runtime.get(integration.id);
        if (!state) {
            state = {
                tenantId: integration.tenantId,
                lastRunAt: null,
                lastSuccessAt: null,
                lastError: null,
                consecutiveErrors: 0,
                rateLimitedUntil: null,
                lastNewSalesAt: null,
                inFlight: false,
            };
            this.runtime.set(integration.id, state);
        }
        return state;
    }

    private async getLiveSnapshot(now: Date) {
        if (this.liveSnapshot && now.getTime() - this.liveSnapshot.at < LiveSyncSchedulerService.LIVE_SNAPSHOT_TTL_MS) {
            return this.liveSnapshot;
        }
        const events = await this.liveWindow.findLiveEvents(now);
        const integrationIds = await this.liveWindow.findLiveIntegrationIds(events);
        this.liveSnapshot = { at: now.getTime(), events, integrationIds };
        return this.liveSnapshot;
    }

    private async getIntegrations(now: Date) {
        if (this.integrationsSnapshot && now.getTime() - this.integrationsSnapshot.at < LiveSyncSchedulerService.INTEGRATIONS_TTL_MS) {
            return this.integrationsSnapshot.rows;
        }
        // organizationId not null : une intégration incomplète lèverait "organizationId not configured" à chaque passage (BUG-123-02).
        const rows = await this.prisma.integration.findMany({
            where: { enabled: true, provider: 'WEEZEVENT', weezevent: { organizationId: { not: null } }, tenant: { weezeventEnabled: true } },
            select: { id: true, tenantId: true },
        });
        this.integrationsSnapshot = { at: now.getTime(), rows };
        return rows;
    }
}
