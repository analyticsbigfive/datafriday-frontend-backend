import { pickNextEventBeforeDoorsOpen, resolvePreEventDeadline } from './event-window.util';

// Stade Jean Bouin, dates réelles (toutes à minuit UTC en base).
const ev = (id: string, day: string, doors: string | null, end = '23:50') => ({
  id,
  eventDate: new Date(`${day}T00:00:00.000Z`),
  eventEndTime: end,
  sessions: doors ? JSON.stringify([{ doorsOpening: doors }]) : null,
});
const EVENTS = [
  ev('strasbourg', '2026-09-19', '15:15'),
  ev('lyon', '2026-09-26', '15:00', '23:00'),
  ev('montpellier', '2026-10-10', '13:00'),
];
const TZ = 'Europe/Paris';

describe('pickNextEventBeforeDoorsOpen', () => {
  it("garde le match du jour jusqu'à l'ouverture des portes", () => {
    expect(pickNextEventBeforeDoorsOpen(EVENTS, TZ, new Date('2026-09-26T10:00:00Z'))?.id).toBe('lyon');
  });

  it("passe au match suivant à l'ouverture des portes", () => {
    expect(pickNextEventBeforeDoorsOpen(EVENTS, TZ, new Date('2026-09-26T13:00:00Z'))?.id).toBe('montpellier');
  });

  it("sans heure d'ouverture des portes : jusqu'à la fin de l'event", () => {
    const e = ev('sans-heure', '2026-09-26', null, '23:00');
    expect(resolvePreEventDeadline(e, TZ).toISOString()).toBe('2026-09-26T21:00:00.000Z');
  });

  it('aucun match à venir : null', () => {
    expect(pickNextEventBeforeDoorsOpen(EVENTS, TZ, new Date('2026-12-01T00:00:00Z'))).toBeNull();
  });
});
