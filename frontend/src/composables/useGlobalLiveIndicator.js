// Chantier 379 (frontend/docs/chantiers/379_live_standalone_backend_driven) — indicateur
// global "un event est live quelque part dans le tenant", écoute GET /live/stream (backend :
// LiveController, un seul flux pattern-subscribe pour tous les espaces accessibles à
// l'utilisateur — pas une connexion par espace). Fenêtre de 30 min après le dernier message
// reçu pour un espace donné, même sémantique que GET /spaces/:id/live-status (definition
// "event live" déjà tranchée, 11_LIVE.md §7) — un espace sans nouveau message depuis 30 min
// n'est plus considéré live ici non plus.
//
// Singleton MODULE-SCOPE (pattern useReconciliationContext.js, BUG-284) : `App.vue` monte
// `GlobalLiveIndicator.vue` une seule fois (racine, toujours vivante), mais `SpaceItem.vue`
// (une instance PAR carte "My Spaces") a aussi besoin de savoir "CET espace précis est-il
// live ?" sans ouvrir sa propre connexion SSE — un appel naïf à `useGlobalLiveIndicator()`
// depuis chaque carte créerait N connexions indépendantes avec N Maps désynchronisées (audit
// 2026-09-03). Le state (`lastSeenBySpace`) et la connexion SSE sont donc créés UNE SEULE FOIS
// ici ; tous les appelants reçoivent les mêmes refs/fonctions. Seul `GlobalLiveIndicator.vue`
// appelle `start()`/`stop()` (lié à l'état auth) — les autres consommateurs ne font que LIRE
// via `isSpaceLive`/`lastSeenAt`, jamais gérer le cycle de vie de la connexion.
import { ref, computed, effectScope } from 'vue'
import { useLiveStream } from '@/composables/useLiveStream'

const LIVE_WINDOW_MS = 30 * 60 * 1000
const PRUNE_INTERVAL_MS = 60 * 1000

// Scope DÉTACHÉ : les `ref`/`computed` créés ici doivent survivre au-delà du cycle de vie du
// PREMIER composant qui appelle `useGlobalLiveIndicator()` (sinon ils seraient détruits au
// démontage de ce composant, cassant tous les autres consommateurs) — même raison que
// useReconciliationContext.js.
const _scope = effectScope(true)
let _shared = null

function createShared() {
  return _scope.run(() => {
    const lastSeenBySpace = ref(new Map())
    let pruneTimer = null
    let started = false

    function prune() {
      const cutoff = Date.now() - LIVE_WINDOW_MS
      let changed = false
      const next = new Map(lastSeenBySpace.value)
      for (const [spaceId, at] of next) {
        if (at < cutoff) { next.delete(spaceId); changed = true }
      }
      // Ne remplace la Map QUE si quelque chose a réellement expiré — évite de déclencher
      // tous les `computed`/`watch` qui en dépendent (toutes les cartes "My Spaces") toutes
      // les 60s pour rien quand rien n'a changé.
      if (changed) lastSeenBySpace.value = next
    }

    const stream = useLiveStream('/live/stream', (payload) => {
      if (!payload?.spaceId) return
      const next = new Map(lastSeenBySpace.value)
      next.set(payload.spaceId, Date.now())
      lastSeenBySpace.value = next
    })

    function start() {
      if (started) return
      started = true
      stream.connect()
      pruneTimer = setInterval(prune, PRUNE_INTERVAL_MS)
    }
    function stop() {
      if (!started) return
      started = false
      stream.disconnect()
      if (pruneTimer) { clearInterval(pruneTimer); pruneTimer = null }
    }

    const liveSpaceCount = computed(() => lastSeenBySpace.value.size)
    const hasLiveEvents = computed(() => liveSpaceCount.value > 0)
    // Lookup par espace — consommé par SpaceItem.vue (carte "My Spaces") pour remplacer son
    // check `/live-status` figé au montage par un signal qui s'éteint vraiment tout seul.
    function isSpaceLive(spaceId) {
      return spaceId ? lastSeenBySpace.value.has(spaceId) : false
    }
    function lastSeenAt(spaceId) {
      return (spaceId && lastSeenBySpace.value.get(spaceId)) || null
    }

    return { hasLiveEvents, liveSpaceCount, isSpaceLive, lastSeenAt, start, stop }
  })
}

export function useGlobalLiveIndicator() {
  if (!_shared) _shared = createShared()
  return _shared
}
