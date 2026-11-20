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
 *
 * Mode Forecast (`input.kind === 'forecast'` + `forecastSource`) : le comparé est le principal
 * passé par les modifications what-if (useComparisonForecast). Mêmes events que le principal,
 * aucun chargement (ventes, paniers, timeline, scénarios), pas de plafond d'events.
 */
import { computed, unref } from 'vue'
import defaultStore from '@/store'
import { ITEM_LEVEL_EVENT_CAP } from '@/composables/useAnalyseItemRecords'
import { useArticleDimensions } from '@/composables/useArticleDimensions'
import { useComparisonEvents } from '@/composables/useComparisonEvents'
import { useComparisonForecast } from '@/composables/useComparisonForecast'
import { useComparisonPredictScenarios } from '@/composables/useComparisonPredictScenarios'
import { pickPredictTimeline } from '@/utils/comparisonPredictTimeline'
import { useComparisonRecords } from '@/composables/useComparisonRecords'
import { useComparisonKpis } from '@/composables/useComparisonKpis'
import { useComparisonTimeline } from '@/composables/useComparisonTimeline'
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
 * @param {{ chartRecords: import('vue').Ref<Array>, articleRecords: import('vue').Ref<Array>,
 *   catalogById?: import('vue').Ref<Map|null>, isPredict?: import('vue').Ref<boolean>,
 *   loading?: import('vue').Ref<boolean> }|null} [p.forecastSource]  records du principal pour une
 *   comparaison `{ kind: 'forecast', modifications }` ; null (défaut) = Forecast non supporté, comportement inchangé
 * @param {object} [p.store]
 */
export function useComparisonReport({
  input, mainFilters, spaceId, canView, translate,
  mainEvents = null, mainSnapshot = null, defaultTimeRange = null, articleDimensions = null,
  forecastSource = null, store = defaultStore,
}) {
  const dims = articleDimensions || useArticleDimensions({ spaceId, enabled: canView })

  // Forecast : inerte sans source du principal (la saisie `kind: 'forecast'` est alors ignorée).
  const forecast = useComparisonForecast({
    input: computed(() => (forecastSource ? input.value : null)),
    source: forecastSource || {},
    spaceId,
    translate,
  })

  const scope = useComparisonEvents({ input, mainFilters, mainEvents, translate, defaultTimeRange, forecast, store })
  const { filters, matchedEvents } = scope
  // Predict au sens du chargement (scénarios, progression, statut) : jamais en Forecast.
  const predictScope = scope.isPredict
  // Masque Predict des KPI, du snapshot et de l'affichage : en Forecast, celui du principal.
  const isPredict = computed(() => (forecast.active.value ? forecast.isPredict.value : predictScope.value))

  // Plafond de chargement : au-delà, les events suivants ne sont ni chargés ni comptés (dit à l'écran).
  // Forecast : aucun chargement, donc pas de plafond.
  const candidates = computed(() => (
    forecast.active.value ? matchedEvents.value : matchedEvents.value.slice(0, ITEM_LEVEL_EVENT_CAP)
  ))

  // Predict : seuls les events qui ont un scénario exploitable entrent dans le rapport.
  const scenarios = useComparisonPredictScenarios({ events: candidates, enabled: predictScope })
  const events = computed(() => (predictScope.value ? scenarios.covered.value : candidates.value))
  const excludedEvents = computed(() => (predictScope.value ? scenarios.excluded.value : []))

  const truncation = computed(() => ({
    truncated: !forecast.active.value && matchedEvents.value.length > ITEM_LEVEL_EVENT_CAP,
    total: matchedEvents.value.length,
    kept: candidates.value.length,
    cap: ITEM_LEVEL_EVENT_CAP,
  }))

  const records = useComparisonRecords({
    filters,
    events,
    isPredict: predictScope,
    scenarioVersions: scenarios.versionByEventId,
    dimensionsIndex: dims.index,
    predictBasis: computed(() => input.value?.predictBasis || 'adjusted'),
    forecast,
    store,
  })

  // Courbe minute par minute (event unique, ou moyenne de plusieurs events), jamais en Predict
  // ni en Forecast (le grain minute n'est pas modifiable par les what-if).
  const timeline = useComparisonTimeline({
    events,
    enabled: computed(() => !predictScope.value && !forecast.active.value && !!unref(canView)),
    spaceId,
    reconcile: records.reconcileForTimeline,
    predicate: records.predicate,
    store,
  })

  // Predict, un seul event : courbe prédite par minute à la place des barres (null = barres).
  const predictTimeline = computed(() => pickPredictTimeline({
    isPredict: predictScope.value,
    events: events.value,
    versionByEventId: scenarios.versionByEventId.value,
    basis: input.value?.predictBasis,
  }))

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
    forecast,
    store,
  })

  // ── Progression « x/N » et état ──
  const progress = computed(() => {
    if (forecast.active.value) return { loaded: candidates.value.length, total: candidates.value.length }
    if (!predictScope.value) return records.loadProgress.value
    const seen = scenarios.versionByEventId.value
    return { loaded: candidates.value.filter((e) => seen.has(e.id)).length, total: candidates.value.length }
  })

  /** 'idle' | 'loading' | 'ready' | 'empty' | 'error' */
  const status = computed(() => {
    if (!input.value) return 'idle'
    if (forecast.active.value) {
      const src = forecast.sourceState.value
      if (src === 'loading') return 'loading'
      return src === 'ready' ? 'ready' : 'empty'
    }
    if (predictScope.value) {
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
  // Forecast : les records du principal gardent leur plage horaire, rien n'est ignoré.
  const intraEventRangeIgnored = computed(() => (
    !forecast.active.value && hasActiveRange(mainFilters.value?.selectedTimeRange)
  ))

  return {
    // état
    status,
    progress,
    error,
    // périmètre
    filters,
    appliedFilters: computed(() => (forecast.active.value ? forecast.lines.value : scope.appliedFilters.value)),
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
    timeline,
    predictTimeline,
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
    // Forecast : effets de prix à signaler (neutres hors Forecast)
    forecastStats: forecast.stats,
    clearCache: records.clearCache,
  }
}
