// Events passés de l'outil Prévision : ventes réelles ou scénario Event Predict.
//
// Module pur. Par défaut, un event passé affiche ses ventes réelles même s'il a un scénario
// Event Predict enregistré ; une case du bandeau bascule les passés sur le scénario. Les events
// futurs gardent toujours leur prédiction. Le choix est mémorisé en localStorage.

import { parseEventDate } from '@/utils/dateFr'

export const FORECAST_PAST_SCENARIO_KEY = 'analyse:forecast-past-use-scenario'

/** Lit le choix mémorisé. Absent, illisible ou localStorage indisponible : décoché (réel). */
export function readForecastPastUseScenario() {
  try {
    return localStorage.getItem(FORECAST_PAST_SCENARIO_KEY) === '1'
  } catch (_) {
    return false
  }
}

/** Mémorise le choix. Échec silencieux (quota, mode privé) : le choix reste valable en session. */
export function writeForecastPastUseScenario(value) {
  try {
    localStorage.setItem(FORECAST_PAST_SCENARIO_KEY, value === true ? '1' : '0')
  } catch (_) { /* sans effet */ }
}

/**
 * Sépare les events en futurs et passés, à la journée près : futur si la date est après
 * aujourd'hui, ou égale à aujourd'hui sans aucune donnée de vente ; passé sinon. Un event à date
 * illisible n'est dans aucune des deux listes. Les dates des events ne sont jamais modifiées.
 * @param {Array} events
 * @param {Set} eventIdsWithData  Ids des events qui ont des ventes réelles.
 * @param {Date} today  Aujourd'hui à minuit.
 * @returns {{ futureEvents: Array, pastEvents: Array }}
 */
export function splitEventsByTemporality(events, eventIdsWithData, today) {
  const futureEvents = []
  const pastEvents = []
  const todayMs = today.getTime()
  for (const event of events || []) {
    if (!event) continue
    const parsed = parseEventDate(event.eventDate)
    if (!parsed) continue
    const day = new Date(parsed.getTime())
    day.setHours(0, 0, 0, 0)
    const ms = day.getTime()
    if (ms > todayMs) futureEvents.push(event)
    else if (ms === todayMs && !eventIdsWithData.has(event.id)) futureEvents.push(event)
    else pastEvents.push(event)
  }
  return { futureEvents, pastEvents }
}

/** Le scénario Event Predict s'applique à un event futur, et à un event passé si la case est cochée. */
export function scenarioAppliesToEvent({ isFuture, usePastScenario }) {
  return isFuture === true || usePastScenario === true
}
