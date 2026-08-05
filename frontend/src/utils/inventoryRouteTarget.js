// Cible d'inventaire pour un évènement donné.
//
// Pourquoi : Event Predict travaille sur des matchs À VENIR, mais son bouton
// d'inventaire poussait toujours `space-inventory` (post-event). Or l'écran
// post-event REJETTE un ?event= futur et se ré-ancre sur le dernier match passé
// (SpaceInventoryView.resolveEventContext, règle owner « un match = un
// eventId ») : on atterrissait donc sur un autre match, sans le savoir.
// Pour un match à venir, le seul écran cohérent est le pre-event inventory.

import { parseEventDate } from '@/utils/dateFr'

/**
 * `parseEventDate` et PAS `new Date` : les events d'Event Predict portent
 * `eventDate` au format **DD/MM/YYYY** (cf. parseDDMMYYYY dans EventPredictView),
 * que `new Date` lirait en MM/DD — le 12/08 deviendrait le 8 décembre et la
 * cible partirait sur la mauvaise route la moitié de l'année.
 *
 * @param {object|null} event  event Event Predict (`eventDate`) ou store analyse (`date`)
 * @param {number} [now]
 * @returns {'space-pre-inventory'|'space-inventory'} nom de route
 */
export function resolveInventoryRouteName(event, now = Date.now()) {
  const d = parseEventDate(event?.eventDate || event?.date || null)
  // Date absente ou illisible → comportement historique (post-event).
  if (!d) return 'space-inventory'
  return d.getTime() > now ? 'space-pre-inventory' : 'space-inventory'
}
