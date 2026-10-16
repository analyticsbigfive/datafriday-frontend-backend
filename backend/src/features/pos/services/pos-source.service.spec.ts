import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { POS_INTEGRATION_NAME, POS_MAPPED_BY } from '../pos.contracts';
import { PosSourceService } from './pos-source.service';

const TENANT = 'tenant-1';
const SPACE = 'space-1';
const EVENT = 'event-1';
const INTEGRATION = 'integ-pos';

function makePrismaMock() {
    const mock = {
        integration: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: INTEGRATION }),
            update: jest.fn().mockResolvedValue({}),
        },
        locationSpaceMapping: {
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({}),
        },
        space: { findFirst: jest.fn().mockResolvedValue({ name: 'Stade A' }) },
        $executeRaw: jest.fn().mockResolvedValue(1),
        $transaction: jest.fn(),
        salesEvent: { upsert: jest.fn().mockResolvedValue({ id: 'se-1' }) },
        salesLocation: {
            findMany: jest.fn().mockResolvedValue([]),
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
            update: jest.fn().mockResolvedValue({}),
        },
        locationShopMapping: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
        salesProduct: {
            findMany: jest.fn().mockResolvedValue([]),
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
            update: jest.fn().mockResolvedValue({}),
        },
        productMapping: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
        event: { findFirst: jest.fn() },
        spaceElement: { findMany: jest.fn().mockResolvedValue([]) },
        menuItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // La transaction réutilise les mêmes mocks (le client transactionnel expose la même API).
    mock.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(mock));
    return mock;
}

describe('PosSourceService', () => {
    let service: PosSourceService;
    let prisma: ReturnType<typeof makePrismaMock>;

    beforeEach(async () => {
        prisma = makePrismaMock();
        const module = await Test.createTestingModule({
            providers: [PosSourceService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get(PosSourceService);
    });

    describe('ensureIntegrationForSpace', () => {
        it('crée l\'intégration et son mapping d\'espace dans une transaction verrouillée', async () => {
            await expect(service.ensureIntegrationForSpace(TENANT, SPACE)).resolves.toBe(INTEGRATION);
            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
            const sql = (prisma.$executeRaw.mock.calls[0][0] as string[]).join('?');
            expect(sql).toContain('pg_advisory_xact_lock');
            expect(prisma.$executeRaw.mock.calls[0][1]).toBe(`pos-integration:${TENANT}:${SPACE}`);
            expect(prisma.space.findFirst).toHaveBeenCalledWith({ where: { id: SPACE, tenantId: TENANT }, select: { name: true } });
            expect(prisma.integration.create).toHaveBeenCalledWith({
                data: { tenantId: TENANT, provider: 'POS', name: `${POS_INTEGRATION_NAME} · Stade A`, enabled: true },
                select: { id: true },
            });
            expect(prisma.locationSpaceMapping.create).toHaveBeenCalledWith({
                data: { tenantId: TENANT, salesLocationId: INTEGRATION, spaceId: SPACE },
            });
            // Le verrou est pris avant toute création.
            expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.integration.create.mock.invocationCallOrder[0]);
        });

        it('réutilise l\'intégration de l\'espace sans transaction ni création (idempotent)', async () => {
            prisma.locationSpaceMapping.findMany.mockResolvedValue([{ salesLocationId: 'existing' }]);
            prisma.integration.findFirst.mockResolvedValue({ id: 'existing', enabled: true });
            await expect(service.ensureIntegrationForSpace(TENANT, SPACE)).resolves.toBe('existing');
            await service.ensureIntegrationForSpace(TENANT, SPACE);
            expect(prisma.locationSpaceMapping.findMany).toHaveBeenCalledWith({ where: { tenantId: TENANT, spaceId: SPACE }, select: { salesLocationId: true } });
            expect(prisma.integration.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT, provider: 'POS', id: { in: ['existing'] } });
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(prisma.integration.create).not.toHaveBeenCalled();
        });

        it('réactive une intégration POS désactivée, sous verrou', async () => {
            prisma.locationSpaceMapping.findMany.mockResolvedValue([{ salesLocationId: 'existing' }]);
            prisma.integration.findFirst.mockResolvedValue({ id: 'existing', enabled: false });
            await expect(service.ensureIntegrationForSpace(TENANT, SPACE)).resolves.toBe('existing');
            expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
            expect(prisma.integration.update).toHaveBeenCalledWith({ where: { id: 'existing' }, data: { enabled: true } });
            expect(prisma.integration.create).not.toHaveBeenCalled();
        });

        it('deux espaces donnent deux intégrations distinctes', async () => {
            prisma.integration.create
                .mockResolvedValueOnce({ id: 'integ-A' })
                .mockResolvedValueOnce({ id: 'integ-B' });
            prisma.space.findFirst
                .mockResolvedValueOnce({ name: 'Stade A' })
                .mockResolvedValueOnce({ name: 'Stade B' });
            await expect(service.ensureIntegrationForSpace(TENANT, 'space-A')).resolves.toBe('integ-A');
            await expect(service.ensureIntegrationForSpace(TENANT, 'space-B')).resolves.toBe('integ-B');
            expect(prisma.locationSpaceMapping.create.mock.calls.map((c) => c[0].data)).toEqual([
                { tenantId: TENANT, salesLocationId: 'integ-A', spaceId: 'space-A' },
                { tenantId: TENANT, salesLocationId: 'integ-B', spaceId: 'space-B' },
            ]);
        });

        it('espace introuvable dans le tenant : NotFound, rien créé', async () => {
            prisma.space.findFirst.mockResolvedValue(null);
            await expect(service.ensureIntegrationForSpace(TENANT, SPACE)).rejects.toBeInstanceOf(NotFoundException);
            expect(prisma.integration.create).not.toHaveBeenCalled();
        });
    });

    describe('ensureSalesEvent', () => {
        it('upsert par (tenant, intégration, Event.id) avec tenantId', async () => {
            await service.ensureSalesEvent(TENANT, INTEGRATION, { id: EVENT, name: 'Match', eventDate: new Date('2026-10-20') });
            const arg = prisma.salesEvent.upsert.mock.calls[0][0];
            expect(arg.where).toEqual({ tenantId_integrationId_externalId: { tenantId: TENANT, integrationId: INTEGRATION, externalId: EVENT } });
            expect(arg.create).toMatchObject({ tenantId: TENANT, integrationId: INTEGRATION, externalId: EVENT });
        });
    });

    describe('ensureLocations', () => {
        const elements = [{ id: 'el-1', name: 'Buvette 1' }, { id: 'el-2', name: 'Buvette 2', type: 'shop' }];

        it('crée les PdV manquants en un lot et les mappe vers leur SpaceElement', async () => {
            prisma.salesLocation.findMany
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([
                    { id: 'sl-1', externalId: 'el-1', name: 'Buvette 1' },
                    { id: 'sl-2', externalId: 'el-2', name: 'Buvette 2' },
                ]);
            const map = await service.ensureLocations(TENANT, INTEGRATION, SPACE, elements);

            expect(map.get('el-1')).toBe('sl-1');
            expect(map.get('el-2')).toBe('sl-2');
            const created = prisma.salesLocation.createMany.mock.calls[0][0];
            expect(created.skipDuplicates).toBe(true);
            expect(created.data).toHaveLength(2);
            expect(created.data.every((d: { tenantId: string; provider: string }) => d.tenantId === TENANT && d.provider === 'POS')).toBe(true);
            expect(prisma.locationShopMapping.createMany).toHaveBeenCalledWith({
                data: [
                    { tenantId: TENANT, salesLocationId: 'sl-1', spaceElementId: 'el-1' },
                    { tenantId: TENANT, salesLocationId: 'sl-2', spaceElementId: 'el-2' },
                ],
                skipDuplicates: true,
            });
        });

        it('idempotent : rien à créer quand tout existe, renommage seulement si le nom change', async () => {
            prisma.salesLocation.findMany.mockResolvedValue([
                { id: 'sl-1', externalId: 'el-1', name: 'Ancien nom' },
                { id: 'sl-2', externalId: 'el-2', name: 'Buvette 2' },
            ]);
            await service.ensureLocations(TENANT, INTEGRATION, SPACE, elements);

            expect(prisma.salesLocation.createMany).not.toHaveBeenCalled();
            expect(prisma.salesLocation.update).toHaveBeenCalledTimes(1);
            expect(prisma.salesLocation.update).toHaveBeenCalledWith({ where: { id: 'sl-1' }, data: { name: 'Buvette 1' } });
        });

        it('liste vide : aucune requête', async () => {
            const map = await service.ensureLocations(TENANT, INTEGRATION, SPACE, []);
            expect(map.size).toBe(0);
            expect(prisma.salesLocation.findMany).not.toHaveBeenCalled();
        });

        it('filtre toujours les lectures par tenantId et integrationId', async () => {
            await service.ensureLocations(TENANT, INTEGRATION, SPACE, elements);
            expect(prisma.salesLocation.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT, integrationId: INTEGRATION });
        });
    });

    describe('ensureProducts', () => {
        const items = [{ id: 'mi-1', name: 'Bière', basePrice: 5, vatRate: 20 }, { id: 'mi-2', name: 'Eau' }];

        it('crée les produits manquants et leurs mappings auto (confidence 1, mappedBy pos)', async () => {
            prisma.salesProduct.findMany
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([
                    { id: 'sp-1', externalId: 'mi-1', name: 'Bière' },
                    { id: 'sp-2', externalId: 'mi-2', name: 'Eau' },
                ]);
            const map = await service.ensureProducts(TENANT, INTEGRATION, items);

            expect(map.get('mi-1')).toBe('sp-1');
            const created = prisma.salesProduct.createMany.mock.calls[0][0];
            expect(created.data.every((d: { tenantId: string; provider: string }) => d.tenantId === TENANT && d.provider === 'POS')).toBe(true);
            expect(prisma.productMapping.createMany).toHaveBeenCalledWith({
                data: [
                    { tenantId: TENANT, salesProductId: 'sp-1', menuItemId: 'mi-1', autoMapped: true, confidence: 1, mappedBy: POS_MAPPED_BY },
                    { tenantId: TENANT, salesProductId: 'sp-2', menuItemId: 'mi-2', autoMapped: true, confidence: 1, mappedBy: POS_MAPPED_BY },
                ],
                skipDuplicates: true,
            });
        });

        it('ne passe jamais par un upsert ou update de ProductMapping (mapping existant non écrasé)', async () => {
            prisma.salesProduct.findMany.mockResolvedValue([
                { id: 'sp-1', externalId: 'mi-1', name: 'Bière' },
                { id: 'sp-2', externalId: 'mi-2', name: 'Eau' },
            ]);
            const mappingApi = prisma.productMapping as Record<string, unknown>;
            await service.ensureProducts(TENANT, INTEGRATION, items);
            await service.ensureProducts(TENANT, INTEGRATION, items);

            expect(Object.keys(mappingApi)).toEqual(['createMany']);
            for (const call of prisma.productMapping.createMany.mock.calls) expect(call[0].skipDuplicates).toBe(true);
            expect(prisma.salesProduct.createMany).not.toHaveBeenCalled();
            expect(prisma.salesProduct.update).not.toHaveBeenCalled();
        });
    });

    describe('ensureReferentials', () => {
        it('lève NotFound si l\'évènement n\'est pas dans le tenant et l\'espace', async () => {
            prisma.event.findFirst.mockResolvedValue(null);
            await expect(service.ensureReferentials(TENANT, SPACE, EVENT, ['el-1'], ['mi-1'])).rejects.toBeInstanceOf(NotFoundException);
            expect(prisma.event.findFirst.mock.calls[0][0].where).toEqual({ id: EVENT, tenantId: TENANT, spaceId: SPACE });
            expect(prisma.integration.create).not.toHaveBeenCalled();
        });

        it('enchaîne tout et renvoie les ids utiles, avec tenantId partout', async () => {
            prisma.event.findFirst.mockResolvedValue({
                id: EVENT, name: 'Match', eventDate: new Date('2026-10-20'), eventStartDate: null, eventEndDate: null, configurationId: 'cfg-1',
            });
            prisma.spaceElement.findMany.mockResolvedValue([{ id: 'el-1', name: 'Buvette 1', type: 'shop' }]);
            prisma.menuItem.findMany.mockResolvedValue([{ id: 'mi-1', name: 'Bière', basePrice: 5, vatRate: 20 }]);
            prisma.salesLocation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'sl-1', externalId: 'el-1', name: 'Buvette 1' }]);
            prisma.salesProduct.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'sp-1', externalId: 'mi-1', name: 'Bière' }]);

            const res = await service.ensureReferentials(TENANT, SPACE, EVENT, ['el-1', 'el-1'], ['mi-1']);

            expect(res.integrationId).toBe(INTEGRATION);
            expect(res.salesEventId).toBe('se-1');
            expect(res.locationIdByElementId.get('el-1')).toBe('sl-1');
            expect(res.productIdByMenuItemId.get('mi-1')).toBe('sp-1');
            expect(prisma.menuItem.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT });
            expect(prisma.spaceElement.findMany.mock.calls[0][0].where.id.in).toEqual(['el-1']);
            expect(prisma.locationSpaceMapping.create.mock.calls[0][0].data).toMatchObject({ tenantId: TENANT, spaceId: SPACE });
            expect(prisma.salesEvent.upsert.mock.calls[0][0].create.tenantId).toBe(TENANT);
        });
    });
});
