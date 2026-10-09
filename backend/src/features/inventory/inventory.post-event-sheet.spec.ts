import { InventoryService } from './inventory.service';

/**
 * Feuille post-event par match (demande Bertrand 2026-09-29, « même système que le
 * pre-event ») : brouillon régénéré en cours de comptage, remplacement de la feuille
 * précédente, version finale qui pousse Logistic et clôt le post-event, recomptage par PDV.
 */
describe('InventoryService, feuille post-event et recomptage par PDV', () => {
  const prisma = {
    event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1', name: 'SFP-Lyon' }) },
    space: { findFirst: jest.fn().mockResolvedValue({ id: 'space-1' }) },
    stockReconciliation: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'reco-new', ...data })),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryWindow: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([{ id: 'win-post' }]),
    },
    inventoryCount: { updateMany: jest.fn().mockResolvedValue({ count: 12 }) },
    guestPinAccess: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  let service: InventoryService;
  let push: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    const spaceAccess = { assertSpaceInTenant: jest.fn().mockResolvedValue({ id: 'space-1', name: 'Espace' }) };
    service = new InventoryService(prisma as any, {} as any, spaceAccess as any);
    jest.spyOn(service, 'getBySpaceAndEvent').mockResolvedValue({ inventoryCounts: { 'shop-1': {} } } as any);
    push = jest.spyOn(service as any, 'pushCountToLogistic').mockResolvedValue({ ok: true, lineCount: 3 });
  });

  const dto = { eventId: 'event-1', lines: [] } as any;

  it('brouillon : feuille remplacée, ni Logistic ni clôture du post-event', async () => {
    const created = await service.createPostEventReconciliation('space-1', dto, 'tenant-1', 'user-1', { draft: true });
    expect(created.id).toBe('reco-new');
    expect((created as any).meta.draft).toBe(true);
    expect(prisma.stockReconciliation.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', spaceId: 'space-1', eventId: 'event-1', kind: 'post-event', id: { not: 'reco-new' } },
    });
    expect(push).not.toHaveBeenCalled();
    expect(prisma.inventoryWindow.updateMany).not.toHaveBeenCalled();
  });

  it('finale : feuille remplacée, Logistic mis à jour, post-event clos', async () => {
    await service.createPostEventReconciliation('space-1', dto, 'tenant-1', 'user-1');
    expect(prisma.stockReconciliation.deleteMany).toHaveBeenCalled();
    expect(push).toHaveBeenCalled();
    expect(prisma.inventoryWindow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', spaceId: 'space-1', eventId: 'event-1', phase: 'post-event', status: 'open' },
      }),
    );
    expect(prisma.inventoryWindow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['win-post'] }, status: 'open' } }),
    );
    // PIN conservé (lié à l'event), accès PDV révoqués (document Bertrand 2026-10-06).
    const data = prisma.inventoryWindow.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('pinLookupHash');
    expect(prisma.guestPinAccess.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { windowId: { in: ['win-post'] }, status: 'active' },
        data: expect.objectContaining({ status: 'revoked' }),
      }),
    );
  });

  it('recompter un PDV : articles remis à compter, accès PIN rouvert', async () => {
    await expect(
      service.resetElementForRecount('space-1', 'event-1', 'shop-1', 'tenant-1', 'user-1'),
    ).resolves.toEqual({ resetCount: 12 });
    expect(prisma.inventoryCount.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', spaceId: 'space-1', eventId: 'event-1', shopId: 'shop-1' },
      data: { isCounted: false, countingStatus: 'pending', packedUnits: 0, looseUnits: 0, countedBy: 'user-1' },
    });
    expect(prisma.guestPinAccess.updateMany).toHaveBeenCalledWith({
      where: { windowId: { in: ['win-post'] }, elementId: 'shop-1' },
      data: { submittedAt: null, validatedAt: null, validatedBy: null },
    });
  });
});
