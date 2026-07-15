import {
  isAdhocEvent,
  findAndScorePastEvents,
  findAndScorePastEventsWithTrace,
  generatePredictionsForEvent,
} from '@/utils/predictiveAnalytics';

const mkEvent = (id, name, extra = {}) => ({
  id,
  eventName: name,
  eventDate: '15/03/2025',
  eventType: 'Concert',
  category: 'Musique',
  attendance: 1000,
  ...extra,
});

const target = mkEvent('target', 'Concert cible', { eventDate: '20/12/2026' });
const normal = mkEvent('past-1', 'Concert normal');
const adhoc = mkEvent('adhoc-1', 'Transactions Adhoc');

const granular = [
  { eventId: 'past-1', isPredictive: false, revenue: 100, shopId: 's1', shopName: 'Bar' },
  { eventId: 'adhoc-1', isPredictive: false, revenue: 100, shopId: 's1', shopName: 'Bar' },
];

describe('exclusion des événements ad hoc', () => {
  it('isAdhocEvent détecte les variantes de nom', () => {
    expect(isAdhocEvent({ eventName: 'Transactions Adhoc' })).toBe(true);
    expect(isAdhocEvent({ eventName: 'Transaction Ad hoc' })).toBe(true);
    expect(isAdhocEvent({ name: 'ventes ad-hoc' })).toBe(true);
    expect(isAdhocEvent({ eventName: 'Concert normal' })).toBe(false);
    expect(isAdhocEvent(null)).toBe(false);
  });

  it('findAndScorePastEvents exclut les ad hoc des candidats auto', () => {
    const scored = findAndScorePastEvents(target, [target, normal, adhoc], granular);
    const ids = scored.map((s) => s.event.id);
    expect(ids).toContain('past-1');
    expect(ids).not.toContain('adhoc-1');
  });

  it('allowIds réadmet un ad hoc sélectionné à la main', () => {
    const scored = findAndScorePastEvents(target, [target, normal, adhoc], granular, {
      allowIds: new Set(['adhoc-1']),
    });
    expect(scored.map((s) => s.event.id)).toContain('adhoc-1');
  });

  it('la trace debug reste équivalente et annote le gate adhoc', () => {
    const trace = findAndScorePastEventsWithTrace(target, [target, normal, adhoc], granular);
    const prod = findAndScorePastEvents(target, [target, normal, adhoc], granular);
    expect(trace.included.map((s) => s.event.id)).toEqual(prod.map((s) => s.event.id));
    const gate = trace.excluded.find((x) => x.event.id === 'adhoc-1');
    expect(gate?.gate).toBe('adhoc');
  });

  it('generatePredictionsForEvent : ad hoc hors CA auto, inclus si forcé', () => {
    const auto = generatePredictionsForEvent(target, [normal, adhoc], granular);
    expect(auto.every((r) => r.eventId !== 'adhoc-1')).toBe(true);
    const forced = generatePredictionsForEvent(target, [normal, adhoc], granular, ['adhoc-1']);
    expect(forced.length).toBeGreaterThan(0);
  });
});
