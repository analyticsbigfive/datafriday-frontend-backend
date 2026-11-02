/**
 * Événements de l'étape 1 de la page Commandes : matchs à venir ayant au moins une
 * prédiction (Event Predict). Règle Bertrand (02/11) : aucune référence aux matchs passés.
 * Fonction pure, sans accès réseau ni localStorage.
 */
import { eventEndAt, isEventOver } from '@/utils/eventLifecycle'

function startTs(event) {
  const raw = event?.eventDate || event?.date
  const ts = raw ? new Date(raw).getTime() : NaN
  return Number.isFinite(ts) ? ts : null
}

/**
 * @param {Object} p
 * @param {Array} p.events  events de l'espace
 * @param {Set|Array} p.predictedIds  ids ayant au moins une prédiction
 * @param {Date} [p.now]
 * @param {string} [p.timeZone]
 * @returns {Array} events non terminés (fin réelle non atteinte), prédits, du plus proche au plus lointain
 */
export function upcomingPredictedEvents({ events, predictedIds, now = new Date(), timeZone } = {}) {
  const ids = predictedIds instanceof Set ? predictedIds : new Set(predictedIds || [])
  if (!ids.size) return []
  return (events || [])
    .filter((event) => event && ids.has(event.id))
    .filter((event) => eventEndAt(event, timeZone) && !isEventOver(event, now, timeZone))
    .sort((a, b) => (startTs(a) ?? Infinity) - (startTs(b) ?? Infinity))
}
