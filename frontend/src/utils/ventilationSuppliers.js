// Filtre « Fournisseur » du mode Ventilation (maquette Bertrand du 2026-10-09 :
// « filtre les éléments par fournisseurs en fonction de là où ils arrivent »).
//
// Source : le fournisseur retenu pour l'achat dans la feuille de réarmement
// (étape 3, `shoppingGroups`), c'est-à-dire celui qui livre réellement ce match.
// Repli : le fournisseur de la fiche article (MarketPrice), pour un article déposé
// sans passer par la feuille de course. Un article peut venir de plusieurs
// fournisseurs. Fonctions PURES.

import { normalizeStr } from '@/utils/predictiveAnalytics'

/** Valeur du filtre pour les articles sans fournisseur connu. */
export const NO_SUPPLIER = '__none__'

function supplierKey(id, name) {
  if (id != null && String(id) !== '') return String(id)
  const n = normalizeStr(name)
  return n ? `name:${n}` : null
}

function addSupplier(map, itemName, id, name) {
  const item = normalizeStr(itemName)
  const key = supplierKey(id, name)
  if (!item || !key) return
  const list = map.get(item) || []
  if (!list.some((s) => s.id === key)) list.push({ id: key, name: String(name || '').trim() || key })
  map.set(item, list)
}

/**
 * Index nom d'article normalisé → fournisseurs.
 * @param {object|null} plan feuille de réarmement (`shoppingGroups`)
 * @param {Array<{itemName:string, supplier?:string, supplierId?:string}>} [marketPrices]
 * @returns {Map<string, Array<{id:string, name:string}>>}
 */
export function buildSupplierIndex(plan, marketPrices = []) {
  const fromPlan = new Map()
  for (const group of plan?.shoppingGroups || []) {
    for (const item of group?.items || []) addSupplier(fromPlan, item?.itemName, group.supplierId, group.supplierName)
  }
  const index = new Map(fromPlan)
  for (const mp of marketPrices || []) {
    // La feuille fait foi pour les articles qu'elle achète.
    if (fromPlan.has(normalizeStr(mp?.itemName))) continue
    addSupplier(index, mp?.itemName, mp?.supplierId, mp?.supplier)
  }
  return index
}

/** Fournisseurs d'un article (liste vide si inconnu). */
export function suppliersOf(index, itemName) {
  return index?.get(normalizeStr(itemName)) || []
}

/**
 * Options du filtre : fournisseurs des articles affichés, triés par nom, puis
 * « Sans fournisseur » s'il y a des articles sans fournisseur.
 * @param {Array<{itemName:string}>} groups
 * @param {Map} index
 * @returns {Array<{value:string, label:string|null}>} label null = « Sans fournisseur » (traduit par la vue)
 */
export function supplierOptions(groups, index) {
  const seen = new Map()
  let hasNone = false
  for (const g of groups || []) {
    const list = suppliersOf(index, g.itemName)
    if (!list.length) hasNone = true
    for (const s of list) if (!seen.has(s.id)) seen.set(s.id, s.name)
  }
  const options = [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  if (hasNone) options.push({ value: NO_SUPPLIER, label: null })
  return options
}

/**
 * Garde les articles d'au moins un des fournisseurs choisis (aucun choix = tout).
 * @param {Array<{itemName:string}>} groups
 * @param {Map} index
 * @param {string[]} selected valeurs de supplierOptions
 */
export function filterGroupsBySupplier(groups, index, selected) {
  if (!selected?.length) return groups || []
  const wanted = new Set(selected)
  return (groups || []).filter((g) => {
    const list = suppliersOf(index, g.itemName)
    if (!list.length) return wanted.has(NO_SUPPLIER)
    return list.some((s) => wanted.has(s.id))
  })
}
