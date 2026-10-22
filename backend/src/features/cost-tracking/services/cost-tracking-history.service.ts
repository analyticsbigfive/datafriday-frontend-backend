import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

const DEFAULT_LIMIT = 100;

export interface CostTrackingHistoryVersion {
  id: string;
  effectiveFrom: string;
  reason: string;
  sourceRef: unknown;
  totalCost: number;
  numberOfPieces: number;
  costPerPiece: number;
  basePrice: number | null;
  vatRate: number | null;
  /** Variation du coût par pièce par rapport à la version précédente, null pour la plus ancienne. */
  costPerPieceDelta: number | null;
  recipe: unknown;
}

export interface CostTrackingHistoryResponse {
  spaceId: string;
  article: { id: string; name: string };
  versions: CostTrackingHistoryVersion[];
}

/** Historique des versions d'un article (plus récente d'abord), avec la recette figée. */
@Injectable()
export class CostTrackingHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(tenantId: string, spaceId: string, menuItemId: string, limit = DEFAULT_LIMIT): Promise<CostTrackingHistoryResponse> {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: menuItemId, tenantId, deletedAt: null, spaceLinks: { some: { spaceId } } },
      select: { id: true, name: true },
    });
    if (!item) throw new NotFoundException('Article introuvable dans le menu de cet espace.');
    // limit + 1 : la version la plus ancienne renvoyée a besoin de sa précédente pour son delta.
    const rows = await this.prisma.menuItemCostSnapshot.findMany({
      where: { tenantId, menuItemId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
    });
    const versions = rows.slice(0, limit).map((r, i): CostTrackingHistoryVersion => {
      const prev = rows[i + 1];
      const cost = Number(r.costPerPiece);
      return {
        id: r.id,
        effectiveFrom: r.effectiveFrom.toISOString(),
        reason: r.reason,
        sourceRef: r.sourceRef ?? null,
        totalCost: Number(r.totalCost),
        numberOfPieces: r.numberOfPieces,
        costPerPiece: cost,
        basePrice: r.basePrice == null ? null : Number(r.basePrice),
        vatRate: r.vatRate == null ? null : Number(r.vatRate),
        costPerPieceDelta: prev ? Math.round((cost - Number(prev.costPerPiece)) * 10000) / 10000 : null,
        recipe: r.recipe,
      };
    });
    return { spaceId, article: item, versions };
  }
}
