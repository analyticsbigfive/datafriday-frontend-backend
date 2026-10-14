/**
 * analyseEventFilter : filtrage pur des events du rapport Analyse.
 *
 * Extrait des getters du store analyse (eventsBeforeDayWeatherFilters,
 * filteredEvents, eventsMatchingFiltersExceptDate) pour pouvoir calculer un
 * SECOND rapport (comparaison) avec d'autres filtres que ceux du principal.
 * Aucune lecture de store : tout arrive en paramètres.
 */
import { applyDayWeatherFilters } from '@/utils/eventDayWeatherFilters'

/**
 * Date d'un event, robuste aux DEUX champs (`date` ISO ET `eventDate` ISO ou
 * DD/MM/YYYY). Indispensable pour exclure les events FUTURS en mode analyse : si
 * un event ne porte que `eventDate` (pas `date`), le filtre basé sur `e.date`
 * seul le laissait passer.
 */
export function eventDateOf(e) {
  const raw = e?.date ?? e?.eventDate
  if (!raw) return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  const s = String(raw).trim()
  const dd = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dd) return new Date(+dd[3], +dd[2] - 1, +dd[1])
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Filtres multi-critères : [clé de filtre, champ de l'event]. */
const MULTI_CRITERIA = [
  ['selectedEventCategories', 'category'],
  ['selectedEventTypes', 'eventType'],
  ['selectedTeams', 'team'],
  ['selectedSponsors', 'sponsor'],
  ['selectedSubcategories', 'subcategory'],
  ['selectedSessions', 'session'],
  ['selectedPerformerNames', 'performer'],
  ['selectedVisitingTeams', 'visitingTeam'],
  ['selectedOpeningActs', 'openingAct'],
  ['selectedDoorsOpenings', 'doorsOpening'],
  ['selectedShowTimes', 'showTime'],
]

/**
 * Filtre une liste d'events selon un jeu de filtres Analyse.
 *
 * @param {Array} baseEvents  events de départ (le scope config / non-futurs est
 *   décidé par l'appelant : analysableEvents pour le rapport courant,
 *   eventsInActiveConfiguration pour la variante « sauf dates »)
 * @param {object} filters    state.filters ou filtres de comparaison
 * @param {{start: Date|null, end: Date|null}} [bounds]  bornes de dates résolues
 * @param {{skipDate?: boolean, skipDayWeather?: boolean}} [options]
 *   skipDate : ignore les bornes (base des périodes précédente / N-1) ;
 *   skipDayWeather : n'applique pas jour / météo / température (périmètre
 *   servant à compter les events sans météo).
 * @returns {Array}
 */
export function filterEvents(baseEvents, filters, bounds, options = {}) {
  const { skipDate = false, skipDayWeather = false } = options
  const f = filters || {}
  let events = baseEvents || []

  if (f.selectedEventIds?.length) {
    const set = new Set(f.selectedEventIds)
    events = events.filter((e) => set.has(e.id))
  }
  if (f.searchQuery) {
    const q = f.searchQuery.toLowerCase()
    events = events.filter((e) => e.name?.toLowerCase().includes(q))
  }
  const { start, end } = bounds || {}
  if (!skipDate && (start || end)) {
    events = events.filter((e) => {
      const d = eventDateOf(e)
      if (!d) return true
      if (start && d < start) return false
      if (end && d > end) return false
      return true
    })
  }

  // Chaque filtre est un Set : si non vide on intersecte.
  for (const [key, field] of MULTI_CRITERIA) {
    const arr = f[key]
    if (arr?.length) {
      const set = new Set(arr)
      events = events.filter((e) => set.has(e[field]))
    }
  }

  // Intermission (binaire yes/no)
  if (f.selectedIntermissions?.length) {
    const set = new Set(f.selectedIntermissions)
    events = events.filter((e) => set.has(e.hasIntermission ? 'yes' : 'no'))
  }

  // Plages de billets vendus / scannés
  const soldR = f.ticketsSoldRange
  const scanR = f.ticketsScannedRange
  if (soldR || scanR) {
    events = events.filter((e) => {
      const sold = e.ticketsSold ?? e.attendees ?? 0
      const scanned = e.ticketsScanned ?? sold
      if (soldR && (sold < soldR[0] || sold > soldR[1])) return false
      if (scanR && (scanned < scanR[0] || scanned > scanR[1])) return false
      return true
    })
  }

  return skipDayWeather ? events : applyDayWeatherFilters(events, f)
}
