import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { WeezeventSyncService, SyncResult } from './services/weezevent-sync.service';
import { WeezeventIncrementalSyncService, IncrementalSyncResult } from './services/weezevent-incremental-sync.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SyncWeezeventDto } from './dto/sync-weezevent.dto';
import { StartSyncJobDto } from './dto/start-sync-job.dto';
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto';
import { MapProductToMenuItemDto } from './dto/map-product-to-menu-item.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SyncTrackerService } from './services/sync-tracker.service';
import { QueueService } from '../../core/queue/queue.service';
import { WeezeventClientService } from './services/weezevent-client.service';
import { WeezeventCollectWorkerService } from './services/weezevent-collect-worker.service';
import { WeezeventInsertWorkerService } from './services/weezevent-insert-worker.service';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { MenuItemPricingService } from '../../shared/pricing/menu-item-pricing.service';

@ApiTags('Weezevent')
@ApiBearerAuth('supabase-jwt')
@Controller('weezevent')
@UseGuards(JwtDatabaseGuard)
export class WeezeventController {
    private readonly logger = new Logger(WeezeventController.name);

    constructor(
        private readonly syncService: WeezeventSyncService,
        private readonly incrementalSyncService: WeezeventIncrementalSyncService,
        private readonly prisma: PrismaService,
        private readonly syncTracker: SyncTrackerService,
        private readonly queueService: QueueService,
        private readonly weezeventClient: WeezeventClientService,
        private readonly collectWorker: WeezeventCollectWorkerService,
        private readonly insertWorker: WeezeventInsertWorkerService,
        private readonly pricing: MenuItemPricingService,
    ) { }

    /**
     * Get synced transactions from database
     */
    @Get('transactions')
    @ApiOperation({ summary: 'Lister les transactions Weezevent synchronisées' })
    @ApiResponse({ status: 200, description: 'Liste paginée des transactions Weezevent' })
    async getTransactions(
        @CurrentUser() user: any,
        @Query() query: GetTransactionsQueryDto,
    ) {
        const tenantId = user.tenantId;
        const { integrationId, page = 1, perPage = 50, status, fromDate, toDate, eventId, merchantId } = query;

        // BUG-028 : une transaction supprimée côté Weezevent (webhook "delete", deletedAt renseigné)
        // ne doit plus apparaître dans le listing par défaut.
        const where: any = { tenantId, integrationId, deletedAt: null };

        if (status) where.status = status;
        if (eventId) where.eventId = eventId;
        if (merchantId) where.merchantId = merchantId;
        if (fromDate || toDate) {
            where.transactionDate = {};
            if (fromDate) where.transactionDate.gte = new Date(fromDate);
            if (toDate) where.transactionDate.lte = new Date(toDate);
        }

        const [transactions, total] = await Promise.all([
            this.prisma.salesTransaction.findMany({
                where,
                include: {
                    items: {
                        include: {
                            payments: true,
                        },
                    },
                },
                orderBy: { transactionDate: 'desc' },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            this.prisma.salesTransaction.count({ where }),
        ]);

        return {
            data: transactions,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                total_pages: Math.ceil(total / perPage),
            },
        };
    }

    /**
     * Get a single transaction by ID
     */
    @Get('transactions/:id')
    @ApiOperation({ summary: 'Obtenir une transaction Weezevent par ID' })
    @ApiParam({ name: 'id', description: 'ID de la transaction' })
    @ApiResponse({ status: 200, description: 'Transaction Weezevent' })
    async getTransaction(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        const tenantId = user.tenantId;
        return this.prisma.salesTransaction.findFirst({
            where: { id, tenantId },
            include: {
                items: {
                    include: {
                        payments: true,
                    },
                },
                event: true,
                merchant: true,
                location: true,
            },
        });
    }

    /**
     * Fetch transactions DIRECTLY from the Weezevent API (no DB, no sync).
     * Useful for debugging / checking what the real Weezevent data looks like.
     */
    @Get('raw-transactions')
    @ApiOperation({ summary: 'Récupérer les transactions brutes depuis l\'API Weezevent (sans passer par la DB)' })
    @ApiResponse({ status: 200, description: 'Transactions brutes Weezevent' })
    async getRawTransactions(
        @CurrentUser() user: any,
        @Query() query: GetTransactionsQueryDto,
    ) {
        const tenantId = user.tenantId;
        const { integrationId, page = 1, perPage = 100, status, fromDate, toDate } = query;

        const integration = await this.prisma.integration.findUnique({
            where: { id: integrationId },
            select: { id: true, enabled: true, tenantId: true, weezevent: { select: { organizationId: true } } },
        });

        if (!integration || integration.tenantId !== tenantId) {
            throw new BadRequestException(`Intégration Weezevent ${integrationId} introuvable.`);
        }
        if (!integration.weezevent?.organizationId) {
            throw new BadRequestException(`L\'organisation Weezevent n\'est pas configurée pour cette intégration.`);
        }

        return this.weezeventClient.getTransactions(tenantId, integrationId, integration.weezevent.organizationId, {
            page,
            perPage,
            status,
            fromDate: fromDate ? new Date(fromDate) : undefined,
            toDate: toDate ? new Date(toDate) : undefined,
        });
    }

    /**
     * Trigger manual synchronization — runs synchronously and returns the result directly.
     * transactions / events / products are executed in-process (no queue).
     * orders / prices / attendees are still queued via BullMQ.
     */
    @RequirePermissions('menu.integration.fb')
    @Post('sync')
    @ApiOperation({ summary: 'Déclencher une synchronisation Weezevent' })
    @ApiBody({ type: SyncWeezeventDto })
    @ApiResponse({ status: 201, description: 'Synchronisation terminée' })
    async syncData(
        @CurrentUser() user: any,
        @Body() dto: SyncWeezeventDto,
    ) {
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
                if (!dto.eventId) throw new Error('eventId is required for orders sync');
                const job = await this.queueService.queueWeezeventSyncType(
                    tenantId, 'orders', { eventId: dto.eventId },
                );
                return { jobId: job.id, status: 'queued', syncType: 'orders' };
            }

            case 'prices': {
                const job = await this.queueService.queueWeezeventSyncType(
                    tenantId, 'prices', { eventId: dto.eventId },
                );
                return { jobId: job.id, status: 'queued', syncType: 'prices' };
            }

            case 'attendees': {
                if (!dto.eventId) throw new Error('eventId is required for attendees sync');
                const job = await this.queueService.queueWeezeventSyncType(
                    tenantId, 'attendees', { eventId: dto.eventId },
                );
                return { jobId: job.id, status: 'queued', syncType: 'attendees' };
            }

            default:
                throw new Error(`Sync type '${dto.type}' not implemented`);
        }
    }

    /**
     * Get sync status (including incremental state + BullMQ queue stats)
     */
    @Get('sync/status')
    @ApiOperation({ summary: 'Obtenir le statut de synchronisation Weezevent' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'Filtrer par intégration — si omis, retourne les totaux toutes intégrations confondues' })
    @ApiResponse({ status: 200, description: 'Statut des synchronisations Weezevent' })
    async getSyncStatus(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId?: string,
    ) {
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
    @RequirePermissions('menu.integration.fb')
    @Get('integrity')
    @ApiOperation({ summary: "État d'intégrité Data Integration (mappings cassés, doublons) du tenant" })
    @ApiResponse({ status: 200, description: "Compteurs d'intégrité — healthy=true si tout est à 0" })
    async getDataIntegrationIntegrity(@CurrentUser() user: any) {
        const tenantId = user.tenantId;
        // ⚠️ $queryRaw n'est PAS intercepté par l'isolation Prisma (CLS) → scope manuel par tenantId.
        const [elem, loc, deadItems, deadSpaceLinks, dupProd, dupLoc] = await Promise.all([
            this.prisma.$queryRaw<{ n: bigint }[]>`
                SELECT count(*)::bigint AS n FROM "WeezeventLocationShopMapping" m
                LEFT JOIN "SpaceElement" se ON se.id = m."spaceElementId"
                WHERE m."tenantId" = ${tenantId} AND se.id IS NULL`,
            this.prisma.$queryRaw<{ n: bigint }[]>`
                SELECT count(*)::bigint AS n FROM "WeezeventLocationShopMapping" m
                LEFT JOIN "WeezeventLocation" l ON l.id = m."weezeventLocationId"
                WHERE m."tenantId" = ${tenantId} AND l.id IS NULL`,
            this.prisma.$queryRaw<{ n: bigint }[]>`
                SELECT count(*)::bigint AS n FROM "WeezeventProductMapping" m
                JOIN "MenuItem" mi ON mi.id = m."menuItemId"
                WHERE m."tenantId" = ${tenantId} AND mi."deletedAt" IS NOT NULL`,
            // BUG-051 : SpaceMenuItem (prix par espace) orphelin d'un MenuItem soft-deleted —
            // même famille de symptôme que mappingsToDeletedItems ci-dessus, mais côté prix espace.
            this.prisma.$queryRaw<{ n: bigint }[]>`
                SELECT count(*)::bigint AS n FROM "SpaceMenuItem" sm
                JOIN "MenuItem" mi ON mi.id = sm."menuItemId"
                WHERE mi."tenantId" = ${tenantId} AND mi."deletedAt" IS NOT NULL`,
            this.prisma.$queryRaw<{ n: bigint }[]>`
                SELECT count(*)::bigint AS n FROM (
                  SELECT 1 FROM "WeezeventProduct" WHERE "tenantId" = ${tenantId}
                  GROUP BY "weezeventId" HAVING count(*) > 1) d`,
            this.prisma.$queryRaw<{ n: bigint }[]>`
                SELECT count(*)::bigint AS n FROM (
                  SELECT 1 FROM "WeezeventLocation" WHERE "tenantId" = ${tenantId}
                  GROUP BY "weezeventId" HAVING count(*) > 1) d`,
        ]);
        const num = (r: { n: bigint }[]) => Number(r[0]?.n ?? 0);
        const shopElementDanglings = num(elem);
        const shopLocationDanglings = num(loc);
        const mappingsToDeletedItems = num(deadItems);
        const spaceLinksToDeletedItems = num(deadSpaceLinks);
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
            duplicateProductGroups: num(dupProd),
            duplicateLocationGroups: num(dupLoc),
        };
    }

    /**
     * Reset sync state (force full sync next time)
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('sync/state')
    @ApiOperation({ summary: 'Réinitialiser l’état de synchronisation Weezevent' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration à réinitialiser — si omis, réinitialise toutes les intégrations du tenant' })
    @ApiQuery({ name: 'type', required: false, type: String, description: 'Type de sync à réinitialiser : transactions | events | products' })
    @ApiResponse({ status: 200, description: 'État de synchronisation réinitialisé' })
    async resetSyncState(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId?: string,
        @Query('type') syncType?: string,
    ) {
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
    @RequirePermissions('menu.integration.fb')
    @Delete('data')
    @ApiOperation({ summary: 'Supprimer toutes les données Weezevent synchronisées' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'Supprimer uniquement les données de cette intégration — si omis, supprime TOUT le tenant' })
    @ApiResponse({ status: 200, description: 'Données supprimées' })
    async purgeData(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId?: string,
    ) {
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

    /**
     * Get events
     */
    @Get('events')
    @ApiOperation({ summary: 'Lister les événements Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page', example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, description: 'Résultats par page (max 500)', example: 50 })
    @ApiQuery({ name: 'status', required: false, description: 'Statut de l\'événement' })
    @ApiQuery({ name: 'search', required: false, description: 'Recherche dans le nom' })
    @ApiQuery({ name: 'startDateFrom', required: false, description: 'Date de début min (ISO 8601)' })
    @ApiQuery({ name: 'startDateTo', required: false, description: 'Date de début max (ISO 8601)' })
    @ApiResponse({ status: 200, description: 'Liste paginée des événements Weezevent' })
    async getEvents(
        @CurrentUser() user: any,
        @Query('page') page: any = 1,
        @Query('perPage') perPage: any = 50,
        @Query('integrationId') integrationId?: string,
        @Query('status') status?: string,
        @Query('search') search?: string,
        @Query('startDateFrom') startDateFrom?: string,
        @Query('startDateTo') startDateTo?: string,
    ) {
        const tenantId = user.tenantId;
        const p = parseInt(page, 10) || 1;
        const pp = Math.min(parseInt(perPage, 10) || 50, 500);

        // Filters: status (exact, or "all" to skip), name search, date range on startDate
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (status && status !== 'all') {
            where.status = status;
        }
        if (search && search.trim()) {
            where.name = { contains: search.trim(), mode: 'insensitive' };
        }
        if (startDateFrom || startDateTo) {
            where.startDate = {};
            if (startDateFrom) {
                const d = new Date(startDateFrom);
                if (!isNaN(d.getTime())) where.startDate.gte = d;
            }
            if (startDateTo) {
                const d = new Date(startDateTo);
                if (!isNaN(d.getTime())) where.startDate.lte = d;
            }
            if (Object.keys(where.startDate).length === 0) delete where.startDate;
        }

        const [events, total] = await Promise.all([
            this.prisma.salesEvent.findMany({
                where,
                orderBy: { startDate: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.salesEvent.count({ where }),
        ]);

        return {
            data: events,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Get locations
     */
    @Get('locations')
    @ApiOperation({ summary: 'Lister les locations Weezevent synchronisées' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 100 })
    @ApiQuery({ name: 'type', required: false, description: 'Type de location : sale | all — défaut : sale' })
    @ApiResponse({ status: 200, description: 'Liste des locations Weezevent' })
    async getLocations(
        @CurrentUser() user: any,
        @Query('page') page: any = 1,
        @Query('perPage') perPage: any = 100,
        @Query('integrationId') integrationId?: string,
        @Query('type') type?: string,
    ) {
        const tenantId = user.tenantId;
        const p = parseInt(page, 10) || 1;
        const pp = Math.min(parseInt(perPage, 10) || 100, 500);

        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (type === 'all') {
            // no type filter
        } else if (type) {
            where.type = type;
        } else {
            where.type = 'sale'; // default: only physical sales locations
        }

        const [locations, total] = await Promise.all([
            this.prisma.salesLocation.findMany({
                where,
                orderBy: { name: 'asc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.salesLocation.count({ where }),
        ]);

        return {
            data: locations,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Get merchants
     */
    @Get('merchants')
    @ApiOperation({ summary: 'Lister les merchants Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 100 })
    @ApiQuery({ name: 'locationId', required: false, description: 'Filtrer les merchants ayant des transactions à cette location' })
    @ApiResponse({ status: 200, description: 'Liste des merchants Weezevent' })
    async getMerchants(
        @CurrentUser() user: any,
        @Query('page') page: any = 1,
        @Query('perPage') perPage: any = 100,
        @Query('integrationId') integrationId?: string,
        @Query('locationId') locationId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = parseInt(page, 10) || 1;
        const pp = Math.min(parseInt(perPage, 10) || 100, 500);

        // If locationId provided, find merchants via transactions at that location
        if (locationId) {
            const txWhere: any = { tenantId, locationId, merchantId: { not: null } };
            if (integrationId) txWhere.integrationId = integrationId;
            const merchantIds = await this.prisma.salesTransaction.findMany({
                where: txWhere,
                select: { merchantId: true },
                distinct: ['merchantId'],
            });
            const ids = merchantIds.map(m => m.merchantId).filter(Boolean);

            if (ids.length > 0) {
                const mWhere: any = { tenantId, id: { in: ids } };
                if (integrationId) mWhere.integrationId = integrationId;
                const merchants = await this.prisma.weezeventMerchant.findMany({
                    where: mWhere,
                    orderBy: { name: 'asc' },
                });
                return { data: merchants, meta: { total: merchants.length } };
            }
            // Fallback: no transactions at this location yet — return all tenant merchants
        }

        const mWhere2: any = { tenantId };
        if (integrationId) mWhere2.integrationId = integrationId;
        const [merchants, total] = await Promise.all([
            this.prisma.weezeventMerchant.findMany({
                where: mWhere2,
                orderBy: { name: 'asc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventMerchant.count({ where: mWhere2 }),
        ]);

        return {
            data: merchants,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Get products
     */
    /**
     * Le catalogue F&B Weezevent ne porte pas de prix (price événementiel/variable) → basePrice
     * reste null. Le prix réel est dans les ventes : on renvoie ici, PAR PRODUIT, TOUS les prix
     * de vente observés (un par couple unitPrice+vat), chacun avec TTC, HT, taux de TVA et le
     * nombre de ventes, triés par fréquence décroissante (le premier = prix modal).
     * Le `unit_price` Weezevent est TTC (vérifié : payments.amount_vat = TTC − TTC/(1+vat)).
     * → HT = round2(TTC / (1 + vat/100)). Le front décide quoi afficher/utiliser (ex. HT).
     * Requête unique indexée (WeezeventTransactionItem_productId_idx, ~20ms/100 produits) ;
     * scopée par productId (déjà vérifiés côté tenant par l'appelant, le raw n'est pas CLS).
     */
    private deriveSalesPrices(
        tenantId: string,
        productIds: string[],
    ): Promise<Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>> {
        // Source unique : prix modal partagé (réutilisé par l'application du prix aux menu items).
        // Pas de location filter ici → needsJoin=false côté getModalSalesPrices, reste le "fast
        // path" documenté (~20ms/100 produits) : tenantId transmis pour cohérence de signature,
        // sans coût (aucun JOIN déclenché par cet appel).
        return this.pricing.getModalSalesPrices(tenantId, productIds);
    }

    @Get('products')
    @ApiOperation({ summary: 'Lister les produits Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'category', required: false, description: 'Filtrer par catégorie de produit' })
    @ApiQuery({ name: 'spaceId', required: false, description: 'Espace : le prix renvoyé est celui pratiqué DANS cet espace (ventes des locations mappées), pas le basePrice figé du produit. ATTENTION coûteux (cascade de repli espace→weezeventId→nom) — pour un simple filtrage catalogue sans ce coût, utiliser catalogSpaceId.' })
    @ApiQuery({ name: 'onlySold', required: false, description: "true → ne renvoie que les produits ayant un prix (donc réellement vendus) ; masque le bruit du catalogue jamais vendu. Filtré AVANT pagination (BUG-337-02) : `meta.total`/`total_pages` reflètent le compte filtré, `meta.catalogTotal` porte le compte non filtré (pour l'UI 'X produits masqués')." })
    @ApiQuery({ name: 'catalogSpaceId', required: false, description: "Filtre LÉGER le catalogue sur l'intégration Weezevent de cet espace (requête indexée simple), SANS activer la cascade de prix scopée-espace de `spaceId` — le prix reste le prix modal global rapide. Ignoré si `integrationId` ou `spaceId` sont fournis." })
    @ApiResponse({ status: 200, description: 'Liste paginée des produits Weezevent' })
    async getProducts(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('integrationId') integrationId?: string,
        @Query('category') category?: string,
        @Query('spaceId') spaceId?: string,
        @Query('onlySold') onlySold?: string,
        @Query('catalogSpaceId') catalogSpaceId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (category) where.category = category;

        // Scoping léger par espace : filtre le CATALOGUE par l'intégration Weezevent de
        // cet espace (requête indexée simple), sans déclencher la cascade de prix
        // scopée-espace de la branche `spaceId` ci-dessous (coûteuse, cf. son commentaire).
        // Le prix reste dérivé du chemin rapide (deriveSalesPrices) plus bas.
        if (catalogSpaceId && !integrationId && !spaceId) {
            const mapping = await this.prisma.locationSpaceMapping.findFirst({
                where: { tenantId, spaceId: catalogSpaceId },
                select: { salesLocationId: true },
            });
            if (mapping?.salesLocationId) where.integrationId = mapping.salesLocationId;
        }

        // BUG-337-02 (docs/bugs/) : le catalogue COMPLET (pas seulement la page demandée) est
        // chargé ici, requête unique et bon marché (indexée, pas de résolution de prix). Nécessaire
        // pour que `onlySold` filtre AVANT la pagination plutôt qu'après (cf. plus bas) — sinon
        // `total`/`total_pages` restent le décompte non filtré et l'appelant est forcé de boucler
        // sur toutes les pages pour reconstituer la liste réellement vendue (c'était le cas avant ce
        // fix : voir l'ancien commentaire sur `onlySold` ci-dessous, conservé en historique de bug).
        const catalogue = await this.prisma.salesProduct.findMany({ where, orderBy: { name: 'asc' } });
        const catalogTotal = catalogue.length;

        let data: any[];
        if (spaceId) {
            // PRIX DE L'ESPACE : on IGNORE le basePrice figé du produit (non fiable : gelé par un sync)
            // et on lit les ventes DE CET ESPACE (locations mappées) — exactement comme la catégorie
            // est déduite de la nature Weezevent. basePrice = dernier prix non nul de l'espace (même
            // règle que l'apply) ; salesPrices = distribution des prix de l'espace. Aucune vente dans
            // l'espace → on ne prend JAMAIS un prix d'un autre espace (repli sur le catalogue propre).
            //
            // BUG-337-02 (suite, docs/bugs/) : les 3 niveaux de repli (par productId, par item_id
            // Weezevent, par nom) étaient enchaînés SÉQUENTIELLEMENT — chaque niveau ne tournait que
            // sur les produits encore "manquants" du niveau précédent — et chacun (`getSpaceScoped*`)
            // re-résolvait `spaceLocationIds` indépendamment (jusqu'à 4 requêtes redondantes par
            // appel). Même raisonnement que BUG-333-02 (cascade de repli location, mesuré : coût
            // dominé par le JOIN vers WeezeventTransaction, pas par la taille de la liste d'ids) :
            // les 3 niveaux sont indépendants (chacun sa propre clé de correspondance), donc résolus
            // une seule fois pour `spaceLocationIds` puis lancés en PARALLÈLE contre le catalogue
            // complet, fusionnés par priorité (productId > item_id > nom, même ordre qu'avant).
            //
            // Corrigé au passage : le niveau 2 (repli par item_id Weezevent) ne s'était JAMAIS
            // déclenché — il filtrait sur `pr.weezeventId`, un champ qui n'existe pas sur
            // `SalesProduct` (le champ Prisma est `externalId`, `@map("weezeventId")` ne renomme que
            // la colonne DB) — remplacé par `pr.externalId`.
            const spaceLocationIds = await this.pricing.resolveSpaceLocationIds(tenantId, spaceId);
            if (!spaceLocationIds.length) {
                data = catalogue.map((pr: any) => ({ ...pr, priceSource: 'catalog' }));
            } else {
                const allIds = catalogue.map((pr: any) => pr.id);
                const wids = [...new Set(catalogue.map((pr: any) => pr.externalId).filter(Boolean))];
                const names = [...new Set(catalogue.map((pr: any) => pr.name).filter(Boolean))];
                const locOpts = { locationIds: spaceLocationIds };
                const [byId, byIdDist, byWid, byWidDist, byName, byNameDist] = await Promise.all([
                    this.pricing.getLatestSalesPrices(tenantId, allIds, locOpts),
                    this.pricing.getModalSalesPrices(tenantId, allIds, locOpts),
                    wids.length
                        ? this.pricing.getLatestSalesPricesByWeezeventId(tenantId, wids, { integrationId, ...locOpts })
                        : Promise.resolve(new Map<string, { ttc: number; vatRate: number | null }>()),
                    wids.length
                        ? this.pricing.getModalSalesPricesByWeezeventId(tenantId, wids, { integrationId, ...locOpts })
                        : Promise.resolve(new Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>()),
                    names.length
                        ? this.pricing.getLatestSalesPricesByName(tenantId, names, { integrationId, ...locOpts })
                        : Promise.resolve(new Map<string, { ttc: number; vatRate: number | null }>()),
                    names.length
                        ? this.pricing.getModalSalesPricesByName(tenantId, names, { integrationId, ...locOpts })
                        : Promise.resolve(new Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>()),
                ]);
                data = catalogue.map((pr: any) => {
                    const byIdPx = byId.get(pr.id);
                    if (byIdPx && byIdPx.ttc > 0) {
                        return {
                            ...pr,
                            basePrice: byIdPx.ttc,
                            vatRate: pr.vatRate != null && Number(pr.vatRate) !== 0 ? pr.vatRate : byIdPx.vatRate,
                            priceSource: 'sales_space',
                            salesPrices: byIdDist.get(pr.id) ?? [],
                        };
                    }
                    const byWidPx = pr.externalId ? byWid.get(pr.externalId) : undefined;
                    if (byWidPx && byWidPx.ttc > 0) {
                        return {
                            ...pr,
                            basePrice: byWidPx.ttc,
                            vatRate: pr.vatRate != null && Number(pr.vatRate) !== 0 ? pr.vatRate : byWidPx.vatRate,
                            priceSource: 'sales_item',
                            salesPrices: byWidDist.get(pr.externalId) ?? [],
                        };
                    }
                    const byNamePx = pr.name ? byName.get(pr.name) : undefined;
                    if (byNamePx && byNamePx.ttc > 0) {
                        return {
                            ...pr,
                            basePrice: byNamePx.ttc,
                            vatRate: pr.vatRate != null && Number(pr.vatRate) !== 0 ? pr.vatRate : byNamePx.vatRate,
                            priceSource: 'sales_name',
                            salesPrices: byNameDist.get(pr.name) ?? [],
                        };
                    }
                    // Aucune vente attribuable (ni par id, ni par item_id, ni par nom) : prix propre.
                    return { ...pr, priceSource: 'catalog' };
                });
            }
        } else {
            // Sans espace : prix « produit » global. Un produit F&B a basePrice null ; un produit créé
            // par un sync dont la 1re vente vue était à 0 (gratuité/staff, fréquent "HAPPY HOUR") a
            // basePrice FIGÉ à 0 → il faut aussi le dériver des ventes (sinon il reste à 0 à vie).
            const needsPrice = (v: any) => v == null || Number(v) === 0;
            const productsNeedingPrice = catalogue.filter((pr: any) => needsPrice(pr.basePrice)).map((pr: any) => pr.id);
            const salesByProduct = await this.deriveSalesPrices(tenantId, productsNeedingPrice);
            data = catalogue.map((pr: any) => {
                if (!needsPrice(pr.basePrice)) return pr;
                const sales = salesByProduct.get(pr.id);
                if (!sales || sales.length === 0) return pr;
                const top = sales[0];
                return {
                    ...pr,
                    basePrice: top.ttc,
                    vatRate: pr.vatRate ?? top.vatRate,
                    priceSource: 'sales',
                    salesPrices: sales,
                };
            });
        }

        // HT direct par produit (basePrice/vatRate déjà résolus par les branches ci-dessus, quelle
        // que soit la source), évite au front de refaire la détaxation à la main. `computePricing`
        // renvoie `pricing.gross.ht: null` si aucun vatRate n'est résolu (pas de taux inventé).
        const tenantVatRate = await this.pricing.getTenantDefaultVatRate(tenantId);
        data = data.map((pr: any) => this.pricing.withPricing(pr, tenantVatRate, null));

        // onlySold : ne renvoie que les produits ayant un prix (= réellement vendus) → on retire le
        // bruit du catalogue jamais vendu. BUG-337-02 : filtré ICI, AVANT la pagination (data porte
        // déjà tout le catalogue résolu, cf. `catalogue` plus haut) — `total`/`total_pages`
        // reflètent donc le compte RÉELLEMENT vendu, une vraie pagination devient possible côté
        // appelant (plus besoin de boucler sur toutes les pages pour tout reconstituer).
        // `catalogTotal` (non filtré) reste exposé séparément pour l'UI "X produits masqués".
        if (onlySold === 'true') {
            data = data.filter((pr: any) => pr.basePrice != null && Number(pr.basePrice) > 0);
        }
        const total = data.length;
        const pageData = data.slice((p - 1) * pp, (p - 1) * pp + pp);

        return {
            data: pageData,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
                catalogTotal,
            },
        };
    }

    /**
     * Refresh one product details.
     * Local-first: use local WeezeventProduct/rawData when possible, then try Weezevent API only
     * for missing fields. If the external API fails, return the local record instead of breaking UI.
     */
    @Get('products/:productId/refresh')
    @ApiOperation({ summary: 'Rafraîchir les détails d’un produit Weezevent local-first' })
    @ApiParam({ name: 'productId', description: 'ID interne du produit Weezevent' })
    @ApiQuery({ name: 'spaceId', required: false, description: 'Espace : le prix dérivé est celui pratiqué DANS cet espace (jamais un autre espace)' })
    @ApiResponse({ status: 200, description: 'Produit enrichi depuis la DB locale ou Weezevent' })
    async refreshProduct(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
        @Query('spaceId') spaceId?: string,
    ) {
        const tenantId = user.tenantId;
        const product = await this.prisma.salesProduct.findFirst({
            where: { id: productId, tenantId },
            include: { integration: { include: { weezevent: true } } },
        });

        if (!product) {
            throw new NotFoundException(`Product ${productId} not found`);
        }

        const rawData = (product.rawData || {}) as any;
        const localData = {
            nature: product.nature ?? rawData.nature ?? null,
            subnature: product.subnature ?? rawData.subnature ?? null,
            productType: product.productType ?? rawData.type ?? null,
            basePrice: product.basePrice != null
                ? Number(product.basePrice)
                : rawData.base_price != null
                    ? Number(rawData.base_price)
                    : rawData.basePrice != null
                        ? Number(rawData.basePrice)
                        : null,
            rawData,
        };

        // Prix absent du catalogue (F&B, basePrice null) OU figé à 0 par un sync (1re vente à 0,
        // gratuité/staff, fréquent sur les "HAPPY HOUR") → on le dérive des ventes. On expose TOUS
        // les prix (salesPrices : ttc/ht/vat/salesCount) pour que le front décide ; basePrice/vatRate
        // = prix modal (rétro-compat) pour éviter le pré-remplissage à 0 à la création.
        if (localData.basePrice == null || Number(localData.basePrice) === 0) {
            if (spaceId) {
                // Prix DE L'ESPACE (avec repli « jamais un autre espace ») ; salesPrices = distribution.
                const px = (await this.pricing.getSpaceScopedLatestPrices(tenantId, spaceId, [product.id])).get(product.id);
                if (px && px.ttc > 0) {
                    localData.basePrice = px.ttc;
                    if ((product.vatRate == null || Number(product.vatRate) === 0) && px.vatRate != null) {
                        (localData as any).vatRate = px.vatRate;
                    }
                    (localData as any).salesPrices = (await this.pricing.getSpaceScopedModalPrices(tenantId, spaceId, [product.id])).get(product.id) ?? [];
                }
                // Repli par item_id Weezevent (lien le plus fiable, indépendant du FK et du nom).
                if ((localData.basePrice == null || Number(localData.basePrice) === 0) && product.externalId) {
                    const byWid = (await this.pricing.getSpaceScopedLatestPricesByWeezeventId(tenantId, spaceId, [product.externalId], { integrationId: product.integrationId })).get(product.externalId);
                    if (byWid && byWid.ttc > 0) {
                        localData.basePrice = byWid.ttc;
                        if ((product.vatRate == null || Number(product.vatRate) === 0) && byWid.vatRate != null) {
                            (localData as any).vatRate = byWid.vatRate;
                        }
                        (localData as any).salesPrices = (await this.pricing.getSpaceScopedModalPricesByWeezeventId(tenantId, spaceId, [product.externalId], { integrationId: product.integrationId })).get(product.externalId) ?? [];
                    }
                }
                // Repli par NOM : ce produit n'a pas de vente sous son id (item recréé chaque saison)
                // → on cherche le prix des ventes du même nom (scopé espace/intégration).
                if ((localData.basePrice == null || Number(localData.basePrice) === 0) && product.name) {
                    const byName = (await this.pricing.getSpaceScopedLatestPricesByName(tenantId, spaceId, [product.name], { integrationId: product.integrationId })).get(product.name);
                    if (byName && byName.ttc > 0) {
                        localData.basePrice = byName.ttc;
                        if ((product.vatRate == null || Number(product.vatRate) === 0) && byName.vatRate != null) {
                            (localData as any).vatRate = byName.vatRate;
                        }
                        (localData as any).salesPrices = (await this.pricing.getSpaceScopedModalPricesByName(tenantId, spaceId, [product.name], { integrationId: product.integrationId })).get(product.name) ?? [];
                    }
                }
            } else {
                const sales = (await this.deriveSalesPrices(tenantId, [product.id])).get(product.id);
                if (sales && sales.length > 0) {
                    const top = sales[0];
                    localData.basePrice = top.ttc;
                    if ((product.vatRate == null || Number(product.vatRate) === 0) && top.vatRate != null) {
                        (localData as any).vatRate = top.vatRate;
                    }
                    (localData as any).salesPrices = sales;
                }
            }
        }

        const hasUsefulLocalData =
            localData.basePrice != null &&
            Number(localData.basePrice) !== 0 &&
            (!!localData.nature || !!localData.subnature || !!localData.productType);

        if (hasUsefulLocalData) {
            return { ...product, ...localData, source: 'local' };
        }

        if (!product.integration?.weezevent?.organizationId) {
            return { ...product, ...localData, source: 'local', warning: 'Missing Weezevent organizationId' };
        }

        try {
            const apiProduct = await this.weezeventClient.getProduct(
                tenantId,
                product.integrationId,
                product.integration.weezevent.organizationId,
                product.externalId,
            );

            const rawCategoryId = (apiProduct as any).category_id;
            const updateData = {
                name: apiProduct.name || product.name,
                description: apiProduct.description ?? product.description,
                nature: (apiProduct as any).nature ?? product.nature,
                subnature: (apiProduct as any).subnature ?? product.subnature,
                productType: (apiProduct as any).type ?? product.productType,
                categoryId: rawCategoryId != null
                    ? String(rawCategoryId)
                    : (apiProduct as any).category != null
                        ? String((apiProduct as any).category)
                        : product.categoryId,
                basePrice: (apiProduct as any).base_price != null
                    ? (apiProduct as any).base_price
                    : product.basePrice,
                vatRate: (apiProduct as any).vat_rate != null
                    ? (apiProduct as any).vat_rate
                    : product.vatRate,
                image: (apiProduct as any).image ?? product.image,
                rawData: apiProduct as any,
                syncedAt: new Date(),
            };

            const refreshed = await this.prisma.salesProduct.update({
                where: { id: product.id },
                data: updateData,
            });

            // Le catalogue Weezevent F&B n'a pas de prix : ne JAMAIS écraser un prix déjà dérivé des
            // ventes (localData) par un null/0 catalogue. On repli sur le prix dérivé + salesPrices.
            const refreshedBase = refreshed.basePrice != null && Number(refreshed.basePrice) !== 0
                ? Number(refreshed.basePrice)
                : (localData.basePrice != null ? Number(localData.basePrice) : null);
            return {
                ...refreshed,
                basePrice: refreshedBase,
                vatRate: refreshed.vatRate != null ? Number(refreshed.vatRate) : ((localData as any).vatRate ?? null),
                ...((localData as any).salesPrices ? { salesPrices: (localData as any).salesPrices } : {}),
                source: refreshed.basePrice != null && Number(refreshed.basePrice) !== 0 ? 'weezevent' : 'sales',
            };
        } catch (error) {
            // error.message pouvait lui-même jeter si l'exception n'est pas une vraie Error
            // (ex. rejet non standard du client Weezevent) — cassant le fallback "never break
            // the UI" que ce catch est censé garantir.
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Weezevent product refresh failed for ${productId}: ${message}`);
            return { ...product, ...localData, source: 'local', warning: 'Weezevent refresh failed' };
        }
    }

    /**
     * BACKFILL : relie les ventes orphelines à leur produit — et CRÉE le produit s'il manque.
     *
     * Problème : `WeezeventTransactionItem.productId` peut être null (le sync n'a pas résolu le
     * produit au moment d'insérer la ligne). Ces ventes sont alors INVISIBLES à toute dérivation de
     * prix (qui filtre par productId) → prix à 0 même quand des ventes existent. Et si le produit
     * n'a jamais été créé, il n'apparaît même pas à l'étape 3 pour être mappé.
     *
     * Ce backfill : pour chaque ligne orpheline, résout le produit par `rawData.item_id` →
     * `WeezeventProduct.weezeventId` (scopé à l'intégration de la transaction). S'il n'existe pas,
     * il le CRÉE (basePrice laissé null → le prix se dérive des ventes au read-time). Puis relie
     * toutes les lignes. `dryRun=true` → aperçu (compteurs) sans écriture.
     */
    @RequirePermissions('menu.integration.fb')
    @Post('backfill-transaction-item-products')
    @ApiOperation({
        summary: 'Backfill : relier les ventes orphelines (productId null) à leur produit (créé si absent)',
        description:
            "Relie les WeezeventTransactionItem sans productId à leur WeezeventProduct (via rawData.item_id), en créant le produit manquant pour que la vente apparaisse au mapping de l'étape 3. dryRun=true = aperçu sans écriture.",
    })
    @ApiQuery({ name: 'integrationId', required: false, description: 'Limiter à une intégration Weezevent' })
    @ApiQuery({ name: 'dryRun', required: false, description: 'Aperçu sans écriture (true/false)' })
    @ApiResponse({ status: 200, description: 'Résumé du backfill' })
    async backfillTransactionItemProducts(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId?: string,
        @Query('dryRun') dryRun?: string,
    ) {
        const tenantId = user.tenantId;
        const preview = dryRun === 'true' || (dryRun as any) === true;
        const summary = {
            dryRun: preview,
            orphanItems: 0,
            distinctProducts: 0,
            productsCreated: 0,
            productsExisting: 0,
            itemsLinked: 0,
            skippedNoItemId: 0,
        };

        // 1. Lignes orphelines (productId null) + intégration de la transaction + item_id du produit.
        const orphans = await this.prisma.$queryRaw<Array<{ id: string; integrationId: string | null; itemWid: string | null; productName: string | null }>>(Prisma.sql`
            SELECT ti."id" AS "id", t."integrationId" AS "integrationId",
                   (ti."rawData"->>'item_id') AS "itemWid", ti."productName" AS "productName"
            FROM "WeezeventTransactionItem" ti
            JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
            WHERE ti."productId" IS NULL AND t."tenantId" = ${tenantId}
              ${integrationId ? Prisma.sql`AND t."integrationId" = ${integrationId}` : Prisma.empty}
        `);
        summary.orphanItems = orphans.length;
        if (orphans.length === 0) return summary;

        // 2. Regrouper par (intégration, item_id).
        const byKey = new Map<string, { integrationId: string; itemWid: string; name: string | null; itemIds: string[] }>();
        for (const o of orphans) {
            if (!o.itemWid || !o.integrationId) { summary.skippedNoItemId++; continue; }
            const key = `${o.integrationId}::${o.itemWid}`;
            const g = byKey.get(key) ?? { integrationId: o.integrationId, itemWid: o.itemWid, name: null, itemIds: [] };
            if (!g.name && o.productName) g.name = o.productName;
            g.itemIds.push(o.id);
            byKey.set(key, g);
        }
        summary.distinctProducts = byKey.size;

        // 3. Produits existants pour ces (intégration, item_id).
        const wids = [...new Set([...byKey.values()].map((g) => g.itemWid))];
        const existing = await this.prisma.salesProduct.findMany({
            where: { tenantId, externalId: { in: wids }, ...(integrationId ? { integrationId } : {}) },
            select: { id: true, integrationId: true, externalId: true },
        });
        const prodByKey = new Map(existing.map((p) => [`${p.integrationId}::${p.externalId}`, p.id]));

        // 4. Créer les produits manquants + relier les lignes.
        for (const [key, g] of byKey) {
            let productId = prodByKey.get(key);
            if (productId) {
                summary.productsExisting++;
            } else {
                summary.productsCreated++;
                if (!preview) {
                    const created = await this.prisma.salesProduct.upsert({
                        where: { tenantId_integrationId_externalId: { tenantId, integrationId: g.integrationId, externalId: g.itemWid } },
                        create: { externalId: g.itemWid, tenantId, integrationId: g.integrationId, name: g.name || `Item ${g.itemWid}`, rawData: {}, syncedAt: new Date() },
                        update: {},
                        select: { id: true },
                    });
                    productId = created.id;
                    prodByKey.set(key, productId);
                }
            }

            if (preview) {
                summary.itemsLinked += g.itemIds.length;
                continue;
            }
            if (!productId) continue;
            const CHUNK = 500;
            for (let i = 0; i < g.itemIds.length; i += CHUNK) {
                const slice = g.itemIds.slice(i, i + CHUNK);
                const r = await this.prisma.salesTransactionItem.updateMany({
                    where: { id: { in: slice } },
                    data: { productId },
                });
                summary.itemsLinked += r.count;
            }
        }

        this.logger.log(
            `Backfill transaction-item products${preview ? ' [DRY-RUN]' : ''} (tenant ${tenantId}${integrationId ? `, integration ${integrationId}` : ''}): ` +
                `${summary.itemsLinked} lignes reliées, ${summary.productsCreated} produits créés, ${summary.productsExisting} existants ` +
                `(orphelines=${summary.orphanItems}, skippedNoItemId=${summary.skippedNoItemId})`,
        );
        return summary;
    }

    /**
     * Map a Weezevent product to a MenuItem
     */
    @RequirePermissions('menu.integration.fb')
    @Post('products/:productId/map')
    @ApiOperation({ summary: 'Associer un produit Weezevent à un menu item' })
    @ApiParam({ name: 'productId', description: 'ID du produit Weezevent' })
    @ApiBody({ type: MapProductToMenuItemDto })
    @ApiResponse({ status: 201, description: 'Mapping créé ou mis à jour' })
    async mapProductToMenuItem(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
        @Body() body: MapProductToMenuItemDto,
    ) {
        const tenantId = user.tenantId;

        // Verify product exists
        const product = await this.prisma.salesProduct.findFirst({
            where: { id: productId, tenantId },
        });

        if (!product) {
            throw new Error('Product not found');
        }

        // Verify menu item exists
        const menuItem = await this.prisma.menuItem.findFirst({
            where: { id: body.menuItemId, tenantId },
        });

        if (!menuItem) {
            throw new Error('Menu item not found');
        }

        // Create or update mapping
        const mapping = await this.prisma.productMapping.upsert({
            where: { salesProductId: productId },
            create: {
                tenantId,
                salesProductId: productId,
                menuItemId: body.menuItemId,
                autoMapped: body.autoMapped || false,
                confidence: body.confidence || null,
                mappedBy: user.id,
            },
            update: {
                menuItemId: body.menuItemId,
                autoMapped: body.autoMapped || false,
                confidence: body.confidence || null,
                mappedBy: user.id,
            },
        });

        // Rattache l'espace courant du wizard au menu item mappé (idempotent).
        // Un mapping ne porte pas d'espace ; sans ça l'article reste « mappé sans espace ».
        // Ligne SpaceMenuItem + skipDuplicates ; espace et item re-vérifiés côté tenant
        // (les deux ids viennent du body).
        if (body.spaceId) {
            const [space, item] = await Promise.all([
                this.prisma.space.findFirst({ where: { id: body.spaceId, tenantId }, select: { id: true } }),
                this.prisma.menuItem.findFirst({
                    where: { id: body.menuItemId, tenantId, deletedAt: null },
                    select: { id: true },
                }),
            ]);
            if (space && item) {
                await this.prisma.spaceMenuItem.createMany({
                    data: [{ menuItemId: item.id, spaceId: space.id }],
                    skipDuplicates: true,
                });
            }
        }

        return {
            success: true,
            mapping,
        };
    }

    /**
     * Get product mappings
     */
    @Get('products/mappings')
    @ApiOperation({ summary: 'Lister les mappings produits Weezevent / menu items' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'Scoper par intégration — filtre la liste et accélère l\'agrégat salesPricing.' })
    @ApiResponse({ status: 200, description: 'Liste paginée des mappings de produits' })
    async getProductMappings(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('integrationId') integrationId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);

        // Scoper par intégration filtre la liste ET permet de scoper l'agrégat ventes.
        const where: any = { tenantId };
        if (integrationId) where.salesProduct = { integrationId };

        const [mappings, total] = await Promise.all([
            this.prisma.productMapping.findMany({
                where,
                include: {
                    salesProduct: { include: { prices: true } },
                    menuItem: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.productMapping.count({ where }),
        ]);

        // Étape 3 Data Integration : on expose TOUT (le front décide quoi afficher) —
        // menuItem.pricing (catalogue) + weezeventProduct.pricing (référence Weezevent,
        // TVA + devise réelles) + weezeventProduct.salesPricing (réellement encaissé).
        // L'agrégat salesPricing est scopé à l'intégration si fournie (sinon tenant-wide).
        const data = await this.pricing.enrichMappingsPricing(mappings, tenantId, { integrationId });

        return {
            data,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Delete a product mapping
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('products/:productId/map')
    @ApiOperation({ summary: 'Supprimer le mapping d’un produit Weezevent' })
    @ApiParam({ name: 'productId', description: 'ID du produit Weezevent' })
    @ApiResponse({ status: 200, description: 'Mapping supprimé' })
    async unmapProduct(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
    ) {
        const tenantId = user.tenantId;

        await this.prisma.productMapping.deleteMany({
            where: {
                salesProductId: productId,
                tenantId,
            },
        });

        return { success: true };
    }

    /**
     * Get orders
     */
    @Get('orders')
    @ApiOperation({ summary: 'Lister les commandes Weezevent synchronisées' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'eventId', required: false, description: 'Filtrer par ID événement Weezevent' })
    @ApiResponse({ status: 200, description: 'Liste paginée des commandes Weezevent' })
    async getOrders(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('integrationId') integrationId?: string,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (eventId) where.eventId = eventId;

        const [orders, total] = await Promise.all([
            this.prisma.weezeventOrder.findMany({
                where,
                orderBy: { orderDate: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventOrder.count({ where }),
        ]);

        return {
            data: orders,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Get prices
     */
    @Get('prices')
    @ApiOperation({ summary: 'Lister les tarifs Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'eventId', required: false, description: 'Filtrer par ID événement Weezevent' })
    @ApiResponse({ status: 200, description: 'Liste paginée des tarifs Weezevent' })
    async getPrices(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('integrationId') integrationId?: string,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (eventId) where.eventId = eventId;

        const [prices, total] = await Promise.all([
            this.prisma.weezeventPrice.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventPrice.count({ where }),
        ]);

        return {
            data: prices,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Get attendees
     */
    @Get('attendees')
    @ApiOperation({ summary: 'Lister les participants Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'eventId', required: false, description: 'Filtrer par ID événement Weezevent' })
    @ApiResponse({ status: 200, description: 'Liste paginée des participants Weezevent' })
    async getAttendees(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('integrationId') integrationId?: string,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (eventId) where.eventId = eventId;

        const [attendees, total] = await Promise.all([
            this.prisma.weezeventAttendee.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            this.prisma.weezeventAttendee.count({ where }),
        ]);

        return {
            data: attendees,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                total_pages: Math.ceil(total / perPage),
            },
        };
    }

    // ==================== SYNC JOBS (nouvelle architecture bisection) ====================

    /**
     * Démarre un job de sync asynchrone avec bissection.
     * Retourne immédiatement un jobId — le frontend poll GET /sync/status/:jobId.
     */
    @RequirePermissions('menu.integration.fb')
    @Post('sync/start')
    @ApiOperation({ summary: 'Démarrer un job de synchronisation par bissection' })
    @ApiBody({ type: StartSyncJobDto })
    @ApiResponse({ status: 201, description: 'Job créé, retourne jobId' })
    async startSyncJob(
        @CurrentUser() user: any,
        @Body() dto: StartSyncJobDto,
    ) {
        const tenantId = user.tenantId;

        const integration = await this.prisma.integration.findFirst({
            where: { id: dto.integrationId, tenantId, enabled: true },
            select: { id: true, weezevent: { select: { organizationId: true } } },
        });

        if (!integration) {
            throw new BadRequestException(`Intégration Weezevent ${dto.integrationId} introuvable ou désactivée.`);
        }
        if (!integration.weezevent?.organizationId) {
            throw new BadRequestException(`L'organisation Weezevent n'est pas configurée pour cette intégration.`);
        }

        // Refuser si un job est déjà en cours pour cette intégration
        const running = await this.prisma.weezeventSyncJob.findFirst({
            where: { integrationId: dto.integrationId, status: 'COLLECTING' },
            select: { id: true },
        });
        if (running) {
            throw new BadRequestException(`Un job de sync est déjà en cours (jobId: ${running.id}).`);
        }

        // Symétrique de la garde ajoutée dans WeezeventCronService.syncRecentTransactions :
        // le cron (10 min, incrémental) ne passe pas par WeezeventSyncJob — sans cette
        // vérification, un job manuel chunké pourrait démarrer pendant que le cron écrit déjà
        // sur la même intégration.
        if (this.syncTracker.isRunning(tenantId, 'transactions', dto.integrationId)) {
            throw new BadRequestException(`Une synchronisation automatique (cron) est déjà en cours pour cette intégration — réessayez dans quelques instants.`);
        }

        // fromDate/toDate optionnels : sans borne explicite, on reproduit la fenêtre par défaut
        // du chemin incrémental legacy (weezevent-incremental-sync.service.ts) — overlap 5 min
        // depuis le dernier sync connu, ou tout l'historique (epoch → maintenant) au premier sync.
        let fromDate: Date;
        let toDate: Date;
        if (dto.fromDate && dto.toDate) {
            fromDate = new Date(dto.fromDate);
            toDate = new Date(dto.toDate);
        } else {
            const syncState = await this.prisma.weezeventSyncState.findUnique({
                where: {
                    tenantId_integrationId_syncType: {
                        tenantId,
                        integrationId: dto.integrationId,
                        syncType: 'transactions',
                    },
                },
                select: { lastSyncedAt: true },
            });
            fromDate = dto.fromDate
                ? new Date(dto.fromDate)
                : syncState?.lastSyncedAt
                    ? new Date(syncState.lastSyncedAt.getTime() - 5 * 60 * 1000)
                    : new Date(0);
            toDate = dto.toDate ? new Date(dto.toDate) : new Date();
        }

        const job = await this.prisma.weezeventSyncJob.create({
            data: {
                tenantId,
                integrationId: dto.integrationId,
                fromDate,
                toDate,
                status: 'PENDING',
            },
        });

        // Lancer collect + insert en background (sans await)
        this.collectWorker.start(job.id).catch(err =>
            this.logger.error(`[startSyncJob] CollectWorker crash for job ${job.id}: ${err.message}`),
        );
        this.insertWorker.watch(job.id).catch(err =>
            this.logger.error(`[startSyncJob] InsertWorker crash for job ${job.id}: ${err.message}`),
        );

        this.logger.log(`Job de sync démarré: jobId=${job.id} intégration=${dto.integrationId} ${fromDate.toISOString()} → ${toDate.toISOString()}`);

        return { jobId: job.id, status: 'PENDING' };
    }

    /**
     * Retourne l'état en temps réel d'un job de sync.
     * Le frontend poll cet endpoint toutes les 3s.
     */
    @Get('sync/status/:jobId')
    @ApiOperation({ summary: 'État d\'un job de synchronisation' })
    @ApiParam({ name: 'jobId', description: 'ID du job retourné par POST /sync/start' })
    @ApiResponse({ status: 200, description: 'État du job' })
    async getSyncJobStatus(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        const tenantId = user.tenantId;
        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: {
                id: true,
                status: true,
                fromDate: true,
                toDate: true,
                totalCollected: true,
                totalInserted: true,
                totalChunks: true,
                processedChunks: true,
                collectDone: true,
                errorMessage: true,
                startedAt: true,
                completedAt: true,
            },
        });

        if (!job) throw new NotFoundException(`Job ${jobId} introuvable.`);

        const collectProgress = job.totalChunks > 0
            ? Math.round((job.processedChunks / job.totalChunks) * 100)
            : 0;
        const insertProgress = job.totalCollected > 0
            ? Math.round((job.totalInserted / job.totalCollected) * 100)
            : 0;

        return {
            jobId: job.id,
            status: job.status,
            fromDate: job.fromDate,
            toDate: job.toDate,
            totalCollected: job.totalCollected,
            totalInserted: job.totalInserted,
            totalChunks: job.totalChunks,
            processedChunks: job.processedChunks,
            collectDone: job.collectDone,
            collectProgress,
            insertProgress,
            errorMessage: job.errorMessage,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
        };
    }

    /**
     * Liste les jobs de sync pour une intégration donnée.
     */
    @Get('sync/jobs')
    @ApiOperation({ summary: 'Lister les jobs de sync pour une intégration' })
    @ApiQuery({ name: 'integrationId', required: true, description: 'ID de l\'intégration' })
    @ApiResponse({ status: 200, description: 'Liste des jobs' })
    async listSyncJobs(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId: string,
    ) {
        const tenantId = user.tenantId;
        const jobs = await this.prisma.weezeventSyncJob.findMany({
            where: { tenantId, integrationId },
            orderBy: { startedAt: 'desc' },
            take: 20,
            select: {
                id: true,
                status: true,
                fromDate: true,
                toDate: true,
                totalCollected: true,
                totalInserted: true,
                startedAt: true,
                completedAt: true,
                errorMessage: true,
            },
        });
        return { data: jobs };
    }

    /**
     * Retourne des statistiques sur les transactions couvertes par un job de sync.
     * Calcule le nombre distinct d'événements, locations et produits dans la plage de dates du job.
     */
    @Get('sync/jobs/:jobId/stats')
    @ApiOperation({ summary: 'Statistiques d\'un job de sync (transactions, events, locations, produits)' })
    @ApiParam({ name: 'jobId', description: 'ID du job' })
    @ApiResponse({ status: 200, description: 'Statistiques du job' })
    async getSyncJobStats(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        const tenantId = user.tenantId;

        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: { id: true, integrationId: true, fromDate: true, toDate: true, totalCollected: true, totalInserted: true },
        });
        if (!job) throw new NotFoundException(`Job ${jobId} introuvable.`);

        const where = {
            tenantId,
            integrationId: job.integrationId,
            transactionDate: { gte: job.fromDate, lte: job.toDate },
        };

        const [transactionCount, eventGroups, locationGroups, productGroups] = await Promise.all([
            this.prisma.salesTransaction.count({ where }),
            this.prisma.salesTransaction.groupBy({
                by: ['eventId'],
                where: { ...where, eventId: { not: null } },
            }),
            this.prisma.salesTransaction.groupBy({
                by: ['locationId'],
                where: { ...where, locationId: { not: null } },
            }),
            this.prisma.salesTransactionItem.groupBy({
                by: ['productId'],
                where: {
                    productId: { not: null },
                    transaction: where,
                },
            }),
        ]);

        return {
            jobId,
            transactions: transactionCount,
            events: eventGroups.length,
            locations: locationGroups.length,
            products: productGroups.length,
        };
    }

    /**
     * Annule un job de sync bloqué/en cours SANS supprimer son historique — contrairement à
     * DELETE sync/jobs/:jobId (suppression définitive de la fiche). Marque le job CANCELLED ;
     * les workers (collect/insert) vérifient ce statut et s'arrêtent au prochain cycle plutôt
     * que d'être tués immédiatement (cf. WeezeventCollectWorkerService/WeezeventInsertWorkerService).
     */
    @RequirePermissions('menu.integration.fb')
    @Patch('sync/jobs/:jobId/cancel')
    @ApiOperation({ summary: 'Annuler un job de sync en conservant son historique' })
    @ApiParam({ name: 'jobId', description: 'ID du job à annuler' })
    @ApiResponse({ status: 200, description: 'Job annulé' })
    async cancelSyncJob(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        const tenantId = user.tenantId;

        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: { id: true, status: true },
        });

        if (!job) {
            throw new NotFoundException(`Job de sync ${jobId} introuvable.`);
        }

        if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
            throw new BadRequestException(`Impossible d'annuler un job déjà terminé (status: ${job.status}).`);
        }

        await this.prisma.weezeventSyncJob.update({
            where: { id: jobId },
            data: {
                status: 'CANCELLED',
                errorMessage: 'Synchronisation annulée manuellement.',
                completedAt: new Date(),
            },
        });

        return { cancelled: true, jobId };
    }

    /**
     * Supprime un job de sync (et ses chunks via cascade).
     * Interdit si le job est encore actif (COLLECTING ou INSERTING).
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('sync/jobs/:jobId')
    @ApiOperation({ summary: 'Supprimer un job de sync' })
    @ApiParam({ name: 'jobId', description: 'ID du job à supprimer' })
    @ApiResponse({ status: 200, description: 'Job supprimé' })
    async deleteSyncJob(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        const tenantId = user.tenantId;

        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: { id: true, status: true, startedAt: true },
        });

        if (!job) {
            throw new NotFoundException(`Job de sync ${jobId} introuvable.`);
        }

        // Bloquer uniquement si le job a démarré il y a moins de 2 minutes
        // (jobs bloqués par un ancien bug ou un redémarrage serveur peuvent être supprimés)
        if (job.status === 'COLLECTING' || job.status === 'INSERTING') {
            const ageMs = Date.now() - new Date(job.startedAt).getTime();
            if (ageMs < 2 * 60 * 1000) {
                throw new BadRequestException(`Impossible de supprimer un job démarré il y a moins de 2 minutes (status: ${job.status}).`);
            }
            this.logger.warn(`[deleteSyncJob] Suppression forcée d'un job bloqué: ${jobId} status=${job.status}`);
        }

        await this.prisma.weezeventSyncJob.delete({ where: { id: jobId } });

        return { deleted: true, jobId };
    }
}
