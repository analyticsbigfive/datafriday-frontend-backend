/**
 * useComparisonKpis : métriques, puces, widgets et totaux du rapport de COMPARAISON,
 * calculés avec les mêmes composables et les mêmes règles que le principal :
 * useMetricsCalculator (8 puces + marge + TX/MIN), useRendementWidgets (CA/TPE, CA/COLLAB,
 * VALO STOCK : events sans effectif exclus, « — » avec filtre PdV/type/zone) et
 * computeItemTotals. Predict : TX/MIN et VALO STOCK = null ; transactions, panier, transformation = null
 * sauf en Forecast (records portant des transactions estimées).
 */
import { computed, ref } from 'vue'
import defaultStore from '@/store'
import { useMetricsCalculator } from '@/composables/useMetricsCalculator'
import { useRendementWidgets } from '@/composables/useRendementWidgets'
import { usePredictCostEstimator } from '@/composables/usePredictCostEstimator'
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
 * @param {{ active: import('vue').Ref<boolean> }|null} [p.forecast]  comparaison Forecast : CA et transactions
 *   viennent des records modifiés (ni rollup Event.revenue, ni paniers, ni filtre « events chargés »)
 * @param {object} [p.store]
 */
export function useComparisonKpis({
  filters, events, isPredict, kpiRecords, filteredBaskets, basketsState, perShopTransactionRateSum,
  kpiSourceState, loadedEventIds, spaceId, canView, forecast = null, store = defaultStore,
}) {
  const isForecast = computed(() => !!forecast && !!forecast.active.value)
  const filtersOrEmpty = computed(() => filters.value || {})
  const menuItemCostMap = computed(() => store.state.analyse?.menuItemCostMap || {})
  const menuItemCostByEvent = computed(() => store.state.analyse?.menuItemCostByEvent || null)

  const eventRollupTotals = computed(() => (
    filters.value && !isForecast.value
      ? computeEventRollupTotals(events.value, filters.value, isPredict.value)
      : null
  ))

  // Forecast : les records sont au grain PdV, sans coût. Coût estimé par pièce du PdV depuis les
  // records article NON modifiés du principal, multiplié par la quantité modifiée (même méthode que le principal).
  const costEstimator = usePredictCostEstimator({
    enabled: isForecast,
    articleRecords: computed(() => forecast?.baseArticleRecords?.value || []),
    menuItemCostMap,
    menuItemCostByEvent,
  })

  const metrics = useMetricsCalculator({
    costEstimator,
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
      isPredict.value || isForecast.value || basketsState.value === 'loading' || basketsState.value === 'error'
        ? null
        : filteredBaskets.value
    )),
    perShopTransactionRate: perShopTransactionRateSum,
    transactionRateUnavailable: computed(() => !isPredict.value && !isForecast.value && basketsState.value === 'error'),
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

  // Forecast : mêmes records que le principal (transactions estimées) donc mêmes puces calculées.
  // Predict scénarios : aucun ticket dans les records, ces trois puces restent null.
  const chips = computed(() => chipsFromMetrics(metrics, { isPredict: isPredict.value, predictTransactions: isForecast.value }))
  const widgets = computed(() => widgetsFromMetrics(metrics, rendement.raw, { isPredict: isPredict.value }))

  // Totaux au grain article (computeItemTotals), sur les events réellement chargés.
  const totals = computed(() => {
    const evs = events.value || []
    const loaded = isPredict.value || isForecast.value ? null : loadedEventIds.value
    const ids = new Set(evs.filter((e) => !loaded || loaded.has(e.id)).map((e) => e.id))
    return computeItemTotals(kpiRecords.value || [], evs, ids, menuItemCostMap.value, menuItemCostByEvent.value)
  })

  return { metrics, rendement, chips, widgets, totals, eventRollupTotals, menuItemCostMap }
}
