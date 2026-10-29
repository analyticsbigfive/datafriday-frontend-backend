import { normalizeType } from '@/components/spaces/views/builder2/constants/elementTaxonomy'
import { rowsForConfigs, normalizeItemName, rowMatchesItem } from '@/utils/storageStoredFilter'
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
export function findProductRow(inventoryByConfig, product) {
  // `product` = nom (string) ou { name, marketPriceId } : id du Market Price d'abord, nom en repli.
  const target = typeof product === 'object' && product !== null ? product : { name: product }
  const item = { name: target.name, marketPriceId: target.marketPriceId }
  const all = rowsForConfigs(inventoryByConfig, null)
  const byId = target.marketPriceId ? all.filter((r) => r?.marketPriceId && rowMatchesItem(r, { marketPriceId: item.marketPriceId })) : []
  const matches = byId.length ? byId : all.filter((r) => normalizeItemName(r?.name) === normalizeItemName(item.name))
  return matches.find((r) => isRowStored(r)) || matches[0] || null
}

/** Filtre de recherche (nom, sans casse). */
export function filterSpots(list, query) {
  const q = String(query || '').trim().toLowerCase()
  return q ? list.filter((e) => String(e.name).toLowerCase().includes(q)) : list
}

/**
 * État d'un élément pour un ou plusieurs produits. `rowFor(produit)` renvoie la ligne d'inventaire du
 * produit (ou null). stored = tous les produits y sont stockés, partial = une partie seulement,
 * quantity = valeur commune des tampons, ou null si elles diffèrent. `override` = valeurs locales
 * { isStored?, quantity? } appliquées à tous les produits.
 */
export function aggregateSpot(rowFor, names, override = {}) {
  const rows = (names || []).map((n) => rowFor(n))
  const storedCount = override.isStored !== undefined ? (override.isStored ? rows.length : 0) : rows.filter((r) => isRowStored(r)).length
  const quantities = rows.map((r) => (r ? Number(r.quantity) || 0 : 0))
  const common = quantities.length && quantities.every((q) => q === quantities[0]) ? quantities[0] : null
  return {
    stored: rows.length > 0 && storedCount === rows.length,
    partial: storedCount > 0 && storedCount < rows.length,
    quantity: override.quantity !== undefined ? override.quantity : common,
  }
}
