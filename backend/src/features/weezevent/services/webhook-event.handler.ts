import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from './weezevent-sync.service';
import { QueueService } from '../../../core/queue/queue.service';

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
        // QueueService vient de QueueModule (@Global()) — pas besoin de l'importer dans
        // WeezeventModule. Volontairement pas AggregationService : WeezeventModule →
        // AggregationModule → MappingsModule → SpacesModule → WeezeventModule fermerait un
        // cycle de modules (SpacesModule importe déjà WeezeventModule).
        private readonly queueService: QueueService,
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

            // Mark as processed
            await this.prisma.integrationWebhookEvent.update({
                where: { id: eventId },
                data: {
                    processed: true,
                    processedAt: new Date(),
                },
            });

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
        const transactionId = payload.data?.id?.toString();

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
                // Mark transaction as deleted (soft delete)
                await this.markTransactionAsDeleted(transactionId);
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

        // BUG-109 : la transaction est synchronisée, mais SpaceRevenueMinuteAgg (shop-details,
        // KPI par shop) ne se met jamais à jour toute seule — queueAggregationJob() n'avait
        // jusqu'ici aucun appelant automatique, seulement le wizard d'intégration (manuel).
        // Best-effort : une erreur ici ne doit pas faire échouer le sync (déjà réussi) ni
        // déclencher son retry — le cron de secours (WeezeventCronService, safety net) rattrape
        // les cas manqués.
        try {
            await this.triggerLiveAggregation(tenantId, integrationId, transactionId);
        } catch (error) {
            this.logger.warn(
                `Could not queue live aggregation after transaction ${transactionId} sync: ${error.message}`,
            );
        }
    }

    /**
     * Resolves the DataFriday Event + Space concerned by a just-synced transaction, and
     * re-queues its aggregation. No-op if the transaction has no event, or that event has no
     * unambiguous DataFriday Event match yet (Event.weezeventEventId, BUG-021 disambiguation).
     *
     * Mirrors AggregationService.processEvents' job-log-then-enqueue pattern (not called
     * directly — see the module-cycle note on the constructor above).
     */
    private async triggerLiveAggregation(
        tenantId: string,
        integrationId: string,
        transactionId: string,
    ): Promise<void> {
        const transaction = await this.prisma.salesTransaction.findFirst({
            where: { tenantId, integrationId, externalId: transactionId },
            select: { eventId: true },
        });
        if (!transaction?.eventId) return;

        const dfEvent = await this.prisma.event.findFirst({
            where: { tenantId, weezeventEventId: transaction.eventId, spaceId: { not: null } },
            select: { id: true, spaceId: true, eventDate: true },
        });
        if (!dfEvent?.spaceId) return;

        const jobLog = await this.prisma.aggregationJobLog.create({
            data: {
                tenantId,
                spaceId: dfEvent.spaceId,
                jobType: 'incremental',
                status: 'pending',
                fromDate: dfEvent.eventDate,
                toDate: dfEvent.eventDate,
                metadata: { eventIds: [dfEvent.id], trigger: 'webhook-live' },
            },
        });
        await this.queueService.queueAggregationJob({
            type: 'process-events',
            tenantId,
            spaceId: dfEvent.spaceId,
            jobLogId: jobLog.id,
            eventIds: [dfEvent.id],
            integrationId,
        });
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
        transactionId: string,
    ): Promise<void> {
        const now = new Date();
        const updated = await this.prisma.salesTransaction.updateMany({
            where: { externalId: transactionId, deletedAt: null },
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
        const orderId = payload.data?.id?.toString();
        const eventId = payload.data?.event_id?.toString();

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
        const productId = payload.data?.id?.toString();

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
