/**
 * useTimelineMode — gestion du mode timeline (zoom minute/minute sur un event).
 * Placeholder fonctionnel à enrichir.
 */
import { computed } from 'vue'
import { useStore } from 'vuex'

export function useTimelineMode() {
  const store = useStore()

  const isTimelineActive = computed(() => store.state.analyse.chartViewMode === 'timeline')
  const timelineStartTime = computed(() => store.state.analyse.timelineStartTime)
  const timelineEndTime = computed(() => store.state.analyse.timelineEndTime)

  function enterTimeline({ start, end }) {
    store.commit('analyse/SET_CHART_VIEW_MODE', 'timeline')
    store.commit('analyse/SET_TIMELINE', { start, end })
  }
  function exitTimeline() {
    store.commit('analyse/SET_CHART_VIEW_MODE', 'default')
    store.commit('analyse/SET_TIMELINE', { start: null, end: null })
  }

  return { isTimelineActive, timelineStartTime, timelineEndTime, enterTimeline, exitTimeline }
}
