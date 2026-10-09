import { MINUTE_LOCAL_PATTERN, rowsSinceMinute } from './live-delta.util';

describe('rowsSinceMinute', () => {
  const byEvent = {
    ev1: [
      { minuteLocal: '2026-10-10T19:58', q: 1 },
      { minuteLocal: '2026-10-10T19:59', q: 2 },
      { minuteLocal: '2026-10-10T20:00', q: 3 },
      { minuteLocal: null, q: 4 },
    ],
    ev2: [],
  };

  it('sans since : tout est renvoyé tel quel', () => {
    expect(rowsSinceMinute(byEvent, undefined)).toBe(byEvent);
  });

  it('garde les minutes >= since, y compris en franchissant une heure', () => {
    const out = rowsSinceMinute(byEvent, '2026-10-10T19:59');
    expect(out.ev1.map((r) => r.q)).toEqual([2, 3, 4]);
    expect(out.ev2).toEqual([]);
  });

  it('ordonne correctement un event qui franchit minuit', () => {
    const out = rowsSinceMinute(
      { ev: [{ minuteLocal: '2026-10-10T23:59' }, { minuteLocal: '2026-10-11T00:01' }] },
      '2026-10-11T00:00',
    );
    expect(out.ev).toEqual([{ minuteLocal: '2026-10-11T00:01' }]);
  });

  it('format de since attendu', () => {
    expect(MINUTE_LOCAL_PATTERN.test('2026-10-10T19:59')).toBe(true);
    expect(MINUTE_LOCAL_PATTERN.test('2026-10-10 19:59')).toBe(false);
    expect(MINUTE_LOCAL_PATTERN.test("2026-10-10T19:59'; DROP")).toBe(false);
  });
});
