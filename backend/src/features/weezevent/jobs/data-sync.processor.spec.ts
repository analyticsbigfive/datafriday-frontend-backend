import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DataSyncProcessor } from './data-sync.processor';
import { WeezeventSyncService } from '../services/weezevent-sync.service';
import { WeezeventIncrementalSyncService } from '../services/weezevent-incremental-sync.service';
import { RedisService } from '../../../core/redis/redis.service';
import { DataSyncJobData } from '../../../core/queue/queue.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { passthroughTenantContext } from '../../../core/tenant/tenant-context.testing';

describe('DataSyncProcessor', () => {
  let processor: DataSyncProcessor;

  const syncService = {
    syncProducts: jest.fn().mockResolvedValue({ itemsSynced: 20 }),
    syncOrders: jest.fn().mockResolvedValue({ itemsSynced: 7 }),
    syncPrices: jest.fn().mockResolvedValue({ itemsSynced: 3 }),
    syncAttendees: jest.fn().mockResolvedValue({ itemsSynced: 9 }),
  };
  const incrementalSyncService = {
    syncTransactionsIncremental: jest.fn().mockResolvedValue({ itemsSynced: 100 }),
    syncEventsIncremental: jest.fn().mockResolvedValue({ itemsSynced: 10 }),
  };
  const redisService = { deletePattern: jest.fn().mockResolvedValue(5) };

  const jobFor = (data: Partial<DataSyncJobData>) =>
    ({
      id: 'job-1',
      name: `weezevent-${data.syncType}`,
      data: { type: 'weezevent-partial', tenantId: 'tenant-1', integrationId: 'integ-1', ...data },
      updateProgress: jest.fn(),
    }) as unknown as Job<DataSyncJobData>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataSyncProcessor,
        { provide: WeezeventSyncService, useValue: syncService },
        { provide: WeezeventIncrementalSyncService, useValue: incrementalSyncService },
        { provide: RedisService, useValue: redisService },
        { provide: TenantContextService, useValue: passthroughTenantContext() },
      ],
    }).compile();
    processor = module.get(DataSyncProcessor);
  });

  it('synchronise les transactions de l’intégration du job', async () => {
    const job = jobFor({ syncType: 'transactions', options: { fullSync: true } });
    const result = await processor.process(job);

    expect(incrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledWith(
      'tenant-1',
      'integ-1',
      expect.objectContaining({ forceFullSync: true }),
    );
    expect(result).toMatchObject({ tenantId: 'tenant-1', syncType: 'transactions', fullSync: true, itemsSynced: 100 });
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('passe l’eventId aux synchros par event', async () => {
    await processor.process(jobFor({ syncType: 'attendees', options: { eventId: 'ev-42' } }));
    expect(syncService.syncAttendees).toHaveBeenCalledWith('tenant-1', 'integ-1', 'ev-42');
  });

  it('refuse orders et attendees sans eventId', async () => {
    await expect(processor.process(jobFor({ syncType: 'orders' }))).rejects.toThrow('eventId is required');
    await expect(processor.process(jobFor({ syncType: 'attendees' }))).rejects.toThrow('eventId is required');
  });

  it('refuse un job sans intégration', async () => {
    await expect(processor.process(jobFor({ syncType: 'products', integrationId: undefined }))).rejects.toThrow(
      'integrationId is required',
    );
  });

  it('invalide le cache du tenant après la synchro', async () => {
    await processor.process(jobFor({ syncType: 'products' }));
    expect(redisService.deletePattern).toHaveBeenCalledWith('dashboard:tenant-1:*');
    expect(redisService.deletePattern).toHaveBeenCalledWith('weezevent:tenant-1:*');
  });
});
