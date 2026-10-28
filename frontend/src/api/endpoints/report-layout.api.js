// src/api/endpoints/report-layout.api.js
// Mise en page de la page 2 du rapport J+1, une par espace (module backend features/analyse).
// `api.get/put` renvoient déjà le corps de la réponse.

import { api } from '../client'

const path = (spaceId) => `/analyse/${encodeURIComponent(spaceId)}/report-layouts/j1-page2`

/** @returns {Promise<{ layout: { version: number, slots: Array }, version: number }>} */
export async function getJ1Page2Layout(spaceId) {
  return api.get(path(spaceId))
}

/**
 * @param {string} spaceId
 * @param {{ layout: Object, version: number }} body version = celle lue au chargement
 * @returns {Promise<{ layout: Object, version: number }>} rejette en 409 si la version est périmée
 */
export async function putJ1Page2Layout(spaceId, body) {
  return api.put(path(spaceId), body)
}
