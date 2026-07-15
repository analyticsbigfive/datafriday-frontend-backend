import { parseEventSessions } from '@/utils/eventSessions';

describe('parseEventSessions — sessions sérialisées /events', () => {
  it("string JSON d'un array d'objets → array d'objets", () => {
    const raw = '[{"doorsOpening":"18:00","showTime":"20:00"}]';
    expect(parseEventSessions(raw)).toEqual([
      { doorsOpening: '18:00', showTime: '20:00' },
    ]);
  });

  it("array de strings JSON (chaque session stringifiée) → array d'objets", () => {
    const raw = ['{"showTime":"20:00"}', '{"showTime":"14:30"}'];
    expect(parseEventSessions(raw)).toEqual([
      { showTime: '20:00' },
      { showTime: '14:30' },
    ]);
  });

  it("array d'objets déjà parsé → inchangé (idempotent)", () => {
    const raw = [{ showTime: '19:00' }];
    expect(parseEventSessions(raw)).toEqual([{ showTime: '19:00' }]);
  });

  it('valeurs vides / illisibles → []', () => {
    expect(parseEventSessions(null)).toEqual([]);
    expect(parseEventSessions(undefined)).toEqual([]);
    expect(parseEventSessions('')).toEqual([]);
    expect(parseEventSessions('not json')).toEqual([]);
    expect(parseEventSessions('{"showTime":"20:00"}')).toEqual([]); // objet, pas array
    expect(parseEventSessions(42)).toEqual([]);
  });

  it('éléments non-objets filtrés (strings illisibles, nulls, arrays)', () => {
    const raw = ['garbage', null, '["nested"]', '{"showTime":"21:00"}'];
    expect(parseEventSessions(raw)).toEqual([{ showTime: '21:00' }]);
  });
});
