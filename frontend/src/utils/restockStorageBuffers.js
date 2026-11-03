/**
 * Drawer « Paramétrer » d'un stockage (onglet STOCK de Commande) : liste des articles avec, pour ce
 * stockage, la case « stocké ici » et le stock tampon en colis. Fonctions pures.
 */
import { findProductRow } from '@/components/menu-fb/views/storage/utils/storageSpots'
import { rowsForConfigs, normalizeItemName } from '@/utils/storageStoredFilter'
import { isRowStored } from '@/utils/storageRowStored'
import { unitsToPacks } from '@/utils/bufferPackaging'

/**
 * Lignes du drawer : produits de la page Stockage, plus les articles déjà présents sur le stockage
 * (ajouts manuels absents de la liste). Articles stockés ici d'abord, puis par nom.
 *
 * @param {Array<{name:string, marketPriceId?:string}>} products produits proposés
 * @param {object} inventoryByConfig lignes d'inventaire de l'élément stockage
 * @param {object} local valeurs saisies non encore relues : { [nom normalisé]: { isStored?, quantity? (colis) } }
 * @param {(product:object)=>object|null} packOf Market Price du produit (contenance du colis)
 * @returns {Array<{ key:string, name:string, marketPriceId:string, stored:boolean, quantity:number }>}
 */
export function storageBufferRows(products, inventoryByConfig, local = {}, packOf = () => null) {
  const byKey = new Map()
  for (const p of products || []) {
    const key = normalizeItemName(p?.name)
    if (key && !byKey.has(key)) byKey.set(key, { name: p.name, marketPriceId: p.marketPriceId || '' })
  }
  for (const r of rowsForConfigs(inventoryByConfig, null)) {
    const key = normalizeItemName(r?.name)
    if (key && !byKey.has(key) && isRowStored(r)) byKey.set(key, { name: r.name, marketPriceId: r.marketPriceId || '' })
  }
  const out = []
  for (const [key, product] of byKey) {
    const row = findProductRow(inventoryByConfig, product)
    const override = local[key] || {}
    const stored = override.isStored !== undefined ? override.isStored : isRowStored(row)
    const quantity = override.quantity !== undefined
      ? override.quantity
      : unitsToPacks(row ? Number(row.quantity) || 0 : 0, packOf(product))
    out.push({ key, name: product.name, marketPriceId: product.marketPriceId, stored, quantity })
  }
  return out.sort((a, b) => (a.stored === b.stored ? a.name.localeCompare(b.name) : a.stored ? -1 : 1))
}

/** Filtre par nom, sans casse. Requête vide = tout. */
export function filterBufferRows(rows, query) {
  const q = String(query || '').trim().toLowerCase()
  return q ? (rows || []).filter((r) => r.name.toLowerCase().includes(q)) : rows || []
}
