import { Injectable, Logger } from '@nestjs/common';
import { WeezeventClientService } from './weezevent-client.service';
import { SalesPriceAggService } from '../../../shared/pricing/sales-price-agg.service';
import { WeezeventEventBatchWriterService } from './sync/event-batch-writer.service';
import { WeezeventSyncStateService } from './sync/sync-state.service';
import { WeezeventTransactionBatchWriterService } from './sync/transaction-batch-writer.service';

export interface IncrementalSyncOptions {
    // Force full sync (ignore last sync state)
    forceFullSync?: boolean;
    // Maximum items per batch
    batchSize?: number;
    // Maximum total items to sync in one run (prevent memory issues)
    maxItems?: number;
    // Sync only items updated after this date
    updatedSince?: Date;
    // Stop transaction sync at this date
    updatedUntil?: Date;
    // Progress callback: receives 0-100 as pages are processed
    onProgress?: (pct: number) => Promise<void>;
}

export interface IncrementalSyncResult {
    type: string;
    success: boolean;
    isIncremental: boolean;
    itemsSynced: number;
    itemsCreated: number;
    itemsUpdated: number;
    itemsSkipped: number;
    errors: number;
    duration: number;
    hasMore: boolean;
    checkpoint?: any;
}

/**
 * Synchronisation incrémentale des événements et des transactions Weezevent, par pages, depuis le dernier curseur.
 */
@Injectable()
export class WeezeventIncrementalSyncService {
  constructor(
    private readonly weezeventClient: WeezeventClientService,
    private readonly priceAgg: SalesPriceAggService,
    private readonly weezeventEventBatchWriterService: WeezeventEventBatchWriterService,
    private readonly weezeventSyncStateService: WeezeventSyncStateService,
    private readonly weezeventTransactionBatchWriterService: WeezeventTransactionBatchWriterService,
  ) {}

    private readonly logger = new Logger(WeezeventIncrementalSyncService.name);

    // Default batch sizes — Weezevent API per_page max is 100
    private readonly DEFAULT_BATCH_SIZE = 100;
    private readonly MAX_ITEMS_PER_RUN = 10000;

    // ==================== EVENTS INCREMENTAL SYNC ====================

    /**
     * Sync events incrementally - only new/updated events
     */
    async syncEventsIncremental(
        tenantId: string,
        integrationId: string,
        options: IncrementalSyncOptions = {},
    ): Promise<IncrementalSyncResult> {
        const startTime = Date.now();
        const syncType = 'events';
        
        const result: IncrementalSyncResult = {
            type: syncType,
            success: false,
            isIncremental: !options.forceFullSync,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            itemsSkipped: 0,
            errors: 0,
            duration: 0,
            hasMore: false,
        };

        try {
            // 1. Get integration config
            const integration = await this.weezeventSyncStateService.getIntegrationConfig(tenantId, integrationId);
            const organizationId = integration.organizationId!;

            // 2. Get sync state (last sync info)
            const syncState = await this.weezeventSyncStateService.getSyncState(tenantId, integrationId, syncType);
            
            // 3. Determine sync strategy
            const isFirstSync = !syncState.lastSyncedAt;
            const useIncremental = !options.forceFullSync && !isFirstSync;

            this.logger.log(
                `Starting ${useIncremental ? 'INCREMENTAL' : 'FULL'} events sync for tenant ${tenantId}`,
            );

            // 4. Fetch events from API with filters
            const apiParams: any = {
                perPage: options.batchSize || this.DEFAULT_BATCH_SIZE,
            };

            // Use updated_since for incremental sync (if API supports it)
            if (useIncremental && syncState.lastUpdatedAt) {
                apiParams.updated_since = syncState.lastUpdatedAt.toISOString();
                this.logger.log(`Fetching events updated since ${syncState.lastUpdatedAt.toISOString()}`);
            }

            // 5. Get all existing event IDs in one query (for fast lookup)
            const existingEventsMap = await this.weezeventEventBatchWriterService.getExistingEventsMap(tenantId, integrationId);

            // 6. Paginate through API results
            let page = 1;
            let hasMore = true;
            let totalProcessed = 0;
            const maxItems = options.maxItems || this.MAX_ITEMS_PER_RUN;
            let lastProcessedUpdatedAt: Date | null = null;

            while (hasMore && totalProcessed < maxItems) {
                // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, chaque page dépend du curseur de la précédente
                const response = await this.weezeventClient.getEvents(
                    tenantId,
                    integrationId,
                    organizationId,
                    { ...apiParams, page },
                );

                const events = response.data;
                
                if (events.length === 0) {
                    hasMore = false;
                    break;
                }

                // 7. Process batch with optimized upsert
                // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, chaque page dépend du curseur de la précédente
                const batchResult = await this.weezeventEventBatchWriterService.processBatchEvents(
                    tenantId,
                    integrationId,
                    organizationId,
                    events,
                    existingEventsMap,
                    useIncremental,
                );

                result.itemsCreated += batchResult.created;
                result.itemsUpdated += batchResult.updated;
                result.itemsSkipped += batchResult.skipped;
                result.errors += batchResult.errors;
                totalProcessed += events.length;

                // Track last updated_at for next incremental sync
                for (const event of events) {
                    const eventUpdatedAt = event.updated_at ? new Date(event.updated_at) : null;
                    if (eventUpdatedAt && (!lastProcessedUpdatedAt || eventUpdatedAt > lastProcessedUpdatedAt)) {
                        lastProcessedUpdatedAt = eventUpdatedAt;
                    }
                }

                // Check pagination
                hasMore = response.meta.current_page < response.meta.total_pages;

                // Report real progress based on pages
                if (options.onProgress) {
                    const totalPages = response.meta.total_pages || 1;
                    const donePct = Math.min(99, Math.round((page / totalPages) * 100));
                    // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, chaque page dépend du curseur de la précédente
                    await options.onProgress(donePct).catch(() => {});
                }

                page++;

                this.logger.debug(
                    `Processed page ${page - 1}: ${events.length} events (total: ${totalProcessed})`,
                );
            }

            result.itemsSynced = result.itemsCreated + result.itemsUpdated;
            result.hasMore = hasMore;

            // 8. Update sync state
            await this.weezeventSyncStateService.updateSyncState(tenantId, integrationId, syncType, {
                lastSyncedAt: new Date(),
                lastUpdatedAt: lastProcessedUpdatedAt || new Date(),
                lastSyncCount: result.itemsSynced,
                lastSyncDuration: Date.now() - startTime,
                totalSynced: syncState.checkpoint?.totalSynced 
                    ? syncState.checkpoint.totalSynced + result.itemsSynced 
                    : result.itemsSynced,
                consecutiveErrors: 0,
                lastError: null,
            });

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            this.logger.log(
                `✅ Events sync completed: ${result.itemsSynced} synced (${result.itemsCreated} new, ${result.itemsUpdated} updated, ${result.itemsSkipped} skipped) in ${result.duration}ms`,
            );

            // 9. Sync locations for all events of this tenant (fire-and-forget — truly non-blocking)
            this.weezeventEventBatchWriterService.syncLocationsFromApi(tenantId, integrationId, organizationId).catch(locErr => {
                this.logger.warn(`Locations sync failed (non-blocking): ${(locErr as Error).message}`);
            });

            return result;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Events sync failed', err.stack);

            // Update error state
            await this.weezeventSyncStateService.updateSyncStateError(tenantId, integrationId, syncType, err.message);

            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    // ==================== TRANSACTIONS INCREMENTAL SYNC ====================

    /**
     * Sync transactions incrementally - only new/updated transactions
     */
    async syncTransactionsIncremental(
        tenantId: string,
        integrationId: string,
        options: IncrementalSyncOptions = {},
    ): Promise<IncrementalSyncResult> {
        const startTime = Date.now();
        const syncType = 'transactions';

        const result: IncrementalSyncResult = {
            type: syncType,
            success: false,
            isIncremental: !options.forceFullSync,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            itemsSkipped: 0,
            errors: 0,
            duration: 0,
            hasMore: false,
        };

        try {
            const integration = await this.weezeventSyncStateService.getIntegrationConfig(tenantId, integrationId);
            const organizationId = integration.organizationId!;

            const syncState = await this.weezeventSyncStateService.getSyncState(tenantId, integrationId, syncType);
            const isFirstSync = !syncState.lastSyncedAt;
            const useIncremental = !options.forceFullSync && !isFirstSync;

            this.logger.log(
                `Starting ${useIncremental ? 'INCREMENTAL' : 'FULL'} transactions sync for tenant ${tenantId}`,
            );

            // Build API params
            // On first full sync: no date limit → fetch ALL transactions from Weezevent.
            // On incremental: overlap 5 min to avoid gaps.
            const fromDate = useIncremental && syncState.lastSyncedAt
                ? new Date(syncState.lastSyncedAt.getTime() - 5 * 60 * 1000) // 5 min overlap
                : options.updatedSince ?? null; // null = no filter = all time on first sync
            const toDate = options.updatedUntil ?? undefined;

            let page = 1;
            let hasMore = true;
            let totalProcessed = 0;
            const maxItems = options.maxItems || this.MAX_ITEMS_PER_RUN;
            const batchSize = options.batchSize || this.DEFAULT_BATCH_SIZE;

            while (hasMore && totalProcessed < maxItems) {
                // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, chaque page dépend du curseur de la précédente
                const response = await this.weezeventClient.getTransactions(
                    tenantId,
                    integrationId,
                    organizationId,
                    {
                        page,
                        perPage: batchSize,
                        fromDate,
                        toDate,
                    },
                );

                const transactions = response.data;

                if (transactions.length === 0) {
                    hasMore = false;
                    break;
                }

                // Transactions de la page déjà en base (une requête par page, mémoire bornée).
                // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, chaque page dépend du curseur de la précédente
                const existingIds = await this.weezeventTransactionBatchWriterService.existingTransactionIds(
                    tenantId, integrationId, transactions.map((t) => t.id.toString()),
                );

                // Filter already existing (for true incremental - skip updates if not needed)
                const newTransactions = useIncremental
                    ? transactions.filter(t => !existingIds.has(t.id.toString()))
                    : transactions;

                result.itemsSkipped += transactions.length - newTransactions.length;

                if (newTransactions.length > 0) {
                    // Batch upsert. refreshPriceAgg=useIncremental (BUG-337-02, docs/bugs/) : en
                    // steady-state (useIncremental=true), refresh ciblé bon marché par lot. En
                    // premier sync/forceFullSync (useIncremental=false), sauté ici — un
                    // refreshForIntegration unique tourne après la boucle complète (voir plus bas) :
                    // des centaines de petits refreshs sur un import historique massif seraient
                    // pires qu'un seul recalcul complet.
                    // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, chaque page dépend du curseur de la précédente
                    const batchResult = await this.weezeventTransactionBatchWriterService.processBatchTransactions(
                        tenantId,
                        integrationId,
                        newTransactions,
                        existingIds,
                        '',
                        useIncremental,
                    );

                    result.itemsCreated += batchResult.created;
                    result.itemsUpdated += batchResult.updated;
                    result.errors += batchResult.errors;
                }

                totalProcessed += transactions.length;
                hasMore = response.meta.current_page < response.meta.total_pages;

                // Report progress: transactions have no total, so estimate via items processed vs maxItems
                // This gives a real signal that advances with the data, capped at 95% until done.
                if (options.onProgress) {
                    const estimatedPct = Math.min(95, Math.round((totalProcessed / maxItems) * 100));
                    // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, chaque page dépend du curseur de la précédente
                    await options.onProgress(estimatedPct).catch(() => {});
                }

                page++;

                this.logger.debug(
                    `Processed page ${page - 1}: ${transactions.length} transactions (${newTransactions.length} new)`,
                );
            }

            result.itemsSynced = result.itemsCreated + result.itemsUpdated;
            result.hasMore = hasMore;

            // Update sync state
            await this.weezeventSyncStateService.updateSyncState(tenantId, integrationId, syncType, {
                lastSyncedAt: new Date(),
                lastSyncCount: result.itemsSynced,
                lastSyncDuration: Date.now() - startTime,
                consecutiveErrors: 0,
                lastError: null,
            });

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            // BUG-337-02 (docs/bugs/) : premier sync/forceFullSync a sauté le refresh ciblé par lot
            // (voir processBatchTransactions ci-dessus) — un unique recalcul complet ici couvre tout
            // l'historique qui vient d'être importé. Best-effort, ne bloque pas la réponse du sync.
            if (!useIncremental && result.itemsCreated > 0) {
                void this.priceAgg.refreshForIntegrationSafe(tenantId, integrationId);
            }

            this.logger.log(
                `✅ Transactions sync completed: ${result.itemsSynced} synced (${result.itemsCreated} new, ${result.itemsSkipped} skipped) in ${result.duration}ms`,
            );

            return result;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Transactions sync failed', err.stack);
            await this.weezeventSyncStateService.updateSyncStateError(tenantId, integrationId, syncType, err.message);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }
}
