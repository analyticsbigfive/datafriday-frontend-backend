// A la sortie du Builder, les plans, PdV et menus consommes par les autres pages
// (Analyse, Event Predict, Commandes) peuvent avoir change : on invalide leurs caches.
import { onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'

export function useBuilderExitInvalidation(spaceId) {
  const store = useStore()
  onBeforeUnmount(() => {
    if (!spaceId) return
    store.dispatch('spaceShops/invalidateForSpace', { spaceId }).catch?.(() => {})
    store.dispatch('analyse/invalidateSpaceCaches').catch?.(() => {})
  })
}
