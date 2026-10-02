import { PreEventInventoryFlowService } from './pre-event-inventory-flow.service';
import { StockReconciliationService } from '../logistics/services/stock-reconciliation.service';

/**
 * Logistique mise à jour à chaque article marqué compté, envoi regroupé à la minute
 * (document Bertrand « Pre et Post event Inventory cycle », 2026-10-06, D1).
 */
describe('Logistique depuis les comptages (D1)', () => {
  describe('PreEventInventoryFlowService : marquage et envoi', () => {
    let prisma: any;
    let inventory: any;
    let flow: PreEventInventoryFlowService;
    let store: Map<string, any>;

    beforeEach(() => {
      store = new Map();
      prisma = {
        kvStore: {
          upsert: jest.fn().mockImplementation(async ({ where, create }: any) => {
            const k = `${where.uniq_kv_store.tenantId}|${where.uniq_kv_store.key}`;
            const row = { id: k, tenantId: create.tenantId, key: create.key, value: create.value };
            store.set(k, row);
            return row;
          }),
          findMany: jest.fn().mockImplementation(async ({ where }: any = {}) =>
            [...store.values()].filter((r) => (typeof where?.key === 'string' ? r.key === where.key : true)),
          ),
          delete: jest.fn().mockImplementation(async ({ where }: any) => store.delete(where.id)),
          deleteMany: jest.fn().mockImplementation(async ({ where }: any) => ({ count: store.delete(where.id) ? 1 : 0 })),
        },
      };
      inventory = {
        saveInventoryCounts: jest.fn().mockResolvedValue({ id: 'count-1' }),
        pushPendingCountToLogistic: jest.fn().mockResolvedValue({ ok: true, lineCount: 1 }),
      };
      flow = new PreEventInventoryFlowService(prisma, inventory);
    });

    afterEach(() => flow.onModuleDestroy());

    const dto = (over: Record<string, unknown> = {}) =>
      ({
        spaceId: 'space-1',
        eventId: 'event-1',
        shopId: 'shop-1',
        itemId: 'mi-1',
        packedUnits: 1,
        looseUnits: 0,
        isCounted: true,
        phase: 'post-event',
        ...over,
      }) as any;

    it('« Marquer compté » en post-event : article enregistré puis marqué à envoyer', async () => {
      await flow.saveCount(dto(), 'tenant-1', 'user-1');
      expect(inventory.saveInventoryCounts).toHaveBeenCalled();
      expect([...store.values()].map((r) => r.key)).toEqual(['inventory-logistic-dirty:post-event:space-1:event-1']);
    });

    it('« Marquer compté » : envoi quelques secondes après le clic, sans attendre le cron', async () => {
      jest.useFakeTimers();
      try {
        await flow.saveCount(dto(), 'tenant-1', 'user-1');
        await flow.saveCount(dto({ itemId: 'mi-2' }), 'tenant-1', 'user-1');
        expect(inventory.pushPendingCountToLogistic).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(2_000);
        // Les deux clics rapprochés partent en un seul envoi.
        expect(inventory.pushPendingCountToLogistic).toHaveBeenCalledTimes(1);
        expect(store.size).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('un marqueur déjà pris par un autre envoi n\'est pas renvoyé', async () => {
      await flow.saveCount(dto(), 'tenant-1', 'user-1');
      prisma.kvStore.deleteMany.mockResolvedValueOnce({ count: 0 });
      expect(await flow.flushLogisticDirty()).toBe(0);
      expect(inventory.pushPendingCountToLogistic).not.toHaveBeenCalled();
    });

    it('une saisie non marquée comptée ne déclenche aucun envoi', async () => {
      await flow.saveCount(dto({ isCounted: false }), 'tenant-1');
      expect(store.size).toBe(0);
    });

    it('le tick envoie chaque match marqué une fois, puis plus rien', async () => {
      await flow.saveCount(dto(), 'tenant-1');
      await flow.saveCount(dto({ itemId: 'mi-2' }), 'tenant-1');
      expect(await flow.flushLogisticDirty()).toBe(1);
      expect(inventory.pushPendingCountToLogistic).toHaveBeenCalledWith(
        'space-1',
        'event-1',
        'tenant-1',
        'post-event',
        'system-inventory-count',
      );
      expect(await flow.flushLogisticDirty()).toBe(0);
      expect(inventory.pushPendingCountToLogistic).toHaveBeenCalledTimes(1);
    });

    it('échec de l\'envoi : le marqueur est reposé pour le tick suivant', async () => {
      inventory.pushPendingCountToLogistic.mockRejectedValueOnce(new Error('reset KO'));
      await flow.saveCount(dto(), 'tenant-1');
      await flow.flushLogisticDirty();
      expect(store.size).toBe(1);
    });
  });

  describe('StockReconciliationService : une ligne par match et par phase dans la liste', () => {
    const doc = (id: string, phase: string | null, lines: any[], at: string) => ({
      id,
      eventId: 'event-1',
      eventName: 'Match',
      createdAt: new Date(at),
      createdBy: 'system-inventory-count',
      lines,
      meta: phase ? { source: 'inventory-count', phase, eventId: 'event-1' } : null,
    });
    const rows = [
      doc('r3', 'post-event', [{ elementId: 'a', itemKey: 'Coca' }], '2026-10-10T21:02:00Z'),
      doc('r2', 'post-event', [{ elementId: 'a', itemKey: 'Coca' }, { elementId: 'b', itemKey: 'Eau' }], '2026-10-10T21:01:00Z'),
      doc('manual', null, [{ elementId: 'a', itemKey: 'Coca' }], '2026-10-10T20:00:00Z'),
      doc('r1', 'pre-event', [{ elementId: 'a', itemKey: 'Coca' }], '2026-10-10T15:00:00Z'),
    ];
    let prisma: any;
    let service: StockReconciliationService;

    beforeEach(() => {
      prisma = {
        space: { findFirst: jest.fn().mockResolvedValue({ id: 'space-1' }) },
        stockReconciliation: {
          findMany: jest.fn().mockResolvedValue(rows),
          findFirst: jest.fn().mockResolvedValue({ ...rows[0], spaceId: 'space-1', kind: null }),
        },
      };
      service = new StockReconciliationService(prisma, {
        hasFullAccess: () => true,
        getAccessibleSpaceIds: async () => 'ALL',
        assertSpaceAccessible: jest.fn().mockResolvedValue({ id: 'space-1', name: 'Space' }),
        assertCanAccessSpace: jest.fn().mockResolvedValue(undefined),
      } as any, {} as any, {} as any, {} as any);
    });

    it('regroupe les envois automatiques, garde les resets manuels à part', async () => {
      const list: any[] = await service.listReconciliations('space-1', 'tenant-1');
      expect(list.map((r) => [r.id, r.lineCount, r.groupedCount])).toEqual([
        ['r3', 2, 2],
        ['manual', 1, undefined],
        ['r1', 1, 1],
      ]);
    });

    it('ouvrir la ligne regroupée : dernière valeur de chaque article', async () => {
      prisma.stockReconciliation.findMany.mockResolvedValue([
        { id: 'r3', lines: [{ elementId: 'a', itemKey: 'Coca', countedLoose: 5 }] },
        { id: 'r2', lines: [{ elementId: 'a', itemKey: 'Coca', countedLoose: 9 }, { elementId: 'b', itemKey: 'Eau', countedLoose: 2 }] },
      ]);
      const reco: any = await service.getReconciliation('r3', 'tenant-1');
      expect(reco.lines).toEqual([
        { elementId: 'a', itemKey: 'Coca', countedLoose: 5 },
        { elementId: 'b', itemKey: 'Eau', countedLoose: 2 },
      ]);
      expect(reco.groupedIds).toEqual(['r3', 'r2']);
    });
  });
});
