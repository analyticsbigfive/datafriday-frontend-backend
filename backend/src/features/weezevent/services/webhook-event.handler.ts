import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from './weezevent-sync.service';
import { LiveEventWindowService } from './live/live-event-window.service';
import { LiveAggregationTriggerService } from './live/live-aggregation-trigger.service';
import { WebhookHealthService } from './live/webhook-health.service';

interface WebhookEvent {
    id: string;
    tenantId: string;
    integrationId: string;
    eventType: string;
    method: string;
    payload: any;
}

@Injectable()
export class WebhookEventHandler {
    private readonly logger = new Logger(WebhookEventHandler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly syncService: WeezeventSyncService,
        private readonly liveWindow: LiveEventWindowService,
        private readonly liveTrigger: LiveAggregationTriggerService,
        private readonly webhookHealth: WebhookHealthService,
    ) { }

    /**
     * Process a webhook event
     */
    async processEvent(eventId: string): Promise<void> {
        const event = await this.prisma.integrationWebhookEvent.findUnique({
            where: { id: eventId },
            include: { tenant: true },
        });

        if (!event) {
            this.logger.error(`Webhook event ${eventId} not found`);
            return;
        }

        if (event.processed) {
            this.logger.warn(`Webhook event ${eventId} already processed`);
            return;
        }

        try {
            // Route to appropriate handler based on event type
            switch (event.eventType) {
                case 'transaction':
                    await this.handleTransactionEvent(event);
                    break;
                case 'order':
                    await this.handleOrderEvent(event);
                    break;
                case 'product':
                    await this.handleProductEvent(event);
                    break;
                default:
                    this.logger.warn(`Unknown event type: ${event.eventType}`);
            }

            await this.prisma.integrationWebhookEvent.update({
                where: { id: eventId },
                data: {
                    processed: true,
                    processedAt: new Date(),
                },
            });
            // BUG-379-02 : webhook sain = le polling repasse en simple filet (LiveSyncScheduler).
            await this.webhookHealth.markProcessed(event.integrationId);

            this.logger.log(`Successfully processed webhook event ${eventId}`);
        } catch (error) {
            this.logger.error(
                `Failed to process webhook event ${eventId}`,
                error.stack,
            );

            // Update error and retry count
            await this.prisma.integrationWebhookEvent.update({
                where: { id: eventId },
                data: {
                    error: error.message,
                    retryCount: { increment: 1 },
                },
            });

            throw error;
        }
    }

    /**
     * Handle transaction webhook event (create/update/delete)
     */
    private async handleTransactionEvent(event: WebhookEvent): Promise<void> {
        const { method, payload } = event;
        // Format WeezPay : `id` à la racine, `values` = détails ; ancien format supposé : `data.id`.
        const transactionId = (payload.id ?? payload.values?.id ?? payload.data?.id)?.toString();

        if (!transactionId) {
            throw new Error('Transaction ID not found in webhook payload');
        }

        this.logger.log(
            `Handling transaction ${method} for ID: ${transactionId}`,
        );

        switch (method) {
            case 'create':
            case 'update':
                // Sync the transaction from Weezevent API
                // We fetch fresh data from API to ensure consistency
                await this.syncTransactionById(event.tenantId, event.integrationId, transactionId);
                break;

            case 'delete':
                await this.markTransactionAsDeleted(event.tenantId, event.integrationId, transactionId);
                await this.queueLiveAggregation(event.tenantId, event.integrationId, `deleted transaction ${transactionId}`);
                break;

            default:
                this.logger.warn(`Unknown transaction method: ${method}`);
        }
    }

    /**
     * Sync a specific transaction by ID
     */
    private async syncTransactionById(
        tenantId: string,
        integrationId: string,
        transactionId: string,
    ): Promise<void> {
        this.logger.log(
            `Syncing transaction ${transactionId} from Weezevent API (tenant: ${tenantId}, integration: ${integrationId})`,
        );

        try {
            const result = await this.syncService.syncSingleTransaction(
                tenantId,
                integrationId,
                transactionId,
            );

            this.logger.log(
                `Transaction ${transactionId} synced successfully (created: ${result.created}, updated: ${result.updated})`,
            );
        } catch (error) {
            this.logger.error(
                `Failed to sync transaction ${transactionId}`,
                error.stack,
            );
            throw error;
        }

        await this.queueLiveAggregation(tenantId, integrationId, `transaction ${transactionId}`);
    }

    /**
     * BUG-109 / BUG-379-02 : après une écriture de transaction, agrégation live par minute
     * (coalescée) pour les events en direct de cette intégration. Best-effort : une erreur ici
     * ne fait pas échouer le webhook, la réconciliation périodique rattrape.
     */
    private async queueLiveAggregation(tenantId: string, integrationId: string, reason: string): Promise<void> {
        try {
            const events = (await this.liveWindow.findLiveEvents()).filter(
                (e) => e.tenantId === tenantId && (e.integrationId === integrationId || !e.integrationId),
            );
            for (const group of LiveEventWindowService.groupBySpaceAndIntegration(events)) {
                await this.liveTrigger.queueMinuteAggregation(group, 'webhook-live');
            }
        } catch (error) {
            this.logger.warn(`Could not queue live aggregation after ${reason}: ${(error as Error).message}`);
        }
    }

    /**
     * Mark a transaction as deleted (soft delete).
     *
     * BUG-028 (corrigé) : ne mettait à jour que syncedAt, ne marquant rien comme réellement
     * supprimé malgré son nom — une transaction supprimée côté Weezevent restait visible et
     * comptée dans l'agrégation. deletedAt est maintenant exclu explicitement des requêtes
     * d'agrégation (aggregation.service.ts, executeProcessEvents).
     */
    private async markTransactionAsDeleted(
        tenantId: string,
        integrationId: string,
        transactionId: string,
    ): Promise<void> {
        const now = new Date();
        const updated = await this.prisma.salesTransaction.updateMany({
            where: { tenantId, integrationId, externalId: transactionId, deletedAt: null },
            data: {
                deletedAt: now,
                syncedAt: now,
            },
        });

        if (updated.count === 0) {
            this.logger.warn(`Transaction ${transactionId} not found (or already deleted)`);
        } else {
            this.logger.log(`Marked transaction ${transactionId} as deleted`);
        }
    }

    /**
     * Handle order webhook event (create/update)
     */
    private async handleOrderEvent(event: WebhookEvent): Promise<void> {
        const { method, payload } = event;
        const orderId = (payload.id ?? payload.data?.id)?.toString();
        const eventId = (payload.values?.event_id ?? payload.data?.event_id)?.toString();

        if (!orderId || !eventId) {
            throw new Error('Order ID or Event ID not found in webhook payload');
        }

        this.logger.log(`Handling order ${method} for ID: ${orderId}`);

        switch (method) {
            case 'create':
            case 'update':
                // Trigger immediate sync for this event's orders
                await this.syncService.syncOrders(event.tenantId, event.integrationId, eventId);
                break;

            default:
                this.logger.warn(`Unknown order method: ${method}`);
        }
    }

    /**
     * Handle product webhook event (update)
     */
    private async handleProductEvent(event: WebhookEvent): Promise<void> {
        const { method, payload } = event;
        const productId = (payload.id ?? payload.data?.id)?.toString();

        if (!productId) {
            throw new Error('Product ID not found in webhook payload');
        }

        this.logger.log(`Handling product ${method} for ID: ${productId}`);

        switch (method) {
            case 'update':
                // Trigger full products sync to get updated data
                await this.syncService.syncProducts(event.tenantId, event.integrationId);
                break;

            default:
                this.logger.warn(`Unknown product method: ${method}`);
        }
    }
}
