import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnalyseService } from './analyse.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('AnalyseService', () => {
  let service: AnalyseService;

  const mockPrisma = {
    menuItem: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    menuComponent: { count: jest.fn() },
    ingredient: { count: jest.fn() },
    supplier: { count: jest.fn() },
    event: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    space: { count: jest.fn() },
    salesEvent: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyseService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyseService>(AnalyseService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboard', () => {
    beforeEach(() => {
      mockPrisma.menuItem.count.mockResolvedValue(50);
      mockPrisma.menuComponent.count.mockResolvedValue(30);
      mockPrisma.ingredient.count.mockResolvedValue(120);
      mockPrisma.supplier.count.mockResolvedValue(10);
      mockPrisma.event.count.mockResolvedValue(5);
      mockPrisma.space.count.mockResolvedValue(3);
    });

    it('should return all counts', async () => {
      const result = await service.getDashboard('tenant-1');
      expect(result.menuItems).toBe(50);
      expect(result.components).toBe(30);
      expect(result.ingredients).toBe(120);
      expect(result.suppliers).toBe(10);
      expect(result.events).toBe(5);
      expect(result.spaces).toBe(3);
    });

    it('should filter by tenantId', async () => {
      await service.getDashboard('tenant-2');
      expect(mockPrisma.menuItem.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-2' }) }),
      );
    });

    it('should scope the event count by spaceId when provided (spaceId no longer silently dropped)', async () => {
      await service.getDashboard('tenant-1', 'space-42');
      expect(mockPrisma.event.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', spaceId: 'space-42' }),
        }),
      );
      // Les référentiels restent tenant-level (pas de spaceId dans leur where).
      expect(mockPrisma.menuItem.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ spaceId: expect.anything() }),
        }),
      );
    });

    it('should not scope events when spaceId is absent', async () => {
      await service.getDashboard('tenant-1');
      expect(mockPrisma.event.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ spaceId: expect.anything() }),
        }),
      );
    });
  });

  describe('getMenuKpis (agrégation SQL — parité avec l\'ancien reduce JS)', () => {
    it('should return KPIs for empty data', async () => {
      // 1re requête = agrégat global, 2e = GROUP BY typeId
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{
          totalItems: 0, avgPrice: null, avgCost: null, avgMargin: null,
          lowMarginItems: 0, highMarginItems: 0,
        }])
        .mockResolvedValueOnce([]);

      const result = await service.getMenuKpis('tenant-1');
      expect(result.totalItems).toBe(0);
      expect(result.avgPrice).toBe(0);
      expect(result.avgCost).toBe(0);
      expect(result.avgMargin).toBe(0);
      expect(result.byType).toEqual({});
    });

    it('should map SQL aggregates to the same shape as the legacy JS reduce', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{
          totalItems: 2, avgPrice: 15, avgCost: 5.5, avgMargin: 65,
          lowMarginItems: 0, highMarginItems: 2,
        }])
        .mockResolvedValueOnce([
          { typeId: 'food', count: 2 },
        ]);

      const result = await service.getMenuKpis('tenant-1');
      expect(result.totalItems).toBe(2);
      expect(result.avgPrice).toBe(15);
      expect(result.avgCost).toBe(5.5);
      expect(result.avgMargin).toBe(65);
      expect(result.highMarginItems).toBe(2);
      expect(result.lowMarginItems).toBe(0);
      expect(result.byType).toEqual({ food: 2 });
    });

    it('should run exactly 2 SQL queries instead of fetching every item (perf N→2)', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ totalItems: 0, avgPrice: null, avgCost: null, avgMargin: null, lowMarginItems: 0, highMarginItems: 0 }])
        .mockResolvedValueOnce([]);

      await service.getMenuKpis('tenant-1');
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(mockPrisma.menuItem.findMany).not.toHaveBeenCalled();
    });

    it('should surface the unclassified bucket from SQL COALESCE', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ totalItems: 3, avgPrice: 10, avgCost: 4, avgMargin: 50, lowMarginItems: 1, highMarginItems: 0 }])
        .mockResolvedValueOnce([
          { typeId: 'unclassified', count: 1 },
          { typeId: 'drink', count: 2 },
        ]);

      const result = await service.getMenuKpis('tenant-1');
      expect(result.byType).toEqual({ unclassified: 1, drink: 2 });
    });
  });

  describe('getEventKpis (agrégation SQL — parité avec l\'ancien reduce JS)', () => {
    it('should return KPIs for empty events', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        totalEvents: 0, totalRevenue: null, totalTransactions: null, upcoming: 0, completed: 0,
      }]);

      const result = await service.getEventKpis('tenant-1');
      expect(result.totalEvents).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.avgRevenue).toBe(0);
      expect(result.totalTransactions).toBe(0);
    });

    it('should compute event KPIs from a single SQL pass', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        totalEvents: 2, totalRevenue: 8000, totalTransactions: 300n, upcoming: 1, completed: 1,
      }]);

      const result = await service.getEventKpis('tenant-1');
      expect(result.totalEvents).toBe(2);
      expect(result.totalRevenue).toBe(8000);
      expect(result.avgRevenue).toBe(4000);
      expect(result.totalTransactions).toBe(300);
      expect(result.completed).toBe(1);
      expect(result.upcoming).toBe(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.event.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getTimeline', () => {
    it('rejects an eventId unknown to the tenant instead of silently returning [] (garde ownership)', async () => {
      mockPrisma.salesEvent.findFirst.mockResolvedValue(null);

      await expect(service.getTimeline('evt-inconnu', 'tenant-1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('runs the aggregate when the event belongs to the tenant', async () => {
      mockPrisma.salesEvent.findFirst.mockResolvedValue({ id: 'evt-1' });
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.getTimeline('evt-1', 'tenant-1');
      expect(result).toEqual([]);
      expect(mockPrisma.salesEvent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'evt-1', tenantId: 'tenant-1' } }),
      );
    });
  });

  describe('getCostBreakdown', () => {
    it('should return mapped items', async () => {
      mockPrisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-1', name: 'Burger', basePrice: 12, totalCost: 4, margin: 66,
          productType: { name: 'Food' }, productCategory: { name: 'Main' },
        },
      ]);

      const result = await service.getCostBreakdown('tenant-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Burger');
      expect(result[0].type).toBe('Food');
      expect(result[0].category).toBe('Main');
    });

    it('should handle null relations', async () => {
      mockPrisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-2', name: 'Water', basePrice: 3, totalCost: 0.5, margin: 83,
          productType: null, productCategory: null,
        },
      ]);

      const result = await service.getCostBreakdown('tenant-1');
      expect(result[0].type).toBe('N/A');
      expect(result[0].category).toBe('N/A');
    });
  });
});
