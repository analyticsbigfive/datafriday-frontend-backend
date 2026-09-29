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

    it('avant le début de la période (veille du match) : pas encore ouvrable', () => {
      const p = inventoryWindowPeriod(sfpLyon, 'pre-event', TZ, new Date('2026-09-25T22:00:00.000Z'));
      expect(inventoryWindowPeriodState(p, at('2026-09-25T20:00:00Z'))).toBe('not-yet');
      expect(inventoryWindowPeriodState(p, at('2026-09-25T22:00:00Z'))).toBe('open');
    });

    it("sans heure d'ouverture des portes : ouvert jusqu'à la fin de l'event", () => {
      const p = inventoryWindowPeriod({ ...sfpLyon, sessions: null }, 'pre-event', TZ);
      expect(p.closesAt.toISOString()).toBe('2026-09-26T21:00:00.000Z');
    });
  });

  describe('post-event', () => {
    const period = inventoryWindowPeriod(sfpLyon, 'post-event', TZ);

    it("s'ouvre à l'ouverture des portes, sans fermeture automatique", () => {
      expect(period.opensAt?.toISOString()).toBe('2026-09-26T13:00:00.000Z');
      expect(period.closesAt).toBeNull();
    });

    it("reste ouvert après la fin de l'event : c'est l'utilisateur qui clôture", () => {
      expect(inventoryWindowPeriodState(period, at('2026-09-26T12:59:00Z'))).toBe('not-yet');
      expect(inventoryWindowPeriodState(period, at('2026-09-26T14:15:00Z'))).toBe('open');
      expect(inventoryWindowPeriodState(period, at('2026-09-28T10:00:00Z'))).toBe('open');
    });

    it("sans heure d'ouverture des portes : dès minuit local le jour du match", () => {
      const p = inventoryWindowPeriod({ ...sfpLyon, sessions: '[]' }, 'post-event', TZ);
      expect(p.opensAt?.toISOString()).toBe('2026-09-25T22:00:00.000Z');
    });
  });
});
