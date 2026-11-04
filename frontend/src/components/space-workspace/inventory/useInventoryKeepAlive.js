// Cycle de vie keep-alive de SpaceInventoryView.
//
// La vue sert deux routes (inventory et pre-inventory), donc deux instances en
// cache. `useRoute()` renvoie la route COURANTE, y compris pour une instance
// desactivee : sans garde, ses watchers reagissent aux changements de route de
// l'autre page. Ce composable porte :
// - `canRun()` : l'instance est active et sur sa propre route
// - le rechargement au retour (cle de route changee ou contexte store d'une
//   autre phase), sinon revalidation silencieuse via useRefreshOnReturn

import { ref, onActivated, onDeactivated } from 'vue'
import { useRefreshOnReturn } from '@/composables/useRefreshOnReturn'

/** Cle de contexte : mode (pre/post), espace, event, configuration. */
export function inventoryRouteKey(route) {
  const cfg = route?.query?.configuration || route?.query?.config || ''
  const mode = route?.meta?.inventoryMode || 'post'
  return `${mode}::${route?.params?.spaceId || ''}::${route?.query?.event || ''}::${cfg}`
}

/**
 * @param {object} opts
 * @param {object} opts.route  useRoute()
 * @param {() => Promise<void>} opts.reload  rechargement complet (avec squelette)
 * @param {() => Promise<void>} opts.revalidate  revalidation silencieuse
 * @param {() => boolean} opts.contextStale  le store inventaire porte un autre event/phase
 */
export function useInventoryKeepAlive({ route, reload, revalidate, contextStale }) {
  const ownRouteName = route.name
  const isActive = ref(true)
  let loadedKey = null

  const canRun = () => isActive.value && route.name === ownRouteName
  const markLoaded = () => {
    loadedKey = inventoryRouteKey(route)
  }
  const keyChanged = () => loadedKey !== null && inventoryRouteKey(route) !== loadedKey

  onActivated(() => {
    isActive.value = true
    if (route.name !== ownRouteName) return
    // Les watchers ont ete ignores pendant l'absence : on rattrape ici, sans
    // attendre le delai minimal (comptages pre/post partages dans le store).
    if (keyChanged()) reload()
    else if (contextStale()) revalidate()
  })
  onDeactivated(() => {
    isActive.value = false
  })

  useRefreshOnReturn(() => {
    if (!canRun() || keyChanged() || contextStale()) return
    return revalidate()
  })

  return { isActive, canRun, markLoaded }
}
