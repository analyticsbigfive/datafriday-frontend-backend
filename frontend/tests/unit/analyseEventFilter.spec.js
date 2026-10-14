import { filterEvents, eventDateOf } from '@/utils/analyseEventFilter'

const ev = (id, date, extra = {}) => ({ id, date, ticketsSold: 100, ...extra })
const events = [
  ev('a', '2026-09-02', { name: 'PAUC Nantes', category: 'Basket', eventType: 'Sport', weatherCode: 0, temperatureC: 20 }),
  ev('b', '2026-09-09', { name: 'PAUC Brest', category: 'Basket', eventType: 'Sport', weatherCode: 61, temperatureC: 12 }),
  ev('c', '2026-10-03', { name: 'Concert', category: 'Musique', eventType: 'Spectacle', hasIntermission: true }),
  ev('d', '2026-10-10', { name: 'Gala', category: 'Basket', eventType: 'Sport', ticketsSold: 5000 }),
]
const ids = (l) => l.map((e) => e.id)
const bounds = { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30, 23, 59, 59) }

describe('eventDateOf', () => {
  it('ISO, JJ/MM/AAAA, champ eventDate, invalide', () => {
    expect(eventDateOf({ date: '2026-09-02T10:00:00Z' }).getMonth()).toBe(8)
    expect(eventDateOf({ eventDate: '14/10/2026' }).getDate()).toBe(14)
    expect(eventDateOf({ date: 'nimporte quoi' })).toBeNull()
    expect(eventDateOf({})).toBeNull()
  })
})

describe('filterEvents', () => {
  it('sans filtre : tout passe', () => {
    expect(ids(filterEvents(events, {}, null))).toEqual(['a', 'b', 'c', 'd'])
  })
  it('bornes de dates', () => {
    expect(ids(filterEvents(events, {}, bounds))).toEqual(['a', 'b'])
  })
  it('skipDate ignore les bornes mais garde les autres filtres', () => {
    const f = { selectedEventCategories: ['Basket'] }
    expect(ids(filterEvents(events, f, bounds, { skipDate: true }))).toEqual(['a', 'b', 'd'])
    expect(ids(filterEvents(events, f, bounds))).toEqual(['a', 'b'])
  })
  it('sélection d events, recherche, multi-critères, intermission', () => {
    expect(ids(filterEvents(events, { selectedEventIds: ['b', 'c'] }))).toEqual(['b', 'c'])
    expect(ids(filterEvents(events, { searchQuery: 'pauc' }))).toEqual(['a', 'b'])
    expect(ids(filterEvents(events, { selectedEventTypes: ['Spectacle'] }))).toEqual(['c'])
    expect(ids(filterEvents(events, { selectedIntermissions: ['yes'] }))).toEqual(['c'])
    expect(ids(filterEvents(events, { selectedIntermissions: ['no'] }))).toEqual(['a', 'b', 'd'])
  })
  it('plage de billets vendus', () => {
    expect(ids(filterEvents(events, { ticketsSoldRange: [0, 1000] }))).toEqual(['a', 'b', 'c'])
  })
  it('jour / météo / température inclus par défaut, sautés avec skipDayWeather', () => {
    const f = { selectedWeather: ['rain'] }
    expect(ids(filterEvents(events, f))).toEqual(['b'])
    expect(ids(filterEvents(events, f, null, { skipDayWeather: true }))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(filterEvents(events, { temperatureRange: [15, 45] }))).toEqual(['a'])
    // 2026-09-02 et 2026-09-09 sont des mercredis, 2026-10-03 et 2026-10-10 des samedis
    expect(ids(filterEvents(events, { selectedDaysOfWeek: ['wed'] }))).toEqual(['a', 'b'])
    expect(ids(filterEvents(events, { selectedDaysOfWeek: ['sat'] }))).toEqual(['c', 'd'])
  })
  it('un event sans date valide passe le filtre de dates (parité store)', () => {
    expect(ids(filterEvents([ev('x', null)], {}, bounds))).toEqual(['x'])
  })
})
