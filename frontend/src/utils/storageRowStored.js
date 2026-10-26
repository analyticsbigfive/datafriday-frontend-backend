/**
 * Une ligne d'inventaire de stockage est-elle "stockée sur cette réserve" ?
 * Valeur explicite `isStored` si présente, sinon repli pour les lignes historiques :
 * cochée si quantité > 0 ou stock min / max renseigné. Une ligne absente = décochée.
 */
export function isRowStored(row) {
  if (!row) return false
  if (row.isStored === true || row.isStored === false) return row.isStored
  return (
    (Number(row.quantity) || 0) > 0 ||
    row.minStock != null ||
    row.maxStock != null
  )
}
