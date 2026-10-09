import { InventoryWindowLifecycleCronService } from './inventory-window-lifecycle.cron';
import { passthroughTenantContext } from '../../../core/tenant/tenant-context.testing';

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
      guestPinAccess: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      event: { findMany: jest.fn().mockResolvedValue(events) },
    };
    const guestPin = { closeWindowRecord: jest.fn().mockResolvedValue({ ok: true }) };
    const cron = new InventoryWindowLifecycleCronService(prisma as any, guestPin as any, passthroughTenantContext());
    return { cron, guestPin, prisma };
  };

  // Situation réelle de Jean Bouin le 26/09 à 16:15 Paris (14:15 UTC).
  const now = new Date('2026-09-26T14:15:00Z');
  const events = [
    event('pfc-lyon', '2026-09-12', '19:00', '23:50'),
    event('pfc-strasbourg', '2026-09-19', '15:15', '23:50'),
    event('sfp-lyon', '2026-09-26', '15:00', '23:00'),
    event('sfp-montpellier', '2026-10-10', '13:00', '23:50'),
  ];

  it('clôture les fenêtres pre-event oubliées des matchs passés, sans push Logistic', async () => {
    const { cron, guestPin, prisma } = setup([window('w-pre-12', 'pfc-lyon', 'pre-event')], events);
    await expect(cron.closeExpiredWindows(now)).resolves.toBe(1);
    expect(guestPin.closeWindowRecord.mock.calls[0][2]).toEqual({ pushToLogistic: false, reason: 'period-end' });
    // Le post-event n'est jamais lu : il est clôturé par l'utilisateur.
    expect(prisma.inventoryWindow.findMany).toHaveBeenCalledWith({
      where: { phase: { in: ['pre-event', 'ventilation'] }, OR: [{ status: 'open' }, { guestAccesses: { some: { status: 'active' } } }] },
    });
  });

  it('laisse ouvert le pre-event du match suivant', async () => {
    const { cron, guestPin } = setup([window('w-pre-10', 'sfp-montpellier', 'pre-event')], events);
    await expect(cron.closeExpiredWindows(now)).resolves.toBe(0);
    expect(guestPin.closeWindowRecord).not.toHaveBeenCalled();
  });

  it("ferme le pre-event du match du jour à la fin de l'event, plus aux portes (Bertrand 2026-10-07)", async () => {
    const { cron, guestPin } = setup([window('w-pre-26', 'sfp-lyon', 'pre-event')], events);
    // Portes 15:00 Paris (13:00Z) passées : toujours ouvert.
    await cron.closeExpiredWindows(new Date('2026-09-26T13:00:00Z'));
    await cron.closeExpiredWindows(new Date('2026-09-26T20:59:00Z'));
    expect(guestPin.closeWindowRecord).not.toHaveBeenCalled();
    // Fin 23:00 Paris (21:00Z).
    await cron.closeExpiredWindows(new Date('2026-09-26T21:00:00Z'));
    expect(guestPin.closeWindowRecord.mock.calls[0][2]).toEqual({ pushToLogistic: false, reason: 'period-end' });
  });

  it('ventilation sur plusieurs matchs : ouverte jusqu’à la fin du dernier match rattaché', async () => {
    const ventilation = { ...window('w-vent', 'sfp-lyon', 'ventilation'), linkedEventIds: ['sfp-montpellier'] };
    const { cron, guestPin, prisma } = setup([ventilation], events);
    // Fin de sfp-lyon passée, sfp-montpellier à venir : l'accès reste ouvert.
    await expect(cron.closeExpiredWindows(new Date('2026-09-26T21:30:00Z'))).resolves.toBe(0);
    expect(guestPin.closeWindowRecord).not.toHaveBeenCalled();
    expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['sfp-lyon', 'sfp-montpellier'] } });
    // Après la fin de sfp-montpellier (23:50 Paris le 10/10 = 21:50Z).
    await expect(cron.closeExpiredWindows(new Date('2026-10-10T21:50:00Z'))).resolves.toBe(1);
  });

  it("fin de l'event : les PDV rouverts un par un sur une fenêtre arrêtée sont coupés", async () => {
    const closed = { ...window('w-pre-26', 'sfp-lyon', 'pre-event'), status: 'closed' };
    const { cron, guestPin, prisma } = setup([closed], events);
    await expect(cron.closeExpiredWindows(new Date('2026-09-26T21:00:00Z'))).resolves.toBe(1);
    expect(guestPin.closeWindowRecord).not.toHaveBeenCalled();
    expect(prisma.guestPinAccess.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { windowId: { in: ['w-pre-26'] }, status: 'active' } }),
    );
  });

  it("clôture une fenêtre pre-event dont l'event a disparu", async () => {
    const { cron, guestPin } = setup([window('w-orphan', 'deleted', 'pre-event')], events);
    await cron.closeExpiredWindows(now);
    expect(guestPin.closeWindowRecord).toHaveBeenCalledTimes(1);
  });
});
