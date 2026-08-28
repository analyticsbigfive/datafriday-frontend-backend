import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../core/redis/redis.service';
import { MappingsService } from './mappings.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { MenuItemPricingService } from '../../shared/pricing/menu-item-pricing.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';

// ─── Mock Prisma ────────────────────────────────────────────────────────────
const mockPrisma: any = {
  locationSpaceMapping: { findUnique: jest.fn(), findMany: jest.fn() },
  locationShopMapping: { findMany: jest.fn(), count: jest.fn() },
  salesLocation: { findMany: jest.fn() },
  salesTransaction: { findMany: jest.fn() },
  productMapping: { count: jest.fn() },
  aggregationJobLog: { count: jest.fn(), groupBy: jest.fn() },
  event: { count: jest.fn(), groupBy: jest.fn() },
  spaceRevenueMinuteAgg: { count: jest.fn(), groupBy: jest.fn() },
  integration: { findMany: jest.fn() },
};

const mockSpacesService: any = {};
const mockPricingService: any = {};

const TENANT = 'tenant-1';
const INT_A = 'integration-a';
const INT_B = 'integration-b';
const LOCATION_CUID_1 = 'location-cuid-1';
const MERCHANT_ID_1 = 'merchant-1';

describe('MappingsService', () => {
  let service: MappingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MappingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SpacesService, useValue: mockSpacesService },
        { provide: MenuItemPricingService, useValue: mockPricingService },
        { provide: SpaceAccessService, useValue: { hasFullAccess: () => true, getAccessibleSpaceIds: async () => 'ALL' } },
        // BUG-144-01 : purge du cache spaces:unmapped:* à l'écriture de mapping.
        { provide: RedisService, useValue: { deletePattern: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<MappingsService>(MappingsService);
    jest.clearAllMocks();
  });

  // ─── hasShopMappingForIntegration / getShopMappedIntegrationIds (BUG-017/029) ────
  describe('hasShopMappingForIntegration', () => {
    it('détecte un mapping fait via la convention location cuid', async () => {
      mockPrisma.salesLocation.findMany.mockResolvedValue([
        { id: LOCATION_CUID_1, integrationId: INT_A },
      ]);
      mockPrisma.salesTransaction.findMany.mockResolvedValue([]);
      mockPrisma.locationShopMapping.findMany.mockResolvedValue([
        { salesLocationId: LOCATION_CUID_1 },
      ]);

      await expect(service.hasShopMappingForIntegration(TENANT, INT_A)).resolves.toBe(true);
    });

    it('détecte un mapping fait via la convention merchant id', async () => {
      mockPrisma.salesLocation.findMany.mockResolvedValue([]);
      mockPrisma.salesTransaction.findMany.mockResolvedValue([
        { merchantId: MERCHANT_ID_1, integrationId: INT_A },
      ]);
      mockPrisma.locationShopMapping.findMany.mockResolvedValue([
        { salesLocationId: MERCHANT_ID_1 },
      ]);

      await expect(service.hasShopMappingForIntegration(TENANT, INT_A)).resolves.toBe(true);
    });

    it('renvoie false si aucun mapping ne correspond, dans aucune des deux conventions', async () => {
      mockPrisma.salesLocation.findMany.mockResolvedValue([
        { id: LOCATION_CUID_1, integrationId: INT_A },
      ]);
      mockPrisma.salesTransaction.findMany.mockResolvedValue([
        { merchantId: MERCHANT_ID_1, integrationId: INT_A },
      ]);
      mockPrisma.locationShopMapping.findMany.mockResolvedValue([
        { salesLocationId: 'some-other-id-not-mapped-here' },
      ]);

      await expect(service.hasShopMappingForIntegration(TENANT, INT_A)).resolves.toBe(false);
    });

    it("ne fait fuiter aucun mapping d'une autre intégration (isolation multi-intégration)", async () => {
      // Le mapping existe bien en base, mais pour INT_B, pas INT_A.
      mockPrisma.salesLocation.findMany.mockResolvedValue([
        { id: 'loc-b', integrationId: INT_B },
      ]);
      mockPrisma.salesTransaction.findMany.mockResolvedValue([]);
      mockPrisma.locationShopMapping.findMany.mockResolvedValue([{ salesLocationId: 'loc-b' }]);

      await expect(service.hasShopMappingForIntegration(TENANT, INT_A)).resolves.toBe(false);
    });

    it('court-circuite sans requête si integrationIds est vide (via getAllIntegrationProgress)', async () => {
      mockPrisma.integration.findMany.mockResolvedValue([]);

      const result = await service.getAllIntegrationProgress(TENANT);

      expect(result).toEqual({ data: [], meta: { total: 0 } });
      expect(mockPrisma.salesLocation.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── getIntegrationProgress (BUG-017) ────────────────────────────────────
  describe('getIntegrationProgress', () => {
    it('step2 reflète hasShopMappingForIntegration (plus le bug merchantId/locationId)', async () => {
      mockPrisma.locationSpaceMapping.findUnique.mockResolvedValue({
        tenantId: TENANT,
        salesLocationId: INT_A,
        spaceId: 'space-1',
      });
      mockPrisma.salesLocation.findMany.mockResolvedValue([]);
      mockPrisma.salesTransaction.findMany.mockResolvedValue([
        { merchantId: MERCHANT_ID_1, integrationId: INT_A },
      ]);
      mockPrisma.locationShopMapping.findMany.mockResolvedValue([
        { salesLocationId: MERCHANT_ID_1 },
      ]);
      mockPrisma.productMapping.count.mockResolvedValue(0);
      mockPrisma.aggregationJobLog.count.mockResolvedValue(0);
      mockPrisma.event.count.mockResolvedValue(0);
      mockPrisma.spaceRevenueMinuteAgg.count.mockResolvedValue(0);

      const result = await service.getIntegrationProgress(TENANT, INT_A);

      expect(result.steps.step2_shops_mapped).toBe(true);
    });

    it('step2 reste false quand locationMapping (step1) est absent', async () => {
      mockPrisma.locationSpaceMapping.findUnique.mockResolvedValue(null);

      const result = await service.getIntegrationProgress(TENANT, INT_A);

      expect(result.steps.step1_space_mapped).toBe(false);
      expect(result.steps.step2_shops_mapped).toBe(false);
      expect(mockPrisma.salesLocation.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── getAllIntegrationProgress (BUG-017) ─────────────────────────────────
  describe('getAllIntegrationProgress', () => {
    it("calcule step2 par intégration sans fuite croisée, avec les deux conventions", async () => {
      mockPrisma.integration.findMany.mockResolvedValue([
        { id: INT_A, name: 'Intégration A' },
        { id: INT_B, name: 'Intégration B' },
      ]);
      mockPrisma.locationSpaceMapping.findMany.mockResolvedValue([
        { salesLocationId: INT_A, spaceId: 'space-a' },
        { salesLocationId: INT_B, spaceId: 'space-b' },
      ]);
      // INT_A mappée via location cuid, INT_B via merchant id.
      mockPrisma.salesLocation.findMany.mockResolvedValue([
        { id: LOCATION_CUID_1, integrationId: INT_A },
      ]);
      mockPrisma.salesTransaction.findMany.mockResolvedValue([
        { merchantId: MERCHANT_ID_1, integrationId: INT_B },
      ]);
      mockPrisma.locationShopMapping.findMany.mockResolvedValue([
        { salesLocationId: LOCATION_CUID_1 },
        { salesLocationId: MERCHANT_ID_1 },
      ]);
      mockPrisma.productMapping.count.mockResolvedValue(0);
      mockPrisma.aggregationJobLog.groupBy.mockResolvedValue([]);
      mockPrisma.event.groupBy.mockResolvedValue([]);
      mockPrisma.spaceRevenueMinuteAgg.groupBy.mockResolvedValue([]);

      const result = await service.getAllIntegrationProgress(TENANT);

      const byId = new Map(result.data.map((d: any): [string, any] => [d.weezeventLocationId, d]));
      expect(byId.get(INT_A).steps.step2_shops_mapped).toBe(true);
      expect(byId.get(INT_B).steps.step2_shops_mapped).toBe(true);
    });

    it("n'affiche jamais step2=true pour une intégration sans aucun mapping", async () => {
      mockPrisma.integration.findMany.mockResolvedValue([
        { id: INT_A, name: 'Intégration A' },
        { id: INT_B, name: 'Intégration B (aucun mapping)' },
      ]);
      mockPrisma.locationSpaceMapping.findMany.mockResolvedValue([]);
      mockPrisma.salesLocation.findMany.mockResolvedValue([
        { id: LOCATION_CUID_1, integrationId: INT_A },
      ]);
      mockPrisma.salesTransaction.findMany.mockResolvedValue([]);
      mockPrisma.locationShopMapping.findMany.mockResolvedValue([
        { salesLocationId: LOCATION_CUID_1 },
      ]);
      mockPrisma.productMapping.count.mockResolvedValue(0);
      mockPrisma.aggregationJobLog.groupBy.mockResolvedValue([]);
      mockPrisma.event.groupBy.mockResolvedValue([]);
      mockPrisma.spaceRevenueMinuteAgg.groupBy.mockResolvedValue([]);

      const result = await service.getAllIntegrationProgress(TENANT);
      const byId = new Map(result.data.map((d: any): [string, any] => [d.weezeventLocationId, d]));

      expect(byId.get(INT_B).steps.step2_shops_mapped).toBe(false);
    });
  });
});
