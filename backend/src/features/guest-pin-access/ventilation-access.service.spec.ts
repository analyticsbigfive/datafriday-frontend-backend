import { createHash } from 'crypto';
import { VentilationAccessService, ventilationSelectionKey } from './ventilation-access.service';

/** Accès PIN « Ventilation » des logisticiens (chantier logistic_ventilation, partie 3). */
describe('VentilationAccessService', () => {
  const space = { id: 'space-1', name: 'La Beaujoire', tenantId: 'tenant-1' };
  const guest = { id: 'acc-1', tenantId: 'tenant-1', spaceId: 'space-1', elementId: 'space-1', eventId: 'ev-1', phase: 'ventilation' } as any;
  let prisma: any;
  let guestPin: any;
  let logistics: any;
  let deposits: any;
  let ventilationEvents: any;
  let service: VentilationAccessService;
  const DEVICE = 'device-abc';
  // Auteur attendu : accès + empreinte de l'appareil (sha256 tronqué).
  const actor = `guest-pin:acc-1:${createHash('sha256').update(DEVICE).digest('hex').slice(0, 16)}`;

  beforeEach(() => {
    prisma = {
      inventoryWindow: {
        findFirst: jest.fn().mockResolvedValue({ eventId: 'ev-1', linkedEventIds: [] }),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      guestPinAccess: { upsert: jest.fn(), updateMany: jest.fn() },
      restockPlan: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
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
      sumByEvents: jest.fn().mockResolvedValue([]),
      listByEvents: jest.fn().mockResolvedValue([]),
      packSizes: jest.fn().mockResolvedValue([]),
      resolveElementItemKey: jest.fn().mockResolvedValue('Coca-Cola CAN 33cl'),
      cancel: jest.fn().mockResolvedValue({}),
      storagesOfConfigs: jest.fn().mockResolvedValue([]),
    };
    ventilationEvents = {
      orderedEvents: jest.fn().mockResolvedValue([{ id: 'ev-1', name: 'Nantes-Nancy', configurationId: 'cfg-l2' }]),
    };
    service = new VentilationAccessService(
      prisma,
      guestPin,
      guestPin,
      guestPin,
      logistics,
      deposits,
      { assertCanAccessSpace: jest.fn() } as any,
      ventilationEvents,
    );
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

    it("renvoie les feuilles des matchs de l'accès sans prix ni détail de recette, et seuls les dépôts de cet appareil sont annulables", async () => {
      prisma.restockPlan.findMany.mockResolvedValueOnce([
        {
          id: 'p1',
          name: 'Nantes-Nancy',
          selectedEventIds: ['ev-1', 'ev-0'],
          restockLines: [{ rowKey: 'r1', shopId: 'shop-1', itemName: 'Coca', restockQuantity: 24, sourceBreakdown: [{ name: 'x' }] }],
          lineOverrides: { r1: 12 },
          restockedRows: {},
        },
      ]);
      deposits.listByEvents.mockResolvedValueOnce([
        { id: 'mv-1', cancelled: false, createdBy: actor },
        { id: 'mv-2', cancelled: false, createdBy: 'guest-pin:acc-1:autreappareil00' },
      ]);
      deposits.packSizes.mockResolvedValueOnce([{ elementId: 'shop-1', itemName: 'Coca', unitsPerPack: 12 }]);
      const sheet = await service.getSheet(guest, DEVICE);
      expect(sheet.packSizes).toEqual([{ elementId: 'shop-1', itemName: 'Coca', unitsPerPack: 12 }]);
      expect(prisma.restockPlan.findMany.mock.calls[0][0]).toMatchObject({
        where: { tenantId: 'tenant-1', spaceId: 'space-1', selectedEventIds: { hasSome: ['ev-1'] } },
        orderBy: { updatedAt: 'desc' },
      });
      expect(sheet.eventOrder).toEqual(['ev-1']);
      expect(sheet.plans[0].restockLines).toEqual([{ rowKey: 'r1', shopId: 'shop-1', itemName: 'Coca', restockQuantity: 24 }]);
      // Les dépôts comptent pour tous les matchs de la feuille, pas seulement celui de l'accès.
      expect(deposits.sumByEvents).toHaveBeenCalledWith('space-1', ['ev-1', 'ev-0'], 'tenant-1');
      expect(deposits.storagesOfConfigs).toHaveBeenCalledWith('space-1', 'tenant-1', ['cfg-l2']);
      expect(sheet.movements.map((m: any) => [m.id, m.cancellable, m.createdBy])).toEqual([
        ['mv-1', true, undefined],
        ['mv-2', false, undefined],
      ]);
    });

    it('additionne les matchs rattachés au PIN du premier, une feuille par match', async () => {
      prisma.inventoryWindow.findFirst.mockResolvedValueOnce({ eventId: 'ev-1', linkedEventIds: ['ev-2'] });
      ventilationEvents.orderedEvents.mockResolvedValueOnce([
        { id: 'ev-1', name: 'A', configurationId: 'c1' },
        { id: 'ev-2', name: 'B', configurationId: 'c1' },
      ]);
      prisma.restockPlan.findMany.mockResolvedValueOnce([
        { id: 'pB', name: 'B', selectedEventIds: ['ev-2'], restockLines: [], lineOverrides: {}, restockedRows: {} },
        { id: 'pA', name: 'A', selectedEventIds: ['ev-1'], restockLines: [], lineOverrides: {}, restockedRows: {} },
        { id: 'old', name: 'A ancienne', selectedEventIds: ['ev-1'], restockLines: [], lineOverrides: {}, restockedRows: {} },
      ]);
      const sheet = await service.getSheet(guest, DEVICE);
      expect(ventilationEvents.orderedEvents).toHaveBeenCalledWith('space-1', 'tenant-1', ['ev-1', 'ev-2']);
      expect(sheet.plans.map((p: any) => p.id)).toEqual(['pA', 'pB']);
      expect(sheet.eventName).toBe('A + B');
    });

    it('dépose sur la destination et l\'article lus dans la feuille, raison Ventilation', async () => {
      prisma.restockPlan.findMany.mockResolvedValueOnce([
        { id: 'p1', selectedEventIds: ['ev-1'], restockLines: [{ rowKey: 'r1', shopId: 'shop-1', itemName: 'Coca' }] },
      ]);
      await expect(service.deposit(guest, { rowKey: 'p1::r1', packed: 2, loose: 0, depositorName: ' Awa ' }, DEVICE)).resolves.toEqual({
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
      prisma.restockPlan.findMany.mockResolvedValueOnce([
        { id: 'p1', selectedEventIds: ['ev-1'], restockLines: [{ rowKey: 'r1', shopId: 'shop-1' }], restockedRows: { r1: true } },
      ]);
      await expect(service.deposit(guest, { rowKey: 'r1', packed: 1, loose: 0 }, DEVICE)).rejects.toThrow("n'est plus à déposer");
      prisma.restockPlan.findMany.mockResolvedValueOnce([
        { id: 'p1', selectedEventIds: ['ev-1'], restockLines: [{ rowKey: 'r1', shopId: 'shop-1' }], lineOverrides: { r1: 0 } },
      ]);
      await expect(service.deposit(guest, { rowKey: 'r1', packed: 1, loose: 0 }, DEVICE)).rejects.toThrow("n'est plus à déposer");
      expect(logistics.createMovement).not.toHaveBeenCalled();
    });

    it('refuse une ligne absente de la feuille', async () => {
      prisma.restockPlan.findMany.mockResolvedValueOnce([{ id: 'p1', selectedEventIds: ['ev-1'], restockLines: [] }]);
      await expect(service.deposit(guest, { rowKey: 'p1::forged', packed: 1, loose: 0 }, DEVICE)).rejects.toThrow('ne figure pas');
      prisma.restockPlan.findMany.mockResolvedValueOnce([{ id: 'p1', selectedEventIds: ['ev-1'], restockLines: [{ rowKey: 'r1', shopId: 's' }] }]);
      await expect(service.deposit(guest, { rowKey: 'autre-feuille::r1', packed: 1, loose: 0 }, DEVICE)).rejects.toThrow('ne figure pas');
      expect(logistics.createMovement).not.toHaveBeenCalled();
    });

    it("dépose dans un stockage du match sans ligne prévue, article lu sur la feuille", async () => {
      prisma.restockPlan.findMany.mockResolvedValueOnce([
        { id: 'p1', selectedEventIds: ['ev-1'], restockLines: [{ rowKey: 'r1', shopId: 'shop-1', itemName: 'Coca' }] },
      ]);
      deposits.storagesOfConfigs.mockResolvedValueOnce([{ id: 'depot-1', name: 'Dépôt 1' }]);
      await service.deposit(guest, { storageId: 'depot-1', itemName: 'coca', packed: 1, loose: 0 }, DEVICE);
      expect(deposits.storagesOfConfigs).toHaveBeenCalledWith('space-1', 'tenant-1', ['cfg-l2']);
      expect(deposits.resolveElementItemKey).toHaveBeenCalledWith('space-1', 'depot-1', 'Coca', 'tenant-1');
      expect(logistics.createMovement.mock.calls[0][0]).toMatchObject({ elementId: 'depot-1', reason: 'VENTILATION', eventId: 'ev-1' });
    });

    it('refuse un stockage hors du match ou un article absent de la feuille', async () => {
      prisma.restockPlan.findMany.mockResolvedValue([
        { id: 'p1', selectedEventIds: ['ev-1'], restockLines: [{ rowKey: 'r1', shopId: 'shop-1', itemName: 'Coca' }] },
      ]);
      deposits.storagesOfConfigs.mockResolvedValue([{ id: 'depot-1', name: 'Dépôt 1' }]);
      await expect(service.deposit(guest, { storageId: 'autre', itemName: 'Coca', packed: 1, loose: 0 }, DEVICE)).rejects.toThrow('ne fait pas partie');
      await expect(service.deposit(guest, { storageId: 'depot-1', itemName: 'Inventé', packed: 1, loose: 0 }, DEVICE)).rejects.toThrow('ne figure pas');
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

    it('reprise refusée quand tous les matchs de la combinaison sont terminés', async () => {
      prisma.inventoryWindow.findFirst.mockResolvedValueOnce({ id: 'w-1', eventId: 'ev-1', linkedEventIds: [], status: 'closed' });
      prisma.space.findFirst.mockResolvedValueOnce({ timezone: 'Europe/Paris' });
      ventilationEvents.orderedEvents.mockResolvedValueOnce([{ ...futureEvent, eventDate: new Date('2026-01-01T00:00:00Z') }]);
      await expect(service.start({ spaceId: 'space-1', windowId: 'w-1' }, user)).rejects.toThrow('terminés');
      expect(prisma.inventoryWindow.update).not.toHaveBeenCalled();
    });

    it("reprend l'accès visé sans toucher aux autres, même PIN", async () => {
      prisma.inventoryWindow.findFirst
        .mockResolvedValueOnce({ id: 'w-1', tenantId: 'tenant-1', eventId: 'ev-1', linkedEventIds: ['ev-2'], status: 'closed' })
        .mockResolvedValueOnce({ id: 'w-1', eventId: 'ev-1', linkedEventIds: ['ev-2'], status: 'open', pinLookupHash: 'h' });
      prisma.space.findFirst
        .mockResolvedValueOnce({ timezone: 'Europe/Paris' })
        .mockResolvedValueOnce({ ventilationSlug: 'ventilation-x' });
      ventilationEvents.orderedEvents.mockResolvedValueOnce([futureEvent]);
      const status = await service.start({ spaceId: 'space-1', windowId: 'w-1' }, user);
      expect(prisma.inventoryWindow.update.mock.calls[0][0]).toMatchObject({ where: { id: 'w-1' }, data: { status: 'open' } });
      expect(prisma.guestPinAccess.updateMany).toHaveBeenCalledWith({
        where: { windowId: 'w-1', status: 'revoked' },
        data: { status: 'active', revokedAt: null, revokedBy: null },
      });
      expect(guestPin.closeWindowRecord).not.toHaveBeenCalled();
      expect(status.window).toMatchObject({ id: 'w-1', status: 'open', pin: '123456' });
    });

    it('un accès par combinaison : même combinaison = même clé, quel que soit l’ordre', async () => {
      expect(ventilationSelectionKey(['ev-2', 'ev-1'])).toBe(ventilationSelectionKey(['ev-1', 'ev-2', 'ev-1']));
      expect(ventilationSelectionKey(['ev-1'])).not.toBe(ventilationSelectionKey(['ev-1', 'ev-2']));
      expect(ventilationSelectionKey(['ev-1', 'ev-2'])).not.toBe(ventilationSelectionKey(['ev-2', 'ev-3']));
    });

    it('PIN de la combinaison : accès créé sur le premier match, avec sa clé et les autres matchs', async () => {
      prisma.space.findFirst
        .mockResolvedValueOnce({ timezone: 'Europe/Paris' })
        .mockResolvedValueOnce({ name: 'La Beaujoire', ventilationSlug: 'ventilation-la-beaujoire-abc123' });
      ventilationEvents.orderedEvents.mockResolvedValueOnce([
        { ...futureEvent, id: 'ev-1' },
        { ...futureEvent, id: 'ev-2', eventDate: new Date(Date.now() + 10 * 86400000) },
      ]);
      prisma.inventoryWindow.upsert.mockResolvedValueOnce({ id: 'w-12', status: 'open' });
      prisma.inventoryWindow.findFirst.mockResolvedValueOnce({ id: 'w-12', eventId: 'ev-1', status: 'open', linkedEventIds: ['ev-2'], pinLookupHash: 'h' });
      const status = await service.ensure({ spaceId: 'space-1', eventIds: ['ev-2', 'ev-1'] }, user);
      const key = ventilationSelectionKey(['ev-1', 'ev-2']);
      expect(prisma.inventoryWindow.upsert.mock.calls[0][0]).toEqual({
        where: { uniq_inventory_window: { tenantId: 'tenant-1', spaceId: 'space-1', eventId: 'ev-1', phase: 'ventilation', selectionKey: key } },
        create: expect.objectContaining({ eventId: 'ev-1', selectionKey: key, linkedEventIds: ['ev-2'] }),
        // Combinaison figée par sa clé ; un accès arrêté à la main n'est pas rouvert.
        update: {},
      });
      expect(guestPin.ensureWindowPin).toHaveBeenCalled();
      expect(status.window).toMatchObject({ id: 'w-12', eventId: 'ev-1', linkedEventIds: ['ev-2'], pin: '123456' });
    });

    it("sans match à venir dans la sélection : pas d'accès", async () => {
      prisma.space.findFirst
        .mockResolvedValueOnce({ timezone: 'Europe/Paris' })
        .mockResolvedValueOnce({ name: 'La Beaujoire', ventilationSlug: 'ventilation-x' });
      ventilationEvents.orderedEvents.mockResolvedValueOnce([{ ...futureEvent, eventDate: new Date('2026-01-01T00:00:00Z') }]);
      const status = await service.ensure({ spaceId: 'space-1', eventIds: ['ev-1'] }, user);
      expect(prisma.inventoryWindow.upsert).not.toHaveBeenCalled();
      expect(status.window).toBeNull();
    });

    it('crée le QR une fois', async () => {
      prisma.space.findFirst
        .mockResolvedValueOnce({ timezone: 'Europe/Paris' })
        .mockResolvedValueOnce({ name: 'La Beaujoire', ventilationSlug: null });
      ventilationEvents.orderedEvents.mockResolvedValueOnce([futureEvent]);
      prisma.inventoryWindow.upsert.mockResolvedValueOnce({ id: 'w-1', status: 'open' });
      prisma.inventoryWindow.findFirst.mockResolvedValueOnce({ id: 'w-1', eventId: 'ev-1', status: 'open', pinLookupHash: 'h' });
      const status = await service.ensure({ spaceId: 'space-1', eventIds: ['ev-1'] }, user);
      expect(status.slug).toMatch(/^ventilation-la-beaujoire-[0-9a-f]{6}$/);
    });
  });
});
