// src/api/endpoints/historyAliases.api.js
// Client REST des alias « historique emprunté » Event Predict (table
// MenuItemHistoryAlias) : un nouvel article (target) reprend l'historique de
// ventes d'un ancien (source) pour obtenir des prévisions. La résolution est
// 100 % frontend (EventPredictView.activeTimelineData) — le backend ne fait
// que du CRUD de stockage, scope espace.
//
// ⚠️ le client `{ api }` renvoie DÉJÀ le body (cf. client.js extractData) —
// pas de `.data` ici (cf. commentaire eventPredict.api.js).

import { api } from '../client'

/**
 * Liste les alias d'un espace.
 * @param {string} spaceId
 * @returns {Promise<Array>} lignes MenuItemHistoryAlias (createdAt desc)
 */
export async function getHistoryAliases(spaceId) {
  return api.get(`/menu-item-history-aliases?spaceId=${encodeURIComponent(spaceId)}`)
}

/**
 * Crée / remplace un alias (upsert backend sur tenant + space + sourceName).
 * @param {{spaceId: string, sourceMenuItemId?: string, sourceName: string, targetMenuItemId: string}} payload
 * @returns {Promise<Object>} l'alias créé/mis à jour
 */
export async function createHistoryAlias(payload) {
  return api.post('/menu-item-history-aliases', payload)
}

/**
 * Supprime un alias.
 * @param {string} id
 */
export async function deleteHistoryAlias(id) {
  await api.delete(`/menu-item-history-aliases/${encodeURIComponent(id)}`)
  return true
}
