import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventAnalyticsGetSalesByProductQueryDto, WeezeventAnalyticsGetSalesByEventQueryDto, WeezeventAnalyticsGetMarginAnalysisQueryDto, WeezeventAnalyticsGetTopProductsQueryDto } from '../dto/weezevent-analytics.query.dto';
import { AnalyticsFilter, productRevenue, salesByEvent, salesByProduct, soldLinesWithMenuItemCost } from './weezevent-sales-analytics.queries';

/** Période maximale d'une analyse sans événement. */
const MAX_ANALYTICS_SPAN_MS = 366 * 24 * 3600 * 1000;

/**
 * Analyses de ventes Weezevent : ventes par produit et par événement, marges, meilleurs produits.
 * Agrégées en SQL (`weezevent-sales-analytics.queries.ts`) : avant, toutes les transactions
 * de la période étaient chargées en mémoire avec leurs lignes, et un mois de ventes suffisait
 * à faire tomber l'API.
 */
@Injectable()
export class WeezeventSalesAnalyticsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    /**
     * Get sales by product
     */
    async getSalesByProduct(user: any, params: WeezeventAnalyticsGetSalesByProductQueryDto) {
        const { eventId, fromDate, toDate } = params;
        const data = await salesByProduct(this.prisma, this.analyticsFilter(user.tenantId, { eventId, fromDate, toDate }));
        return {
            data,
            meta: {
                total: data.length,
                fromDate,
                toDate,
                eventId,
            },
        };
    }

    /**
     * Get sales by event
     */
    async getSalesByEvent(user: any, params: WeezeventAnalyticsGetSalesByEventQueryDto) {
        const { fromDate, toDate } = params;
        const data = await salesByEvent(this.prisma, this.analyticsFilter(user.tenantId, { fromDate, toDate }));
        return {
            data,
            meta: {
                total: data.length,
                fromDate,
                toDate,
            },
        };
    }

    /**
     * Get margin analysis (sales vs costs)
     */
    async getMarginAnalysis(user: any, params: WeezeventAnalyticsGetMarginAnalysisQueryDto) {
        const { eventId, fromDate, toDate } = params;
        const lines = await soldLinesWithMenuItemCost(this.prisma, this.analyticsFilter(user.tenantId, { eventId, fromDate, toDate }));

        // Calculate sales and costs
        let totalSales = 0;
        let totalCost = 0;
        let mappedItems = 0;
        let unmappedItems = 0;
        const productMargins: any[] = [];

        for (const line of lines) {
            totalSales += line.sales;
            if (line.menuItemId) {
                const itemCost = (line.menuItemTotalCost ?? 0) * line.quantity;
                totalCost += itemCost;
                mappedItems++;
                productMargins.push({
                    productId: line.productId,
                    productName: line.productName,
                    menuItemId: line.menuItemId,
                    menuItemName: line.menuItemName,
                    quantity: line.quantity,
                    sales: line.sales,
                    cost: itemCost,
                    margin: line.sales - itemCost,
                    marginPercent: line.sales > 0 ? ((line.sales - itemCost) / line.sales) * 100 : 0,
                });
            } else {
                unmappedItems++;
            }
        }

        const totalMargin = totalSales - totalCost;
        const marginPercent = totalSales > 0 ? (totalMargin / totalSales) * 100 : 0;
        const mappingRate = mappedItems + unmappedItems > 0
            ? Math.round((mappedItems / (mappedItems + unmappedItems)) * 100)
            : 0;

        return {
            summary: {
                totalSales,
                totalCost,
                totalMargin,
                marginPercent: Math.round(marginPercent * 100) / 100,
                mappedItems,
                unmappedItems,
                mappingRate,
                // Un item non mappé compte sa vente dans totalSales mais aucun coût (menuItem
                // inconnu) dans totalCost : la marge est donc mécaniquement gonflée dès que
                // unmappedItems > 0, pas seulement quand mappingRate est "bas".
                marginWarning: unmappedItems > 0
                    ? `Marge surestimée : ${unmappedItems} ligne(s) vendue(s) non mappée(s) à un MenuItem sont comptées dans le chiffre d'affaires sans coût connu (taux de mapping ${mappingRate}%).`
                    : null,
            },
            productMargins: productMargins.sort((a, b) => b.margin - a.margin),
            meta: {
                fromDate,
                toDate,
                eventId,
            },
        };
    }

    /**
     * Get top products by revenue
     */
    async getTopProducts(user: any, params: WeezeventAnalyticsGetTopProductsQueryDto) {
        const { limit = 10, eventId, fromDate, toDate } = params;
        const all = await productRevenue(this.prisma, this.analyticsFilter(user.tenantId, { eventId, fromDate, toDate }));
        const data = all
            .map((p) => ({ ...p, averagePrice: p.quantity > 0 ? p.revenue / p.quantity : 0 }))
            .slice(0, limit);
        return {
            data,
            meta: {
                total: all.length,
                limit,
                fromDate,
                toDate,
                eventId,
            },
        };
    }

    /**
     * Filtre commun des analyses. BUG-028 : exclut les transactions supprimées côté Weezevent
     * (soft-delete deletedAt). Sans événement, une période explicite d'au plus 366 jours est
     * exigée.
     */
    private analyticsFilter(tenantId: string, params: { eventId?: string; fromDate?: string; toDate?: string }): AnalyticsFilter {
        const { eventId, fromDate, toDate } = params;
        if (!eventId) {
            const from = fromDate ? new Date(fromDate) : null;
            const to = toDate ? new Date(toDate) : null;
            if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
                throw new BadRequestException('fromDate et toDate sont requis sans eventId (période de 366 jours au plus).');
            }
            if (to < from || to.getTime() - from.getTime() > MAX_ANALYTICS_SPAN_MS) {
                throw new BadRequestException('Période invalide : toDate après fromDate, 366 jours au plus.');
            }
        }
        return {
            tenantId,
            eventId: eventId || undefined,
            fromDate: fromDate ? new Date(fromDate) : undefined,
            toDate: toDate ? new Date(toDate) : undefined,
        };
    }
}
