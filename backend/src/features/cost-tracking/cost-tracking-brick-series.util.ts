import { buildArticlePoints } from './cost-tracking-series.util';
import { BrickSnapshotPoint, BrickSupplierChange, SeriesPoint, SnapshotPoint } from './cost-tracking.types';

/** Version de brique vue comme un snapshot d'article d'une pièce : le coût unitaire devient le coût par pièce. */
function asSnapshotPoint(point: BrickSnapshotPoint): SnapshotPoint {
  return {
    id: point.id,
    menuItemId: point.refId,
    effectiveFrom: point.effectiveFrom,
    costPerPiece: point.unitCost,
    totalCost: point.unitCost,
    numberOfPieces: 1,
    basePrice: null,
    vatRate: null,
    reason: point.reason,
  };
}

/**
 * Série en escalier du coût unitaire d'UNE brique. `points` : ses versions triées par date
 * croissante, dont éventuellement la dernière antérieure à `from` (reportée à `from`). Une version
 * qui ne change que le fournisseur ne produit pas de point (voir `buildSupplierChanges`).
 */
export function buildBrickPoints(points: BrickSnapshotPoint[], from: Date): SeriesPoint[] {
  return buildArticlePoints(points.map(asSnapshotPoint), from);
}

/** Séries de plusieurs briques (clé : refId), prêtes pour `averageStaircase`. Les briques sans point sont omises. */
export function buildBrickSeries(byBrick: Map<string, BrickSnapshotPoint[]>, from: Date): Map<string, SeriesPoint[]> {
  const out = new Map<string, SeriesPoint[]>();
  for (const [refId, points] of byBrick) {
    const series = buildBrickPoints(points, from);
    if (series.length) out.set(refId, series);
  }
  return out;
}

/**
 * Changements de fournisseur DANS la période (de `from` inclus à la fin des versions fournies).
 * Le fournisseur d'une version est comparé à celui de la version précédente de la même brique,
 * y compris la version reportée d'avant `from`. Une première version sans précédente n'est pas un changement.
 */
export function buildSupplierChanges(byBrick: Map<string, BrickSnapshotPoint[]>, from: Date): BrickSupplierChange[] {
  const changes: BrickSupplierChange[] = [];
  for (const [refId, points] of byBrick) {
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      if (cur.effectiveFrom.getTime() < from.getTime()) continue;
      if (prev.supplierId === cur.supplierId && prev.supplierName === cur.supplierName) continue;
      changes.push({
        refId,
        name: cur.name,
        at: cur.effectiveFrom.toISOString(),
        fromSupplierId: prev.supplierId,
        fromSupplierName: prev.supplierName,
        toSupplierId: cur.supplierId,
        toSupplierName: cur.supplierName,
        snapshotId: cur.id,
      });
    }
  }
  return changes.sort((a, b) => a.at.localeCompare(b.at));
}
