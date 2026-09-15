import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * BUG-033 : rollup Event.revenue / transactionCount / avgSpendPerTx / perCapita depuis
 * SpaceRevenueMinuteAgg, même source que getEventStats(). perCapita reste null sans
 * vraie donnée de billetterie (ticketsScanned / ticketsSold).
 *
 * BUG-384-02 : la somme est restreinte aux intégrations mappées à l'espace
 * (`spaceIntegrationIds`), comme le lecteur item-level de l'Analyse. Sans ce scope, un résidu
 * d'agrégats écrit sous une intégration étrangère (job non scopé) entrait dans le rollup alors
 * que le graphe par PdV l'écartait : deux CA pour le même event (Le Mans-Brest, 112 k€ vs 66 k€).
 * Liste vide (espace sans mapping) = pas de filtre, comportement historique.
 */
@Injectable()
export class EventRollupService {
  constructor(private readonly prisma: PrismaService) {}

  async refresh(
    tenantId: string,
    spaceId: string,
    event: { id: string; ticketsScanned: number | null; ticketsSold: number | null },
    spaceIntegrationIds: ReadonlyArray<string> = [],
  ): Promise<{ revenue: number; transactionCount: number }> {
    const where: Prisma.SpaceRevenueMinuteAggWhereInput = { tenantId, spaceId, weezeventEventId: event.id };
    if (spaceIntegrationIds.length) where.integrationId = { in: [...spaceIntegrationIds] };
    const rollup = await this.prisma.spaceRevenueMinuteAgg.aggregate({
      where,
      _sum: { revenueHt: true, transactionsCount: true },
    });
    const revenue = Number(rollup._sum.revenueHt ?? 0);
    const transactionCount = rollup._sum.transactionsCount ?? 0;
    const attendees = event.ticketsScanned ?? event.ticketsSold ?? null;
    await this.prisma.event.update({
      where: { id: event.id },
      data: {
        revenue,
        transactionCount,
        avgSpendPerTx: transactionCount > 0 ? Math.round((revenue / transactionCount) * 100) / 100 : null,
        perCapita: attendees && attendees > 0 ? Math.round((revenue / attendees) * 100) / 100 : null,
        calculatedAt: new Date(),
      },
    });
    return { revenue, transactionCount };
  }
}
