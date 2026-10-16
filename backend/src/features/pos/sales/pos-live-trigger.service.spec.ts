import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/database/prisma.service';
import { QueueService } from '../../../core/queue/queue.service';
import { RedisService } from '../../../core/redis/redis.service';
import { LIVE_PENDING_TTL_SEC, livePendingKey } from '../../../shared/constants/live-aggregation';
import { PosLiveTriggerService } from './pos-live-trigger.service';

const target = { tenantId: 'tenant-1', spaceId: 'space-1', integrationId: 'integ-pos', eventId: 'event-1', eventDate: new Date('2026-10-16') };

describe('PosLiveTriggerService', () => {
  let service: PosLiveTriggerService;
  const prisma = { aggregationJobLog: { create: jest.fn() } };
  const queue = { queueAggregationJob: jest.fn() };
  const redis = { has: jest.fn(), set: jest.fn(), delete: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    redis.has.mockResolvedValue(false);
    redis.set.mockResolvedValue(undefined);
    redis.delete.mockResolvedValue(undefined);
    prisma.aggregationJobLog.create.mockResolvedValue({ id: 'log-1' });
    queue.queueAggregationJob.mockResolvedValue({});
    const module = await Test.createTestingModule({
      providers: [
        PosLiveTriggerService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queue },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = module.get(PosLiveTriggerService);
  });

  it('met en file un job process-event-minutes pour (espace, intégration POS)', async () => {
    expect(await service.trigger(target, 'pos-sale')).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(livePendingKey('space-1', 'integ-pos'), expect.any(String), { ttl: LIVE_PENDING_TTL_SEC });
    expect(queue.queueAggregationJob).toHaveBeenCalledWith({
      type: 'process-event-minutes',
      tenantId: 'tenant-1',
      spaceId: 'space-1',
      jobLogId: 'log-1',
      eventIds: ['event-1'],
      integrationId: 'integ-pos',
    });
  });

  it('coalesce : un job déjà en attente couvre les ventes suivantes', async () => {
    redis.has.mockResolvedValue(true);
    expect(await service.trigger(target, 'pos-sale')).toBe(false);
    expect(queue.queueAggregationJob).not.toHaveBeenCalled();
  });

  it('best-effort : un échec de file lève le verrou et ne remonte pas', async () => {
    queue.queueAggregationJob.mockRejectedValue(new Error('redis down'));
    await expect(service.trigger(target, 'pos-cancel')).resolves.toBe(false);
    expect(redis.delete).toHaveBeenCalledWith(livePendingKey('space-1', 'integ-pos'));
  });
});
