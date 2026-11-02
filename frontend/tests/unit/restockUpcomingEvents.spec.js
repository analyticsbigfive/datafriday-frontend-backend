import { upcomingPredictedEvents } from '@/utils/restockUpcomingEvents'

const TZ = 'Europe/Paris'
const NOW = new Date('2026-11-10T12:00:00Z')
const ev = (id, day, extra = {}) => ({ id, eventDate: `${day}T00:00:00.000Z`, ...extra })

describe('upcomingPredictedEvents', () => {
  it('exclut les matchs passés', () => {
    const events = [ev('a', '2026-11-01'), ev('b', '2026-11-20')]
    const out = upcomingPredictedEvents({ events, predictedIds: ['a', 'b'], now: NOW, timeZone: TZ })
    expect(out.map((e) => e.id)).toEqual(['b'])
  })

  it('garde un match en cours jusqu à sa fin réelle', () => {
    const e = ev('c', '2026-11-10', { eventEndTime: '23:00' })
    const before = new Date('2026-11-10T21:00:00Z') // 22:00 Paris
    const after = new Date('2026-11-10T22:30:00Z') // 23:30 Paris
    expect(upcomingPredictedEvents({ events: [e], predictedIds: ['c'], now: before, timeZone: TZ })).toHaveLength(1)
    expect(upcomingPredictedEvents({ events: [e], predictedIds: ['c'], now: after, timeZone: TZ })).toHaveLength(0)
  })

  it('trie du plus proche au plus lointain', () => {
    const events = [ev('z', '2026-12-05'), ev('x', '2026-11-12'), ev('y', '2026-11-25')]
    const out = upcomingPredictedEvents({ events, predictedIds: new Set(['x', 'y', 'z']), now: NOW, timeZone: TZ })
    expect(out.map((e) => e.id)).toEqual(['x', 'y', 'z'])
  })

  it('ignore les ids non prédits', () => {
    const events = [ev('a', '2026-11-12'), ev('b', '2026-11-13')]
    const out = upcomingPredictedEvents({ events, predictedIds: ['b'], now: NOW, timeZone: TZ })
    expect(out.map((e) => e.id)).toEqual(['b'])
  })

  it('renvoie une liste vide sans events, sans ids ou sans date', () => {
    expect(upcomingPredictedEvents({ events: [], predictedIds: ['a'], now: NOW, timeZone: TZ })).toEqual([])
    expect(upcomingPredictedEvents({ events: [ev('a', '2026-11-12')], predictedIds: [], now: NOW, timeZone: TZ })).toEqual([])
    expect(upcomingPredictedEvents({ events: [{ id: 'a' }], predictedIds: ['a'], now: NOW, timeZone: TZ })).toEqual([])
    expect(upcomingPredictedEvents({})).toEqual([])
  })
})
