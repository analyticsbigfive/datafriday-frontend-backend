import { resolveEventTransactionWindow, combineDayAndLocalTime, resolveDoorsOpenAt, EventDayFields } from './event-window.util';

const TZ = 'Europe/Paris';
const day = (iso: string) => new Date(iso);

const makeEvent = (overrides: Partial<EventDayFields> & { id: string }): EventDayFields => ({
  eventDate: day('2025-12-06T00:00:00Z'),
  eventStartDate: day('2025-12-06T00:00:00Z'),
  eventEndDate: day('2025-12-06T00:00:00Z'),
  eventEndTime: null,
  ...overrides,
});

describe('resolveEventTransactionWindow', () => {
  it('sans voisin : minuit local du jour de début → fin déclarée', () => {
    const event = makeEvent({ id: 'e1', eventEndTime: '23:00' });
    const { start, end } = resolveEventTransactionWindow(event, TZ, [event]);
    expect(start).toEqual(combineDayAndLocalTime(day('2025-12-06T00:00:00Z'), '00:00', TZ));
    expect(end).toEqual(combineDayAndLocalTime(day('2025-12-06T00:00:00Z'), '23:00', TZ));
  });

  it('sans fin déclarée : repli sur la journée calendaire pleine (minuit local suivant)', () => {
    const event = makeEvent({ id: 'e1', eventEndTime: null });
    const { start, end } = resolveEventTransactionWindow(event, TZ, [event]);
    expect(start).toEqual(combineDayAndLocalTime(day('2025-12-06T00:00:00Z'), '00:00', TZ));
    expect(end).toEqual(combineDayAndLocalTime(day('2025-12-07T00:00:00Z'), '00:00', TZ));
  });

  it("débordement légitime : un voisin qui COMMENCE la veille et finit après minuit borne le début de l'event du lendemain", () => {
    // PFC-RC Lens : 14/02 → finit 02:00 le 15/02. SFP-Toulouse : démarre le 15/02.
    const lens = makeEvent({
      id: 'lens',
      eventStartDate: day('2026-02-14T00:00:00Z'),
      eventEndDate: day('2026-02-15T00:00:00Z'),
      eventEndTime: '02:00',
    });
    const toulouse = makeEvent({
      id: 'toulouse',
      eventStartDate: day('2026-02-15T00:00:00Z'),
      eventEndDate: day('2026-02-15T00:00:00Z'),
      eventEndTime: '21:00',
    });
    const { start, end } = resolveEventTransactionWindow(toulouse, TZ, [lens, toulouse]);
    expect(start).toEqual(combineDayAndLocalTime(day('2026-02-15T00:00:00Z'), '02:00', TZ));
    expect(end).toEqual(combineDayAndLocalTime(day('2026-02-15T00:00:00Z'), '21:00', TZ));
  });

  it('BUG-371-02 : deux events du MÊME jour, chacun avec son PROPRE integrationId (double affiche, ex. Jean Bouin) ne se tronquent JAMAIS l\'un l\'autre — chacun garde minuit local comme début, quelle que soit sa propre heure de fin déclarée', () => {
    // SFP-Cardiff (fin 23:30) et PFC-Le Havre (fem) (fin 23:00), même jour, même space, mais
    // 2 intégrations DIFFÉRENTES — reproduction exacte du cas réel constaté en base (2026-08-25).
    const pfcLeHavre = makeEvent({ id: 'pfc-le-havre', eventEndTime: '23:00', integrationId: 'integration-pfc' });
    const sfpCardiff = makeEvent({ id: 'sfp-cardiff', eventEndTime: '23:30', integrationId: 'integration-sfp' });
    const neighbors = [pfcLeHavre, sfpCardiff];

    const windowSfp = resolveEventTransactionWindow(sfpCardiff, TZ, neighbors);
    const windowPfc = resolveEventTransactionWindow(pfcLeHavre, TZ, neighbors);

    const expectedMidnight = combineDayAndLocalTime(day('2025-12-06T00:00:00Z'), '00:00', TZ);
    // Avant le fix : le début de SFP-Cardiff était poussé à 22h00 (fin de PFC-Le Havre),
    // réduisant sa fenêtre réelle à 30 minutes et videant silencieusement son agrégation.
    expect(windowSfp.start).toEqual(expectedMidnight);
    expect(windowSfp.end).toEqual(combineDayAndLocalTime(day('2025-12-06T00:00:00Z'), '23:30', TZ));
    expect(windowPfc.start).toEqual(expectedMidnight);
    expect(windowPfc.end).toEqual(combineDayAndLocalTime(day('2025-12-06T00:00:00Z'), '23:00', TZ));
  });

  it('BUG-339-02 (legacy, préservé) : deux events du même jour SANS integrationId (données non disambiguïsées, ex. CSV Digifood partagé) — le second démarre bien à la fin du premier', () => {
    const apresMidi = makeEvent({ id: 'apres-midi', eventEndTime: '18:00' });
    const soir = makeEvent({ id: 'soir', eventEndTime: '23:00' });
    const neighbors = [apresMidi, soir];

    const windowApresMidi = resolveEventTransactionWindow(apresMidi, TZ, neighbors);
    const windowSoir = resolveEventTransactionWindow(soir, TZ, neighbors);

    const expectedMidnight = combineDayAndLocalTime(day('2025-12-06T00:00:00Z'), '00:00', TZ);
    const finApresMidi = combineDayAndLocalTime(day('2025-12-06T00:00:00Z'), '18:00', TZ);
    expect(windowApresMidi.start).toEqual(expectedMidnight);
    expect(windowApresMidi.end).toEqual(finApresMidi);
    // Le soir démarre à la fin de l'après-midi (pas minuit) : sans integrationId pour les
    // séparer, seul le découpage temporel évite le double comptage.
    expect(windowSoir.start).toEqual(finApresMidi);
    expect(windowSoir.end).toEqual(combineDayAndLocalTime(day('2025-12-06T00:00:00Z'), '23:00', TZ));
  });
});

describe('resolveDoorsOpenAt', () => {
  it("sessions.doorsOpening posée sur le jour de début, fuseau du space (heure d'hiver UTC+1)", () => {
    const event = makeEvent({ id: 'e1', sessions: [{ doorsOpening: '19:00', showTime: '21:00' }] });
    expect(resolveDoorsOpenAt(event, TZ)).toEqual(day('2025-12-06T18:00:00Z'));
  });

  it('plusieurs sessions : la plus tôt', () => {
    const event = makeEvent({ id: 'e1', sessions: [{ doorsOpening: '19:00' }, { doorsOpening: '12:30' }] });
    expect(resolveDoorsOpenAt(event, TZ)).toEqual(day('2025-12-06T11:30:00Z'));
  });

  it('sessions sérialisées, y compris double-encodées (string JSON par élément)', () => {
    expect(resolveDoorsOpenAt(makeEvent({ id: 'e1', sessions: '[{"doorsOpening":"12:00"}]' }), TZ)).toEqual(day('2025-12-06T11:00:00Z'));
    expect(
      resolveDoorsOpenAt(makeEvent({ id: 'e1', sessions: '["{\\"doorsOpening\\":\\"12:00\\",\\"showTime\\":\\"14:00\\"}"]' }), TZ),
    ).toEqual(day('2025-12-06T11:00:00Z'));
  });

  it("sans heure : null, JAMAIS minuit (eventDate/eventStartDate sont des jours, pas des heures)", () => {
    expect(resolveDoorsOpenAt(makeEvent({ id: 'e1' }), TZ)).toBeNull();
    expect(resolveDoorsOpenAt(makeEvent({ id: 'e1', sessions: null }), TZ)).toBeNull();
    expect(resolveDoorsOpenAt(makeEvent({ id: 'e1', sessions: '[]' }), TZ)).toBeNull();
    expect(resolveDoorsOpenAt(makeEvent({ id: 'e1', sessions: [{ doorsOpening: '' }] }), TZ)).toBeNull();
    expect(resolveDoorsOpenAt(makeEvent({ id: 'e1', sessions: [{ showTime: '21:00' }] }), TZ)).toBeNull();
    expect(resolveDoorsOpenAt(makeEvent({ id: 'e1', sessions: 'pas du json' }), TZ)).toBeNull();
  });
});
