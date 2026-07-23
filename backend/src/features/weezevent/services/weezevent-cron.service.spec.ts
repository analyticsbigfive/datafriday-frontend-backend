import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventCronService } from './weezevent-cron.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from './weezevent-sync.service';
import { WeezeventIncrementalSyncService } from './weezevent-incremental-sync.service';
import { SyncTrackerService } from './sync-tracker.service';
import { QueueService } from '../../../core/queue/queue.service';

describe('WeezeventCronService', () => {
    let service: WeezeventCronService;
    let prisma: PrismaService;
    let syncService: WeezeventSyncService;
    let incrementalSyncService: WeezeventIncrementalSyncService;
    let syncTracker: SyncTrackerService;

    const mockPrismaService = {
        tenant: {
            findMany: jest.fn(),
        },
        integration: {
            findMany: jest.fn(),
        },
        event: {
            findMany: jest.fn(),
        },
        aggregationJobLog: {
            create: jest.fn(),
        },
    };

    const mockQueueService = {
        queueAggregationJob: jest.fn(),
    };

    const mockSyncService = {
        syncTransactions: jest.fn(),
        syncEvents: jest.fn(),
        syncProducts: jest.fn(),
    };

    const mockIncrementalSyncService = {
        syncTransactionsIncremental: jest.fn(),
        syncEventsIncremental: jest.fn(),
        getSyncStatus: jest.fn(),
        resetSyncState: jest.fn(),
    };

    const mockSyncTracker = {
        getRunningSyncs: jest.fn().mockReturnValue([]),
        isRunning: jest.fn().mockReturnValue(false),
        startSync: jest.fn().mockReturnValue('job-id-1'),
        completeSync: jest.fn(),
        failSync: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventCronService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: WeezeventSyncService, useValue: mockSyncService },
                { provide: WeezeventIncrementalSyncService, useValue: mockIncrementalSyncService },
                { provide: SyncTrackerService, useValue: mockSyncTracker },
                { provide: QueueService, useValue: mockQueueService },
            ],
        }).compile();

        service = module.get<WeezeventCronService>(WeezeventCronService);
        prisma = module.get<PrismaService>(PrismaService);
        syncService = module.get<WeezeventSyncService>(WeezeventSyncService);
        incrementalSyncService = module.get<WeezeventIncrementalSyncService>(WeezeventIncrementalSyncService);
        syncTracker = module.get<SyncTrackerService>(SyncTrackerService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('syncRecentTransactions', () => {
        it('should sync transactions incrementally for all enabled tenants', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
                { id: 'tenant-2', name: 'Tenant 2', weezeventOrganizationId: 'org-2' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.integration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockIncrementalSyncService.syncTransactionsIncremental.mockResolvedValue({
                type: 'transactions',
                success: true,
                isIncremental: true,
                itemsSynced: 10,
                itemsCreated: 5,
                itemsUpdated: 5,
                itemsSkipped: 0,
                hasMore: false,
                duration: 1000,
            });

            await service.syncRecentTransactions();

            expect(mockIncrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledTimes(2);
        });

        it('should skip integration if sync already running (BUG-027)', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.integration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockSyncTracker.isRunning.mockReturnValue(true);

            await service.syncRecentTransactions();

            expect(mockSyncTracker.isRunning).toHaveBeenCalledWith('tenant-1', 'transactions', 'integration-1');
            expect(mockIncrementalSyncService.syncTransactionsIncremental).not.toHaveBeenCalled();
            expect(mockSyncTracker.startSync).not.toHaveBeenCalled();
        });

        it('should wrap each sync with startSync/completeSync (BUG-027)', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.integration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockSyncTracker.isRunning.mockReturnValue(false);
            mockIncrementalSyncService.syncTransactionsIncremental.mockResolvedValue({
                isIncremental: true,
                itemsSynced: 10,
                itemsCreated: 5,
                itemsSkipped: 0,
                hasMore: false,
                duration: 1000,
            });

            await service.syncRecentTransactions();

            expect(mockSyncTracker.startSync).toHaveBeenCalledWith('tenant-1', 'transactions', 'integration-1');
            expect(mockSyncTracker.completeSync).toHaveBeenCalledWith('job-id-1');
            expect(mockSyncTracker.failSync).not.toHaveBeenCalled();
        });

        it('should mark the tracked job failed on error, without throwing (BUG-027)', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.integration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockSyncTracker.isRunning.mockReturnValue(false);
            mockIncrementalSyncService.syncTransactionsIncremental.mockRejectedValue(new Error('API Error'));

            // Should not throw
            await expect(service.syncRecentTransactions()).resolves.not.toThrow();

            expect(mockSyncTracker.failSync).toHaveBeenCalledWith('job-id-1', 'API Error');
            expect(mockSyncTracker.completeSync).not.toHaveBeenCalled();
        });
    });

    // BUG-109 : filet de sécurité — re-déclenche l'agrégation pour tout event "en direct"
    // (fenêtre event ± marge), au cas où le déclenchement post-webhook aurait été manqué.
    describe('triggerLiveAggregationSafetyNet', () => {
        const mockTenants = [{ id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' }];

        it('queues aggregation for events currently within their live window', async () => {
            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.event.findMany.mockResolvedValue([
                { id: 'event-1', spaceId: 'space-1', eventDate: new Date(), eventEndDate: null },
            ]);
            mockPrismaService.aggregationJobLog.create.mockResolvedValue({ id: 'job-log-1' });

            await service.triggerLiveAggregationSafetyNet();

            expect(mockPrismaService.aggregationJobLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        tenantId: 'tenant-1',
                        spaceId: 'space-1',
                        metadata: { eventIds: ['event-1'], trigger: 'live-safety-net' },
                    }),
                }),
            );
            expect(mockQueueService.queueAggregationJob).toHaveBeenCalledWith({
                type: 'process-events',
                tenantId: 'tenant-1',
                spaceId: 'space-1',
                jobLogId: 'job-log-1',
                eventIds: ['event-1'],
            });
        });

        it('groups multiple live events of the same space into a single job', async () => {
            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.event.findMany.mockResolvedValue([
                { id: 'event-1', spaceId: 'space-1', eventDate: new Date(), eventEndDate: null },
                { id: 'event-2', spaceId: 'space-1', eventDate: new Date(), eventEndDate: null },
            ]);
            mockPrismaService.aggregationJobLog.create.mockResolvedValue({ id: 'job-log-1' });

            await service.triggerLiveAggregationSafetyNet();

            expect(mockPrismaService.aggregationJobLog.create).toHaveBeenCalledTimes(1);
            expect(mockQueueService.queueAggregationJob).toHaveBeenCalledWith(
                expect.objectContaining({ eventIds: ['event-1', 'event-2'] }),
            );
        });

        it('skips events whose grace window (eventEndDate + 3h) has already passed', async () => {
            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.event.findMany.mockResolvedValue([
                {
                    id: 'event-old',
                    spaceId: 'space-1',
                    eventDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
                    eventEndDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
                },
            ]);

            await service.triggerLiveAggregationSafetyNet();

            expect(mockPrismaService.aggregationJobLog.create).not.toHaveBeenCalled();
            expect(mockQueueService.queueAggregationJob).not.toHaveBeenCalled();
        });

        it('does not throw when queuing fails for one space (best-effort)', async () => {
            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.event.findMany.mockResolvedValue([
                { id: 'event-1', spaceId: 'space-1', eventDate: new Date(), eventEndDate: null },
            ]);
            mockPrismaService.aggregationJobLog.create.mockRejectedValue(new Error('DB error'));

            await expect(service.triggerLiveAggregationSafetyNet()).resolves.not.toThrow();
        });
    });

    describe('syncReferenceData', () => {
        it('should sync events incrementally and products for all enabled tenants', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.integration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockIncrementalSyncService.syncEventsIncremental.mockResolvedValue({
                type: 'events',
                success: true,
                isIncremental: true,
                itemsSynced: 5,
                itemsSkipped: 2,
            });
            mockSyncService.syncProducts.mockResolvedValue({ itemsSynced: 10 });

            await service.syncReferenceData();

            expect(mockIncrementalSyncService.syncEventsIncremental).toHaveBeenCalledWith('tenant-1', 'integration-1', expect.any(Object));
            expect(mockSyncService.syncProducts).toHaveBeenCalledWith('tenant-1', 'integration-1');
        });
    });

    describe('fullHistoricalSync', () => {
        it('should force full sync for events and transactions', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.integration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockIncrementalSyncService.syncEventsIncremental.mockResolvedValue({
                type: 'events',
                success: true,
                itemsSynced: 100,
            });
            mockIncrementalSyncService.syncTransactionsIncremental.mockResolvedValue({
                type: 'transactions',
                success: true,
                itemsSynced: 5000,
            });

            await service.fullHistoricalSync();

            expect(mockIncrementalSyncService.syncEventsIncremental).toHaveBeenCalledWith('tenant-1', 'integration-1', expect.objectContaining({
                forceFullSync: true,
            }));
            expect(mockIncrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledWith('tenant-1', 'integration-1', expect.objectContaining({
                forceFullSync: true,
            }));
        });
    });

    describe('triggerSync', () => {
        it('should trigger transactions incremental sync', async () => {
            mockIncrementalSyncService.syncTransactionsIncremental.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'integration-1', 'transactions');

            expect(mockIncrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledWith(
                'tenant-1',
                'integration-1',
                expect.objectContaining({
                    forceFullSync: undefined,
                    batchSize: 500,
                    maxItems: 10000,
                }),
            );
        });

        it('should trigger events incremental sync', async () => {
            mockIncrementalSyncService.syncEventsIncremental.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'integration-1', 'events');

            expect(mockIncrementalSyncService.syncEventsIncremental).toHaveBeenCalledWith(
                'tenant-1',
                'integration-1',
                expect.objectContaining({
                    forceFullSync: undefined,
                    batchSize: 500,
                    maxItems: 10000,
                }),
            );
        });

        it('should trigger products sync', async () => {
            mockSyncService.syncProducts.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'integration-1', 'products');

            expect(mockSyncService.syncProducts).toHaveBeenCalledWith('tenant-1', 'integration-1');
        });

        it('should trigger full sync with forceFullSync option', async () => {
            mockIncrementalSyncService.syncEventsIncremental.mockResolvedValue({ success: true });
            mockIncrementalSyncService.syncTransactionsIncremental.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'integration-1', 'full');

            expect(mockIncrementalSyncService.syncEventsIncremental).toHaveBeenCalledWith(
                'tenant-1',
                'integration-1',
                expect.objectContaining({ forceFullSync: true }),
            );
            expect(mockIncrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledWith(
                'tenant-1',
                'integration-1',
                expect.objectContaining({ forceFullSync: true }),
            );
        });
    });
});
