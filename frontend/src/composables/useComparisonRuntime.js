/**
 * useComparisonRuntime : exécuteur du drawer Comparaison. Relie le modèle appliqué
 * (useComparisonDrawer.applied) au moteur (useComparisonReport) et à la session partagée
 * (useComparisonSession), sans aucune logique d'affichage.
 *
 * - Aucun calcul ni appel réseau tant que le drawer n'est pas ouvert ET qu'un modèle n'est pas
 *   appliqué : le moteur reçoit `input = null` (idle) et `canView = false` dans ce cas.
 * - Les filtres et events du principal sont lus en lecture seule et RECOPIÉS avec un debounce
 *   (400 ms par défaut) : tant que le rapport est affiché, une modification du principal
 *   recalcule la comparaison au bout du délai. Le moteur réutilise les ventes déjà chargées ;
 *   `refreshing` n'est vrai que si de nouveaux events sont à charger (voile de chargement).
 * - Écarts dans les DEUX sens (computeReportDeltas) : `deltasVsMain` (drawer par rapport au
 *   principal) et `mainDeltasVsComparison` (principal par rapport au drawer, posé dans la session).
 *   Ils sont conservés pendant un recalcul pour ne pas clignoter.
 * - La session est vidée à la fermeture, en vue 'form' (« Modifier les critères »), en chargement
 *   initial, rapport vide, erreur, mêmes events que le principal : le principal retrouve alors
 *   ses écarts Précédent / N-1.
 * - Aucun stockage navigateur.
 */
import { computed, ref, shallowRef, watch, watchEffect, onScopeDispose, getCurrentScope, toRaw, unref } from 'vue'
import defaultStore from '@/store'
import { useComparisonReport } from '@/composables/useComparisonReport'
import { setMainDeltas, clearComparisonSession } from '@/composables/useComparisonSession'
import { computeReportDeltas } from '@/utils/comparisonDeltas'
import { buildEventRevenueSeries } from '@/utils/comparisonEventSeries'
import { trendFromEventSeries } from '@/utils/comparisonTrend'

export const COMPARISON_DEBOUNCE_MS = 400

// Vue du drawer à afficher pour chaque état du rapport ('empty' = vue 'ready' avec message vide).
const VIEW_BY_STATE = { loading: 'loading', ready: 'ready', empty: 'ready', error: 'error' }

/** Copie JSON profonde et détachée de la réactivité (les filtres du store sont de purs JSON). */
function detach(value) {
  if (value == null) return value
  return JSON.parse(JSON.stringify(toRaw(value)))
}

/** Écarts des 5 widgets dans la forme de la prop `deltas` de FinancialMetricsGrid. */
export function widgetDeltasFrom(deltas) {
  const w = deltas?.widgets
  if (!w) return null
  return {
    tpe: w.revenuePerTpe || null,
    collaborator: w.revenuePerCollaborator || null,
    margin: w.margin || null,
    transactionRate: w.transactionRate || null,
    stock: w.stockValue || null,
  }
}

/**
 * @param {Object} p
 * @param {{ open: Ref<boolean>, applied: Ref<object|null>, view: Ref<string>, setView: Function }} p.comparison
 *   retour de useComparisonDrawer
 * @param {Ref<object>} p.mainFilters  state.filters du principal (lecture seule)
 * @param {Ref<Array>} [p.mainEvents]  events filtrés du principal (défaut : getter analyse/filteredEvents)
 * @param {Ref<object|null>} p.mainSnapshot  retour de useMainReportSnapshot
 * @param {Ref<Array>} [p.mainChartRecords]  chartRecords du principal (série de tendance)
 * @param {Ref<string|null>} p.spaceId
 * @param {Ref<boolean>} p.canView  permission stats.financial.view
 * @param {(key: string) => string} p.translate
 * @param {string|null} [p.defaultTimeRange]
 * @param {number} [p.debounceMs]
 * @param {Function} [p.createReport]  fabrique du moteur (défaut useComparisonReport, injectable pour les tests)
 * @param {object} [p.store]
 */
export function useComparisonRuntime({
  comparison, mainFilters, mainEvents = null, mainSnapshot, mainChartRecords = null,
  spaceId, canView, translate, defaultTimeRange = null,
  debounceMs = COMPARISON_DEBOUNCE_MS, createReport = useComparisonReport, store = defaultStore,
}) {
  // ── Activation : drawer ouvert ET modèle appliqué ──
  const active = computed(() => !!comparison.open.value && !!comparison.applied.value)

  // ── Copies debouncées du principal ──
  const liveMainEvents = computed(() => (
    mainEvents ? unref(mainEvents) || [] : store.getters['analyse/filteredEvents'] || []
  ))
  const signature = () => JSON.stringify(unref(mainFilters) || {})
  const stableFilters = shallowRef(detach(unref(mainFilters)) || {})
  let syncedSignature = signature()
  const stableEvents = shallowRef(liveMainEvents.value)
  // true entre une modification du principal et la fin du délai.
  const pending = ref(false)
  let timer = null

  function clearTimer() {
    if (timer) clearTimeout(timer)
    timer = null
  }
  function syncMain() {
    clearTimer()
    stableFilters.value = detach(unref(mainFilters)) || {}
    syncedSignature = signature()
    stableEvents.value = liveMainEvents.value
    pending.value = false
  }
  function scheduleSync() {
    pending.value = true
    clearTimer()
    timer = setTimeout(syncMain, debounceMs)
  }

  // Les copies suivent le principal dès l'activation (sans délai), puis avec debounce.
  watch(active, (on) => { if (on) syncMain(); else { clearTimer(); pending.value = false } }, { flush: 'sync' })
  // Signature nulle tant que inactif : aucun parcours des filtres du principal drawer fermé.
  watch(
    () => (active.value ? signature() : null),
    (sig) => { if (sig !== null && sig !== syncedSignature) scheduleSync() },
  )
  watch(
    () => (active.value ? liveMainEvents.value : null),
    (e) => { if (e && e !== stableEvents.value) scheduleSync() },
  )

  // ── Moteur ──
  const input = computed(() => (active.value ? comparison.applied.value : null))
  const engineCanView = computed(() => active.value && !!unref(canView))
  const report = createReport({
    input,
    mainFilters: stableFilters,
    mainEvents: stableEvents,
    spaceId,
    canView: engineCanView,
    translate,
    defaultTimeRange,
    store,
  })

  // ── État ──
  // true dès qu'un rapport complet a été montré pour le modèle appliqué courant : un recalcul
  // ultérieur garde alors le rapport visible sous un voile au lieu de revenir aux squelettes.
  const readyFor = shallowRef(null)
  watchEffect(() => {
    if (active.value && report.status.value === 'ready') readyFor.value = comparison.applied.value
  })
  const hasShownReport = computed(() => !!readyFor.value && readyFor.value === comparison.applied.value)

  const state = computed(() => {
    if (!active.value) return 'idle'
    const s = report.status.value
    if (s === 'loading' && hasShownReport.value) return 'ready'
    return s === 'idle' ? 'loading' : s
  })
  const refreshing = computed(() => (
    active.value && report.status.value === 'loading' && hasShownReport.value
  ))

  // ── Écarts dans les deux sens ──
  const live = computed(() => {
    if (!active.value || pending.value) return null
    const snap = report.snapshot?.value
    const main = unref(mainSnapshot)
    if (!snap || !main || report.sameAsMain.value) return null
    return { vsMain: computeReportDeltas(snap, main), mainVs: computeReportDeltas(main, snap) }
  })
  const held = shallowRef(null)
  watchEffect(() => {
    if (!active.value) { held.value = null; return }
    if (pending.value) return
    const l = live.value
    // Pendant un recalcul, on garde les derniers écarts connus.
    if (l || !refreshing.value) held.value = l
  })
  const deltasVsMain = computed(() => held.value?.vsMain || null)
  const mainDeltasVsComparison = computed(() => held.value?.mainVs || null)
  const widgetDeltas = computed(() => widgetDeltasFrom(deltasVsMain.value))

  // ── Vue du drawer ──
  function syncView() {
    if (!active.value) return
    const view = comparison.view.value
    if (view === 'form') return
    const target = VIEW_BY_STATE[state.value]
    if (target && view !== target) comparison.setView(target)
  }
  watch([state, () => comparison.view.value, () => comparison.applied.value], syncView, { immediate: true, flush: 'sync' })

  // ── Session partagée (écarts du principal) ──
  function syncSession() {
    const showing = active.value && comparison.view.value !== 'form' && state.value === 'ready'
    if (showing && mainDeltasVsComparison.value) setMainDeltas(mainDeltasVsComparison.value)
    else clearComparisonSession()
  }
  watch(
    [active, state, mainDeltasVsComparison, () => comparison.view.value],
    syncSession,
    { immediate: true, flush: 'sync' },
  )

  // ── Tendance du principal (graphe CA par shop), par rang ──
  const trend = computed(() => {
    if (state.value !== 'ready' || !mainChartRecords) return null
    const series = buildEventRevenueSeries(unref(mainChartRecords) || [], liveMainEvents.value)
    return series.length ? trendFromEventSeries(series) : null
  })

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearTimer()
      clearComparisonSession()
    })
  }

  return {
    // état
    active,
    state,
    refreshing,
    pending,
    progress: report.progress,
    error: report.error,
    // périmètre
    appliedFilters: report.appliedFilters,
    excludedEvents: report.excludedEvents,
    sameAsMain: report.sameAsMain,
    truncation: report.truncation,
    intraEventRangeIgnored: report.intraEventRangeIgnored,
    isPredict: report.isPredict,
    events: report.events,
    // écarts
    deltasVsMain,
    mainDeltasVsComparison,
    widgetDeltas,
    chipDeltas: computed(() => deltasVsMain.value?.chips || null),
    trend,
    // moteur complet (jeux de données, view-models) pour les composants du rapport
    report,
    // relance explicite (bouton Réessayer) : vide le cache puis resynchronise le principal
    retry() {
      report.clearCache?.()
      syncMain()
    },
    flushNow: syncMain,
  }
}
