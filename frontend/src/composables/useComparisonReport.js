/**
 * useComparisonReport : calcule un SECOND rapport Analyse (drawer Comparaison) avec
 * d'autres filtres que le principal, sans jamais écrire dans le store du principal.
 *
 * Enchaînement : saisie + filtres du principal -> useComparisonEvents (filtres, events,
 * sameAsMain) -> plafond ITEM_LEVEL_EVENT_CAP (ou scénarios Predict) -> useComparisonRecords
 * (ventes par event, paniers, réconciliation, filtres) -> useComparisonKpis (puces, widgets,
 * totaux) -> snapshot normalisé -> écarts avec le principal si son snapshot est fourni.
 *
 * Les composants du principal (cartes, répartitions, tableau, graphe) se branchent sur
 * `chartRecords`, `articleRecords` et `events` ; les composants doivent alors fonctionner en
 * « données reçues en paramètres » (lecture seule, lot 5).
 */
import { computed, unref } from 'vue'
import defaultStore from '@/store'
import { ITEM_LEVEL_EVENT_CAP } from '@/composables/useAnalyseItemRecords'
import { useArticleDimensions } from '@/composables/useArticleDimensions'
import { useComparisonEvents } from '@/composables/useComparisonEvents'
import { useComparisonPredictScenarios } from '@/composables/useComparisonPredictScenarios'
import { useComparisonRecords } from '@/composables/useComparisonRecords'
import { useComparisonKpis } from '@/composables/useComparisonKpis'
import { buildReportSnapshot } from '@/utils/comparisonReportSnapshot'
import { computeReportDeltas } from '@/utils/comparisonDeltas'
import { buildEventRevenueSeries } from '@/utils/comparisonEventSeries'
import { hasActiveRange } from '@/utils/timelineBucketing'

/**
 * @param {Object} p
 * @param {import('vue').Ref<object|null>} p.input  saisie : { kind: 'period'|'category'|'event'|'predict',
 *   period, from, to, eventTypes, categories, subcategories, eventIds, selectedDaysOfWeek,
 *   selectedDoorsOpenings, selectedShowTimes, selectedWeather, temperatureRange }. null = idle.
 * @param {import('vue').Ref<object>} p.mainFilters  state.filters du principal (lecture seule)
 * @param {import('vue').Ref<string|null>} p.spaceId
 * @param {import('vue').Ref<boolean>} p.canView  permission stats.financial.view
 * @param {(key: string) => string} p.translate
 * @param {import('vue').Ref<Array>} [p.mainEvents]  events filtrés du principal (défaut : getter analyse/filteredEvents)
 * @param {import('vue').Ref<object|null>} [p.mainSnapshot]  snapshot du principal (useMainReportSnapshot)
 * @param {string|null} [p.defaultTimeRange]  période par défaut (cf. getDefaultTimeRange du store)
 * @param {{ index: import('vue').Ref<Map|null>, status: import('vue').Ref<string> }} [p.articleDimensions]
 * @param {object} [p.store]
 */
export function useComparisonReport({
  input, mainFilters, spaceId, canView, translate,
  mainEvents = null, mainSnapshot = null, defaultTimeRange = null, articleDimensions = null,
  store = defaultStore,
}) {
  const dims = articleDimensions || useArticleDimensions({ spaceId, enabled: canView })

  const scope = useComparisonEvents({ input, mainFilters, mainEvents, translate, defaultTimeRange, store })
  const { isPredict, filters, matchedEvents } = scope

  // Plafond de chargement : au-delà, les events suivants ne sont ni chargés ni comptés (dit à l'écran).
  const candidates = computed(() => matchedEvents.value.slice(0, ITEM_LEVEL_EVENT_CAP))

  // Predict : seuls les events qui ont un scénario exploitable entrent dans le rapport.
  const scenarios = useComparisonPredictScenarios({ events: candidates, enabled: isPredict })
  const events = computed(() => (isPredict.value ? scenarios.covered.value : candidates.value))
  const excludedEvents = computed(() => (isPredict.value ? scenarios.excluded.value : []))

  const truncation = computed(() => ({
    truncated: matchedEvents.value.length > ITEM_LEVEL_EVENT_CAP,
    total: matchedEvents.value.length,
    kept: candidates.value.length,
    cap: ITEM_LEVEL_EVENT_CAP,
  }))

  const records = useComparisonRecords({
    filters,
    events,
    isPredict,
    scenarioVersions: scenarios.versionByEventId,
    dimensionsIndex: dims.index,
    store,
  })

  const kpis = useComparisonKpis({
    filters,
    events,
    isPredict,
    kpiRecords: records.chartRecords,
    filteredBaskets: records.filteredBaskets,
    basketsState: records.basketsState,
    perShopTransactionRateSum: records.perShopTransactionRateSum,
    kpiSourceState: records.kpiSourceState,
    loadedEventIds: records.loadedEventIds,
    spaceId,
    canView,
    store,
  })

  // ── Progression « x/N » et état ──
  const progress = computed(() => {
    if (!isPredict.value) return records.loadProgress.value
    const seen = scenarios.versionByEventId.value
    return { loaded: candidates.value.filter((e) => seen.has(e.id)).length, total: candidates.value.length }
  })

  /** 'idle' | 'loading' | 'ready' | 'empty' | 'error' */
  const status = computed(() => {
    if (!input.value) return 'idle'
    if (isPredict.value) {
      if (scenarios.status.value === 'loading') return 'loading'
      if (!events.value.length || !records.chartRecords.value.length) return 'empty'
      return 'ready'
    }
    if (!matchedEvents.value.length) return 'empty'
    const src = records.kpiSourceState.value
    if (src === 'loading') return 'loading'
    if (src === 'empty') return records.itemRecordsError.value ? 'error' : 'empty'
    return 'ready'
  })

  const error = computed(() => (status.value === 'error' ? records.itemRecordsError.value : null))

  // ── Snapshot et écarts ──
  const snapshot = computed(() => {
    if (status.value !== 'ready') return null
    return buildReportSnapshot({
      isPredict: isPredict.value,
      eventCount: events.value.length,
      chips: kpis.chips.value,
      widgets: kpis.widgets.value,
      chartRecords: records.chartRecords.value,
      articleRecords: records.articleRecords.value,
      dimensionsIndex: dims.index.value,
    })
  })

  const main = () => unref(mainSnapshot) || null
  // Mêmes events que le principal : pas d'écart (jamais de faux 0 %), le message d'avertissement le dit.
  const comparable = () => !scope.sameAsMain.value
  /** Écart du rapport de comparaison par rapport au principal (affiché dans le drawer). */
  const deltasVsMain = computed(() => (
    snapshot.value && main() && comparable() ? computeReportDeltas(snapshot.value, main()) : null
  ))
  /** Écart réciproque du principal par rapport à la comparaison (affiché dans le principal). */
  const mainDeltasVsComparison = computed(() => (
    snapshot.value && main() && comparable() ? computeReportDeltas(main(), snapshot.value) : null
  ))

  /** CA par event dans l'ordre chronologique (ligne de tendance par rang, décision 5). */
  const eventRevenueSeries = computed(() => buildEventRevenueSeries(records.chartRecords.value, events.value))

  /** true si le principal a une plage horaire intra-event, que la comparaison ne peut pas reprendre (grain sans minute). */
  const intraEventRangeIgnored = computed(() => hasActiveRange(mainFilters.value?.selectedTimeRange))

  return {
    // état
    status,
    progress,
    error,
    // périmètre
    filters,
    appliedFilters: scope.appliedFilters,
    events,
    truncation,
    excludedEvents,
    sameAsMain: scope.sameAsMain,
    isPredict,
    intraEventRangeIgnored,
    // jeux de données (mêmes que ceux du principal pour ses composants)
    itemLevelRecords: records.itemLevelRecords,
    chartRecords: records.chartRecords,
    articleRecords: records.articleRecords,
    filteredBaskets: records.filteredBaskets,
    kpiSourceState: records.kpiSourceState,
    eventRevenueSeries,
    // métriques
    metrics: kpis.metrics,
    totals: kpis.totals,
    chips: kpis.chips,
    widgets: kpis.widgets,
    rendementCards: kpis.rendement.cards,
    rendementRaw: kpis.rendement.raw,
    // dimensions article
    dimensionsIndex: dims.index,
    dimensionsStatus: dims.status,
    // snapshot et écarts
    snapshot,
    deltasVsMain,
    mainDeltasVsComparison,
    clearCache: records.clearCache,
  }
}
