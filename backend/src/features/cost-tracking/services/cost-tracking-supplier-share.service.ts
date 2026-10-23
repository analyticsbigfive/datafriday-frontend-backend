import { Injectable } from '@nestjs/common';
import { buildSupplierShareSeries, SupplierShareSeries } from '../cost-tracking-supplier-share.util';
import { BrickScope } from './cost-tracking-brick-scope.service';
import { CostTrackingSnapshotReaderService } from './cost-tracking-snapshot-reader.service';

/** Part de coût par fournisseur de chaque article sur la période (voir `buildSupplierShareSeries`). */
@Injectable()
export class CostTrackingSupplierShareService {
  constructor(private readonly reader: CostTrackingSnapshotReaderService) {}

  /**
   * Séries de part fournisseur des articles demandés (clé : articleId puis clé de fournisseur).
   * `scope` doit avoir été résolu avec le périmètre fournisseur (versions et composition chargées).
   */
  async articleShares(
    tenantId: string, articleIds: string[], scope: Pick<BrickScope, 'versions' | 'leaves'>, from: Date, toExclusive: Date, defaultVatRate: number | null,
  ): Promise<Map<string, Map<string, SupplierShareSeries>>> {
    const out = new Map<string, Map<string, SupplierShareSeries>>();
    if (!articleIds.length) return out;
    const recipes = await this.reader.readRecipesForPeriodMany(tenantId, articleIds, from, toExclusive);
    const ctx = { brickVersions: scope.versions, leaves: scope.leaves };
    for (const [articleId, versions] of recipes) out.set(articleId, buildSupplierShareSeries(versions, from, ctx, defaultVatRate));
    return out;
  }
}
