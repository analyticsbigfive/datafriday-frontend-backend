/**
 * Assignation menu par PdV pour Commandes (Réarmement), chargée en 2 appels pour toute la
 * configuration au lieu de 2 appels par PdV (N+1 : 66 PdV = 132 appels, des 429 et des
 * retentatives, mesuré le 2026-11-16).
 *
 * - Lot 1 : GET /space-menu/:spaceId/:configId/shop-items, articles ACTIVÉS par PdV
 *   (id, nom, basePrice), même endpoint que Analyse et Inventaire.
 * - Lot 2 : GET /space-menu/space/:spaceId/items, articles de l'espace avec leur
 *   disponibilité serveur. La disponibilité est calculée par ESPACE (même fonction serveur
 *   que GET /space-menu/shop/:id/items), donc le verdict est le même pour tous les PdV.
 *
 * Contrat identique à la boucle par PdV : une entrée `{ name, items, unavailable }` par ligne
 * de PdV, dans le même ordre. `loadRestockAssignmentBatch` rend `null` quand le lot 1 échoue ou
 * revient vide : l'appelant retombe alors sur la boucle par PdV, comportement antérieur.
 */

/** Identifiant du PdV d'une ligne du store `spaceShops` (mêmes clés que la boucle par PdV). */
export function restockShopIdOfRow(row) {
  return String(row?.id ?? row?._id ?? row?.shopId ?? '')
}

export function restockShopNameOfRow(row) {
  return row?.name ?? row?.shopName ?? ''
}

/**
 * @param {Array<Object>} rows lignes de PdV de la configuration
 * @param {Record<string, {items: Array<{id:string,name:string,basePrice:number|null}>}>} byShop réponse du lot 1
 * @param {Array<{id:string,name:string,available?:boolean}>} spaceItems `items` de la réponse du lot 2
 * @returns {Array<{name:string, items:Array<{id:string,name:string,basePrice:number,enabled:boolean}>, unavailable:Array}>}
 */
export function buildAssignmentResultsFromBatch(rows, byShop, spaceItems) {
  // `available === false` STRICT : une réponse sans le champ ne doit rien exclure du réarmement.
  const unavailable = (Array.isArray(spaceItems) ? spaceItems : []).filter(
    (it) => it && it.available === false,
  )
  return (rows || []).map((row) => {
    const shopId = restockShopIdOfRow(row)
    const name = restockShopNameOfRow(row)
    if (!shopId) return { name, items: [], unavailable: [] }
    const light = byShop && byShop[shopId] && Array.isArray(byShop[shopId].items) ? byShop[shopId].items : []
    return {
      name,
      // Le lot 1 ne renvoie que les articles activés ; `basePrice` null devient 0 comme dans
      // GET /space-menu/shop/:id (Number(basePrice || 0)), pour ne pas changer le score d'appariement.
      items: light.map((it) => ({ id: it.id, name: it.name, basePrice: it.basePrice ?? 0, enabled: true })),
      unavailable,
    }
  })
}

/**
 * @param {Object} args
 * @param {string} args.spaceId
 * @param {string} args.configId
 * @param {Array<Object>} args.rows
 * @param {(spaceId:string, configId:string) => Promise<Object>} args.fetchBatch
 * @param {(spaceId:string) => Promise<{items:Array}>} args.fetchSpaceItems
 * @returns {Promise<Array|null>} null = lot indisponible, utiliser la boucle par PdV
 */
export async function loadRestockAssignmentBatch({ spaceId, configId, rows, fetchBatch, fetchSpaceItems }) {
  if (!spaceId || !configId || !rows || !rows.length) return null
  let byShop
  try {
    byShop = await fetchBatch(spaceId, configId)
  } catch (_) {
    return null
  }
  // Un objet vide (aucun PdV avec article activé, ou configuration introuvable côté serveur)
  // reste inconclusif : on laisse la boucle par PdV trancher plutôt que de vider le réarmement.
  if (!byShop || typeof byShop !== 'object' || Array.isArray(byShop) || !Object.keys(byShop).length) return null
  let spaceItems = []
  try {
    const res = await fetchSpaceItems(spaceId)
    spaceItems = Array.isArray(res?.items) ? res.items : []
  } catch (_) {
    // Disponibilité indisponible : on n'exclut rien, comme quand GET .../items échouait par PdV.
    spaceItems = []
  }
  return buildAssignmentResultsFromBatch(rows, byShop, spaceItems)
}
