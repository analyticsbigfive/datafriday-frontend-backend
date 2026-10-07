// Couples `${shopId}|${menuItemId}` réellement PRÉVUS dans des records de prédiction :
// au moins une unité sur le TOTAL du couple (la timeline porte des quantités décimales
// par minute). Un couple à 0,3 unité n'est pas prévu : il ne doit pas masquer une
// quantité manuelle saisie en « Sans ventes prévues » (retour Bertrand 2026-10-07).

/**
 * @param {Array<object>} records `{ shopId|shop, menuItemId|mappedMenuItemId, totalQuantity|quantity }`
 * @returns {Set<string>}
 */
export function predictedShopItemKeys(records) {
  const qtyByKey = new Map()
  for (const r of records || []) {
    const k = `${r.shopId || r.shop}|${r.menuItemId || r.mappedMenuItemId}`
    const q = Number(r.totalQuantity ?? r.quantity ?? 0) || 0
    qtyByKey.set(k, (qtyByKey.get(k) || 0) + q)
  }
  const out = new Set()
  for (const [k, q] of qtyByKey) if (Math.round(q) > 0) out.add(k)
  return out
}
