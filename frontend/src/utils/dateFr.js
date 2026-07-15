/**
 * dateFr.js — Helpers de parsing & formatage de dates en français.
 *
 * Tous les composants Vue (et utilitaires) doivent utiliser ces helpers afin
 * d'éviter les multiples implémentations de `parseDDMMYYYY` éparpillées dans
 * la codebase. Ils acceptent les formats les plus courants rencontrés dans
 * notre data (DD/MM/YYYY, ISO YYYY-MM-DD, et fallback Date).
 */

/**
 * Parse une chaîne de date en `Date`. Retourne `null` si invalide.
 * Formats supportés :
 *   - "DD/MM/YYYY"
 *   - "YYYY-MM-DD" (avec ou sans suffixe horaire ISO)
 *   - tout ce que `new Date(...)` accepte
 *
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
export function parseEventDate(value) {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const s = String(value).trim()
  if (!s) return null

  const dd = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dd) {
    const d = new Date(+dd[3], +dd[2] - 1, +dd[1])
    return Number.isNaN(d.getTime()) ? null : d
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const d = new Date(+iso[1], +iso[2] - 1, +iso[3])
    return Number.isNaN(d.getTime()) ? null : d
  }

  const fallback = new Date(s)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

/**
 * Formate une date avec `Intl.DateTimeFormat('fr-FR', options)`.
 * Renvoie une chaîne vide si la date est invalide.
 *
 * @param {string|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatFrDate(value, options) {
  const d = value instanceof Date ? value : parseEventDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-FR', options).format(d)
}

export const formatDateShort = (v) =>
  formatFrDate(v, { day: '2-digit', month: '2-digit', year: 'numeric' })

export const formatDateMedium = (v) =>
  formatFrDate(v, { day: '2-digit', month: 'short', year: 'numeric' })

export const formatDateLong = (v) =>
  formatFrDate(v, { day: 'numeric', month: 'long', year: 'numeric' })

export const formatMonthYear = (v) =>
  formatFrDate(v, { month: 'long', year: 'numeric' })

export const formatWeekday = (v) =>
  formatFrDate(v, { weekday: 'long' })

export const formatTime = (v) =>
  formatFrDate(v, { hour: '2-digit', minute: '2-digit' })

/**
 * Comparateur de dates utilisable dans `Array.prototype.sort`.
 * Les valeurs invalides sont placées en dernier.
 */
export function compareEventDates(a, b) {
  const da = parseEventDate(a)?.getTime()
  const db = parseEventDate(b)?.getTime()
  if (da == null && db == null) return 0
  if (da == null) return 1
  if (db == null) return -1
  return da - db
}
