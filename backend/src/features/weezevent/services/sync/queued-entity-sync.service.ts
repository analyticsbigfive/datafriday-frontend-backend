import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { WeezeventClientService } from '../weezevent-client.service';
import { SyncResult } from '../weezevent-sync.service';
import { QueuedEntityRow, QueuedEntityTable, upsertQueuedEntities } from './queued-entity.queries';

/**
 * WeezeventQueuedEntitySyncService
 *
 * SRP: owns entity syncs that are dispatched via BullMQ jobs or webhook callbacks.
 * - syncOrders / syncPrices / syncAttendees, appelés par data-sync.processor (et syncOrders
 *   par webhook-event.handler).
 */
@Injectable()
export class WeezeventQueuedEntitySyncService {
    private readonly logger = new Logger(WeezeventQueuedEntitySyncService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly weezeventClient: WeezeventClientService,
    ) {}

    // ─────────────────────────────────────────────────────────────
    // Orders / Prices / Attendees (BullMQ queue jobs)
    // ─────────────────────────────────────────────────────────────

    async syncOrders(tenantId: string, integrationId: string, eventId: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'orders', success: false,
            itemsSynced: 0, itemsCreated: 0, itemsUpdated: 0, errors: 0, duration: 0,
        };

        try {
            const integration = await this.prisma.integration.findUnique({
                where: { id: integrationId },
                select: { id: true, tenantId: true, weezevent: { select: { organizationId: true } } },
            });
            if (!integration || integration.tenantId !== tenantId || !integration.weezevent?.organizationId) {
                throw new NotFoundException(`Weezevent integration ${integrationId} not configured for tenant ${tenantId}`);
            }
            const organizationId = integration.weezevent.organizationId;
            this.logger.log(`Syncing orders for event ${eventId}`);

            let page = 1;
            let hasMore = true;

            while (hasMore) {
                // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, une page après l'autre
                const response = await this.weezeventClient.getOrders(
                    tenantId, integrationId, organizationId, eventId, { page, perPage: 100 },
                );

                // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, une page après l'autre
                await this.writePage('WeezeventOrder', tenantId, integrationId, response.data.map((apiOrder: any) => ({
                    weezeventId: apiOrder.id.toString(),
                    values: {
                        eventId, eventName: apiOrder.event_name || null,
                        userId: apiOrder.user_id?.toString() || null,
                        userEmail: apiOrder.user_email || null,
                        status: apiOrder.status || 'unknown',
                        totalAmount: apiOrder.total_amount || 0,
                        orderDate: apiOrder.order_date ? new Date(apiOrder.order_date) : new Date(),
                        paymentMethod: apiOrder.payment_method || null,
                        metadata: apiOrder.metadata || null,
                        rawData: apiOrder,
                    },
                })), result, 'order');

                hasMore = page < response.meta.total_pages;
                page++;
            }

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;
            this.logger.log(`Orders sync completed: ${result.itemsSynced} synced in ${result.duration}ms`);
            return result;
        } catch (error) {
            this.logger.error('Orders sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    async syncPrices(tenantId: string, integrationId: string, eventId?: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'prices', success: false,
            itemsSynced: 0, itemsCreated: 0, itemsUpdated: 0, errors: 0, duration: 0,
        };

        try {
            const integration = await this.prisma.integration.findUnique({
                where: { id: integrationId },
                select: { id: true, tenantId: true, weezevent: { select: { organizationId: true } } },
            });
            if (!integration || integration.tenantId !== tenantId || !integration.weezevent?.organizationId) {
                throw new NotFoundException(`Weezevent integration ${integrationId} not configured for tenant ${tenantId}`);
            }
            const organizationId = integration.weezevent.organizationId;
            this.logger.log(`Syncing prices${eventId ? ` for event ${eventId}` : ''}`);

            const response = await this.weezeventClient.getPrices(
                tenantId, integrationId, organizationId, eventId, { perPage: 100 },
            );

            await this.writePage('WeezeventPrice', tenantId, integrationId, response.data.map((apiPrice: any) => ({
                weezeventId: apiPrice.id.toString(),
                values: {
                    eventId: eventId || apiPrice.event_id?.toString() || null,
                    productId: apiPrice.product_id?.toString() || null,
                    name: apiPrice.name || 'Unnamed Price',
                    amount: apiPrice.amount || 0,
                    currency: apiPrice.currency || 'EUR',
                    validFrom: apiPrice.valid_from ? new Date(apiPrice.valid_from) : null,
                    validUntil: apiPrice.valid_until ? new Date(apiPrice.valid_until) : null,
                    priceType: apiPrice.price_type || null,
                    metadata: apiPrice.metadata || null,
                    rawData: apiPrice,
                },
            })), result, 'price');

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;
            this.logger.log(`Prices sync completed: ${result.itemsSynced} synced in ${result.duration}ms`);
            return result;
        } catch (error) {
            this.logger.error('Prices sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    async syncAttendees(tenantId: string, integrationId: string, eventId: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'attendees', success: false,
            itemsSynced: 0, itemsCreated: 0, itemsUpdated: 0, errors: 0, duration: 0,
        };

        try {
            const integration = await this.prisma.integration.findUnique({
                where: { id: integrationId },
                select: { id: true, tenantId: true, weezevent: { select: { organizationId: true } } },
            });
            if (!integration || integration.tenantId !== tenantId || !integration.weezevent?.organizationId) {
                throw new NotFoundException(`Weezevent integration ${integrationId} not configured for tenant ${tenantId}`);
            }
            const organizationId = integration.weezevent.organizationId;
            this.logger.log(`Syncing attendees for event ${eventId}`);

            let page = 1;
            let hasMore = true;

            while (hasMore) {
                // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, une page après l'autre
                const response = await this.weezeventClient.getAttendees(
                    tenantId, integrationId, organizationId, eventId, { page, perPage: 100 },
                );

                // eslint-disable-next-line no-await-in-loop -- pagination de l'API Weezevent, une page après l'autre
                await this.writePage('WeezeventAttendee', tenantId, integrationId, response.data.map((apiAttendee: any) => ({
                    weezeventId: apiAttendee.id.toString(),
                    values: {
                        eventId, eventName: apiAttendee.event_name || null,
                        email: apiAttendee.email || null,
                        firstName: apiAttendee.first_name || null,
                        lastName: apiAttendee.last_name || null,
                        ticketType: apiAttendee.ticket_type || null,
                        status: apiAttendee.status || 'unknown',
                        metadata: apiAttendee.metadata || null,
                        rawData: apiAttendee,
                    },
                })), result, 'attendee');

                hasMore = page < response.meta.total_pages;
                page++;
            }

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;
            this.logger.log(`Attendees sync completed: ${result.itemsSynced} synced in ${result.duration}ms`);
            return result;
        } catch (error) {
            this.logger.error('Attendees sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Écrit une page de l'API en une requête groupée. Si le lot échoue (une ligne invalide),
     * on repasse ligne par ligne pour n'écarter que la ligne fautive, comme avant le passage
     * en lot, et la compter en erreur.
     */
    private async writePage(
        table: QueuedEntityTable,
        tenantId: string,
        integrationId: string,
        rows: QueuedEntityRow[],
        result: SyncResult,
        label: string,
    ): Promise<void> {
        const apply = (counts: { created: number; updated: number }) => {
            result.itemsCreated += counts.created;
            result.itemsUpdated += counts.updated;
            result.itemsSynced += counts.created + counts.updated;
        };
        try {
            apply(await upsertQueuedEntities(this.prisma, table, tenantId, integrationId, rows));
            return;
        } catch (error) {
            this.logger.warn(`Lot de ${rows.length} ${label}(s) en échec, reprise ligne par ligne : ${(error as Error).message}`);
        }
        for (const row of rows) {
            try {
                // eslint-disable-next-line no-await-in-loop -- reprise après échec du lot : isole la ligne fautive
                apply(await upsertQueuedEntities(this.prisma, table, tenantId, integrationId, [row]));
            } catch (error) {
                this.logger.error(`Failed to sync ${label} ${row.weezeventId}`, error);
                result.errors++;
            }
        }
    }
}
