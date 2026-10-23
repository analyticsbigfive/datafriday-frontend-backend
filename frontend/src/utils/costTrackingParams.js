/**
 * Cost tracking : paramètres de l'appel séries et règles de mode « Afficher par ».
 * Fonctions pures (sans Vue ni DOM).
 */

/** Modes où l'agrégat Moyenne / Total est proposé (lignes qui regroupent plusieurs coûts). */
export const AGGREGATE_MODES = ['category', 'type', 'supplier']

/** Modes sans prix de vente : pas de courbe de prix HT ni de marge. */
export function isPricelessMode(groupBy, menuItemId) {
  if (groupBy === 'supplier' || groupBy === 'component') return true
  return groupBy === 'ingredient' && !menuItemId
}

export function canAggregate(groupBy) {
  return AGGREGATE_MODES.includes(groupBy)
}

/**
 * Paramètres de GET /cost-tracking/:spaceId/series. `groupBy` et `aggregate` sont résolus par
 * l'appelant ; les filtres vides restent undefined (l'absence vaut « pas de filtre »).
 */
export function buildSeriesParams({ range, filters = {}, groupBy, aggregate }) {
  return {
    from: range.from,
    to: range.to,
    typeId: filters.typeId || undefined,
    categoryId: filters.categoryId || undefined,
    menuItemId: filters.menuItemId || undefined,
    ingredientId: filters.ingredientId || undefined,
    supplierKey: filters.supplierKey || undefined,
    componentId: filters.componentId || undefined,
    groupBy,
    aggregate: canAggregate(groupBy) ? aggregate : undefined,
  }
}

/**
 * Filtres Fournisseur / Composant devenus absents de la liste d'options : retourne le patch qui les
 * vide, ou null si rien à vider. `options` : { suppliers: [{ key }], components: [{ id }] }.
 */
export function staleSelectionPatch(options, { supplierKey, componentId }) {
  const patch = {}
  if (supplierKey && !(options?.suppliers || []).some((s) => s.key === supplierKey)) patch.supplierKey = null
  if (componentId && !(options?.components || []).some((c) => c.id === componentId)) patch.componentId = null
  return Object.keys(patch).length ? patch : null
}
