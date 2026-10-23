// Compte à rebours avant l'ouverture des portes (bandeau du Live) et état « événement à venir ».
// Fonctions pures, sans dépendance à Vue ni à l'API.
import { eventDoorsOpenAt, eventDayStart } from './eventLifecycle'

const MINUTE_MS = 60 * 1000

/**
 * État « avant l'événement » : l'event existe et ses portes ne sont pas encore ouvertes.
 * Sans heure de portes renseignée, l'event reste « à venir » jusqu'à minuit local de son jour.
 * @returns {{ isUpcoming: boolean, doorsOpenAt: Date|null }}
 */
export function upcomingStatus(event, now = new Date()) {
  if (!event) return { isUpcoming: false, doorsOpenAt: null }
  const doorsOpenAt = eventDoorsOpenAt(event)
  const boundary = doorsOpenAt ?? eventDayStart(event)
  const isUpcoming = !!boundary && now.getTime() < boundary.getTime()
  return { isUpcoming, doorsOpenAt }
}

/** Durée restante découpée en jours / heures / minutes (minutes arrondies au supérieur). */
export function splitDuration(ms) {
  const totalMin = Math.max(0, Math.ceil(ms / MINUTE_MS))
  return {
    days: Math.floor(totalMin / 1440),
    hours: Math.floor((totalMin % 1440) / 60),
    minutes: totalMin % 60,
  }
}

/**
 * « 5 j 02 h 14 min » ; les jours disparaissent à 0 (« 2 h 14 min »), les heures aussi (« 14 min »).
 * Les heures sont sur deux chiffres seulement quand des jours sont affichés.
 */
export function formatCountdown({ days, hours, minutes }, units = { d: 'j', h: 'h', m: 'min' }) {
  const pad = (n) => String(n).padStart(2, '0')
  if (days > 0) return `${days} ${units.d} ${pad(hours)} ${units.h} ${pad(minutes)} ${units.m}`
  if (hours > 0) return `${hours} ${units.h} ${pad(minutes)} ${units.m}`
  return `${minutes} ${units.m}`
}
