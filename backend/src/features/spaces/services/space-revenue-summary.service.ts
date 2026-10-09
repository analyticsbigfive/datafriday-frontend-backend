import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { spaceRevenueSummaryCacheKey } from '../../../shared/constants/event-batch-cache';
import { revenueBySpace, ticketsBySpace } from './space-revenue-summary.queries';

export interface SpaceRevenueSummary {
  totalRevenue: number;
  fbRevenue: number;
  merchRevenue: number;
  ticketingCount: number;
  avgTransaction: number;
  avgEvent: number;
  perCapita: number;
}

const CACHE_TTL_SEC = 5 * 60;

/**
 * CA (total/F&B/merch), transactions et billets par espace, calculés depuis les agrégats réels
 * (SpaceRevenueMinuteAgg, corrigé BUG-014/015) et Event, pas depuis les colonnes
 * Space.avgEvent/avgTransaction/perCapita/cachedMetrics qui ne sont jamais écrites.
 * Classification F&B/merch : isMerch = SpaceElement.type === 'merchshop' (StorageShopsSection.vue,
 * space-menus.service.ts). Formules alignées sur useMetricsCalculator.js (moteur Analyse).
 *
 * Cache PAR ESPACE (5 min), indépendant de l'utilisateur : la somme parcourt toutes les lignes
 * d'agrégat minute des espaces demandés (584k lignes, 2,8 s mesurés le 2026-09-21) et le cache
 * de la liste des espaces ne couvrait que les admins à accès complet, page 1, sans recherche.
 * Purgé par eventBatchCachePatterns (fin de job d'agrégation, invalidateSpaceCache).
 */
@Injectable()
export class SpaceRevenueSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSummaries(tenantId: string, spaceIds: string[]): Promise<Map<string, SpaceRevenueSummary>> {
    const summaries = new Map<string, SpaceRevenueSummary>();
    if (spaceIds.length === 0) return summaries;

    const missing: string[] = [];
    for (const spaceId of spaceIds) {
      const cached = await this.redis.get<SpaceRevenueSummary>(spaceRevenueSummaryCacheKey(tenantId, spaceId));
      if (cached && typeof cached.totalRevenue === 'number') summaries.set(spaceId, cached);
      else missing.push(spaceId);
    }
    if (missing.length === 0) return summaries;

    const computed = await this.compute(tenantId, missing);
    for (const spaceId of missing) {
      // Un espace sans agrégat est aussi mis en cache (résultat "0" valide), sinon il serait
      // recalculé à chaque affichage.
      const summary = computed.get(spaceId) ?? EMPTY_SUMMARY;
      summaries.set(spaceId, summary);
      await this.redis.set(spaceRevenueSummaryCacheKey(tenantId, spaceId), summary, { ttl: CACHE_TTL_SEC });
    }
    return summaries;
  }

  private async compute(tenantId: string, spaceIds: string[]): Promise<Map<string, SpaceRevenueSummary>> {
    const [revenueRows, ticketRows] = await Promise.all([
      revenueBySpace(this.prisma, tenantId, spaceIds),
      ticketsBySpace(this.prisma, tenantId, spaceIds),
    ]);

    const ticketsCountBySpace = new Map(ticketRows.map((r) => [r.spaceId, Number(r.ticketsCount) || 0]));
    const out = new Map<string, SpaceRevenueSummary>();
    for (const row of revenueRows) {
      const totalRevenue = Number(row.totalRevenue) || 0;
      const transactionsCount = Number(row.transactionsCount) || 0;
      const eventsWithRevenue = Number(row.eventsWithRevenue) || 0;
      const ticketsCount = ticketsCountBySpace.get(row.spaceId) ?? 0;
      out.set(row.spaceId, {
        totalRevenue,
        fbRevenue: Number(row.fbRevenue) || 0,
        merchRevenue: Number(row.merchRevenue) || 0,
        ticketingCount: ticketsCount,
        avgTransaction: transactionsCount > 0 ? totalRevenue / transactionsCount : 0,
        avgEvent: eventsWithRevenue > 0 ? totalRevenue / eventsWithRevenue : 0,
        perCapita: ticketsCount > 0 ? totalRevenue / ticketsCount : 0,
      });
    }
    return out;
  }
}

const EMPTY_SUMMARY: SpaceRevenueSummary = {
  totalRevenue: 0,
  fbRevenue: 0,
  merchRevenue: 0,
  ticketingCount: 0,
  avgTransaction: 0,
  avgEvent: 0,
  perCapita: 0,
};
