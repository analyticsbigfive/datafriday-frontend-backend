/**
 * Ids des events qui ont au moins une prédiction (Event Predict), pour l'étape 1 de la page
 * Commandes. Source : un seul appel groupé GET /predict-versions/summary (cross-poste).
 * Repli sur la détection locale UNIQUEMENT si l'appel échoue.
 */
import { getEventIdsWithPredictVersions } from '@/api/endpoints/eventPredict.api'

/**
 * @param {Array} eventIds  ids des events à examiner (matchs à venir)
 * @param {(id: string) => boolean} hasLocalPrediction  détection locale (repli)
 * @returns {Promise<string[]>}
 */
export async function resolvePredictedEventIds(eventIds, hasLocalPrediction) {
  const ids = [...new Set((eventIds || []).filter(Boolean))]
  if (!ids.length) return []
  try {
    const found = await getEventIdsWithPredictVersions(ids)
    return [...new Set(found)]
  } catch (err) {
    console.warn('[commandes] predict-versions/summary indisponible, repli local', err?.message || err)
    return ids.filter((id) => !!hasLocalPrediction?.(id))
  }
}
