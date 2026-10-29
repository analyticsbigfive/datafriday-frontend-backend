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
 * Market Price d'une ligne (ou d'une référence { name, marketPriceId }) : id d'abord (survit à un
 * renommage), nom normalisé en repli (lignes historiques). null si introuvable.
 */
export function resolveMarketPrice(ref, marketPrices) {
  const list = Array.isArray(marketPrices) ? marketPrices : []
  const key = normalizeItemName(ref?.name)
  const refId = ref?.marketPriceId != null && ref.marketPriceId !== '' ? String(ref.marketPriceId) : null
  return (
    (refId ? list.find((m) => m?.id != null && String(m.id) === refId) : null) ||
    (key ? list.find((m) => normalizeItemName(m?.itemName) === key) : null) ||
    null
  )
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
  const rowId = row?.marketPriceId != null && row.marketPriceId !== '' ? String(row.marketPriceId) : null
  const mp = resolveMarketPrice(row, marketPrices)
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
