// Chantier 379 (frontend/docs/chantiers/379_live_standalone_backend_driven) — indicateur
// global "un event est live quelque part dans le tenant", écoute GET /live/stream (backend :
// LiveController, un seul flux pattern-subscribe pour tous les espaces accessibles à
// l'utilisateur — pas une connexion par espace). Fenêtre de 30 min après le dernier message
// reçu pour un espace donné, même sémantique que GET /spaces/:id/live-status (definition
// "event live" déjà tranchée, 11_LIVE.md §7) — un espace sans nouveau message depuis 30 min
// n'est plus considéré live ici non plus.
import { ref, computed } from 'vue'
import { useLiveStream } from '@/composables/useLiveStream'

const LIVE_WINDOW_MS = 30 * 60 * 1000
const PRUNE_INTERVAL_MS = 60 * 1000

export function useGlobalLiveIndicator() {
  const lastSeenBySpace = ref(new Map())
  let pruneTimer = null

  function prune() {
    const cutoff = Date.now() - LIVE_WINDOW_MS
    for (const [spaceId, at] of lastSeenBySpace.value) {
      if (at < cutoff) lastSeenBySpace.value.delete(spaceId)
    }
    // Nouvelle Map pour déclencher la réactivité Vue (mutation en place d'une Map
    // existante n'est pas trackée par `ref`).
    lastSeenBySpace.value = new Map(lastSeenBySpace.value)
  }

  const stream = useLiveStream('/live/stream', (payload) => {
    if (!payload?.spaceId) return
    const next = new Map(lastSeenBySpace.value)
    next.set(payload.spaceId, Date.now())
    lastSeenBySpace.value = next
  })

  function start() {
    stream.connect()
    pruneTimer = setInterval(prune, PRUNE_INTERVAL_MS)
  }
  function stop() {
    stream.disconnect()
    if (pruneTimer) { clearInterval(pruneTimer); pruneTimer = null }
  }

  const liveSpaceCount = computed(() => lastSeenBySpace.value.size)
  const hasLiveEvents = computed(() => liveSpaceCount.value > 0)

  return { hasLiveEvents, liveSpaceCount, start, stop }
}
