import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LiveEventWindowService, LiveEvent } from './live-event-window.service';
import { LiveAggregationTriggerService } from './live-aggregation-trigger.service';
import { LiveHeartbeatService } from './live-heartbeat.service';

/**
 * BUG-379-02 : remplace `triggerLiveAggregationSafetyNet` (rebuild complet toutes les 5 min,
 * dont la fenêtre "live" finissait à 3h du matin). Le rebuild complet devient une
 * réconciliation : toutes les 30 min pendant la fenêtre (annulations, ventes hors ordre, table
 * jour par produit), puis une fois 10 min après la fin déclarée. Le temps réel est porté par
 * le webhook et le polling + jobs minute (LiveSyncSchedulerService).
 */
@Injectable()
export class LiveReconciliationCronService implements OnModuleInit {
    private readonly logger = new Logger(LiveReconciliationCronService.name);
    static readonly RECONCILE_INTERVAL_MS = 30 * 60_000;
    static readonly FINAL_DELAY_MS = 10 * 60_000;
    private enabled = true;

    constructor(
        private readonly liveWindow: LiveEventWindowService,
        private readonly trigger: LiveAggregationTriggerService,
        private readonly heartbeat: LiveHeartbeatService,
    ) {}

    onModuleInit() {
        this.enabled = process.env.WEEZEVENT_CRON_ENABLED !== 'false';
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async run(now: Date = new Date()): Promise<void> {
        if (!this.enabled) return;
        try {
            const events = await this.liveWindow.findLiveEvents(now);
            await this.heartbeat.beat('live-reconciliation');
            const due: LiveEvent[] = [];
            for (const event of events) {
                if (await this.isDue(event, now)) due.push(event);
            }
            for (const group of LiveEventWindowService.groupBySpaceAndIntegration(due)) {
                const trigger = due.some((e) => group.eventIds.includes(e.id) && now >= e.windowEnd) ? 'live-final' : 'live-reconciliation';
                await this.trigger.queueFullRebuild(group, trigger);
            }
        } catch (err) {
            this.logger.error(`Live reconciliation failed: ${(err as Error).message}`);
        }
    }

    private async isDue(event: LiveEvent, now: Date): Promise<boolean> {
        const last = await this.trigger.lastFullRebuildAt(event.id);
        if (now < event.windowEnd) {
            return !last || now.getTime() - last.getTime() >= LiveReconciliationCronService.RECONCILE_INTERVAL_MS;
        }
        const finalAt = new Date(event.windowEnd.getTime() + LiveReconciliationCronService.FINAL_DELAY_MS);
        return now >= finalAt && (!last || last < finalAt);
    }
}
