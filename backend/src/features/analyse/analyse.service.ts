import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { eventMinuteTimeline, eventTotals, menuItemCountByType, menuItemPriceStats } from './analyse.queries';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

@Injectable()
export class AnalyseService {
  private readonly logger = new Logger(AnalyseService.name);

  constructor(private prisma: PrismaService, private spaceAccess: SpaceAccessService) {}

  async getDashboard(tenantId: string, spaceId?: string, user?: SpaceScopedUser) {
    this.logger.log(`Getting dashboard for tenant ${tenantId}${spaceId ? ` space ${spaceId}` : ''}`);

    // NB : seuls les events (et le compteur d'espaces) sont scopables par space
    // (Event.spaceId). Menu items, composants, ingrédients et fournisseurs sont des
    // référentiels tenant-level (cf. leurs propres endpoints de liste pour le filtrage
    // par espace accessible — un menu item/fournisseur peut être rattaché à 0..N espaces).
    let eventSpaceScope: Prisma.EventWhereInput = {};
    let spaceScope: Prisma.SpaceWhereInput = {};
    if (spaceId) {
      eventSpaceScope = { spaceId };
      spaceScope = { id: spaceId };
    } else if (user && !this.spaceAccess.hasFullAccess(user)) {
      const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
      if (accessible !== 'ALL') {
        // Un event sans spaceId est un artefact de démappage/import (pas un event
        // « global ») — un utilisateur restreint ne doit compter que ceux de ses espaces.
        eventSpaceScope = { spaceId: { in: accessible } };
        spaceScope = { id: { in: accessible } };
      }
    }

    const [
      menuItemCount,
      componentCount,
      ingredientCount,
      supplierCount,
      eventCount,
      spaceCount,
    ] = await Promise.all([
      this.prisma.menuItem.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.menuComponent.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.ingredient.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.supplier.count({ where: { tenantId } }),
      this.prisma.event.count({ where: { tenantId, ...eventSpaceScope } }),
      this.prisma.space.count({ where: { tenantId, ...spaceScope } }),
    ]);

    return {
      menuItems: menuItemCount,
      components: componentCount,
      ingredients: ingredientCount,
      suppliers: supplierCount,
      events: eventCount,
      spaces: spaceCount,
    };
  }

  async getMenuKpis(tenantId: string) {
    this.logger.log(`Getting menu KPIs for tenant ${tenantId}`);

    // Agrégation en SQL (une passe + un GROUP BY) au lieu de rapatrier tous les
    // items du tenant pour les réduire en JS. Parité avec l'ancien reduce :
    // NULL compté comme 0 dans les moyennes (COALESCE), d'où AVG(COALESCE(x,0))
    // et non AVG(x) qui ignorerait les NULL.
    const [aggRows, typeRows] = await Promise.all([
      menuItemPriceStats(this.prisma, tenantId),
      menuItemCountByType(this.prisma, tenantId),
    ]);

    const agg = aggRows[0];
    const totalItems = Number(agg?.totalItems ?? 0);
    const byType: Record<string, number> = {};
    for (const r of typeRows) byType[r.typeId] = Number(r.count);

    return {
      totalItems,
      avgPrice: Math.round((agg?.avgPrice ?? 0) * 100) / 100,
      avgCost: Math.round((agg?.avgCost ?? 0) * 100) / 100,
      avgMargin: Math.round((agg?.avgMargin ?? 0) * 100) / 100,
      lowMarginItems: Number(agg?.lowMarginItems ?? 0),
      highMarginItems: Number(agg?.highMarginItems ?? 0),
      byType,
    };
  }

  async getEventKpis(tenantId: string, spaceId?: string, user?: SpaceScopedUser) {
    this.logger.log(`Getting event KPIs for tenant ${tenantId}${spaceId ? ` space ${spaceId}` : ''}`);

    // Agrégation en une requête SQL au lieu d'un findMany tenant entier + reduce JS.
    // Parité : revenue NULL → 0 (COALESCE), upcoming = eventDate strictement future,
    // completed = status success/completed.
    let spaceFilter = Prisma.sql``;
    if (spaceId) {
      spaceFilter = Prisma.sql`AND "spaceId" = ${spaceId}`;
    } else if (user && !this.spaceAccess.hasFullAccess(user)) {
      const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
      if (accessible !== 'ALL') {
        // Un event sans spaceId est un artefact de démappage/import (pas un event
        // « global ») — un utilisateur restreint ne voit que les KPIs de ses espaces.
        spaceFilter = accessible.length
          ? Prisma.sql`AND "spaceId" IN (${Prisma.join(accessible)})`
          : Prisma.sql`AND false`;
      }
    }
    const rows = await eventTotals(this.prisma, tenantId, spaceFilter);

    const agg = rows[0];
    const totalEvents = Number(agg?.totalEvents ?? 0);
    const totalRevenue = Number(agg?.totalRevenue ?? 0);

    return {
      totalEvents,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgRevenue: totalEvents > 0 ? Math.round((totalRevenue / totalEvents) * 100) / 100 : 0,
      totalTransactions: Number(agg?.totalTransactions ?? 0),
      upcoming: Number(agg?.upcoming ?? 0),
      completed: Number(agg?.completed ?? 0),
    };
  }

  async getTimeline(
    eventId: string,
    tenantId: string,
    opts: {
      startTime?: string;
      endTime?: string;
      shopId?: string;
      menuItemId?: string;
      limit?: number;
    } = {},
  ) {
    this.logger.log(`GET /analyse/timeline eventId=${eventId} tenant=${tenantId}`);

    // Garde ownership : eventId = WeezeventEvent.id — vérifier qu'il existe et
    // appartient bien au tenant avant d'interroger les transactions. Sans cette
    // vérification, un id inconnu renvoyait silencieusement [] (indiscernable d'un
    // event sans vente) ; la requête reste tenant-scopée dans tous les cas.
    const eventExists = await this.prisma.salesEvent.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true },
    });
    if (!eventExists) {
      throw new NotFoundException(`Event ${eventId} not found for this tenant`);
    }

    const limit = Math.min(opts.limit ?? 1000, 5000);

    const shopFilter = opts.shopId
      ? Prisma.sql`AND t."merchantId" = ${opts.shopId}`
      : Prisma.sql``;

    const menuItemFilter = opts.menuItemId
      ? Prisma.sql`AND wpm."menuItemId" = ${opts.menuItemId}`
      : Prisma.sql``;

    // HH:MM filters applied against the minute dimension
    const startTimeFilter = opts.startTime
      ? Prisma.sql`AND TO_CHAR(DATE_TRUNC('minute', t."transactionDate"), 'HH24:MI') >= ${opts.startTime}`
      : Prisma.sql``;

    const endTimeFilter = opts.endTime
      ? Prisma.sql`AND TO_CHAR(DATE_TRUNC('minute', t."transactionDate"), 'HH24:MI') <= ${opts.endTime}`
      : Prisma.sql``;

    const rows: any[] = await eventMinuteTimeline(this.prisma, tenantId, eventId, shopFilter, menuItemFilter, startTimeFilter, endTimeFilter, limit);

    // Troncature silencieuse : le shape de réponse (array) ne permet pas de flag
    // `truncated` sans breaking change — on trace au minimum côté serveur.
    if (rows.length === limit) {
      this.logger.warn(
        `analyse/timeline eventId=${eventId}: résultat tronqué à LIMIT ${limit} — événement volumineux, données minute partielles`,
      );
    }

    return rows.map((r: any) => ({
      eventId: r.eventId,
      shopId: r.shopId ?? null,
      shopName: r.shopName ?? null,
      weezeventProductId: r.weezeventProductId ?? null,
      menuItemId: r.menuItemId ?? null,
      menuItemName: r.menuItemName ?? null,
      hour: Number(r.hour ?? 0),
      minute: r.minute ?? null,
      quantity: Number(r.quantity ?? 0),
      transactionCount: Number(r.transactionCount ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));
  }

  async getCostBreakdown(tenantId: string) {
    this.logger.log(`Getting cost breakdown for tenant ${tenantId}`);

    const items = await this.prisma.menuItem.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, name: true, basePrice: true, totalCost: true, margin: true,
        productType: { select: { name: true } },
        productCategory: { select: { name: true } },
      },
      orderBy: { margin: 'asc' },
      take: 20,
    });

    return items.map(i => ({
      id: i.id,
      name: i.name,
      basePrice: Number(i.basePrice) || 0,
      totalCost: Number(i.totalCost) || 0,
      margin: Number(i.margin) || 0,
      type: i.productType?.name || 'N/A',
      category: i.productCategory?.name || 'N/A',
    }));
  }
}
