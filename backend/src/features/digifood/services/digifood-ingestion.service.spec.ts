import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/database/prisma.service';
import { DigifoodIngestionService } from './digifood-ingestion.service';
import { NormalizedOrder } from './digifood-order-normalizer';

const TENANT = 'tenant-1';
const INTEGRATION = 'integ-1';

function makeOrder(id: string, overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
    return {
        id,
        type: 'sale',
        total: 10,
        placedAt: new Date('2026-07-01T12:00:00Z'),
        location: { id: 'site_1', name: 'Stade' },
        shop: { id: 'shop_1', name: 'Buvette' },
        items: [{
            id: 'it_1',
            productKey: 'var_1',
            name: 'Burger',
            namePrivate: null,
            variation: null,
            variationId: 'var_1',
            family: 'Food',
            quantity: 1,
            unitPrice: 10,
            vatRate: 10,
            externalReference: null,
            barcode: null,
            depth: 0,
            parentItemId: null,
            raw: {},
        }],
        payments: [],
        discounts: [],
        relationships: [],
        beforeDiscounts: null,
        medium: null,
        shortId: null,
        sessionId: null,
        cashier: null,
        softwareVersion: null,
        originalOrderId: null,
        raw: {},
        ...overrides,
    };
}

function makePrismaMock() {
    const tx = {
        salesTransaction: {
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue({ id: 'tx-row' }),
        },
        salesTransactionItem: {
            deleteMany: jest.fn().mockResolvedValue({}),
            createMany: jest.fn().mockResolvedValue({}),
        },
    };
    return {
        salesEvent: { upsert: jest.fn().mockResolvedValue({ id: 'event-1' }) },
        salesLocation: { upsert: jest.fn().mockResolvedValue({ id: 'location-1' }) },
        salesProduct: { upsert: jest.fn().mockResolvedValue({ id: 'product-1' }) },
        salesTransaction: { findMany: jest.fn().mockResolvedValue([]) },
        productMapping: { findUnique: jest.fn().mockResolvedValue(null) },
        menuItem: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
        _tx: tx,
    };
}

describe('DigifoodIngestionService', () => {
    let service: DigifoodIngestionService;
    let prisma: ReturnType<typeof makePrismaMock>;

    beforeEach(async () => {
        prisma = makePrismaMock();
        const module = await Test.createTestingModule({
            providers: [
                DigifoodIngestionService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();
        service = module.get(DigifoodIngestionService);
    });

    it('sans cache (webhook) : ré-upserte site/PDV/produit à chaque appel', async () => {
        await service.ingestOrder(TENANT, INTEGRATION, makeOrder('order_1'), 'webhook');
        await service.ingestOrder(TENANT, INTEGRATION, makeOrder('order_2'), 'webhook');

        expect(prisma.salesEvent.upsert).toHaveBeenCalledTimes(2);
        expect(prisma.salesLocation.upsert).toHaveBeenCalledTimes(2);
        expect(prisma.salesProduct.upsert).toHaveBeenCalledTimes(2);
    });

    it('avec cache (import CSV) : un site/PDV/produit déjà vu ne ré-upserte plus', async () => {
        const cache = service.createCache();
        await service.ingestOrder(TENANT, INTEGRATION, makeOrder('order_1'), 'csv', cache);
        await service.ingestOrder(TENANT, INTEGRATION, makeOrder('order_2'), 'csv', cache);

        expect(prisma.salesEvent.upsert).toHaveBeenCalledTimes(1);
        expect(prisma.salesLocation.upsert).toHaveBeenCalledTimes(1);
        expect(prisma.salesProduct.upsert).toHaveBeenCalledTimes(1);
        // La transaction/les items restent propres à CHAQUE commande, jamais mutualisés.
        expect(prisma._tx.salesTransaction.upsert).toHaveBeenCalledTimes(2);
    });

    it('avec cache : un site/PDV/produit différent d\'une commande à l\'autre upserte quand même', async () => {
        const cache = service.createCache();
        await service.ingestOrder(TENANT, INTEGRATION, makeOrder('order_1'), 'csv', cache);
        await service.ingestOrder(
            TENANT,
            INTEGRATION,
            makeOrder('order_2', {
                location: { id: 'site_2', name: 'Autre site' },
                shop: { id: 'shop_2', name: 'Autre buvette' },
                items: [{
                    id: 'it_2', productKey: 'var_2', name: 'Frites', namePrivate: null,
                    variation: null, variationId: 'var_2', family: 'Food', quantity: 1,
                    unitPrice: 3.5, vatRate: 10, externalReference: null, barcode: null,
                    depth: 0, parentItemId: null, raw: {},
                }],
            }),
            'csv',
            cache,
        );

        expect(prisma.salesEvent.upsert).toHaveBeenCalledTimes(2);
        expect(prisma.salesLocation.upsert).toHaveBeenCalledTimes(2);
        expect(prisma.salesProduct.upsert).toHaveBeenCalledTimes(2);
    });
});
