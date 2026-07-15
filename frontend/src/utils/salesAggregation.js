// Agrégation des ventes d'un event de référence -> "predictedRecords"
// consommables par buildStockRequirements (stockPlanning.js).
//
// Règle 3 : l'objectif de réarmement est DÉRIVÉ d'un event passé. On récupère les
// lignes de vente (edge function sales) et on les agrège PAR menu item ET PAR PDV
// (element), via le shop-element-mapping Weezevent.

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Construit un résolveur shopName (Weezevent) -> elementId à partir des
 * shop-element-mappings. Les enregistrements ont la forme { shopName, elementId }.
 *
 * @param {Array<{shopName?: string, shop?: string, elementId?: string, spaceElementId?: string}>} mappings
 * @returns {(shopName: string) => string|undefined}
 */
export function buildShopElementResolver(mappings) {
  const byShop = new Map()
  ;(mappings || []).forEach((m) => {
    const shopName = m.shopName || m.shop || m.shopId
    const elementId = m.elementId || m.spaceElementId || m.element || m.shopElementId
    if (shopName && elementId) byShop.set(normalize(shopName), elementId)
  })
  return (shopName) => byShop.get(normalize(shopName))
}

/**
 * Résout le menuItemId d'une ligne de vente : direct, sinon par nom de produit.
 *
 * @param {Object} row              ligne de vente { menuItemId?, productName?, ... }
 * @param {Map<string,string>} byName  nom (normalisé) -> menuItemId
 */
function resolveMenuItemId(row, byName) {
  if (row.menuItemId) return row.menuItemId
  if (row.mappedMenuItemId) return row.mappedMenuItemId
  const name = row.productName || row.name || row.product
  if (name && byName) return byName.get(normalize(name))
  return undefined
}

/**
 * Agrège des lignes de vente en predictedRecords, regroupés par (menuItemId, elementId).
 *
 * @param {Array} rows                lignes de vente brutes (edge function)
 * @param {Object} options
 * @param {Array} [options.mappings]  shop-element-mappings (résolution shopName -> elementId)
 * @param {Array} [options.menuItems] catalogue menu items (résolution productName -> id)
 * @returns {Array<{menuItemId:string, elementId?:string, shopName?:string, totalQuantity:number}>}
 */
export function aggregateSalesToPredictedRecords(rows, options = {}) {
  const { mappings = [], menuItems = [] } = options
  const resolveElement = buildShopElementResolver(mappings)
  const byName = new Map(
    (menuItems || [])
      .filter((mi) => mi && mi.name)
      .map((mi) => [normalize(mi.name), mi.id]),
  )

  const acc = new Map()
  ;(rows || []).forEach((row) => {
    const menuItemId = resolveMenuItemId(row, byName)
    if (!menuItemId) return // ligne non rattachable à un menu item -> ignorée

    const shopName = row.shopName || row.shop || row.location || ''
    const elementId = resolveElement(shopName)
    const quantity = toNumber(row.quantity ?? row.qty ?? row.totalQuantity)
    if (quantity <= 0) return

    const key = `${menuItemId}|||${elementId || shopName}`
    const existing = acc.get(key)
    if (existing) {
      existing.totalQuantity += quantity
    } else {
      acc.set(key, { menuItemId, elementId, shopName, totalQuantity: quantity })
    }
  })

  return Array.from(acc.values())
}

/**
 * Liste des menu items vendus sur un event de référence (pour la Règle 1 :
 * "produit vendu non listé"). Retourne un Set de menuItemId par elementId.
 *
 * @returns {Record<string, Set<string>>}
 */
export function soldMenuItemIdsByElement(predictedRecords) {
  const out = {}
  ;(predictedRecords || []).forEach((rec) => {
    if (!rec.elementId || !rec.menuItemId) return
    if (rec.totalQuantity <= 0) return
    if (!out[rec.elementId]) out[rec.elementId] = new Set()
    out[rec.elementId].add(rec.menuItemId)
  })
  return out
}
