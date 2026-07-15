// File d'attente d'autosave (doc REFONTE_3D_BUILDER_V2 §4.1).
// Deux familles de tâches :
//  - structurelles (create/delete/membership) : envoyées immédiatement, dans l'ordre ;
//  - géométriques (drag/resize/rotate) : coalescées par clé (`el:<id>`) et débouncées
//    500 ms — seule la dernière valeur part au serveur.
// Exécution SÉRIALISÉE (une requête à la fois) : pas de PATCH croisés sur la même
// entité. Retry ×3 backoff sur erreur réseau/5xx ; les 4xx (dont 409 verrou optimiste)
// ne sont jamais retentés : ils remontent au onError de la tâche.
import { reactive, computed } from 'vue'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createMutationQueue({ debounceMs = 500, maxRetries = 3 } = {}) {
  const state = reactive({
    queued: 0, // tâches en file (non démarrées)
    debounced: 0, // tâches coalescées en attente de flush
    running: false,
    lastSavedAt: null,
    lastError: null,
    offline: false,
  })

  const fifo = []
  const pendingByKey = new Map() // key → { task, timer }

  function enqueue(task) {
    fifo.push(task)
    state.queued = fifo.length
    pump()
  }

  /**
   * @param {() => Promise<any>} run  — la requête à exécuter (capture la DERNIÈRE valeur)
   * @param {{ key?: string, onError?: (err) => void, onSuccess?: (res) => void }} opts
   *   key présent = tâche coalescable (un seul envoi par clé, débouncé).
   */
  function push(run, { key = null, onError = null, onSuccess = null } = {}) {
    const task = { run, onError, onSuccess }
    if (!key) {
      enqueue(task)
      return
    }
    const existing = pendingByKey.get(key)
    if (existing) clearTimeout(existing.timer)
    else state.debounced += 1
    const entry = { task }
    entry.timer = setTimeout(() => {
      pendingByKey.delete(key)
      state.debounced -= 1
      enqueue(entry.task)
    }, debounceMs)
    pendingByKey.set(key, entry)
  }

  /** Force l'envoi immédiat d'une clé coalescée (ex. au mouseup d'un drag). */
  function flushKey(key) {
    const entry = pendingByKey.get(key)
    if (!entry) return
    clearTimeout(entry.timer)
    pendingByKey.delete(key)
    state.debounced -= 1
    enqueue(entry.task)
  }

  function flushAll() {
    for (const key of [...pendingByKey.keys()]) flushKey(key)
  }

  async function pump() {
    if (state.running) return
    state.running = true
    while (fifo.length > 0) {
      const task = fifo[0]
      let attempt = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const res = await task.run()
          state.lastError = null
          state.offline = false
          state.lastSavedAt = Date.now()
          task.onSuccess?.(res)
          break
        } catch (err) {
          const status = err?.response?.status
          const isClientError = status >= 400 && status < 500
          if (!isClientError && attempt < maxRetries) {
            attempt += 1
            await sleep(250 * 4 ** (attempt - 1))
            continue
          }
          state.lastError = err
          state.offline = !err?.response
          task.onError?.(err)
          break
        }
      }
      fifo.shift()
      state.queued = fifo.length
    }
    state.running = false
  }

  const pendingCount = computed(() => state.queued + state.debounced + (state.running ? 1 : 0))
  const status = computed(() => {
    if (state.lastError) return state.offline ? 'offline' : 'error'
    if (state.queued > 0 || state.debounced > 0 || state.running) return 'saving'
    return 'saved'
  })
  const hasPendingWork = computed(() => pendingCount.value > 0)
  const lastSavedAt = computed(() => state.lastSavedAt)

  function clearError() {
    state.lastError = null
    state.offline = false
  }

  return { push, flushKey, flushAll, status, pendingCount, hasPendingWork, lastSavedAt, clearError }
}
