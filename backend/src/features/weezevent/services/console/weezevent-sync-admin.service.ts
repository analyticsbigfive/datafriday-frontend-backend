import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { WeezeventSyncService } from '../weezevent-sync.service';
import { WeezeventIncrementalSyncService } from '../weezevent-incremental-sync.service';
import { PrismaService } from '../../../../core/database/prisma.service';
import { SyncWeezeventDto } from '../../dto/sync-weezevent.dto';
import { QueueService } from '../../../../core/queue/queue.service';
import { tenantIntegrityCounters } from '../../weezevent-data.queries';
import { WeezeventResetSyncStateQueryDto } from '../../dto/weezevent.query.dto';

/**
 * Synchronisation manuelle, état de synchronisation, intégrité, remise à zéro et purge des données Weezevent.
 */
@Injectable()
export class WeezeventSyncAdminService {
    private readonly logger = new Logger(WeezeventSyncAdminService.name);

    constructor(
        private readonly syncService: WeezeventSyncService,
        private readonly incrementalSyncService: WeezeventIncrementalSyncService,
        private readonly prisma: PrismaService,
        private readonly queueService: QueueService,
    ) { }

    /**
     * Trigger manual synchronization — runs synchronously and returns the result directly.
     * transactions / events / products are executed in-process (no queue).
     * orders / prices / attendees are still queued via BullMQ.
     */
    async syncData(user: any, dto: SyncWeezeventDto) {
        const tenantId = user.tenantId;
        this.logger.log(
            `Manual sync started: type=${dto.type}, tenant=${tenantId}, forceFullSync=${dto.full || false}`,
        );

        const fromDate = dto.fromDate ? new Date(dto.fromDate) : undefined;
        const toDate = dto.toDate ? new Date(dto.toDate) : undefined;

        // Auto-recovery: if DB is empty for this type, force a full sync regardless of dto.full.
        // This fixes the case where data was purged but sync state still has lastSyncedAt set —
        // an incremental sync would skip everything and return 0.
        const autoFullForType = async (type: 'transactions' | 'events' | 'products'): Promise<boolean> => {
            const integrationId = dto.integrationId;
            const counter =
                type === 'transactions' ? this.prisma.salesTransaction.count({ where: { tenantId, integrationId } }) :
                type === 'events' ? this.prisma.salesEvent.count({ where: { tenantId, integrationId } }) :
                this.prisma.salesProduct.count({ where: { tenantId, integrationId } });
            const n = await counter;
            if (n === 0 && !dto.full) {
                this.logger.warn(`Auto full-sync: ${type} DB is empty for tenant ${tenantId}, resetting sync state`);
                await this.incrementalSyncService.resetSyncState(tenantId, integrationId, type).catch(() => undefined);
                return true;
            }
            return Boolean(dto.full);
        };

        switch (dto.type) {
            case 'transactions': {
                const t0 = Date.now();
                const forceFull = await autoFullForType('transactions');
                const result = await this.incrementalSyncService.syncTransactionsIncremental(tenantId, dto.integrationId, {
                    forceFullSync: forceFull,
                    updatedSince: fromDate,
                    updatedUntil: toDate,
                });
                const [count, eventCount, productCount, locationCount] = await Promise.all([
                    this.prisma.salesTransaction.count({ where: { tenantId, integrationId: dto.integrationId } }),
                    this.prisma.salesEvent.count({ where: { tenantId, integrationId: dto.integrationId } }),
                    this.prisma.salesProduct.count({ where: { tenantId, integrationId: dto.integrationId } }),
                    this.prisma.salesLocation.count({ where: { tenantId, integrationId: dto.integrationId } }),
                ]);
                const duration = Date.now() - t0;
                this.logger.log(`Manual sync: transactions done in ${duration}ms — ${result.itemsSynced} synced, total=${count} (events=${eventCount}, products=${productCount}, locations=${locationCount}, hasMore=${result.hasMore})`);
                return { status: 'completed', syncType: 'transactions', count, eventCount, productCount, locationCount, itemsSynced: result.itemsSynced, itemsCreated: result.itemsCreated, hasMore: result.hasMore, duration };
            }

            case 'events': {
                const t0 = Date.now();
                const forceFull = await autoFullForType('events');
                const result = await this.incrementalSyncService.syncEventsIncremental(tenantId, dto.integrationId, {
                    forceFullSync: forceFull,
                });
                const count = await this.prisma.salesEvent.count({ where: { tenantId, integrationId: dto.integrationId } });
                const duration = Date.now() - t0;
                this.logger.log(`Manual sync: events done in ${duration}ms — ${result.itemsSynced} synced, total=${count}`);
                return { status: 'completed', syncType: 'events', count, itemsSynced: result.itemsSynced, itemsCreated: result.itemsCreated, duration };
            }

            case 'products': {
                const t0 = Date.now();
                await autoFullForType('products');
                const result = await this.syncService.syncProducts(tenantId, dto.integrationId);
                const count = await this.prisma.salesProduct.count({ where: { tenantId, integrationId: dto.integrationId } });
                const duration = Date.now() - t0;
                this.logger.log(`Manual sync: products done in ${duration}ms — ${result.itemsSynced} synced, total=${count}`);
                return { status: 'completed', syncType: 'products', count, itemsSynced: result.itemsSynced, itemsCreated: result.itemsCreated, duration };
            }

            case 'orders': {
                if (!dto.eventId) throw new BadRequestException('eventId is required for orders sync');
                const job = await this.queueService.queueWeezeventSyncType(
                    tenantId, 'orders', dto.integrationId, { eventId: dto.eventId },
                );
                return { jobId: job.id, status: 'queued', syncType: 'orders' };
            }

            case 'prices': {
                const job = await this.queueService.queueWeezeventSyncType(
                    tenantId, 'prices', dto.integrationId, { eventId: dto.eventId },
                );
                return { jobId: job.id, status: 'queued', syncType: 'prices' };
            }

            case 'attendees': {
                if (!dto.eventId) throw new BadRequestException('eventId is required for attendees sync');
                const job = await this.queueService.queueWeezeventSyncType(
                    tenantId, 'attendees', dto.integrationId, { eventId: dto.eventId },
                );
                return { jobId: job.id, status: 'queued', syncType: 'attendees' };
            }

            default:
                throw new BadRequestException(`Sync type '${dto.type}' not implemented`);
        }
    }

    /**
     * Get sync status (including incremental state + BullMQ queue stats)
     */
    async getSyncStatus(user: any, integrationId?: string) {
        const tenantId = user.tenantId;

        const [incrementalStatus, transactionCount, eventCount, productCount, queueStats, jobsProgress] =
            await Promise.all([
                this.incrementalSyncService.getSyncStatus(tenantId, integrationId),
                this.prisma.salesTransaction.count({ where: { tenantId, ...(integrationId ? { integrationId } : {}) } }),
                this.prisma.salesEvent.count({ where: { tenantId, ...(integrationId ? { integrationId } : {}) } }),
                this.prisma.salesProduct.count({ where: { tenantId, ...(integrationId ? { integrationId } : {}) } }),
                this.queueService.getQueueStats('data-sync').catch(() => null),
                this.queueService.getActiveJobsProgress('data-sync').catch(() => ({})),
            ]);

        return {
            events: { ...incrementalStatus.events, count: eventCount },
            transactions: { ...incrementalStatus.transactions, count: transactionCount },
            products: { ...incrementalStatus.products, count: productCount },
            // BullMQ queue stats (persistent, survives restarts)
            queue: queueStats,
            // Per-job progress for active jobs: { transactions: 45, events: 10, ... }
            jobsProgress,
        };
    }

    /**
     * État d'intégrité Data Integration du tenant courant — à la demande (le cron quotidien
     * logge l'équivalent global). Permet de VOIR tout de suite si des mappings sont cassés
     * (PDV/Menu Items démappés en silence) sans attendre les logs serveur.
     */
    async getDataIntegrationIntegrity(user: any) {
        const tenantId = user.tenantId;
        const c = await tenantIntegrityCounters(this.prisma, tenantId);
        const shopElementDanglings = c.danglingShopElement;
        const shopLocationDanglings = c.danglingShopLocation;
        const mappingsToDeletedItems = c.mappingsToDeletedMenuItem;
        const spaceLinksToDeletedItems = c.spaceLinksToDeletedMenuItem;
        return {
            tenantId,
            healthy:
                shopElementDanglings === 0 &&
                shopLocationDanglings === 0 &&
                mappingsToDeletedItems === 0 &&
                spaceLinksToDeletedItems === 0,
            shopElementDanglings,
            shopLocationDanglings,
            mappingsToDeletedItems,
            spaceLinksToDeletedItems,
            // Informatif : doublons attendus si multi-intégrations volontaires (pas une alerte).
            duplicateProductGroups: c.duplicateProductGroups,
            duplicateLocationGroups: c.duplicateLocationGroups,
        };
    }

    /**
     * Reset sync state (force full sync next time)
     */
    async resetSyncState(user: any, params: WeezeventResetSyncStateQueryDto) {
        const { integrationId, type: syncType } = params;
        const tenantId = user.tenantId;
        this.logger.log(`Resetting sync state for tenant ${tenantId}${integrationId ? ` (integration: ${integrationId})` : ''}${syncType ? ` (type: ${syncType})` : ''}`);
        
        await this.incrementalSyncService.resetSyncState(tenantId, integrationId, syncType);
        
        return { 
            success: true, 
            message: syncType 
                ? `Sync state reset for ${syncType}` 
                : 'All sync states reset',
        };
    }

    /**
     * Purge all synced Weezevent data for this tenant.
     * Called when removing an integration with the "delete data" option.
     * Deletes in dependency order to respect foreign key constraints.
     */
    async purgeData(user: any, integrationId?: string) {
        const tenantId = user.tenantId;
        const label = integrationId ? `integration ${integrationId}` : `tenant ${tenantId}`;
        this.logger.warn(`Purging all Weezevent data for ${label}`);

        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;

        // WeezeventProductMapping has no integrationId column — filter via relation
        const mappingWhere: any = integrationId
            ? { tenantId, weezeventProduct: { integrationId } }
            : { tenantId };

        // WeezeventTransactionItem has no integrationId column — filter via transaction relation
        const itemWhere: any = integrationId
            ? { transaction: { tenantId, integrationId } }
            : { transaction: { tenantId } };

        // Delete in dependency order (children first)
        const [
            attendees, prices, orders,
            components, variants,
            items, transactions,
            mappings, products,
            merchants, locations, wallets, users, events,
            syncStates,
        ] = await this.prisma.$transaction([
            this.prisma.weezeventAttendee.deleteMany({ where }),
            this.prisma.weezeventPrice.deleteMany({ where }),
            this.prisma.weezeventOrder.deleteMany({ where }),
            this.prisma.salesProductComponent.deleteMany({ where }),
            this.prisma.salesProductVariant.deleteMany({ where }),
            this.prisma.salesTransactionItem.deleteMany({ where: itemWhere }),
            this.prisma.salesTransaction.deleteMany({ where }),
            this.prisma.productMapping.deleteMany({ where: mappingWhere }),
            this.prisma.salesProduct.deleteMany({ where }),
            this.prisma.weezeventMerchant.deleteMany({ where }),
            this.prisma.salesLocation.deleteMany({ where }),
            this.prisma.weezeventWallet.deleteMany({ where }),
            this.prisma.weezeventUser.deleteMany({ where }),
            this.prisma.salesEvent.deleteMany({ where }),
            this.prisma.weezeventSyncState.deleteMany({ where }),
        ]);

        const total =
            attendees.count + prices.count + orders.count +
            components.count + variants.count +
            items.count + transactions.count +
            mappings.count + products.count +
            merchants.count + locations.count + wallets.count + users.count + events.count +
            syncStates.count;

        this.logger.warn(`Purge complete for tenant ${tenantId}: ${total} records deleted`);

        return {
            success: true,
            deleted: {
                events: events.count,
                transactions: transactions.count,
                products: products.count,
                variants: variants.count,
                components: components.count,
                orders: orders.count,
                items: items.count,
                merchants: merchants.count,
                locations: locations.count,
                wallets: wallets.count,
                users: users.count,
                attendees: attendees.count,
                prices: prices.count,
                mappings: mappings.count,
                syncStates: syncStates.count,
                total,
            },
        };
    }
}
