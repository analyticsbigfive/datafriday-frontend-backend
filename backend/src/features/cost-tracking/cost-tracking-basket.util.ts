import { CostTrackingAggregate, SeriesPoint } from './cost-tracking.types';

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Coût de début et de fin d'un panier constant d'articles. */
export interface ConstantBasket {
  startCost: number;
  endCost: number;
  /** Nombre d'articles du panier (présents dès le premier instant du groupe). */
  articleCount: number;
}

/**
 * Variation « à panier constant » d'un Type ou d'une Catégorie : seuls les articles présents dès
 * le premier instant du groupe comptent, comparés à eux-mêmes. Un article ajouté en cours de
 * période fait bouger la moyenne de la courbe sans qu'aucun coût n'ait changé, il est donc exclu
 * de la variation. Null s'il n'y a aucun article.
 */
export function constantBasket(members: SeriesPoint[][], aggregate: CostTrackingAggregate = 'avg'): ConstantBasket | null {
  const lists = members.filter((m) => m.length > 0);
  if (!lists.length) return null;
  const firstAt = lists.map((m) => m[0].at).sort()[0];
  const basket = lists.filter((m) => m[0].at === firstAt);
  const start = basket.reduce((s, m) => s + m[0].costPerPiece, 0);
  const end = basket.reduce((s, m) => s + m[m.length - 1].costPerPiece, 0);
  const divisor = aggregate === 'sum' ? 1 : basket.length;
  return { startCost: round4(start / divisor), endCost: round4(end / divisor), articleCount: basket.length };
}
