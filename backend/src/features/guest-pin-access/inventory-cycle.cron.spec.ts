import { InventoryCycleCronService } from './inventory-cycle.cron';
import { PRE_SALE_STOP_ACTOR } from './pre-sale-stop';

/**
 * Cycle automatique pre / post-event (document Bertrand 2026-10-06) : PIN préparés à
 * l'avance, post-event démarré aux portes, arrêté par une livraison APRÈS le match (pre
 * suivant démarré), pre-event arrêté PDV par PDV à sa première vente (Bertrand 2026-10-07).
 * Une fois chacun.
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
      guestPinAccess: { findMany: jest.fn().mockResolvedValue([]) },
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
      stopPreElement: jest.fn().mockResolvedValue(undefined),
    };
    spaces = {
      firstValidSaleByElementSince: jest.fn().mockResolvedValue(new Map()),
    };
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

  it("sans heure de show : démarre le post-event aux portes, une seule fois, sans arrêter le pre-event", async () => {
    const atDoors = new Date('2026-10-10T15:01:00Z');
    expect(await service.startPostAtShowTime(new Date('2026-10-10T14:59:00Z'))).toBe(0);
    expect(await service.startPostAtShowTime(atDoors)).toBe(1);
    expect(guestPin.startPhase).toHaveBeenCalledWith(
      { spaceId: 'space-1', eventId: 'event-n', phase: 'post-event' },
      'tenant-1',
      ACTOR,
      { keepOtherPhase: true },
    );
    // Arrêté ensuite à la main : le tick suivant ne le relance pas.
    expect(await service.startPostAtShowTime(new Date('2026-10-10T15:02:00Z'))).toBe(0);
    expect(guestPin.startPhase).toHaveBeenCalledTimes(1);
  });

  it("heure du show renseignée : démarre le post-event au show, pas aux portes (Bertrand 2026-10-07)", async () => {
    // Portes 17:00 Paris (15:00Z), show 19:00 Paris (17:00Z).
    prisma.event.findMany.mockResolvedValue([{ ...matchN, sessions: [{ doorsOpening: '17:00', showTime: '19:00' }] }]);
    expect(await service.startPostAtShowTime(new Date('2026-10-10T15:01:00Z'))).toBe(0);
    expect(await service.startPostAtShowTime(new Date('2026-10-10T16:59:00Z'))).toBe(0);
    expect(guestPin.startPhase).not.toHaveBeenCalled();
    expect(await service.startPostAtShowTime(new Date('2026-10-10T17:00:30Z'))).toBe(1);
    expect(guestPin.startPhase).toHaveBeenCalledTimes(1);
  });

  it("sessions stockées en JSON texte (cas PAUC/SARAN) : heure du show lue aussi", async () => {
    prisma.event.findMany.mockResolvedValue([
      { ...matchN, sessions: ['{"showTime":"20:00","doorsOpening":"18:45"}'] },
    ]);
    // Portes 18:45 Paris (16:45Z) : rien ; show 20:00 Paris (18:00Z) : démarrage.
    expect(await service.startPostAtShowTime(new Date('2026-10-10T16:50:00Z'))).toBe(0);
    expect(await service.startPostAtShowTime(new Date('2026-10-10T18:00:30Z'))).toBe(1);
  });

  it("ni show ni portes : aucun démarrage automatique", async () => {
    prisma.event.findMany.mockResolvedValue([{ ...matchN, sessions: null }]);
    expect(await service.startPostAtShowTime(new Date('2026-10-10T18:00:00Z'))).toBe(0);
    expect(guestPin.startPhase).not.toHaveBeenCalled();
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
        where: expect.objectContaining({ reason: { in: ['DELIVERY', 'VENTILATION'] }, createdAt: { gt: new Date('2026-10-10T20:00:00Z') } }),
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

  describe('pre-event arrêté PDV par PDV à sa première vente', () => {
    const now = new Date('2026-10-10T16:00:00Z'); // après les portes (15:00Z)
    const sale = new Date('2026-10-10T15:40:00Z');

    it('seuls les PDV qui ont vendu sont arrêtés, une fois, vente de test comprise', async () => {
      prisma.inventoryWindow.findMany.mockResolvedValue([preWindow]);
      spaces.firstValidSaleByElementSince.mockResolvedValue(new Map([['pdv-a', sale]]));

      expect(await service.stopPreElementsOnSale(now)).toBe(1);
      expect(guestPin.stopPreElement).toHaveBeenCalledWith(preWindow, 'pdv-a', PRE_SALE_STOP_ACTOR);
      // Ventes cherchées depuis le début de la journée du match (minuit Paris).
      expect(spaces.firstValidSaleByElementSince).toHaveBeenCalledWith('space-1', 'tenant-1', new Date('2026-10-09T22:00:00Z'));

      expect(await service.stopPreElementsOnSale(now)).toBe(0);
      expect(guestPin.stopPreElement).toHaveBeenCalledTimes(1);
    });

    it('PDV déjà arrêté : rien à faire', async () => {
      prisma.inventoryWindow.findMany.mockResolvedValue([preWindow]);
      spaces.firstValidSaleByElementSince.mockResolvedValue(new Map([['pdv-a', sale]]));
      prisma.guestPinAccess.findMany.mockResolvedValue([{ elementId: 'pdv-a', status: 'revoked' }]);
      expect(await service.stopPreElementsOnSale(now)).toBe(0);
      expect(guestPin.stopPreElement).not.toHaveBeenCalled();
    });

    it('fenêtre arrêtée : seul un PDV rouvert un par un (ligne active) peut être coupé', async () => {
      prisma.inventoryWindow.findMany.mockResolvedValue([{ ...preWindow, status: 'closed' }]);
      spaces.firstValidSaleByElementSince.mockResolvedValue(new Map([['pdv-a', sale], ['pdv-b', sale]]));
      prisma.guestPinAccess.findMany.mockResolvedValue([{ elementId: 'pdv-b', status: 'active' }]);
      expect(await service.stopPreElementsOnSale(now)).toBe(1);
      expect(guestPin.stopPreElement).toHaveBeenCalledWith(expect.objectContaining({ id: 'win-pre' }), 'pdv-b', PRE_SALE_STOP_ACTOR);
    });

    it('PDV rouvert à la main (marqueur déjà posé) : jamais recoupé', async () => {
      prisma.inventoryWindow.findMany.mockResolvedValue([preWindow]);
      spaces.firstValidSaleByElementSince.mockResolvedValue(new Map([['pdv-a', sale]]));
      markers.add('inventory-cycle:pre-sale:win-pre:pdv-a');
      expect(await service.stopPreElementsOnSale(now)).toBe(0);
      expect(guestPin.stopPreElement).not.toHaveBeenCalled();
    });

    it('avant le jour du match, aucune requête de ventes', async () => {
      prisma.inventoryWindow.findMany.mockResolvedValue([preWindow]);
      expect(await service.stopPreElementsOnSale(new Date('2026-10-08T12:00:00Z'))).toBe(0);
      expect(spaces.firstValidSaleByElementSince).not.toHaveBeenCalled();
    });
  });
});
