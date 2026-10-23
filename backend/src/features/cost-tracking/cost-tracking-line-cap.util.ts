/** Nombre maximal de lignes (modes article, fournisseur, composant, ingrédient sans article). */
export const MAX_ARTICLE_LINES = 10;

export interface CappableLine {
  name: string;
  /** Articles dont le CA classe la ligne (un seul pour une ligne article). */
  articleIds: string[];
}

export interface CapResult<T> {
  selected: T[];
  truncated: boolean;
  ranked: boolean;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

/** Vrai si le plafond s'applique : il faut alors lire le CA avant d'appeler `capLines`. */
export const needsCap = (count: number, max = MAX_ARTICLE_LINES) => count > max;

/**
 * Plafond de lignes : tout si au plus `max`, sinon les `max` premières par CA décroissant (somme du CA HT
 * des articles de la ligne), repli alphabétique quand aucune ne vend. `revenueHtById` : CA HT par article.
 */
export function capLines<T extends CappableLine>(lines: T[], revenueHtById: Map<string, number>, max = MAX_ARTICLE_LINES): CapResult<T> {
  if (!needsCap(lines.length, max)) return { selected: lines, truncated: false, ranked: false };
  const revenueOf = (l: T) => l.articleIds.reduce((s, id) => s + (revenueHtById.get(id) ?? 0), 0);
  const ranked = lines.filter((l) => revenueOf(l) > 0).sort((a, b) => (revenueOf(b) - revenueOf(a)) || byName(a, b));
  const selected = (ranked.length ? ranked : [...lines].sort(byName)).slice(0, max);
  return { selected, truncated: true, ranked: ranked.length > 0 };
}
