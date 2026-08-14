// Navigation des notifications (cloche) : traduit un item du store
// `notifications` en cible de route à partir de son `type` et de son `meta`.
// Pur et sans dépendance au router — testable en isolation ; le push est fait
// par NotificationPanel.
//
// `interpolate` comble l'absence d'interpolation du t() maison
// (translations.js) : les items i18n stockent une clé + des params, le panneau
// traduit au rendu puis remplace les jetons `{name}`.

/**
 * Remplace les jetons `{key}` d'une chaîne par `params[key]`. Null-safe :
 * sans params (ou clé absente), la chaîne revient telle quelle.
 */
export function interpolate(str, params) {
  if (typeof str !== 'string' || !params || typeof params !== 'object') return str
  return str.replace(/\{(\w+)\}/g, (token, key) =>
    params[key] != null ? String(params[key]) : token,
  )
}

/**
 * Item → route de destination, ou null (clic = marquer lu seulement).
 * Règles ORDONNÉES — l'alerte seuil storage (meta.target) prime sur
 * l'inventaire générique : les deux partagent le type 'inventory'.
 */
export function resolveNotificationRoute(item) {
  if (!item || typeof item !== 'object') return null
  const meta = item.meta || {}
  if (item.type === 'event' && meta.id != null) {
    // EventsListView ouvre le dialog d'édition via ?editEventId= (deep-link
    // existant, keepAlive-safe côté vue).
    return { name: 'events', query: { editEventId: String(meta.id) } }
  }
  if (item.type === 'inventory' && meta.target === 'restock-storage' && meta.spaceId != null) {
    // Réarmement, étape 1, onglet Espaces de stockage (?tab= géré par la vue).
    return {
      name: 'space-restock',
      params: { spaceId: String(meta.spaceId) },
      query: { step: 'stock', tab: 'storage' },
    }
  }
  if (item.type === 'inventory' && meta.spaceId != null) {
    return { name: 'space-inventory', params: { spaceId: String(meta.spaceId) } }
  }
  return null
}
