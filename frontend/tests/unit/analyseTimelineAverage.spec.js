import {
  computeAverageAlignment,
  alignAndScaleRecords,
} from '@/composables/analyseTimelineAverage';

const min = (h, m) => h * 60 + m;

describe('computeAverageAlignment — ancre et offsets (parité EventPredict)', () => {
  it("ancre = event le plus récent AVEC coup d'envoi ; offsets = ancre − showTime", () => {
    const events = [
      { id: 'a', showTime: '18:30', eventDate: '10/01/2026' },
      { id: 'b', showTime: '20:00', eventDate: '15/03/2026' }, // plus récent → ancre
      { id: 'c', showTime: '19:00', eventDate: '01/02/2026' },
    ];
    const r = computeAverageAlignment(events);
    expect(r.anchorEventId).toBe('b');
    expect(r.anchorMinutes).toBe(min(20, 0));
    expect(r.offsets.get('a')).toBe(min(20, 0) - min(18, 30)); // +90
    expect(r.offsets.get('b')).toBe(0);
    expect(r.offsets.get('c')).toBe(min(20, 0) - min(19, 0)); // +60
    expect(r.keptIds.sort()).toEqual(['a', 'b', 'c']);
    expect(r.skippedIds).toEqual([]);
  });

  it("event sans showTime → skippé, hors offsets et hors dénominateur", () => {
    const events = [
      { id: 'a', showTime: '20:00', eventDate: '15/03/2026' },
      { id: 'b', showTime: null, eventDate: '20/03/2026' }, // plus récent mais NON alignable
      { id: 'c', showTime: 'n/a', eventDate: '01/02/2026' }, // illisible
    ];
    const r = computeAverageAlignment(events);
    expect(r.anchorEventId).toBe('a'); // l'ancre doit être ALIGNABLE
    expect(r.keptIds).toEqual(['a']);
    expect(r.skippedIds.sort()).toEqual(['b', 'c']);
    expect(r.offsets.has('b')).toBe(false);
  });

  it('aucun showTime exploitable → keptIds vide (déclencheur du repli legacy)', () => {
    const events = [
      { id: 'a', eventDate: '10/01/2026' },
      { id: 'b', showTime: '', eventDate: '15/03/2026' },
    ];
    const r = computeAverageAlignment(events);
    expect(r.anchorEventId).toBeNull();
    expect(r.keptIds).toEqual([]);
    expect(r.skippedIds.sort()).toEqual(['a', 'b']);
  });

  it('égalité de dates → départage déterministe par id', () => {
    const events = [
      { id: 'zz', showTime: '21:00', eventDate: '15/03/2026' },
      { id: 'aa', showTime: '20:00', eventDate: '15/03/2026' },
    ];
    const r = computeAverageAlignment(events);
    expect(r.anchorEventId).toBe('aa'); // localeCompare croissant sur id
    expect(r.anchorMinutes).toBe(min(20, 0));
  });

  it('accepte les dates ISO (champ date) en fallback de eventDate', () => {
    const events = [
      { id: 'a', showTime: '18:00', date: '2026-01-10' },
      { id: 'b', showTime: '20:00', date: '2026-03-15' },
    ];
    const r = computeAverageAlignment(events);
    expect(r.anchorEventId).toBe('b');
  });

  it('repli sur sessions[0].showTime quand root showTime absent (sessions objet OU string JSON)', () => {
    // Reproduit le bug racine : /events renvoie sessions sérialisé, sans root showTime.
    const events = [
      { id: 'a', sessions: [{ showTime: '18:30' }], eventDate: '10/01/2026' },
      { id: 'b', sessions: '[{"showTime":"20:00"}]', eventDate: '15/03/2026' }, // string JSON
    ];
    const r = computeAverageAlignment(events);
    expect(r.anchorEventId).toBe('b');
    expect(r.anchorMinutes).toBe(min(20, 0));
    expect(r.keptIds.sort()).toEqual(['a', 'b']);
    expect(r.offsets.get('a')).toBe(min(20, 0) - min(18, 30)); // +90
  });
});

describe('alignAndScaleRecords — recalage + moyenne simple 1/K', () => {
  it('ancre 20:00, passé 18:30 → vente 18:45 recalée à 20:15 (offset +90)', () => {
    const out = alignAndScaleRecords(
      [{ minute: '18:45', totalRevenue: 30 }],
      min(20, 0) - min(18, 30),
      3,
      { eventId: 'e1' },
    );
    expect(out).toHaveLength(1);
    expect(out[0].minute).toBe('20:15');
    expect(out[0].totalRevenue).toBe(10); // ÷3
    expect(out[0].eventId).toBe('e1');
  });

  it('scaling ÷K sur champs canoniques ET alias bruts (revenue/quantity/transactions)', () => {
    const out = alignAndScaleRecords(
      [{ minute: '12:00', revenue: 30, quantity: 9, transactions: 6 }],
      0,
      3,
    );
    expect(out[0].totalRevenue).toBe(10);
    expect(out[0].totalQuantity).toBe(3);
    expect(out[0].transactionCount).toBe(2);
  });

  it('totalCost scalé uniquement si présent', () => {
    const withCost = alignAndScaleRecords([{ minute: '12:00', totalCost: 12 }], 0, 4);
    expect(withCost[0].totalCost).toBe(3);
    const noCost = alignAndScaleRecords([{ minute: '12:00', totalRevenue: 8 }], 0, 4);
    expect(noCost[0].totalCost).toBeUndefined();
  });

  it('minute illisible → record droppé (pas de coercition à 00:00)', () => {
    const out = alignAndScaleRecords(
      [{ minute: 'bogus', totalRevenue: 10 }, { minute: '10:00', totalRevenue: 10 }],
      0,
      2,
    );
    expect(out).toHaveLength(1);
    expect(out[0].minute).toBe('10:00');
  });

  it('minute ISO acceptée (heure lue sans conversion TZ)', () => {
    const out = alignAndScaleRecords(
      [{ minute: '2026-03-15T18:45:00.000Z', totalQuantity: 4 }],
      min(20, 0) - min(18, 30),
      2,
    );
    expect(out[0].minute).toBe('20:15');
    expect(out[0].totalQuantity).toBe(2);
  });

  it('wrap minuit (smoke — modulo délégué à alignPastMinute déjà testé)', () => {
    const out = alignAndScaleRecords(
      [{ minute: '23:00', totalRevenue: 2 }],
      min(23, 30) - min(20, 0), // +210
      1,
    );
    expect(out[0].minute).toBe('02:30');
  });

  it('showTimes identiques → offset 0, minutes inchangées, valeurs ÷K', () => {
    const out = alignAndScaleRecords(
      [{ minute: '19:10', totalRevenue: 21 }],
      0,
      3,
    );
    expect(out[0].minute).toBe('19:10');
    expect(out[0].totalRevenue).toBe(7);
  });
});
