// API back-office directeur — fenêtres d'inventaire et accès PIN invité par PDV
import api from '../client'

export async function getStatusBoard(spaceId, eventId) {
  const response = await api.get(`/inventory-windows/${spaceId}/${eventId}`)
  return response.data
}

/** Périodes pre/post-event de cet event : `{ 'pre-event': { opensAt, closesAt, state,
 *  message }, 'post-event': {...} }`, state = 'not-yet' | 'open' | 'over'. Le serveur
 *  refuse l'ouverture et le PIN hors période, ceci sert à l'expliquer avant le clic. */
export async function getPeriods(spaceId, eventId) {
  const response = await api.get(`/inventory-windows/${spaceId}/${eventId}/periods`)
  return response.data
}

/** Slug du lien QR code de chaque stockage de l'espace : `{ [elementId]: slug }`. */
export async function getStorageSlugs(spaceId) {
  const response = await api.get(`/inventory-windows/spaces/${spaceId}/storage-slugs`)
  return response.data
}

/** Verrouille l'écriture invité pour ce PDV — seule action qui le fait. */
export async function validateAccess(accessId) {
  const response = await api.post(`/inventory-windows/pins/${accessId}/validate`)
  return response.data
}

/** Réouvre l'écriture (efface "J'ai terminé"), même PIN, pas de régénération. */
export async function requestCorrection(accessId) {
  const response = await api.post(`/inventory-windows/pins/${accessId}/request-correction`)
  return response.data
}

// Document Bertrand « Pre et Post event Inventory cycle » (2026-10-06) : Démarrage /
// Reprise et Arrêt, pour tout l'espace (bandeau) ou un seul PDV (ligne). Chaque appel
// renvoie le tableau de statut à jour (même forme que getStatusBoard).

/** ▶ du bandeau : ouvre l'accès PIN à tous les PDV, arrête l'autre phase. */
export async function startWindow({ spaceId, eventId, phase }) {
  const response = await api.post('/inventory-windows/start', { spaceId, eventId, phase })
  return response.data
}

/** ■ du bandeau : coupe l'accès PIN de tous les PDV (PIN conservé, aucun push Logistic). */
export async function stopWindow({ spaceId, eventId, phase }) {
  const response = await api.post('/inventory-windows/stop', { spaceId, eventId, phase })
  return response.data
}

/** ▶ d'une ligne PDV : ouvre l'accès PIN à ce seul PDV, arrête l'autre phase pour lui. */
export async function startElement({ spaceId, eventId, phase, elementId }) {
  const response = await api.post('/inventory-windows/elements/start', { spaceId, eventId, phase, elementId })
  return response.data
}

/** ■ d'une ligne PDV : coupe l'accès PIN de ce seul PDV. */
export async function stopElement({ spaceId, eventId, phase, elementId }) {
  const response = await api.post('/inventory-windows/elements/stop', { spaceId, eventId, phase, elementId })
  return response.data
}
