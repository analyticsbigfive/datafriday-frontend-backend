import { pickNextEventBeforeDoorsOpen, resolvePreEventDeadline, resolvePreEventStart } from './event-window.util';

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

describe('resolvePreEventStart', () => {
  const lyon = ev('lyon', '2026-09-26', '15:00', '23:00');

  it('minuit local le jour du match', () => {
    expect(resolvePreEventStart(lyon, TZ, []).toISOString()).toBe('2026-09-25T22:00:00.000Z');
  });

  it('fin du match précédent quand il finit après minuit, même club différent (stock physique)', () => {
    const veille = {
      id: 'veille',
      eventDate: new Date('2026-09-25T00:00:00.000Z'),
      eventEndDate: new Date('2026-09-26T00:00:00.000Z'),
      eventEndTime: '02:00',
      integrationId: 'autre-club',
    };
    expect(resolvePreEventStart({ ...lyon, integrationId: 'sfp' }, TZ, [veille]).toISOString()).toBe(
      '2026-09-26T00:00:00.000Z',
    );
  });

  it("un autre event du même jour qui finit après l'ouverture des portes ne décale pas le début", () => {
    const memeJour = ev('meme-jour', '2026-09-26', '19:00', '23:30');
    expect(resolvePreEventStart(lyon, TZ, [memeJour]).toISOString()).toBe('2026-09-25T22:00:00.000Z');
  });
});
