import { PreEventInventoryFlowService } from './pre-event-inventory-flow.service';

/**
 * Règles Bertrand 2026-09-29 du Pre-event Inventory :
 *  - modifiable à tout moment avant l'ouverture des portes (Ulrich 2026-10-02, plus
 *    d'attente de minuit le jour du match) ;
 *  - Logistic mis à jour automatiquement à l'ouverture des portes, puis manuellement
 *    par PDV (responsable logistique / administrateur).
 */
describe('PreEventInventoryFlowService, règles Bertrand 2026-09-29', () => {
  const inventory = {
    saveInventoryCounts: jest.fn().mockResolvedValue({ id: 'count-1' }),
    getBySpaceAndEvent: jest.fn().mockResolvedValue({ inventoryCounts: { 'shop-1': { 'mi-1': {} } } }),
    createPreEventReconciliation: jest.fn().mockResolvedValue({
      id: 'reco',
      lines: [],
      meta: { logisticPush: { ok: true, reason: null, lineCount: 3 } },
    }),
    upsertInventory: jest.fn().mockResolvedValue({}),
  };
  const prisma = {
    event: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    stockReconciliation: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
    },
    kvStore: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    inventoryCount: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const service = new PreEventInventoryFlowService(prisma as any, inventory as any);

  // SFP-Lyon, Jean Bouin, 26/09/2026 : portes 15:00 Paris (13:00 UTC), fin 23:00.
  const sfpLyon = {
    id: 'event-1',
    name: 'SFP-Lyon',
    eventDate: new Date('2026-09-26T00:00:00.000Z'),
    eventStartDate: new Date('2026-09-26T00:00:00.000Z'),
    eventEndDate: new Date('2026-09-26T00:00:00.000Z'),
    eventEndTime: '23:00',
    sessions: '[{"doorsOpening":"15:00"}]',
    space: { timezone: 'Europe/Paris' },
  };
  const flowEvent = { ...sfpLyon, tenantId: 'tenant-1', spaceId: 'space-1', timezone: 'Europe/Paris' };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    prisma.event.findFirst.mockResolvedValue(sfpLyon);
    prisma.event.findMany.mockResolvedValue([]);
  });
  afterEach(() => jest.useRealTimers());

  describe('début de la période pre-event', () => {
    it('plusieurs jours avant le match : comptage accepté, phase before', async () => {
      jest.setSystemTime(new Date('2026-09-20T08:00:00Z'));
      await service.saveCount(
        { spaceId: 'space-1', eventId: 'event-1', shopId: 'shop-1', itemId: 'mi-1', phase: 'pre-event' } as any,
        'tenant-1',
      );
      expect(inventory.saveInventoryCounts).toHaveBeenCalled();
      const state = await service.getWindowState('space-1', 'event-1', 'tenant-1');
      expect(state.phase).toBe('before');
    });
  });

  describe('mise à jour de Logistic', () => {
    const pushArg = () => inventory.createPreEventReconciliation.mock.calls[0][8];

    it('PDV complet AVANT les portes : feuille régénérée et Logistic recalé (tous les PDV)', async () => {
      jest.setSystemTime(new Date('2026-09-26T10:00:00Z'));
      await service.regenerateOnPdvComplete('space-1', 'event-1', 'tenant-1', 'user-1', 'shop-1');
      expect(pushArg()).toBeUndefined();
    });

    it('PDV complet APRÈS les portes : Logistic recalé aussi (document Bertrand 2026-10-06, D1)', async () => {
      jest.setSystemTime(new Date('2026-09-26T13:10:00Z'));
      await service.regenerateOnPdvComplete('space-1', 'event-1', 'tenant-1', 'user-1', 'shop-1');
      expect(pushArg()).toBeUndefined();
    });

    it('mise à jour manuelle par PDV : seul ce PDV part vers Logistic', async () => {
      jest.setSystemTime(new Date('2026-09-26T13:10:00Z'));
      const result = await service.pushElementToLogistic('space-1', 'event-1', 'tenant-1', 'user-1', 'shop-1');
      expect(pushArg()).toEqual(['shop-1']);
      expect(result.logisticPush).toEqual({ ok: true, reason: null, lineCount: 3 });
    });
  });
});
