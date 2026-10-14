// src/api/endpoints/eventPredict.api.js
// Client REST pour la persistance des SCÉNARIOS de prédiction (table
// EventPredictVersion). Remplace l'ancienne persistance Supabase Edge KV
// (make-server-eb31619c/kv/*) qui renvoyait 404.
//
// ⚠️ IMPORTANT — le client `{ api }` (named export de ../client) renvoie DÉJÀ
// le body de la réponse (cf. client.js `extractData(response) => response.data`).
// Il ne faut donc PAS refaire `.data` ici : `api.get()` rend directement le
// tableau / l'objet. Faire `(await api.get()).data` = double-unwrap = `undefined`
// (bug historique : versions vides + duplications, car POST/PATCH renvoyaient
// undefined → le front croyait l'échec et recréait des lignes).

import { api } from '../client'

/**
 * Liste les versions (scénarios) d'un event.
 * @param {string} eventId
 * @returns {Promise<Array>} tableau de EventPredictVersion (déjà le body)
 */
export async function listEventPredictVersions(eventId) {
  return api.get(`/events/${encodeURIComponent(eventId)}/predict-versions`)
}

/**
 * Crée une version pour un event.
 * @param {string} eventId
 * @param {Object} payload  cf. CreateEventPredictVersionDto (doc)
 * @returns {Promise<Object>} la version créée (avec id)
 */
export async function createEventPredictVersion(eventId, payload) {
  return api.post(`/events/${encodeURIComponent(eventId)}/predict-versions`, payload)
}

/**
 * Met à jour une version (nom, ajustements, snapshot, isDefault…).
 * @param {string} versionId
 * @param {Object} partial  champs à modifier
 * @returns {Promise<Object>} la version mise à jour
 */
export async function updateEventPredictVersion(versionId, partial) {
  return api.patch(`/predict-versions/${encodeURIComponent(versionId)}`, partial)
}

/**
 * Supprime une version.
 * @param {string} versionId
 */
export async function deleteEventPredictVersion(versionId) {
  await api.delete(`/predict-versions/${encodeURIComponent(versionId)}`)
  return true
}

/**
 * Définit (ou retire) la version par défaut d'un event — TOGGLE EXCLUSIF :
 * le backend met isDefault=true sur `versionId` et false sur toutes les
 * autres versions de l'event. `versionId = null` retire le défaut.
 * @param {string} eventId
 * @param {string|null} versionId
 * @returns {Promise<Object>} { defaultVersionId: string|null }
 */
export async function setEventPredictDefault(eventId, versionId) {
  return api.put(
    `/events/${encodeURIComponent(eventId)}/predict-versions/default`,
    { versionId: versionId || null },
  )
}

/**
 * Synthèse groupée : parmi `eventIds`, ceux qui ont au moins une version sauvegardée.
 * Une seule requête légère (pas de colonnes JSON). Découpe en lots pour garder une URL courte
 * (le serveur plafonne à 500 ids par appel).
 * @param {string[]} eventIds
 * @returns {Promise<string[]>}
 */
export async function getEventIdsWithPredictVersions(eventIds) {
  const ids = [...new Set((eventIds || []).filter(Boolean))]
  const BATCH = 200
  const found = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const res = await api.get('/predict-versions/summary', { params: { eventIds: chunk.join(',') } })
    if (Array.isArray(res?.eventIds)) found.push(...res.eventIds)
  }
  return found
}
