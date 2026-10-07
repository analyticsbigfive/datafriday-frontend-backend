// Contexte évènement des écrans d'inventaire (Pre-event / Post-event).
//
// Pourquoi ce fichier : `SpaceInventoryView` sert les DEUX écrans et ancre son
// match tout seul (règle owner 2026-07-24 « un match = un eventId, aucune
// bascule silencieuse », cf. docs/modules/10_POST_EVENT_INVENTORY.md §12.4).
// L'écran ne disait jamais QUEL match il affichait — d'où le sentiment de
// navigation déroutante signalé par l'owner. Ces deux helpers purs portent la
// normalisation et la règle d'ancrage, testables sans monter le composant.
//
// `resolveEventContext()` (SpaceInventoryView.vue) et `pickAnchorEvent` partagent
// la règle d'ancrage via utils/eventLifecycle.js (bascule à l'ouverture des portes).
import { pickInventoryAnchorEvent, pickUpcomingEvent } from '@/utils/eventLifecycle'

/**
 * Normalise un évènement, quelle que soit son origine : le store `analyse`
 * expose `name`/`date`, les events d'Event Predict `eventName`/`eventDate`.
 * (Normalisation déjà faite ad hoc dans SpaceInventoryView — ici une fois.)
 *
 * @param {object|null} event
 * @returns {{ id: string, name: string, dateISO: string|null }|null}
 */
export function describeAnchorEvent(event) {
  if (!event || typeof event !== 'object') return null
  const name = event.name || event.eventName || ''
  const rawDate = event.eventDate || event.date || null
  return {
    id: event.id != null ? String(event.id) : '',
    name: String(name),
    dateISO: rawDate ? String(rawDate) : null,
  }
}

/**
 * Libellé « match » d'un évènement : « Auxerre vs Angers » quand les deux
 * équipes sont connues, sinon le nom de l'évènement. Sert au bandeau du
 * Pre-event Inventory (« Prochain Évènement : {match} », retour JLH 13/08) —
 * aucun formateur « X vs Y » n'existait dans l'app.
 *
 * @param {object|null} event
 * @returns {string} chaîne vide si l'évènement est nul et sans nom
 */
export function matchLabel(event) {
  if (!event || typeof event !== 'object') return ''
  const home = event.homeTeamName ? String(event.homeTeamName).trim() : ''
  const away = event.visitingTeamName ? String(event.visitingTeamName).trim() : ''
  if (home && away) return `${home} vs ${away}`
  return describeAnchorEvent(event)?.name || ''
}

/**
 * Évènement d'ancrage d'un écran d'inventaire, même règle que
 * `resolveEventContext()` (SpaceInventoryView.vue), désormais partagée via
 * `pickInventoryAnchorEvent` (utils/eventLifecycle.js) :
 *   - mode PRE  : prochain match dont les portes ne sont PAS encore ouvertes (le
 *     match du jour reste l'ancrage jusqu'à l'ouverture des portes) ; aucun repli
 *     sur le passé.
 *   - mode POST : dernier match dont les portes SONT ouvertes ; aucun repli sur le
 *     futur (un comptage post-event tagué sur un match à venir empoisonnerait la
 *     baseline du pre-event suivant).
 * Les évènements sans date lisible sont écartés des deux côtés.
 *
 * @param {Array<object>} events
 * @param {{ isPreMode?: boolean, now?: number, timeZone?: string }} [options]
 * @returns {object|null} l'évènement brut (non normalisé), ou null
 */
export function pickAnchorEvent(events, { isPreMode = false, now = Date.now(), timeZone } = {}) {
  return pickInventoryAnchorEvent(events, isPreMode ? 'pre' : 'post', new Date(now), timeZone)
}

/**
 * Évènements proposés par la liste déroulante du Post-event Inventory (document
 * Bertrand « Pre et Post event Inventory cycle », 2026-10-06, page 3) : le DERNIER
 * évènement dont les portes sont ouvertes (choix par défaut) et le PROCHAIN dont les
 * portes ne le sont pas encore. Même règle d'ouverture des portes que l'ancrage.
 *
 * @param {Array<object>} events
 * @param {{ now?: number, timeZone?: string }} [options]
 * @returns {{ last: object|null, next: object|null }}
 */
export function postEventChoices(events, { now = Date.now(), timeZone } = {}) {
  const at = new Date(now)
  return {
    last: pickInventoryAnchorEvent(events, 'post', at, timeZone),
    next: pickUpcomingEvent(events, at, timeZone),
  }
}
