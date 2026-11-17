import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/database/prisma.service';
import { MenuItemPricingService } from '../../../shared/pricing/menu-item-pricing.service';
import { MappingSupportService } from './mapping-support.service';
import { ProductMappingService } from './product-mapping.service';

/**
 * getProductMappings : mode « paires » (opt-in `pairsOnly`) et mode par défaut.
 * Le mode paires lit seulement { weezeventProductId, menuItemId } en un SELECT, sans include,
 * sans count, sans enrichissement de prix. Le mode par défaut reste inchangé.
 */
const mockPrisma: any = {
  productMapping: { findMany: jest.fn(), count: jest.fn() },
  $queryRaw: jest.fn(),
};
const mockPricing: any = { enrichMappingsPricing: jest.fn() };
const mockSupport: any = { withLegacyProductKeys: jest.fn() };

const TENANT = 'tenant-1';
const PAIRS_CAP = 20000;

describe('ProductMappingService.getProductMappings', () => {
  let service: ProductMappingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductMappingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MenuItemPricingService, useValue: mockPricing },
        { provide: MappingSupportService, useValue: mockSupport },
      ],
    }).compile();
    service = module.get(ProductMappingService);
    jest.clearAllMocks();
    mockSupport.withLegacyProductKeys.mockImplementation((m: any) => m);
    mockPricing.enrichMappingsPricing.mockImplementation(async (rows: any[]) => rows);
  });

  describe('mode paires', () => {
    it('lit en un seul findMany avec select, sans include, sans count ni enrichissement', async () => {
      mockPrisma.productMapping.findMany.mockResolvedValue([
        { salesProductId: 'p1', menuItemId: 'm1' },
        { salesProductId: 'p2', menuItemId: 'm2' },
      ]);

      await service.getProductMappings(TENANT, undefined, 1, 200, { pairsOnly: true });

      expect(mockPrisma.productMapping.findMany).toHaveBeenCalledTimes(1);
      const args = mockPrisma.productMapping.findMany.mock.calls[0][0];
      expect(args.select).toEqual({ salesProductId: true, menuItemId: true });
      expect(args.include).toBeUndefined();
      expect(args.orderBy).toBeUndefined();
      expect(args.where).toEqual({ tenantId: TENANT });
      expect(args.take).toBe(PAIRS_CAP);
      expect(mockPrisma.productMapping.count).not.toHaveBeenCalled();
      expect(mockSupport.withLegacyProductKeys).not.toHaveBeenCalled();
      expect(mockPricing.enrichMappingsPricing).not.toHaveBeenCalled();
    });

    it('renvoie des paires { weezeventProductId, menuItemId } et un meta complet', async () => {
      mockPrisma.productMapping.findMany.mockResolvedValue([
        { salesProductId: 'p1', menuItemId: 'm1' },
        { salesProductId: 'p2', menuItemId: 'm2' },
      ]);

      const result = await service.getProductMappings(TENANT, undefined, 1, 200, { pairsOnly: true });

      expect(result.data).toEqual([
        { weezeventProductId: 'p1', menuItemId: 'm1' },
        { weezeventProductId: 'p2', menuItemId: 'm2' },
      ]);
      expect(result.meta).toEqual({ page: 1, limit: 2, total: 2, totalPages: 1, truncated: false });
    });

    it('applique les mêmes filtres que le mode normal (intégration et location)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ productId: 'p1' }, { productId: 'p9' }]);
      mockPrisma.productMapping.findMany.mockResolvedValue([]);

      await service.getProductMappings(TENANT, 'loc-1', 1, 200, { pairsOnly: true, integrationId: 'int-a' });

      const args = mockPrisma.productMapping.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        tenantId: TENANT,
        salesProduct: { integrationId: 'int-a' },
        salesProductId: { in: ['p1', 'p9'] },
      });
    });

    it('signale meta.truncated quand le plafond est atteint', async () => {
      const rows = Array.from({ length: PAIRS_CAP }, (_, i) => ({ salesProductId: `p${i}`, menuItemId: `m${i}` }));
      mockPrisma.productMapping.findMany.mockResolvedValue(rows);

      const result = await service.getProductMappings(TENANT, undefined, 1, 200, { pairsOnly: true });

      expect(result.data).toHaveLength(PAIRS_CAP);
      expect(result.meta).toEqual({
        page: 1,
        limit: PAIRS_CAP,
        total: PAIRS_CAP,
        totalPages: 1,
        truncated: true,
      });
    });
  });

  describe('mode par défaut', () => {
    it('garde findMany avec includes, count et enrichMappingsPricing', async () => {
      const row = { id: 'x1', salesProductId: 'p1', menuItemId: 'm1' };
      mockPrisma.productMapping.findMany.mockResolvedValue([row]);
      mockPrisma.productMapping.count.mockResolvedValue(401);

      const result = await service.getProductMappings(TENANT, undefined, 2, 200);

      expect(mockPrisma.productMapping.findMany).toHaveBeenCalledTimes(1);
      const args = mockPrisma.productMapping.findMany.mock.calls[0][0];
      expect(args.include).toEqual({ salesProduct: { include: { prices: true } }, menuItem: true });
      expect(args.select).toBeUndefined();
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
      expect(args.skip).toBe(200);
      expect(args.take).toBe(200);
      expect(mockPrisma.productMapping.count).toHaveBeenCalledTimes(1);
      expect(mockSupport.withLegacyProductKeys).toHaveBeenCalledTimes(1);
      expect(mockPricing.enrichMappingsPricing).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual([row]);
      expect(result.meta).toEqual({ page: 2, limit: 200, total: 401, totalPages: 3 });
    });
  });
});
