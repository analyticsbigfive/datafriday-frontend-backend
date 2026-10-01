/**
 * Chantier 388 : répartition manuelle du besoin par PDV, étape 1 du
 * réarmement (SpaceRestockView). Logique pure, testable sans monter le SFC
 * (pattern storageRestock.js).
 *
 * Deux niveaux de % :
 *   - `itemPercents`  = stockAdjustments, keyé itemKey (`id|||unit`) : curseur
 *     de la carte article ;
 *   - `shopPercents`  = stockShopPercents, keyé `shopId|||itemKey` : réglages
 *     posés à la main dans le drawer, uniquement les PDV modifiés.
 *
 * Précédence (même règle qu'Event Predict) : réglage PDV, sinon % de
 * l'article, sinon 100. Plage 0 à 200, comme le curseur de la carte.
 */

export const SHOP_PERCENT_MIN = 0
export const SHOP_PERCENT_MAX = 200
export const SHOP_PERCENT_DEFAULT = 100
const SEPARATOR = '|||'

/** Clé d'un réglage PDV × article. */
export function shopPercentKey(shopId, itemKey) {
  return `${shopId ?? ''}${SEPARATOR}${itemKey ?? ''}`
}

/**
 * Coerce une valeur (curseur, état persisté, plan rechargé) en % entier borné
 * 0 à 200. Null, vide ou non numérique : null (= pas de valeur), pour laisser
 * la précédence retomber au niveau suivant. 0 est une valeur légitime.
 */
export function normalizeShopPercent(raw) {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.min(SHOP_PERCENT_MAX, Math.max(SHOP_PERCENT_MIN, Math.round(n)))
}

/** % effectif d'une ligne PDV × article : PDV, sinon article, sinon 100. */
export function effectiveShopPercent({ shopPercents, itemPercents, shopId, itemKey } = {}) {
  const shop = normalizeShopPercent((shopPercents || {})[shopPercentKey(shopId, itemKey)])
  if (shop != null) return shop
  const item = normalizeShopPercent((itemPercents || {})[itemKey])
  if (item != null) return item
  return SHOP_PERCENT_DEFAULT
}

/**
 * Supprime tous les réglages PDV d'un article (curseur global de la carte).
 * Pur : renvoie un nouvel objet, l'entrée n'est jamais mutée.
 */
export function clearItemShopPercents(shopPercents, itemKey) {
  const suffix = `${SEPARATOR}${itemKey}`
  const next = {}
  Object.keys(shopPercents || {}).forEach((key) => {
    if (!key.endsWith(suffix)) next[key] = shopPercents[key]
  })
  return next
}

/**
 * Vrai quand les PDV d'un article n'ont pas tous le même % effectif (la carte
 * affiche alors « Mixte »). Un réglage PDV égal au % de l'article ne compte
 * pas comme une différence.
 */
export function isItemPercentMixed(shopPercents, itemPercent, shopIds, itemKey) {
  const base = normalizeShopPercent(itemPercent) ?? SHOP_PERCENT_DEFAULT
  const values = new Set()
  ;(shopIds || []).forEach((shopId) => {
    const shop = normalizeShopPercent((shopPercents || {})[shopPercentKey(shopId, itemKey)])
    values.add(shop ?? base)
  })
  return values.size > 1
}

/**
 * Groupe des lignes PDV × article par itemKey, en gardant l'ordre d'entrée
 * (liveRestockRowsAll est déjà trié par PDV puis article).
 * @returns {Object<string, Array>}
 */
export function groupRowsByItemKey(rows) {
  const out = {}
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || row.itemKey == null) return
    if (!out[row.itemKey]) out[row.itemKey] = []
    out[row.itemKey].push(row)
  })
  return out
}
