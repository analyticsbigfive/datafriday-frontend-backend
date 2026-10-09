import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventCronService } from './weezevent-cron.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from '../services/weezevent-sync.service';
import { WeezeventIncrementalSyncService } from '../services/weezevent-incremental-sync.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { passthroughTenantContext } from '../../../core/tenant/tenant-context.testing';

describe('WeezeventCronService', () => {
    let service: WeezeventCronService;

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
        salesEvent: {
            findMany: jest.fn(),
        },
        aggregationJobLog: {
            create: jest.fn(),
        },
    };

    const mockSyncService = {
        syncTransactions: jest.fn(),
        syncEvents: jest.fn(),
        syncProducts: jest.fn(),
    };

    const mockIncrementalSyncService = {
        syncTransactionsIncremental: jest.fn(),
        syncEventsIncremental: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventCronService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: TenantContextService, useValue: passthroughTenantContext() },
                { provide: WeezeventSyncService, useValue: mockSyncService },
                { provide: WeezeventIncrementalSyncService, useValue: mockIncrementalSyncService },
            ],
        }).compile();

        service = module.get<WeezeventCronService>(WeezeventCronService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // BUG-379-02 : syncRecentTransactions et triggerLiveAggregationSafetyNet sont remplacés par
    // jobs/ (LiveSyncSchedulerService, LiveReconciliationCronService), testés là-bas.

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

});
