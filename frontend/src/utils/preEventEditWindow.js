// Fenêtre d'édition du Pre-event Inventory autour de l'ouverture des portes.
//
// Miroir front de PreEventInventoryFlowService (backend) : mêmes règles, pour
// que l'écran annonce le verrou AVANT que le serveur ne réponde 403.
//   - "Doors Open" = `eventStartDate ?? eventDate` (décision 2026-09-14, aucun
//     champ dédié sur Event) ;
//   - les utilisateurs avec login peuvent encore modifier pendant 30 minutes ;
//   - au-delà, l'écran pre-event est en lecture seule.
// Fonctions pures, testables sans monter le composant.

import { parseEventDate } from '@/utils/dateFr'

export const PRE_EVENT_EDIT_WINDOW_MINUTES = 30

/**
 * Date-HEURE d'un champ évènement. `parseEventDate` (dateFr) tronque un ISO au
 * jour (minuit local), ce qui suffit aux ancrages par date mais perdrait
 * l'heure d'ouverture des portes : un ISO avec composante horaire est lu tel
 * quel, tout le reste passe par parseEventDate.
 * @returns {Date|null}
 */
export function parseEventDateTime(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return parseEventDate(s)
}

/** @returns {Date|null} instant "portes ouvertes", null si aucune date lisible. */
export function doorsOpenAt(event) {
  if (!event || typeof event !== 'object') return null
  return parseEventDateTime(event.eventStartDate) || parseEventDateTime(event.eventDate || event.date) || null
}

/** @returns {Date|null} fin de la fenêtre d'édition staff (doors open + 30 min). */
export function preEventEditDeadline(event) {
  const start = doorsOpenAt(event)
  if (!start) return null
  return new Date(start.getTime() + PRE_EVENT_EDIT_WINDOW_MINUTES * 60 * 1000)
}

/**
 * État de la fenêtre à l'instant `now`.
 * @returns {{ phase: 'before'|'editing'|'locked'|'unknown', doorsOpen: Date|null, deadline: Date|null }}
 *   'unknown' = évènement sans date : aucun verrou (le serveur ne pourra pas
 *   non plus en calculer un).
 */
export function preEventEditState(event, now = new Date()) {
  const doorsOpen = doorsOpenAt(event)
  const deadline = preEventEditDeadline(event)
  if (!doorsOpen || !deadline) return { phase: 'unknown', doorsOpen: null, deadline: null }
  const t = now.getTime()
  if (t < doorsOpen.getTime()) return { phase: 'before', doorsOpen, deadline }
  if (t <= deadline.getTime()) return { phase: 'editing', doorsOpen, deadline }
  return { phase: 'locked', doorsOpen, deadline }
}
