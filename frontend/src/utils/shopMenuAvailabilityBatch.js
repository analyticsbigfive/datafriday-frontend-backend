/**
 * Catalogue avec disponibilité de TOUS les PdV d'une configuration en 2 appels, au lieu d'un
 * `GET /space-menu/shop/:id/items` par PdV (N+1 : 33 appels à chaque ouverture d'Event Predict,
 * mesuré le 2026-11-16).
 *
 * - Lot 1 : GET /space-menu/space/:spaceId/items, les articles de l'espace avec leur
 *   disponibilité serveur.
 * - Lot 2 : GET /space-menu/:spaceId/:configId, la matrice `{ [shopId]: { [menuItemId]: enabled } }`
 *   de la configuration (une clé présente = article assigné au PdV, la valeur dit s'il est activé).
 *
 * Pourquoi c'est identique à la réponse par PdV : `GET /space-menu/shop/:id/items` appelle côté
 * serveur la MÊME fonction que le lot 1 (articles de l'espace, disponibilité par espace), puis y
 * ajoute pour chaque article `enabled` et `assigned` lus dans les assignations du PdV pour la
 * configuration demandée, qui sont exactement les lignes de la matrice du lot 2. On refait donc
 * ici cette jointure : `enabled = matrice[pdv][article] === true`, `assigned = clé présente`.
 */

/** Lignes d'UN PdV, même forme que `GET /space-menu/shop/:id/items` (champ `items`). */
export function buildShopRowsFromBatch(spaceItems, shopMatrix) {
  const items = Array.isArray(spaceItems) ? spaceItems : []
  const matrix = shopMatrix && typeof shopMatrix === 'object' ? shopMatrix : null
  return items.map((it) => ({
    ...it,
    enabled: !!matrix && matrix[it.id] === true,
    assigned: !!matrix && Object.prototype.hasOwnProperty.call(matrix, it.id),
  }))
}

/**
 * @param {Object} args
 * @param {string} args.spaceId
 * @param {string} args.configId
 * @param {string[]} args.shopIds
 * @param {(spaceId:string) => Promise<Object>} args.fetchSpaceItems
 * @param {(spaceId:string, configId:string) => Promise<Object>} args.fetchMatrix
 * @returns {Promise<Record<string, Array>|null>} `{ [shopId]: lignes }`, ou null si un des deux
 *   lots échoue ou revient vide : l'appelant retombe alors sur la boucle par PdV.
 */
export async function loadShopRowsForConfig({ spaceId, configId, shopIds, fetchSpaceItems, fetchMatrix }) {
  if (!spaceId || !configId || !Array.isArray(shopIds) || !shopIds.length) return null
  let spaceRes
  let matrixRes
  try {
    ;[spaceRes, matrixRes] = await Promise.all([fetchSpaceItems(spaceId), fetchMatrix(spaceId, configId)])
  } catch (_) {
    return null
  }
  const spaceItems = Array.isArray(spaceRes?.items) ? spaceRes.items : Array.isArray(spaceRes?.data?.items) ? spaceRes.data.items : null
  const matrix = matrixRes?.menuItems ?? matrixRes?.data?.menuItems
  // Un lot vide reste inconclusif (configuration introuvable côté serveur, espace sans article) :
  // la boucle par PdV tranche plutôt que de déclarer tous les PdV sans article.
  if (!spaceItems || !spaceItems.length || !matrix || typeof matrix !== 'object' || Array.isArray(matrix) || !Object.keys(matrix).length) {
    return null
  }
  const out = {}
  for (const shopId of shopIds) out[String(shopId)] = buildShopRowsFromBatch(spaceItems, matrix[String(shopId)])
  return out
}
