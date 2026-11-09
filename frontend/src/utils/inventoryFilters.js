// Filtres du « Résumé Inventaire » (page Inventaire post-événement) : fonctions PURES.
//
// Trois axes qui se CUMULENT (ET) :
//   1. le widget actif (Total articles / Comptés / Articles à compter / PdV à compter) ;
//   2. le PdV cliqué dans la liste de gauche ;
//   3. les articles sélectionnés, qui ne changent QUE le total (coût), jamais la liste.
//
// Une ligne agrégée (une par article) porte `shops[]`, une entrée par PdV :
//   { shopId, shopName, packedUnits, looseUnits, totalUnits, cost, isCounted }
// Filtrer par PdV ou par widget revient à réduire `shops[]` puis à recalculer les
// totaux de la ligne depuis ce qui reste : le coût, la progression et le statut
// « compté » suivent toujours le périmètre filtré.
//
// Les lignes d'un document figé (`snapshot: true`) ne portent pas d'identifiant de
// PdV : elles ne sont jamais filtrées.
import { sumRowCosts } from '@/utils/reconciliationAggregate'

export const WIDGET_TOTAL = 'total'
export const WIDGET_COUNTED = 'counted'
export const WIDGET_TO_COUNT = 'toCount'
export const WIDGET_SHOPS_TO_COUNT = 'shopsToCount'

export const INVENTORY_WIDGETS = Object.freeze([
  WIDGET_TOTAL,
  WIDGET_COUNTED,
  WIDGET_TO_COUNT,
  WIDGET_SHOPS_TO_COUNT,
])

const sameId = (a, b) => a != null && b != null && String(a) === String(b)

/** Widget demandé, ou `total` s'il est inconnu. */
export function normalizeWidget(widget) {
  return INVENTORY_WIDGETS.includes(widget) ? widget : WIDGET_TOTAL
}

/**
 * Nouveau widget après un clic : le widget déjà actif se désactive (retour à
 * « Total articles »), « Total articles » reste « Total articles ».
 */
export function nextWidget(current, clicked) {
  const target = normalizeWidget(clicked)
  if (target === WIDGET_TOTAL) return WIDGET_TOTAL
  return normalizeWidget(current) === target ? WIDGET_TOTAL : target
}

/** Nouveau PdV sélectionné après un clic : un reclic le désélectionne. */
export function nextShopId(current, clicked) {
  if (clicked == null || sameId(current, clicked)) return null
  return clicked
}

/** Nouvelle sélection d'articles (noms) après un clic : bascule, sans doublon. */
export function toggleName(selected, name) {
  const list = Array.isArray(selected) ? selected : []
  if (name == null || name === '') return list.slice()
  return list.includes(name) ? list.filter((n) => n !== name) : [...list, name]
}

const round2 = (n) => Math.round(n * 100) / 100

/** Reconstruit une ligne agrégée depuis la liste de PdV qui lui reste. */
function rebuildRow(row, shops) {
  let packed = 0
  let loose = 0
  let units = 0
  let cost = null
  let counted = 0
  for (const s of shops) {
    packed += Number(s.packedUnits || 0)
    loose += Number(s.looseUnits || 0)
    units += Number(s.totalUnits || 0)
    if (s.cost != null && Number(s.cost) > 0) cost = (cost || 0) + Number(s.cost)
    if (s.isCounted) counted += 1
  }
  return {
    ...row,
    shops,
    totalPackedUnits: packed,
    totalLooseUnits: loose,
    totalUnits: units,
    costValue: cost == null ? null : round2(cost),
    countedShopCount: counted,
    totalShopCount: shops.length,
    shopCount: shops.length,
    isCounted: shops.length > 0 && counted >= shops.length,
  }
}

/** Les lignes portent-elles des identifiants de PdV (donc filtrables) ? */
function isFilterable(rows) {
  return Array.isArray(rows) && rows.every((r) => !r.snapshot)
}

/**
 * Ids des PdV dont le comptage n'est pas terminé : au moins un article non compté.
 * À calculer sur les lignes NON filtrées par PdV (l'état d'un PdV ne dépend pas
 * du filtre en cours).
 */
export function incompleteShopIds(rows) {
  const ids = new Set()
  for (const row of rows || []) {
    for (const s of row.shops || []) {
      if (s.shopId != null && !s.isCounted) ids.add(String(s.shopId))
    }
  }
  return ids
}

/** Nombre de PdV dont le comptage n'est pas terminé dans ces lignes. */
export function countIncompleteShops(rows) {
  return incompleteShopIds(rows).size
}

/**
 * Restreint les lignes à un PdV (ses articles seulement, totaux recalculés).
 * `shopId` null = aucun filtre. Un PdV absent des lignes donne une liste vide.
 */
export function scopeRowsToShop(rows, shopId) {
  if (shopId == null || !isFilterable(rows)) return rows
  const out = []
  for (const row of rows) {
    const shops = (row.shops || []).filter((s) => sameId(s.shopId, shopId))
    if (shops.length) out.push(rebuildRow(row, shops))
  }
  return out
}

/**
 * Applique le widget. `incompleteIds` (Set d'ids) n'est utilisé que par
 * « PdV à compter » : on garde les PdV non terminés et, dedans, les articles
 * restant à compter.
 */
export function applyWidget(rows, widget, incompleteIds = new Set()) {
  const w = normalizeWidget(widget)
  if (w === WIDGET_TOTAL || !isFilterable(rows)) return rows
  if (w === WIDGET_COUNTED) return rows.filter((r) => r.isCounted)
  if (w === WIDGET_TO_COUNT) return rows.filter((r) => !r.isCounted)
  const out = []
  for (const row of rows) {
    const shops = (row.shops || []).filter(
      (s) => !s.isCounted && incompleteIds.has(String(s.shopId)),
    )
    if (shops.length) out.push(rebuildRow(row, shops))
  }
  return out
}

/**
 * Pipeline complet : PdV puis widget. Renvoie aussi les lignes limitées au PdV
 * (avant widget), qui alimentent les chiffres des 4 widgets, et l'ensemble des
 * PdV non terminés (calculé sur toutes les lignes).
 */
export function filterInventoryRows(rows, { widget = WIDGET_TOTAL, shopId = null } = {}) {
  const all = rows || []
  const incomplete = incompleteShopIds(all)
  const scoped = scopeRowsToShop(all, shopId)
  return { scoped, visible: applyWidget(scoped, widget, incomplete), incomplete }
}

/** Chiffres des 4 widgets pour un périmètre (lignes limitées au PdV, sans widget). */
export function widgetCounts(scopedRows) {
  const rows = scopedRows || []
  const counted = rows.filter((r) => r.isCounted).length
  return {
    total: rows.length,
    counted,
    toCount: rows.length - counted,
    shopsToCount: countIncompleteShops(rows),
  }
}

/** Noms sélectionnés qui existent encore dans la liste affichée. */
export function effectiveSelection(rows, selectedNames) {
  const names = Array.isArray(selectedNames) ? selectedNames : []
  if (!names.length) return []
  const present = new Set((rows || []).map((r) => r.itemName))
  return names.filter((n) => present.has(n))
}

/**
 * Coût total du résumé : articles sélectionnés seulement, ou tous ceux de la liste
 * affichée si aucune sélection. Null si aucun coût connu (jamais un 0 € inventé).
 */
export function selectionTotalCost(rows, selectedNames) {
  const selected = effectiveSelection(rows, selectedNames)
  if (!selected.length) return sumRowCosts(rows)
  return sumRowCosts((rows || []).filter((r) => selected.includes(r.itemName)))
}

/**
 * Un PdV de la liste de gauche passe-t-il le widget ? Seul « PdV à compter » masque
 * des PdV (ceux dont le comptage est terminé) ; les autres widgets les montrent tous.
 * @param {string} status statut de comptage du PdV (utils/inventoryCountingStatus)
 */
export function shopPassesWidget(status, widget) {
  if (normalizeWidget(widget) !== WIDGET_SHOPS_TO_COUNT) return true
  return status !== 'counted'
}
