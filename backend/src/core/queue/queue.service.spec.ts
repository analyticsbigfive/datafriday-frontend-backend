import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueService } from './queue.service';
import { QUEUES } from './queue.constants';

const createMockQueue = () => ({
  add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  getActive: jest.fn().mockResolvedValue([]),
  getWaitingCount: jest.fn().mockResolvedValue(5),
  getActiveCount: jest.fn().mockResolvedValue(2),
  getCompletedCount: jest.fn().mockResolvedValue(100),
  getFailedCount: jest.fn().mockResolvedValue(3),
});

describe('QueueService', () => {
  let service: QueueService;
  let dataSyncQueue: ReturnType<typeof createMockQueue>;
  let aggregationQueue: ReturnType<typeof createMockQueue>;

  beforeEach(async () => {
    dataSyncQueue = createMockQueue();
    aggregationQueue = createMockQueue();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: getQueueToken(QUEUES.DATA_SYNC), useValue: dataSyncQueue },
        { provide: getQueueToken(QUEUES.AGGREGATION), useValue: aggregationQueue },
        { provide: getQueueToken(QUEUES.SIMULATION), useValue: createMockQueue() },
      ],
    }).compile();
    service = module.get(QueueService);
  });

  describe('queueWeezeventSyncType', () => {
    it('met en file un job partiel avec l’intégration', async () => {
      await service.queueWeezeventSyncType('tenant-1', 'attendees', 'integ-1', { eventId: 'ev-1' });

      expect(dataSyncQueue.add).toHaveBeenCalledWith(
        'weezevent-attendees',
        { type: 'weezevent-partial', tenantId: 'tenant-1', syncType: 'attendees', integrationId: 'integ-1', options: { eventId: 'ev-1' } },
        expect.objectContaining({ priority: 5 }),
      );
    });

    it('ne fusionne pas deux events distincts dans la même minute', async () => {
      await service.queueWeezeventSyncType('tenant-1', 'attendees', 'integ-1', { eventId: 'ev-1' });
      await service.queueWeezeventSyncType('tenant-1', 'attendees', 'integ-1', { eventId: 'ev-2' });

      const [first, second] = dataSyncQueue.add.mock.calls.map((c) => c[2].jobId);
      expect(first).not.toEqual(second);
    });

    it('baisse la priorité des synchros complètes', async () => {
      await service.queueWeezeventSyncType('tenant-1', 'events', 'integ-1', { fullSync: true });
      expect(dataSyncQueue.add.mock.calls[0][2].priority).toBe(11);
    });
  });

  describe('queueAggregationJob', () => {
    it('met en file le job d’agrégation', async () => {
      const data = { type: 'synchronize' as const, tenantId: 't', spaceId: 's', jobLogId: 'log' };
      await service.queueAggregationJob(data);
      expect(aggregationQueue.add).toHaveBeenCalledWith('aggregation-synchronize', data, expect.any(Object));
    });
  });

  describe('getQueueStats', () => {
    it('renvoie les compteurs d’une file', async () => {
      await expect(service.getQueueStats(QUEUES.DATA_SYNC)).resolves.toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
      });
    });

    it('lève une 404 pour une file inconnue', async () => {
      await expect(service.getQueueStats('unknown-queue')).rejects.toThrow('Queue unknown-queue not found');
    });
  });

  describe('getAllQueueStats', () => {
    it('couvre toutes les files déclarées', async () => {
      const allStats = await service.getAllQueueStats();
      expect(Object.keys(allStats).sort()).toEqual(Object.values(QUEUES).sort());
    });
  });
});
