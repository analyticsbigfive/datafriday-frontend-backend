import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HistoryAliasesService } from './history-aliases.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('HistoryAliasesService', () => {
  let service: HistoryAliasesService;

  const mockPrisma = {
    space: { findFirst: jest.fn() },
    menuItem: { findFirst: jest.fn() },
    menuItemHistoryAlias: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };

  const dto = {
    spaceId: 'space-1',
    sourceMenuItemId: 'mi-old',
    sourceName: 'Ancienne marque',
    targetMenuItemId: 'mi-new',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryAliasesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HistoryAliasesService>(HistoryAliasesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('rejects a space that does not belong to the calling tenant', async () => {
      mockPrisma.space.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, 'tenant-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.menuItemHistoryAlias.upsert).not.toHaveBeenCalled();
    });

    it('rejects a target MenuItem that does not belong to the calling tenant', async () => {
      mockPrisma.space.findFirst.mockResolvedValue({ id: 'space-1' });
      mockPrisma.menuItem.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, 'tenant-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.menuItemHistoryAlias.upsert).not.toHaveBeenCalled();
    });

    it('rejects an empty sourceName (whitespace only)', async () => {
      await expect(
        service.create({ ...dto, sourceName: '   ' }, 'tenant-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.menuItemHistoryAlias.upsert).not.toHaveBeenCalled();
    });

    it('rejects an alias chain: the source is already the target of another alias', async () => {
      mockPrisma.space.findFirst.mockResolvedValue({ id: 'space-1' });
      mockPrisma.menuItem.findFirst.mockResolvedValue({ id: 'mi-new' });
      // 1er findFirst (source déjà cible ?) → oui ; 2e (cible déjà source ?) → non.
      mockPrisma.menuItemHistoryAlias.findFirst
        .mockResolvedValueOnce({ id: 'alias-x' })
        .mockResolvedValueOnce(null);

      await expect(service.create(dto, 'tenant-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.menuItemHistoryAlias.upsert).not.toHaveBeenCalled();
    });

    it('rejects an alias chain: the target is already a source (by catalog id)', async () => {
      mockPrisma.space.findFirst.mockResolvedValue({ id: 'space-1' });
      mockPrisma.menuItem.findFirst.mockResolvedValue({ id: 'mi-new' });
      mockPrisma.menuItemHistoryAlias.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'alias-y' });

      await expect(service.create(dto, 'tenant-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.menuItemHistoryAlias.upsert).not.toHaveBeenCalled();
    });

    it('upserts on (tenant, space, sourceName) when everything is owned — re-mapping replaces the target', async () => {
      mockPrisma.space.findFirst.mockResolvedValue({ id: 'space-1' });
      mockPrisma.menuItem.findFirst.mockResolvedValue({ id: 'mi-new' });
      mockPrisma.menuItemHistoryAlias.findFirst.mockResolvedValue(null);
      mockPrisma.menuItemHistoryAlias.upsert.mockResolvedValue({ id: 'alias-1', ...dto });

      const result = await service.create(dto, 'tenant-1', 'user-1');

      expect(result).toEqual({ id: 'alias-1', ...dto });
      const call = mockPrisma.menuItemHistoryAlias.upsert.mock.calls[0][0];
      expect(call.where).toEqual({
        tenantId_spaceId_sourceName: {
          tenantId: 'tenant-1',
          spaceId: 'space-1',
          sourceName: 'Ancienne marque',
        },
      });
      expect(call.update.targetMenuItemId).toBe('mi-new');
      expect(call.create.createdBy).toBe('user-1');
    });

    it('trims sourceName before using it as the upsert key', async () => {
      mockPrisma.space.findFirst.mockResolvedValue({ id: 'space-1' });
      mockPrisma.menuItem.findFirst.mockResolvedValue({ id: 'mi-new' });
      mockPrisma.menuItemHistoryAlias.findFirst.mockResolvedValue(null);
      mockPrisma.menuItemHistoryAlias.upsert.mockResolvedValue({ id: 'alias-1' });

      await service.create({ ...dto, sourceName: '  Ancienne marque  ' }, 'tenant-1');

      const call = mockPrisma.menuItemHistoryAlias.upsert.mock.calls[0][0];
      expect(call.where.tenantId_spaceId_sourceName.sourceName).toBe('Ancienne marque');
    });
  });

  describe('remove', () => {
    it('rejects an alias that does not belong to the calling tenant', async () => {
      mockPrisma.menuItemHistoryAlias.findFirst.mockResolvedValue(null);

      await expect(service.remove('alias-other-tenant', 'tenant-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.menuItemHistoryAlias.delete).not.toHaveBeenCalled();
    });

    it('deletes an owned alias', async () => {
      mockPrisma.menuItemHistoryAlias.findFirst.mockResolvedValue({ id: 'alias-1' });

      await service.remove('alias-1', 'tenant-1');

      expect(mockPrisma.menuItemHistoryAlias.delete).toHaveBeenCalledWith({
        where: { id: 'alias-1' },
      });
    });
  });

  describe('list', () => {
    it('scopes the query by (tenantId, spaceId) — foreign space yields empty, no leak', async () => {
      mockPrisma.menuItemHistoryAlias.findMany.mockResolvedValue([]);

      const result = await service.list('space-x', 'tenant-1');

      expect(result).toEqual([]);
      expect(mockPrisma.menuItemHistoryAlias.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', spaceId: 'space-x' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
