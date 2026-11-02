/**
 * Règle Bertrand : un event sans vente (CA = 0 et 0 transaction) n'a pas eu lieu. Il est exclu
 * de tous les calculs de la page Analyse (spectateurs, per cap, transfo, moyennes, nombre
 * d'events, graphique par event).
 *
 * Le rollup Event.revenue / Event.transactionCount fait foi. Quand il est absent (null ou
 * undefined, ex. rollup pas encore calculé), on ne sait pas : l'event est conservé.
 */
export function eventHasSales(event) {
  if (!event) return false
  const hasRevenue = event.revenue != null && !Number.isNaN(Number(event.revenue))
  const hasTx = event.transactionCount != null && !Number.isNaN(Number(event.transactionCount))
  if (!hasRevenue && !hasTx) return true
  return Number(event.revenue || 0) > 0 || Number(event.transactionCount || 0) > 0
}

/** Events ayant eu des ventes (voir eventHasSales). */
export function keepEventsWithSales(events) {
  return (events || []).filter(eventHasSales)
}
