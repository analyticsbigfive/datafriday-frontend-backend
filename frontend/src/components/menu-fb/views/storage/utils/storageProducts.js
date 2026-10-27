import { groupMarketPriceRows } from '../../market-prices/utils/groupMarketPriceRows'
import { getSupplierSiteIds } from '@/utils/supplierHelpers'

/** Horodatage le plus récent d'une ligne (createdAt / updatedAt), 0 si absent ou invalide. */
export function rowTimestamp(row) {
  const times = [row?.createdAt, row?.updatedAt]
    .map((v) => (v ? new Date(v).getTime() : 0))
    .filter((n) => Number.isFinite(n))
  return times.length ? Math.max(...times) : 0
}

/** Clé stable d'un ensemble d'espaces (ordre et doublons ignorés). */
export function spaceSetKey(spaceIds) {
  return Array.from(new Set((spaceIds || []).map(String))).sort().join('|')
}

/** Noms d'articles dont AU MOINS UNE ligne Market Price est utilisée en recette (même nom = même produit). */
export function usedItemNames(rows, usedIds) {
  const used = new Set((usedIds || []).map(String))
  const names = new Set()
  for (const r of rows || []) {
    const id = r?.id ?? r?._id
    if (id != null && used.has(String(id))) {
      const name = String(r?.itemName || r?.name || '').trim()
      if (name) names.add(name)
    }
  }
  return names
}

/**
 * Cartes de la page Stockage : un produit (itemName) hors recettes, dédoublonné par ensemble
 * d'espaces. Les espaces d'une ligne sont les `sites` de son fournisseur. Deux lignes au même
 * ensemble d'espaces ne donnent qu'une carte (la plus récente). Un produit sans fournisseur
 * rattaché à un espace donne une carte sans espace.
 *
 * @returns {Array<{ key, name, image, type, goodType, category, spaceIds, marketPriceId, reference, item }>}
 *   `item` = produit groupé complet (réutilisable tel quel par MarketPriceEditDrawer).
 */
export function buildStorageProducts(rows, { suppliers = [], industrials = [], usedIds = [] } = {}) {
  const excluded = usedItemNames(rows, usedIds)
  const keptRows = (rows || []).filter((r) => !excluded.has(String(r?.itemName || r?.name || '').trim()))
  const rawById = new Map(keptRows.map((r) => [String(r?.id ?? r?._id), r]))
  const sitesBySupplier = new Map((suppliers || []).map((s) => [String(s.id), getSupplierSiteIds(s)]))
  const items = groupMarketPriceRows(keptRows, { suppliers, industrials })
  const cards = []

  for (const item of items) {
    const bySet = new Map()
    for (const sr of item.supplierRows || []) {
      const spaceIds = sitesBySupplier.get(String(sr.supplierId)) || []
      const key = spaceSetKey(spaceIds)
      const ts = rowTimestamp(rawById.get(String(sr.id)))
      const prev = bySet.get(key)
      if (!prev || ts > prev.ts) bySet.set(key, { sr, ts, spaceIds: Array.from(new Set(spaceIds.map(String))) })
    }
    if (!bySet.size) {
      cards.push(makeCard(item, null, []))
      continue
    }
    for (const { sr, spaceIds } of bySet.values()) cards.push(makeCard(item, sr, spaceIds))
  }
  return cards
}

function makeCard(item, sr, spaceIds) {
  return {
    key: `${item.name}::${spaceSetKey(spaceIds)}`,
    name: item.name,
    image: item.image,
    type: item.type,
    goodType: item.goodType,
    category: item.category,
    spaceIds,
    marketPriceId: sr?.id || '',
    reference: sr?.supplierItemName || item.name,
    item,
  }
}

/** Espaces proposés au filtre : ceux des fournisseurs, triés par nom. */
export function spaceFilterOptions(suppliers, spaces) {
  const ids = new Set()
  for (const s of suppliers || []) getSupplierSiteIds(s).forEach((id) => ids.add(String(id)))
  const names = (spaces || []).filter((sp) => ids.has(String(sp.id))).map((sp) => sp.name).filter(Boolean)
  return Array.from(new Set(names)).sort((a, b) => String(a).localeCompare(String(b)))
}

/** Filtres de la page (type, catégorie, espace par nom, recherche). `allSpaces` = libellé « tous ». */
export function filterStorageProducts(cards, { search = '', type = 'All Types', category = 'All Categories', spaceName = '', allSpaces = '', spaces = [] } = {}) {
  const q = String(search || '').trim().toLowerCase()
  const nameById = new Map((spaces || []).map((s) => [String(s.id), s.name]))
  return (cards || []).filter((c) => {
    if (type && type !== 'All Types' && c.type !== type) return false
    if (category && category !== 'All Categories' && c.category !== category) return false
    if (spaceName && spaceName !== allSpaces && !c.spaceIds.some((id) => nameById.get(String(id)) === spaceName)) return false
    if (q) {
      const hay = [c.name, c.goodType, c.category, c.reference].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
