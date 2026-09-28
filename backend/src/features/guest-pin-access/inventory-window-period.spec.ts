import { inventoryWindowPeriod, inventoryWindowPeriodState } from './inventory-window-period';

// SFP-Lyon, Stade Jean Bouin, 26/09/2026 (incident) : portes 15:00, fin 23:00, Paris (UTC+2).
const sfpLyon = {
  eventDate: new Date('2026-09-26T00:00:00.000Z'),
  eventStartDate: new Date('2026-09-26T00:00:00.000Z'),
  eventEndDate: new Date('2026-09-26T00:00:00.000Z'),
  eventEndTime: '23:00',
  sessions: '[{"doorsOpening":"15:00","showTime":"16:35"}]',
};
const TZ = 'Europe/Paris';
const at = (iso: string) => new Date(iso);

describe('inventoryWindowPeriod', () => {
  describe('pre-event', () => {
    const period = inventoryWindowPeriod(sfpLyon, 'pre-event', TZ);

    it("se ferme à l'ouverture des portes (15:00 Paris = 13:00 UTC)", () => {
      expect(period.opensAt).toBeNull();
      expect(period.closesAt.toISOString()).toBe('2026-09-26T13:00:00.000Z');
    });

    it('reste ouvert le matin du match (eventDate à minuit déjà passé)', () => {
      expect(inventoryWindowPeriodState(period, at('2026-09-26T09:00:00Z'))).toBe('open');
      expect(inventoryWindowPeriodState(period, at('2026-09-20T09:00:00Z'))).toBe('open');
    });

    it("est terminé dès l'ouverture des portes", () => {
      expect(inventoryWindowPeriodState(period, at('2026-09-26T13:00:00Z'))).toBe('over');
    });

    it("sans heure d'ouverture des portes : ouvert jusqu'à la fin de l'event", () => {
      const p = inventoryWindowPeriod({ ...sfpLyon, sessions: null }, 'pre-event', TZ);
      expect(p.closesAt.toISOString()).toBe('2026-09-26T21:00:00.000Z');
    });
  });

  describe('post-event', () => {
    const period = inventoryWindowPeriod(sfpLyon, 'post-event', TZ);

    it("s'ouvre à l'ouverture des portes et se ferme à l'heure de fin", () => {
      expect(period.opensAt?.toISOString()).toBe('2026-09-26T13:00:00.000Z');
      expect(period.closesAt.toISOString()).toBe('2026-09-26T21:00:00.000Z');
    });

    it('états avant / pendant / après', () => {
      expect(inventoryWindowPeriodState(period, at('2026-09-26T12:59:00Z'))).toBe('not-yet');
      expect(inventoryWindowPeriodState(period, at('2026-09-26T14:15:00Z'))).toBe('open');
      expect(inventoryWindowPeriodState(period, at('2026-09-26T21:00:00Z'))).toBe('over');
    });

    it('fin après minuit (SFP-Vannes, fin 03:00 le lendemain)', () => {
      const p = inventoryWindowPeriod(
        {
          eventDate: new Date('2026-11-28T00:00:00.000Z'),
          eventEndDate: new Date('2026-11-29T00:00:00.000Z'),
          eventEndTime: '03:00',
          sessions: '[{"doorsOpening":"19:00"}]',
        },
        'post-event',
        TZ,
      );
      expect(p.opensAt?.toISOString()).toBe('2026-11-28T18:00:00.000Z');
      expect(p.closesAt.toISOString()).toBe('2026-11-29T02:00:00.000Z');
    });

    it("sans heure d'ouverture des portes : dès minuit local le jour du match", () => {
      const p = inventoryWindowPeriod({ ...sfpLyon, sessions: '[]' }, 'post-event', TZ);
      expect(p.opensAt?.toISOString()).toBe('2026-09-25T22:00:00.000Z');
    });
  });
});
