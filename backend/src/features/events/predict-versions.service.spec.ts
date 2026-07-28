import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PredictVersionsService } from './predict-versions.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('PredictVersionsService', () => {
  let service: PredictVersionsService;

  const mockPrisma = {
    eventPredictVersion: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops) => Promise.all(ops)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictVersionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PredictVersionsService>(PredictVersionsService);
    jest.clearAllMocks();
  });

  describe('setDefault', () => {
    it('rejects a versionId that does not belong to the calling tenant (BUG-65)', async () => {
      // La version existe bel et bien... mais pour un autre tenant.
      mockPrisma.eventPredictVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.setDefault('evt-1', 'version-from-another-tenant', 'tenant-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.eventPredictVersion.update).not.toHaveBeenCalled();
    });

    it('sets the default when the version belongs to the calling tenant', async () => {
      mockPrisma.eventPredictVersion.findFirst.mockResolvedValue({
        id: 'version-1',
        tenantId: 'tenant-1',
        eventId: 'evt-1',
      });

      const result = await service.setDefault('evt-1', 'version-1', 'tenant-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ defaultVersionId: 'version-1' });
    });

    it('clears the default when versionId is null, without any ownership lookup', async () => {
      const result = await service.setDefault('evt-1', null, 'tenant-1');

      expect(mockPrisma.eventPredictVersion.findFirst).not.toHaveBeenCalled();
      expect(result).toEqual({ defaultVersionId: null });
    });
  });
});
