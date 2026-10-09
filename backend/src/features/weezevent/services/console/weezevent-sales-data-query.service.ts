import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { findDistinctMerchantIds } from '../../../../shared/sales/distinct-merchants.queries';
import { GetTransactionsQueryDto } from '../../dto/get-transactions-query.dto';
import { WeezeventClientService } from '../weezevent-client.service';
import { WeezeventGetEventsQueryDto, WeezeventGetLocationsQueryDto, WeezeventGetMerchantsQueryDto, WeezeventGetOrdersQueryDto, WeezeventGetPricesQueryDto, WeezeventGetAttendeesQueryDto } from '../../dto/weezevent.query.dto';

/**
 * Lectures paginées des données Weezevent synchronisées (transactions, événements, lieux, marchands, commandes, prix, participants).
 */
@Injectable()
export class WeezeventSalesDataQueryService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly weezeventClient: WeezeventClientService,
    ) { }

    /**
     * Get synced transactions from database
     */
    async getTransactions(user: any, query: GetTransactionsQueryDto) {
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
    async getTransaction(user: any, id: string) {
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
    async getRawTransactions(user: any, query: GetTransactionsQueryDto) {
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
     * Get events
     */
    async getEvents(user: any, params: WeezeventGetEventsQueryDto) {
        const { page = 1, perPage = 50, integrationId, status, search, startDateFrom, startDateTo } = params;
        const tenantId = user.tenantId;
        const p = page || 1;
        const pp = Math.min(perPage || 50, 500);

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
    async getLocations(user: any, params: WeezeventGetLocationsQueryDto) {
        const { page = 1, perPage = 100, integrationId, type } = params;
        const tenantId = user.tenantId;
        const p = page || 1;
        const pp = Math.min(perPage || 100, 500);

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
    async getMerchants(user: any, params: WeezeventGetMerchantsQueryDto) {
        const { page = 1, perPage = 100, integrationId, locationId } = params;
        const tenantId = user.tenantId;
        const p = page || 1;
        const pp = Math.min(perPage || 100, 500);

        // If locationId provided, find merchants via transactions at that location
        if (locationId) {
            const ids = await findDistinctMerchantIds(this.prisma, {
                tenantId,
                locationId,
                integrationIds: integrationId ? [integrationId] : undefined,
            });

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
     * Get orders
     */
    async getOrders(user: any, params: WeezeventGetOrdersQueryDto) {
        const { page = 1, perPage = 50, integrationId, eventId } = params;
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
    async getPrices(user: any, params: WeezeventGetPricesQueryDto) {
        const { page = 1, perPage = 50, integrationId, eventId } = params;
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
    async getAttendees(user: any, params: WeezeventGetAttendeesQueryDto) {
        const { page = 1, perPage = 50, integrationId, eventId } = params;
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
}
