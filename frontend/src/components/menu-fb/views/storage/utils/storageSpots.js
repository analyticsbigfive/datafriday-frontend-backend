import { normalizeType } from '@/components/spaces/views/builder2/constants/elementTaxonomy'
import { rowsForConfigs, normalizeItemName } from '@/utils/storageStoredFilter'
import { isRowStored } from '@/utils/storageRowStored'

/** Éléments du builder d'un espace répartis en PDV (shop, merchshop) et Storage. */
export function splitSpots(elements) {
  const shops = []
  const storages = []
  for (const el of elements || []) {
    const t = normalizeType(el.type)
    if (t === 'shop' || t === 'merchshop') shops.push(el)
    else if (t === 'storage') storages.push(el)
  }
  const byName = (a, b) => String(a.name).localeCompare(String(b.name))
  return { shops: shops.sort(byName), storages: storages.sort(byName) }
}

/**
 * Ligne d'inventaire du produit sur un élément (union des configs) : la ligne cochée si une
 * l'est, sinon la première trouvée, sinon null.
 */
export function findProductRow(inventoryByConfig, productName) {
  const key = normalizeItemName(productName)
  const matches = rowsForConfigs(inventoryByConfig, null).filter((r) => normalizeItemName(r?.name) === key)
  return matches.find((r) => isRowStored(r)) || matches[0] || null
}

/** Filtre de recherche (nom, sans casse). */
export function filterSpots(list, query) {
  const q = String(query || '').trim().toLowerCase()
  return q ? list.filter((e) => String(e.name).toLowerCase().includes(q)) : list
}
