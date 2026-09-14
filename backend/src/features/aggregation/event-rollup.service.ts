import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * BUG-033 : rollup Event.revenue / transactionCount / avgSpendPerTx / perCapita depuis
 * SpaceRevenueMinuteAgg, même source que getEventStats(). perCapita reste null sans
 * vraie donnée de billetterie (ticketsScanned / ticketsSold).
 */
@Injectable()
export class EventRollupService {
  constructor(private readonly prisma: PrismaService) {}

  async refresh(
    tenantId: string,
    spaceId: string,
    event: { id: string; ticketsScanned: number | null; ticketsSold: number | null },
  ): Promise<{ revenue: number; transactionCount: number }> {
    const rollup = await this.prisma.spaceRevenueMinuteAgg.aggregate({
      where: { tenantId, spaceId, weezeventEventId: event.id },
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
