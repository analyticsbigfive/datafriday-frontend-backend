// Filtre « Fournisseur » du mode Ventilation (maquette Bertrand du 2026-10-09 :
// « filtre les éléments par fournisseurs en fonction de là où ils arrivent »).
//
// Source : le fournisseur retenu pour l'achat dans la feuille de réarmement
// (étape 3, `shoppingGroups`), c'est-à-dire celui qui livre réellement ce match.
// Repli : le fournisseur de la fiche article (MarketPrice), pour un article déposé
// sans passer par la feuille de course. Le repli prend la fiche exacte de la ligne
// (celle de la recette), sinon les seules fiches des fournisseurs de l'espace
// (retour Bertrand du 2026-10-09 : un même article a plusieurs fournisseurs selon
// l'espace, seul celui de l'espace compte). Un article peut venir de plusieurs
// fournisseurs. Les noms viennent de la liste des fournisseurs quand la source n'a
// que l'id (cas des fiches articles) : un id n'est jamais affiché. Fonctions PURES.

import { normalizeStr } from '@/utils/predictiveAnalytics'

/** Valeur du filtre pour les articles sans fournisseur connu. */
export const NO_SUPPLIER = '__none__'

function supplierKey(id, name) {
  if (id != null && String(id) !== '') return String(id)
  const n = normalizeStr(name)
  return n ? `name:${n}` : null
}

/** Groupe technique de la feuille de course (`__finished__`, « ingrédients
 *  manquants ») : pas un fournisseur, l'article compte comme sans fournisseur. */
function isTechnicalSupplierId(id) {
  return String(id ?? '').startsWith('__')
}

function addSupplier(map, itemName, id, name, supplierNames) {
  if (isTechnicalSupplierId(id)) return
  const item = normalizeStr(itemName)
  const label = String(name || '').trim() || (id != null ? supplierNames?.get(String(id)) : '') || ''
  // Ni nom ni fournisseur connu : jamais l'id brut à l'écran, l'article reste « sans fournisseur ».
  if (!item || !label) return
  const key = supplierKey(id, label)
  const list = map.get(item) || []
  if (!list.some((s) => s.id === key)) list.push({ id: key, name: label })
  map.set(item, list)
}

/** Id de fiche article d'une ligne de dépôt (`itemKey` = « id|||unité »). */
function lineMarketPriceId(line) {
  const key = String(line?.itemKey ?? '')
  return key.includes('|||') ? key.split('|||')[0] : null
}

/**
 * Fiches du repli pour un article : la fiche exacte d'une ligne de dépôt, sinon
 * celles des fournisseurs de l'espace (toutes si l'espace est inconnu).
 */
function fallbackMarketPrices(candidates, lineMpIds, spaceSupplierIds) {
  const exact = candidates.filter((mp) => mp?.id != null && lineMpIds.has(String(mp.id)))
  if (exact.length) return exact
  if (!spaceSupplierIds) return candidates
  return candidates.filter((mp) => mp?.supplierId != null && spaceSupplierIds.has(String(mp.supplierId)))
}

/**
 * Index nom d'article normalisé → fournisseurs.
 * @param {object|null} plan feuille de réarmement (`shoppingGroups`)
 * @param {Array<{id?:string, itemName:string, supplier?:string, supplierId?:string}>} [marketPrices]
 * @param {Map<string, string>} [supplierNames] id → nom (liste des fournisseurs)
 * @param {object} [scope]
 * @param {Array<{itemKey?:string}>} [scope.lines] lignes de dépôt (fiche exacte de la recette)
 * @param {Set<string>|null} [scope.spaceSupplierIds] fournisseurs de l'espace (null = inconnu)
 * @returns {Map<string, Array<{id:string, name:string}>>}
 */
export function buildSupplierIndex(plan, marketPrices = [], supplierNames = new Map(), { lines = [], spaceSupplierIds = null } = {}) {
  const fromPlan = new Map()
  const planItems = new Set()
  for (const group of plan?.shoppingGroups || []) {
    for (const item of group?.items || []) {
      planItems.add(normalizeStr(item?.itemName))
      addSupplier(fromPlan, item?.itemName, group.supplierId, group.supplierName, supplierNames)
    }
  }
  const index = new Map(fromPlan)
  const lineMpIds = new Set((lines || []).map(lineMarketPriceId).filter(Boolean))
  const byName = new Map()
  for (const mp of marketPrices || []) {
    const name = normalizeStr(mp?.itemName)
    // La feuille fait foi pour les articles qu'elle achète (même sans fournisseur).
    if (!name || planItems.has(name)) continue
    byName.set(name, [...(byName.get(name) || []), mp])
  }
  for (const candidates of byName.values()) {
    for (const mp of fallbackMarketPrices(candidates, lineMpIds, spaceSupplierIds)) {
      addSupplier(index, mp?.itemName, mp?.supplierId, mp?.supplier, supplierNames)
    }
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
