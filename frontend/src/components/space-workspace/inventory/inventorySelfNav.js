// Réécriture d'URL faite par la vue Inventaire elle-même.
//
// Entrée directe sans ?event= : la vue résout l'event d'ancrage puis réécrit l'URL avec lui
// (router.replace), pour qu'elle reste partageable. Cette réécriture change la clé de route
// (`inventoryRouteKey`) et déclenchait un SECOND chargement complet, identique au premier
// (réconciliations, attendus, plans de réarmement, stock Logistique lus deux fois).
// Le chargement en cours couvre déjà ce contexte : on mémorise la clé attendue après la
// réécriture, et le watcher de route ignore cette seule transition.

import { inventoryRouteKey } from '@/components/space-workspace/inventory/useInventoryKeepAlive'

/** Clé de route attendue après `router.replace({ query: { ...query, event } })`. */
export function routeKeyAfterEventReplace(route, eventId) {
  return inventoryRouteKey({
    meta: route?.meta,
    params: route?.params,
    query: { ...(route?.query || {}), event: eventId },
  })
}

export function createSelfNavGuard() {
  let expected = null
  return {
    /** Mémorise la clé que la réécriture d'URL va produire. */
    expect(key) { expected = key || null },
    /** true UNE fois si `key` est la clé attendue (et l'oublie) : transition à ignorer. */
    consume(key) {
      if (expected !== null && expected === key) {
        expected = null
        return true
      }
      return false
    },
    /** Réécriture échouée ou annulée : plus rien à ignorer. */
    clear() { expected = null },
  }
}
