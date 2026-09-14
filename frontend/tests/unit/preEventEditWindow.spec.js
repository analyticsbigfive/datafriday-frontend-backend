// Fenêtre d'édition du Pre-event Inventory : Doors Open = eventStartDate ?? eventDate,
// 30 minutes d'édition staff, puis verrou (miroir de PreEventInventoryFlowService).
import {
  doorsOpenAt,
  parseEventDateTime,
  preEventEditDeadline,
  preEventEditState,
} from '@/utils/preEventEditWindow'

const MIN = 60 * 1000

describe('parseEventDateTime', () => {
  it("garde l'heure d'un ISO date-heure (parseEventDate la tronquerait au jour)", () => {
    expect(parseEventDateTime('2026-09-14T19:30:00.000Z').toISOString()).toBe('2026-09-14T19:30:00.000Z')
  })

  it('retombe sur parseEventDate pour une date seule (ISO ou DD/MM/YYYY)', () => {
    expect(parseEventDateTime('2026-09-14')).toEqual(new Date(2026, 8, 14))
    expect(parseEventDateTime('14/09/2026')).toEqual(new Date(2026, 8, 14))
    expect(parseEventDateTime(null)).toBeNull()
    expect(parseEventDateTime('n/a')).toBeNull()
  })
})

describe('doorsOpenAt', () => {
  it('eventStartDate prioritaire sur eventDate', () => {
    const ev = { eventDate: '2026-09-14T00:00:00.000Z', eventStartDate: '2026-09-14T19:30:00.000Z' }
    expect(doorsOpenAt(ev).toISOString()).toBe('2026-09-14T19:30:00.000Z')
  })

  it('eventDate quand eventStartDate manque, `date` (store analyse) en dernier recours', () => {
    expect(doorsOpenAt({ eventDate: '2026-09-14T18:00:00.000Z' }).toISOString()).toBe('2026-09-14T18:00:00.000Z')
    expect(doorsOpenAt({ date: '2026-09-14' })).toEqual(new Date(2026, 8, 14))
    expect(doorsOpenAt(null)).toBeNull()
    expect(doorsOpenAt({})).toBeNull()
  })
})

describe('preEventEditState', () => {
  const start = new Date('2026-09-14T19:30:00.000Z')
  const ev = { eventStartDate: start.toISOString(), eventDate: '2026-09-14T00:00:00.000Z' }

  it('deadline = doors open + 30 min', () => {
    expect(preEventEditDeadline(ev)).toEqual(new Date(start.getTime() + 30 * MIN))
  })

  it("'before' avant les portes, 'editing' pendant 30 min, 'locked' après", () => {
    expect(preEventEditState(ev, new Date(start.getTime() - MIN)).phase).toBe('before')
    expect(preEventEditState(ev, start).phase).toBe('editing')
    expect(preEventEditState(ev, new Date(start.getTime() + 30 * MIN)).phase).toBe('editing')
    expect(preEventEditState(ev, new Date(start.getTime() + 30 * MIN + 1)).phase).toBe('locked')
  })

  it("'unknown' sans date lisible : aucun verrou côté écran", () => {
    expect(preEventEditState({ name: 'sans date' }, start)).toEqual({ phase: 'unknown', doorsOpen: null, deadline: null })
  })
})
