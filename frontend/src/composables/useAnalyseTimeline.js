import { ref, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useTimelineMode } from '@/composables/useTimelineMode'
import { parseEventDate as parseEventDateLocal } from '@/utils/dateFr'
import { getSpaceEventTimelineBatch } from '@/api/endpoints/space.api'
import { preprocessTimelineRecords } from '@/utils/timelineBucketing'
import {
  computeAverageAlignment,
  alignAndScaleRecords,
} from '@/composables/analyseTimelineAverage'
import { t } from '@/i18n/translations'
import store from '@/store'

const MAX_TIMELINE_EVENTS = 50

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
  const eventTimelineData = ref([])
  const timelineEventsList = ref([])
  const timelineLoading = ref(false)
  const timelinePendingCount = ref(0)
  // Events écartés de la moyenne faute de coup d'envoi (showTime) exploitable :
  // `[{ id, name }]`. Alimente la bannière + le dialog « évènements sans horaire ».
  const timelineSkippedEvents = ref([])
  let timelineAbortController = null

  const timelineHeaderLabel = computed(() => {
    const list = timelineEventsList.value
    if (list.length > 1) {
      // K/N : K = events réellement alignés sur le coup d'envoi de l'ancre.
      const kept = list.filter((e) => e.aligned).length
      if (kept === 0)
        return `${t('anTimelineAvgPrefix')} ${list.length} ${t('anEventsPlural')} ${t('anTimelineAvgUnalignedSuffix')}`
      if (kept < list.length)
        return `${t('anTimelineAvgPrefix')} ${kept}/${list.length} ${t('anTimelineAvgAlignedEvents')}`
      return `${t('anTimelineAvgPrefix')} ${list.length} ${t('anEventsPlural')}`
    }
    return selectedEventForTimeline.value?.eventName || ''
  })

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

    let eventsToLoad = eventList
    if (eventList.length > MAX_TIMELINE_EVENTS) {
      eventsToLoad = [...eventList]
        .sort((a, b) => {
          const da = parseEventDateLocal(b.eventDate || b.date)?.getTime() || 0
          const db = parseEventDateLocal(a.eventDate || a.date)?.getTime() || 0
          return da - db
        })
        .slice(0, MAX_TIMELINE_EVENTS)
      console.warn(
        `[useAnalyseTimeline] ${eventList.length} evenements selectionnes, limite aux ${MAX_TIMELINE_EVENTS} plus recents.`,
      )
    }

    const isSingle = eventsToLoad.length === 1
    // Alignement parité EventPredict : ancre = coup d'envoi de l'event le plus
    // récent alignable ; events sans showTime exploitable → courbe skippée.
    // keptIds vide (aucun coup d'envoi) → repli legacy : somme non alignée.
    let alignment = null
    if (!isSingle) {
      const a = computeAverageAlignment(eventsToLoad)
      // Events écartés faute de coup d'envoi → alerte + dialog (liens fiche event).
      const skippedSet = new Set(a.skippedIds)
      timelineSkippedEvents.value = eventsToLoad
        .filter((e) => skippedSet.has(e.id))
        .map((e) => ({ id: e.id, name: e.eventName || e.name || e.id }))
      if (a.keptIds.length > 0) alignment = a
      else
        console.warn(
          '[useAnalyseTimeline] aucun coup d’envoi exploitable — moyenne non alignée (somme legacy).',
        )
    } else {
      timelineSkippedEvents.value = []
    }
    selectedEventForTimeline.value = isSingle
      ? {
          eventId: eventsToLoad[0].id,
          eventName: eventsToLoad[0].eventName || eventsToLoad[0].name,
          eventDate: eventsToLoad[0].eventDate || eventsToLoad[0].date,
        }
      : {
          eventId: 'average',
          eventName: `${t('anTimelineAvgPrefix')} ${eventsToLoad.length} ${t('anEventsPlural')}`,
          eventDate: '',
        }

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
    // En mode aligné, on ne fetch QUE les events alignables (les skippés ne
    // contribuent à rien) — le compteur de chargement suit ce périmètre réel.
    const idsToFetch = alignment
      ? alignment.keptIds
      : eventsToLoad.map((ev) => ev.id)
    timelinePendingCount.value = idsToFetch.length
    timelineEventsList.value = isSingle
      ? []
      : eventsToLoad.map((e) => ({
          eventName: e.eventName || e.name,
          eventDate: e.eventDate || e.date,
          aligned: alignment ? alignment.offsets.has(e.id) : false,
        }))

    try {
      const spaceId = route.params.spaceId
      const byEventId = await getSpaceEventTimelineBatch(spaceId, idsToFetch, { bypassCache })
      if (controller.signal.aborted) return

      // Dénominateur = nb d'events alignés, figé AVANT fetch (parité EP : les
      // poids sont fixés avant fetch — un event gardé sans lignes compte).
      const flatRecords = alignment
        ? eventsToLoad.flatMap((ev) => {
            const off = alignment.offsets.get(ev.id)
            if (off == null) return [] // sans showTime → courbe SKIPPÉE (jamais offset 0)
            const data = byEventId.get(ev.id)
            return Array.isArray(data)
              ? alignAndScaleRecords(data, off, alignment.keptIds.length, { eventId: ev.id })
              : []
          })
        : eventsToLoad.flatMap((ev) => {
            // Single + repli legacy : comportement historique intact.
            const data = byEventId.get(ev.id) || []
            return Array.isArray(data) ? data.map((r) => ({ ...r, eventId: ev.id })) : []
          })

      const allRecords = preprocessTimelineRecords(flatRecords, {
        menuItemCostMap: store.state.analyse.menuItemCostMap || {},
      })
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
