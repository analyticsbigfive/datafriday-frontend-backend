import { Injectable, Logger } from '@nestjs/common';
import { WeezeventTransactionSyncService } from './sync/transaction-sync.service';
import { WeezeventCatalogSyncService } from './sync/catalog-sync.service';
import { WeezeventQueuedEntitySyncService } from './sync/queued-entity-sync.service';

// Re-export types so existing callers (spec files, queue processor, etc.) don't need to change imports.
export interface SyncResult {
    type: string;
    success: boolean;
    itemsSynced: number;
    itemsCreated: number;
    itemsUpdated: number;
    errors: number;
    duration: number;
    fromDate?: Date;
    toDate?: Date;
}


/**
 * WeezeventSyncService — thin façade
 *
 * Delegates to focused sub-services (SOLID / SRP):
 *   - WeezeventTransactionSyncService  → transaction unique (webhook)
 *   - WeezeventCatalogSyncService      → enrichissement du catalogue produits
 *   - WeezeventQueuedEntitySyncService → BullMQ jobs (commandes, prix, participants)
 *
 * Appelants : data-sync.processor et webhook-event.handler.
 * Inject the focused sub-services directly in new code.
 */
@Injectable()
export class WeezeventSyncService {
    private readonly logger = new Logger(WeezeventSyncService.name);

    constructor(
        // Sub-services injected so NestJS wires them up; kept private since
        // this class is purely a delegation layer.
        private readonly transactionSync: WeezeventTransactionSyncService,
        private readonly catalogSync: WeezeventCatalogSyncService,
        private readonly queuedEntitySync: WeezeventQueuedEntitySyncService,
    ) {}

    syncSingleTransaction(
        tenantId: string,
        integrationId: string,
        transactionId: string | number,
    ): Promise<{ created: boolean; updated: boolean }> {
        return this.transactionSync.syncSingleTransaction(tenantId, integrationId, transactionId);
    }

    syncProducts(tenantId: string, integrationId: string): Promise<SyncResult> {
        return this.catalogSync.syncProducts(tenantId, integrationId);
    }

    syncOrders(tenantId: string, integrationId: string, eventId: string): Promise<SyncResult> {
        return this.queuedEntitySync.syncOrders(tenantId, integrationId, eventId);
    }

    syncPrices(tenantId: string, integrationId: string, eventId?: string): Promise<SyncResult> {
        return this.queuedEntitySync.syncPrices(tenantId, integrationId, eventId);
    }

    syncAttendees(tenantId: string, integrationId: string, eventId: string): Promise<SyncResult> {
        return this.queuedEntitySync.syncAttendees(tenantId, integrationId, eventId);
    }
}
