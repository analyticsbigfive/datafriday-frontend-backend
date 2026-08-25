import { Test, TestingModule } from '@nestjs/testing';
import { SpacesService } from './spaces.service';
import { PrismaService } from '../../core/database/prisma.service';
import { WeezeventClientService } from '../weezevent/services/weezevent-client.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { RedisService } from '../../core/redis/redis.service';
import { SupabaseStorageService } from '../../core/supabase/supabase-storage.service';
import { LogisticsService } from '../logistics/logistics.service';
import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';

describe('SpacesService', () => {
  let service: SpacesService;
  let prismaService: PrismaService;

  const mockLogisticsService = {
    getStock: jest.fn(),
    getLiveInventory: jest.fn(),
  };

  const mockPrismaService = {
    space: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    userPinnedSpace: {
      findUnique: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    userSpaceAccess: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    config: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    floor: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    forecourt: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    externalMerch: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    spaceElement: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    menuAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    },
    locationShopMapping: {
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // Builder v2 : le service passe désormais par les zones + adhésions
    // (quickCreateElement / assignElements* → ensureZone / configurationElement).
    // Sans ces mocks, `this.prisma.zone.count` jetait un TypeError non géré qui
    // TUAIT le process jest avant le résumé (4 tests Wizard cassés en silence).
    zone: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    configurationElement: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    event: {
      findMany: jest.fn(),
    },
    locationSpaceMapping: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpacesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: WeezeventClientService,
          useValue: {},
        },
        // getOrSet en passthrough (exécute la factory) : les tests vérifient la logique
        // métier, pas le cache — sans lui, getShopDetails (désormais caché) courtcircuiterait
        // silencieusement ses assertions.
        { provide: RedisService, useValue: { set: jest.fn(), get: jest.fn(), del: jest.fn(), delete: jest.fn(), deletePattern: jest.fn(), getOrSet: jest.fn((key, factory) => factory()), getClient: jest.fn() } },
        // Accès complet par défaut dans les tests (pas de restriction d'espace)
        { provide: SpaceAccessService, useValue: { getAccessibleSpaceIds: jest.fn().mockResolvedValue('ALL'), hasFullAccess: jest.fn().mockReturnValue(true), canAccessSpace: jest.fn().mockResolvedValue(true) } },
        // Passthrough : les tests d'image vérifient le comportement DTO→DB, pas l'upload Storage.
        { provide: SupabaseStorageService, useValue: { resolveImage: jest.fn((value) => Promise.resolve(value)) } },
        { provide: LogisticsService, useValue: mockLogisticsService },
      ],
    }).compile();

    service = module.get<SpacesService>(SpacesService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new space', async () => {
      const tenantId = 'tenant-123';
      const dto = {
        name: 'Test Space',
        image: 'https://example.com/image.jpg',
      };

      const mockSpace = {
        id: 'space-abc123',
        name: dto.name,
        image: dto.image,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenant: {
          id: tenantId,
          name: 'Test Tenant',
          slug: 'test-tenant',
        },
      };

      mockPrismaService.space.create.mockResolvedValue(mockSpace);

      const result = await service.create(tenantId, dto);

      expect(result).toEqual(mockSpace);
      expect(mockPrismaService.space.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: dto.name,
          image: dto.image,
          tenantId,
        }),
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated spaces', async () => {
      const tenantId = 'tenant-123';
      const query = { page: 1, limit: 10 };

      const mockSpaces = [
        {
          id: 'space-1',
          name: 'Space 1',
          tenantId,
          _count: { configs: 2, pinnedByUsers: 1 },
        },
        {
          id: 'space-2',
          name: 'Space 2',
          tenantId,
          _count: { configs: 0, pinnedByUsers: 0 },
        },
      ];

      mockPrismaService.space.findMany.mockResolvedValue(mockSpaces);
      mockPrismaService.space.count.mockResolvedValue(2);

      const result = await service.findAll(tenantId, query, { id: "u", isSuperAdmin: false, role: { systemKey: "ADMIN" } } as any);

      expect(result.data).toEqual(mockSpaces);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter spaces by search term', async () => {
      const tenantId = 'tenant-123';
      const query = { search: 'Test', page: 1, limit: 10 };

      mockPrismaService.space.findMany.mockResolvedValue([]);
      mockPrismaService.space.count.mockResolvedValue(0);

      await service.findAll(tenantId, query, { id: "u", isSuperAdmin: false, role: { systemKey: "ADMIN" } } as any);

      expect(mockPrismaService.space.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            name: {
              contains: 'Test',
              mode: 'insensitive',
            },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a space by id', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';

      const mockSpace = {
        id: spaceId,
        name: 'Test Space',
        tenantId,
        tenant: { id: tenantId, name: 'Test Tenant', slug: 'test-tenant' },
        configs: [],
        _count: { pinnedByUsers: 0, userAccess: 0 },
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);

      const result = await service.findOne(spaceId, tenantId);

      expect(result).toEqual(mockSpace);
    });

    it('should throw NotFoundException if space not found', async () => {
      const spaceId = 'non-existent';
      const tenantId = 'tenant-123';

      mockPrismaService.space.findFirst.mockResolvedValue(null);

      await expect(service.findOne(spaceId, tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a space', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';
      const dto = { name: 'Updated Name' };

      const mockSpace = {
        id: spaceId,
        name: 'Old Name',
        tenantId,
      };

      const updatedSpace = {
        ...mockSpace,
        name: dto.name,
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.space.update.mockResolvedValue(updatedSpace);

      const result = await service.update(spaceId, tenantId, dto);

      expect(result.name).toBe(dto.name);
      expect(mockPrismaService.space.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a space', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';

      const mockSpace = {
        id: spaceId,
        name: 'Test Space',
        tenantId,
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.space.delete.mockResolvedValue(mockSpace);

      const result = await service.remove(spaceId, tenantId);

      expect(result.message).toBe('Space deleted successfully');
      expect(mockPrismaService.space.delete).toHaveBeenCalledWith({
        where: { id: spaceId },
      });
    });
  });

  describe('pin', () => {
    it('should pin a space for a user', async () => {
      const spaceId = 'space-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockSpace = { id: spaceId, name: 'Test Space', tenantId };
      const mockPinned = {
        id: 'pin-123',
        userId,
        spaceId,
        space: { id: spaceId, name: 'Test Space', image: null },
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.userPinnedSpace.findUnique.mockResolvedValue(null);
      mockPrismaService.userPinnedSpace.create.mockResolvedValue(mockPinned);

      const result = await service.pin(spaceId, userId, tenantId);

      expect(result.message).toBe('Space pinned successfully');
      expect(result.pinned).toEqual(mockPinned);
    });

    it('should return message if already pinned', async () => {
      const spaceId = 'space-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockSpace = { id: spaceId, name: 'Test Space', tenantId };
      const existingPin = { id: 'pin-123', userId, spaceId };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.userPinnedSpace.findUnique.mockResolvedValue(existingPin);

      const result = await service.pin(spaceId, userId, tenantId);

      expect(result.message).toBe('Space already pinned');
    });
  });

  describe('unpin', () => {
    it('should unpin a space for a user', async () => {
      const spaceId = 'space-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockSpace = { id: spaceId, name: 'Test Space', tenantId };
      const existingPin = { id: 'pin-123', userId, spaceId };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.userPinnedSpace.findUnique.mockResolvedValue(existingPin);
      mockPrismaService.userPinnedSpace.delete.mockResolvedValue(existingPin);

      const result = await service.unpin(spaceId, userId, tenantId);

      expect(result.message).toBe('Space unpinned successfully');
    });

    it('should throw NotFoundException if not pinned', async () => {
      const spaceId = 'space-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockSpace = { id: spaceId, name: 'Test Space', tenantId };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.userPinnedSpace.findUnique.mockResolvedValue(null);

      await expect(service.unpin(spaceId, userId, tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('grantAccess', () => {
    it('should grant user access to a space', async () => {
      const spaceId = 'space-123';
      const userId = 'user-123';
      const role = 'STAFF';
      const tenantId = 'tenant-123';

      const mockSpace = { id: spaceId, name: 'Test Space', tenantId };
      const mockUser = { id: userId, email: 'user@test.com', tenantId };
      const mockAccess = {
        id: 'access-123',
        userId,
        spaceId,
        role,
        user: mockUser,
        space: mockSpace,
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userSpaceAccess.findUnique.mockResolvedValue(null);
      mockPrismaService.userSpaceAccess.create.mockResolvedValue(mockAccess);

      const result = await service.grantAccess(spaceId, userId, role, tenantId);

      expect(result).toEqual(mockAccess);
    });
  });

  describe('getStatistics', () => {
    it('should return space statistics', async () => {
      const tenantId = 'tenant-123';

      mockPrismaService.space.count.mockResolvedValue(5);
      mockPrismaService.config.count.mockResolvedValue(12);
      mockPrismaService.space.findMany.mockResolvedValue([
        { id: 'space-1', name: 'Space 1', image: null, createdAt: new Date() },
      ]);

      const result = await service.getStatistics(tenantId);

      expect(result.totalSpaces).toBe(5);
      expect(result.totalConfigs).toBe(12);
      expect(result.recentSpaces).toHaveLength(1);
    });
  });

  describe('updateImage', () => {
    it('should update space image', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';
      const image = 'data:image/png;base64,iVBORw0KGgo...';

      const mockSpace = {
        id: spaceId,
        name: 'Test Space',
        tenantId,
      };

      const updatedSpace = {
        id: spaceId,
        name: 'Test Space',
        image,
        updatedAt: new Date(),
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.space.update.mockResolvedValue(updatedSpace);

      const result = await service.updateImage(spaceId, tenantId, image);

      expect(result.image).toBe(image);
      expect(mockPrismaService.space.update).toHaveBeenCalledWith({
        where: { id: spaceId },
        data: { image },
        select: {
          id: true,
          name: true,
          image: true,
          updatedAt: true,
        },
      });
    });

    it('should throw NotFoundException if space not found', async () => {
      const spaceId = 'non-existent';
      const tenantId = 'tenant-123';
      const image = 'data:image/png;base64,iVBORw0KGgo...';

      mockPrismaService.space.findFirst.mockResolvedValue(null);

      await expect(service.updateImage(spaceId, tenantId, image)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getConfigurations', () => {
    it('should return configurations for a space', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';

      const mockSpace = {
        id: spaceId,
        name: 'Test Space',
        tenantId,
      };

      const mockConfigurations = [
        {
          id: 'config-1',
          name: 'Config 1',
          spaceId,
          capacity: 1000,
          data: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { floors: 3, stations: 5 },
        },
        {
          id: 'config-2',
          name: 'Config 2',
          spaceId,
          capacity: 500,
          data: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { floors: 2, stations: 3 },
        },
      ];

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.config.findMany.mockResolvedValue(mockConfigurations);

      const result = await service.getConfigurations(spaceId, tenantId);

      expect(result).toEqual(mockConfigurations);
      expect(result).toHaveLength(2);
      expect(mockPrismaService.config.findMany).toHaveBeenCalledWith({
        where: {
          spaceId,
          space: {
            tenantId,
          },
        },
        // A5/A6 : configs utilisateur d'abord (isSystem=false), puis par ancienneté
        orderBy: [
          { isSystem: 'asc' },
          { createdAt: 'asc' },
        ],
        select: {
          id: true,
          name: true,
          capacity: true,
          isSystem: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              floors: true,
              stations: true,
            },
          },
        },
      });
    });

    it('should return empty array if no accessible configurations exist for the tenant', async () => {
      const spaceId = 'non-existent';
      const tenantId = 'tenant-123';

      mockPrismaService.config.findMany.mockResolvedValue([]);

      await expect(service.getConfigurations(spaceId, tenantId)).resolves.toEqual([]);
    });

    it('should return empty array if no configurations', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';

      const mockSpace = {
        id: spaceId,
        name: 'Test Space',
        tenantId,
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.config.findMany.mockResolvedValue([]);

      const result = await service.getConfigurations(spaceId, tenantId);

      expect(result).toEqual([]);
    });
  });

  describe('getConfiguration', () => {
    it('should return a configuration only if it belongs to the tenant', async () => {
      mockPrismaService.config.findFirst.mockResolvedValue({
        id: 'config-1',
        name: 'Config 1',
        spaceId: 'space-1',
        capacity: 100,
        data: { floors: [], forecourt: null },
        createdAt: new Date(),
        updatedAt: new Date(),
        space: { id: 'space-1', name: 'Space 1', tenantId: 'tenant-123' },
      });

      const result = await service.getConfiguration('config-1', 'tenant-123');

      expect(result.spaceId).toBe('space-1');
      expect(mockPrismaService.config.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'config-1',
            space: { tenantId: 'tenant-123' },
          },
        }),
      );
    });

    it('should throw NotFoundException when configuration is not accessible for tenant', async () => {
      mockPrismaService.config.findFirst.mockResolvedValue(null);

      await expect(service.getConfiguration('config-404', 'tenant-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('saveConfiguration', () => {
    it('should reject updating a configuration tied to another space', async () => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: 'space-1', tenantId: 'tenant-123' });
      mockPrismaService.config.findFirst.mockResolvedValue({
        id: 'config-1',
        name: 'Config 1',
        spaceId: 'space-2',
        capacity: 100,
        data: { floors: [], forecourt: null },
        createdAt: new Date(),
        updatedAt: new Date(),
        space: { id: 'space-2', name: 'Space 2', tenantId: 'tenant-123' },
      });

      await expect(
        service.saveConfiguration(
          {
            id: 'config-1',
            name: 'Updated config',
            spaceId: 'space-1',
            capacity: 100,
            data: { floors: [], forecourt: null },
          },
          'tenant-123',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('setPinnedSpaces', () => {
    it('should set pinned spaces for a user', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const spaceIds = ['space-1', 'space-2'];

      const validSpaces = [
        { id: 'space-1' },
        { id: 'space-2' },
      ];

      const pinnedSpaces = [
        {
          id: 'space-1',
          name: 'Space 1',
          image: null,
          _count: { configs: 2 },
        },
        {
          id: 'space-2',
          name: 'Space 2',
          image: null,
          _count: { configs: 1 },
        },
      ];

      mockPrismaService.space.findMany
        .mockResolvedValueOnce(validSpaces) // For validation
        .mockResolvedValueOnce(pinnedSpaces); // For getPinned
      mockPrismaService.userPinnedSpace.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.userPinnedSpace.createMany.mockResolvedValue({ count: 2 });
      mockPrismaService.userPinnedSpace.findMany.mockResolvedValue(
        pinnedSpaces.map((s) => ({ space: s })),
      );

      const result = await service.setPinnedSpaces(userId, tenantId, spaceIds, { id: userId, isSuperAdmin: false, role: { systemKey: "ADMIN" } } as any);

      expect(mockPrismaService.userPinnedSpace.deleteMany).toHaveBeenCalled();
      expect(mockPrismaService.userPinnedSpace.createMany).toHaveBeenCalledWith({
        data: [
          { userId, spaceId: 'space-1' },
          { userId, spaceId: 'space-2' },
        ],
      });
      expect(result).toHaveLength(2);
    });

    it('should handle empty spaceIds array', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const spaceIds: string[] = [];

      // Reset mocks specifically for this test
      mockPrismaService.space.findMany.mockReset();
      mockPrismaService.userPinnedSpace.createMany.mockReset();
      mockPrismaService.userPinnedSpace.deleteMany.mockReset();
      mockPrismaService.userPinnedSpace.findMany.mockReset();

      mockPrismaService.space.findMany.mockResolvedValue([]);
      mockPrismaService.userPinnedSpace.deleteMany.mockResolvedValue({ count: 2 });
      mockPrismaService.userPinnedSpace.findMany.mockResolvedValue([]);

      const result = await service.setPinnedSpaces(userId, tenantId, spaceIds, { id: userId, isSuperAdmin: false, role: { systemKey: "ADMIN" } } as any);

      expect(mockPrismaService.userPinnedSpace.deleteMany).toHaveBeenCalled();
      expect(mockPrismaService.userPinnedSpace.createMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should only pin valid spaces from the tenant', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const spaceIds = ['space-1', 'space-invalid', 'space-2'];

      // Only space-1 and space-2 are valid
      const validSpaces = [
        { id: 'space-1' },
        { id: 'space-2' },
      ];

      mockPrismaService.space.findMany.mockResolvedValueOnce(validSpaces);
      mockPrismaService.userPinnedSpace.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.userPinnedSpace.createMany.mockResolvedValue({ count: 2 });
      mockPrismaService.userPinnedSpace.findMany.mockResolvedValue([
        { space: { id: 'space-1', name: 'Space 1' } },
        { space: { id: 'space-2', name: 'Space 2' } },
      ]);

      await service.setPinnedSpaces(userId, tenantId, spaceIds, { id: userId, isSuperAdmin: false, role: { systemKey: "ADMIN" } } as any);

      expect(mockPrismaService.userPinnedSpace.createMany).toHaveBeenCalledWith({
        data: [
          { userId, spaceId: 'space-1' },
          { userId, spaceId: 'space-2' },
        ],
      });
    });
  });

  describe('create with all fields', () => {
    it('should create a space with all optional fields', async () => {
      const tenantId = 'tenant-123';
      const dto = {
        name: 'Emirates Stadium',
        image: 'https://example.com/stadium.jpg',
        spaceType: 'Stadium',
        maxCapacity: 60000,
        department: 75,
        homeTeam: 'Arsenal FC',
        addressLine1: 'Hornsey Road',
        addressLine2: 'Highbury House',
        city: 'London',
        postcode: 'N7 7AJ',
        country: 'United Kingdom',
        tel: '+44 20 7619 5003',
        email: 'info@arsenal.com',
        mainContactPerson: 'John Smith',
        contactEmail: 'john.smith@arsenal.com',
        contactTel: '+44 20 1234 5678',
        instagram: '@arsenal',
        tiktok: '@arsenal',
        facebook: '@arsenal',
        twitter: '@arsenal',
      };

      const mockSpace = {
        id: 'space-abc123',
        ...dto,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenant: {
          id: tenantId,
          name: 'Test Tenant',
          slug: 'test-tenant',
        },
      };

      mockPrismaService.space.create.mockResolvedValue(mockSpace);

      const result = await service.create(tenantId, dto);

      expect(result).toEqual(mockSpace);
      expect(mockPrismaService.space.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: dto.name,
          image: dto.image,
          spaceType: dto.spaceType,
          maxCapacity: dto.maxCapacity,
          department: dto.department,
          homeTeam: dto.homeTeam,
          addressLine1: dto.addressLine1,
          city: dto.city,
          country: dto.country,
          tel: dto.tel,
          email: dto.email,
          instagram: dto.instagram,
          tenantId,
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('getShopDetails — cache Redis (chemin critique premier rendu /analyse)', () => {
    it('délègue à redis.getOrSet avec une clé tenant+space+params et TTL 60s', async () => {
      const redis = (service as any).redis;
      (mockPrismaService as any).$queryRaw = jest
        .fn()
        .mockResolvedValue([{ get_space_shop_details: { shops: [] } }]);

      await service.getShopDetails('space-1', 'tenant-1', 2, 50, true);

      expect(redis.getOrSet).toHaveBeenCalledWith(
        'spaces:shopdetails:tenant-1:space-1:2:50:1',
        expect.any(Function),
        { ttl: 60 },
      );
    });

    it('ne met pas en cache une erreur space_not_found (la factory jette)', async () => {
      (mockPrismaService as any).$queryRaw = jest
        .fn()
        .mockResolvedValue([{ get_space_shop_details: { __error: 'space_not_found' } }]);

      await expect(service.getShopDetails('space-x', 'tenant-1')).rejects.toThrow();
    });
  });

  describe('getShopDetails — status filter', () => {
    it('should use status = V (not completed) in the shop granular SQL', async () => {
      const tenantId = 'tenant-123';
      const spaceId = 'space-abc';

      // Stub findOne / space lookup
      mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
      // No configs → query raw won't run
      mockPrismaService.config.findMany.mockResolvedValue([]);
      mockPrismaService.spaceElement = { findMany: jest.fn().mockResolvedValue([]) };

      // The method will call $queryRaw with the SQL template.
      // We capture the raw SQL string to assert on its content.
      const rawQueryMock = jest.fn().mockResolvedValue([]);
      (mockPrismaService as any).$queryRaw = rawQueryMock;
      (mockPrismaService as any).weezeventAttendee = { groupBy: jest.fn().mockResolvedValue([]) };
      (mockPrismaService as any).salesEvent = {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
      };

      // Trigger getShopDetails — it may throw for unrelated reasons after SQL,
      // but we only care about what $queryRaw received.
      await service.getShopDetails(spaceId, tenantId).catch(() => {});

      // Verify all $queryRaw calls — none should contain 'completed'
      for (const call of rawQueryMock.mock.calls) {
        const sqlParts: string[] = call[0]?.strings ?? [];
        const fullSql = sqlParts.join('');
        expect(fullSql).not.toContain("'completed'");
        if (fullSql.includes('WeezeventTransaction')) {
          expect(fullSql).toContain("'V'");
        }
      }
    });
  });

  // Donut « Répartition des catégories de produits par transaction » : seule lecture
  // du code qui préserve l'identité du panier (getEventTimelineBatch écrase t.id en
  // COUNT(DISTINCT)). Un double comptage ici fausserait TOUS les pourcentages affichés.
  describe('getTransactionBasketsBatch', () => {
    const spaceId = 'space-1';
    const tenantId = 'tenant-1';

    beforeEach(() => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
      mockPrismaService.locationSpaceMapping.findMany.mockResolvedValue([{ salesLocationId: 'integ-1' }]);
      mockPrismaService.config.findMany.mockResolvedValue([]);
      mockPrismaService.spaceElement.findMany.mockResolvedValue([{ id: 'el-1' }]);
      mockPrismaService.event.findMany.mockResolvedValue([
        { id: 'ev-1', eventDate: new Date('2026-03-01T18:00:00Z'), eventEndDate: null },
      ]);
      (mockPrismaService as any).salesEvent = { findMany: jest.fn().mockResolvedValue([]) };
      mockPrismaService.$queryRaw.mockResolvedValue([]);
    });

    it('retourne un objet vide sans requête quand aucun eventId n’est fourni', async () => {
      const res = await service.getTransactionBasketsBatch(spaceId, [], tenantId);

      expect(res).toEqual({});
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
    });

    it('applique les prédicats obligatoires de lecture des ventes (BUG-028 / BUG-108)', async () => {
      await service.getTransactionBasketsBatch(spaceId, ['ev-1'], tenantId).catch(() => {});

      const call = mockPrismaService.$queryRaw.mock.calls.at(-1);
      const sql: string = (call?.[0]?.strings ?? []).join('');

      expect(sql).toContain("t.status = 'V'");
      expect(sql).toContain('t."deletedAt" IS NULL');
      expect(sql).not.toContain("'completed'");
      // Le panier doit être l'unité de groupement de la CTE, sinon double comptage.
      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('t.id');
    });

    // BUG-136-01 : un espace peut être alimenté par PLUSIEURS intégrations Weezevent.
    // Le scope n'en retenait qu'UNE (findFirst sans orderBy) et le filtre
    // t."integrationId" = <celle-là> vidait ce donut de toutes les ventes de l'autre —
    // « 0 transactions » pendant que le reste de la page (qui lit la pré-agrégat, sans
    // ce filtre) continuait d'afficher le CA de l'event.
    it('scope les ventes sur TOUTES les intégrations de l’espace, pas une seule', async () => {
      mockPrismaService.locationSpaceMapping.findMany.mockResolvedValue([
        { salesLocationId: 'integ-1' },
        { salesLocationId: 'integ-2' },
      ]);

      await service.getTransactionBasketsBatch(spaceId, ['ev-1'], tenantId).catch(() => {});

      const call = mockPrismaService.$queryRaw.mock.calls.at(-1);
      const sql: string = (call?.[0]?.strings ?? []).join('');
      const values: any[] = call?.[0]?.values ?? [];

      expect(sql).toContain('t."integrationId" = ANY(');
      expect(values).toContainEqual(['integ-1', 'integ-2']);
    });

    it('sans aucune intégration mappée : pas de filtre intégration, scope PdV strict', async () => {
      mockPrismaService.locationSpaceMapping.findMany.mockResolvedValue([]);

      await service.getTransactionBasketsBatch(spaceId, ['ev-1'], tenantId).catch(() => {});

      const sql: string = (mockPrismaService.$queryRaw.mock.calls.at(-1)?.[0]?.strings ?? []).join('');
      expect(sql).not.toContain('t."integrationId"');
      // Mode dégradé tenant-wide : les PdV non mappés ne doivent PAS entrer.
      expect(sql).not.toContain('mem."spaceElementId" IS NULL OR');
    });

    // BUG-136-01 : sans minuteLocal, le curseur horaire (bornes DATÉES depuis
    // BUG-351-01) comparait des instants à un simple HH:MM et vidait les donuts
    // paniers dès qu'un event franchissait minuit.
    it('expose la minute DATÉE (minuteLocal), comme getEventTimelineBatch', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          eventId: 'ev-1',
          minute: '19:42',
          minuteLocal: '2026-03-01T19:42',
          shopId: 'el-1',
          shopName: 'Bar Nord',
          categoryCombo: ['Bières'],
          typeCombo: ['Beverage'],
          itemCombo: ['Heineken'],
          transactionCount: 3,
          quantity: 4,
          revenueHt: '12.00',
        },
      ]);

      const res = await service.getTransactionBasketsBatch(spaceId, ['ev-1'], tenantId);

      expect(res['ev-1'][0].minuteLocal).toBe('2026-03-01T19:42');
      expect(res['ev-1'][0].minute).toBe('19:42');
    });

    it('trie les combinaisons côté SQL — « Bières, Consigne » et « Consigne, Bières » sont un seul bucket', async () => {
      await service.getTransactionBasketsBatch(spaceId, ['ev-1'], tenantId).catch(() => {});

      const sql: string = (mockPrismaService.$queryRaw.mock.calls.at(-1)?.[0]?.strings ?? []).join('');
      expect(sql).toContain('ARRAY_AGG(DISTINCT pc.name ORDER BY pc.name)');
      // Repli sur le libellé fournisseur quand le produit n'est pas mappé.
      expect(sql).toContain('COALESCE(mi.name, ti."productName")');
    });

    // Le donut « type d'article » de la page filtre le graphique en sémantique
    // « contient » (question #42) : sans typeCombo, cliquer une part de ce donut
    // viderait le camembert au lieu de le restreindre.
    it('remonte aussi la combinaison de TYPES d’article', async () => {
      await service.getTransactionBasketsBatch(spaceId, ['ev-1'], tenantId).catch(() => {});

      const sql: string = (mockPrismaService.$queryRaw.mock.calls.at(-1)?.[0]?.strings ?? []).join('');
      expect(sql).toContain('ARRAY_AGG(DISTINCT pt.name ORDER BY pt.name)');
      expect(sql).toContain('LEFT JOIN "ProductType"');
    });

    // Décision JLH 2026-08-24 (BUG-137-01, après aller-retour) : les ventes non
    // mappées restent COMPTÉES, affichées « Non mappées » — jamais filtrées ici. Le
    // volume non mappé est mesuré à part par getAnalyseUnmappedBatch (bandeau).
    it('n’écarte JAMAIS les lignes non résolues (ni mapping, ni catégorie)', async () => {
      await service.getTransactionBasketsBatch(spaceId, ['ev-1'], tenantId).catch(() => {});

      const sql: string = (mockPrismaService.$queryRaw.mock.calls.at(-1)?.[0]?.strings ?? []).join('');
      // Convention maison : afficher « Non mappées » plutôt que sous-compter en silence.
      expect(sql).not.toContain('wpm."menuItemId" IS NOT NULL');
      expect(sql).not.toContain('pc.name IS NOT NULL');
      expect(sql).toContain('LEFT JOIN "ProductCategory"');
      expect(sql).toContain('LEFT JOIN "MenuItem"');
      // PdV non mappés : gardés eux aussi (branche permissive) dès qu'une intégration
      // scope la requête — ils remontent dans le bucket « Non rattachés ».
      expect(sql).toContain('mem."spaceElementId" IS NULL OR');
    });

    it('un panier de 2 lignes = UNE combinaison à 2 catégories, transactionCount 1', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          eventId: 'ev-1',
          minute: '20:30',
          shopId: 'el-1',
          shopName: 'Bar Nord',
          shopType: 'beverages',
          shopArea: 'Niveau 0',
          categoryCombo: ['Bières', 'Boissons Soft'],
          typeCombo: ['Beverage'],
          itemCombo: ['50cl Heineken', 'Coca Cola'],
          transactionCount: 1,
          quantity: 2,
          revenueHt: '9.50',
        },
      ]);

      const res = await service.getTransactionBasketsBatch(spaceId, ['ev-1'], tenantId);

      expect(res['ev-1']).toHaveLength(1);
      expect(res['ev-1'][0]).toMatchObject({
        categoryCombo: ['Bières', 'Boissons Soft'],
        typeCombo: ['Beverage'],
        itemCombo: ['50cl Heineken', 'Coca Cola'],
        transactionCount: 1,
        quantity: 2,
        revenueHt: 9.5,
      });
    });

    it('conserve le null d’une ligne non résolue DANS la combinaison', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          eventId: 'ev-1',
          minute: '21:00',
          shopId: 'loc-brut',
          shopName: 'PdV non mappé',
          shopType: null,
          shopArea: null,
          categoryCombo: ['Bières', null],
          itemCombo: ['50cl Heineken', 'Produit inconnu'],
          transactionCount: 3,
          quantity: 6,
          revenueHt: '21.00',
        },
      ]);

      const res = await service.getTransactionBasketsBatch(spaceId, ['ev-1'], tenantId);

      expect(res['ev-1'][0].categoryCombo).toEqual(['Bières', null]);
      expect(res['ev-1'][0].transactionCount).toBe(3);
    });

    it('ignore les lignes dont l’eventId n’a pas été demandé', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        { eventId: 'ev-inconnu', minute: '20:00', categoryCombo: ['Bières'], itemCombo: [], transactionCount: 5 },
      ]);

      const res = await service.getTransactionBasketsBatch(spaceId, ['ev-1'], tenantId);

      expect(res['ev-1']).toEqual([]);
      expect(res['ev-inconnu']).toBeUndefined();
    });
  });

  // BUG-130-01 : la lecture de SpaceRevenueMinuteItemAgg doit dédupliquer les lignes
  // jumelles des deux writers (MAX au grain merchant, seul "weezeventEventId" écrasé)
  // PUIS sommer les merchants/locations distincts. Le MAX à un seul niveau du commit
  // perf event-timeline-item-agg plafonnait chaque minute à la plus grosse ligne →
  // timeline réelle aplatie en plateau constant.
  // BUG-137-01 — volume NON MAPPÉ, informatif (bandeau) : ne filtre rien.
  describe('getAnalyseUnmappedBatch', () => {
    const spaceId = 'space-1';
    const tenantId = 'tenant-1';

    beforeEach(() => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
      mockPrismaService.locationSpaceMapping.findMany.mockResolvedValue([{ salesLocationId: 'integ-1' }]);
      mockPrismaService.config.findMany.mockResolvedValue([]);
      mockPrismaService.spaceElement.findMany.mockResolvedValue([{ id: 'el-1' }]);
      mockPrismaService.event.findMany.mockResolvedValue([
        { id: 'ev-1', eventDate: new Date('2026-03-01T18:00:00Z'), eventEndDate: null },
      ]);
      (mockPrismaService as any).salesEvent = { findMany: jest.fn().mockResolvedValue([]) };
      mockPrismaService.$queryRaw.mockResolvedValue([]);
    });

    it('retourne des zéros (pas des trous) pour un event entièrement mappé', async () => {
      const res = await service.getAnalyseUnmappedBatch(spaceId, ['ev-1'], tenantId);

      expect(res['ev-1']).toEqual({
        unmappedLines: 0,
        unmappedUnits: 0,
        unmappedRevenueHt: 0,
        unmappedProductLines: 0,
        unmappedPosLines: 0,
      });
    });

    it('cible produit OU PdV non mappé, avec les mêmes prédicats de lecture que la page', async () => {
      await service.getAnalyseUnmappedBatch(spaceId, ['ev-1'], tenantId);

      const sql: string = (mockPrismaService.$queryRaw.mock.calls.at(-1)?.[0]?.strings ?? []).join('');
      expect(sql).toContain('wpm."menuItemId" IS NULL OR mem."spaceElementId" IS NULL');
      // Les ventes mappées vers les shops d'un AUTRE espace ne sont pas comptées ici.
      expect(sql).toContain('mem."spaceElementId" IS NULL OR mem."spaceElementId" = ANY(');
      // Mêmes prédicats que event-timeline / transaction-baskets.
      expect(sql).toContain("t.status = 'V'");
      expect(sql).toContain('t."deletedAt" IS NULL');
    });

    it('mappe les lignes SQL par eventId et convertit en nombres', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          eventId: 'ev-1',
          unmappedLines: 12,
          unmappedUnits: 30,
          unmappedRevenueHt: '145.50',
          unmappedProductLines: 10,
          unmappedPosLines: 2,
        },
      ]);

      const res = await service.getAnalyseUnmappedBatch(spaceId, ['ev-1'], tenantId);

      expect(res['ev-1'].unmappedRevenueHt).toBe(145.5);
      expect(res['ev-1'].unmappedProductLines).toBe(10);
    });
  });

  describe('getEventTimelineBatch', () => {
    const spaceId = 'space-1';
    const tenantId = 'tenant-1';

    beforeEach(() => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
      mockPrismaService.locationSpaceMapping.findMany.mockResolvedValue([{ salesLocationId: 'integ-1' }]);
      mockPrismaService.config.findMany.mockResolvedValue([]);
      mockPrismaService.spaceElement.findMany.mockResolvedValue([{ id: 'el-1' }]);
      mockPrismaService.event.findMany.mockResolvedValue([
        { id: 'ev-1', eventDate: new Date('2026-03-01T18:00:00Z'), eventEndDate: null },
      ]);
      (mockPrismaService as any).salesEvent = { findMany: jest.fn().mockResolvedValue([]) };
      mockPrismaService.$queryRaw.mockResolvedValue([]);
    });

    // BUG-137-01 : les produits non mappés restent DANS le flux (menuItemId null),
    // affichés « Non mappées » côté page — pas de WHERE d'exclusion sur le mapping.
    it('renvoie aussi les produits non mappés (pas de filtre wpm dans le WHERE)', async () => {
      await service.getEventTimelineBatch(spaceId, ['ev-1'], tenantId).catch(() => {});

      const sql: string = (mockPrismaService.$queryRaw.mock.calls.at(-1)?.[0]?.strings ?? []).join('');
      expect(sql).not.toContain('wpm."menuItemId" IS NOT NULL');
      expect(sql).toContain('LEFT JOIN "WeezeventProductMapping"');
    });

    it('déduplique par merchant (MAX interne) puis SOMME au grain affichage (BUG-130-01)', async () => {
      await service.getEventTimelineBatch(spaceId, ['ev-1'], tenantId).catch(() => {});

      const sql: string = (mockPrismaService.$queryRaw.mock.calls.at(-1)?.[0]?.strings ?? []).join('');
      // Niveau interne : le merchant reste dans le GROUP BY de la CTE dedup…
      expect(sql).toContain('dedup AS (');
      expect(sql).toContain('mem."weezeventMerchantId", mem."weezeventProductId"');
      expect(sql).toContain('MAX(mem."revenueHt")');
      // …et le niveau affichage ADDITIONNE les lignes dédupliquées.
      expect(sql).toContain('SUM(dd."revenueHt")');
      expect(sql).toContain('SUM(dd."itemsCount")');
      expect(sql).not.toContain('MAX(dd.');
    });

    it('mappe les lignes SQL vers le shape timeline attendu par le front', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          eventId: 'ev-1',
          minute: '20:30',
          shopId: 'el-1',
          shopName: 'Bar Nord',
          shopType: 'beverages',
          shopArea: null,
          weezeventProductId: 'wp-1',
          menuItemId: 'mi-1',
          menuItemName: 'Bière blonde 50cl',
          menuItemType: 'Beverage',
          menuItemCategory: 'Bières',
          quantity: 3,
          transactionCount: 2,
          revenueHt: '12.50',
        },
      ]);

      const res = await service.getEventTimelineBatch(spaceId, ['ev-1'], tenantId);

      expect(res['ev-1']).toHaveLength(1);
      expect(res['ev-1'][0]).toMatchObject({
        minute: '20:30',
        shopId: 'el-1',
        menuItemId: 'mi-1',
        quantity: 3,
        transactionCount: 2,
        revenueHt: 12.5,
        revenue: 12.5,
      });
    });

    // BUG-364-01 (étape 5) : granularity=summary — grain event × shop × produit, SANS minute.
    it('summary : le SQL n’a ni minuteLocal ni GROUP BY minute au niveau affichage', async () => {
      await service.getEventTimelineBatch(spaceId, ['ev-1'], tenantId, { granularity: 'summary' }).catch(() => {});

      const sql: string = (mockPrismaService.$queryRaw.mock.calls.at(-1)?.[0]?.strings ?? []).join('');
      // La dédup inter-writers reste PAR minute (CTE interne)…
      expect(sql).toContain('dedup AS (');
      expect(sql).toContain('mem."minute"');
      // …mais le niveau affichage n’expose plus la minute.
      expect(sql).not.toContain('tz."minuteLocal"');
      expect(sql).not.toContain('AS "minuteLocal"');
      expect(sql).toContain('SUM(dd."revenueHt")');
    });

    it('summary : lignes sans minute ni doublon revenue, cache Redis sous une clé distincte (:sum)', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          eventId: 'ev-1',
          shopId: 'el-1',
          shopName: 'Bar Nord',
          shopType: 'beverages',
          shopArea: null,
          weezeventProductId: 'wp-1',
          menuItemId: 'mi-1',
          menuItemName: 'Bière blonde 50cl',
          menuItemType: 'Beverage',
          menuItemCategory: 'Bières',
          quantity: 3,
          transactionCount: 2,
          revenueHt: '12.50',
        },
      ]);

      const res = await service.getEventTimelineBatch(spaceId, ['ev-1'], tenantId, { granularity: 'summary' });

      expect(res['ev-1']).toHaveLength(1);
      expect(res['ev-1'][0]).toMatchObject({ shopId: 'el-1', menuItemId: 'mi-1', revenueHt: 12.5 });
      expect(res['ev-1'][0]).not.toHaveProperty('minute');
      expect(res['ev-1'][0]).not.toHaveProperty('minuteLocal');
      expect(res['ev-1'][0]).not.toHaveProperty('revenue');
      // Clé de cache suffixée ':sum' — jamais mélangée avec le grain minute,
      // mais couverte par le motif de purge spaces:evtimeline:{t}:{s}:*.
      const writtenKeys = ((service as any).redis.set as jest.Mock).mock.calls.map((c: any[]) => c[0]);
      expect(writtenKeys).toContain(`spaces:evtimeline:${tenantId}:${spaceId}:ev-1:sum`);
    });
  });

  // BUG-339-02 : la fenêtre de vente d'un event doit se terminer à son heure de fin réelle
  // (Event.eventEndTime sur eventEndDate), pas au jour calendaire entier "+1 jour" — sinon un
  // event finissant après minuit (eventEndDate = lendemain) absorbe tout le CA de l'event du
  // lendemain (PFC - RC Lens 48k€ affiché 184k€). Et la fenêtre de l'event suivant doit
  // commencer à l'heure de fin du précédent, pas à minuit.
  describe('resolveEventSalesScope — fenêtres à l’heure de fin réelle (BUG-339-02)', () => {
    const spaceId = 'space-1';
    const tenantId = 'tenant-1';

    // Timezone par défaut Europe/Paris (space.findFirst ne renvoie pas de timezone) ;
    // en février, UTC+1 → "03:00" local = 02:00Z.
    const pfc = {
      id: 'ev-pfc',
      eventDate: new Date('2026-02-14T00:00:00.000Z'),
      eventEndDate: new Date('2026-02-15T00:00:00.000Z'),
      eventEndTime: '03:00',
      sessions: null,
    };
    const sfp = {
      id: 'ev-sfp',
      eventDate: new Date('2026-02-15T00:00:00.000Z'),
      eventEndDate: new Date('2026-02-16T00:00:00.000Z'),
      eventEndTime: '04:00',
      sessions: null,
    };

    const mockEvents = (all: any[]) => {
      // 1er findMany (batch, filtré par id) vs 2e (tous les events de l'espace).
      mockPrismaService.event.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where?.id ? all.filter((e) => where.id.in.includes(e.id)) : all),
      );
    };

    // Les bornes passées au VALUES CTE : chaque fenêtre est (id::text, start::timestamp,
    // end::timestamp) dans les paramètres de la requête, dans cet ordre.
    const windowsFromLastQuery = (): Record<string, { start: Date; end: Date }> => {
      const sqlObj: any = mockPrismaService.$queryRaw.mock.calls.at(-1)?.[0];
      const values: any[] = sqlObj?.values ?? [];
      const out: Record<string, { start: Date; end: Date }> = {};
      for (let i = 0; i < values.length - 2; i++) {
        if (typeof values[i] === 'string' && values[i + 1] instanceof Date && values[i + 2] instanceof Date) {
          out[values[i]] = { start: values[i + 1], end: values[i + 2] };
        }
      }
      return out;
    };

    beforeEach(() => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
      mockPrismaService.locationSpaceMapping.findMany.mockResolvedValue([{ salesLocationId: 'integ-1' }]);
      mockPrismaService.config.findMany.mockResolvedValue([]);
      mockPrismaService.spaceElement.findMany.mockResolvedValue([{ id: 'el-1' }]);
      (mockPrismaService as any).salesEvent = { findMany: jest.fn().mockResolvedValue([]) };
      mockPrismaService.$queryRaw.mockResolvedValue([]);
    });

    it('resserre la fin de fenêtre sur eventEndTime et démarre l’event suivant à cette borne (PFC/SFP)', async () => {
      mockEvents([pfc, sfp]);

      await service.getEventTimelineBatch(spaceId, ['ev-pfc', 'ev-sfp'], tenantId);

      const w = windowsFromLastQuery();
      // PFC : minuit du 14/02 → 15/02 03:00 Paris (02:00Z), plus 16/02 (jour entier +1).
      expect(w['ev-pfc'].start.toISOString()).toBe('2026-02-14T00:00:00.000Z');
      expect(w['ev-pfc'].end.toISOString()).toBe('2026-02-15T02:00:00.000Z');
      // SFP : démarre à la fin de PFC (02:00Z), pas à minuit ; finit 16/02 04:00 Paris (03:00Z).
      expect(w['ev-sfp'].start.toISOString()).toBe('2026-02-15T02:00:00.000Z');
      expect(w['ev-sfp'].end.toISOString()).toBe('2026-02-16T03:00:00.000Z');
      // Aucun chevauchement : c'était le double comptage du bug.
      expect(w['ev-pfc'].end.getTime()).toBeLessThanOrEqual(w['ev-sfp'].start.getTime());
    });

    it('exclut la tranche de tête même quand l’event précédent est HORS du batch demandé', async () => {
      mockEvents([pfc, sfp]);

      await service.getEventTimelineBatch(spaceId, ['ev-sfp'], tenantId);

      const w = windowsFromLastQuery();
      expect(w['ev-pfc']).toBeUndefined();
      expect(w['ev-sfp'].start.toISOString()).toBe('2026-02-15T02:00:00.000Z');
    });

    it('sans eventEndTime ni sessions : repli historique jour calendaire entier (+1 jour)', async () => {
      mockEvents([
        { id: 'ev-1', eventDate: new Date('2026-03-01T00:00:00.000Z'), eventEndDate: null, eventEndTime: null, sessions: null },
      ]);

      await service.getEventTimelineBatch(spaceId, ['ev-1'], tenantId);

      const w = windowsFromLastQuery();
      expect(w['ev-1'].start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(w['ev-1'].end.toISOString()).toBe('2026-03-02T00:00:00.000Z');
    });

    it('deux events le même jour : le second démarre à la fin du premier, le premier garde minuit', async () => {
      const e1 = {
        id: 'ev-apresmidi',
        eventDate: new Date('2026-02-14T00:00:00.000Z'),
        eventEndDate: null,
        eventEndTime: '18:00', // 17:00Z
        sessions: null,
      };
      const e2 = {
        id: 'ev-soir',
        eventDate: new Date('2026-02-14T00:00:00.000Z'),
        eventEndDate: null,
        eventEndTime: '23:00', // 22:00Z
        sessions: null,
      };
      mockEvents([e1, e2]);

      await service.getEventTimelineBatch(spaceId, ['ev-apresmidi', 'ev-soir'], tenantId);

      const w = windowsFromLastQuery();
      // Le voisin du soir finit APRÈS l'event de l'après-midi → ne doit pas vider sa fenêtre.
      expect(w['ev-apresmidi'].start.toISOString()).toBe('2026-02-14T00:00:00.000Z');
      expect(w['ev-apresmidi'].end.toISOString()).toBe('2026-02-14T17:00:00.000Z');
      expect(w['ev-soir'].start.toISOString()).toBe('2026-02-14T17:00:00.000Z');
      expect(w['ev-soir'].end.toISOString()).toBe('2026-02-14T22:00:00.000Z');
    });
  });

  // ===== Correctifs Wizard Weezevent (A1/A3/A4/A6) =====
  describe('Wizard Weezevent fixes', () => {
    const tenantId = 'tenant-1';
    const spaceId = 'space-1';

    beforeEach(() => {
      // resetAllMocks (et pas clearAllMocks) pour purger les files `...Once` laissées
      // par les tests précédents qui pollueraient config.findFirst, puis ré-amorçage des défauts.
      jest.resetAllMocks();
      // Un test antérieur (getShopDetails) remplace mockPrismaService.spaceElement par un objet
      // partiel ({ findMany } seul) → on restaure l'objet complet ici.
      mockPrismaService.spaceElement = {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      } as any;
      mockPrismaService.config.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.floor.findMany.mockResolvedValue([]);
      mockPrismaService.menuAssignment.findMany.mockResolvedValue([]);
      mockPrismaService.locationShopMapping.findMany.mockResolvedValue([]);
      // Chemins v2 (zones) : défauts « espace sans zone » — resetAllMocks purge les
      // implémentations, on ré-amorce ici comme pour les autres modèles.
      mockPrismaService.zone.findFirst.mockResolvedValue(null);
      mockPrismaService.zone.findMany.mockResolvedValue([]);
      mockPrismaService.zone.count.mockResolvedValue(0);
      mockPrismaService.zone.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'zone-test', ...data }),
      );
      mockPrismaService.configurationElement.createMany.mockResolvedValue({ count: 1 });
      mockPrismaService.configurationElement.findMany.mockResolvedValue([]);
    });

    it('A1 — assignElementsToFloorLevel("externalmerch") crée la zone ExternalMerch et y déplace les éléments', async () => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
      // resolveTargetConfig → config utilisateur de l'espace
      mockPrismaService.config.findFirst
        .mockResolvedValueOnce({ id: 'cfg-user', name: 'Stade', isSystem: false, spaceId })
        // updateConfigDataOptimistic → lecture data/version
        .mockResolvedValue({ data: {}, version: 0 });
      mockPrismaService.externalMerch.findUnique.mockResolvedValue(null);
      mockPrismaService.externalMerch.create.mockResolvedValue({ id: 'em-1', name: 'Espace Externe', width: 200, length: 200 });
      mockPrismaService.spaceElement.findFirst.mockResolvedValue({
        id: 'el-1', floorId: 'f-0',
        floor: { config: { space: { id: spaceId, tenantId } } },
      });
      mockPrismaService.spaceElement.update.mockResolvedValue({ id: 'el-1' });

      const res: any = await service.assignElementsToFloorLevel(spaceId, tenantId, ['el-1'], 'externalmerch');

      expect(res.kind).toBe('externalmerch');
      expect(res.externalMerchId).toBe('em-1');
      expect(res.updatedElementIds).toEqual(['el-1']);
      expect(mockPrismaService.externalMerch.create).toHaveBeenCalled();
      expect(mockPrismaService.spaceElement.update).toHaveBeenCalledWith({
        where: { id: 'el-1' },
        data: { floorId: null, forecourtId: null, externalMerchId: 'em-1' },
      });
    });

    it('BUG-23 — bascule v1→v2 silencieuse rendue observable (log + builderVersion) quand une Zone existe déjà', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as any);
      try {
        mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
        mockPrismaService.config.findFirst.mockResolvedValue({ id: 'cfg-user', name: 'Stade', isSystem: false, spaceId });
        // L'espace a déjà 1 Zone (ex. créée par un quick-element antérieur) → bascule v1→v2
        // silencieuse pour CETTE assignation, alors même que l'élément assigné n'a lui-même
        // jamais été en v2 (zoneId null).
        mockPrismaService.zone.count.mockResolvedValue(1);
        mockPrismaService.spaceElement.findMany.mockResolvedValue([{ id: 'el-1', zoneId: null, floorId: null }]);
        mockPrismaService.spaceElement.update.mockResolvedValue({ id: 'el-1' });
        mockPrismaService.$transaction.mockImplementation((arg: any) =>
          Array.isArray(arg) ? Promise.all(arg) : arg(mockPrismaService),
        );

        const res: any = await service.assignElementsToFloorLevel(spaceId, tenantId, ['el-1'], 0);

        // 1. La réponse porte désormais un indicateur explicite du routage effectif.
        expect(res.builderVersion).toBe('v2');
        expect(res.updatedElementIds).toEqual(['el-1']);

        // 2. La bascule est journalisée avec spaceId/tenantId pour traçabilité debug.
        expect(warnSpy).toHaveBeenCalled();
        const loggedSwitch = warnSpy.mock.calls.some(([msg]) =>
          typeof msg === 'string' &&
          msg.includes('[BUG-23]') &&
          msg.includes(`spaceId=${spaceId}`) &&
          msg.includes(`tenantId=${tenantId}`),
        );
        expect(loggedSwitch).toBe(true);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('A4 — assignElementsToFloorLevel rejette un level non entier (BadRequestException)', async () => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
      await expect(
        service.assignElementsToFloorLevel(spaceId, tenantId, ['el-1'], 1.5 as any),
      ).rejects.toThrow('level invalide');
    });

    it('A6 — quickCreateElement cible la config utilisateur (aucune config « Weezevent Import » créée)', async () => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
      // resolveTargetConfig → config utilisateur existante (isSystem=false) → réutilisée
      mockPrismaService.config.findFirst
        .mockResolvedValueOnce({ id: 'cfg-user', name: 'Configuration principale', isSystem: false, spaceId })
        .mockResolvedValue({ data: {}, version: 0 }); // updateConfigDataOptimistic
      mockPrismaService.floor.findFirst.mockResolvedValue(null);
      mockPrismaService.floor.create.mockResolvedValue({ id: 'f-0', name: 'RDC', level: 0, width: 100, height: 4, length: 100 });
      mockPrismaService.spaceElement.count.mockResolvedValue(0);
      mockPrismaService.spaceElement.create.mockResolvedValue({ id: 'el-1', name: 'Bar' });

      const res: any = await service.quickCreateElement(spaceId, tenantId, { name: 'Bar', type: 'fnb-beverages' });

      expect(res.id).toBe('el-1');
      // Le shop est créé dans la config utilisateur, PAS dans une config interne auto-générée.
      expect(mockPrismaService.config.create).not.toHaveBeenCalled();
      expect(mockPrismaService.spaceElement.create).toHaveBeenCalled();
    });

    it('A6b — quickCreateElement échoue (400) si aucune config utilisateur, et ne crée AUCUNE config', async () => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
      // resolveTargetConfig : aucune config utilisateur → throw, jamais de « Weezevent Import »
      mockPrismaService.config.findFirst.mockResolvedValue(null);

      await expect(
        service.quickCreateElement(spaceId, tenantId, { name: 'Bar', type: 'fnb-beverages' }),
      ).rejects.toThrow('Aucune configuration');
      expect(mockPrismaService.config.create).not.toHaveBeenCalled();
    });

    it('A6c — assignElementsToFloorLevel échoue (400) si aucune config utilisateur, sans rien créer', async () => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: spaceId, tenantId });
      mockPrismaService.config.findFirst.mockResolvedValue(null);

      await expect(
        service.assignElementsToFloorLevel(spaceId, tenantId, ['el-1'], 0),
      ).rejects.toThrow('Aucune configuration');
      expect(mockPrismaService.config.create).not.toHaveBeenCalled();
      expect(mockPrismaService.floor.create).not.toHaveBeenCalled();
    });

    it('A3 — getConfiguration renvoie data.externalMerch', async () => {
      mockPrismaService.config.findFirst.mockResolvedValue({
        id: 'cfg-1', name: 'Stade', spaceId, capacity: 0, isSystem: false,
        data: { floors: [], forecourt: null, externalMerch: { id: 'em-1', name: 'Espace Externe', elements: [] } },
        createdAt: new Date(), updatedAt: new Date(),
        space: { id: spaceId, name: 'Stade', tenantId },
      });
      mockPrismaService.floor.findMany.mockResolvedValue([]);

      const res: any = await service.getConfiguration('cfg-1', tenantId);

      expect(res.data.externalMerch).toEqual({ id: 'em-1', name: 'Espace Externe', elements: [] });
      expect(res.isSystem).toBe(false);
    });
  });

  // Signal "event live" (tracker front #20/#23, LIVE_API_GUIDE.md §1) — piloté par le bouton ◉
  // et la route Live, pollé par le front.
  describe('getLiveStatus', () => {
    const spaceId = 'space-1';
    const tenantId = 'tenant-1';

    beforeEach(() => {
      mockPrismaService.locationSpaceMapping.findFirst.mockResolvedValue(null);
      mockPrismaService.config.findMany.mockResolvedValue([]);
      mockPrismaService.spaceElement.findMany.mockResolvedValue([]);
      mockPrismaService.$queryRaw.mockResolvedValue([]);
    });

    it('is not live when no event window covers the present instant (and no shop resolved)', async () => {
      mockPrismaService.event.findMany.mockResolvedValue([]);

      const result = await service.getLiveStatus(spaceId, tenantId);

      // Court-circuité par shopIds vide (beforeEach), pas par l'absence d'event — le early-return
      // sur "aucun Event" a été retiré (revue de la définition "event live").
      expect(result).toEqual({ isLive: false, eventId: null, since: null });
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
    });

    it('is live from a real sale alone when no Event covers the present instant', async () => {
      const now = new Date();
      const since = new Date(now.getTime() - 5 * 60 * 1000);
      mockPrismaService.event.findMany.mockResolvedValue([]);
      mockPrismaService.spaceElement.findMany.mockResolvedValue([{ id: 'shop-1' }]);
      mockPrismaService.$queryRaw.mockResolvedValue([{ since }]);

      const result = await service.getLiveStatus(spaceId, tenantId);

      // Aucun Event saisi en amont : le live est ancré uniquement sur la vente réelle
      // (fenêtre glissante de 30 min), eventId reste null.
      expect(result).toEqual({ isLive: true, eventId: null, since: since.toISOString() });
    });

    it('is not live when the matching event is outside its window + grace', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      mockPrismaService.event.findMany.mockResolvedValue([
        { id: 'event-old', eventDate: eightDaysAgo, eventStartDate: null, eventEndDate: null },
      ]);

      const result = await service.getLiveStatus(spaceId, tenantId);

      // graceEnd (eventDate + 3h) est bien avant "now" → rejeté par le filtre de fenêtre en mémoire.
      expect(result).toEqual({ isLive: false, eventId: null, since: null });
    });

    it('resolves the event but stays not-live when the space has no shops', async () => {
      const now = new Date();
      mockPrismaService.event.findMany.mockResolvedValue([
        { id: 'event-1', eventDate: now, eventStartDate: null, eventEndDate: null },
      ]);
      // spaceElement.findMany déjà mocké à [] dans le beforeEach → shopIds = []

      const result = await service.getLiveStatus(spaceId, tenantId);

      expect(result).toEqual({ isLive: false, eventId: 'event-1', since: null });
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
    });

    it('is live when a real sale landed within the last 30 minutes', async () => {
      const now = new Date();
      const since = new Date(now.getTime() - 5 * 60 * 1000);
      mockPrismaService.event.findMany.mockResolvedValue([
        { id: 'event-1', eventDate: now, eventStartDate: null, eventEndDate: null },
      ]);
      mockPrismaService.spaceElement.findMany.mockResolvedValue([{ id: 'shop-1' }]);
      mockPrismaService.$queryRaw.mockResolvedValue([{ since }]);

      const result = await service.getLiveStatus(spaceId, tenantId);

      expect(result).toEqual({ isLive: true, eventId: 'event-1', since: since.toISOString() });
    });

    it('is not live when the shops have no sale in the freshness window (stale event)', async () => {
      const now = new Date();
      mockPrismaService.event.findMany.mockResolvedValue([
        { id: 'event-1', eventDate: now, eventStartDate: null, eventEndDate: null },
      ]);
      mockPrismaService.spaceElement.findMany.mockResolvedValue([{ id: 'shop-1' }]);
      mockPrismaService.$queryRaw.mockResolvedValue([{ since: null }]);

      const result = await service.getLiveStatus(spaceId, tenantId);

      expect(result).toEqual({ isLive: false, eventId: 'event-1', since: null });
    });
  });

  // Passthrough vers LogisticsService (tracker front #22, LIVE_API_GUIDE.md §3) — la logique vit
  // dans LogisticsService.getLiveInventory (testée dans logistics.service.spec.ts), on vérifie
  // uniquement le câblage ici.
  describe('getLiveInventory', () => {
    it('delegates to LogisticsService.getLiveInventory with the same spaceId/tenantId', async () => {
      const expected = { shops: [], items: [] };
      mockLogisticsService.getLiveInventory.mockResolvedValue(expected);

      const result = await service.getLiveInventory('space-1', 'tenant-1');

      expect(mockLogisticsService.getLiveInventory).toHaveBeenCalledWith('space-1', 'tenant-1');
      expect(result).toBe(expected);
    });
  });
});
