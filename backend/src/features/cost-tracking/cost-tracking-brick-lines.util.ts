import { buildBrickPoints } from './cost-tracking-brick-series.util';
import { ResolvedBrick } from './cost-tracking-brick-scope.util';
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
