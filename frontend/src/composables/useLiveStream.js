// Chantier 379 (frontend/docs/chantiers/379_live_standalone_backend_driven) — client SSE pour
// GET /spaces/:id/live/stream (backend : SpacesController::liveStream). PAS `EventSource` natif :
// cette app authentifie par header `Authorization: Bearer <jwt>` (api/client.js), et EventSource
// ne permet aucun header custom — un token en query string laisserait une trace dans les logs/
// referrers pour rien. `fetch()` + lecture manuelle du flux `text/event-stream` à la place, même
// mécanisme d'auth que le reste de l'app (`getSessionOnce`).
import { ref } from 'vue'
import { getSessionOnce } from '@/lib/supabase'

const API_BASE_URL = (process.env.VUE_APP_API_URL || '').replace(/\/+$/, '')
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 20000] // backoff, plafonne à 20s

export function useLiveStream(path, onMessage) {
  const connected = ref(false)
  let abortController = null
  let reconnectTimer = null
  let reconnectAttempt = 0
  let stopped = true

  async function connectOnce() {
    abortController = new AbortController()
    let res
    try {
      const { data } = await getSessionOnce()
      const token = data?.session?.access_token
      res = await fetch(`${API_BASE_URL}${path}`, {
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: abortController.signal,
      })
    } catch (e) {
      if (e?.name === 'AbortError') return
      scheduleReconnect()
      return
    }
    if (!res.ok || !res.body) {
      scheduleReconnect()
      return
    }

    connected.value = true
    reconnectAttempt = 0

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // Une frame SSE est délimitée par une ligne vide ; on ne garde que les lignes `data:`
        // (l'endpoint ne pose ni `event:` ni `id:` — un seul type de message).
        let sep
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const frameLines = frame.split('\n')
          // `event: heartbeat` (backend, toutes les 20s) — garde juste la connexion
          // ouverte à travers d'éventuels proxys, ne doit PAS déclencher onMessage (sinon
          // un refresh() inutile toutes les 20s, exactement ce qu'on cherche à éviter).
          if (frameLines.some((l) => l.startsWith('event:') && l.slice(6).trim() === 'heartbeat')) continue
          const dataLines = frameLines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim())
          if (!dataLines.length) continue
          try {
            onMessage(JSON.parse(dataLines.join('')))
          } catch {
            // frame mal formée — ignorée, ne casse pas la connexion.
          }
        }
      }
    } catch (e) {
      if (e?.name !== 'AbortError') { /* lecture interrompue — reconnexion ci-dessous */ }
    }
    connected.value = false
    if (!stopped) scheduleReconnect()
  }

  function scheduleReconnect() {
    connected.value = false
    if (stopped) return
    const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)]
    reconnectAttempt++
    reconnectTimer = setTimeout(connectOnce, delay)
  }

  function connect() {
    if (!stopped) return // déjà connecté/en cours de connexion
    stopped = false
    reconnectAttempt = 0
    connectOnce()
  }

  function disconnect() {
    stopped = true
    connected.value = false
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (abortController) { abortController.abort(); abortController = null }
  }

  return { connected, connect, disconnect }
}
