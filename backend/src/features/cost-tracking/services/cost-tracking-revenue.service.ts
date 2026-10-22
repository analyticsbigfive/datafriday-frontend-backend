import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { queryWithWorkMem } from '../../../core/database/query-with-work-mem';
import { eventTimelineWindowCtes } from '../../spaces/event-timeline-window.sql';
import { SpaceSalesScopeService } from '../../spaces/services/space-sales-scope.service';

export interface ItemRevenue {
  revenueHt: number;
  quantity: number;
}

/** Plafond d'events par lecture (même borne que l'event-timeline). */
const MAX_EVENTS = 100;
const CACHE_TTL_PAST = 3600;
const CACHE_TTL_LIVE = 300;

/**
 * CA HT et quantités par article sur un ensemble d'events, lus sur la pré-agrégation
 * `SpaceRevenueMinuteItemAgg` via le scope de ventes existant (jamais les transactions brutes).
 * Mêmes CTE que le grain `summary` de l'event-timeline : barrière MATERIALIZED sur la fenêtre,
 * aucun filtre sur `integrationId` (BUG-384-02), les produits non mappés sont exclus par le JOIN.
 */
@Injectable()
export class CostTrackingRevenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly salesScope: SpaceSalesScopeService,
  ) {}

  /** Les `MAX_EVENTS` derniers events fournis sont lus ; `considered` donne leur nombre. */
  async revenueByItem(tenantId: string, spaceId: string, eventIds: string[], periodIsOver: boolean): Promise<{ byItem: Map<string, ItemRevenue>; considered: number }> {
    const ids = [...new Set(eventIds.filter(Boolean))].slice(-MAX_EVENTS);
    if (!ids.length) return { byItem: new Map(), considered: 0 };
    const key = `costtracking:revenue:${tenantId}:${spaceId}:${[...ids].sort().join(',')}`;
    const rows = await this.redis.getOrSet<Array<{ menuItemId: string; revenueHt: number; quantity: number }>>(
      key,
      () => this.query(tenantId, spaceId, ids),
      { ttl: periodIsOver ? CACHE_TTL_PAST : CACHE_TTL_LIVE },
    );
    return { byItem: new Map(rows.map((r) => [r.menuItemId, { revenueHt: r.revenueHt, quantity: r.quantity }])), considered: ids.length };
  }

  private async query(tenantId: string, spaceId: string, eventIds: string[]) {
    const scope = await this.salesScope.resolveEventSalesScope(spaceId, eventIds, tenantId);
    if (!scope) return [];
    const { shopScopeClause, valuesSql } = scope;
    const rows = await this.salesScope.analyseBatchSemaphore.run(() => queryWithWorkMem<any[]>(this.prisma, Prisma.sql`
      ${eventTimelineWindowCtes({ tenantId, spaceId, valuesSql, shopScopeClause })}
      SELECT
        wpm."menuItemId"                      AS "menuItemId",
        SUM(dd."revenueHt")::numeric(12,2)    AS "revenueHt",
        SUM(dd."itemsCount")::integer         AS quantity
      FROM dedup dd
      JOIN "WeezeventProductMapping" wpm
        ON wpm."weezeventProductId" = dd."weezeventProductId"
       AND wpm."tenantId" = ${tenantId}
      WHERE wpm."menuItemId" IS NOT NULL
      GROUP BY wpm."menuItemId"
    `));
    return rows.map((r) => ({ menuItemId: r.menuItemId as string, revenueHt: Number(r.revenueHt || 0), quantity: Number(r.quantity || 0) }));
  }
}
