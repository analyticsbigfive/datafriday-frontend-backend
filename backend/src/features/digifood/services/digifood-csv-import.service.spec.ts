import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { DigifoodCsvImportService } from './digifood-csv-import.service';
import { DigifoodIngestionService } from './digifood-ingestion.service';

const TENANT = 'tenant-1';
const INTEGRATION = 'integ-1';

const CSV = [
    'order_id,placed_at,location_id,location_name,shop_id,shop_name,item_id,variation_id,item_name,variation,family,quantity,price_pu,tax_rate,external_reference,type',
    'order_1,2026-07-01T12:00:00Z,loc_1,Zoo de Vanves,shop_1,Buvette B-03,it_1,var_b1,Burger,,Food,1,4500,10.0,MI-42,sale',
    'order_1,2026-07-01T12:00:00Z,loc_1,Zoo de Vanves,shop_1,Buvette B-03,it_2,var_d1,Boisson,50cl,Drink,2,1500,5.5,,sale',
    'order_2,2026-07-01T13:00:00Z,loc_1,Zoo de Vanves,shop_1,Buvette B-03,it_3,var_b1,Burger,,Food,1,4500,10.0,,refund',
    ',2026-07-01T14:00:00Z,loc_1,Zoo,shop_1,Buvette,it_4,,Frites,,,1,1000,10.0,,sale',
    'order_3,2026-07-01T15:00:00Z,loc_1,Zoo,shop_1,Buvette,it_5,,Café,,,abc,100,10.0,,sale',
].join('\n');

function makePrismaMock() {
    return {
        csvMapping: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
        },
        salesTransaction: { findMany: jest.fn().mockResolvedValue([{ externalId: 'order_1' }]) },
        salesProduct: { findMany: jest.fn().mockResolvedValue([{ externalId: 'var_b1' }]) },
        salesLocation: { findMany: jest.fn().mockResolvedValue([]) },
        digifoodCsvImportRun: {
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'job_generated', ...data })),
            update: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn().mockResolvedValue(null),
        },
    };
}

/** Le traitement réel tourne en fire-and-forget (voir startRealImport) : on attend que le
 *  dernier update() du job porte un statut terminal avant d'inspecter les mocks. */
async function waitForJobCompletion(prisma: ReturnType<typeof makePrismaMock>, maxTries = 50): Promise<void> {
    for (let i = 0; i < maxTries; i++) {
        const done = prisma.digifoodCsvImportRun.update.mock.calls.some(
            ([arg]: any) => arg?.data?.status === 'COMPLETED' || arg?.data?.status === 'FAILED',
        );
        if (done) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('job did not reach a terminal status in time');
}

describe('DigifoodCsvImportService', () => {
    let service: DigifoodCsvImportService;
    let prisma: ReturnType<typeof makePrismaMock>;
    let ingestion: { ingestOrder: jest.Mock; createCache: jest.Mock };

    beforeEach(async () => {
        prisma = makePrismaMock();
        ingestion = {
            ingestOrder: jest.fn().mockResolvedValue({
                transactionId: 'tx-1', created: true, skippedDuplicateRefund: false,
                itemsCount: 1, productsUpserted: 1, autoMapped: 0,
            }),
            createCache: jest.fn().mockReturnValue({ sites: new Map(), shops: new Map(), products: new Map() }),
        };
        const module = await Test.createTestingModule({
            providers: [
                DigifoodCsvImportService,
                { provide: PrismaService, useValue: prisma },
                { provide: DigifoodIngestionService, useValue: ingestion },
            ],
        }).compile();
        service = module.get(DigifoodCsvImportService);
    });

    describe('importCsv (aperçu, toujours synchrone, sans écriture)', () => {
        it('rapport complet SANS aucune écriture', async () => {
            const report = await service.importCsv(TENANT, INTEGRATION, Buffer.from(CSV));

            expect(report).toMatchObject({
                dryRun: true,
                ordersDetected: 2, // order_1 + order_2 (lignes invalides rejetées)
                ordersCreated: 1,  // order_2 (order_1 existe déjà)
                ordersUpdated: 1,  // order_1
                productsCreated: 1, // var_d1 (var_b1 existe)
                locationsCreated: 1, // shop_1
            });
            expect(report.rejectedRows).toHaveLength(2);
            expect(report.rejectedRows[0].reason).toMatch(/order_id manquant/);
            expect(report.rejectedRows[1].reason).toMatch(/quantity invalide/);
            expect(ingestion.ingestOrder).not.toHaveBeenCalled();
            expect(prisma.digifoodCsvImportRun.create).not.toHaveBeenCalled();
        });

        it('supporte le délimiteur ; et le mapping de colonnes CsvMapping du tenant', async () => {
            prisma.csvMapping.findFirst.mockResolvedValue({
                mapping: { order_id: 'commande', item_name: 'produit', quantity: 'qte', price_pu: 'prix_centimes' },
            });
            const csv = [
                'commande;produit;qte;prix_centimes;placed_at',
                'cmd_9;Crêpe;3;450;2026-07-02T10:00:00Z',
            ].join('\n');

            const report = await service.importCsv(TENANT, INTEGRATION, Buffer.from(csv));
            expect(report.ordersDetected).toBe(1);
            expect(report.rejectedRows).toHaveLength(0);
        });

        it('rejette un fichier vide', async () => {
            await expect(service.importCsv(TENANT, INTEGRATION, Buffer.from(''))).rejects.toThrow(
                BadRequestException,
            );
        });
    });

    describe('format export réel Digifood (TSV, Total TTC €, date+heure séparées)', () => {
        // En-têtes EXACTS de l'export back-office fourni par l'utilisateur (2026-07-13)
        const HEADER = [
            'Type', 'Source', 'Cashier', 'State', 'Long ID', 'Short ID', 'Item ID', 'Item',
            'Variation', 'Item Family', 'External reference', 'Placed at_date', 'Placed at_time',
            'Location', 'Shop', 'Dispatch', 'Dispatch at_date', 'Dispatch at_time', 'Quantity',
            'TVA%', 'Total HT', 'Total TVA', 'Total TTC',
            'Customer firstname', 'Customer lastname', 'Customer email', 'Customer phone',
        ].join('\t');
        const row = (cells: Record<string, string>) =>
            HEADER.split('\t').map((h) => cells[h] ?? '').join('\t');

        const TSV = [
            HEADER,
            row({
                Type: 'Sale', State: 'Closed', 'Long ID': 'order_real_1', 'Item ID': 'it_r1',
                Item: 'Burger', 'Item Family': 'Food', 'External reference': 'MI-42',
                'Placed at_date': '2026-07-05', 'Placed at_time': '12:30:00',
                Location: 'Zoo de Vanves', Shop: 'Buvette B-03',
                Quantity: '2', 'TVA%': '10,0', 'Total TTC': '90,00',
            }),
            row({
                Type: 'Refund', State: 'Closed', 'Long ID': 'order_real_2', 'Item ID': 'it_r2',
                Item: 'Boisson', 'Placed at_date': '05/07/2026', 'Placed at_time': '14:00:00',
                Location: 'Zoo de Vanves', Shop: 'Buvette B-03',
                Quantity: '1', 'TVA%': '5,5', 'Total TTC': '15,00',
            }),
            row({
                Type: 'Sale', State: 'Cancelled', 'Long ID': 'order_real_3', 'Item ID': 'it_r3',
                Item: 'Frites', 'Placed at_date': '2026-07-05', Quantity: '1', 'Total TTC': '5,00',
            }),
            // TVA% ABSENTE mais Total HT présent → taux dérivé du ratio TTC/HT (prix HT exacts)
            row({
                Type: 'Sale', State: 'Closed', 'Long ID': 'order_real_4', 'Item ID': 'it_r4',
                Item: 'Menu Enfant', 'Placed at_date': '2026-07-05', 'Placed at_time': '15:00:00',
                Location: 'Zoo de Vanves', Shop: 'Buvette B-03',
                Quantity: '1', 'Total HT': '75,00', 'Total TTC': '90,00',
            }),
            // Format de date RÉEL constaté : JJ-MM-AAAA + heure DANS LA MÊME cellule
            row({
                Type: 'Sale', State: 'Closed', 'Long ID': 'order_real_5', 'Item ID': 'it_r5',
                Item: 'Café', 'Placed at_date': '05-07-2026 16:45',
                Location: 'Zoo de Vanves', Shop: 'Buvette B-03',
                Quantity: '1', 'TVA%': '10,0', 'Total TTC': '2,50',
            }),
        ].join('\n');

        it('aperçu : auto-détecte TAB + les en-têtes réels via les synonymes (aucun mapping fourni)', async () => {
            prisma.salesTransaction.findMany.mockResolvedValue([]);
            prisma.salesProduct.findMany.mockResolvedValue([]);
            const report = await service.importCsv(TENANT, INTEGRATION, Buffer.from(TSV));

            expect(report.ordersDetected).toBe(4); // la ligne Cancelled est rejetée
            expect(report.rejectedRows).toHaveLength(1);
            expect(report.rejectedRows[0].reason).toMatch(/Cancelled/);
            // Période détectée = bornes des dates interprétées (contrôle visuel de l'aperçu)
            expect(report.periodStart).toContain('2026-07-05');
            expect(report.periodEnd).toContain('2026-07-05');
        });

        it('import réel : ingestOrder reçoit des NormalizedOrder correctement construits (dates, TVA dérivée, refund signé)', async () => {
            prisma.salesTransaction.findMany.mockResolvedValue([]);
            prisma.salesProduct.findMany.mockResolvedValue([]);
            await service.startRealImport(TENANT, INTEGRATION, Buffer.from(TSV));
            await waitForJobCompletion(prisma);

            expect(ingestion.ingestOrder).toHaveBeenCalledTimes(4); // la ligne Cancelled est rejetée en amont

            const [, , sale] = ingestion.ingestOrder.mock.calls[0];
            // Total TTC 90,00 € pour 2 → prix unitaire 45 € ; date+heure composées
            expect(sale).toMatchObject({ id: 'order_real_1', type: 'sale', total: 90 });
            expect(sale.items[0]).toMatchObject({ quantity: 2, unitPrice: 45, vatRate: 10, externalReference: 'MI-42' });
            expect(sale.placedAt.toISOString()).toContain('2026-07-05T12:30');
            // Pas d'ID de site/PDV dans l'export → clés dérivées des noms
            expect(sale.shop).toMatchObject({ id: 'shop:buvette-b-03', name: 'Buvette B-03' });
            expect(sale.location).toMatchObject({ id: 'loc:zoo-de-vanves', name: 'Zoo de Vanves' });

            const [, , refund] = ingestion.ingestOrder.mock.calls[1];
            // « Refund » (majuscule) + date DD/MM/YYYY → refund signé négatif
            expect(refund).toMatchObject({ id: 'order_real_2', type: 'refund', total: -15 });
            expect(refund.items[0].quantity).toBe(-1);

            // Sans TVA% : taux dérivé de Total TTC ÷ Total HT (90/75 → 20%) → HT exact en aval
            const [, , noVatRate] = ingestion.ingestOrder.mock.calls[2];
            expect(noVatRate.items[0]).toMatchObject({ unitPrice: 90, vatRate: 20 });

            // « 05-07-2026 16:45 » (JJ-MM-AAAA + heure combinée) → 5 juillet 2026 16:45
            const [, , dashDate] = ingestion.ingestOrder.mock.calls[3];
            expect(dashDate.placedAt.getFullYear()).toBe(2026);
            expect(dashDate.placedAt.getMonth()).toBe(6); // juillet
            expect(dashDate.placedAt.getDate()).toBe(5);
            expect(dashDate.placedAt.getHours()).toBe(16);

            expect(ingestion.ingestOrder.mock.calls.every((c: any[]) => c[3] === 'csv')).toBe(true);
        });

        it('persiste le mapping fourni par le front (CsvMapping du tenant), même en aperçu', async () => {
            await service.importCsv(TENANT, INTEGRATION, Buffer.from(TSV), {
                order_id: 'Long ID',
                item_name: 'Item',
            });
            expect(prisma.csvMapping.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        mappingType: 'digifood-orders',
                        mapping: expect.objectContaining({ order_id: 'Long ID' }),
                    }),
                }),
            );
        });
    });

    describe('startRealImport — job asynchrone (fire-and-forget, comme WeezeventSyncJob)', () => {
        it('crée le run en PROCESSING et répond IMMÉDIATEMENT (avant la fin de l\'ingestion)', async () => {
            const { jobId, ordersDetected } = await service.startRealImport(
                TENANT, INTEGRATION, Buffer.from(CSV), null, 'export.csv',
            );

            expect(jobId).toBeTruthy();
            expect(ordersDetected).toBe(2);
            expect(prisma.digifoodCsvImportRun.create).toHaveBeenCalledTimes(1);
            const [{ data }] = prisma.digifoodCsvImportRun.create.mock.calls[0];
            expect(data).toMatchObject({
                tenantId: TENANT,
                integrationId: INTEGRATION,
                fileName: 'export.csv',
                status: 'PROCESSING',
                ordersDetected: 2,
            });
        });

        it('termine le job en COMPLETED avec les compteurs réels (issus d\'ingestOrder, pas de l\'estimation d\'aperçu)', async () => {
            const { jobId } = await service.startRealImport(TENANT, INTEGRATION, Buffer.from(CSV), null, 'export.csv');

            await waitForJobCompletion(prisma);

            expect(ingestion.ingestOrder).toHaveBeenCalledTimes(2);
            const updateCalls = prisma.digifoodCsvImportRun.update.mock.calls.map(([arg]: any) => arg);
            // Au moins une écriture de progression avec les compteurs finaux (ingestOrder mocké → toujours created:true)
            expect(updateCalls.some((c) => c.where.id === jobId && c.data.ordersCreated === 2 && c.data.ordersUpdated === 0)).toBe(true);
            // La dernière écriture marque le job terminé
            expect(updateCalls[updateCalls.length - 1]).toMatchObject({ where: { id: jobId }, data: { status: 'COMPLETED' } });
        });

        it('rejette immédiatement un CSV vide SANS créer de run (échec de parsing, avant tout job)', async () => {
            await expect(
                service.startRealImport(TENANT, INTEGRATION, Buffer.from('')),
            ).rejects.toThrow(BadRequestException);
            expect(prisma.digifoodCsvImportRun.create).not.toHaveBeenCalled();
        });
    });

    describe('getImportJobStatus (polling front)', () => {
        it('calcule processed/progress à partir des compteurs bruts du run', async () => {
            prisma.digifoodCsvImportRun.findFirst.mockResolvedValue({
                id: 'job_1', fileName: 'f.csv', status: 'PROCESSING',
                ordersDetected: 10, ordersCreated: 3, ordersUpdated: 2, ordersSkipped: 1,
                productsCreated: 0, locationsCreated: 0, rejectedCount: 0,
                periodStart: null, periodEnd: null, errorMessage: null,
                startedAt: new Date(), completedAt: null,
            });

            const status = await service.getImportJobStatus(TENANT, 'job_1');

            expect(status).toMatchObject({ jobId: 'job_1', status: 'PROCESSING', processed: 6, progress: 60 });
        });

        it('renvoie null si le job est introuvable (ou appartient à un autre tenant)', async () => {
            prisma.digifoodCsvImportRun.findFirst.mockResolvedValue(null);
            const status = await service.getImportJobStatus(TENANT, 'nope');
            expect(status).toBeNull();
        });
    });

    describe('getImportHistory', () => {
        it('délègue à digifoodCsvImportRun.findMany, triée par startedAt desc, 20 dernières', async () => {
            prisma.digifoodCsvImportRun.findMany.mockResolvedValue([{ id: 'run_1', status: 'COMPLETED' }]);

            const history = await service.getImportHistory(TENANT, INTEGRATION);

            expect(prisma.digifoodCsvImportRun.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { tenantId: TENANT, integrationId: INTEGRATION },
                    orderBy: { startedAt: 'desc' },
                    take: 20,
                }),
            );
            expect(history).toEqual([{ id: 'run_1', status: 'COMPLETED' }]);
        });
    });
});
