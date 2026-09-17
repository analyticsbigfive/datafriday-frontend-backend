// src/composables/usePreEventEditWindow.js
//
// Verrou des 30 minutes du Pre-event Inventory (staff) : charge l'état de la
// fenêtre depuis le serveur (seule source de vérité, cf. utils/preEventEditWindow)
// pour l'évènement ancré, et le ré-évalue chaque minute à l'horloge locale. La
// règle de phase vit dans utils/preEventEditWindow.js (pure, testée) ; ici
// seulement le chargement, la réactivité et le cycle de vie.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getPreEventWindow } from '@/api/endpoints/inventory.api'
import { preEventEditState } from '@/utils/preEventEditWindow'

const TICK_MS = 60 * 1000

/**
 * @param {() => ({ spaceId: string, eventId: string }|null)} getKey  ancrage de l'écran
 * @param {() => boolean} isActive  l'écran est-il en mode pre-event staff ?
 * @param {{ fetchWindow?: (spaceId: string, eventId: string) => Promise<object> }} [deps]
 */
export function usePreEventEditWindow(getKey, isActive, deps = {}) {
  const fetchWindow = deps.fetchWindow || getPreEventWindow
  const now = ref(new Date())
  const serverWindow = ref(null)
  const loading = ref(false)
  let timer = null
  let requestSeq = 0

  const state = computed(() => {
    if (!isActive()) return { phase: 'unknown', doorsOpen: null, deadline: null, doorsOpenDone: false }
    return preEventEditState(serverWindow.value, now.value)
  })

  const phase = computed(() => state.value.phase)
  const isLocked = computed(() => state.value.phase === 'locked')
  const isAfterDoorsOpen = computed(() => state.value.phase === 'editing' || state.value.phase === 'locked')
  const hasNoDoorsOpen = computed(() => state.value.phase === 'no-doors-open')
  const doorsOpenDone = computed(() => state.value.doorsOpenDone)
  const deadline = computed(() => state.value.deadline)
  const doorsOpen = computed(() => state.value.doorsOpen)

  function tick() {
    now.value = new Date()
  }

  /** Recharge l'état serveur (après un passage « portes ouvertes » manuel, par exemple). */
  async function refresh() {
    const key = isActive() ? getKey() : null
    if (!key?.spaceId || !key?.eventId) {
      serverWindow.value = null
      return
    }
    const seq = ++requestSeq
    loading.value = true
    try {
      const res = await fetchWindow(key.spaceId, key.eventId)
      if (seq === requestSeq) serverWindow.value = res || null
    } catch (e) {
      // Backend antérieur (404) ou réseau : aucun verrou côté écran, le serveur
      // reste le juge (403 relayé à la saisie).
      if (seq === requestSeq) serverWindow.value = null
      console.warn('[usePreEventEditWindow] état fenêtre indisponible :', e?.message)
    } finally {
      if (seq === requestSeq) loading.value = false
    }
    tick()
  }

  watch(
    () => {
      const key = isActive() ? getKey() : null
      return key ? `${key.spaceId}::${key.eventId}` : null
    },
    () => {
      refresh()
    },
    { immediate: true },
  )

  onMounted(() => {
    tick()
    timer = setInterval(tick, TICK_MS)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    timer = null
  })

  return {
    state,
    phase,
    isLocked,
    isAfterDoorsOpen,
    hasNoDoorsOpen,
    doorsOpenDone,
    deadline,
    doorsOpen,
    loading,
    refresh,
    tick,
  }
}
