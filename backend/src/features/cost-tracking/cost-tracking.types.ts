/** Types partagés du module Cost tracking (lecture seule de l'historique `MenuItemCostSnapshot`). */

/** Type et Catégorie : moyenne des articles ou total (somme) des coûts par pièce. */
export type CostTrackingAggregate = 'avg' | 'sum';

export type CostTrackingGroupBy = 'article' | 'category' | 'type' | 'ingredient' | 'supplier' | 'component';

/** Nature d'une ligne de recette (mode ingrédient). */
export type RecipeLineKind = 'component' | 'ingredient' | 'packaging' | 'combo';

/** Ligne de recette figée telle qu'écrite dans `MenuItemCostSnapshot.recipe`. */
export interface RecipeLine {
  kind: RecipeLineKind;
  refId: string;
  name: string | null;
  quantity: number;
  unitCost: number | null;
}

/** Snapshot allégé accompagné de sa recette figée. */
export interface SnapshotWithRecipe extends SnapshotPoint {
  recipe: RecipeLine[];
}

/** Ligne de snapshot allégée (sans le Json `recipe`) utilisée pour construire les séries. */
export interface SnapshotPoint {
  id: string;
  menuItemId: string;
  effectiveFrom: Date;
  costPerPiece: number;
  totalCost: number;
  numberOfPieces: number;
  basePrice: number | null;
  /** Taux de TVA figé dans la version (null : taux par défaut du tenant). */
  vatRate?: number | null;
  reason: string;
}

/** Point d'une série en escalier : la valeur reste valable jusqu'au point suivant. */
export interface SeriesPoint {
  at: string;
  costPerPiece: number;
  price: number | null;
  /** Prix hors taxe (prix TTC ramené par le taux de TVA), null si le taux est inconnu. */
  priceHt?: number | null;
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

/** Nature d'une brique suivie par `BrickCostSnapshot`. */
export type BrickKind = 'ingredient' | 'packaging' | 'component';

/** Version de coût d'une brique (ligne de `BrickCostSnapshot`), sans le Json `sourceRef`. */
export interface BrickSnapshotPoint {
  id: string;
  kind: BrickKind;
  refId: string;
  name: string;
  /** Coût par unité de recette (ingrédient, emballage) ou coût unitaire du composant. */
  unitCost: number;
  recipeUnit: string | null;
  supplierId: string | null;
  supplierName: string | null;
  marketPriceId: string | null;
  effectiveFrom: Date;
  reason: string;
}

/** Changement de fournisseur d'une brique au cours d'une période. */
export interface BrickSupplierChange {
  refId: string;
  name: string;
  at: string;
  fromSupplierId: string | null;
  fromSupplierName: string | null;
  toSupplierId: string | null;
  toSupplierName: string | null;
  snapshotId: string;
}
