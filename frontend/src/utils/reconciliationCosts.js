// Coût unitaire par article compté, pour « Miss € » (Q40, décision Ulrich
// 2026-09-10 sur délégation de Bertrand : valorisation PAR KIND).
//
// `menuItemCostMap` est indexée par id de menu item : depuis Q35 Option 1 les
// lignes les plus significatives du document sont au grain ingrédient (fût,
// bidon) et n'y figurent jamais, donc leur manquant restait en unités. Chaque
// kind a pourtant son coût en base :
//   - article compté sous une Market Price (ingrédient lié) → `pricePerUnit`
//   - composant (MenuComponent, jamais décomposé, Q13)     → `unitCost`
//   - menu item compté tel quel (readyForSale=Yes, sans recette) → `menuItemCostMap`
//
// Règle maison conservée : jamais un 0 € fabriqué. Un coût absent ou nul
// n'entre pas dans l'index, la ligne reste valorisée en unités seulement.
//
// Fonction PURE.

const positive = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * @param {object} params
 * @param {Array<{id:string, marketPriceId?:string, isComponent?:boolean}>} params.countedItems
 * @param {Record<string, number>} [params.menuItemCostMap] coût par id de menu item
 * @param {Array<{id:string, pricePerUnit?:number}>} [params.marketPrices]
 * @param {Array<{id:string, unitCost?:number}>} [params.components]
 * @returns {Record<string, number>} itemId compté → coût unitaire (> 0 uniquement)
 */
export function buildUnitCostByItemId({
  countedItems = [],
  menuItemCostMap = {},
  marketPrices = [],
  components = [],
} = {}) {
  const mpCostById = new Map()
  for (const mp of marketPrices || []) {
    const c = positive(mp?.pricePerUnit)
    if (mp?.id != null && c != null) mpCostById.set(String(mp.id), c)
  }
  const compCostById = new Map()
  for (const comp of components || []) {
    const c = positive(comp?.unitCost)
    if (comp?.id != null && c != null) compCostById.set(String(comp.id), c)
  }

  const out = {}
  for (const it of countedItems || []) {
    if (it?.id == null) continue
    const id = String(it.id)
    const cost =
      // L'id compté EST le plus souvent le marketPriceId (componentIngredientId) ;
      // `marketPriceId` explicite couvre le cas où le comptage garde l'id ingrédient.
      mpCostById.get(id) ??
      (it.marketPriceId != null ? mpCostById.get(String(it.marketPriceId)) : undefined) ??
      (it.isComponent ? compCostById.get(id) : undefined) ??
      positive(menuItemCostMap?.[id])
    if (cost != null) out[id] = cost
  }
  return out
}
