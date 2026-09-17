// Fenêtre d'édition du Pre-event Inventory autour de l'ouverture des portes.
//
// Le SERVEUR est la seule source de vérité (GET /inventory/:spaceId/pre-event-window/:eventId,
// PreEventInventoryFlowService.getWindowState) : il connaît l'heure d'ouverture des portes
// (`sessions[].doorsOpening`, fuseau du space) et la fin des 30 minutes d'édition, en
// instants UTC. L'écran ne recalcule rien à partir de l'event (eventDate est un jour ancré à
// minuit, pas une heure : l'ancien miroir front verrouillait l'écran à 02:30 le jour du
// match). Ici seulement : relecture des instants et re-évaluation de la phase à `now`, pour
// que le bandeau bascule à la minute sans re-requêter.
//
// Phases : 'no-doors-open' (aucune heure renseignée : aucun verrou, déclenchement manuel),
// 'before', 'editing' (30 min après les portes), 'locked', 'unknown' (état non chargé).

export const PRE_EVENT_EDIT_WINDOW_MINUTES = 30

/** @returns {Date|null} */
export function parseInstant(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * État de la fenêtre à l'instant `now`, depuis la réponse serveur.
 * @param {{ phase?: string, doorsOpenAt?: string|Date|null, editDeadline?: string|Date|null, doorsOpenDone?: boolean }|null} serverWindow
 * @param {Date} now
 * @returns {{ phase: 'no-doors-open'|'before'|'editing'|'locked'|'unknown', doorsOpen: Date|null, deadline: Date|null, doorsOpenDone: boolean }}
 */
export function preEventEditState(serverWindow, now = new Date()) {
  if (!serverWindow || typeof serverWindow !== 'object') {
    return { phase: 'unknown', doorsOpen: null, deadline: null, doorsOpenDone: false }
  }
  const doorsOpenDone = !!serverWindow.doorsOpenDone
  const doorsOpen = parseInstant(serverWindow.doorsOpenAt)
  if (!doorsOpen) return { phase: 'no-doors-open', doorsOpen: null, deadline: null, doorsOpenDone }
  const deadline =
    parseInstant(serverWindow.editDeadline) ||
    new Date(doorsOpen.getTime() + PRE_EVENT_EDIT_WINDOW_MINUTES * 60 * 1000)
  const t = now.getTime()
  if (t < doorsOpen.getTime()) return { phase: 'before', doorsOpen, deadline, doorsOpenDone }
  if (t <= deadline.getTime()) return { phase: 'editing', doorsOpen, deadline, doorsOpenDone }
  return { phase: 'locked', doorsOpen, deadline, doorsOpenDone }
}
