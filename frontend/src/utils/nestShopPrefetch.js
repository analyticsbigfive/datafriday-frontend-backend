// Lancement anticipé des deux lectures NestJS du contexte PdV d'une configuration :
// la liste des PdV de l'espace (`spaceShops/fetchForSpace`) et le lot d'articles par PdV
// (`getConfigShopMenuItemsLight`).
//
// Avant : `buildConfigShopEntry` lisait d'abord la configuration (floors), puis les PdV, puis
// les articles, trois allers-retours à la suite. Or ni la liste des PdV ni le lot d'articles
// ne dépendent des floors : les floors servent seulement à FILTRER les lignes après coup
// (périmètre). On lance donc les trois lectures ensemble et on filtre quand tout est là. Le
// résultat est identique ; seule la durée change (3 vagues deviennent 1).
//
// Les deux promesses ne rejettent jamais : un échec devient une valeur, comme dans le code
// d'origine (la liste des PdV retombe sur `[]`, le lot d'articles lève le drapeau `failed`
// qui empêche de mémoriser un contexte sans articles pour toute la session).

/**
 * @param {Object} deps
 * @param {string} deps.spaceId
 * @param {string} deps.configId
 * @param {Function} deps.dispatch dispatch Vuex du store appelant (action racine `spaceShops/fetchForSpace`)
 * @param {(spaceId:string, configId:string) => Promise<Object>} [deps.fetchItemsBatch]
 *   lecture du lot d'articles (importée à la demande par défaut, injectable en test)
 * @returns {{ rowsP: Promise<Array>, itemsP: Promise<{items:Object, failed:boolean}> }}
 */
export function startNestShopPrefetch({ spaceId, configId, dispatch, fetchItemsBatch }) {
  const rowsP = Promise.resolve()
    .then(() => dispatch('spaceShops/fetchForSpace', { spaceId }, { root: true }))
    .then((rows) => (Array.isArray(rows) ? rows : []), () => [])

  const loadBatch = fetchItemsBatch
    || ((sid, cid) => import('@/api/endpoints/menu.api').then((m) => m.getConfigShopMenuItemsLight(sid, cid)))
  const itemsP = Promise.resolve()
    .then(() => loadBatch(spaceId, configId))
    .then((items) => ({ items: items || {}, failed: false }), () => ({ items: {}, failed: true }))

  return { rowsP, itemsP }
}
