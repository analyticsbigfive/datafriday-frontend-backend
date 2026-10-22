/**
 * eventCostLookup : coût d'un article à la date d'un event (chantier Cost tracking, lot 4b).
 *
 * `costByEvent` : { [eventId]: { [menuItemId]: coût de fournée } }, rempli depuis
 * GET /analyse/:spaceId/event-costs. `costMap` : carte actuelle (menuItemCostMap).
 * Règle de repli : toute valeur absente ou invalide (event inconnu, article sans
 * snapshot, source 'current', endpoint en échec) retombe sur `costMap`, soit
 * EXACTEMENT le comportement antérieur au lot 4. Sémantique inchangée : coût de fournée.
 */

/**
 * Aplati la réponse API en { eventId: { menuItemId: totalCost } }.
 * Les entrées `source: 'current'` sont ignorées (le repli donne la même valeur).
 * Un event connu sans coût figé reste présent avec `{}` (marqué « déjà chargé »).
 * @param {{events?: Object}|null} response
 * @returns {Object<string, Object<string, number>>}
 */
export function normalizeEventCosts(response) {
  const out = {}
  const events = response?.events
  if (!events || typeof events !== 'object') return out
  for (const [eventId, items] of Object.entries(events)) {
    const costs = {}
    for (const [itemId, entry] of Object.entries(items || {})) {
      if (!entry || entry.source === 'current') continue
      const value = Number(entry.totalCost)
      if (Number.isFinite(value) && value >= 0) costs[itemId] = value
    }
    out[eventId] = costs
  }
  return out
}

/**
 * Coût d'un article pour un event, avec repli sur la carte actuelle.
 * @returns {number} jamais NaN (0 quand rien n'est connu, comme `costMap[id] || 0`)
 */
export function costFor(costMap, costByEvent, eventId, menuItemId) {
  const perEvent = costByEvent && eventId != null ? costByEvent[eventId] : null
  if (perEvent) {
    const v = perEvent[menuItemId]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return (costMap && costMap[menuItemId]) || 0
}

/** Version curryfiée pour les boucles : (eventId, menuItemId) => coût. */
export function makeCostFor(costMap, costByEvent) {
  const map = costMap || {}
  if (!costByEvent || Object.keys(costByEvent).length === 0) {
    return (_eventId, menuItemId) => map[menuItemId] || 0
  }
  return (eventId, menuItemId) => costFor(map, costByEvent, eventId, menuItemId)
}
