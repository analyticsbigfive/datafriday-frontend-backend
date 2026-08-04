/**
 * eventWeather — météo historique d'un événement via Open-Meteo (gratuit, sans
 * clé, CORS ouvert). Deux appels : géocodage de la ville du space (mis en cache
 * localStorage — une ville ne bouge pas), puis archive horaire à la date du show.
 *
 * Contrat : ne JETTE jamais. Toute absence de donnée (ville manquante, réseau,
 * date hors archive) rend `null` — la section météo du rapport est facultative
 * et ne doit jamais bloquer la génération du PDF.
 */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
const GEO_CACHE_KEY = 'analyse:geocode-cache'

/** Pictogramme par code WMO (https://open-meteo.com/en/docs — weather_code). */
const WMO_ICONS = [
  [[0], '☀️'],
  [[1, 2], '🌤️'],
  [[3], '☁️'],
  [[45, 48], '🌫️'],
  [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], '🌧️'],
  [[71, 73, 75, 77, 85, 86], '🌨️'],
  [[95, 96, 99], '⛈️'],
]

function weatherIcon(code) {
  for (const [codes, icon] of WMO_ICONS) {
    if (codes.includes(code)) return icon
  }
  return '🌡️'
}

function readGeoCache() {
  try {
    return JSON.parse(localStorage.getItem(GEO_CACHE_KEY)) || {}
  } catch (_) {
    return {}
  }
}

function writeGeoCache(cache) {
  try {
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache))
  } catch (_) {
    /* quota — le cache est un confort, pas un contrat */
  }
}

/** Ville → { latitude, longitude } (cache localStorage), ou null. */
async function geocodeCity(city, country) {
  const key = `${String(city).trim().toLowerCase()}|${String(country || '').trim().toLowerCase()}`
  const cache = readGeoCache()
  if (cache[key]) return cache[key]

  const params = new URLSearchParams({ name: city, count: '1', language: 'fr', format: 'json' })
  const res = await fetch(`${GEOCODE_URL}?${params}`)
  if (!res.ok) return null
  const body = await res.json()
  const hit = body?.results?.[0]
  if (!hit) return null
  const coords = { latitude: hit.latitude, longitude: hit.longitude }
  cache[key] = coords
  writeGeoCache(cache)
  return coords
}

/**
 * Météo à l'heure du show pour un event passé.
 * @param {{ city?: string, country?: string }} space
 * @param {Date} eventDate  date de l'événement (jour)
 * @param {string|null} showTime  « HH:mm » si connu — sinon 20h par défaut
 *   (l'archive est horaire, il faut choisir une heure)
 * @returns {Promise<{ temperature: number, icon: string, code: number } | null>}
 */
export async function fetchEventWeather(space, eventDate, showTime) {
  try {
    if (!space?.city || !(eventDate instanceof Date) || Number.isNaN(eventDate.getTime())) return null
    const coords = await geocodeCity(space.city, space.country)
    if (!coords) return null

    const day = eventDate.toISOString().split('T')[0]
    const params = new URLSearchParams({
      latitude: String(coords.latitude),
      longitude: String(coords.longitude),
      start_date: day,
      end_date: day,
      hourly: 'temperature_2m,weather_code',
      timezone: 'auto',
    })
    const res = await fetch(`${ARCHIVE_URL}?${params}`)
    if (!res.ok) return null
    const body = await res.json()
    const hours = body?.hourly?.time || []
    const temps = body?.hourly?.temperature_2m || []
    const codes = body?.hourly?.weather_code || []
    if (!hours.length) return null

    const hour = /^\d{1,2}[:h]/.test(String(showTime || ''))
      ? parseInt(String(showTime), 10)
      : 20
    let idx = hours.findIndex((h) => new Date(h).getHours() === hour)
    if (idx < 0) idx = Math.min(hour, hours.length - 1)

    const temperature = temps[idx]
    if (temperature == null) return null
    const code = codes[idx] ?? -1
    return { temperature: Math.round(temperature), icon: weatherIcon(code), code }
  } catch (_) {
    return null
  }
}
