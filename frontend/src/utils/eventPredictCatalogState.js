/**
 * État « catalogue » d'Event Predict : coûts unitaires par article et liste d'articles.
 *
 * Fonction pure, extraite de `EventPredictView.loadAll` SANS changer la règle, pour pouvoir
 * l'appliquer deux fois : une première fois sans attendre le catalogue complet du tenant
 * (repli sur le store), puis à l'arrivée de ce catalogue (cf. utils/deferredCatalog.js).
 */

/**
 * Nombre de lignes de recette d'une liste d'articles. Sert à comparer deux listes qui ont le
 * MÊME nombre d'articles mais pas la même richesse (vague 2b du store : refs résolues).
 *
 * @param {Array<{components?: any[]}>|null|undefined} items
 * @returns {number}
 */
export function recipeDepth(items) {
  return (items || []).reduce(
    (n, mi) => n + (Array.isArray(mi?.components) ? mi.components.length : 0),
    0,
  )
}

/**
 * @param {Array<object>|null|undefined} apiMenuItems  catalogue REST (peut être vide ou absent)
 * @param {{menuItemCostMap?: Record<string, number>, menuItems?: object[]}|null|undefined} storeAnalyse
 *   état du module store `analyse` au moment de l'application
 * @returns {{costMap: Record<string, number>, menuItems: object[]}}
 */
export function buildCatalogState(apiMenuItems, storeAnalyse) {
  const store = storeAnalyse || {}
  const miSource = Array.isArray(apiMenuItems) && apiMenuItems.length ? apiMenuItems : []

  const costMap = {}
  for (const mi of miSource) {
    // Clé seulement si coût réel : une clé à 0 masquerait la valeur du store dans
    // effectiveMenuItemCostMap (merge local-prioritaire) et bloquerait le repli store
    // ci-dessous (map non vide).
    const c = Number(mi?.unitCost || mi?.cost || 0)
    if (mi?.id && c > 0) costMap[mi.id] = c
  }
  // Si vide, reprendre depuis le store (mock Arena, ou catalogue pas encore arrivé).
  if (Object.keys(costMap).length === 0) {
    Object.assign(costMap, store.menuItemCostMap || {})
  }

  // Si les articles API sont vides ou non enrichis (pas de components), prendre ceux du
  // store (enrichis avec components/readyForSale/spaceIds, requis par l'algorithme des
  // sections Menus et Stock up).
  const storeMis = Array.isArray(store.menuItems) ? store.menuItems : []
  const apiMisEnriched =
    miSource.length > 0 &&
    miSource.some((mi) => Array.isArray(mi?.components) && mi.components.length)
  const menuItems = !apiMisEnriched && storeMis.length ? storeMis : miSource

  return { costMap, menuItems }
}
