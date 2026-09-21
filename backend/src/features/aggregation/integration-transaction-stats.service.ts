import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';

export interface UnregisteredDateRow {
  date: string;
  transactionCount: number;
  revenue: number;
}

export interface IntegrationTransactionStats {
  unregisteredDates: UnregisteredDateRow[];
  total: number;
  matched: number;
  unmatched: number;
  unmappedLocationIds: string[];
}

const CACHE_PREFIX = 'agg-status-tx-stats';
const CACHE_TTL_SEC = 60;

/**
 * Statistiques transactions d'une intégration pour la page statut d'agrégation
 * (AggregationService.getEventsTimelineStatus) : jours de vente sans event, couverture
 * total/matched, PdV non mappés.
 *
 * Avant : trois requêtes en parallèle, chacune parcourant toutes les transactions de
 * l'intégration (GROUP BY date, COUNT FILTER, DISTINCT locationId avec LEFT JOIN), 5 à 8 s
 * chacune sous charge (pg_stat_statements 2026-09-21). Ici : UN scan par date (index
 * tenantId+integrationId, ~100 ms) dont on dérive les trois vues en mémoire, un EXISTS par
 * PdV pour les non mappés (~6 ms), et un cache de 60 s par (tenant, space, intégration).
 */
@Injectable()
export class IntegrationTransactionStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async compute(input: {
    tenantId: string;
    spaceId: string;
    integrationId: string;
    /** Dates (YYYY-MM-DD) des events passés de l'espace : numérateur "matched". */
    pastEventDates: string[];
  }): Promise<IntegrationTransactionStats> {
    const { tenantId, spaceId, integrationId } = input;
    const cacheKey = `${tenantId}:${spaceId}:${integrationId}`;
    const cached = await this.redis.get<IntegrationTransactionStats>(cacheKey, CACHE_PREFIX);
    if (cached && Array.isArray(cached.unregisteredDates)) return cached;

    const [dailyRows, coveringEvents, unmappedRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ date: Date | string; transactionCount: number; revenue: number }>>(Prisma.sql`
        SELECT DATE(t."transactionDate") AS "date",
               COUNT(*)::int AS "transactionCount",
               SUM(t."amount")::float AS "revenue"
        FROM "WeezeventTransaction" t
        WHERE t."tenantId" = ${tenantId} AND t."integrationId" = ${integrationId}
        GROUP BY DATE(t."transactionDate")
        ORDER BY DATE(t."transactionDate") DESC
      `),
      // BUG-368-02 : un Event qui déclare explicitement SON intégration ne "couvre" que ses
      // transactions ; les events legacy sans integrationId couvrent par coïncidence de date.
      this.prisma.event.findMany({
        where: { tenantId, spaceId, OR: [{ integrationId: null }, { integrationId }] },
        select: { eventDate: true },
      }),
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT l."id"
        FROM "WeezeventLocation" l
        WHERE l."tenantId" = ${tenantId} AND l."integrationId" = ${integrationId}
          AND NOT EXISTS (
            SELECT 1 FROM "WeezeventLocationShopMapping" m
            WHERE m."tenantId" = l."tenantId" AND m."weezeventLocationId" = l."id"
          )
          AND EXISTS (
            SELECT 1 FROM "WeezeventTransaction" t
            WHERE t."tenantId" = l."tenantId" AND t."locationId" = l."id" AND t."integrationId" = l."integrationId"
          )
      `),
    ]);

    const coveringDates = new Set(coveringEvents.map((e) => toIsoDate(e.eventDate)));
    const matchedDates = new Set(input.pastEventDates);

    let total = 0;
    let matched = 0;
    const unregisteredDates: UnregisteredDateRow[] = [];
    for (const row of dailyRows) {
      const date = toIsoDate(row.date);
      const count = Number(row.transactionCount) || 0;
      total += count;
      if (matchedDates.has(date)) matched += count;
      if (!coveringDates.has(date)) {
        // Même format sur le fil que l'ancien $queryRaw (DATE → Date minuit UTC sérialisée en ISO).
        unregisteredDates.push({ date: `${date}T00:00:00.000Z`, transactionCount: count, revenue: Number(row.revenue) || 0 });
      }
    }

    const stats: IntegrationTransactionStats = {
      unregisteredDates,
      total,
      matched,
      unmatched: total - matched,
      unmappedLocationIds: unmappedRows.map((r) => r.id),
    };
    await this.redis.set(cacheKey, stats, { prefix: CACHE_PREFIX, ttl: CACHE_TTL_SEC });
    return stats;
  }
}

/** DATE() Postgres arrive en Date (minuit UTC) ou en chaîne selon le driver : normalise en YYYY-MM-DD. */
function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
