// Transactions apportées par les quantités MANUELLES (articles « Sans ventes prévues »)
// d'Event Predict. Retour Bertrand 2026-10-07 : ajouter un de ces articles montait le
// CA ajusté mais pas les transactions, d'où une Transformation (et un Panier) faux.
//
// Règle : chaque unité manuelle vaut le ratio transactions / unités prédit pour son
// PDV (tickets de la timeline si elle les porte, sinon 1 par unité, même repli que
// `timelineRevenueTotals`). PDV sans prévision : 1 transaction par unité.

/**
 * @param {Array<{ shopId: string, totalQuantity: number }>} manualRecords
 * @param {Map<string, number>} txPerUnitByShop ratio transactions / unités par PDV
 * @returns {number}
 */
export function manualTransactions(manualRecords, txPerUnitByShop) {
  let total = 0
  for (const r of manualRecords || []) {
    const qty = Number(r?.totalQuantity) || 0
    if (qty <= 0) continue
    const ratio = txPerUnitByShop?.get(String(r.shopId))
    total += qty * (Number.isFinite(ratio) && ratio > 0 ? ratio : 1)
  }
  return total
}
