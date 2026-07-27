import { MenuItemsService } from './menu-items.service';

// BUG-006 (partie dédup forward, même famille que BUG-052) : bulkCreate() n'avait aucun
// garde-fou par nom — chaque ligne du payload était insérée même si un MenuItem du même nom
// existait déjà pour le tenant. Ces tests couvrent le dédoublonnage ajouté : réutilisation d'un
// item existant au lieu d'un doublon, scope par tenant, et insensibilité à la casse.
describe('MenuItemsService.bulkCreate — dédoublonnage par nom', () => {
  const mockPrisma = {
    menuItem: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
  } as any;

  const mockRedis = { deletePattern: jest.fn().mockResolvedValue(undefined) } as any;
  const mockPricing = {} as any;
  const mockStorage = { resolveImage: jest.fn((value) => Promise.resolve(value ?? null)) } as any;

  let service: MenuItemsService;

  beforeEach(() => {
    service = new MenuItemsService(mockPrisma, mockRedis, mockPricing, mockStorage);
    jest.clearAllMocks();
    mockStorage.resolveImage.mockImplementation((value: any) => Promise.resolve(value ?? null));
    mockPrisma.menuItem.createMany.mockResolvedValue({ count: 0 });
  });

  const dto = (name: string, overrides: Record<string, any> = {}) => ({
    name,
    basePrice: 10,
    totalCost: 5,
    margin: 5,
    readyForSale: true,
    comboItem: false,
    numberOfPiecesRecipe: 1,
    ...overrides,
  });

  it('skips a row whose name already exists for the same tenant instead of re-inserting it', async () => {
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { id: 'existing-1', name: 'Coca', typeId: null, categoryId: null, basePrice: 10 },
    ]);

    const result = await service.bulkCreate([dto('Coca')] as any, 'tenant-a');

    expect(mockPrisma.menuItem.createMany).not.toHaveBeenCalled();
    expect(result.count).toBe(0);
    expect(result.duplicatesCount).toBe(1);
    expect(result.duplicates[0]).toEqual(
      expect.objectContaining({ name: 'Coca', reusedItemId: 'existing-1', reason: 'existing_tenant_item' }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ id: 'existing-1', duplicate: true }));
  });

  it('does not treat the same name in a different tenant as a duplicate', async () => {
    // findMany est scopé par tenantId dans le where — pour tenant-b, aucun item "Coca" n'existe.
    mockPrisma.menuItem.findMany.mockImplementation(({ where }: any) => {
      if (where.tenantId === 'tenant-a') {
        return Promise.resolve([{ id: 'existing-1', name: 'Coca', typeId: null, categoryId: null, basePrice: 10 }]);
      }
      return Promise.resolve([]);
    });

    const result = await service.bulkCreate([dto('Coca')] as any, 'tenant-b');

    expect(mockPrisma.menuItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-b', deletedAt: null } }),
    );
    expect(mockPrisma.menuItem.createMany).toHaveBeenCalledTimes(1);
    const inserted = mockPrisma.menuItem.createMany.mock.calls[0][0].data;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].name).toBe('Coca');
    expect(inserted[0].tenantId).toBe('tenant-b');
    expect(result.count).toBe(1);
    expect(result.duplicatesCount).toBe(0);
  });

  it('matches existing names case-insensitively (and trims whitespace)', async () => {
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { id: 'existing-1', name: 'Coca', typeId: null, categoryId: null, basePrice: 10 },
    ]);

    const result = await service.bulkCreate([dto('  COCA  ')] as any, 'tenant-a');

    expect(mockPrisma.menuItem.createMany).not.toHaveBeenCalled();
    expect(result.duplicatesCount).toBe(1);
    expect(result.duplicates[0].reason).toBe('existing_tenant_item');
  });

  it('dedupes duplicate names within the same payload batch (neither pre-existing)', async () => {
    mockPrisma.menuItem.findMany.mockResolvedValue([]);

    const result = await service.bulkCreate([dto('Fanta'), dto('fanta'), dto('Sprite')] as any, 'tenant-a');

    expect(mockPrisma.menuItem.createMany).toHaveBeenCalledTimes(1);
    const inserted = mockPrisma.menuItem.createMany.mock.calls[0][0].data;
    expect(inserted).toHaveLength(2); // "Fanta" + "Sprite" — le doublon "fanta" est sauté
    expect(result.count).toBe(2);
    expect(result.duplicatesCount).toBe(1);
    expect(result.duplicates[0]).toEqual(
      expect.objectContaining({ index: 1, name: 'fanta', reason: 'duplicate_in_batch' }),
    );
    // Réponse positionnelle : toujours 3 entrées, dans l'ordre d'entrée.
    expect(result.items).toHaveLength(3);
    expect(result.items[1]).toEqual(expect.objectContaining({ id: result.items[0].id, duplicate: true }));
  });

  it('inserts all rows normally when no duplicates exist', async () => {
    mockPrisma.menuItem.findMany.mockResolvedValue([]);

    const result = await service.bulkCreate([dto('Pizza'), dto('Burger')] as any, 'tenant-a');

    expect(mockPrisma.menuItem.createMany).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(2);
    expect(result.duplicatesCount).toBe(0);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i: any) => !i.duplicate)).toBe(true);
  });
});
