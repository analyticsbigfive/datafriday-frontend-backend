import { normalizeItemName, rowMatchesItem } from '@/utils/storageStoredFilter'
import { buildManualStorageItem } from '@/utils/storageManualItem'

/**
 * Une ligne ElementInventory porte-t-elle un stock tampon sur son emplacement ?
 * Définition UNIQUE (Commandes et listes PDV) : quantité > 0 et ligne non décochée
 * (isStored !== false).
 */
export function isBufferRow(row) {
  return !!row && (Number(row.quantity) || 0) > 0 && row.isStored !== false
}

/**
 * Fabrique d'article de liste PDV pour un produit en tampon absent des recettes.
 * Même forme qu'un item de buildConsolidatedInventory (id, name, picture, usedIn,
 * marketPriceId, unit, conditionnement). L'id est celui du Market Price (comptages et
 * push Logistique indexés par id) ; sans Market Price : id de la ligne, sinon clé de nom.
 *
 * @param {{name:string, marketPriceId?:string}} row
 * @param {Array} marketPrices
 */
export function buildBufferItem(row, marketPrices) {
  const base = buildManualStorageItem(row, marketPrices)
  const rowId = row?.marketPriceId != null && row.marketPriceId !== '' ? String(row.marketPriceId) : null
  const id = base.id ?? rowId ?? `buffer:${normalizeItemName(row?.name)}`
  const { storageType, ...item } = base
  return {
    ...item,
    id,
    marketPriceId: base.marketPriceId ?? rowId,
    inventoryPackagingId: base.inventoryPackagingId ?? undefined,
    isComponent: undefined,
    isBuffer: true,
  }
}

/**
 * Ajoute à la liste d'un PDV les produits en tampon absents. Ne filtre JAMAIS les
 * articles issus des recettes. Correspondance via rowMatchesItem (id puis nom) ;
 * lignes dédoublonnées par id puis nom. rows non tableau : items inchangé.
 *
 * @param {Array<{name:string}>} items
 * @param {Array|null|undefined} rows lignes ElementInventory du PDV
 * @param {(row:object) => object} makeItem
 */
export function appendBufferItems(items, rows, makeItem) {
  const list = Array.isArray(items) ? items : []
  if (!Array.isArray(rows)) return list
  const out = [...list]
  const added = new Set()
  for (const row of rows) {
    if (!isBufferRow(row)) continue
    const nameKey = normalizeItemName(row.name)
    const idKey = row.marketPriceId ? `id:${row.marketPriceId}` : null
    if (!nameKey && !idKey) continue
    if (list.some((it) => rowMatchesItem(row, it))) continue
    if ((idKey && added.has(idKey)) || (nameKey && added.has(`name:${nameKey}`))) continue
    if (idKey) added.add(idKey)
    if (nameKey) added.add(`name:${nameKey}`)
    out.push(makeItem(row))
  }
  return out
}
