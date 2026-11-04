// Dérivation PURE du « Résumé Inventaire » (colonne de droite) à partir d'un
// document de réconciliation ouvert (pre ou post-event), et helpers de coût
// partagés avec le résumé de l'inventaire en cours.
//
// Règle maison : jamais un 0 € fabriqué. Un coût absent ou nul donne `null`,
// la ligne affiche « — » et le total l'ignore.
import { buildUnitCostByItemId } from '@/utils/reconciliationCosts'

const round2 = (n) => Math.round(n * 100) / 100
const finite = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const positive = (v) => {
  const n = finite(v)
  return n != null && n > 0 ? n : null
}

/** Valeur monétaire d'une ligne : unités × coût unitaire, ou null si coût absent/nul. */
export function lineCost(units, unitCost) {
  const c = positive(unitCost)
  const u = finite(units)
  if (c == null || u == null || u <= 0) return null
  return round2(u * c)
}

/** Somme des coûts des cartes (les `null` sont ignorés) ; null si aucun coût connu. */
export function sumRowCosts(rows = []) {
  let total = 0
  let any = false
  for (const r of rows || []) {
    const c = positive(r?.costValue)
    if (c == null) continue
    total += c
    any = true
  }
  return any ? round2(total) : null
}

/**
 * itemId → coût unitaire pour les articles des entrées (PdV, stockages, merch),
 * même source que la réconciliation (buildUnitCostByItemId).
 */
export function buildSummaryUnitCosts({ entries = [], menuItemCostMap, marketPrices, components } = {}) {
  const items = []
  for (const entry of entries || []) {
    const list = entry?.consolidatedInventory || entry?.storageInventory || entry?.merchInventory || []
    for (const it of list) if (it?.id != null) items.push(it)
  }
  return buildUnitCostByItemId({ countedItems: items, menuItemCostMap, marketPrices, components })
}

function lineUnits(line) {
  const direct = finite(line?.countedUnits)
  if (direct != null) return direct
  const q = Number(line?.unitsPerPack) > 0 ? Number(line.unitsPerPack) : 1
  const packed = finite(line?.countedPacked)
  const loose = finite(line?.countedLoose)
  if (packed == null && loose == null) return 0
  return round2((packed || 0) * q + (loose || 0))
}

/**
 * @param {object} params
 * @param {{lines?:Array, meta?:object}|null} params.reconciliation
 * @param {Record<string, number>} [params.unitCostByItemId] repli pour les lignes sans coût figé (pre)
 * @returns {{rows:Array, stats:{totalItems:number, countedItems:number}, totalCost:number|null}}
 *   `rows` reprend la forme des lignes de InventoryAggregateView ; `snapshot:true` et
 *   `totalShopCount:null` signalent qu'un document figé ne porte pas le nombre de PdV.
 */
export function buildReconciliationSummary({ reconciliation, unitCostByItemId = {} } = {}) {
  const lines = Array.isArray(reconciliation?.lines) ? reconciliation.lines : []
  const byItem = new Map()
  for (const l of lines) {
    const key = String(l?.itemKey ?? l?.itemName ?? '')
    if (!key) continue
    const units = lineUnits(l)
    const cost = lineCost(units, positive(l?.unitCost) ?? unitCostByItemId?.[key])
    let row = byItem.get(key)
    if (!row) {
      row = {
        itemName: l?.itemName || key,
        itemPicture: null,
        packagingLabel: null,
        unit: l?.unit || null,
        totalUnits: 0,
        costValue: null,
        isCounted: true,
        snapshot: true,
        countedShopCount: null,
        totalShopCount: null,
        shops: [],
      }
      byItem.set(key, row)
    }
    row.totalUnits = round2(row.totalUnits + units)
    if (cost != null) row.costValue = round2((row.costValue || 0) + cost)
    if (!row.unit && l?.unit) row.unit = l.unit
    row.shops.push({ shopName: l?.elementName || '', totalUnits: units })
  }
  const rows = [...byItem.values()].sort(
    (a, b) => b.totalUnits - a.totalUnits || String(a.itemName).localeCompare(String(b.itemName)),
  )

  // Brouillon : la progression figée fait foi ([comptés, total]) ; sinon le document
  // ne décrit que le périmètre compté, donc tout est compté.
  const cp = reconciliation?.meta?.countedProgress
  const hasProgress = Array.isArray(cp) && cp.length === 2 && Number(cp[1]) > 0 && Number.isFinite(Number(cp[0]))
  const totalItems = hasProgress ? Number(cp[1]) : rows.length
  const countedItems = hasProgress ? Math.min(Number(cp[0]), totalItems) : rows.length
  return { rows, stats: { totalItems, countedItems }, totalCost: sumRowCosts(rows) }
}
