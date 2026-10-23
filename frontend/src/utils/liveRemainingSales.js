// Ventes prévues restantes par PdV × Menu Item (onglet Inventaire live).
//
// Règle (Bertrand) : restant = max(0, prédit ajusté − vendu), au grain Menu Item.
// Ce module est PUR : il ne fait que fabriquer des records « restant » que
// `buildPredictedNeedIndex` (usePredictedNeed.js) convertit ensuite en besoin
// ingrédients / composants / packaging, avec la même explosion (combos ouverts,
// recette) que Pre-event Inventory et Logistic. Aucune explosion réimplémentée ici.
//
// Limite connue : une vente non rattachable à un Menu Item (ligne sans
// menuItemId ni nom) n'est pas déduite, donc le restant peut être SURESTIMÉ.

import { normalizeStr } from '@/utils/predictiveAnalytics'
import {
  deriveSelectedMenuItemsByShop,
  getPredictedQuantityForElement,
  getRecordMenuItemId,
  isManualOnlyForElement,
  normalizeSelectedIds,
  shopRecordMatchesElement,
} from '@/utils/stockPlanning'

function addTo(map, key, qty) {
  if (!key) return
  map.set(key, (map.get(key) || 0) + qty)
}

function emptyBucket() {
  return { byId: new Map(), byName: new Map() }
}

/**
 * Ventes réalisées indexées par PdV (id ou nom normalisé) puis par Menu Item
 * (id ou nom normalisé). Les combos sont comptés au niveau combo, comme le predict.
 * @param {Array<object>} timelineRows lignes de useLiveData (shopId, shopName, menuItemId, menuItemName, quantity)
 * @returns {{byShopId: Map<string, object>, byShopName: Map<string, object>}}
 */
export function buildSalesIndex(timelineRows) {
  const byShopId = new Map()
  const byShopName = new Map()
  for (const row of Array.isArray(timelineRows) ? timelineRows : []) {
    const qty = Number(row?.quantity) || 0
    if (!qty) continue
    const itemId = row?.menuItemId != null ? String(row.menuItemId) : ''
    const itemName = normalizeStr(row?.menuItemName)
    if (!itemId && !itemName) continue // non attribuable
    const buckets = []
    if (row?.shopId != null && row.shopId !== '') {
      const k = String(row.shopId)
      if (!byShopId.has(k)) byShopId.set(k, emptyBucket())
      buckets.push(byShopId.get(k))
    }
    const sn = normalizeStr(row?.shopName)
    if (sn) {
      if (!byShopName.has(sn)) byShopName.set(sn, emptyBucket())
      buckets.push(byShopName.get(sn))
    }
    for (const b of buckets) {
      addTo(b.byId, itemId, qty)
      addTo(b.byName, itemName, qty)
    }
  }
  return { byShopId, byShopName }
}

/**
 * Quantité vendue d'un Menu Item dans un PdV. Une seule source est retenue par
 * niveau (id d'abord, nom en repli) pour ne jamais compter deux fois la même vente.
 */
export function soldQuantity(salesIndex, shop, itemIds, itemName) {
  if (!salesIndex || !shop) return 0
  const bucket =
    (shop.id != null ? salesIndex.byShopId.get(String(shop.id)) : null) ||
    salesIndex.byShopName.get(normalizeStr(shop.name)) ||
    null
  if (!bucket) return 0
  for (const id of itemIds) {
    if (id != null && bucket.byId.has(String(id))) return bucket.byId.get(String(id))
  }
  const nk = normalizeStr(itemName)
  return nk ? bucket.byName.get(nk) || 0 : 0
}

/**
 * Records « restant » (un par PdV × Menu Item), au format attendu par
 * `buildPredictedNeedIndex` (`isManual: true` neutralise un second ajustement %).
 *
 * @param {Object} p
 * @param {object} p.version     version Event Predict par défaut (predictedRecords, menuConfig, quantityAdjustments)
 * @param {Array<{id:string,name:string}>} p.shops PdV de l'inventaire live
 * @param {Array<object>} [p.menuItems] catalogue (aide à retrouver le nom par id)
 * @param {object|null} [p.salesIndex] null = rien de vendu (prédit complet)
 */
export function buildRemainingRecords({ version, shops = [], menuItems = [], salesIndex = null } = {}) {
  const records = Array.isArray(version?.predictedRecords) ? version.predictedRecords : []
  if (!records.length || !shops.length) return []
  const menuConfig = version?.menuConfig || {}
  const adjustments = version?.quantityAdjustments || {}
  const catalogNameById = new Map((menuItems || []).map((mi) => [String(mi?.id), mi?.name]))
  const configuration = {
    floors: [{ elements: shops.map((s) => ({ id: s.id, name: s.name, type: 'shop' })) }],
  }
  const derived = deriveSelectedMenuItemsByShop(configuration, records)

  const out = []
  for (const shop of shops) {
    const explicit = normalizeSelectedIds(menuConfig[shop.id])
    const ids = explicit.length ? explicit : normalizeSelectedIds(derived[shop.id])
    for (const menuItemId of ids) {
      const predicted = getPredictedQuantityForElement(records, shop, menuItemId)
      const adjustment = isManualOnlyForElement(records, shop, menuItemId)
        ? 100
        : Number.isFinite(Number(adjustments[`${shop.id}-${menuItemId}`]))
          ? Number(adjustments[`${shop.id}-${menuItemId}`])
          : 100
      const adjusted = Math.round((predicted * adjustment) / 100)
      if (!adjusted) continue
      const sample = records.find(
        (r) => getRecordMenuItemId(r) === menuItemId && shopRecordMatchesElement(r, shop),
      )
      const itemName = sample?.itemName || sample?.mappedMenuItemName || catalogNameById.get(String(menuItemId)) || ''
      const sold = soldQuantity(
        salesIndex,
        shop,
        [menuItemId, sample?.mappedMenuItemId],
        itemName,
      )
      const remaining = Math.max(0, adjusted - sold)
      if (!remaining) continue
      out.push({
        shopId: shop.id,
        menuItemId,
        itemName,
        mappedMenuItemId: sample?.mappedMenuItemId,
        totalQuantity: remaining,
        isManual: true,
      })
    }
  }
  return out
}

/**
 * Résumé affichable des Menu Items sources d'un besoin : les `max` plus gros,
 * le reste compté dans `more`.
 * @returns {{items: Array<{name:string, qty:number}>, more:number}}
 */
export function summarizeSources(sources, max = 5) {
  const list = (Array.isArray(sources) ? sources : [])
    .map((s) => ({ name: String(s?.menuItemName || s?.menuItemId || ''), qty: Math.round(Number(s?.menuItemQuantity) || 0) }))
    .filter((s) => s.name && s.qty > 0)
    .sort((a, b) => b.qty - a.qty)
  return { items: list.slice(0, max), more: Math.max(0, list.length - max) }
}
