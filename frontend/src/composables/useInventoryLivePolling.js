// src/composables/useInventoryLivePolling.js
//
// Rafraîchissement de fond de l'écran d'inventaire STAFF pendant qu'une fenêtre
// d'accès PIN est ouverte : les managers de PDV comptent sur leur téléphone, le
// directeur doit voir la colonne de droite (À compter / Comptés, statuts PIN)
// bouger sans recharger la page (critère d'acceptation 2026-09-14).
//
// Polling simple (pas de websocket côté inventaire) : un tick toutes les
// `intervalMs` quand `enabled()` est vrai et l'onglet visible. Le tick lui-même
// est fourni par l'appelant (la vue sait quoi recharger) ; ce composable ne
// porte que la cadence et le cycle de vie.

import { onBeforeUnmount, onMounted, watch } from 'vue'

const DEFAULT_INTERVAL_MS = 20 * 1000

/**
 * @param {() => boolean} enabled  condition de polling (réévaluée via watch)
 * @param {() => Promise<void>} tick  rechargement à effectuer
 * @param {{ intervalMs?: number }} [options]
 */
export function useInventoryLivePolling(enabled, tick, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  let timer = null
  let running = false

  async function run() {
    if (running || (typeof document !== 'undefined' && document.hidden)) return
    running = true
    try {
      await tick()
    } catch (e) {
      console.warn('[inventory-live-polling] tick KO:', e?.message)
    } finally {
      running = false
    }
  }

  function start() {
    if (timer) return
    timer = setInterval(run, intervalMs)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  function onVisibility() {
    // Retour sur l'onglet : un tick immédiat plutôt qu'attendre l'intervalle.
    if (typeof document !== 'undefined' && !document.hidden && enabled()) run()
  }

  onMounted(() => {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
    if (enabled()) start()
  })
  onBeforeUnmount(() => {
    stop()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
  })

  watch(enabled, (on) => {
    if (on) start()
    else stop()
  })

  return { start, stop, runNow: run }
}
