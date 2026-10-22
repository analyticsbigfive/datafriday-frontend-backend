/**
 * useComparisonKpis : métriques, puces, widgets et totaux du rapport de COMPARAISON,
 * calculés avec les mêmes composables et les mêmes règles que le principal :
 * useMetricsCalculator (8 puces + marge + TX/MIN), useRendementWidgets (CA/TPE, CA/COLLAB,
 * VALO STOCK : events sans effectif exclus, « — » avec filtre PdV/type/zone) et
 * computeItemTotals. Predict : transactions, panier, transformation, TX/MIN et VALO STOCK = null.
 */
import { computed, ref } from 'vue'
import defaultStore from '@/store'
import { useMetricsCalculator } from '@/composables/useMetricsCalculator'
import { useRendementWidgets } from '@/composables/useRendementWidgets'
import { computeEventRollupTotals } from '@/utils/analyseRollupTotals'
import { computeItemTotals } from '@/utils/analyseVariations'
import { chipsFromMetrics, widgetsFromMetrics } from '@/utils/comparisonReportSnapshot'

/**
 * @param {Object} p
 * @param {import('vue').Ref<object|null>} p.filters
 * @param {import('vue').Ref<Array>} p.events
 * @param {import('vue').Ref<boolean>} p.isPredict
 * @param {import('vue').Ref<Array>} p.kpiRecords  records de CA (chartRecords)
 * @param {import('vue').Ref<Array>} p.filteredBaskets
 * @param {import('vue').Ref<string>} p.basketsState
 * @param {import('vue').Ref<number|null>} p.perShopTransactionRateSum
 * @param {import('vue').Ref<string>} p.kpiSourceState
 * @param {import('vue').Ref<Set<string>>} p.loadedEventIds
 * @param {import('vue').Ref<string|null>} p.spaceId
 * @param {import('vue').Ref<boolean>} p.canView  permission stats.financial.view
 * @param {object} [p.store]
 */
export function useComparisonKpis({
  filters, events, isPredict, kpiRecords, filteredBaskets, basketsState, perShopTransactionRateSum,
  kpiSourceState, loadedEventIds, spaceId, canView, store = defaultStore,
}) {
  const filtersOrEmpty = computed(() => filters.value || {})
  const menuItemCostMap = computed(() => store.state.analyse?.menuItemCostMap || {})
  const menuItemCostByEvent = computed(() => store.state.analyse?.menuItemCostByEvent || null)

  const eventRollupTotals = computed(() => (
    filters.value ? computeEventRollupTotals(events.value, filters.value, isPredict.value) : null
  ))

  const metrics = useMetricsCalculator({
    filteredShopGranularData: kpiRecords,
    chartFilteredEvents: events,
    menuItemCostMap,
    menuItemCostByEvent,
    eventRollupTotals,
    isTimelineFilterActive: ref(false),
    operatingMinutes: computed(() => (events.value || []).reduce((s, e) => s + (e.durationMinutes || 180), 0)),
    selectedEventIds: computed(() => filtersOrEmpty.value.selectedEventIds || []),
    // Mêmes garde-fous que le principal : null tant que les paniers ne sont pas terminaux (BUG-386-02).
    transactionRecords: computed(() => (
      isPredict.value || basketsState.value === 'loading' || basketsState.value === 'error'
        ? null
        : filteredBaskets.value
    )),
    perShopTransactionRate: perShopTransactionRateSum,
    transactionRateUnavailable: computed(() => !isPredict.value && basketsState.value === 'error'),
  })

  const rendement = useRendementWidgets({
    spaceId,
    // Pas de requête de stock tant qu'aucune comparaison n'est saisie.
    canView: computed(() => canView.value && !!filters.value),
    filters: filtersOrEmpty,
    filteredEvents: events,
    kpiRecords,
    eventRollupTotals,
    sourceState: kpiSourceState,
    stockReportOpen: ref(false),
    stockApplicable: computed(() => !isPredict.value),
  })

  const chips = computed(() => chipsFromMetrics(metrics, { isPredict: isPredict.value }))
  const widgets = computed(() => widgetsFromMetrics(metrics, rendement.raw, { isPredict: isPredict.value }))

  // Totaux au grain article (computeItemTotals), sur les events réellement chargés.
  const totals = computed(() => {
    const evs = events.value || []
    const loaded = isPredict.value ? null : loadedEventIds.value
    const ids = new Set(evs.filter((e) => !loaded || loaded.has(e.id)).map((e) => e.id))
    return computeItemTotals(kpiRecords.value || [], evs, ids, menuItemCostMap.value, menuItemCostByEvent.value)
  })

  return { metrics, rendement, chips, widgets, totals, eventRollupTotals, menuItemCostMap }
}
