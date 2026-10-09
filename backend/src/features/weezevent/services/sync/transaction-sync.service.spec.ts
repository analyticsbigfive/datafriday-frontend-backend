import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventTransactionSyncService } from './transaction-sync.service';
import { PrismaService } from '../../../../core/database/prisma.service';
import { WeezeventClientService } from '../weezevent-client.service';
import { SalesPriceAggService } from '../../../../shared/pricing/sales-price-agg.service';

const TENANT_ID = 'tenant-001';
const INTEGRATION_ID = 'integ-001';
const ORG_ID = 'org-001';

const mockIntegration = {
    id: INTEGRATION_ID,
    tenantId: TENANT_ID,
    enabled: true,
    weezevent: { organizationId: ORG_ID },
};

const mockApiTransaction = {
    id: 'tx-1',
    transaction_id: 'tx-1',
    event_id: 42,
    event_name: 'Test Event',
    total_amount: 1000,
    currency: 'EUR',
    status: 'confirmed',
    created_at: '2024-01-01T12:00:00Z',
    // Service iterates over `rows` (WeezeventTransaction interface field),
    // using `item_id` as the product weezeventId
    rows: [
        {
            id: 1,
            item_id: 7,
            item_name: 'VIP Ticket',
            compound_id: 0,
            component: false,
            unit_price: 500,
            vat: 0,
            reduction: 0,
            payments: [],
        },
    ],
};

function makePrismaMock() {
    return {
        integration: {
            findUnique: jest.fn().mockResolvedValue(mockIntegration),
        },
        salesProduct: {
            findMany: jest.fn().mockResolvedValue([]),
            upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: `prod-${create.externalId}`, externalId: create.externalId })),
        },
        salesEvent: {
            findMany: jest.fn().mockResolvedValue([]),
            upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: `evt-${create.externalId}`, externalId: create.externalId })),
        },
        salesLocation: {
            upsert: jest.fn().mockResolvedValue({ id: 'loc-1' }),
        },
        salesTransaction: {
            upsert: jest.fn().mockResolvedValue({ id: 'tx-db-1', externalId: 'tx-1' }),
            findUnique: jest.fn().mockResolvedValue(null),
        },
        salesTransactionItem: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([]),
        },
        salesPayment: {
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
    };
}

function makeClientMock() {
    return {
        getTransactions: jest.fn().mockResolvedValue({
            data: [mockApiTransaction],
            meta: { total_pages: 1, current_page: 1, total: 1 },
        }),
        getTransaction: jest.fn().mockResolvedValue(mockApiTransaction),
    };
}

describe('WeezeventTransactionSyncService', () => {
    let service: WeezeventTransactionSyncService;
    let prisma: ReturnType<typeof makePrismaMock>;
    let client: ReturnType<typeof makeClientMock>;

    beforeEach(async () => {
        prisma = makePrismaMock();
        client = makeClientMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventTransactionSyncService,
                { provide: PrismaService, useValue: prisma },
                { provide: WeezeventClientService, useValue: client },
                // Agrégat de prix incrémental (chantier perf 2026-09) : effets de bord hors périmètre ici.
                { provide: SalesPriceAggService, useValue: { applyDeltaSafe: jest.fn().mockResolvedValue(undefined), refreshForIntegrationSafe: jest.fn().mockResolvedValue(undefined) } },
            ],
        }).compile();

        service = module.get(WeezeventTransactionSyncService);
    });

    // ─── syncSingleTransaction ────────────────────────────────────────────────

    describe('syncSingleTransaction()', () => {
        it('returns created: false when the transaction already exists', async () => {
            prisma.salesTransaction.findUnique.mockResolvedValue({ id: 'tx-db-1' });

            const result = await service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1');

            expect(result.created).toBe(false);
        });

        it('returns created: true for a brand-new transaction', async () => {
            // findUnique returns null → transaction is new
            prisma.salesTransaction.findUnique.mockResolvedValue(null);

            const result = await service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1');

            expect(result.created).toBe(true);
        });

        it('upserts the event inline when the single transaction carries event data', async () => {
            prisma.salesTransaction.findUnique.mockResolvedValue(null);

            await service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1');

            expect(prisma.salesEvent.upsert).toHaveBeenCalled();
        });

        // Repris des tests de l'ancienne synchro complète (supprimée, jamais appelée) : la
        // résolution du productId vit dans le chemin webhook encore utilisé.
        it('rattache la ligne au produit déjà connu, sans le recréer', async () => {
            prisma.salesProduct.findMany.mockResolvedValue([{ id: 'prod-db-7', externalId: '7' }]);

            await service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1');

            expect(prisma.salesProduct.upsert).not.toHaveBeenCalled();
            const items = prisma.salesTransactionItem.createMany.mock.calls[0][0].data;
            expect(items[0].productId).toBe('prod-db-7');
        });

        it('crée le produit inconnu à la volée et y rattache la ligne', async () => {
            await service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1');

            expect(prisma.salesProduct.upsert).toHaveBeenCalledTimes(1);
            const items = prisma.salesTransactionItem.createMany.mock.calls[0][0].data;
            expect(items[0].productId).toBe('prod-7');
        });

        it('laisse productId à null si la création du produit échoue, sans faire échouer la synchro', async () => {
            prisma.salesProduct.upsert.mockRejectedValueOnce(new Error('boom'));

            await expect(service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1')).resolves.toBeDefined();
            const items = prisma.salesTransactionItem.createMany.mock.calls[0][0].data;
            expect(items[0].productId).toBeNull();
        });

        it('throws if integration is not found', async () => {
            prisma.integration.findUnique.mockResolvedValue(null);

            await expect(
                service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1'),
            ).rejects.toThrow(/not found/);
        });
    });
});
