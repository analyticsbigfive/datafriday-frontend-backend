import { computed, ref } from 'vue'
import { nearestEvent, tooltipRows } from '@/utils/costTrackingRows'

/**
 * Survol du graphique Cost tracking : crosshair, infobulle, événement le plus proche.
 * @param {Object} o
 * @param {import('vue').Ref<Object>} o.model modèle du graphique (x, margin, innerWidth, events)
 * @param {import('vue').Ref<Array>} o.series séries visibles (points en escalier + colorIndex)
 * @param {import('vue').Ref<number[]>} o.bounds [t0, t1] en ms
 */
export function useCostTrackingChartHover({ model, series, bounds }) {
  // { when, event } : instant sous le curseur, événement associé s'il y en a un.
  const active = ref(null)

  function timeAt(px) {
    const m = model.value
    const [t0, t1] = bounds.value
    return t0 + ((px - m.margin.l) / m.innerWidth) * (t1 - t0)
  }

  function onMove(px) {
    const event = nearestEvent(model.value.events, px)
    active.value = { when: event ? event.t : timeAt(px), event }
  }
  function onEventEnter(event) {
    active.value = { when: event.t, event }
  }
  function onLeave() {
    active.value = null
  }

  const rows = computed(() => (active.value ? tooltipRows(series.value, active.value.when) : []))
  const crosshairX = computed(() => (active.value ? model.value.x(active.value.when) : null))
  const activeEventId = computed(() => active.value?.event?.id ?? null)

  return { active, rows, crosshairX, activeEventId, onMove, onEventEnter, onLeave }
}
