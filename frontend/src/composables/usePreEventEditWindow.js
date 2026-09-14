// src/composables/usePreEventEditWindow.js
//
// Verrou des 30 minutes du Pre-event Inventory (staff) : expose l'état de la
// fenêtre d'édition pour l'évènement ancré, recalculé chaque minute. La règle
// elle-même vit dans utils/preEventEditWindow.js (pure, testée) ; ici seulement
// la réactivité (horloge) et le cycle de vie.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { preEventEditState } from '@/utils/preEventEditWindow'

const TICK_MS = 60 * 1000

/**
 * @param {() => object|null} getEvent  évènement ancré de l'écran (peut être null)
 * @param {() => boolean} isActive     l'écran est-il en mode pre-event staff ?
 */
export function usePreEventEditWindow(getEvent, isActive) {
  const now = ref(new Date())
  let timer = null

  const state = computed(() => {
    if (!isActive()) return { phase: 'unknown', doorsOpen: null, deadline: null }
    return preEventEditState(getEvent(), now.value)
  })

  const isLocked = computed(() => state.value.phase === 'locked')
  const isAfterDoorsOpen = computed(() => state.value.phase === 'editing' || state.value.phase === 'locked')
  const deadline = computed(() => state.value.deadline)

  function tick() {
    now.value = new Date()
  }

  onMounted(() => {
    tick()
    timer = setInterval(tick, TICK_MS)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    timer = null
  })

  return { state, isLocked, isAfterDoorsOpen, deadline, tick }
}
