import { VentilationDepositsService, normalizeItemName } from './ventilation-deposits.service';

/** Dépôts « Ventilation » : cumul, liste avec annulation, annulation, correspondance d'article. */
describe('VentilationDepositsService', () => {
  let prisma: any;
  let logistics: any;
  let service: VentilationDepositsService;

  beforeEach(() => {
    prisma = {
      stockMovement: { groupBy: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
      spaceElement: { findMany: jest.fn().mockResolvedValue([{ id: 'el-1', name: 'Océane 11' }]) },
      stockLevel: { findMany: jest.fn().mockResolvedValue([]) },
    };
    logistics = { writeReversal: jest.fn().mockResolvedValue({}), getElementItems: jest.fn().mockResolvedValue([]) };
    service = new VentilationDepositsService(prisma, logistics, logistics);
  });

  it('cumule les dépôts du match par élément × article', async () => {
    prisma.stockMovement.groupBy.mockResolvedValueOnce([
      { elementId: 'el-1', itemKey: 'Heineken 33cl', _sum: { packedDelta: 2, looseDelta: 3 } },
      { elementId: 'el-2', itemKey: 'Coca 33cl', _sum: { packedDelta: null, looseDelta: 10 } },
    ]);
    const rows = await service.sumByEvents('space-1', ['ev-1'], 'tenant-1');
    expect(prisma.stockMovement.groupBy.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1', spaceId: 'space-1', eventId: { in: ['ev-1'] }, reason: 'VENTILATION',
    });
    expect(rows).toEqual([
      { elementId: 'el-1', itemKey: 'Heineken 33cl', packed: 2, loose: 3 },
      { elementId: 'el-2', itemKey: 'Coca 33cl', packed: 0, loose: 10 },
    ]);
  });

  it("ne lit rien sans match", async () => {
    await expect(service.sumByEvents('space-1', [''], 'tenant-1')).resolves.toEqual([]);
    await expect(service.listByEvents('space-1', [], 'tenant-1')).resolves.toEqual([]);
  });

  it("lit l'annulation de chaque dépôt affiché, sans dépendre du plafond de la liste", async () => {
    prisma.stockMovement.findMany
      .mockResolvedValueOnce([
        { id: 'mv-1', elementId: 'el-1', itemKey: 'Coca', packedDelta: 2, looseDelta: 0, note: 'Awa', createdBy: 'u', createdAt: new Date() },
        { id: 'mv-2', elementId: 'el-1', itemKey: 'Eau', packedDelta: 1, looseDelta: 0, note: null, createdBy: 'u', createdAt: new Date() },
      ])
      .mockResolvedValueOnce([{ reversesMovementId: 'mv-2' }]);
    const rows = await service.listByEvents('space-1', ['ev-1'], 'tenant-1');
    expect(prisma.stockMovement.findMany.mock.calls[1][0].where).toEqual({ tenantId: 'tenant-1', reversesMovementId: { in: ['mv-1', 'mv-2'] } });
    expect(rows.map((r) => [r.id, r.cancelled, r.elementName, r.depositorName])).toEqual([
      ['mv-1', false, 'Océane 11', 'Awa'],
      ['mv-2', true, 'Océane 11', null],
    ]);
  });

  it("refuse d'annuler le dépôt d'un autre appareil", async () => {
    prisma.stockMovement.findFirst.mockResolvedValueOnce({ id: 'mv-1', reason: 'VENTILATION', reversesMovementId: null, createdBy: 'guest-pin:a:1' });
    await expect(service.cancel('mv-1', 'tenant-1', 'guest-pin:a:2', { requireCreatedBy: 'guest-pin:a:2' })).rejects.toThrow('cet appareil');
    expect(logistics.writeReversal).not.toHaveBeenCalled();
  });

  it("refuse d'annuler un mouvement qui n'est pas un dépôt de ventilation", async () => {
    prisma.stockMovement.findFirst.mockResolvedValueOnce({ id: 'mv-1', reason: 'DELIVERY', reversesMovementId: null });
    await expect(service.cancel('mv-1', 'tenant-1', 'u')).rejects.toThrow('introuvable');
  });

  it("annule par mouvement inverse, avec contrôle d'accès à l'espace pour un utilisateur connecté", async () => {
    const deposit = { id: 'mv-1', reason: 'VENTILATION', reversesMovementId: null, createdBy: 'u' };
    prisma.stockMovement.findFirst.mockResolvedValueOnce(deposit);
    const user = { id: 'u2', isSuperAdmin: false, isOwner: false, allSpacesAccess: false };
    await service.cancel('mv-1', 'tenant-1', 'u2', { user });
    expect(logistics.writeReversal).toHaveBeenCalledWith(deposit, 'u2', user);
  });

  it("retrouve le nom Logistic d'un article (niveau d'abord, puis référentiel)", async () => {
    prisma.stockLevel.findMany.mockResolvedValueOnce([{ itemKey: 'Coca-Cola CAN 33cl' }]);
    await expect(service.resolveElementItemKey('space-1', 'el-1', ' coca-cola can 33CL', 'tenant-1')).resolves.toBe('Coca-Cola CAN 33cl');
    logistics.getElementItems.mockResolvedValueOnce([{ elementId: 'el-1', items: [{ name: 'Bière Pression', unitsPerPack: null }] }]);
    await expect(service.resolveElementItemKey('space-1', 'el-1', 'Biere pression', 'tenant-1')).resolves.toBe('Bière Pression');
  });

  it('donne la taille de pack Logistic, niveau prioritaire sur le référentiel', async () => {
    prisma.stockLevel.findMany.mockResolvedValueOnce([{ elementId: 'el-1', itemKey: 'Coca', unitsPerPack: 12 }]);
    logistics.getElementItems.mockResolvedValueOnce([
      { elementId: 'el-1', items: [{ name: 'Coca', unitsPerPack: 24 }, { name: 'Eau', unitsPerPack: 6 }, { name: 'Vin', unitsPerPack: null }] },
    ]);
    const sizes = await service.packSizes('space-1', 'tenant-1', ['el-1']);
    expect(sizes).toEqual([
      { elementId: 'el-1', itemName: 'Coca', unitsPerPack: 12 },
      { elementId: 'el-1', itemName: 'Eau', unitsPerPack: 6 },
    ]);
  });

  it('normalise les noms comme le front', () => {
    expect(normalizeItemName('  Bière  ')).toBe('biere');
  });
});
