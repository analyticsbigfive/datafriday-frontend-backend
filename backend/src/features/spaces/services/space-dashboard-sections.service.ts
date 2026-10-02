import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { FiltersDto, KpisDto, ChartsDto, ListsDto, DashboardGranularity } from '../dto';
import { dailySpaceRevenue, dailySpaceRevenueByElement } from './space-dashboard.queries';

/**
 * Sections du tableau de bord d'un espace : filtres disponibles, indicateurs, graphiques et listes.
 */
@Injectable()
export class SpaceDashboardSectionsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getFilters(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<FiltersDto> {
    // Get location mapping for this space
    const locationMappings =
      await this.prisma.locationSpaceMapping.findMany({
        where: { tenantId, spaceId },
      });

    const locationIds = locationMappings.map((m) => m.salesLocationId);

    // Get events from transactions in date range
    const events = await this.prisma.salesEvent.findMany({
      where: {
        tenantId,
        transactions: {
          some: {
            locationId: { in: locationIds },
            transactionDate: {
              gte: new Date(from),
              lte: new Date(to),
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
      },
      distinct: ['id'],
    });

    // Get merchants from transactions
    const merchants = await this.prisma.weezeventMerchant.findMany({
      where: {
        tenantId,
        transactions: {
          some: {
            locationId: { in: locationIds },
            transactionDate: {
              gte: new Date(from),
              lte: new Date(to),
            },
          },
        },
      },
      select: {
        weezeventId: true,
        name: true,
      },
      distinct: ['weezeventId'],
    });

    // Get merchant-element mappings
    const merchantMappings =
      await this.prisma.locationShopMapping.findMany({
        where: {
          tenantId,
          salesLocationId: { in: merchants.map((m) => m.weezeventId) },
        },
        select: {
          salesLocationId: true,
          spaceElementId: true,
        },
      });

    const spaceElements = merchantMappings.length
      ? await this.prisma.spaceElement.findMany({
          where: {
            id: { in: merchantMappings.map((m) => m.spaceElementId) },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const spaceElementById = new Map(
      spaceElements.map((element) => [element.id, element]),
    );

    // Get locations
    const locations = await this.prisma.salesLocation.findMany({
      where: {
        externalId: { in: locationIds },
      },
      select: {
        externalId: true,
        name: true,
      },
    });

    return {
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        startDate: e.startDate?.toISOString() || null,
      })),
      shops: merchantMappings
        .map((m) => ({
          spaceElementId: m.spaceElementId,
          spaceElement: spaceElementById.get(m.spaceElementId),
        }))
        .filter(
          (
            m,
          ): m is {
            spaceElementId: string;
            spaceElement: { id: string; name: string };
          } => Boolean(m.spaceElement),
        )
        .map((m) => ({
          spaceElementId: m.spaceElementId,
          name: m.spaceElement.name,
        })),
      weezevent: {
        locations: locations.map((l) => ({
          weezeventLocationId: l.externalId,
          name: l.name,
        })),
        merchants: merchants.map((m) => ({
          weezeventMerchantId: m.weezeventId,
          name: m.name,
        })),
      },
    };
  }

  async getKpis(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<KpisDto> {
    const aggregates = await this.prisma.spaceRevenueMinuteAgg.aggregate({
      where: {
        tenantId,
        spaceId,
        minute: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      _sum: {
        revenueHt: true,
        transactionsCount: true,
        itemsCount: true,
      },
    });

    const totalRevenue = Number(aggregates._sum.revenueHt || 0);
    const totalTransactions = aggregates._sum.transactionsCount || 0;
    const avgTicket =
      totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Get distinct event IDs in this space's aggregation window
    const aggEvents = await this.prisma.spaceRevenueMinuteAgg.findMany({
      where: {
        tenantId,
        spaceId,
        minute: { gte: new Date(from), lte: new Date(to) },
        weezeventEventId: { not: null },
      },
      distinct: ['weezeventEventId'],
      select: { weezeventEventId: true },
    });
    const eventIds = aggEvents
      .map(r => r.weezeventEventId)
      .filter((id): id is string => id !== null);

    // Count attendees + refunds in parallel
    const [attendees, refundedTxCount, totalTxCount] = await Promise.all([
      eventIds.length > 0
        ? this.prisma.weezeventAttendee.count({
            where: { tenantId, eventId: { in: eventIds } },
          })
        : Promise.resolve(0),
      this.prisma.salesTransaction.count({
        where: { tenantId, status: 'refunded' },
      }),
      this.prisma.salesTransaction.count({ where: { tenantId } }),
    ]);

    const revenuePerAttendee = attendees > 0 ? totalRevenue / attendees : 0;
    const conversionRate = attendees > 0 ? Math.min(1, totalTransactions / attendees) : 0;
    const refundRate = totalTxCount > 0 ? refundedTxCount / totalTxCount : 0;

    // Get top category
    const topCategory = await this.getTopCategory(spaceId, tenantId, from, to);

    return {
      revenueHt: totalRevenue,
      transactions: totalTransactions,
      avgTicketHt: avgTicket,
      attendees,
      revenuePerAttendee,
      conversionRate,
      topSellingCategory: topCategory,
      refundRate,
    };
  }

  private async getTopCategory(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<string | null> {
    const topProduct = await this.prisma.spaceProductRevenueDailyAgg.groupBy({
      by: ['weezeventProductId'],
      where: {
        tenantId,
        spaceId,
        day: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      _sum: {
        revenueHt: true,
      },
      orderBy: {
        _sum: {
          revenueHt: 'desc',
        },
      },
      take: 1,
    });

    if (topProduct.length === 0) return null;

    const product = await this.prisma.salesProduct.findUnique({
      where: { id: topProduct[0].weezeventProductId },
      select: { categoryId: true },
    });

    return product?.categoryId || null;
  }

  async getCharts(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
    // Non appliquée : le graphique est toujours agrégé à la journée, quelle que soit la
    // granularité demandée (la clé de cache, elle, en tient compte).
    _granularity: DashboardGranularity,
  ): Promise<ChartsDto> {
    // Get revenue over time — agrégé à la journée depuis SpaceRevenueMinuteAgg
    const revenueData = await dailySpaceRevenue(this.prisma, tenantId, spaceId, new Date(from), new Date(to));

    const labels = revenueData.map((d) => d.day);
    const values = revenueData.map((d) => Number(d.revenue || 0));

    // Get revenue by shop — agrégé à la journée depuis SpaceRevenueMinuteAgg
    const shopData = await dailySpaceRevenueByElement(this.prisma, tenantId, spaceId, new Date(from), new Date(to));

    // Group by shop
    const shopSeries = new Map<string, { label: string; values: number[] }>();

    // ⚡ Fix N+1: charger tous les SpaceElement en UNE requête, puis indexer en Map
    const elementIds = Array.from(
      new Set(
        shopData
          .map((d) => d.spaceElementId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const elements = elementIds.length
      ? await this.prisma.spaceElement.findMany({
          where: { id: { in: elementIds } },
          select: { id: true, name: true },
        })
      : [];
    const elementNameById = new Map(elements.map((e) => [e.id, e.name]));

    for (const data of shopData) {
      if (!data.spaceElementId) continue;

      if (!shopSeries.has(data.spaceElementId)) {
        shopSeries.set(data.spaceElementId, {
          label: elementNameById.get(data.spaceElementId) || 'Unknown',
          values: new Array(labels.length).fill(0),
        });
      }

      const dayIndex = labels.indexOf(data.day);
      if (dayIndex >= 0) {
        shopSeries.get(data.spaceElementId)!.values[dayIndex] = Number(
          data.revenue || 0,
        );
      }
    }

    return {
      revenueOverTime: {
        labels,
        series: [
          {
            key: 'total',
            label: 'Total',
            values,
          },
        ],
      },
      revenueByShopOverTime: {
        labels,
        series: Array.from(shopSeries.entries()).map(([id, data]) => ({
          key: `shop:${id}`,
          label: data.label,
          values: data.values,
        })),
      },
    };
  }

  async getLists(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<ListsDto> {
    // Top shops
    const topShops = await this.prisma.spaceRevenueMinuteAgg.groupBy({
      by: ['spaceElementId'],
      where: {
        tenantId,
        spaceId,
        minute: {
          gte: new Date(from),
          lte: new Date(to),
        },
        spaceElementId: { not: null },
      },
      _sum: {
        revenueHt: true,
      },
      orderBy: {
        _sum: {
          revenueHt: 'desc',
        },
      },
      take: 10,
    });

    // ⚡ Fix N+1: une seule requête au lieu de N findUnique
    const topShopElementIds = topShops
      .map((s) => s.spaceElementId)
      .filter((id): id is string => Boolean(id));
    const topShopElements = topShopElementIds.length
      ? await this.prisma.spaceElement.findMany({
          where: { id: { in: topShopElementIds } },
          select: { id: true, name: true },
        })
      : [];
    const topShopNameById = new Map(topShopElements.map((e) => [e.id, e.name]));

    const topShopsWithNames = topShops.map((shop) => ({
      spaceElementId: shop.spaceElementId!,
      name: topShopNameById.get(shop.spaceElementId!) || 'Unknown',
      revenueHt: Number(shop._sum.revenueHt || 0),
    }));

    // Top products
    const topProducts = await this.prisma.spaceProductRevenueDailyAgg.groupBy({
      by: ['weezeventProductId'],
      where: {
        tenantId,
        spaceId,
        day: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      _sum: {
        revenueHt: true,
        quantity: true,
      },
      orderBy: {
        _sum: {
          revenueHt: 'desc',
        },
      },
      take: 10,
    });

    // ⚡ Fix N+1: une seule requête au lieu de N findUnique
    const productIds = topProducts.map((p) => p.weezeventProductId);
    const products = productIds.length
      ? await this.prisma.salesProduct.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const productNameById = new Map(products.map((p) => [p.id, p.name]));

    const topProductsWithNames = topProducts.map((product) => ({
      weezeventProductId: product.weezeventProductId,
      name: productNameById.get(product.weezeventProductId) || 'Unknown',
      revenueHt: Number(product._sum.revenueHt || 0),
      quantity: product._sum.quantity || 0,
    }));

    return {
      topShops: topShopsWithNames,
      topProducts: topProductsWithNames,
    };
  }
}
