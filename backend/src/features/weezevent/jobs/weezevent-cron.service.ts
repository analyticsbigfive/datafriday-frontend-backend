import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from '../services/weezevent-sync.service';
import { WeezeventIncrementalSyncService } from '../services/weezevent-incremental-sync.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { integrityCounters } from './integrity-monitor.queries';

@Injectable()
export class WeezeventCronService {
    private readonly logger = new Logger(WeezeventCronService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly syncService: WeezeventSyncService,
        private readonly incrementalSyncService: WeezeventIncrementalSyncService,
        private readonly tenantContext: TenantContextService,
    ) {}

    // BUG-379-02 : la sync des transactions (ex-cron fixe 10 min) et le filet de sécurité
    // d'agrégation live (ex-cron 5 min, fenêtre fausse) vivent désormais dans
    // services/live/ : LiveSyncSchedulerService (cadence par état) et
    // LiveReconciliationCronService (rebuild complet de réconciliation).

    /**
     * Sync events INCREMENTALLY - daily at 3 AM
     * Only syncs new/updated events
     */
    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async syncReferenceData(): Promise<void> {
        // Parcours de tous les tenants Weezevent : transverse par construction.
        await this.tenantContext.runWithoutTenantScope(() => this.runReferenceDataSync());
    }

    private async runReferenceDataSync(): Promise<void> {
        this.logger.log('🔄 CRON: Starting INCREMENTAL reference data sync...');

        const tenants = await this.getWeezeventEnabledTenants();

        for (const tenant of tenants) {
            // Chaque tenant dans son propre contexte : isolation Prisma automatique.
            // eslint-disable-next-line no-await-in-loop -- synchro tenant par tenant et intégration par intégration, pour ménager l'API Weezevent
            await this.tenantContext.runForTenant(tenant.id, async () => {
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
                    // eslint-disable-next-line no-await-in-loop -- synchro tenant par tenant et intégration par intégration, pour ménager l'API Weezevent
                    const eventsResult = await this.incrementalSyncService.syncEventsIncremental(tenant.id, integration.id, {
                        batchSize: 500,
                        maxItems: 10000,
                    });
                    this.logger.log(
                        `✅ Tenant ${tenant.id} [${integration.id}]: ${eventsResult.isIncremental ? 'INCREMENTAL' : 'FULL'} events - ${eventsResult.itemsSynced} synced (${eventsResult.itemsSkipped} skipped)`,
                    );

                    // Sync products (use existing service - products are usually fewer)
                    // eslint-disable-next-line no-await-in-loop -- synchro tenant par tenant et intégration par intégration, pour ménager l'API Weezevent
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
            });
        }

        this.logger.log('🔄 CRON: INCREMENTAL reference data sync completed');
    }

    /**
     * Full historical sync weekly (Sunday at 2 AM)
     * Forces a complete resync to catch any missed data
     */
    @Cron('0 2 * * 0') // Sunday at 2 AM
    async fullHistoricalSync(): Promise<void> {
        // Parcours de tous les tenants Weezevent : transverse par construction.
        await this.tenantContext.runWithoutTenantScope(() => this.runFullHistoricalSync());
    }

    private async runFullHistoricalSync(): Promise<void> {
        this.logger.log('🔄 CRON: Starting weekly FULL historical sync...');

        const tenants = await this.getWeezeventEnabledTenants();

        for (const tenant of tenants) {
            // Chaque tenant dans son propre contexte : isolation Prisma automatique.
            // eslint-disable-next-line no-await-in-loop -- synchro tenant par tenant et intégration par intégration, pour ménager l'API Weezevent
            await this.tenantContext.runForTenant(tenant.id, async () => {
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
                    // eslint-disable-next-line no-await-in-loop -- synchro tenant par tenant et intégration par intégration, pour ménager l'API Weezevent
                    const eventsResult = await this.incrementalSyncService.syncEventsIncremental(tenant.id, integration.id, {
                        forceFullSync: true,
                        batchSize: 1000,
                        maxItems: 50000, // Allow more for weekly full sync
                    });

                    this.logger.log(
                        `✅ Tenant ${tenant.id} [${integration.id}]: FULL events sync - ${eventsResult.itemsSynced} synced`,
                    );

                    // Force full sync for transactions (last 30 days)
                    // eslint-disable-next-line no-await-in-loop -- synchro tenant par tenant et intégration par intégration, pour ménager l'API Weezevent
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
            });
        }

        this.logger.log('🔄 CRON: Weekly FULL historical sync completed');
    }

    /**
     * Surveillance quotidienne de l'intégrité Data Integration (la « surveillance synchro »
     * demandée par l'équipe). Logge un récap et alerte (warn) si des incohérences réapparaissent :
     *  - mappings shop dangling (spaceElementId orphelin) → doit rester 0 (FK + reconcile)
     *  - mappings produit vers un MenuItem soft-deleted → doit rester 0 (cleanup au remove())
     *  - doublons WeezeventProduct/Location (même weezeventId sous plusieurs intégrations)
     */
    @Cron('0 6 * * *')
    async monitorDataIntegrationIntegrity(): Promise<void> {
        // Compteurs globaux de surveillance, multi-tenant par conception.
        await this.tenantContext.runWithoutTenantScope(() => this.runIntegrityMonitor());
    }

    private async runIntegrityMonitor(): Promise<void> {
        try {
            const c = await integrityCounters(this.prisma);
            const dangling = c.danglingShopElement;
            const locDangling = c.danglingShopLocation;
            const deadItems = c.mappingsToDeletedMenuItem;
            const dProd = c.duplicateProductGroups;
            const dLoc = c.duplicateLocationGroups;
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
}
