/** Types partagés du module Cost tracking (lecture seule de l'historique `MenuItemCostSnapshot`). */

export type CostTrackingGroupBy = 'article' | 'category' | 'type';

/** Ligne de snapshot allégée (sans le Json `recipe`) utilisée pour construire les séries. */
export interface SnapshotPoint {
  id: string;
  menuItemId: string;
  effectiveFrom: Date;
  costPerPiece: number;
  totalCost: number;
  numberOfPieces: number;
  basePrice: number | null;
  reason: string;
}

/** Point d'une série en escalier : la valeur reste valable jusqu'au point suivant. */
export interface SeriesPoint {
  at: string;
  costPerPiece: number;
  price: number | null;
  /** Nombre d'articles pris dans la moyenne (Type et Catégorie), 1 pour un article. */
  articleCount: number;
  /** true : point posé au début de la période pour porter la valeur déjà en vigueur. */
  carried: boolean;
  /** Article uniquement : id du snapshot, cause et coût de fournée. */
  snapshotId?: string;
  reason?: string;
  totalCost?: number;
  numberOfPieces?: number;
}

/** Article du périmètre (Space Menu de l'espace). */
export interface ScopeArticle {
  id: string;
  name: string;
  typeId: string | null;
  typeName: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

export type EventReferenceSource = 'doors_open' | 'midnight';

export interface EventReference {
  at: Date;
  source: EventReferenceSource;
}
