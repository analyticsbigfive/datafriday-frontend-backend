/**
 * Fournisseur d'une ligne de l'onglet STOCK (Commande), pour l'afficher comme sur la carte PDV.
 * Market Price retrouvé par son id (porté par la ligne d'inventaire du stockage), puis même cascade
 * de nom que les lignes PDV (stockItemMetaByItem) : fournisseur par id, puis relation du Market Price.
 *
 * @returns {{ supplierName: string, marketPriceRow: object|null }}
 */
export function storageRowSupplier(row, { marketPrices = [], suppliers = [] } = {}) {
  const id = row?.marketPriceId ? String(row.marketPriceId) : ''
  const mp = id ? (marketPrices || []).find((m) => String(m?.id) === id) || null : null
  if (!mp) return { supplierName: '', marketPriceRow: null }
  const supplierId = mp.supplierId || mp.supplier?.id || (typeof mp.supplier === 'string' ? mp.supplier : null)
  const supplier = supplierId ? (suppliers || []).find((s) => String(s?.id) === String(supplierId)) : null
  const supplierName = supplier?.name || mp.supplierRel?.name || mp.supplier?.name || ''
  return { supplierName, marketPriceRow: mp }
}
