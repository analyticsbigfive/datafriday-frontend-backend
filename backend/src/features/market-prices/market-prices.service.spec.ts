import { MarketPricesService } from './market-prices.service';

// BUG-24: `deduplicate()` used to build its composite key from itemName + supplier only,
// ignoring price/unit/quantity — so two genuinely different MarketPrice rows (different price
// point, different pack size) could be treated as duplicates and one of them silently deleted.
// These tests lock in the tightened key: two rows are only duplicates if itemName, supplier,
// price, unit AND unitsPerPurchase (quantity) all match.
describe('MarketPricesService.deduplicate', () => {
  const mockPrisma = {
    marketPrice: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as any;

  const mockStorage = {} as any;

  let service: MarketPricesService;

  beforeEach(() => {
    service = new MarketPricesService(mockPrisma, mockStorage, { hasFullAccess: () => true, getAccessibleSpaceIds: async () => "ALL" } as any);
    jest.clearAllMocks();
    mockPrisma.marketPrice.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('does NOT treat same product/supplier as duplicates when price differs', async () => {
    mockPrisma.marketPrice.findMany.mockResolvedValue([
      {
        id: 'mp-1',
        itemName: 'Paprika',
        supplierId: 'sup-1',
        supplier: null,
        price: { toString: () => '9.80' },
        unit: 'kg',
        unitsPerPurchase: 1,
      },
      {
        id: 'mp-2',
        itemName: 'Paprika',
        supplierId: 'sup-1',
        supplier: null,
        price: { toString: () => '12.50' },
        unit: 'kg',
        unitsPerPurchase: 1,
      },
    ]);

    const result = await service.deduplicate('tenant-1');

    expect(result.removed).toBe(0);
    expect(mockPrisma.marketPrice.deleteMany).not.toHaveBeenCalled();
  });

  it('does NOT treat same product/supplier/price as duplicates when unit differs', async () => {
    mockPrisma.marketPrice.findMany.mockResolvedValue([
      {
        id: 'mp-1',
        itemName: 'Salade Iceberg',
        supplierId: 'sup-2',
        supplier: null,
        price: { toString: () => '5.00' },
        unit: 'kg',
        unitsPerPurchase: 1,
      },
      {
        id: 'mp-2',
        itemName: 'Salade Iceberg',
        supplierId: 'sup-2',
        supplier: null,
        price: { toString: () => '5.00' },
        unit: 'unit',
        unitsPerPurchase: 1,
      },
    ]);

    const result = await service.deduplicate('tenant-1');

    expect(result.removed).toBe(0);
    expect(mockPrisma.marketPrice.deleteMany).not.toHaveBeenCalled();
  });

  it('does NOT treat same product/supplier/price/unit as duplicates when quantity (unitsPerPurchase) differs', async () => {
    mockPrisma.marketPrice.findMany.mockResolvedValue([
      {
        id: 'mp-1',
        itemName: 'Ketchup - Bidon',
        supplierId: 'sup-3',
        supplier: null,
        price: { toString: () => '21.40' },
        unit: 'unit',
        unitsPerPurchase: 4,
      },
      {
        id: 'mp-2',
        itemName: 'Ketchup - Bidon',
        supplierId: 'sup-3',
        supplier: null,
        price: { toString: () => '21.40' },
        unit: 'unit',
        unitsPerPurchase: 12,
      },
    ]);

    const result = await service.deduplicate('tenant-1');

    expect(result.removed).toBe(0);
    expect(mockPrisma.marketPrice.deleteMany).not.toHaveBeenCalled();
  });

  it('still correctly identifies truly identical rows (including price/unit/quantity) as duplicates', async () => {
    mockPrisma.marketPrice.findMany.mockResolvedValue([
      {
        id: 'mp-newest',
        itemName: 'Badiane',
        supplierId: 'sup-4',
        supplier: null,
        price: { toString: () => '8.54' },
        unit: 'kg',
        unitsPerPurchase: 1,
      },
      {
        id: 'mp-oldest',
        itemName: 'Badiane',
        supplierId: 'sup-4',
        supplier: null,
        price: { toString: () => '8.54' },
        unit: 'kg',
        unitsPerPurchase: 1,
      },
    ]);
    mockPrisma.marketPrice.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.deduplicate('tenant-1');

    expect(result.removed).toBe(1);
    // orderBy createdAt desc means the first row (mp-newest) is kept, the later duplicate deleted.
    expect(mockPrisma.marketPrice.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['mp-oldest'] } },
    });
  });
});

// Import CSV format « packé » (1 ligne = 1 Item, prix fournisseurs empilés avec leur propre
// Market Price ID) : ces tests verrouillent le comportement d'upsert par id dans bulkCreate() —
// un id connu du tenant met à jour la ligne existante ; un id absent ou inconnu (cas du tout
// premier import d'un fichier legacy dont les ids viennent d'un autre système) retombe dans le
// flux de création/dédoublonnage existant, inchangé.
describe('MarketPricesService.bulkCreate — upsert by id', () => {
  const mockPrisma = {
    marketPrice: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const mockStorage = {
    resolveImage: jest.fn().mockResolvedValue(undefined),
  } as any;

  let service: MarketPricesService;

  beforeEach(() => {
    service = new MarketPricesService(mockPrisma, mockStorage, { hasFullAccess: () => true, getAccessibleSpaceIds: async () => "ALL" } as any);
    jest.clearAllMocks();
    mockStorage.resolveImage.mockResolvedValue(undefined);
  });

  it('updates the existing row when dto.id matches a MarketPrice of this tenant', async () => {
    mockPrisma.marketPrice.findFirst.mockResolvedValueOnce({ id: 'mp-existing', tenantId: 'tenant-1' });
    mockPrisma.marketPrice.update.mockResolvedValueOnce({
      id: 'mp-existing',
      itemName: 'Pomme de terre',
      price: '1.10',
    });

    const result = await service.bulkCreate(
      [{ id: 'mp-existing', itemName: 'Pomme de terre', unit: 'kg', price: 1.1, goodType: 'Food' } as any],
      'tenant-1',
    );

    expect(mockPrisma.marketPrice.findFirst).toHaveBeenCalledWith({
      where: { id: 'mp-existing', tenantId: 'tenant-1' },
    });
    expect(mockPrisma.marketPrice.update).toHaveBeenCalledWith({
      where: { id: 'mp-existing' },
      data: expect.objectContaining({ itemName: 'Pomme de terre', unit: 'kg', price: 1.1, goodType: 'Food' }),
    });
    expect(mockPrisma.marketPrice.create).not.toHaveBeenCalled();
    expect(result.updated).toHaveLength(1);
    expect(result.created).toHaveLength(0);
  });

  it('falls back to normal create when dto.id is set but unknown to this tenant (first import of a legacy file)', async () => {
    mockPrisma.marketPrice.findFirst
      .mockResolvedValueOnce(null) // lookup by id: unknown
      .mockResolvedValueOnce(null); // dedup lookup: no exact duplicate
    mockPrisma.marketPrice.create.mockResolvedValueOnce({
      id: 'mp-new-cuid',
      itemName: 'Heineken - 30L',
      price: '93.61',
    });

    const result = await service.bulkCreate(
      [{ id: 'market-price-1762288192688', itemName: 'Heineken - 30L', unit: 'l', price: 93.61, goodType: 'Beverage' } as any],
      'tenant-1',
    );

    expect(mockPrisma.marketPrice.update).not.toHaveBeenCalled();
    expect(mockPrisma.marketPrice.create).toHaveBeenCalledTimes(1);
    expect(result.created).toHaveLength(1);
    expect(result.updated).toHaveLength(0);
  });

  it('keeps the existing create + dedup behavior unchanged when dto.id is absent', async () => {
    mockPrisma.marketPrice.findFirst.mockResolvedValueOnce(null); // dedup lookup only, no id lookup
    mockPrisma.marketPrice.create.mockResolvedValueOnce({
      id: 'mp-new-cuid-2',
      itemName: 'Canelle',
      price: '10.25',
    });

    const result = await service.bulkCreate(
      [{ itemName: 'Canelle', unit: 'kg', price: 10.25, goodType: 'Food' } as any],
      'tenant-1',
    );

    expect(mockPrisma.marketPrice.findFirst).toHaveBeenCalledTimes(1);
    expect(result.created).toHaveLength(1);
    expect(result.updated).toHaveLength(0);
  });
});
