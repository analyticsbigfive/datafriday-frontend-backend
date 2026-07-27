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
    service = new MarketPricesService(mockPrisma, mockStorage);
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
