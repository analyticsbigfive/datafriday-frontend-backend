import { LiveAggregationTriggerService } from './live-aggregation-trigger.service';

describe('LiveAggregationTriggerService (BUG-379-02)', () => {
    const group = { tenantId: 'tenant', spaceId: 'jean-bouin', integrationId: 'pfc', eventIds: ['pfc-lyon'] };
    let prisma: any;
    let queue: any;
    let redis: any;
    let service: LiveAggregationTriggerService;

    beforeEach(() => {
        prisma = {
            event: { findMany: jest.fn().mockResolvedValue([{ eventDate: new Date('2026-09-12T00:00:00Z') }]) },
            aggregationJobLog: { create: jest.fn().mockResolvedValue({ id: 'job-log-1' }) },
        };
        queue = { queueAggregationJob: jest.fn() };
        const store = new Map<string, unknown>();
        redis = {
            has: jest.fn(async (k: string) => store.has(k)),
            set: jest.fn(async (k: string, v: unknown) => { store.set(k, v); }),
            get: jest.fn(async (k: string) => store.get(k) ?? null),
            delete: jest.fn(async (k: string) => { store.delete(k); }),
        };
        service = new LiveAggregationTriggerService(prisma, queue, redis);
    });

    it('queues a process-event-minutes job with the trigger in metadata', async () => {
        expect(await service.queueMinuteAggregation(group, 'live-sync')).toBe(true);
        expect(prisma.aggregationJobLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                jobType: 'incremental',
                status: 'pending',
                metadata: { eventIds: ['pfc-lyon'], integrationId: 'pfc', trigger: 'live-sync' },
            }),
        });
        expect(queue.queueAggregationJob).toHaveBeenCalledWith({
            type: 'process-event-minutes',
            tenantId: 'tenant',
            spaceId: 'jean-bouin',
            jobLogId: 'job-log-1',
            eventIds: ['pfc-lyon'],
            integrationId: 'pfc',
        });
    });

    it('coalesces: a second call while a job is pending queues nothing', async () => {
        await service.queueMinuteAggregation(group, 'live-sync');
        expect(await service.queueMinuteAggregation(group, 'webhook-live')).toBe(false);
        expect(queue.queueAggregationJob).toHaveBeenCalledTimes(1);
    });

    it('releases the pending flag when enqueueing fails', async () => {
        queue.queueAggregationJob.mockRejectedValueOnce(new Error('redis down'));
        await expect(service.queueMinuteAggregation(group, 'live-sync')).rejects.toThrow('redis down');
        expect(await service.queueMinuteAggregation(group, 'live-sync')).toBe(true);
    });

    it('records the full rebuild time per event', async () => {
        await service.queueFullRebuild(group, 'live-reconciliation');
        expect(queue.queueAggregationJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'process-events', eventIds: ['pfc-lyon'] }));
        expect(await service.lastFullRebuildAt('pfc-lyon')).toBeInstanceOf(Date);
    });
});
