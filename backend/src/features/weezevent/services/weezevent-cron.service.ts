import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from './weezevent-sync.service';
import { WeezeventIncrementalSyncService } from './weezevent-incremental-sync.service';
import { SyncTrackerService } from './sync-tracker.service';
import { QueueService } from '../../../core/queue/queue.service';

@Injectable()
export class WeezeventCronService implements OnModuleInit {
    private readonly logger = new Logger(WeezeventCronService.name);
    private isEnabled = true;

    // BUG-109 : filet de sécurité pour le déclenchement post-webhook (WebhookEventHandler.
    // triggerLiveAggregation) — combien d'heures après la fin d'un event on continue de le
    // considérer "en direct" pour la re-agrégation (couvre un règlement tardif/webhook manqué).
    private readonly LIVE_AGGREGATION_GRACE_HOURS = 3;

    constructor(
        private readonly prisma: PrismaService,
        private readonly syncService: WeezeventSyncService,
        private readonly incrementalSyncService: WeezeventIncrementalSyncService,
        private readonly syncTracker: SyncTrackerService,
        private readonly queueService: QueueService,
    ) {}

    onModuleInit() {
        // Check if CRON is enabled via env variable
        this.isEnabled = process.env.WEEZEVENT_CRON_ENABLED !== 'false';
        this.logger.log(`Weezevent CRON jobs ${this.isEnabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Sync transactions every 10 minutes - INCREMENTAL
     * Only syncs new transactions since last sync
     */
    @Cron(CronExpression.EVERY_10_MINUTES)
    async syncRecentTransactions(): Promise<void> {
        if (!this.isEnabled) return;

        this.logger.log('🔄 CRON: Starting INCREMENTAL transactions sync...');

        const tenants = await this.getWeezeventEnabledTenants();

        for (const tenant of tenants) {
            // Get all enabled integrations for this tenant
            const integrations = await this.prisma.integration.findMany({
                // Garde multi-provider (§8 plan Digifood) : ces crons appellent l'API
                // Weezevent — une intégration DIGIFOOD n'a pas de credentials Weezevent.
                // organizationId not null : exclut les intégrations pas encore/plus complètement
                // configurées — sans ce filtre, syncTransactionsIncremental/syncEventsIncremental
                // lève "organizationId not configured" à chaque passage cron pour ces
                // intégrations, indéfiniment (BUG-123-02).
                where: { tenantId: tenant.id, enabled: true, provider: 'WEEZEVENT', weezevent: { organizationId: { not: null } } },
                select: { id: true },
            });

            for (const integration of integrations) {
            // BUG-027 (corrigé) : la garde anti-double-run n'appelait jamais startSync/completeSync/
            // failSync — getRunningSyncs() était donc toujours vide et cette condition ne bloquait
            // jamais rien. Câblée ci-dessous, scopée par intégration (pas seulement par tenant) pour
            // qu'un tenant multi-intégrations (cf. BUG-025) puisse syncer ses intégrations en parallèle.
            if (this.syncTracker.isRunning(tenant.id, 'transactions', integration.id)) {
                this.logger.warn(`Skipping tenant ${tenant.id}/integration ${integration.id} - transactions sync already running`);
                continue;
            }

            const jobId = this.syncTracker.startSync(tenant.id, 'transactions', integration.id);
            try {
                // Use incremental sync - only fetches NEW transactions
                const result = await this.incrementalSyncService.syncTransactionsIncremental(tenant.id, integration.id, {
                    batchSize: 500,
                    maxItems: 5000, // Limit per run to prevent overload
                });

                this.logger.log(
                    `✅ Tenant ${tenant.id} [${integration.id}]: ${result.isIncremental ? 'INCREMENTAL' : 'FULL'} - ${result.itemsSynced} transactions (${result.itemsCreated} new, ${result.itemsSkipped} skipped) in ${result.duration}ms`,
                );

                // If there's more data, log it
                if (result.hasMore) {
                    this.logger.warn(`⚠️ Tenant ${tenant.id} [${integration.id}]: More transactions available, will continue next run`);
                }
                this.syncTracker.completeSync(jobId);
            } catch (error) {
                this.logger.error(
                    `❌ Tenant ${tenant.id} [${integration.id}]: transactions sync failed - ${error.message}`,
                );
                this.syncTracker.failSync(jobId, error.message);
            }
            }
        }

        this.logger.log('🔄 CRON: INCREMENTAL transactions sync completed');
    }

    /**
     * BUG-109 — filet de sécurité pour l'agrégation live : re-déclenche queueAggregationJob()
     * pour tout event actuellement "en direct" (fenêtre event ± marge), au cas où le
     * déclenchement post-webhook (WebhookEventHandler.triggerLiveAggregation) aurait échoué ou
     * été manqué pour cet event depuis le dernier passage. executeProcessEvents est idempotent
     * (delete-then-insert par event, cf. BUG-019) — un appel redondant toutes les 5 min ne
     * duplique rien, il rattrape juste un webhook manqué.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async triggerLiveAggregationSafetyNet(): Promise<void> {
        if (!this.isEnabled) return;

        const now = new Date();
        const tenants = await this.getWeezeventEnabledTenants();

        for (const tenant of tenants) {
            // Bornée à 7 jours en DB (perf) — le filtre de grâce précis (quelques heures) est
            // appliqué ensuite en mémoire, cf. LIVE_AGGREGATION_GRACE_HOURS.
            const recentEvents = await this.prisma.event.findMany({
                where: {
                    tenantId: tenant.id,
                    spaceId: { not: null },
                    eventDate: { lte: now, gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
                },
                select: { id: true, spaceId: true, eventDate: true, eventEndDate: true },
            });

            const liveEvents = recentEvents.filter((e) => {
                const windowEnd = e.eventEndDate ?? e.eventDate;
                const graceEnd = new Date(windowEnd.getTime() + this.LIVE_AGGREGATION_GRACE_HOURS * 60 * 60 * 1000);
                return now <= graceEnd;
            });
            if (!liveEvents.length) continue;

            // Un job par space (pas par event) — process-events accepte une liste d'eventIds.
            const eventIdsBySpace = new Map<string, string[]>();
            for (const e of liveEvents) {
                const list = eventIdsBySpace.get(e.spaceId as string) ?? [];
                list.push(e.id);
                eventIdsBySpace.set(e.spaceId as string, list);
            }

            for (const [spaceId, eventIds] of eventIdsBySpace) {
                try {
                    const events = liveEvents.filter((e) => e.spaceId === spaceId);
                    const dates = events.map((e) => e.eventDate).sort((a, b) => a.getTime() - b.getTime());
                    const jobLog = await this.prisma.aggregationJobLog.create({
                        data: {
                            tenantId: tenant.id,
                            spaceId,
                            jobType: 'incremental',
                            status: 'pending',
                            fromDate: dates[0],
                            toDate: dates[dates.length - 1],
                            metadata: { eventIds, trigger: 'live-safety-net' },
                        },
                    });
                    await this.queueService.queueAggregationJob({
                        type: 'process-events',
                        tenantId: tenant.id,
                        spaceId,
                        jobLogId: jobLog.id,
                        eventIds,
                    });
                } catch (error) {
                    this.logger.warn(
                        `Live aggregation safety net failed for tenant ${tenant.id}/space ${spaceId}: ${error.message}`,
                    );
                }
            }
        }
    }

    /**
     * Sync events INCREMENTALLY - daily at 3 AM
     * Only syncs new/updated events
     */
    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async syncReferenceData(): Promise<void> {
        if (!this.isEnabled) return;

        this.logger.log('🔄 CRON: Starting INCREMENTAL reference data sync...');

        const tenants = await this.getWeezeventEnabledTenants();

        for (const tenant of tenants) {
            const integrations = await this.prisma.integration.findMany({
                // Garde multi-provider (§8 plan Digifood) : ces crons appellent l'API
                // Weezevent — une intégration DIGIFOOD n'a pas de credentials Weezevent.
                // organizationId not null : exclut les intégrations pas encore/plus complètement
                // configurées — sans ce filtre, syncTransactionsIncremental/syncEventsIncremental
                // lève "organizationId not configured" à chaque passage cron pour ces
                // intégrations, indéfiniment (BUG-123-02).
                where: { tenantId: tenant.id, enabled: true, provider: 'WEEZEVENT', weezevent: { organizationId: { not: null } } },
                select: { id: true },
            });

            for (const integration of integrations) {
            try {
                // Sync events INCREMENTALLY
                const eventsResult = await this.incrementalSyncService.syncEventsIncremental(tenant.id, integration.id, {
                    batchSize: 500,
                    maxItems: 10000,
                });
                this.logger.log(
                    `✅ Tenant ${tenant.id} [${integration.id}]: ${eventsResult.isIncremental ? 'INCREMENTAL' : 'FULL'} events - ${eventsResult.itemsSynced} synced (${eventsResult.itemsSkipped} skipped)`,
                );

                // Sync products (use existing service - products are usually fewer)
                const productsResult = await this.syncService.syncProducts(tenant.id, integration.id);
                this.logger.log(
                    `✅ Tenant ${tenant.id} [${integration.id}]: synced ${productsResult.itemsSynced} products`,
                );
            } catch (error) {
                this.logger.error(
                    `❌ Tenant ${tenant.id} [${integration.id}]: reference data sync failed - ${error.message}`,
                );
            }
            }
        }

        this.logger.log('🔄 CRON: INCREMENTAL reference data sync completed');
    }

    /**
     * Full historical sync weekly (Sunday at 2 AM)
     * Forces a complete resync to catch any missed data
     */
    @Cron('0 2 * * 0') // Sunday at 2 AM
    async fullHistoricalSync(): Promise<void> {
        if (!this.isEnabled) return;

        this.logger.log('🔄 CRON: Starting weekly FULL historical sync...');

        const tenants = await this.getWeezeventEnabledTenants();

        for (const tenant of tenants) {
            const integrations = await this.prisma.integration.findMany({
                // Garde multi-provider (§8 plan Digifood) : ces crons appellent l'API
                // Weezevent — une intégration DIGIFOOD n'a pas de credentials Weezevent.
                // organizationId not null : exclut les intégrations pas encore/plus complètement
                // configurées — sans ce filtre, syncTransactionsIncremental/syncEventsIncremental
                // lève "organizationId not configured" à chaque passage cron pour ces
                // intégrations, indéfiniment (BUG-123-02).
                where: { tenantId: tenant.id, enabled: true, provider: 'WEEZEVENT', weezevent: { organizationId: { not: null } } },
                select: { id: true },
            });

            for (const integration of integrations) {
            try {
                // Force full sync for events (reset incremental state)
                const eventsResult = await this.incrementalSyncService.syncEventsIncremental(tenant.id, integration.id, {
                    forceFullSync: true,
                    batchSize: 1000,
                    maxItems: 50000, // Allow more for weekly full sync
                });

                this.logger.log(
                    `✅ Tenant ${tenant.id} [${integration.id}]: FULL events sync - ${eventsResult.itemsSynced} synced`,
                );

                // Force full sync for transactions (last 30 days)
                const transactionsResult = await this.incrementalSyncService.syncTransactionsIncremental(tenant.id, integration.id, {
                    forceFullSync: true,
                    batchSize: 1000,
                    maxItems: 100000,
                    updatedSince: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                });

                this.logger.log(
                    `✅ Tenant ${tenant.id} [${integration.id}]: FULL transactions sync - ${transactionsResult.itemsSynced} synced`,
                );
            } catch (error) {
                this.logger.error(
                    `❌ Tenant ${tenant.id} [${integration.id}]: full sync failed - ${error.message}`,
                );
            }
            }
        }

        this.logger.log('🔄 CRON: Weekly FULL historical sync completed');
    }

    /**
     * Get all tenants with Weezevent enabled
     */
    /**
     * Surveillance quotidienne de l'intégrité Data Integration (la « surveillance synchro »
     * demandée par l'équipe). Logge un récap et alerte (warn) si des incohérences réapparaissent :
     *  - mappings shop dangling (spaceElementId orphelin) → doit rester 0 (FK + reconcile)
     *  - mappings produit vers un MenuItem soft-deleted → doit rester 0 (cleanup au remove())
     *  - doublons WeezeventProduct/Location (même weezeventId sous plusieurs intégrations)
     */
    @Cron('0 6 * * *')
    async monitorDataIntegrationIntegrity(): Promise<void> {
        if (!this.isEnabled) return;
        try {
            const [danglingShop, locDanglingShop, deadMenuItemMappings, dupProducts, dupLocations] = await Promise.all([
                this.prisma.$queryRaw<{ n: bigint }[]>`
                    SELECT count(*)::bigint AS n FROM "WeezeventLocationShopMapping" m
                    LEFT JOIN "SpaceElement" se ON se.id = m."spaceElementId"
                    WHERE se.id IS NULL`,
                this.prisma.$queryRaw<{ n: bigint }[]>`
                    SELECT count(*)::bigint AS n FROM "WeezeventLocationShopMapping" m
                    LEFT JOIN "WeezeventLocation" l ON l.id = m."weezeventLocationId"
                    WHERE l.id IS NULL`,
                this.prisma.$queryRaw<{ n: bigint }[]>`
                    SELECT count(*)::bigint AS n FROM "WeezeventProductMapping" m
                    JOIN "MenuItem" mi ON mi.id = m."menuItemId"
                    WHERE mi."deletedAt" IS NOT NULL`,
                this.prisma.$queryRaw<{ n: bigint }[]>`
                    SELECT count(*)::bigint AS n FROM (
                      SELECT 1 FROM "WeezeventProduct"
                      GROUP BY "tenantId", "weezeventId" HAVING count(*) > 1) d`,
                this.prisma.$queryRaw<{ n: bigint }[]>`
                    SELECT count(*)::bigint AS n FROM (
                      SELECT 1 FROM "WeezeventLocation"
                      GROUP BY "tenantId", "weezeventId" HAVING count(*) > 1) d`,
            ]);
            const dangling = Number(danglingShop[0]?.n ?? 0);
            const locDangling = Number(locDanglingShop[0]?.n ?? 0);
            const deadItems = Number(deadMenuItemMappings[0]?.n ?? 0);
            const dProd = Number(dupProducts[0]?.n ?? 0);
            const dLoc = Number(dupLocations[0]?.n ?? 0);
            const msg =
                `Data Integration integrity — dangling shop(element)=${dangling}, shop(location)=${locDangling}, ` +
                `mappings→deleted menuItem=${deadItems}, duplicate product groups=${dProd}, ` +
                `duplicate location groups=${dLoc}`;
            // Doublons intégrations/locations = intentionnel (multi-intégrations voulues) → pas d'alerte dessus.
            if (dangling > 0 || locDangling > 0 || deadItems > 0) {
                this.logger.warn(`⚠️ ${msg}`);
            } else {
                this.logger.log(`✅ ${msg}`);
            }
        } catch (err) {
            this.logger.error(`Integrity monitor failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private async getWeezeventEnabledTenants() {
        return this.prisma.tenant.findMany({
            where: {
                weezeventEnabled: true,
                weezeventOrganizationId: { not: null },
                weezeventClientId: { not: null },
                weezeventClientSecret: { not: null },
            },
            select: {
                id: true,
                name: true,
                weezeventOrganizationId: true,
            },
        });
    }

    /**
     * Manual trigger for testing
     */
    async triggerSync(
        tenantId: string,
        integrationId: string,
        type: 'transactions' | 'events' | 'products' | 'full',
        options?: { forceFullSync?: boolean },
    ): Promise<any> {
        this.logger.log(`Manual CRON trigger: ${type} for tenant ${tenantId} [${integrationId}] (forceFullSync: ${options?.forceFullSync || false})`);

        switch (type) {
            case 'transactions':
                return this.incrementalSyncService.syncTransactionsIncremental(tenantId, integrationId, {
                    forceFullSync: options?.forceFullSync,
                    batchSize: 500,
                    maxItems: 10000,
                });
            case 'events':
                return this.incrementalSyncService.syncEventsIncremental(tenantId, integrationId, {
                    forceFullSync: options?.forceFullSync,
                    batchSize: 500,
                    maxItems: 10000,
                });
            case 'products':
                return this.syncService.syncProducts(tenantId, integrationId);
            case 'full': {
                // Full sync for both
                const events = await this.incrementalSyncService.syncEventsIncremental(tenantId, integrationId, {
                    forceFullSync: true,
                    batchSize: 1000,
                    maxItems: 50000,
                });
                const transactions = await this.incrementalSyncService.syncTransactionsIncremental(tenantId, integrationId, {
                    forceFullSync: true,
                    batchSize: 1000,
                    maxItems: 100000,
                });
                return { events, transactions };
            }
        }
    }

    /**
     * Get sync status for a tenant
     */
    async getSyncStatus(tenantId: string) {
        return this.incrementalSyncService.getSyncStatus(tenantId);
    }

    /**
     * Reset sync state (force full sync next time)
     */
    async resetSyncState(tenantId: string, syncType?: string) {
        return this.incrementalSyncService.resetSyncState(tenantId, syncType);
    }
}
