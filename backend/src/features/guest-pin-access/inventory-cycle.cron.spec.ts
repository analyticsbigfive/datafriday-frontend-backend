import { InventoryCycleCronService } from './inventory-cycle.cron';

/**
 * Cycle automatique pre / post-event (document Bertrand 2026-10-06) : PIN préparés à
 * l'avance, post-event démarré aux portes, arrêté par une livraison APRÈS le match (pre
 * suivant démarré), pre-event arrêté par la première vente du match. Une fois chacun.
 */
describe('InventoryCycleCronService', () => {
  const ACTOR = InventoryCycleCronService.ACTOR;
  // Match du 2026-10-10, portes 17:00 Paris (15:00Z), fin 22:00 Paris (20:00Z).
  const matchN = {
    id: 'event-n',
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    eventDate: new Date('2026-10-10T00:00:00Z'),
    eventStartDate: null,
    eventEndDate: null,
    eventEndTime: '22:00',
    integrationId: null,
    sessions: [{ doorsOpening: '17:00' }],
    space: { timezone: 'Europe/Paris' },
  };
  const matchNext = { ...matchN, id: 'event-next', eventDate: new Date('2026-10-17T00:00:00Z') };

  let prisma: any;
  let guestPin: any;
  let spaces: any;
  let service: InventoryCycleCronService;
  let markers: Set<string>;

  beforeEach(() => {
    markers = new Set();
    prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([matchN, matchNext]),
        findFirst: jest.fn().mockResolvedValue(matchN),
      },
      inventoryWindow: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => ({ id: where.id, status: 'open' })),
      },
      stockMovement: { findFirst: jest.fn().mockResolvedValue(null) },
      kvStore: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          if (markers.has(data.key)) throw Object.assign(new Error('dup'), { code: 'P2002' });
          markers.add(data.key);
          return data;
        }),
      },
    };
    guestPin = {
      prepareWindow: jest.fn().mockResolvedValue('created'),
      startPhase: jest.fn().mockResolvedValue({}),
      stopPhaseWindow: jest.fn().mockResolvedValue(undefined),
    };
    spaces = { getLiveStatus: jest.fn().mockResolvedValue({ isLive: false, eventId: null, since: null }) };
    service = new InventoryCycleCronService(prisma, guestPin, spaces);
  });

  const postWindow = { id: 'win-post', tenantId: 'tenant-1', spaceId: 'space-1', eventId: 'event-n', phase: 'post-event', status: 'open' };
  const preWindow = { ...postWindow, id: 'win-pre', phase: 'pre-event' };

  it('prépare les fenêtres pre et post des events non terminés', async () => {
    const created = await service.prepareUpcomingWindows(new Date('2026-10-10T21:00:00Z'));
    // Match N terminé à 20:00Z : seul le suivant est préparé.
    expect(created).toBe(2);
    expect(guestPin.prepareWindow.mock.calls.map(([t]: any) => [t.eventId, t.phase])).toEqual([
      ['event-next', 'pre-event'],
      ['event-next', 'post-event'],
    ]);
  });

  it('démarre le post-event aux portes, une seule fois', async () => {
    const atDoors = new Date('2026-10-10T15:01:00Z');
    expect(await service.startPostAtDoors(new Date('2026-10-10T14:59:00Z'))).toBe(0);
    expect(await service.startPostAtDoors(atDoors)).toBe(1);
    expect(guestPin.startPhase).toHaveBeenCalledWith(
      { spaceId: 'space-1', eventId: 'event-n', phase: 'post-event' },
      'tenant-1',
      ACTOR,
    );
    // Arrêté ensuite à la main : le tick suivant ne le relance pas.
    expect(await service.startPostAtDoors(new Date('2026-10-10T15:02:00Z'))).toBe(0);
    expect(guestPin.startPhase).toHaveBeenCalledTimes(1);
  });

  it('une livraison pendant le match ne coupe rien (D16)', async () => {
    prisma.inventoryWindow.findMany.mockResolvedValue([postWindow]);
    prisma.stockMovement.findFirst.mockResolvedValue({ id: 'mv-1' });
    expect(await service.stopPostOnDelivery(new Date('2026-10-10T18:00:00Z'))).toBe(0);
    expect(prisma.stockMovement.findFirst).not.toHaveBeenCalled();
    expect(guestPin.stopPhaseWindow).not.toHaveBeenCalled();
  });

  it('livraison après le match : pre-event suivant démarré, post-event arrêté, une fois', async () => {
    prisma.inventoryWindow.findMany.mockResolvedValue([postWindow]);
    prisma.stockMovement.findFirst.mockResolvedValue({ id: 'mv-1' });
    const now = new Date('2026-10-12T09:00:00Z');

    expect(await service.stopPostOnDelivery(now)).toBe(1);
    expect(prisma.stockMovement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reason: 'DELIVERY', createdAt: { gt: new Date('2026-10-10T20:00:00Z') } }),
      }),
    );
    expect(guestPin.startPhase).toHaveBeenCalledWith(
      { spaceId: 'space-1', eventId: 'event-next', phase: 'pre-event' },
      'tenant-1',
      ACTOR,
    );
    expect(guestPin.stopPhaseWindow).toHaveBeenCalledWith(expect.objectContaining({ id: 'win-post' }), ACTOR, 'delivery');

    expect(await service.stopPostOnDelivery(now)).toBe(0);
    expect(guestPin.startPhase).toHaveBeenCalledTimes(1);
  });

  it('première vente du match : pre-event arrêté, une fois ; une vente hors match ne compte pas', async () => {
    prisma.inventoryWindow.findMany.mockResolvedValue([preWindow]);
    const now = new Date('2026-10-10T13:00:00Z');

    spaces.getLiveStatus.mockResolvedValue({ isLive: true, eventId: null, since: now.toISOString() });
    expect(await service.stopPreOnSale(now)).toBe(0);

    spaces.getLiveStatus.mockResolvedValue({ isLive: true, eventId: 'event-n', since: now.toISOString() });
    expect(await service.stopPreOnSale(now)).toBe(1);
    expect(guestPin.stopPhaseWindow).toHaveBeenCalledWith(preWindow, ACTOR, 'sale');
    expect(await service.stopPreOnSale(now)).toBe(0);
  });

  it("avant le jour du match, aucune requête de ventes", async () => {
    prisma.inventoryWindow.findMany.mockResolvedValue([preWindow]);
    expect(await service.stopPreOnSale(new Date('2026-10-08T12:00:00Z'))).toBe(0);
    expect(spaces.getLiveStatus).not.toHaveBeenCalled();
  });
});
