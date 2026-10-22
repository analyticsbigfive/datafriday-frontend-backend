/** Champs d'un ingrédient / emballage qui entrent dans le coût des composants et des articles. */
const COST_FIELDS = ['costPerRecipeUnit', 'costPerPurchaseUnit', 'purchaseUnitsPerRecipeUnit', 'marketPriceId', 'storageType'] as const;

function same(before: unknown, after: unknown): boolean {
  if (before == null && after == null) return true;
  if (Array.isArray(before) || Array.isArray(after)) return JSON.stringify(before ?? []) === JSON.stringify(after ?? []);
  // Decimal Prisma (toString) et nombres du DTO se comparent par valeur numérique.
  const a = Number(before);
  const b = Number(after);
  if (before != null && after != null && !Number.isNaN(a) && !Number.isNaN(b)) return a === b;
  return before === after;
}

/** Vrai si le DTO modifie réellement un champ qui influence les coûts (comparé à l'état avant édition). */
export function hasBrickCostChange(before: Record<string, unknown>, dto: Record<string, unknown>): boolean {
  return COST_FIELDS.some((field) => dto[field] !== undefined && !same(before[field], dto[field]));
}
