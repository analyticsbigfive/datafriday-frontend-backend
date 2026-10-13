/**
 * Traduit les filtres de la page Analyse vers les paramètres des endpoints stock
 * (B : valorisation actuelle, C : valorisation par event).
 *
 * Les filtres PdV de la page parlent le vocabulaire du frontend (noms de PdV, types
 * canoniques, noms d'étage) : on envoie des NOMS de PdV, que le serveur résout :
 * les PdV vers des noms (le serveur les résout) via les PdV de la config pour type et zone. Industriel et fournisseur
 * sont stockés par nom, le backend veut des ids (portés par l'endpoint A).
 */
import { normalizeStr } from '@/utils/predictiveAnalytics'
import { normalizeShopType } from '@/constants/shopTypes'
import { NOT_SET_KEY } from '@/utils/articleDimensionBreakdown'

/** Filtres de l'autre grain (article, promo, marque) que le stock ne sait pas appliquer. */
export const STOCK_IGNORED_FILTERS = [
  { key: 'selectedBrands', labelKey: 'anFilterBrand' },
  { key: 'selectedPromotions', labelKey: 'anFilterPromotion' },
  { key: 'selectedPromotionTypes', labelKey: 'anFilterPromotionType' },
  { key: 'selectedMenuItemIds', labelKey: 'anMenuItems' },
  { key: 'selectedMenuItemTypes', labelKey: 'anItemType' },
  { key: 'selectedMenuItemCategories', labelKey: 'anCategory' },
]

const has = (arr) => Array.isArray(arr) && arr.length > 0

/** Un filtre PdV, type de PdV ou zone est actif. */
export function hasShopScopeFilter(filters) {
  const f = filters || {}
  return has(f.selectedShopIds) || has(f.selectedShopTypes) || has(f.selectedShopAreas)
}

/**
 * Noms des PdV qui passent les filtres PdV / type / zone (intersection des trois).
 * L'identité d'un PdV dans l'Analyse est son NOM : le serveur résout `shopNames` vers ses
 * éléments (les ids de la config ne correspondent pas à SpaceElement.id). Type et zone ne
 * se lisent que sur les PdV de la config, d'où le croisement avec `floorElements`.
 * @returns {{ active: boolean, names: string[], unresolved: boolean }}
 *   unresolved : type ou zone actifs mais aucun PdV de la config ne correspond. Envoyer une
 *   liste vide ferait calculer le stock de TOUS les PdV, d'où l'état séparé.
 */
export function resolveShopNames(filters, floorElements) {
  const f = filters || {}
  if (!hasShopScopeFilter(f)) return { active: false, names: [], unresolved: false }
  const selectedNames = has(f.selectedShopIds) ? f.selectedShopIds : null
  const types = has(f.selectedShopTypes) ? new Set(f.selectedShopTypes) : null
  const areas = has(f.selectedShopAreas) ? new Set(f.selectedShopAreas) : null
  // Seuls des noms : aucun besoin de la config, ils partent tels quels.
  if (!types && !areas) return { active: true, names: [...selectedNames], unresolved: false }
  const wanted = selectedNames ? new Set(selectedNames.map(normalizeStr)) : null
  const names = []
  for (const el of floorElements || []) {
    if (!el?.name) continue
    if (wanted && !wanted.has(normalizeStr(el.name))) continue
    if (types) {
      const raw = Array.isArray(el.shopType) ? el.shopType.join(',') : el.shopType
      const tokens = normalizeShopType(raw).split(', ').filter(Boolean)
      if (!tokens.some((tk) => types.has(tk))) continue
    }
    if (areas) {
      const area = String(el.floorName || el.area || '').trim()
      if (!areas.has(area)) continue
    }
    names.push(el.name)
  }
  return { active: true, names, unresolved: names.length === 0 }
}

/** Noms sélectionnés -> ids (industriel ou fournisseur) via l'index de l'endpoint A. */
export function resolveIdsByName(index, names, kind) {
  if (!has(names)) return { active: false, ids: [], unresolved: false }
  const wanted = new Set(names)
  const ids = new Set()
  let missing = wanted.has(NOT_SET_KEY)
  const found = new Set()
  for (const dim of index?.values?.() || []) {
    const rows = kind === 'industrial' ? dim.industrialShares : dim.supplierCosts
    for (const row of rows || []) {
      const id = kind === 'industrial' ? row?.industrialId : row?.supplierId
      if (row?.name && wanted.has(row.name) && id) {
        ids.add(String(id))
        found.add(row.name)
      }
    }
  }
  for (const n of wanted) if (n !== NOT_SET_KEY && !found.has(n)) missing = true
  // Un nom sans id (texte libre, « Non renseigné ») ne peut pas filtrer le stock côté serveur.
  return { active: true, ids: [...ids], unresolved: missing || ids.size === 0 }
}

/**
 * Paramètres de l'endpoint B. `unresolved` liste les filtres actifs impossibles à traduire :
 * le widget affiche alors le tiret de valeur absente plutôt qu'un total non filtré.
 * @returns {{ params: Object, unresolved: Array<'shop'|'industrial'|'supplier'>, ignoredKeys: string[] }}
 */
export function buildStockParams(filters, floorElements, index) {
  const shop = resolveShopNames(filters, floorElements)
  const industrial = resolveIdsByName(index, filters?.selectedIndustrials, 'industrial')
  const supplier = resolveIdsByName(index, filters?.selectedSuppliers, 'supplier')
  const unresolved = []
  if (shop.unresolved) unresolved.push('shop')
  if (industrial.unresolved) unresolved.push('industrial')
  if (supplier.unresolved) unresolved.push('supplier')
  return {
    params: { shopNames: shop.names, industrialIds: industrial.ids, supplierIds: supplier.ids },
    unresolved,
    ignoredKeys: STOCK_IGNORED_FILTERS.filter((x) => has(filters?.[x.key])).map((x) => x.key),
  }
}
