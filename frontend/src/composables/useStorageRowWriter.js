import { ref } from 'vue'
import { upsertElementInventoryRow } from '@/api/endpoints/builder-v2.api'

/**
 * File d'écriture des lignes d'inventaire de la page Stockage : une requête d'upsert par élément
 * modifié, avec regroupement (debounce) des changements rapprochés et sérialisation par élément.
 * Écrit sans configId : le backend applique l'upsert à toutes les configs où l'élément est membre.
 */
export function useStorageRowWriter({ delay = 350, send = upsertElementInventoryRow } = {}) {
  const status = ref('idle') // idle | saving | saved | error
  const error = ref('')
  const wrote = ref(false)
  const pending = new Map() // elementId -> { name, ...champs }
  const timers = new Map()
  const chains = new Map() // elementId -> Promise (sérialise les envois d'un même élément)
  let inFlight = 0

  const refresh = () => {
    if (inFlight > 0 || timers.size > 0) status.value = 'saving'
  }

  async function flushElement(elementId) {
    timers.delete(elementId)
    const payload = pending.get(elementId)
    pending.delete(elementId)
    if (!payload) return
    inFlight += 1
    const prev = chains.get(elementId) || Promise.resolve()
    const run = prev.then(async () => {
      try {
        await send(elementId, payload)
        wrote.value = true
        if (!error.value) status.value = 'saved'
      } catch (e) {
        error.value = e?.response?.data?.message || e?.message || 'error'
        status.value = 'error'
      } finally {
        inFlight -= 1
        if (inFlight === 0 && timers.size === 0 && !error.value) status.value = 'saved'
      }
    })
    chains.set(elementId, run)
    return run
  }

  /** Ajoute un changement sur la ligne `name` de l'élément ; les changements rapprochés fusionnent. */
  function queue(elementId, name, patch) {
    const key = String(elementId)
    error.value = ''
    pending.set(key, { ...(pending.get(key) || {}), name, ...patch })
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => flushElement(key), delay))
    refresh()
  }

  /** Envoie tout de suite les changements en attente (fermeture du drawer). */
  async function flushAll() {
    for (const [key, t] of Array.from(timers.entries())) {
      clearTimeout(t)
      flushElement(key)
    }
    await Promise.all(Array.from(chains.values()))
  }

  function reset() {
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
    pending.clear()
    chains.clear()
    inFlight = 0
    status.value = 'idle'
    error.value = ''
    wrote.value = false
  }

  return { status, error, wrote, queue, flushAll, reset }
}
