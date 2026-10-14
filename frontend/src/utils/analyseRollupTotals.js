/**
 * analyseRollupTotals : bascule « rollup Event.revenue » de la bande KPI (BUG-146-01),
 * en fonctions pures. Même règle que AnalyseView (intraEventFiltersActive /
 * eventRollupTotals) pour que le rapport de comparaison et le principal appliquent
 * exactement la même condition.
 */
import { hasArticleDimensionFilter } from '@/utils/articleDimensionFilter'

const some = (v) => Array.isArray(v) && v.length > 0

/**
 * true quand un filtre découpe l'INTÉRIEUR des events (PdV, type, zone, article,
 * dimensions article, curseur horaire) : le rollup Event.revenue n'est alors plus valable.
 */
export function hasIntraEventFilters(filters) {
  const f = filters || {}
  const tr = f.selectedTimeRange
  return (
    some(f.selectedShopIds) || some(f.selectedShopTypes) || some(f.selectedShopAreas) ||
    some(f.selectedMenuItemIds) || some(f.selectedMenuItemTypes) || some(f.selectedMenuItemCategories) ||
    hasArticleDimensionFilter(f) ||
    !!(tr && (tr.start || tr.end))
  )
}

/**
 * CA / transactions du rollup des events entiers, ou null quand il ne s'applique pas
 * (Predict, filtre intra-event, aucun event, ou un event sans rollup : mélanger rollup
 * et absence sous-compterait en silence).
 * @returns {{ revenue: number, transactions: number, eventsWithRevenueCount: number }|null}
 */
export function computeEventRollupTotals(events, filters, isPredict = false) {
  if (isPredict || hasIntraEventFilters(filters)) return null
  const evs = events || []
  if (!evs.length) return null
  let revenue = 0
  let transactions = 0
  let eventsWithRevenueCount = 0
  for (const e of evs) {
    const r = e.revenue
    if (r == null || Number.isNaN(Number(r))) return null
    revenue += Number(r)
    transactions += Number(e.transactionCount || 0)
    if (Number(r) > 0) eventsWithRevenueCount++
  }
  return { revenue, transactions, eventsWithRevenueCount }
}
