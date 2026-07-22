import { Test, TestingModule } from '@nestjs/testing';
import { EventWeezeventLinkService } from './event-weezevent-link.service';
import { PrismaService } from '../../../core/database/prisma.service';

describe('EventWeezeventLinkService', () => {
  let service: EventWeezeventLinkService;

  const mockPrisma = {
    $queryRaw: jest.fn(),
    event: {
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventWeezeventLinkService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EventWeezeventLinkService>(EventWeezeventLinkService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('relinkForTenantDate', () => {
    it('links when exactly 1 unlinked Event and 1 WeezeventEvent share tenant+date', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'evt-1' }])
        .mockResolvedValueOnce([{ id: 'we-1' }]);

      await service.relinkForTenantDate('tenant-1', new Date('2026-07-15'));

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { weezeventEventId: 'we-1' },
      });
    });

    it('does NOT link when no unlinked Event exists for the date', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service.relinkForTenantDate('tenant-1', new Date('2026-07-15'));

      expect(mockPrisma.event.update).not.toHaveBeenCalled();
      // Court-circuite avant même de chercher les candidats WeezeventEvent
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('does NOT link when 2 unlinked Events share the same day (ambiguous on the Event side)', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 'evt-1' }, { id: 'evt-2' }]);

      await service.relinkForTenantDate('tenant-1', new Date('2026-07-15'));

      expect(mockPrisma.event.update).not.toHaveBeenCalled();
    });

    it('does NOT link when 2 WeezeventEvent candidates share the same day (ambiguous on the Weezevent side)', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'evt-1' }])
        .mockResolvedValueOnce([{ id: 'we-1' }, { id: 'we-2' }]);

      await service.relinkForTenantDate('tenant-1', new Date('2026-07-15'));

      expect(mockPrisma.event.update).not.toHaveBeenCalled();
    });
  });
});
