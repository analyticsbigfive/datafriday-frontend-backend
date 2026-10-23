import { constantBasket } from './cost-tracking-basket.util';
import { SupplierShareSeries } from './cost-tracking-supplier-share.util';
import { averageStaircase } from './cost-tracking-series.util';
import { CostTrackingAggregate } from './cost-tracking.types';
import type { CostTrackingLine } from './services/cost-tracking-series.service';

export interface SupplierLineInput {
  key: string;
  name: string;
  articleIds: string[];
}

/**
 * Une ligne par fournisseur (dans l'ordre fourni) : pour chaque article qui l'utilise, la part de son coût
 * par pièce venant de ce fournisseur, puis moyenne ou somme de ces parts (`aggregate`), `basket` à panier
 * constant. `articleCount` = articles pris en compte. `shares` : articleId puis clé de fournisseur.
 */
export function buildSupplierShareLines(
  suppliers: SupplierLineInput[],
  shares: Map<string, Map<string, SupplierShareSeries>>,
  aggregate: CostTrackingAggregate,
): CostTrackingLine[] {
  return suppliers
    .map((s): CostTrackingLine => {
      const memberPoints = s.articleIds.map((id) => shares.get(id)?.get(s.key)?.points ?? []).filter((p) => p.length > 0);
      return {
        key: `supplier:${s.key}`, kind: 'supplier', id: s.key, name: s.name, typeName: null, categoryName: null,
        articleCount: memberPoints.length, revenueHt: null, quantity: null,
        basket: constantBasket(memberPoints, aggregate),
        points: averageStaircase(memberPoints, aggregate),
      };
    })
    .filter((l) => l.points.length > 0);
}
