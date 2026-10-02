import { createHash } from 'crypto';
import { VentilationAccessService } from './ventilation-access.service';

/** Accès PIN « Ventilation » des logisticiens (chantier logistic_ventilation, partie 3). */
describe('VentilationAccessService', () => {
  const space = { id: 'space-1', name: 'La Beaujoire', tenantId: 'tenant-1' };
  const guest = { id: 'acc-1', tenantId: 'tenant-1', spaceId: 'space-1', elementId: 'space-1', eventId: 'ev-1', phase: 'ventilation' } as any;
  let prisma: any;
  let guestPin: any;
  let logistics: any;
  let deposits: any;
  let service: VentilationAccessService;
  const DEVICE = 'device-abc';
  // Auteur attendu : accès + empreinte de l'appareil (sha256 tronqué).
  const actor = `guest-pin:acc-1:${createHash('sha256').update(DEVICE).digest('hex').slice(0, 16)}`;

  beforeEach(() => {
    prisma = {
      inventoryWindow: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      guestPinAccess: { upsert: jest.fn(), updateMany: jest.fn() },
      restockPlan: { findFirst: jest.fn() },
      event: { findFirst: jest.fn() },
      space: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      spaceElement: { findUnique: jest.fn().mockResolvedValue(null) },
      stockLevel: { findMany: jest.fn().mockResolvedValue([]) },
    };
    guestPin = {
      pinLoginRetryAfter: jest.fn().mockResolvedValue(null),
      recordPinLoginFailure: jest.fn().mockResolvedValue(7),
      findWindowByPin: jest.fn(),
      issueGuestToken: jest.fn().mockResolvedValue('jwt'),
      closeWindowRecord: jest.fn(),
      ensureWindowPin: jest.fn(),
      readWindowPin: jest.fn().mockReturnValue('123456'),
    };
    logistics = {
      createMovement: jest.fn().mockResolvedValue({ movement: { id: 'mv-1', createdBy: 'x' }, level: {} }),
    };
    deposits = {
      sumByEvent: jest.fn().mockResolvedValue([]),
      listByEvent: jest.fn().mockResolvedValue([]),
      packSizes: jest.fn().mockResolvedValue([]),
      resolveElementItemKey: jest.fn().mockResolvedValue('Coca-Cola CAN 33cl'),
      cancel: jest.fn().mockResolvedValue({}),
    };
    service = new VentilationAccessService(prisma, guestPin, guestPin, guestPin, logistics, deposits, {
      assertCanAccessSpace: jest.fn(),
    } as any);
  });

  describe('login', () => {
    it("répond « inactif » sans comparer le PIN quand aucun accès n'est ouvert", async () => {
      prisma.inventoryWindow.findFirst.mockResolvedValueOnce(null);
      await expect(service.login(space, '123456', undefined, '1.1.1.1')).resolves.toEqual({ state: 'inactive' });
      expect(guestPin.findWindowByPin).not.toHaveBeenCalled();
    });

    it('compte un échec sur un mauvais PIN', async () => {
      prisma.inventoryWindow.findFirst.mockResolvedValueOnce({ id: 'w-1' });
      guestPin.findWindowByPin.mockResolvedValueOnce(null);
      await expect(service.login(space, '000000', undefined, '1.1.1.1')).resolves.toEqual({ state: 'not_found', attemptsRemaining: 7 });
      expect(guestPin.findWindowByPin).toHaveBeenCalledWith('space-1', '000000', 'ventilation');
    });

    it("ouvre une session ventilation rattachée à l'espace", async () => {
      prisma.inventoryWindow.findFirst.mockResolvedValueOnce({ id: 'w-1' });
      guestPin.findWindowByPin.mockResolvedValueOnce({ id: 'w-1', tenantId: 'tenant-1', status: 'open', eventId: 'ev-1' });
      prisma.guestPinAccess.upsert.mockResolvedValueOnce({ id: 'acc-1', status: 'active' });
      const result = await service.login(space, '123456', 'device', '1.1.1.1');
      expect(result).toMatchObject({ state: 'ok', token: 'jwt', phase: 'ventilation', spaceId: 'space-1', elementId: 'space-1', eventId: 'ev-1' });
      expect(prisma.guestPinAccess.upsert.mock.calls[0][0].where).toEqual({
        uniq_guest_pin_access_per_element: { windowId: 'w-1', elementId: 'space-1' },
      });
    });
  });

  describe('session ventilation', () => {
    it("refuse la feuille à un jeton d'inventaire", async () => {
      await expect(service.getSheet({ ...guest, phase: 'pre-event' }, DEVICE)).rejects.toThrow('feuille de ventilation');
    });

    it("renvoie la feuille du match sans prix ni détail de recette, et seuls les dépôts de cet appareil sont annulables", async () => {
      prisma.restockPlan.findFirst.mockResolvedValueOnce({
        name: 'Nantes-Nancy',
        restockLines: [{ rowKey: 'r1', shopId: 'shop-1', itemName: 'Coca', restockQuantity: 24, sourceBreakdown: [{ name: 'x' }] }],
        lineOverrides: { r1: 12 },
        restockedRows: {},
      });
      prisma.event.findFirst.mockResolvedValueOnce({ name: 'Nantes-Nancy' });
      deposits.listByEvent.mockResolvedValueOnce([
        { id: 'mv-1', cancelled: false, createdBy: actor },
        { id: 'mv-2', cancelled: false, createdBy: 'guest-pin:acc-1:autreappareil00' },
      ]);
      deposits.packSizes.mockResolvedValueOnce([{ elementId: 'shop-1', itemName: 'Coca', unitsPerPack: 12 }]);
      const sheet = await service.getSheet(guest, DEVICE);
      expect(sheet.packSizes).toEqual([{ elementId: 'shop-1', itemName: 'Coca', unitsPerPack: 12 }]);
      expect(prisma.restockPlan.findFirst.mock.calls[0][0]).toMatchObject({
        where: { tenantId: 'tenant-1', spaceId: 'space-1', selectedEventIds: { has: 'ev-1' } },
        orderBy: { updatedAt: 'desc' },
      });
      expect(sheet.plan!.restockLines).toEqual([{ rowKey: 'r1', shopId: 'shop-1', itemName: 'Coca', restockQuantity: 24 }]);
      expect(sheet.movements.map((m: any) => [m.id, m.cancellable, m.createdBy])).toEqual([
        ['mv-1', true, undefined],
        ['mv-2', false, undefined],
      ]);
    });

    it('dépose sur la destination et l\'article lus dans la feuille, raison Ventilation', async () => {
      prisma.restockPlan.findFirst.mockResolvedValueOnce({ restockLines: [{ rowKey: 'r1', shopId: 'shop-1', itemName: 'Coca' }] });
      await expect(service.deposit(guest, { rowKey: 'r1', packed: 2, loose: 0, depositorName: ' Awa ' }, DEVICE)).resolves.toEqual({
        ok: true,
        movementId: 'mv-1',
      });
      expect(deposits.resolveElementItemKey).toHaveBeenCalledWith('space-1', 'shop-1', 'Coca', 'tenant-1');
      expect(logistics.createMovement).toHaveBeenCalledWith(
        {
          spaceId: 'space-1',
          elementId: 'shop-1',
          itemKey: 'Coca-Cola CAN 33cl',
          direction: 'add',
          packed: 2,
          loose: 0,
          reason: 'VENTILATION',
          eventId: 'ev-1',
          note: 'Awa',
        },
        'tenant-1',
        actor,
      );
    });

    it('refuse une ligne cochée « réarmé » ou corrigée à 0 depuis', async () => {
      prisma.restockPlan.findFirst.mockResolvedValueOnce({ restockLines: [{ rowKey: 'r1', shopId: 'shop-1' }], restockedRows: { r1: true } });
      await expect(service.deposit(guest, { rowKey: 'r1', packed: 1, loose: 0 }, DEVICE)).rejects.toThrow("n'est plus à déposer");
      prisma.restockPlan.findFirst.mockResolvedValueOnce({ restockLines: [{ rowKey: 'r1', shopId: 'shop-1' }], lineOverrides: { r1: 0 } });
      await expect(service.deposit(guest, { rowKey: 'r1', packed: 1, loose: 0 }, DEVICE)).rejects.toThrow("n'est plus à déposer");
      expect(logistics.createMovement).not.toHaveBeenCalled();
    });

    it('refuse une ligne absente de la feuille', async () => {
      prisma.restockPlan.findFirst.mockResolvedValueOnce({ restockLines: [] });
      await expect(service.deposit(guest, { rowKey: 'forged', packed: 1, loose: 0 }, DEVICE)).rejects.toThrow('ne figure pas');
      expect(logistics.createMovement).not.toHaveBeenCalled();
    });

    it("n'annule que les dépôts de cet appareil", async () => {
      await expect(service.cancel(guest, 'mv-1', DEVICE)).resolves.toEqual({ ok: true });
      expect(deposits.cancel).toHaveBeenCalledWith('mv-1', 'tenant-1', actor, { requireCreatedBy: actor });
    });
  });

  describe('ouverture depuis Logistique', () => {
    const user = { id: 'user-1', tenantId: 'tenant-1' } as any;
    const futureEvent = {
      id: 'ev-1',
      eventDate: new Date(Date.now() + 3 * 86400000),
      eventStartDate: null,
      eventEndDate: null,
      eventEndTime: null,
      sessions: null,
      space: { timezone: 'Europe/Paris' },
    };

    it('refuse un match terminé', async () => {
      prisma.event.findFirst.mockResolvedValueOnce({ ...futureEvent, eventDate: new Date('2026-01-01T00:00:00Z') });
      await expect(service.start({ spaceId: 'space-1', eventId: 'ev-1' }, user)).rejects.toThrow('terminé');
    });

    it("ferme l'accès d'un autre match, rouvre celui-ci et crée le QR une fois", async () => {
      prisma.event.findFirst.mockResolvedValueOnce(futureEvent);
      prisma.inventoryWindow.findMany.mockResolvedValueOnce([{ id: 'w-old' }]);
      prisma.inventoryWindow.upsert.mockResolvedValueOnce({ id: 'w-1' });
      prisma.space.findFirst.mockResolvedValueOnce({ name: 'La Beaujoire', ventilationSlug: null });
      prisma.inventoryWindow.findFirst.mockResolvedValueOnce({ id: 'w-1', eventId: 'ev-1', status: 'open', pinLookupHash: 'h' });
      const status = await service.start({ spaceId: 'space-1', eventId: 'ev-1' }, user);
      expect(guestPin.closeWindowRecord).toHaveBeenCalledWith({ id: 'w-old' }, 'user-1', { pushToLogistic: false, reason: 'superseded' });
      expect(prisma.guestPinAccess.updateMany).toHaveBeenCalledWith({
        where: { windowId: 'w-1', status: 'revoked' },
        data: { status: 'active', revokedAt: null, revokedBy: null },
      });
      expect(guestPin.ensureWindowPin).toHaveBeenCalled();
      expect(status.slug).toMatch(/^ventilation-la-beaujoire-[0-9a-f]{6}$/);
      expect(status.window).toMatchObject({ id: 'w-1', status: 'open', pin: '123456' });
    });
  });
});
