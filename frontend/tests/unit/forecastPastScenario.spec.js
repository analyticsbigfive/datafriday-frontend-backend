// Events passés de l'outil Prévision : réel (défaut) ou scénario Event Predict.
// Util pur : mémorisation du choix, split futur/passé, application du scénario.

import {
  FORECAST_PAST_SCENARIO_KEY,
  readForecastPastUseScenario,
  writeForecastPastUseScenario,
  splitEventsByTemporality,
  scenarioAppliesToEvent,
} from '@/utils/forecastPastScenario'

const midnight = (y, m, d) => new Date(y, m - 1, d, 0, 0, 0, 0)
const TODAY = midnight(2026, 11, 23)

describe('forecastPastScenario, mémorisation du choix', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    jest.restoreAllMocks()
  })

  it('la clé est celle attendue', () => {
    expect(FORECAST_PAST_SCENARIO_KEY).toBe('analyse:forecast-past-use-scenario')
  })

  it('décoché (réel) par défaut, rien en mémoire', () => {
    expect(readForecastPastUseScenario()).toBe(false)
  })

  it('écrit puis relit le choix', () => {
    writeForecastPastUseScenario(true)
    expect(localStorage.getItem(FORECAST_PAST_SCENARIO_KEY)).toBe('1')
    expect(readForecastPastUseScenario()).toBe(true)
    writeForecastPastUseScenario(false)
    expect(readForecastPastUseScenario()).toBe(false)
  })

  it('une valeur mémorisée inconnue retombe sur décoché', () => {
    localStorage.setItem(FORECAST_PAST_SCENARIO_KEY, 'peut-etre')
    expect(readForecastPastUseScenario()).toBe(false)
  })

  it('localStorage qui échoue : ni exception ni valeur cochée', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(readForecastPastUseScenario()).toBe(false)
    expect(() => writeForecastPastUseScenario(true)).not.toThrow()
  })
})

describe('forecastPastScenario, splitEventsByTemporality', () => {
  const ev = (id, eventDate) => ({ id, eventDate })
  const ids = (list) => list.map((e) => e.id)

  it('date après aujourd\'hui : futur ; avant : passé', () => {
    const { futureEvents, pastEvents } = splitEventsByTemporality(
      [ev('f', '2026-11-24'), ev('p', '2026-11-22')], new Set(), TODAY,
    )
    expect(ids(futureEvents)).toEqual(['f'])
    expect(ids(pastEvents)).toEqual(['p'])
  })

  it('aujourd\'hui sans données : futur ; avec données : passé', () => {
    const events = [ev('t1', '2026-11-23'), ev('t2', '2026-11-23')]
    const { futureEvents, pastEvents } = splitEventsByTemporality(events, new Set(['t2']), TODAY)
    expect(ids(futureEvents)).toEqual(['t1'])
    expect(ids(pastEvents)).toEqual(['t2'])
  })

  it('accepte les dates JJ/MM/AAAA et ISO avec heure', () => {
    const { futureEvents, pastEvents } = splitEventsByTemporality(
      [ev('a', '25/11/2026'), ev('b', '2026-11-20T21:00:00.000Z')], new Set(), TODAY,
    )
    expect(ids(futureEvents)).toEqual(['a'])
    expect(ids(pastEvents)).toEqual(['b'])
  })

  it('date illisible ou absente : dans aucune des deux listes', () => {
    const { futureEvents, pastEvents } = splitEventsByTemporality(
      [ev('x', 'pas une date'), ev('y', null), ev('z', undefined)], new Set(), TODAY,
    )
    expect(futureEvents).toEqual([])
    expect(pastEvents).toEqual([])
  })

  it('ne modifie ni les events ni leurs dates', () => {
    const date = new Date(2026, 10, 25, 20, 30)
    const events = [{ id: 'd', eventDate: date }]
    const { futureEvents } = splitEventsByTemporality(events, new Set(), TODAY)
    expect(futureEvents[0]).toBe(events[0])
    expect(date.getHours()).toBe(20)
    expect(date.getMinutes()).toBe(30)
    expect(TODAY.getTime()).toBe(midnight(2026, 11, 23).getTime())
  })

  it('liste absente ou event nul : liste vide, pas d\'exception', () => {
    expect(splitEventsByTemporality(undefined, new Set(), TODAY)).toEqual({ futureEvents: [], pastEvents: [] })
    expect(splitEventsByTemporality([null], new Set(), TODAY)).toEqual({ futureEvents: [], pastEvents: [] })
  })
})

describe('forecastPastScenario, scenarioAppliesToEvent', () => {
  it('un event futur garde toujours son scénario', () => {
    expect(scenarioAppliesToEvent({ isFuture: true, usePastScenario: false })).toBe(true)
    expect(scenarioAppliesToEvent({ isFuture: true, usePastScenario: true })).toBe(true)
  })

  it('un event passé suit la case : décochée = réel, cochée = scénario', () => {
    expect(scenarioAppliesToEvent({ isFuture: false, usePastScenario: false })).toBe(false)
    expect(scenarioAppliesToEvent({ isFuture: false, usePastScenario: true })).toBe(true)
  })

  it('valeurs absentes : réel', () => {
    expect(scenarioAppliesToEvent({})).toBe(false)
  })
})
