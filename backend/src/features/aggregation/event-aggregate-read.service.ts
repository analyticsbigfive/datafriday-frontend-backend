import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Lectures des agrégats d'un événement : ventilation, statistiques, courbe à la minute.
 */
@Injectable()
export class EventAggregateReadService {
  constructor(
    private prisma: PrismaService,
  ) {}

  /**
   * Breakdown par shops et articles pour un événement donné.
   * Shops : depuis SpaceRevenueMinuteAgg (a weezeventEventId) — agrégé sur toutes les minutes.
   * Articles : depuis SpaceProductRevenueDailyAgg filtré par date de l'événement
   *            (le modèle n'a pas de weezeventEventId — on filtre par day).
   */
  async getEventBreakdown(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const eventDay = new Date(event.eventDate);
    eventDay.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(eventDay);
    nextDay.setDate(nextDay.getDate() + 1);

    const [shopAggs, productAggs] = await Promise.all([
      this.prisma.spaceRevenueMinuteAgg.groupBy({
        by: ['weezeventLocationId', 'spaceElementId'],
        where: { tenantId, spaceId, weezeventEventId: eventId },
        _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      }),
      this.prisma.spaceProductRevenueDailyAgg.groupBy({
        by: ['weezeventProductId'],
        where: { tenantId, spaceId, day: { gte: eventDay, lt: nextDay } },
        _sum: { revenueHt: true, quantity: true },
      }),
    ]);

    // Resolve human-readable names for shops and products
    const locationIds = shopAggs.map((s) => s.weezeventLocationId).filter(Boolean) as string[];
    const productIds = productAggs.map((p) => p.weezeventProductId).filter(Boolean) as string[];

    const [locations, products] = await Promise.all([
      locationIds.length
        ? this.prisma.salesLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true } })
        : [],
      productIds.length
        ? this.prisma.salesProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
        : [],
    ]);

    const locationNameMap = new Map(locations.map((l) => [l.id, l.name] as [string, string]));
    const productNameMap = new Map(products.map((p) => [p.id, p.name] as [string, string]));

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      shops: shopAggs.map((s) => ({
        weezeventLocationId: s.weezeventLocationId,
        spaceElementId: s.spaceElementId,
        shopName: s.weezeventLocationId
          ? (locationNameMap.get(s.weezeventLocationId) ?? s.weezeventLocationId)
          : 'Inconnu',
        revenueHt: Number(s._sum.revenueHt ?? 0),
        transactionsCount: s._sum.transactionsCount ?? 0,
        itemsCount: s._sum.itemsCount ?? 0,
      })),
      products: productAggs.map((p) => ({
        weezeventProductId: p.weezeventProductId,
        productName: productNameMap.get(p.weezeventProductId) ?? p.weezeventProductId,
        revenueHt: Number(p._sum.revenueHt ?? 0),
        quantity: p._sum.quantity ?? 0,
      })),
    };
  }

  /**
   * Statistiques agrégées (totaux) pour un événement donné.
   */
  async getEventStats(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const agg = await this.prisma.spaceRevenueMinuteAgg.aggregate({
      where: { tenantId, spaceId, weezeventEventId: eventId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      _count: { _all: true },
    });

    const shopCount = await this.prisma.spaceRevenueMinuteAgg.findMany({
      where: { tenantId, spaceId, weezeventEventId: eventId, weezeventLocationId: { not: null } },
      select: { weezeventLocationId: true },
      distinct: ['weezeventLocationId'],
    });

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      revenueHt: Number(agg._sum.revenueHt ?? 0),
      transactionsCount: agg._sum.transactionsCount ?? 0,
      itemsCount: agg._sum.itemsCount ?? 0,
      shopCount: shopCount.length,
      aggregationRecords: agg._count._all,
    };
  }

  /**
   * CA par minute pour un événement — alimente l'onglet "CA / minute" dans le détail event.
   * Retourne chaque minute avec au moins 1 transaction, ordonnée chronologiquement.
   */
  async getEventMinuteChart(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const rows = await this.prisma.spaceRevenueMinuteAgg.groupBy({
      by: ['minute'],
      where: { tenantId, spaceId, weezeventEventId: eventId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      orderBy: { minute: 'asc' },
    });

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      data: rows.map((r) => ({
        minute: r.minute,
        revenueHt: Number(r._sum.revenueHt ?? 0),
        transactionsCount: r._sum.transactionsCount ?? 0,
        itemsCount: r._sum.itemsCount ?? 0,
      })),
    };
  }
}
