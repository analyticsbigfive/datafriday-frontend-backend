import { normalizeItemName } from '@/utils/storageStoredFilter'

/**
 * Quantité par paquet d'un Market Price : même règle que buildConsolidatedInventory
 * (le drawer Market Price persiste la valeur dans `packedUnits`).
 */
function resolveQtyPackaged(mp) {
  return Number(mp?.inventoryQuantityPackaged) > 0
    ? mp.inventoryQuantityPackaged
    : Number(mp?.packedUnits) > 0
      ? mp.packedUnits
      : (mp?.inventoryQuantityPackaged ?? null)
}

/**
 * Fabrique d'article d'inventaire pour une ligne de stockage cochée à la main
 * (article ajouté depuis Menu F&B > Stockage, absent des recettes des boutiques liées).
 * Même forme que les items de buildStorageInventory. Le nom est l'itemName exact du
 * Market Price (le ledger Logistic est keyé par nom). Sans Market Price : item minimal.
 * `storageType` reste null : le type n'est pas déduit d'une recette, l'article est un
 * choix explicite de l'utilisateur.
 *
 * @param {{name:string}} row ligne ElementInventory
 * @param {Array} marketPrices
 */
export function buildManualStorageItem(row, marketPrices) {
  const key = normalizeItemName(row?.name)
  const list = Array.isArray(marketPrices) ? marketPrices : []
  // Id du Market Price d'abord (survit à un renommage), nom en repli (lignes historiques).
  const rowId = row?.marketPriceId != null && row.marketPriceId !== '' ? String(row.marketPriceId) : null
  const mp =
    (rowId ? list.find((m) => m?.id != null && String(m.id) === rowId) : null) ||
    list.find((m) => normalizeItemName(m?.itemName) === key) ||
    null
  return {
    id: mp?.id ?? null,
    name: mp?.itemName ?? String(row?.name ?? '').trim(),
    storageType: null,
    picture: mp?.image ?? null,
    marketPriceId: mp?.id ?? rowId,
    unit: mp?.unit ?? row?.unit ?? null,
    inventoryPackagingId: mp?.inventoryPackagingId ?? null,
    inventoryQuantityPackaged: mp ? (resolveQtyPackaged(mp) ?? null) : null,
    inventoryPackaging: mp?.inventoryPackaging ?? null,
    usedIn: [],
    isManual: true,
  }
}
