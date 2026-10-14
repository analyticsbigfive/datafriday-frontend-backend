/**
 * useComparisonRecords : jeux de records du rapport de COMPARAISON, avec la même chaîne
 * que le principal (AnalyseView) : ventes au grain article par event (useAnalyseItemRecords,
 * donc le cache session de l'API est partagé avec le principal : un event déjà chargé n'est
 * pas retéléchargé) -> réconciliation -> prédicat de filtres (PdV, type, zone, article,
 * dimensions article) -> chartRecords / articleRecords. Paniers pour les transactions.
 *
 * Cas Predict : pas de ventes réelles, les records viennent des scénarios Event Predict
 * (predictedRecords), réconciliés puis filtrés comme dans AnalyseView.predictScenarioRecords.
 *
 * Plage horaire intra-event : le grain chargé est « summary » (sans minute), le curseur
 * horaire est donc inerte ici (skipMinute), comme dans le principal quand sa courbe est fermée.
 */
import { computed } from 'vue'
import defaultStore from '@/store'
import { useAnalyseItemRecords } from '@/composables/useAnalyseItemRecords'
import { useTransactionBaskets } from '@/composables/useTransactionBaskets'
import { useReconciliationContext } from '@/composables/useReconciliationContext'
import { buildItemFilterPredicate } from '@/utils/analyseDimensions'
import { reconcileRecord } from '@/utils/analyseReconciliation'
import { buildBasketFilterPredicate } from '@/utils/transactionBaskets'
import { sumShopTransactionRates } from '@/utils/shopPerformanceCompute'
import { resolveKpiSourceState } from '@/utils/analyseRevenueSource'
import { scenarioRecordsToAnalyseRecords } from '@/utils/predictScenarioRecords'

/**
 * @param {Object} p
 * @param {import('vue').Ref<object|null>} p.filters  filtres de la comparaison
 * @param {import('vue').Ref<Array>} p.events  events du rapport (déjà plafonnés ; Predict : events avec scénario)
 * @param {import('vue').Ref<boolean>} p.isPredict
 * @param {import('vue').Ref<Map>} p.scenarioVersions  eventId -> version Event Predict retenue
 * @param {import('vue').Ref<Map|null>} p.dimensionsIndex  index des dimensions article
 * @param {object} [p.store]
 */
export function useComparisonRecords({
  filters, events, isPredict, scenarioVersions, dimensionsIndex, store = defaultStore,
}) {
  const reconciliationCtx = useReconciliationContext()

  // Predict : aucune vente réelle à charger.
  const loadEvents = computed(() => (isPredict.value ? [] : events.value || []))
  const items = useAnalyseItemRecords(loadEvents)
  const baskets = useTransactionBaskets(loadEvents)

  const predicate = computed(() => buildItemFilterPredicate(filters.value || {}, {
    skipMinute: true,
    articleDimensions: dimensionsIndex.value,
  }))

  // ── Réel (mode Analyse) ──
  const itemLevelRecords = computed(() => {
    if (isPredict.value || !filters.value) return []
    const recs = items.itemRecords.value || []
    return recs.length ? recs.filter(predicate.value) : []
  })

  // ── Scénarios (mode Predict) ──
  const scenarioRecords = computed(() => {
    if (!isPredict.value || !filters.value) return []
    const names = new Map()
    for (const el of store.state.analyse?.configShopContext?.floorElements || []) {
      if (el?.id != null && el?.name) names.set(String(el.id), el.name)
    }
    const raw = []
    for (const ev of events.value || []) {
      const version = scenarioVersions.value.get(ev.id)
      if (version) raw.push(...scenarioRecordsToAnalyseRecords(version, ev, { elementNameById: names }))
    }
    return raw.map((r) => reconcileRecord(r, reconciliationCtx.value)).filter(predicate.value)
  })

  // Même jeu pour les graphes et les vues article (en Predict, le scénario porte déjà le grain article).
  const chartRecords = computed(() => (isPredict.value ? scenarioRecords.value : itemLevelRecords.value))
  const articleRecords = chartRecords

  // ── Paniers (transactions, panier moyen, TX/MIN) ──
  const filteredBaskets = computed(() => {
    if (isPredict.value || !filters.value) return []
    const recs = baskets.basketRecords.value || []
    if (!recs.length) return []
    return recs
      .map((r) => reconcileRecord(r, reconciliationCtx.value))
      .filter(buildBasketFilterPredicate(filters.value))
  })

  const basketsState = baskets.sourceState
  const perShopTransactionRateSum = computed(() => (
    isPredict.value || basketsState.value === 'loading' || basketsState.value === 'error'
      ? null
      : sumShopTransactionRates(filteredBaskets.value)
  ))

  const kpiSourceState = computed(() => resolveKpiSourceState({
    isPredict: isPredict.value,
    itemLevelState: items.sourceState.value,
    transactionState: basketsState.value,
  }))

  return {
    itemLevelRecords,
    scenarioRecords,
    chartRecords,
    articleRecords,
    filteredBaskets,
    basketsState,
    perShopTransactionRateSum,
    kpiSourceState,
    itemRecordsState: items.sourceState,
    itemRecordsLoading: items.loading,
    itemRecordsError: items.fetchError,
    loadedEventIds: items.loadedEventIds,
    loadProgress: items.loadProgress,
    clearCache() { items.clearCache(); baskets.clearCache() },
  }
}
