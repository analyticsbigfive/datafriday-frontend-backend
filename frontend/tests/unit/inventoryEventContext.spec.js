// Contexte évènement des écrans d'inventaire : normalisation + règle d'ancrage
// « un match = un eventId » (docs/modules/10_POST_EVENT_INVENTORY.md §12.4).
import { describeAnchorEvent, pickAnchorEvent } from '@/utils/inventoryEventContext'

const NOW = new Date('2026-08-04T12:00:00Z').getTime()

const EVENTS = [
  { id: 'p1', name: 'AJA-Lens', date: '2026-07-25' },
  { id: 'p2', name: 'AJA-Marseille', date: '2026-08-01' },
  { id: 'f1', name: 'AJA-Nice', date: '2026-08-12' },
  { id: 'f2', name: 'AJA-Brest', date: '2026-09-03' },
]

describe('describeAnchorEvent', () => {
  it('normalise la convention du store analyse (name / date)', () => {
    expect(describeAnchorEvent({ id: 7, name: 'AJA-Lens', date: '2026-07-25' })).toEqual({
      id: '7',
      name: 'AJA-Lens',
      dateISO: '2026-07-25',
    })
  })

  it('normalise la convention Event Predict (eventName / eventDate)', () => {
    expect(
      describeAnchorEvent({ id: 'e1', eventName: 'AJA-Nice', eventDate: '12/08/2026' }),
    ).toEqual({ id: 'e1', name: 'AJA-Nice', dateISO: '12/08/2026' })
  })

  it('renvoie null sur une entrée absente ou non-objet', () => {
    expect(describeAnchorEvent(null)).toBeNull()
    expect(describeAnchorEvent(undefined)).toBeNull()
    expect(describeAnchorEvent('AJA-Lens')).toBeNull()
  })

  it('tolère un event sans date (nom seul)', () => {
    expect(describeAnchorEvent({ id: 'x', name: 'Sans date' })).toEqual({
      id: 'x',
      name: 'Sans date',
      dateISO: null,
    })
  })
})

describe('pickAnchorEvent', () => {
  it('mode pre : prochain futur STRICT', () => {
    expect(pickAnchorEvent(EVENTS, { isPreMode: true, now: NOW })?.id).toBe('f1')
  })

  it('mode post : dernier passé STRICT', () => {
    expect(pickAnchorEvent(EVENTS, { isPreMode: false, now: NOW })?.id).toBe('p2')
  })

  it('aucun repli croisé : que du passé → pre renvoie null', () => {
    const pastOnly = EVENTS.filter((e) => e.id.startsWith('p'))
    expect(pickAnchorEvent(pastOnly, { isPreMode: true, now: NOW })).toBeNull()
  })

  it('aucun repli croisé : que du futur → post renvoie null', () => {
    const futureOnly = EVENTS.filter((e) => e.id.startsWith('f'))
    expect(pickAnchorEvent(futureOnly, { isPreMode: false, now: NOW })).toBeNull()
  })

  it('écarte les dates illisibles ou absentes des deux côtés', () => {
    const noisy = [
      { id: 'bad1', name: 'Sans date' },
      { id: 'bad2', name: 'Date pourrie', date: 'pas une date' },
      ...EVENTS,
    ]
    expect(pickAnchorEvent(noisy, { isPreMode: true, now: NOW })?.id).toBe('f1')
    expect(pickAnchorEvent(noisy, { isPreMode: false, now: NOW })?.id).toBe('p2')
  })

  it('lit le DD/MM/YYYY d’Event Predict sans inverser jour et mois', () => {
    // 12/08/2026 = 12 août. Lu en MM/DD ce serait le 8 décembre → futur lointain,
    // et l'ancrage pre choisirait le mauvais match.
    const ep = [
      { id: 'a', eventName: 'Août', eventDate: '12/08/2026' },
      { id: 'b', eventName: 'Septembre', eventDate: '03/09/2026' },
    ]
    expect(pickAnchorEvent(ep, { isPreMode: true, now: NOW })?.id).toBe('a')
  })

  it('liste vide ou nulle → null', () => {
    expect(pickAnchorEvent([], { isPreMode: true, now: NOW })).toBeNull()
    expect(pickAnchorEvent(null, { isPreMode: false, now: NOW })).toBeNull()
  })
})
