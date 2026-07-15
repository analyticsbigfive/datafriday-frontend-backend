// Point d'appel unique pour émettre une notification depuis un composant ou une
// couche non-store (api, utilitaire). Les MODULES Vuex, eux, dispatchent
// directement `notifications/push` en root ({ root: true }) pour éviter d'importer
// le store dans un module (cycle d'import).
//
//   import { notify } from '@/utils/notify'
//   notify({ type: 'menuitem', title: 'Article mis à jour', message: '« Chips »' })
//
// type ∈ 'event' | 'menuitem' | 'inventory' | 'success' | 'warning' | 'error' | 'info'
import store from '@/store'

export function notify(payload) {
  try {
    store.dispatch('notifications/push', payload)
  } catch {
    /* store indisponible (ex. hors app) — silencieux, non bloquant */
  }
}

export default notify
