import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../../core/database/prisma.service';
import { EventWeezeventLinkService } from './services/event-weezevent-link.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('EventsService', () => {
  let service: EventsService;
  let mockWeezeventLinkService: { relinkForTenantDate: jest.Mock };

  const mockEvent = {
    id: 'evt-1',
    name: 'Festival 2024',
    eventDate: new Date('2024-07-15'),
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    status: 'draft',
    location: 'Paris',
    eventType: null,
    eventCategory: null,
    eventSubcategory: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    event: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    eventType: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    eventCategory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    eventSubcategory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    space: {
      findFirst: jest.fn(),
    },
    config: {
      findFirst: jest.fn(),
    },
    team: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    salesEvent: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((ops) => Promise.all(ops)),
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    mockWeezeventLinkService = { relinkForTenantDate: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventWeezeventLinkService, useValue: mockWeezeventLinkService },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an event', async () => {
      const dto = { name: 'New Event', eventDate: '2024-08-01' };
      mockPrisma.event.create.mockResolvedValue({ ...mockEvent, ...dto });

      const result = await service.create('tenant-1', dto as any);
      expect(result.name).toBe('New Event');
      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-1', name: 'New Event' }),
        }),
      );
    });

    it('accepts an eventTypeId that references a GLOBAL (tenantId=null) referential row (BUG-67 regression)', async () => {
      const dto = { name: 'New Event', eventDate: '2024-08-01', eventTypeId: 'global-type-1' };
      mockPrisma.eventType.findFirst.mockResolvedValue({ id: 'global-type-1', tenantId: null });
      mockPrisma.event.create.mockResolvedValue({ ...mockEvent, ...dto });

      const result = await service.create('tenant-1', dto as any);

      expect(result).toBeDefined();
      expect(mockPrisma.eventType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'global-type-1', OR: [{ tenantId: 'tenant-1' }, { tenantId: null }] },
        }),
      );
      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventTypeId: 'global-type-1' }) }),
      );
    });

    it('rejects an eventTypeId belonging to another tenant', async () => {
      const dto = { name: 'New Event', eventDate: '2024-08-01', eventTypeId: 'foreign-type-1' };
      mockPrisma.eventType.findFirst.mockResolvedValue(null);

      await expect(service.create('tenant-1', dto as any)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.event.create).not.toHaveBeenCalled();
    });

    it('accepts a spaceId/configurationId owned by the caller tenant (BUG-34 regression)', async () => {
      const dto = {
        name: 'New Event',
        eventDate: '2024-08-01',
        spaceId: 'space-1',
        configurationId: 'config-1',
      };
      mockPrisma.space.findFirst.mockResolvedValue({ id: 'space-1', tenantId: 'tenant-1' });
      mockPrisma.config.findFirst.mockResolvedValue({ id: 'config-1', spaceId: 'space-1' });
      mockPrisma.event.create.mockResolvedValue({ ...mockEvent, ...dto });

      const result = await service.create('tenant-1', dto as any);

      expect(result).toBeDefined();
      expect(mockPrisma.space.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'space-1', tenantId: 'tenant-1' } }),
      );
      expect(mockPrisma.config.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'config-1', space: { tenantId: 'tenant-1' } } }),
      );
      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ spaceId: 'space-1', configurationId: 'config-1' }),
        }),
      );
    });

    it('rejects a spaceId belonging to another tenant (BUG-34 regression)', async () => {
      const dto = { name: 'New Event', eventDate: '2024-08-01', spaceId: 'foreign-space-1' };
      mockPrisma.space.findFirst.mockResolvedValue(null);

      await expect(service.create('tenant-1', dto as any)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.event.create).not.toHaveBeenCalled();
    });

    it('rejects a configurationId belonging to another tenant (BUG-34 regression)', async () => {
      const dto = { name: 'New Event', eventDate: '2024-08-01', configurationId: 'foreign-config-1' };
      mockPrisma.config.findFirst.mockResolvedValue(null);

      await expect(service.create('tenant-1', dto as any)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.event.create).not.toHaveBeenCalled();
    });

    it('BUG-021: attempts an auto-link with WeezeventEvent after creation', async () => {
      const dto = { name: 'New Event', eventDate: '2024-08-01' };
      const created = { ...mockEvent, ...dto, eventDate: new Date('2024-08-01') };
      mockPrisma.event.create.mockResolvedValue(created);

      await service.create('tenant-1', dto as any);

      expect(mockWeezeventLinkService.relinkForTenantDate).toHaveBeenCalledWith(
        'tenant-1',
        created.eventDate,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated events', async () => {
      mockPrisma.event.findMany.mockResolvedValue([mockEvent]);
      mockPrisma.event.count.mockResolvedValue(1);

      const result = await service.findAll('tenant-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should respect pagination params', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.event.count.mockResolvedValue(0);

      await service.findAll('tenant-1', 2, 10);
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('findOne', () => {
    it('should return an event by ID', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);

      const result = await service.findOne('evt-1', 'tenant-1');
      expect(result.id).toBe('evt-1');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);

      await expect(service.findOne('invalid', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update an event', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.event.update.mockResolvedValue({ ...mockEvent, name: 'Updated' });

      const result = await service.update('evt-1', 'tenant-1', { name: 'Updated' } as any);
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException if event not found', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.update('invalid', 'tenant-1', { name: 'Updated' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('BUG-021: does NOT reset weezeventEventId when eventDate is unchanged', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.event.update.mockResolvedValue(mockEvent);

      await service.update('evt-1', 'tenant-1', { name: 'Updated' } as any);

      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ weezeventEventId: null }),
        }),
      );
      expect(mockWeezeventLinkService.relinkForTenantDate).not.toHaveBeenCalled();
    });

    it('BUG-021: resets weezeventEventId and re-attempts auto-link when eventDate changes', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      const updated = { ...mockEvent, eventDate: new Date('2024-09-01') };
      mockPrisma.event.update.mockResolvedValue(updated);

      await service.update('evt-1', 'tenant-1', { eventDate: '2024-09-01' } as any);

      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ weezeventEventId: null }),
        }),
      );
      expect(mockWeezeventLinkService.relinkForTenantDate).toHaveBeenCalledWith(
        'tenant-1',
        updated.eventDate,
      );
    });

    it('accepts a spaceId/configurationId owned by the caller tenant (BUG-34 regression)', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.space.findFirst.mockResolvedValue({ id: 'space-2', tenantId: 'tenant-1' });
      mockPrisma.config.findFirst.mockResolvedValue({ id: 'config-2', spaceId: 'space-2' });
      mockPrisma.event.update.mockResolvedValue({ ...mockEvent, spaceId: 'space-2' });

      await service.update('evt-1', 'tenant-1', {
        spaceId: 'space-2',
        configurationId: 'config-2',
      } as any);

      expect(mockPrisma.space.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'space-2', tenantId: 'tenant-1' } }),
      );
      expect(mockPrisma.config.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'config-2', space: { tenantId: 'tenant-1' } } }),
      );
      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ spaceId: 'space-2', configurationId: 'config-2' }),
        }),
      );
    });

    it('rejects a spaceId belonging to another tenant (BUG-34 regression)', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.space.findFirst.mockResolvedValue(null);

      await expect(
        service.update('evt-1', 'tenant-1', { spaceId: 'foreign-space-1' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.event.update).not.toHaveBeenCalled();
    });

    it('unmaps an event (spaceId: null) without an ownership lookup, and clears configurationId along with it', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.event.update.mockResolvedValue({ ...mockEvent, spaceId: null, configurationId: null });

      await service.update('evt-1', 'tenant-1', { spaceId: null } as any);

      expect(mockPrisma.space.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ spaceId: null, configurationId: null }),
        }),
      );
    });

    it('rejects a configurationId belonging to another tenant (BUG-34 regression)', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.config.findFirst.mockResolvedValue(null);

      await expect(
        service.update('evt-1', 'tenant-1', { configurationId: 'foreign-config-1' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.event.update).not.toHaveBeenCalled();
    });
  });

  describe('BUG-021: listAmbiguousWeezeventMatches', () => {
    it('returns the raw query result', async () => {
      const rows = [
        {
          eventId: 'evt-1',
          eventName: 'Festival 2024',
          eventDate: new Date('2024-08-01'),
          candidates: [{ id: 'we-1', name: 'Festival', startDate: new Date('2024-08-01'), externalId: '123' }],
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(rows);

      const result = await service.listAmbiguousWeezeventMatches('tenant-1');
      expect(result).toEqual(rows);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('BUG-021: resolveWeezeventLink', () => {
    it('links to the given WeezeventEvent when it belongs to the tenant', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.salesEvent.findFirst.mockResolvedValue({ id: 'we-1' });
      mockPrisma.event.update.mockResolvedValue({ ...mockEvent, weezeventEventId: 'we-1' });

      const result = await service.resolveWeezeventLink('evt-1', 'tenant-1', 'we-1');

      expect(mockPrisma.salesEvent.findFirst).toHaveBeenCalledWith({
        where: { id: 'we-1', tenantId: 'tenant-1' },
        select: { id: true },
      });
      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { weezeventEventId: 'we-1' } }),
      );
      expect(result.weezeventEventId).toBe('we-1');
    });

    it('rejects a WeezeventEvent belonging to another tenant', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.salesEvent.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveWeezeventLink('evt-1', 'tenant-1', 'we-foreign'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.event.update).not.toHaveBeenCalled();
    });

    it('allows explicitly unlinking with null', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.event.update.mockResolvedValue({ ...mockEvent, weezeventEventId: null });

      await service.resolveWeezeventLink('evt-1', 'tenant-1', null);

      expect(mockPrisma.salesEvent.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { weezeventEventId: null } }),
      );
    });
  });

  describe('remove', () => {
    it('should delete an event', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.event.delete.mockResolvedValue(mockEvent);

      const result = await service.remove('evt-1', 'tenant-1');
      expect(result.id).toBe('evt-1');
    });
  });

  describe('getEventTypes', () => {
    it('should return event types for tenant', async () => {
      const types = [{ id: 'type-1', name: 'Concert', categories: [] }];
      mockPrisma.eventType.findMany.mockResolvedValue(types);

      const result = await service.getEventTypes('tenant-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Concert');
    });
  });

  describe('createEventType', () => {
    it('should create event type', async () => {
      const newType = { id: 'type-2', name: 'Festival', tenantId: 'tenant-1' };
      mockPrisma.eventType.create.mockResolvedValue(newType);

      const result = await service.createEventType('tenant-1', { name: 'Festival' });
      expect(result.name).toBe('Festival');
    });
  });

  describe('getEventCategories', () => {
    it('should return categories for tenant', async () => {
      const cats = [{ id: 'cat-1', name: 'Rock', subcategories: [] }];
      mockPrisma.eventCategory.findMany.mockResolvedValue(cats);

      const result = await service.getEventCategories('tenant-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('updateEventCategory', () => {
    it('should update category name only', async () => {
      mockPrisma.eventCategory.findFirst.mockResolvedValue({ id: 'cat-1', tenantId: 'tenant-1' });
      mockPrisma.eventCategory.update.mockResolvedValue({ id: 'cat-1', name: 'Motos' });

      const result = await service.updateEventCategory('tenant-1', 'cat-1', { name: 'Motos' });

      expect(result.name).toBe('Motos');
      expect(mockPrisma.eventCategory.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { name: 'Motos' },
      });
    });

    it('should update category relation using eventType.connect', async () => {
      mockPrisma.eventCategory.findFirst.mockResolvedValue({ id: 'cat-1', tenantId: 'tenant-1' });
      mockPrisma.eventType.findFirst.mockResolvedValue({ id: 'type-2', tenantId: null });
      mockPrisma.eventCategory.update.mockResolvedValue({ id: 'cat-1', name: 'Motos' });

      await service.updateEventCategory('tenant-1', 'cat-1', {
        name: 'Motos',
        eventTypeId: 'type-2',
      });

      expect(mockPrisma.eventCategory.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: {
          name: 'Motos',
          eventType: {
            connect: { id: 'type-2' },
          },
        },
      });
    });
  });

  describe('getEventSubcategories', () => {
    it('should return subcategories for tenant', async () => {
      mockPrisma.eventSubcategory.findMany.mockResolvedValue([]);

      const result = await service.getEventSubcategories('tenant-1');
      expect(result).toEqual([]);
    });
  });

  describe('updateEventSubcategory', () => {
    it('should update subcategory name only', async () => {
      mockPrisma.eventSubcategory.findFirst.mockResolvedValue({ id: 'sub-1', tenantId: 'tenant-1' });
      mockPrisma.eventSubcategory.update.mockResolvedValue({ id: 'sub-1', name: 'Cross' });

      const result = await service.updateEventSubcategory('tenant-1', 'sub-1', { name: 'Cross' });

      expect(result.name).toBe('Cross');
      expect(mockPrisma.eventSubcategory.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { name: 'Cross' },
      });
    });

    it('should update subcategory relation using eventCategory.connect', async () => {
      mockPrisma.eventSubcategory.findFirst.mockResolvedValue({ id: 'sub-1', tenantId: 'tenant-1' });
      mockPrisma.eventCategory.findFirst.mockResolvedValue({ id: 'cat-2', tenantId: null });
      mockPrisma.eventSubcategory.update.mockResolvedValue({ id: 'sub-1', name: 'Cross' });

      await service.updateEventSubcategory('tenant-1', 'sub-1', {
        name: 'Cross',
        eventCategoryId: 'cat-2',
      });

      expect(mockPrisma.eventSubcategory.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          name: 'Cross',
          eventCategory: {
            connect: { id: 'cat-2' },
          },
        },
      });
    });
  });

  describe('createEventSubcategory', () => {
    it('should create subcategory with eventCategoryId', async () => {
      mockPrisma.eventCategory.findFirst.mockResolvedValue({ id: 'cat-1', tenantId: 'tenant-1' });
      mockPrisma.eventSubcategory.create.mockResolvedValue({ id: 'sub-1', name: 'Race F1' });

      const result = await service.createEventSubcategory('tenant-1', {
        name: 'Race F1',
        eventCategoryId: 'cat-1',
      });

      expect(result.name).toBe('Race F1');
      expect(mockPrisma.eventSubcategory.create).toHaveBeenCalledWith({
        data: {
          name: 'Race F1',
          eventCategoryId: 'cat-1',
          tenantId: 'tenant-1',
        },
      });
    });

    it('should create subcategory with categoryId alias', async () => {
      mockPrisma.eventCategory.findFirst.mockResolvedValue({ id: 'cat-1', tenantId: null });
      mockPrisma.eventSubcategory.create.mockResolvedValue({ id: 'sub-1', name: 'Race F1' });

      await service.createEventSubcategory('tenant-1', {
        name: 'Race F1',
        categoryId: 'cat-1',
      });

      expect(mockPrisma.eventSubcategory.create).toHaveBeenCalledWith({
        data: {
          name: 'Race F1',
          eventCategoryId: 'cat-1',
          tenantId: 'tenant-1',
        },
      });
    });

    it('should throw detailed BadRequestException when category is missing', async () => {
      await expect(
        service.createEventSubcategory('tenant-1', {
          name: 'Race F1',
        }),
      ).rejects.toThrow(BadRequestException);

      await service.createEventSubcategory('tenant-1', {
        name: 'Race F1',
      }).catch((error) => {
        expect(error.getResponse()).toEqual(
          expect.objectContaining({
            message: 'Validation failed',
            errors: expect.arrayContaining([
              expect.objectContaining({
                property: 'eventCategoryId',
                messages: expect.arrayContaining([
                  'eventCategoryId should not be empty',
                  'eventCategoryId must be a string',
                ]),
              }),
            ]),
          }),
        );
      });
    });

    it('should throw detailed BadRequestException when category is not accessible', async () => {
      mockPrisma.eventCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.createEventSubcategory('tenant-1', {
          name: 'Race F1',
          eventCategoryId: 'cat-404',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('teams', () => {
    const mockTeam = {
      id: 'team-1',
      name: 'Asec Mimosas',
      tenantId: 'tenant-1',
      eventCategoryId: 'cat-1',
      eventSubcategoryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    describe('getTeams', () => {
      it('returns all tenant teams when no competition filter', async () => {
        mockPrisma.team.findMany.mockResolvedValue([mockTeam]);

        await service.getTeams('tenant-1');
        expect(mockPrisma.team.findMany).toHaveBeenCalledWith({
          where: { tenantId: 'tenant-1' },
          orderBy: { name: 'asc' },
        });
      });

      it('returns competition teams plus generic teams when filtered', async () => {
        mockPrisma.team.findMany.mockResolvedValue([]);

        await service.getTeams('tenant-1', 'cat-1', 'sub-1');
        expect(mockPrisma.team.findMany).toHaveBeenCalledWith({
          where: {
            tenantId: 'tenant-1',
            OR: [
              { eventCategoryId: null, eventSubcategoryId: null },
              { eventSubcategoryId: 'sub-1' },
              { eventCategoryId: 'cat-1', eventSubcategoryId: null },
            ],
          },
          orderBy: { name: 'asc' },
        });
      });
    });

    describe('createTeam', () => {
      it('creates a team scoped to an accessible category', async () => {
        mockPrisma.eventCategory.findFirst.mockResolvedValue({ id: 'cat-1' });
        mockPrisma.team.findFirst.mockResolvedValue(null);
        mockPrisma.team.create.mockResolvedValue(mockTeam);

        const result = await service.createTeam('tenant-1', {
          name: 'Asec Mimosas',
          eventCategoryId: 'cat-1',
        });
        expect(result).toEqual(mockTeam);
        expect(mockPrisma.team.create).toHaveBeenCalledWith({
          data: {
            tenantId: 'tenant-1',
            name: 'Asec Mimosas',
            eventCategoryId: 'cat-1',
            eventSubcategoryId: null,
          },
        });
      });

      it('rejects a duplicate name in the same competition', async () => {
        mockPrisma.eventCategory.findFirst.mockResolvedValue({ id: 'cat-1' });
        mockPrisma.team.findFirst.mockResolvedValue(mockTeam);

        await expect(
          service.createTeam('tenant-1', { name: 'asec mimosas', eventCategoryId: 'cat-1' }),
        ).rejects.toThrow('already exists');
        expect(mockPrisma.team.create).not.toHaveBeenCalled();
      });

      it('rejects an inaccessible category', async () => {
        mockPrisma.eventCategory.findFirst.mockResolvedValue(null);

        await expect(
          service.createTeam('tenant-1', { name: 'Team X', eventCategoryId: 'cat-404' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects a subcategory that does not belong to the given category', async () => {
        mockPrisma.eventCategory.findFirst.mockResolvedValue({ id: 'cat-1' });
        mockPrisma.eventSubcategory.findFirst.mockResolvedValue({
          id: 'sub-1',
          eventCategoryId: 'cat-OTHER',
        });

        await expect(
          service.createTeam('tenant-1', {
            name: 'Team X',
            eventCategoryId: 'cat-1',
            eventSubcategoryId: 'sub-1',
          }),
        ).rejects.toThrow('does not belong');
      });
    });

    describe('updateTeam', () => {
      it('syncs the denormalized visitingTeamName on rename', async () => {
        mockPrisma.team.findFirst.mockResolvedValue(mockTeam);
        mockPrisma.team.update.mockResolvedValue({ ...mockTeam, name: 'Africa Sports' });

        await service.updateTeam('tenant-1', 'team-1', { name: 'Africa Sports' });
        expect(mockPrisma.event.updateMany).toHaveBeenCalledWith({
          where: { visitingTeamId: 'team-1' },
          data: { visitingTeamName: 'Africa Sports' },
        });
      });

      it('rejects a team from another tenant', async () => {
        mockPrisma.team.findFirst.mockResolvedValue(null);

        await expect(
          service.updateTeam('tenant-1', 'team-foreign', { name: 'X' }),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('event team fields', () => {
      it('persists homeTeamName and derives visitingTeamName from the owned team', async () => {
        mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
        mockPrisma.team.findFirst.mockResolvedValue(mockTeam);
        mockPrisma.event.update.mockResolvedValue(mockEvent);

        await service.update('evt-1', 'tenant-1', {
          homeTeamName: 'Stade Abidjan',
          visitingTeamId: 'team-1',
        } as any);
        expect(mockPrisma.event.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              homeTeamName: 'Stade Abidjan',
              visitingTeamId: 'team-1',
              visitingTeamName: 'Asec Mimosas',
            }),
          }),
        );
      });

      it('rejects a visitingTeamId owned by another tenant', async () => {
        mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
        mockPrisma.team.findFirst.mockResolvedValue(null);

        await expect(
          service.update('evt-1', 'tenant-1', { visitingTeamId: 'team-foreign' } as any),
        ).rejects.toThrow(NotFoundException);
        expect(mockPrisma.event.update).not.toHaveBeenCalled();
      });

      it('clears both id and denormalized name when visitingTeamId is null', async () => {
        mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
        mockPrisma.event.update.mockResolvedValue(mockEvent);

        await service.update('evt-1', 'tenant-1', { visitingTeamId: null } as any);
        expect(mockPrisma.event.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              visitingTeamId: null,
              visitingTeamName: null,
            }),
          }),
        );
        expect(mockPrisma.team.findFirst).not.toHaveBeenCalled();
      });
    });
  });
});
