// Parsing des `sessions` d'un event Analyse.
//
// L'API /events renvoie `sessions` SÉRIALISÉ en JSON (cf. EventFormDrawer :
// sauvegarde `sessions.map((s) => JSON.stringify(s))`, chargement
// `JSON.parse(e.sessions)`) — parfois la string d'un array entier, parfois un
// array dont chaque élément est lui-même une string JSON. Sans parsing,
// `e.sessions?.[0]?.showTime` lit un caractère (« [ ») → undefined → le coup
// d'envoi (showTime) et l'ouverture des portes ne sont jamais résolus.
//
// EventPredict le gère déjà via sa méthode interne `parseSessions` — on NE la
// touche PAS ; cet util pur (testable) fait la même chose côté Analyse.

/** JSON.parse tolérant : renvoie `fallback` en cas d'échec. */
function safeParse(str, fallback) {
  try {
    return JSON.parse(str)
  } catch (_) {
    return fallback
  }
}

/**
 * Normalise `raw` (string JSON, array de strings, ou array d'objets) en un
 * array d'objets session `{ doorsOpening?, showTime?, ... }`.
 * @param {unknown} raw valeur brute du champ `sessions`
 * @returns {Array<object>}
 */
export function parseEventSessions(raw) {
  let list = []
  if (Array.isArray(raw)) list = raw
  else if (typeof raw === 'string' && raw.trim()) {
    const parsed = safeParse(raw, [])
    list = Array.isArray(parsed) ? parsed : []
  }
  return list
    .map((s) => (typeof s === 'string' ? safeParse(s, null) : s))
    .filter((s) => s && typeof s === 'object' && !Array.isArray(s))
}
