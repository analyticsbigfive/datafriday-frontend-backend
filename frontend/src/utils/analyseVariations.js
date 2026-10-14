/**
 * analyseVariations : totaux KPI item-level et écarts entre deux jeux de totaux.
 * Extrait de AnalyseView.vue (itemTotals / buildVar), sans lecture de store :
 * la table des coûts arrive en paramètre.
 *
 * Règles : % partout, marge en POINTS, transferRate en % de différence des
 * taux, null quand la référence est nulle.
 */

/**
 * Totaux d'un jeu d'events à partir des lignes article.
 * @param {Array} records  lignes article (eventId, menuItemId, revenue, quantity, transactionCount)
 * @param {Array} events   events (pour l'affluence : ticketsScanned ?? attendees ?? ticketsSold)
 * @param {Set} idSet      ids d'events retenus
 * @param {Object} [costMap]  coût unitaire par menuItemId
 */
export function computeItemTotals(records, events, idSet, costMap = {}) {
  const costs = costMap || {}
  let revenue = 0, cost = 0, transactions = 0, attendees = 0
  // Parité React (validEventCount) : moyennes par event divisées par les
  // events AVEC CA (> 0) : un event sans ventes ne dilue pas la moyenne.
  // BUG-284 : revByEvent rempli dans LA MÊME passe que les totaux.
  const revByEvent = new Map()
  for (const r of records) {
    if (!idSet.has(r.eventId)) continue
    revenue += r.revenue || 0
    cost += (costs[r.menuItemId] || 0) * (r.quantity || 0)
    transactions += r.transactionCount || 0
    revByEvent.set(r.eventId, (revByEvent.get(r.eventId) || 0) + (r.revenue || 0))
  }
  for (const e of events) {
    if (!idSet.has(e.id)) continue
    attendees += e.ticketsScanned ?? e.attendees ?? e.ticketsSold ?? 0
  }
  const eventCount = idSet.size
  let validEventCount = 0
  for (const v of revByEvent.values()) if (v > 0) validEventCount++
  return {
    revenue, cost, transactions, attendees, eventCount, validEventCount,
    avgRevenuePerEvent: validEventCount ? revenue / validEventCount : 0,
    avgCost: validEventCount ? cost / validEventCount : 0,
    avgPerTransaction: transactions ? revenue / transactions : 0,
    perCapita: attendees ? revenue / attendees : 0,
    margin: revenue ? ((revenue - cost) / revenue) * 100 : 0,
    transferRate: attendees ? (transactions / attendees) * 100 : 0,
  }
}

/**
 * Écarts courant vs référence. Objet vide si la référence n'a aucun event.
 * Marge = points de % ; transferRate = % de différence des TAUX.
 */
export function buildVariations(curr, prev) {
  if (!prev || !prev.eventCount) return {}
  const pct = (c, p) => (p ? ((c - p) / p) * 100 : null)
  return {
    revenue: pct(curr.revenue, prev.revenue),
    avgRevenuePerEvent: pct(curr.avgRevenuePerEvent, prev.avgRevenuePerEvent),
    cost: pct(curr.cost, prev.cost),
    avgCost: pct(curr.avgCost, prev.avgCost),
    transactions: pct(curr.transactions, prev.transactions),
    avgPerTransaction: pct(curr.avgPerTransaction, prev.avgPerTransaction),
    perCapita: pct(curr.perCapita, prev.perCapita),
    // Parité stricte avec buildVariations (store) : headerVariation lit
    // avgTransaction et attendees.
    avgTransaction: pct(curr.avgPerTransaction, prev.avgPerTransaction),
    attendees: pct(curr.attendees, prev.attendees),
    margin: curr.margin - prev.margin,
    transferRate: pct(curr.transferRate, prev.transferRate),
  }
}
