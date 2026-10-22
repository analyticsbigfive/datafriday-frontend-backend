/**
 * Cost tracking : différences entre deux recettes figées et vocabulaire des causes de version.
 * Fonctions pures.
 */

const lineKey = (l) => `${l.kind}:${l.refId}`

/**
 * Compare une recette à la précédente (la version plus ancienne).
 * @returns {Array<{ type: 'unit'|'qty'|'added'|'removed', key, name, from?, to? }>}
 */
export function diffRecipe(recipe, previous) {
  if (!Array.isArray(recipe) || !Array.isArray(previous)) return []
  const before = new Map(previous.map((l) => [lineKey(l), l]))
  const after = new Map(recipe.map((l) => [lineKey(l), l]))
  const out = []
  for (const l of recipe) {
    const old = before.get(lineKey(l))
    if (!old) {
      out.push({ type: 'added', key: lineKey(l), name: l.name })
      continue
    }
    if (old.unitCost !== l.unitCost) out.push({ type: 'unit', key: lineKey(l), name: l.name, from: old.unitCost, to: l.unitCost })
    if (old.quantity !== l.quantity) out.push({ type: 'qty', key: lineKey(l), name: l.name, from: old.quantity, to: l.quantity })
  }
  for (const l of previous) {
    if (!after.has(lineKey(l))) out.push({ type: 'removed', key: lineKey(l), name: l.name })
  }
  return out
}

/** Clé de ligne de recette (pour surligner les lignes modifiées). */
export const recipeLineKey = lineKey

/** Famille d'affichage d'une cause : 'market' | 'recipe' | 'base'. */
export function reasonKind(reason) {
  if (reason === 'market_price' || reason === 'price_sync') return 'market'
  if (reason === 'recipe_edit' || reason === 'component_edit' || reason === 'ingredient_edit' || reason === 'packaging_edit' || reason === 'combo_edit') return 'recipe'
  return 'base'
}

const REASON_KEYS = {
  baseline: 'ctReasonBaseline',
  created: 'ctReasonCreated',
  market_price: 'ctReasonMarketPrice',
  recipe_edit: 'ctReasonRecipeEdit',
  component_edit: 'ctReasonComponentEdit',
  ingredient_edit: 'ctReasonIngredientEdit',
  packaging_edit: 'ctReasonPackagingEdit',
  combo_edit: 'ctReasonComboEdit',
  manual_refresh: 'ctReasonManualRefresh',
  price_sync: 'ctReasonPriceSync',
}

/** Clé i18n du libellé d'une cause (repli sur la cause générique). */
export function reasonLabelKey(reason) {
  return REASON_KEYS[reason] || 'ctReasonOther'
}
