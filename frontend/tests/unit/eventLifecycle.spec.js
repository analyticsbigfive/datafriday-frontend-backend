// Ancrage de l'écran Inventaire sur l'ouverture des portes (incident Stade Jean Bouin,
// SFP-Lyon 26/09 : l'écran pre-event affichait le 10 octobre l'après-midi du match).
import {
  eventDoorsOpenAt,
  eventEndAt,
  isEventInProgress,
  isEventOver,
  isPostEventStarted,
  pickInventoryAnchorEvent,
  pickUpcomingEvent,
  windowPeriodState,
} from '@/utils/eventLifecycle'

const TZ = 'Europe/Paris'
const ev = (id, day, doors, end = '23:50') => ({
  id,
  eventDate: `${day}T00:00:00.000Z`,
  eventEndTime: end,
  sessions: JSON.stringify([{ doorsOpening: doors }]),
})

const EVENTS = [
  ev('strasbourg', '2026-09-19', '15:15'),
  ev('lyon', '2026-09-26', '15:00', '23:00'),
  // Format réel en base : array de strings JSON.
  { ...ev('montpellier', '2026-10-10', '13:00'), sessions: ['{"doorsOpening":"13:00"}'] },
]
const at = (iso) => new Date(iso)

describe('eventDoorsOpenAt / eventEndAt', () => {
  it('heure locale Paris sur le jour du match', () => {
    expect(eventDoorsOpenAt(EVENTS[1], TZ).toISOString()).toBe('2026-09-26T13:00:00.000Z')
    expect(eventEndAt(EVENTS[1], TZ).toISOString()).toBe('2026-09-26T21:00:00.000Z')
  })

  it("sans heure d'ouverture des portes : null", () => {
    expect(eventDoorsOpenAt({ eventDate: '2026-09-26T00:00:00.000Z' }, TZ)).toBeNull()
  })

  it('lit le DD/MM/YYYY sans inverser jour et mois', () => {
    const d = eventDoorsOpenAt({ eventDate: '12/08/2026', sessions: [{ doorsOpening: '19:00' }] }, TZ)
    expect(d.toISOString()).toBe('2026-08-12T17:00:00.000Z')
  })
})

describe('pickInventoryAnchorEvent', () => {
  it("pre : le match du jour reste l'ancrage après l'ouverture des portes, jusqu'à sa fin (D24)", () => {
    expect(pickInventoryAnchorEvent(EVENTS, 'pre', at('2026-09-26T10:00:00Z'), TZ).id).toBe('lyon')
    expect(pickInventoryAnchorEvent(EVENTS, 'pre', at('2026-09-26T13:00:00Z'), TZ).id).toBe('lyon')
    expect(pickInventoryAnchorEvent(EVENTS, 'pre', at('2026-09-26T20:59:00Z'), TZ).id).toBe('lyon')
  })

  it('pre : bascule au match suivant à la fin réelle du match', () => {
    expect(pickInventoryAnchorEvent(EVENTS, 'pre', at('2026-09-26T21:00:00Z'), TZ).id).toBe('montpellier')
  })

  it("pickUpcomingEvent : prochain match dont les portes ne sont pas ouvertes", () => {
    expect(pickUpcomingEvent(EVENTS, at('2026-09-26T12:59:00Z'), TZ).id).toBe('lyon')
    expect(pickUpcomingEvent(EVENTS, at('2026-09-26T13:00:00Z'), TZ).id).toBe('montpellier')
  })

  it("post : le match du jour dès l'ouverture des portes, pas avant", () => {
    expect(pickInventoryAnchorEvent(EVENTS, 'post', at('2026-09-26T12:00:00Z'), TZ).id).toBe('strasbourg')
    expect(pickInventoryAnchorEvent(EVENTS, 'post', at('2026-09-26T14:15:00Z'), TZ).id).toBe('lyon')
  })

  it('isPostEventStarted suit la même bascule', () => {
    expect(isPostEventStarted(EVENTS[1], at('2026-09-26T12:59:00Z'), TZ)).toBe(false)
    expect(isPostEventStarted(EVENTS[1], at('2026-09-26T13:00:00Z'), TZ)).toBe(true)
  })
})

describe('windowPeriodState', () => {
  const post = { opensAt: '2026-09-26T13:00:00.000Z', closesAt: '2026-09-26T21:00:00.000Z' }

  it('avant / pendant / après, à la minute', () => {
    expect(windowPeriodState(post, at('2026-09-26T12:59:00Z'))).toBe('not-yet')
    expect(windowPeriodState(post, at('2026-09-26T14:15:00Z'))).toBe('open')
    expect(windowPeriodState(post, at('2026-09-26T21:00:00Z'))).toBe('over')
  })

  it('post-event sans fermeture automatique : ouvert après la fin du match', () => {
    const manual = { opensAt: '2026-09-26T13:00:00.000Z', closesAt: null }
    expect(windowPeriodState(manual, at('2026-09-26T12:59:00Z'))).toBe('not-yet')
    expect(windowPeriodState(manual, at('2026-09-28T10:00:00Z'))).toBe('open')
  })

  it('période inconnue', () => {
    expect(windowPeriodState(null)).toBe('unknown')
  })
})

describe('isEventOver / isEventInProgress', () => {
  const lyon = EVENTS[1]
  const vannes = {
    eventDate: '2026-11-28T00:00:00.000Z',
    eventEndDate: '2026-11-29T00:00:00.000Z',
    eventEndTime: '03:00',
  }

  it("le match du jour n'est pas terminé avant son heure de fin", () => {
    expect(isEventOver(lyon, at('2026-09-26T14:15:00Z'), TZ)).toBe(false)
    expect(isEventInProgress(lyon, at('2026-09-26T14:15:00Z'), TZ)).toBe(true)
    expect(isEventOver(lyon, at('2026-09-26T21:00:00Z'), TZ)).toBe(true)
  })

  it('fin à 03:00 le lendemain : toujours en cours après minuit', () => {
    expect(isEventOver(vannes, at('2026-11-29T00:30:00Z'), TZ)).toBe(false)
    expect(isEventInProgress(vannes, at('2026-11-29T00:30:00Z'), TZ)).toBe(true)
    expect(isEventOver(vannes, at('2026-11-29T02:00:00Z'), TZ)).toBe(true)
  })
})
