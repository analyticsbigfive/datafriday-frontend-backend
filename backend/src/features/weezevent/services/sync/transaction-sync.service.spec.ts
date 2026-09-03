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

function makePriceAggMock() {
    return {
        refreshForKeysSafe: jest.fn().mockResolvedValue(undefined),
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
    let priceAgg: ReturnType<typeof makePriceAggMock>;

    beforeEach(async () => {
        prisma = makePrismaMock();
        client = makeClientMock();
        priceAgg = makePriceAggMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventTransactionSyncService,
                { provide: PrismaService, useValue: prisma },
                { provide: WeezeventClientService, useValue: client },
                { provide: SalesPriceAggService, useValue: priceAgg },
            ],
        }).compile();

        service = module.get(WeezeventTransactionSyncService);
    });

    // ─── syncTransactions ─────────────────────────────────────────────────────

    describe('syncTransactions()', () => {
        it('returns a successful SyncResult after syncing one transaction', async () => {
            const result = await service.syncTransactions(TENANT_ID, INTEGRATION_ID);

            expect(result.success).toBe(true);
            expect(result.type).toBe('transactions');
            expect(result.itemsSynced).toBeGreaterThanOrEqual(1);
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('upserts an event inline when the transaction carries event data', async () => {
            await service.syncTransactions(TENANT_ID, INTEGRATION_ID);

            expect(prisma.salesEvent.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        tenantId_integrationId_externalId: expect.objectContaining({
                            externalId: '42',
                        }),
                    }),
                }),
            );
        });

        it('upserts a product inline when the transaction item carries product data', async () => {
            await service.syncTransactions(TENANT_ID, INTEGRATION_ID);

            expect(prisma.salesProduct.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        tenantId_integrationId_externalId: expect.objectContaining({
                            externalId: '7',
                        }),
                    }),
                }),
            );
        });

        it('skips duplicate event upserts across pages (seenEventWids guard)', async () => {
            // Two transactions for the same event
            client.getTransactions.mockResolvedValue({
                data: [mockApiTransaction, { ...mockApiTransaction, id: 'tx-2', transaction_id: 'tx-2' }],
                meta: { total_pages: 1, current_page: 1, total: 2 },
            });

            await service.syncTransactions(TENANT_ID, INTEGRATION_ID);

            // Event 42 should only be upserted once (seenEventWids guard)
            const eventUpsertCalls = (prisma.salesEvent.upsert as jest.Mock).mock.calls.filter(
                ([args]) => args.where?.tenantId_integrationId_externalId?.externalId === '42',
            );
            expect(eventUpsertCalls.length).toBe(1);
        });

        it('throws if integration is not found', async () => {
            prisma.integration.findUnique.mockResolvedValue(null);
            await expect(service.syncTransactions(TENANT_ID, INTEGRATION_ID)).rejects.toThrow(/not found/);
        });

        it('throws if integration is disabled', async () => {
            prisma.integration.findUnique.mockResolvedValue({ ...mockIntegration, enabled: false });
            await expect(service.syncTransactions(TENANT_ID, INTEGRATION_ID)).rejects.toThrow(/disabled/);
        });

        it('does not throw when transaction items are null (null guard)', async () => {
            client.getTransactions.mockResolvedValue({
                data: [{ ...mockApiTransaction, items: null }],
                meta: { total_pages: 1, current_page: 1, total: 1 },
            });

            await expect(service.syncTransactions(TENANT_ID, INTEGRATION_ID)).resolves.toMatchObject({
                success: true,
            });
        });
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

        it('throws if integration is not found', async () => {
            prisma.integration.findUnique.mockResolvedValue(null);

            await expect(
                service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1'),
            ).rejects.toThrow(/not found/);
        });
    });

    // ─── Phantom menu revenue (CA fantôme des lignes menu/formule) ─────────────

    describe('upsertTransactionItems() — CA fantôme menu/formule', () => {
        it('zeroes the menu line unitPrice when its components are paid in the same transaction', async () => {
            prisma.salesTransaction.findUnique.mockResolvedValue(null);
            client.getTransaction.mockResolvedValue({
                ...mockApiTransaction,
                rows: [
                    {
                        id: 1,
                        item_id: 73,
                        item_name: 'MENU BURGER BOEUF FRITE BOISSONS',
                        compound_id: null,
                        component: false,
                        unit_price: 1600,
                        vat: 0,
                        reduction: 0,
                        payments: [],
                    },
                    {
                        id: 2,
                        item_id: 53,
                        item_name: 'BURGER BOEUF + FRITES',
                        compound_id: null,
                        component: false,
                        unit_price: 1189,
                        vat: 10,
                        reduction: 0,
                        payments: [{ id: 1, amount: 1189, quantity: 1 }],
                    },
                    {
                        id: 3,
                        item_id: 18,
                        item_name: 'DEMI BIERE 25cl',
                        compound_id: null,
                        component: false,
                        unit_price: 411,
                        vat: 20,
                        reduction: 0,
                        payments: [{ id: 2, amount: 411, quantity: 1 }],
                    },
                ],
            });

            await service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1');

            const itemsData = prisma.salesTransactionItem.createMany.mock.calls[0][0].data;
            const menuItem = itemsData.find((it: any) => it.productName === 'MENU BURGER BOEUF FRITE BOISSONS');
            const burgerItem = itemsData.find((it: any) => it.productName === 'BURGER BOEUF + FRITES');
            const beerItem = itemsData.find((it: any) => it.productName === 'DEMI BIERE 25cl');

            expect(menuItem.unitPrice).toBe(0);
            expect(burgerItem.unitPrice).toBe(11.89);
            expect(beerItem.unitPrice).toBe(4.11);
        });

        it('keeps unitPrice unchanged when no line in the transaction has payments (cashless)', async () => {
            prisma.salesTransaction.findUnique.mockResolvedValue(null);
            client.getTransaction.mockResolvedValue({
                ...mockApiTransaction,
                rows: [
                    {
                        id: 1,
                        item_id: 73,
                        item_name: 'MENU BURGER BOEUF FRITE BOISSONS',
                        compound_id: null,
                        component: false,
                        unit_price: 1600,
                        vat: 0,
                        reduction: 0,
                        payments: [],
                    },
                ],
            });

            await service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1');

            const itemsData = prisma.salesTransactionItem.createMany.mock.calls[0][0].data;
            expect(itemsData[0].unitPrice).toBe(16);
        });
    });
});
