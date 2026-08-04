// Contexte évènement des écrans d'inventaire (Pre-event / Post-event).
//
// Pourquoi ce fichier : `SpaceInventoryView` sert les DEUX écrans et ancre son
// match tout seul (règle owner 2026-07-24 « un match = un eventId, aucune
// bascule silencieuse », cf. docs/modules/10_POST_EVENT_INVENTORY.md §12.4).
// L'écran ne disait jamais QUEL match il affichait — d'où le sentiment de
// navigation déroutante signalé par l'owner. Ces deux helpers purs portent la
// normalisation et la règle d'ancrage, testables sans monter le composant.
//
// ⚠️ `resolveEventContext()` (SpaceInventoryView.vue) n'est volontairement PAS
// rebranché sur `pickAnchorEvent` : son bloc d'ancrage encode la même règle mais
// aussi la résolution de configuration, et le domaine porte une pile de
// correctifs non déployés. `pickAnchorEvent` est exporté pour le test et pour un
// futur alignement, pas pour un refactor opportuniste.
import { parseEventDate } from '@/utils/dateFr'

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
 * Évènement d'ancrage d'un écran d'inventaire.
 *   - mode PRE  : prochain évènement FUTUR strict (aucun repli sur le passé —
 *     sans match à venir, l'écran reste vide).
 *   - mode POST : dernier évènement PASSÉ strict (aucun repli sur le futur — un
 *     comptage post-event tagué sur un match à venir empoisonnerait la baseline
 *     du pre-event suivant).
 * Les évènements sans date lisible sont écartés des deux côtés.
 *
 * @param {Array<object>} events
 * @param {{ isPreMode?: boolean, now?: number }} [options]
 * @returns {object|null} l'évènement brut (non normalisé), ou null
 */
export function pickAnchorEvent(events, { isPreMode = false, now = Date.now() } = {}) {
  // `parseEventDate` : le store analyse porte de l'ISO, Event Predict du
  // DD/MM/YYYY — `new Date` inverserait jour et mois sur le second.
  const dated = (events || [])
    .map((e) => ({ e, t: parseEventDate(e?.eventDate || e?.date)?.getTime() }))
    .filter((x) => x.t != null && !Number.isNaN(x.t))
  if (!dated.length) return null
  if (isPreMode) {
    const future = dated.filter((x) => x.t > now).sort((a, b) => a.t - b.t)
    return future[0]?.e || null
  }
  const past = dated.filter((x) => x.t <= now).sort((a, b) => b.t - a.t)
  return past[0]?.e || null
}
