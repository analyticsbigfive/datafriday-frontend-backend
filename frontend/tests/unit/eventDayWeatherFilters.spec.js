import {
  DAY_KEYS,
  dayOfWeekKey,
  weatherCategory,
  eventTemperature,
  isTemperatureFilterActive,
  matchesDayOfWeek,
  matchesWeather,
  matchesTemperature,
  applyDayWeatherFilters,
  countEventsMissingWeather,
  DEFAULT_TEMPERATURE_RANGE,
} from '@/utils/eventDayWeatherFilters'

describe('dayOfWeekKey', () => {
  it('lundi en premier, dimanche en dernier', () => {
    expect(DAY_KEYS[0]).toBe('mon')
    expect(DAY_KEYS[6]).toBe('sun')
  })
  it('ISO (date seule) : 2026-10-14 est un mercredi', () => {
    expect(dayOfWeekKey({ date: '2026-10-14' })).toBe('wed')
  })
  it('ISO « à minuit » UTC : le jour reste celui de la date, pas décalé par le fuseau', () => {
    expect(dayOfWeekKey({ date: '2026-10-17T00:00:00.000Z' })).toBe('sat')
    expect(dayOfWeekKey({ date: '2026-10-18T00:00:00.000Z' })).toBe('sun')
  })
  it('DD/MM/YYYY via eventDate, repli quand date est absente', () => {
    expect(dayOfWeekKey({ eventDate: '19/10/2026' })).toBe('mon')
  })
  it('date absente ou invalide : null', () => {
    expect(dayOfWeekKey({})).toBeNull()
    expect(dayOfWeekKey({ date: 'n importe quoi' })).toBeNull()
    expect(dayOfWeekKey(null)).toBeNull()
  })
})

describe('weatherCategory (groupes WMO)', () => {
  it.each([
    [0, 'clear'], [1, 'clear'],
    [2, 'cloudy'], [3, 'cloudy'], [45, 'cloudy'], [48, 'cloudy'],
    [51, 'rain'], [57, 'rain'], [61, 'rain'], [67, 'rain'], [80, 'rain'], [82, 'rain'],
    [71, 'snow'], [77, 'snow'], [85, 'snow'], [86, 'snow'],
    [95, 'storm'], [96, 'storm'], [99, 'storm'],
  ])('code %i -> %s', (code, cat) => {
    expect(weatherCategory(code)).toBe(cat)
  })
  it('code absent, inconnu ou non numérique : null', () => {
    expect(weatherCategory(null)).toBeNull()
    expect(weatherCategory(undefined)).toBeNull()
    expect(weatherCategory('')).toBeNull()
    expect(weatherCategory(42)).toBeNull()
    expect(weatherCategory('abc')).toBeNull()
  })
  it('accepte un code numérique en chaîne', () => {
    expect(weatherCategory('61')).toBe('rain')
  })
})

describe('température', () => {
  it('défaut = pas de filtre', () => {
    expect(isTemperatureFilterActive(DEFAULT_TEMPERATURE_RANGE)).toBe(false)
    expect(isTemperatureFilterActive(undefined)).toBe(false)
  })
  it('plage réduite = filtre actif', () => {
    expect(isTemperatureFilterActive([5, 45])).toBe(true)
    expect(isTemperatureFilterActive([-10, 12])).toBe(true)
  })
  it('eventTemperature : null si absent, 0 valide', () => {
    expect(eventTemperature({})).toBeNull()
    expect(eventTemperature({ temperatureC: null })).toBeNull()
    expect(eventTemperature({ temperatureC: 0 })).toBe(0)
    expect(eventTemperature({ temperatureC: 12.5 })).toBe(12.5)
  })
  it('bornes incluses ; sans température exclu quand actif', () => {
    expect(matchesTemperature({ temperatureC: 5 }, [5, 12])).toBe(true)
    expect(matchesTemperature({ temperatureC: 12 }, [5, 12])).toBe(true)
    expect(matchesTemperature({ temperatureC: 12.1 }, [5, 12])).toBe(false)
    expect(matchesTemperature({ temperatureC: null }, [5, 12])).toBe(false)
    expect(matchesTemperature({ temperatureC: null }, DEFAULT_TEMPERATURE_RANGE)).toBe(true)
  })
})

describe('prédicats jour / météo', () => {
  it('sélection vide : tout passe', () => {
    expect(matchesDayOfWeek({}, [])).toBe(true)
    expect(matchesWeather({}, [])).toBe(true)
  })
  it('jour dans la sélection', () => {
    expect(matchesDayOfWeek({ date: '2026-10-17' }, ['sat', 'sun'])).toBe(true)
    expect(matchesDayOfWeek({ date: '2026-10-14' }, ['sat', 'sun'])).toBe(false)
    expect(matchesDayOfWeek({}, ['sat'])).toBe(false)
  })
  it('météo : sans code exclu quand actif', () => {
    expect(matchesWeather({ weatherCode: 63 }, ['rain'])).toBe(true)
    expect(matchesWeather({ weatherCode: 0 }, ['rain'])).toBe(false)
    expect(matchesWeather({ weatherCode: null }, ['rain'])).toBe(false)
  })
})

describe('applyDayWeatherFilters / countEventsMissingWeather', () => {
  const events = [
    { id: 'a', date: '2026-10-17', weatherCode: 61, temperatureC: 8 }, // sam, pluie
    { id: 'b', date: '2026-10-18', weatherCode: 0, temperatureC: 20 }, // dim, dégagé
    { id: 'c', date: '2026-10-17', weatherCode: null, temperatureC: null }, // sam, sans météo
    { id: 'd', date: '2026-10-14', weatherCode: 95, temperatureC: 15 }, // mer, orage
  ]
  const none = { selectedDaysOfWeek: [], selectedWeather: [], temperatureRange: [-10, 45] }

  it('aucun filtre : même tableau, rien exclu', () => {
    expect(applyDayWeatherFilters(events, none)).toBe(events)
  })
  it('combine les trois filtres (ET)', () => {
    const out = applyDayWeatherFilters(events, { ...none, selectedDaysOfWeek: ['sat'], selectedWeather: ['rain'] })
    expect(out.map((e) => e.id)).toEqual(['a'])
    const out2 = applyDayWeatherFilters(events, { ...none, temperatureRange: [10, 25] })
    expect(out2.map((e) => e.id)).toEqual(['b', 'd'])
  })
  it('le filtre jour seul garde l event sans météo', () => {
    const out = applyDayWeatherFilters(events, { ...none, selectedDaysOfWeek: ['sat'] })
    expect(out.map((e) => e.id)).toEqual(['a', 'c'])
  })
  it('compte les events sans donnée seulement si le filtre est actif', () => {
    expect(countEventsMissingWeather(events, none)).toEqual({ weather: 0, temperature: 0 })
    expect(countEventsMissingWeather(events, { ...none, selectedWeather: ['rain'] })).toEqual({ weather: 1, temperature: 0 })
    expect(countEventsMissingWeather(events, { ...none, temperatureRange: [0, 30] })).toEqual({ weather: 0, temperature: 1 })
  })
})
