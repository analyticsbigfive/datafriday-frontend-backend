import { computeEventSalesWindow, SalesWindowEventInput } from './event-window.util';

// BUG-339-02/03 : fenêtre de vente d'un event — heure de fin réelle, tranche de tête rendue
// au voisin qui finit le jour du début, gardes fenêtre vide / event-conteneur. Cas repris du
// describe « resolveEventSalesScope — fenêtres à l'heure de fin réelle » (spaces.service.spec.ts),
// ici au niveau de la fonction pure partagée avec logistics/inventory.
describe('computeEventSalesWindow', () => {
  const TZ = 'Europe/Paris'; // en février, UTC+1 → "03:00" local = 02:00Z

  const pfc: SalesWindowEventInput = {
    id: 'ev-pfc',
    eventDate: new Date('2026-02-14T00:00:00.000Z'),
    eventEndDate: new Date('2026-02-15T00:00:00.000Z'),
    eventEndTime: '03:00',
    sessions: null,
  };
  const sfp: SalesWindowEventInput = {
    id: 'ev-sfp',
    eventDate: new Date('2026-02-15T00:00:00.000Z'),
    eventEndDate: new Date('2026-02-16T00:00:00.000Z'),
    eventEndTime: '04:00',
    sessions: null,
  };
  const all = [pfc, sfp];

  it('resserre la fin de fenêtre sur eventEndTime (PFC : 14/02 minuit → 15/02 03:00 Paris)', () => {
    const w = computeEventSalesWindow(pfc, all, TZ);
    expect(w?.windowStart.toISOString()).toBe('2026-02-14T00:00:00.000Z');
    expect(w?.windowEnd.toISOString()).toBe('2026-02-15T02:00:00.000Z');
  });

  it('démarre l’event suivant à l’heure de fin du précédent, pas à minuit (SFP)', () => {
    const w = computeEventSalesWindow(sfp, all, TZ);
    expect(w?.windowStart.toISOString()).toBe('2026-02-15T02:00:00.000Z');
    expect(w?.windowEnd.toISOString()).toBe('2026-02-16T03:00:00.000Z');
    // Aucun chevauchement avec PFC : c'était le double comptage du bug.
    const wPfc = computeEventSalesWindow(pfc, all, TZ);
    expect(wPfc!.windowEnd.getTime()).toBeLessThanOrEqual(w!.windowStart.getTime());
  });

  it('sans eventEndTime ni sessions : repli historique jour calendaire entier (+1 jour)', () => {
    const w = computeEventSalesWindow(
      { id: 'ev-1', eventDate: new Date('2026-03-01T00:00:00.000Z'), eventEndDate: null, eventEndTime: null, sessions: null },
      [],
      TZ,
    );
    expect(w?.windowStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(w?.windowEnd.toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });

  it('repli sur le showTime de la dernière session quand eventEndTime est absent', () => {
    const w = computeEventSalesWindow(
      {
        id: 'ev-1',
        eventDate: new Date('2026-02-14T00:00:00.000Z'),
        eventEndDate: null,
        eventEndTime: null,
        sessions: JSON.stringify([{ doorsOpening: '19:00', showTime: '21:00' }]),
      },
      [],
      TZ,
    );
    expect(w?.windowEnd.toISOString()).toBe('2026-02-14T20:00:00.000Z'); // 21:00 Paris = 20:00Z
  });

  it('deux events le même jour : le second démarre à la fin du premier, le premier garde minuit', () => {
    const e1: SalesWindowEventInput = {
      id: 'ev-apresmidi',
      eventDate: new Date('2026-02-14T00:00:00.000Z'),
      eventEndDate: null,
      eventEndTime: '18:00', // 17:00Z
      sessions: null,
    };
    const e2: SalesWindowEventInput = {
      id: 'ev-soir',
      eventDate: new Date('2026-02-14T00:00:00.000Z'),
      eventEndDate: null,
      eventEndTime: '23:00', // 22:00Z
      sessions: null,
    };
    const pair = [e1, e2];
    // Le voisin du soir finit APRÈS l'event de l'après-midi → ne doit pas vider sa fenêtre.
    const w1 = computeEventSalesWindow(e1, pair, TZ);
    expect(w1?.windowStart.toISOString()).toBe('2026-02-14T00:00:00.000Z');
    expect(w1?.windowEnd.toISOString()).toBe('2026-02-14T17:00:00.000Z');
    const w2 = computeEventSalesWindow(e2, pair, TZ);
    expect(w2?.windowStart.toISOString()).toBe('2026-02-14T17:00:00.000Z');
    expect(w2?.windowEnd.toISOString()).toBe('2026-02-14T22:00:00.000Z');
  });

  it('voisin sans heure de fin connue : pas d’exclusion (comportement historique)', () => {
    const noEnd: SalesWindowEventInput = {
      id: 'ev-prev',
      eventDate: new Date('2026-02-14T00:00:00.000Z'),
      eventEndDate: new Date('2026-02-15T00:00:00.000Z'),
      eventEndTime: null,
      sessions: null,
    };
    const w = computeEventSalesWindow(sfp, [noEnd, sfp], TZ);
    expect(w?.windowStart.toISOString()).toBe('2026-02-15T00:00:00.000Z');
  });

  it('event-conteneur (span > 2 jours) : null', () => {
    const season: SalesWindowEventInput = {
      id: 'ev-saison',
      eventDate: new Date('2026-07-01T00:00:00.000Z'),
      eventEndDate: new Date('2027-06-01T00:00:00.000Z'),
      eventEndTime: null,
      sessions: null,
    };
    expect(computeEventSalesWindow(season, [season], TZ)).toBeNull();
  });

  it('fenêtre vide (voisin finissant ce jour-là après la fin de l’event, event plus court) : null', () => {
    // Voisin finit le 15/02 à 03:00 ; l'event du 15/02 finit à 02:00 → sa fenêtre serait
    // [03:00, 02:00[ … mais le voisin finissant APRÈS windowEnd est ignoré (garde
    // neighborEnd >= windowEnd) → fenêtre pleine conservée.
    const shortEvent: SalesWindowEventInput = {
      id: 'ev-court',
      eventDate: new Date('2026-02-15T00:00:00.000Z'),
      eventEndDate: null,
      eventEndTime: '02:00', // 01:00Z
      sessions: null,
    };
    const w = computeEventSalesWindow(shortEvent, [pfc, shortEvent], TZ);
    expect(w?.windowStart.toISOString()).toBe('2026-02-15T00:00:00.000Z');
    expect(w?.windowEnd.toISOString()).toBe('2026-02-15T01:00:00.000Z');
  });
});
