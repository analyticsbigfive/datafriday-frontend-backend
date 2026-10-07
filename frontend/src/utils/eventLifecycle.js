// Instants réels d'un event (ouverture des portes, fin) et match d'ancrage de
// l'écran Inventaire.
//
// `eventDate` / `eventStartDate` / `eventEndDate` sont des JOURS ancrés à minuit
// UTC, jamais une heure : comparer `eventDate` à `Date.now()` faisait passer le
// match du jour pour « passé » dès 00:00, et l'écran pre-event sautait au match
// suivant le jour même (incident Stade Jean Bouin, SFP-Lyon 26/09 : le
// 10 octobre était affiché l'après-midi du match).
//
// Miroir de backend/src/shared/utils/event-window.util.ts (resolveDoorsOpenAt,
// declaredEndOf) et de guest-pin-access/inventory-window-period.ts : mêmes règles,
// pour que l'écran et les fenêtres PIN basculent au même instant.

import { parseEventSessions } from './eventSessions'
import { parseInstant } from './preEventEditWindow'

const DEFAULT_TZ = 'Europe/Paris'

/** Décalage UTC (minutes) d'un fuseau IANA à un instant donné. */
function utcOffsetMinutes(instant, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
      hour: '2-digit',
    }).formatToParts(instant)
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw)
    if (!m) return 0
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] ?? '0', 10))
  } catch (_) {
    return 0
  }
}

/** Jour calendaire à minuit UTC : ISO (store analyse) ou DD/MM/YYYY (Event Predict,
 *  que `new Date` lirait mois/jour inversés). */
function toDay(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const s = String(value).trim()
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s)
  if (fr) return new Date(Date.UTC(+fr[3], +fr[2] - 1, +fr[1]))
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Jour calendaire (minuit UTC) + heure locale "HH:mm" du fuseau → instant réel. */
export function combineDayAndLocalTime(day, hhmm, timeZone = DEFAULT_TZ) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim())
  if (!day || !m) return null
  const naiveUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), Number(m[1]), Number(m[2]))
  return new Date(naiveUtc - utcOffsetMinutes(new Date(naiveUtc), timeZone) * 60_000)
}

const startDayOf = (e) => toDay(e?.eventStartDate ?? e?.eventDate ?? e?.date)
const endDayOf = (e) => toDay(e?.eventEndDate ?? e?.eventStartDate ?? e?.eventDate ?? e?.date)

/** Ouverture des portes (la plus tôt des sessions), `null` sans heure renseignée. */
export function eventDoorsOpenAt(event, timeZone = DEFAULT_TZ) {
  const day = startDayOf(event)
  if (!day) return null
  const hours = parseEventSessions(event?.sessions).map((s) => s.doorsOpening)
  if (event?.doorsOpening) hours.push(event.doorsOpening)
  let earliest = null
  for (const hhmm of hours) {
    const at = combineDayAndLocalTime(day, hhmm, timeZone)
    if (at && (!earliest || at < earliest)) earliest = at
  }
  return earliest
}

/** Heure du show (la plus tôt des sessions), `null` sans heure renseignée. */
export function eventShowAt(event, timeZone = DEFAULT_TZ) {
  const day = startDayOf(event)
  if (!day) return null
  const hours = parseEventSessions(event?.sessions).map((s) => s.showTime)
  if (event?.showTime) hours.push(event.showTime)
  let earliest = null
  for (const hhmm of hours) {
    const at = combineDayAndLocalTime(day, hhmm, timeZone)
    if (at && (!earliest || at < earliest)) earliest = at
  }
  return earliest
}

/**
 * Démarrage AUTOMATIQUE du post-event : heure du show, sinon ouverture des portes
 * (miroir de resolvePostEventAutoStartAt côté serveur, Bertrand 2026-10-07). Le
 * démarrage manuel reste possible dès l'ouverture des portes.
 */
export function postEventAutoStartAt(event, timeZone = DEFAULT_TZ) {
  return eventShowAt(event, timeZone) ?? eventDoorsOpenAt(event, timeZone)
}

/** Minuit local du jour de début. */
export function eventDayStart(event, timeZone = DEFAULT_TZ) {
  const day = startDayOf(event)
  return day ? combineDayAndLocalTime(day, '00:00', timeZone) : null
}

/** Fin de l'event : `eventEndTime` sur le jour de fin, sinon minuit local suivant. */
export function eventEndAt(event, timeZone = DEFAULT_TZ) {
  const day = endDayOf(event)
  if (!day) return null
  const declared = combineDayAndLocalTime(day, event?.eventEndTime, timeZone)
  if (declared) return declared
  const next = new Date(day)
  next.setUTCDate(next.getUTCDate() + 1)
  return combineDayAndLocalTime(next, '00:00', timeZone)
}

/** Fin de la période pre-event : FIN RÉELLE de l'event (retour Bertrand 2026-10-07, D24 :
 *  le pre-event reste possible après l'ouverture des portes, PDV par PDV, jusqu'à la fin ;
 *  même borne que le serveur, inventory-window-period.ts). Avant, l'ouverture des portes :
 *  l'écran pre-event se vidait dès les portes alors que le serveur acceptait encore. */
export function preEventClosesAt(event, timeZone = DEFAULT_TZ) {
  return eventEndAt(event, timeZone)
}

/** Ouverture des portes, sinon fin de l'event : borne de « à venir » (portes pas ouvertes). */
function doorsOrEndAt(event, timeZone) {
  return eventDoorsOpenAt(event, timeZone) ?? eventEndAt(event, timeZone)
}

/** Début de la période post-event : ouverture des portes, sinon minuit local du jour. */
export function postEventOpensAt(event, timeZone = DEFAULT_TZ) {
  return eventDoorsOpenAt(event, timeZone) ?? eventDayStart(event, timeZone)
}

/**
 * Match d'ancrage de l'écran Inventaire parmi `events` :
 *  - pre : le prochain match qui n'est pas TERMINÉ (le match du jour reste affiché jusqu'à
 *    sa fin réelle, D24) ;
 *  - post : le dernier match dont les portes SONT ouvertes.
 * @returns {object|null}
 */
export function pickInventoryAnchorEvent(events, mode, now = new Date(), timeZone = DEFAULT_TZ) {
  const t = now.getTime()
  if (mode === 'pre') {
    const upcoming = (events || [])
      .map((e) => ({ e, at: preEventClosesAt(e, timeZone) }))
      .filter((x) => x.at && t < x.at.getTime())
      .sort((a, b) => a.at - b.at)
    return upcoming[0]?.e ?? null
  }
  const started = (events || [])
    .map((e) => ({ e, at: postEventOpensAt(e, timeZone) }))
    .filter((x) => x.at && x.at.getTime() <= t)
    .sort((a, b) => b.at - a.at)
  return started[0]?.e ?? null
}

/**
 * Prochain match dont les portes ne sont PAS encore ouvertes : le « prochain évènement » de
 * la liste déroulante du post-event (le match en cours y est déjà « dernier évènement »).
 * @returns {object|null}
 */
export function pickUpcomingEvent(events, now = new Date(), timeZone = DEFAULT_TZ) {
  const t = now.getTime()
  const upcoming = (events || [])
    .map((e) => ({ e, at: doorsOrEndAt(e, timeZone) }))
    .filter((x) => x.at && t < x.at.getTime())
    .sort((a, b) => a.at - b.at)
  return upcoming[0]?.e ?? null
}

/** Post-event accessible pour cet event (portes ouvertes) ? */
export function isPostEventStarted(event, now = new Date(), timeZone = DEFAULT_TZ) {
  const at = postEventOpensAt(event, timeZone)
  return !!at && at.getTime() <= now.getTime()
}

/**
 * État d'une période de fenêtre PIN renvoyée par le serveur
 * (GET /inventory-windows/:spaceId/:eventId/periods), ré-évalué à `now` pour que le
 * panneau bascule à la minute sans re-requêter.
 * @param {{ opensAt?: string|null, closesAt?: string|null }|null} period
 * @returns {'unknown'|'not-yet'|'open'|'over'}
 */
export function windowPeriodState(period, now = new Date()) {
  if (!period || typeof period !== 'object') return 'unknown'
  // closesAt null = aucune fermeture automatique (post-event, clôturé par l'utilisateur).
  const closesAt = parseInstant(period.closesAt)
  const opensAt = parseInstant(period.opensAt)
  if (opensAt && now < opensAt) return 'not-yet'
  if (closesAt && now >= closesAt) return 'over'
  return 'open'
}

/**
 * Event terminé : sa fin réelle (`eventEndTime` sur le jour de fin, sinon minuit local
 * suivant) est passée. Même borne que la fenêtre de ventes côté serveur
 * (resolveEventTransactionWindow) : un match fini à 03:00 le lendemain reste en cours
 * jusqu'à 03:00, un match du soir n'est pas « passé » dès minuit.
 */
export function isEventOver(event, now = new Date(), timeZone = DEFAULT_TZ) {
  const end = eventEndAt(event, timeZone)
  return !!end && end.getTime() <= now.getTime()
}

/** Event en cours : entre minuit local de son jour de début et sa fin réelle. */
export function isEventInProgress(event, now = new Date(), timeZone = DEFAULT_TZ) {
  const start = eventDayStart(event, timeZone)
  const end = eventEndAt(event, timeZone)
  const t = now.getTime()
  return !!start && !!end && start.getTime() <= t && t < end.getTime()
}
