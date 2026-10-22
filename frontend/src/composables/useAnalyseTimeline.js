import { ref, shallowRef, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useTimelineMode } from '@/composables/useTimelineMode'
import { getSpaceEventTimelineBatch } from '@/api/endpoints/space.api'
import {
  planTimelineLoad,
  assembleTimelineRecords,
  timelineHeaderLabelOf,
} from '@/utils/timelineLoadPlan'
import store from '@/store'

/**
 * Manages loading, closing, and filter synchronization for the minute-by-minute
 * timeline in AnalyseView. Uses only real API data (no mock fallbacks).
 *
 * @param {object} options
 * @param {import('vue').Ref<Function>} options.setFilterImmediate calls the store's setFilterImmediate
 */
export function useAnalyseTimeline({ setFilterImmediate }) {
  const route = useRoute()
  const { isTimelineActive, enterTimeline, exitTimeline } = useTimelineMode()

  const selectedEventForTimeline = ref(null)
  // BUG-285 : shallowRef + gel — même traitement que le cache item-level (BUG-284) :
  // ce tableau minute-level est volumineux et n'est JAMAIS muté en place (toutes les
  // écritures ci-dessous réassignent .value en entier) ; la réactivité profonde ne
  // faisait que payer un Proxy par ligne dans chaque agrégation aval.
  const eventTimelineData = shallowRef([])
  const timelineEventsList = ref([])
  const timelineLoading = ref(false)
  const timelinePendingCount = ref(0)
  // Events écartés de la moyenne faute de coup d'envoi (showTime) exploitable :
  // `[{ id, name }]`. Alimente la bannière + le dialog « évènements sans horaire ».
  const timelineSkippedEvents = ref([])
  let timelineAbortController = null

  const timelineHeaderLabel = computed(() =>
    timelineHeaderLabelOf(timelineEventsList.value, selectedEventForTimeline.value),
  )

  function closeTimeline() {
    if (timelineAbortController) {
      timelineAbortController.abort()
      timelineAbortController = null
    }
    // Quitte le mode timeline d'ABORD (v-if démonte EventTimelineChart → vue-chartjs
    // détruit l'instance Line proprement). On NE réinitialise PAS dans le même tick
    // les refs qui alimentent le canvas (selectedEventForTimeline / eventTimelineData /
    // timelineEventsList) : muter `timeline-data` pendant que le canvas se détache
    // déclenche un Chart.update() sur un canvas détaché → crash Chart.js
    // « Cannot read properties of null (reading 'ownerDocument') » (ResizeObserver
    // detached). On défère ces resets après le démontage (nextTick).
    setFilterImmediate('selectedTimeRange', { start: null, end: null })
    exitTimeline()
    nextTick(() => {
      selectedEventForTimeline.value = null
      eventTimelineData.value = []
      timelineEventsList.value = []
      timelineSkippedEvents.value = []
      timelinePendingCount.value = 0
      timelineLoading.value = false
    })
  }

  function onTimelineRangeChange(payload) {
    // NB mode Moyenne : la plage draguée est exprimée en horloge ANCRE alors que
    // `selectedTimeRange` filtre les records store par minute horloge réelle.
    // Approximation PRÉEXISTANTE (la somme horloge d'avant avait le même écart)
    // — hors périmètre de l'alignement.
    setFilterImmediate('selectedTimeRange', {
      start: payload?.start || null,
      end: payload?.end || null,
    })
  }

  async function loadTimelineForEvents(eventList, { bypassCache = false } = {}) {
    if (!eventList || eventList.length < 1) {
      console.warn('[useAnalyseTimeline] aucun évènement à charger')
      return
    }

    if (timelineAbortController) timelineAbortController.abort()
    const controller = new AbortController()
    timelineAbortController = controller

    const plan = planTimelineLoad(eventList)
    timelineSkippedEvents.value = plan.skippedEvents
    selectedEventForTimeline.value = plan.selected

    // Bascule en mode timeline au tick SUIVANT. Sélectionner un event change le
    // FILTRE dans le même flush → le graphe à barres (EventRevenueByShopChart) reçoit
    // une mise à jour réactive de ses données. Si on démonte ce graphe (v-else) dans
    // le MÊME flush via SET_CHART_VIEW_MODE, Chart.js fait un update() sur un canvas
    // en cours de détachement → « Cannot read properties of null (reading
    // 'ownerDocument') ». En différant d'un tick, le graphe à barres termine son
    // update sur un canvas ENCORE attaché, PUIS est démonté proprement.
    store.commit('analyse/SET_TIMELINE', { start: null, end: null })
    await nextTick()
    if (controller.signal.aborted) return
    store.commit('analyse/SET_CHART_VIEW_MODE', 'timeline')
    timelineLoading.value = true
    timelinePendingCount.value = plan.idsToFetch.length
    timelineEventsList.value = plan.eventsList

    try {
      const spaceId = route.params.spaceId
      const byEventId = await getSpaceEventTimelineBatch(spaceId, plan.idsToFetch, { bypassCache })
      // Lot 4b : coûts figés des events chargés (ne lève jamais, échec = repli sur le coût actuel).
      await store.dispatch?.('analyse/ensureEventCosts', plan.idsToFetch)
      if (controller.signal.aborted) return

      const allRecords = assembleTimelineRecords(plan, byEventId, store.state.analyse.menuItemCostMap || {}, store.state.analyse.menuItemCostByEvent)
      eventTimelineData.value = allRecords
      if (allRecords.length === 0) {
        console.warn('[useAnalyseTimeline] aucune donnée disponible.')
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('[useAnalyseTimeline] erreur chargement', err)
        eventTimelineData.value = []
      }
    } finally {
      if (!controller.signal.aborted) {
        timelineLoading.value = false
        timelinePendingCount.value = 0
      }
      if (timelineAbortController === controller) timelineAbortController = null
    }
  }

  return {
    isTimelineActive,
    selectedEventForTimeline,
    eventTimelineData,
    timelineEventsList,
    timelineLoading,
    timelinePendingCount,
    timelineSkippedEvents,
    timelineHeaderLabel,
    loadTimelineForEvents,
    closeTimeline,
    onTimelineRangeChange,
  }
}
