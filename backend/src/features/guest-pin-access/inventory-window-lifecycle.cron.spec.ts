import { InventoryWindowLifecycleCronService } from './inventory-window-lifecycle.cron';

const event = (id: string, day: string, doors: string, end: string) => ({
  id,
  eventDate: new Date(`${day}T00:00:00.000Z`),
  eventStartDate: new Date(`${day}T00:00:00.000Z`),
  eventEndDate: new Date(`${day}T00:00:00.000Z`),
  eventEndTime: end,
  sessions: JSON.stringify([{ doorsOpening: doors }]),
  space: { timezone: 'Europe/Paris' },
});

const window = (id: string, eventId: string, phase: string) => ({
  id,
  eventId,
  phase,
  status: 'open',
  tenantId: 't1',
  spaceId: 's1',
});

describe('InventoryWindowLifecycleCronService', () => {
  const setup = (windows: any[], events: any[]) => {
    const prisma = {
      inventoryWindow: { findMany: jest.fn().mockResolvedValue(windows) },
      event: { findMany: jest.fn().mockResolvedValue(events) },
    };
    const guestPin = { closeWindowRecord: jest.fn().mockResolvedValue({ ok: true }) };
    const cron = new InventoryWindowLifecycleCronService(prisma as any, guestPin as any);
    return { cron, guestPin };
  };

  // Situation réelle de Jean Bouin le 26/09 à 16:15 Paris (14:15 UTC).
  const now = new Date('2026-09-26T14:15:00Z');
  const events = [
    event('pfc-lyon', '2026-09-12', '19:00', '23:50'),
    event('pfc-strasbourg', '2026-09-19', '15:15', '23:50'),
    event('sfp-lyon', '2026-09-26', '15:00', '23:00'),
    event('sfp-montpellier', '2026-10-10', '13:00', '23:50'),
  ];

  it('clôture les fenêtres oubliées des matchs passés, sans push Logistic', async () => {
    const { cron, guestPin } = setup(
      [window('w-pre-12', 'pfc-lyon', 'pre-event'), window('w-post-19', 'pfc-strasbourg', 'post-event')],
      events,
    );
    await expect(cron.closeExpiredWindows(now)).resolves.toBe(2);
    for (const call of guestPin.closeWindowRecord.mock.calls) {
      expect(call[2]).toEqual({ pushToLogistic: false, reason: 'period-end' });
    }
  });

  it('laisse ouverts le post-event du match en cours et le pre-event du match suivant', async () => {
    const { cron, guestPin } = setup(
      [window('w-post-26', 'sfp-lyon', 'post-event'), window('w-pre-10', 'sfp-montpellier', 'pre-event')],
      events,
    );
    await expect(cron.closeExpiredWindows(now)).resolves.toBe(0);
    expect(guestPin.closeWindowRecord).not.toHaveBeenCalled();
  });

  it("ferme le pre-event du match du jour à l'ouverture des portes", async () => {
    const { cron, guestPin } = setup([window('w-pre-26', 'sfp-lyon', 'pre-event')], events);
    await cron.closeExpiredWindows(new Date('2026-09-26T12:59:00Z'));
    expect(guestPin.closeWindowRecord).not.toHaveBeenCalled();
    await cron.closeExpiredWindows(new Date('2026-09-26T13:00:00Z'));
    expect(guestPin.closeWindowRecord.mock.calls[0][2]).toEqual({ pushToLogistic: false, reason: 'period-end' });
  });

  it("ferme le post-event à l'heure de fin et pousse vers Logistic", async () => {
    const { cron, guestPin } = setup([window('w-post-26', 'sfp-lyon', 'post-event')], events);
    await cron.closeExpiredWindows(new Date('2026-09-26T21:01:00Z'));
    expect(guestPin.closeWindowRecord.mock.calls[0][2]).toEqual({ pushToLogistic: true, reason: 'period-end' });
  });

  it('clôture sans push une fenêtre dont l\'event a disparu', async () => {
    const { cron, guestPin } = setup([window('w-orphan', 'deleted', 'post-event')], events);
    await cron.closeExpiredWindows(now);
    expect(guestPin.closeWindowRecord.mock.calls[0][2]).toEqual({ pushToLogistic: false, reason: 'period-end' });
  });
});
