import { Test, TestingModule } from '@nestjs/testing';
import { SpacesController } from './spaces.controller';
import { REDIS_CLIENT } from '../../core/redis/redis.constants';
import { SpaceCacheService } from './services/space-cache.service';
import { SpaceZoneElementsService } from './services/space-zone-elements.service';
import { SpaceCrudService } from './services/space-crud.service';
import { SpaceAccessGrantService } from './services/space-access-grant.service';
import { SpaceConfigurationService } from './services/space-configuration.service';
import { SpaceElementService } from './services/space-element.service';
import { SpaceEventTimelineService } from './services/space-event-timeline.service';
import { SpaceWeezeventEventService } from './services/space-weezevent-event.service';
import { SpaceAnalyseBatchService } from './services/space-analyse-batch.service';
import { SpaceElementPlacementService } from './services/space-element-placement.service';
import { SpaceShopsService } from './services/space-shops.service';
import { SpaceElementLayoutService } from './services/space-element-layout.service';
import { SpaceSalesScopeService } from './services/space-sales-scope.service';

describe('SpacesController', () => {
  let controller: SpacesController;

  const mockUser = {
    id: 'user-123',
    tenantId: 'tenant-123',
    email: 'test@example.com',
    role: 'ADMIN',
  };

  const mockSpace = {
    id: 'space-123',
    name: 'Test Space',
    image: 'https://example.com/image.jpg',
    tenantId: 'tenant-123',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tenant: {
      id: 'tenant-123',
      name: 'Test Organization',
      slug: 'test-org',
    },
  };

  const mockSpacesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getStatistics: jest.fn(),
    getPinned: jest.fn(),
    pin: jest.fn(),
    unpin: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpacesController],
      providers: [
        { provide: SpaceCacheService, useValue: mockSpacesService },
        { provide: SpaceZoneElementsService, useValue: mockSpacesService },
        { provide: SpaceCrudService, useValue: mockSpacesService },
        { provide: SpaceAccessGrantService, useValue: mockSpacesService },
        { provide: SpaceConfigurationService, useValue: mockSpacesService },
        { provide: SpaceElementService, useValue: mockSpacesService },
        { provide: SpaceEventTimelineService, useValue: mockSpacesService },
        { provide: SpaceWeezeventEventService, useValue: mockSpacesService },
        { provide: SpaceAnalyseBatchService, useValue: mockSpacesService },
        { provide: SpaceElementPlacementService, useValue: mockSpacesService },
        { provide: SpaceShopsService, useValue: mockSpacesService },
        { provide: SpaceElementLayoutService, useValue: mockSpacesService },
        { provide: SpaceSalesScopeService, useValue: mockSpacesService },
        // Client Redis du flux SSE live (abonnement pub/sub), inutilisé par ces tests.
        { provide: REDIS_CLIENT, useValue: {} },
      ],
    }).compile();

    controller = module.get<SpacesController>(SpacesController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a space', async () => {
      const createDto = { name: 'New Space' };
      mockSpacesService.create.mockResolvedValue(mockSpace);

      const result = await controller.create(mockUser, createDto);

      expect(result).toEqual(mockSpace);
      expect(mockSpacesService.create).toHaveBeenCalledWith('tenant-123', createDto);
    });
  });

  describe('findAll', () => {
    it('should return paginated spaces', async () => {
      const paginatedResult = {
        data: [mockSpace],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      mockSpacesService.findAll.mockResolvedValue(paginatedResult);

      const result = await controller.findAll(mockUser, {});

      expect(result).toEqual(paginatedResult);
      expect(mockSpacesService.findAll).toHaveBeenCalledWith('tenant-123', {}, expect.anything());
    });

    it('should apply search filter', async () => {
      mockSpacesService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(mockUser, { search: 'test' });

      expect(mockSpacesService.findAll).toHaveBeenCalledWith('tenant-123', { search: 'test' }, expect.anything());
    });
  });

  describe('findOne', () => {
    it('should return a space by id', async () => {
      mockSpacesService.findOne.mockResolvedValue(mockSpace);

      const result = await controller.findOne('space-123', mockUser);

      expect(result).toEqual(mockSpace);
      // L'utilisateur est transmis pour le contrôle d'accès espace (STAFF/VIEWER).
      expect(mockSpacesService.findOne).toHaveBeenCalledWith('space-123', 'tenant-123', mockUser);
    });
  });

  describe('update', () => {
    it('should update a space', async () => {
      const updateDto = { name: 'Updated Space' };
      const updatedSpace = { ...mockSpace, ...updateDto };
      mockSpacesService.update.mockResolvedValue(updatedSpace);

      const result = await controller.update('space-123', mockUser, updateDto);

      expect(result).toEqual(updatedSpace);
      expect(mockSpacesService.update).toHaveBeenCalledWith('space-123', 'tenant-123', updateDto);
    });
  });

  describe('remove', () => {
    it('should remove a space', async () => {
      mockSpacesService.remove.mockResolvedValue({ deleted: true });

      await controller.remove('space-123', mockUser);

      expect(mockSpacesService.remove).toHaveBeenCalledWith('space-123', 'tenant-123');
    });
  });

  describe('getStatistics', () => {
    it('should return spaces statistics', async () => {
      const stats = { totalSpaces: 5, totalConfigs: 10 };
      mockSpacesService.getStatistics.mockResolvedValue(stats);

      const result = await controller.getStatistics(mockUser);

      expect(result).toEqual(stats);
      expect(mockSpacesService.getStatistics).toHaveBeenCalledWith('tenant-123');
    });
  });

  describe('getPinned', () => {
    it('should return pinned spaces', async () => {
      mockSpacesService.getPinned.mockResolvedValue([mockSpace]);

      const result = await controller.getPinned(mockUser);

      expect(result).toEqual([mockSpace]);
      expect(mockSpacesService.getPinned).toHaveBeenCalledWith('user-123', 'tenant-123', expect.anything());
    });
  });

  describe('pin', () => {
    it('should pin a space', async () => {
      mockSpacesService.pin.mockResolvedValue({ pinned: true });

      await controller.pin('space-123', mockUser);

      expect(mockSpacesService.pin).toHaveBeenCalledWith('space-123', 'user-123', 'tenant-123');
    });
  });

  describe('unpin', () => {
    it('should unpin a space', async () => {
      mockSpacesService.unpin.mockResolvedValue({ unpinned: true });

      await controller.unpin('space-123', mockUser);

      expect(mockSpacesService.unpin).toHaveBeenCalledWith('space-123', 'user-123', 'tenant-123');
    });
  });
});
