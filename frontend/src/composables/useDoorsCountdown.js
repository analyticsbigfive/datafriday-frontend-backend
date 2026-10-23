// Compte à rebours avant l'ouverture des portes. Un seul minuteur (30 s), arrêté au démontage
// ou quand plus rien n'est à compter.
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { splitDuration, formatCountdown } from '@/utils/doorsCountdown'

const TICK_MS = 30 * 1000

/**
 * @param {import('vue').Ref<Date|null>} doorsOpenAt
 * @param {import('vue').Ref<boolean>} active vrai tant que l'event affiché est à venir
 * @param {import('vue').Ref<{d:string,h:string,m:string}>} units libellés j / h / min
 */
export function useDoorsCountdown(doorsOpenAt, active, units) {
  const now = ref(Date.now())
  let timer = null

  function stop() {
    if (timer) { clearInterval(timer); timer = null }
  }
  function start() {
    stop()
    now.value = Date.now()
    timer = setInterval(() => { now.value = Date.now() }, TICK_MS)
  }

  watch(
    () => active.value && !!doorsOpenAt.value,
    (on) => { if (on) start(); else stop() },
    { immediate: true },
  )
  onBeforeUnmount(stop)

  const remainingMs = computed(() => (doorsOpenAt.value ? doorsOpenAt.value.getTime() - now.value : 0))
  const visible = computed(() => active.value && !!doorsOpenAt.value && remainingMs.value > 0)
  const text = computed(() => (visible.value ? formatCountdown(splitDuration(remainingMs.value), units.value) : ''))
  return { visible, text }
}
