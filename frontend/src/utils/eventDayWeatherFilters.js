/**
 * eventDayWeatherFilters : fonctions pures des filtres avancés « jour de la
 * semaine », « météo à l'heure du show » et « température à l'heure du show »
 * du rapport Analyse. Le store ne fait que les appeler (aucune logique dans
 * les getters).
 *
 * Règles :
 *  - le jour est dérivé de la date de l'event via le parseur LOCAL de dateFr
 *    (dates « à minuit » : jamais new Date(string) brut ni toISOString) ;
 *  - la météo est dérivée du code WMO stocké sur l'Event (event.weatherCode),
 *    regroupé en 5 catégories ;
 *  - un event sans donnée (null) est EXCLU dès que le filtre correspondant est
 *    actif, et compté à part pour l'information utilisateur.
 */
import { parseEventDate } from '@/utils/dateFr'

// ── Jour de la semaine ────────────────────────────────────────────────────
/** Lundi = premier jour (ordre d'affichage). */
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** Clé i18n (libellé court) par jour. */
export const DAY_LABEL_KEYS = {
  mon: 'anDayMon',
  tue: 'anDayTue',
  wed: 'anDayWed',
  thu: 'anDayThu',
  fri: 'anDayFri',
  sat: 'anDaySat',
  sun: 'anDaySun',
}

/**
 * Clé du jour de la semaine d'un event ('mon'..'sun'), ou null si la date est
 * absente / invalide. Date.getDay() : 0 = dimanche, ramené à lundi = 0.
 */
export function dayOfWeekKey(event) {
  const d = parseEventDate(event?.date ?? event?.eventDate)
  if (!d) return null
  return DAY_KEYS[(d.getDay() + 6) % 7]
}

// ── Météo ─────────────────────────────────────────────────────────────────
/** Catégories météo, dans l'ordre d'affichage. */
export const WEATHER_CATEGORIES = ['clear', 'cloudy', 'rain', 'snow', 'storm']

/** Groupes de codes WMO par catégorie (https://open-meteo.com/en/docs). */
const WMO_GROUPS = {
  clear: [0, 1],
  cloudy: [2, 3, 45, 48],
  rain: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82],
  snow: [71, 73, 75, 77, 85, 86],
  storm: [95, 96, 99],
}

const CODE_TO_CATEGORY = new Map()
for (const [cat, codes] of Object.entries(WMO_GROUPS)) {
  for (const c of codes) CODE_TO_CATEGORY.set(c, cat)
}

/** Clé i18n du libellé de chaque catégorie. */
export const WEATHER_LABEL_KEYS = {
  clear: 'anWeatherClear',
  cloudy: 'anWeatherCloudy',
  rain: 'anWeatherRain',
  snow: 'anWeatherSnow',
  storm: 'anWeatherStorm',
}

/** Pictogramme mdi de chaque catégorie (@mdi/font 5.9.55). */
export const WEATHER_ICONS = {
  clear: 'mdi-weather-sunny',
  cloudy: 'mdi-weather-cloudy',
  rain: 'mdi-weather-rainy',
  snow: 'mdi-weather-snowy',
  storm: 'mdi-weather-lightning',
}

/** Catégorie météo d'un code WMO, ou null (code absent, non numérique ou inconnu). */
export function weatherCategory(code) {
  if (code == null || code === '') return null
  const n = Number(code)
  if (!Number.isFinite(n)) return null
  return CODE_TO_CATEGORY.get(n) ?? null
}

// ── Température ───────────────────────────────────────────────────────────
export const TEMPERATURE_MIN = -10
export const TEMPERATURE_MAX = 45
/** Défaut = bornes complètes = pas de filtre. */
export const DEFAULT_TEMPERATURE_RANGE = [TEMPERATURE_MIN, TEMPERATURE_MAX]

/** Température (°C) d'un event, ou null si absente / non numérique. */
export function eventTemperature(event) {
  const v = event?.temperatureC
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** true si la plage diffère des bornes complètes (filtre actif). */
export function isTemperatureFilterActive(range) {
  return Array.isArray(range)
    && range.length === 2
    && (range[0] > TEMPERATURE_MIN || range[1] < TEMPERATURE_MAX)
}

// ── Prédicats ─────────────────────────────────────────────────────────────
/** Jour de l'event dans la sélection (sélection vide = tout passe ; date invalide = exclu). */
export function matchesDayOfWeek(event, selectedDays) {
  if (!selectedDays?.length) return true
  const key = dayOfWeekKey(event)
  return key !== null && selectedDays.includes(key)
}

/** Catégorie météo de l'event dans la sélection (sélection vide = tout passe ; sans météo = exclu). */
export function matchesWeather(event, selectedWeather) {
  if (!selectedWeather?.length) return true
  const cat = weatherCategory(event?.weatherCode)
  return cat !== null && selectedWeather.includes(cat)
}

/** Température dans la plage, bornes incluses (plage par défaut = tout passe ; sans température = exclu). */
export function matchesTemperature(event, range) {
  if (!isTemperatureFilterActive(range)) return true
  const t = eventTemperature(event)
  return t !== null && t >= range[0] && t <= range[1]
}

/**
 * Applique les 3 filtres à une liste d'events.
 * @param {Array} events
 * @param {{selectedDaysOfWeek?: string[], selectedWeather?: string[], temperatureRange?: number[]}} filters
 */
export function applyDayWeatherFilters(events, filters = {}) {
  const { selectedDaysOfWeek, selectedWeather, temperatureRange } = filters
  const dayOn = !!selectedDaysOfWeek?.length
  const weatherOn = !!selectedWeather?.length
  const tempOn = isTemperatureFilterActive(temperatureRange)
  if (!dayOn && !weatherOn && !tempOn) return events
  return events.filter((e) =>
    matchesDayOfWeek(e, selectedDaysOfWeek)
    && matchesWeather(e, selectedWeather)
    && matchesTemperature(e, temperatureRange))
}

/**
 * Nombre d'events du périmètre sans donnée, pour l'information « N events sans
 * météo, exclus ». Chaque compteur n'est renseigné que si le filtre
 * correspondant est actif (sinon 0 : rien n'est exclu pour cette raison).
 * @returns {{weather: number, temperature: number}}
 */
export function countEventsMissingWeather(events, filters = {}) {
  const weatherOn = !!filters.selectedWeather?.length
  const tempOn = isTemperatureFilterActive(filters.temperatureRange)
  let weather = 0
  let temperature = 0
  for (const e of events || []) {
    if (weatherOn && weatherCategory(e?.weatherCode) === null) weather++
    if (tempOn && eventTemperature(e) === null) temperature++
  }
  return { weather, temperature }
}
