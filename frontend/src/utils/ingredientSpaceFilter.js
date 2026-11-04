import { getSupplierSiteIds } from '@/utils/supplierHelpers'

// Filtre des ingredients selon les espaces de la fiche (Menu Item ou Composant).
// Un ingredient n'a pas d'espace en propre : il vient de son fournisseur (Supplier.sites).
// Regles :
//  - fiche sans espace : aucun filtre
//  - ingredient sans fournisseur : masque des que la fiche a un espace (regle validee 03/11)
//  - fournisseur avec sites vide : commun a tous les espaces, visible
//  - sinon visible si ses sites croisent au moins un espace de la fiche

function toId(value) {
  if (value == null) return ''
  if (typeof value === 'object') return String(value.id ?? value._id ?? value.value ?? '').trim()
  return String(value).trim()
}

export function normalizeSpaceIds(spaceIds) {
  if (!Array.isArray(spaceIds)) return []
  return spaceIds.map(toId).filter(Boolean)
}

export function getRowSupplierSiteIds(marketPrice) {
  return getSupplierSiteIds(marketPrice?.supplierRel).map(String)
}

export function isIngredientVisibleForSpaces(row, spaceIds) {
  const wanted = normalizeSpaceIds(spaceIds)
  if (!wanted.length) return true
  const hasSupplier = !!(row?.supplier_id || row?.supplierName)
  if (!hasSupplier) return false
  const sites = Array.isArray(row?.supplierSiteIds) ? row.supplierSiteIds : []
  if (!sites.length) return true
  return sites.some((id) => wanted.includes(String(id)))
}

export function filterIngredientRowsBySpaces(rows, spaceIds) {
  const list = Array.isArray(rows) ? rows : []
  if (!normalizeSpaceIds(spaceIds).length) return list
  return list.filter((r) => isIngredientVisibleForSpaces(r, spaceIds))
}
