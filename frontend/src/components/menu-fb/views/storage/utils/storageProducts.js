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

const rowName = (r) => String(r?.itemName || r?.name || '').trim()
const rowId = (r) => (r?.id ?? r?._id) != null ? String(r?.id ?? r?._id) : ''

/** Noms d'articles dont AU MOINS UNE ligne Market Price est utilisée en recette (même nom = même produit). */
export function usedItemNames(rows, usedIds) {
  const used = new Set((usedIds || []).map(String))
  const names = new Set()
  for (const r of rows || []) {
    const id = rowId(r)
    if (id && used.has(id) && rowName(r)) names.add(rowName(r))
  }
  return names
}

/**
 * Exclusion par espace. Par produit (même nom) : une ligne en recette n'apparaît jamais ; U = union
 * des espaces de ses lignes en recette ; une ligne hors recette perd les espaces de U et disparaît
 * s'il ne lui en reste aucun. Une ligne hors recette sans aucun espace n'est retirée que si le
 * produit a au moins une ligne en recette.
 *
 * @returns {{ rows: Array, spacesByRowId: Map<string, string[]> }} lignes gardées et leurs espaces restants
 */
export function subtractUsedSpaces(rows, usedIds, sitesBySupplier) {
  const used = new Set((usedIds || []).map(String))
  const usedSpacesByName = new Map() // nom -> Set d'espaces couverts par les lignes en recette
  for (const r of rows || []) {
    if (!used.has(rowId(r))) continue
    const set = usedSpacesByName.get(rowName(r)) || new Set()
    ;(sitesBySupplier.get(String(r.supplierId)) || []).forEach((id) => set.add(String(id)))
    usedSpacesByName.set(rowName(r), set)
  }
  const kept = []
  const spacesByRowId = new Map()
  for (const r of rows || []) {
    if (used.has(rowId(r))) continue
    const own = Array.from(new Set((sitesBySupplier.get(String(r.supplierId)) || []).map(String)))
    const u = usedSpacesByName.get(rowName(r))
    if (!u) {
      kept.push(r)
      spacesByRowId.set(rowId(r), own)
      continue
    }
    if (!own.length) continue
    const remaining = own.filter((id) => !u.has(id))
    if (!remaining.length) continue
    kept.push(r)
    spacesByRowId.set(rowId(r), remaining)
  }
  return { rows: kept, spacesByRowId }
}

/**
 * Cartes de la page Stockage : un produit (itemName) par ensemble d'espaces. Les espaces d'une
 * ligne sont les `sites` de son fournisseur, moins ceux déjà couverts par une ligne du même produit
 * utilisée en recette (voir subtractUsedSpaces). Le dédoublonnage (même ensemble d'espaces, la
 * plus récente) s'applique après cette soustraction. Un produit sans fournisseur rattaché à un
 * espace donne une carte sans espace (sauf s'il a une ligne en recette).
 *
 * @returns {Array<{ key, name, image, type, goodType, category, spaceIds, marketPriceId, reference, item }>}
 *   `item` = produit groupé complet (réutilisable tel quel par MarketPriceEditDrawer).
 */
export function buildStorageProducts(rows, { suppliers = [], industrials = [], usedIds = [] } = {}) {
  const sitesBySupplier = new Map((suppliers || []).map((s) => [String(s.id), getSupplierSiteIds(s)]))
  const { rows: keptRows, spacesByRowId } = subtractUsedSpaces(rows, usedIds, sitesBySupplier)
  const rawById = new Map(keptRows.map((r) => [rowId(r), r]))
  const items = groupMarketPriceRows(keptRows, { suppliers, industrials })
  const cards = []

  for (const item of items) {
    const bySet = new Map()
    for (const sr of item.supplierRows || []) {
      const spaceIds = spacesByRowId.get(String(sr.id)) || []
      const key = spaceSetKey(spaceIds)
      const ts = rowTimestamp(rawById.get(String(sr.id)))
      const prev = bySet.get(key)
      if (!prev || ts > prev.ts) bySet.set(key, { sr, ts, spaceIds })
    }
    if (!bySet.size) {
      cards.push(makeCard(item, null, []))
      continue
    }
    for (const { sr, spaceIds } of bySet.values()) cards.push(makeCard(item, sr, spaceIds))
  }
  return cards
}

/** Référence affichée d'un produit (carte ET drawer) : réf. fournisseur, sinon nom du produit. */
export function storageReference(supplierRow, name) {
  return supplierRow?.supplierItemName || name
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
    reference: storageReference(sr, item.name),
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
