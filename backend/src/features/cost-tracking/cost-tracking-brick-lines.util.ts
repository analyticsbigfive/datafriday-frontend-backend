import { constantBasket } from './cost-tracking-basket.util';
import { buildBrickPoints } from './cost-tracking-brick-series.util';
import { ResolvedBrick } from './cost-tracking-brick-scope.util';
import { averageStaircase } from './cost-tracking-series.util';
import { CostTrackingAggregate } from './cost-tracking.types';
import type { CostTrackingLine } from './services/cost-tracking-series.service';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

/** Lignes du mode ingrédient (ingrédients et emballages ensemble) ou composant : une ligne par brique, coût unitaire. */
export function buildBrickLines(bricks: ResolvedBrick[], mode: 'ingredient' | 'component', from: Date): CostTrackingLine[] {
  return bricks
    .filter((b) => (mode === 'component' ? b.kind === 'component' : b.kind !== 'component'))
    .map((b): CostTrackingLine => ({
      key: `${mode}:${b.refId}`, kind: mode, id: b.refId, name: b.name, lineKind: b.kind,
      typeName: null, categoryName: null, articleCount: b.articleIds.length, revenueHt: null, quantity: null,
      points: buildBrickPoints(b.versions, from),
    }))
    .filter((l) => l.points.length > 0)
    .sort(byName);
}

/**
 * Une ligne par fournisseur : à chaque instant, moyenne (ou somme) des coûts unitaires de ses
 * briques, `basket` à panier constant. Une brique appartient au fournisseur de sa dernière version
 * de la période. Les briques sans fournisseur connu sont ignorées. `articleCount` = nombre de briques.
 */
export function buildSupplierLines(bricks: ResolvedBrick[], aggregate: CostTrackingAggregate, from: Date): CostTrackingLine[] {
  const groups = new Map<string, { name: string; members: ResolvedBrick[] }>();
  for (const b of bricks) {
    if (!b.supplierKey) continue;
    const g = groups.get(b.supplierKey) ?? { name: b.supplierName ?? b.supplierKey, members: [] };
    g.members.push(b);
    groups.set(b.supplierKey, g);
  }
  return [...groups.entries()]
    .map(([key, g]): CostTrackingLine => {
      const memberPoints = g.members.map((m) => buildBrickPoints(m.versions, from));
      return {
        key: `supplier:${key}`, kind: 'supplier', id: key, name: g.name, typeName: null, categoryName: null,
        articleCount: g.members.filter((m, i) => memberPoints[i].length > 0).length, revenueHt: null, quantity: null,
        basket: constantBasket(memberPoints, aggregate),
        points: averageStaircase(memberPoints, aggregate),
      };
    })
    .filter((l) => l.points.length > 0)
    .sort(byName);
}
