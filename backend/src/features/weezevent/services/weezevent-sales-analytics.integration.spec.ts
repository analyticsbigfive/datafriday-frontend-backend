import { Test } from '@nestjs/testing';
import { ClsModule } from 'nestjs-cls';
import { PrismaService } from '../../../core/database/prisma.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { AppConfigService } from '../../../config/app-config.service';
import { testAppConfig } from '../../../config/app-config.testing';
import { Prisma } from '@prisma/client';
import { WeezeventSalesAnalyticsService } from './weezevent-sales-analytics.service';
import { eventMinuteTimeline } from '../../analyse/analyse.queries';

const hasDatabase = !!process.env.DATABASE_URL;

/**
 * Analyses de ventes agrégées en SQL, sur base réelle : mêmes cas que les anciens tests en
 * mémoire (agrégation par produit et par événement, marge avec article rattaché ou non,
 * meilleurs produits), plus le filtrage par tenant, suppression logique et période.
 */
(hasDatabase ? describe : describe.skip)('WeezeventSalesAnalyticsService (base réelle)', () => {
  let prisma: PrismaService;
  let tenantCtx: TenantContextService;
  let service: WeezeventSalesAnalyticsService;
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  let tenantId = '';
  let otherTenantId = '';
  let ev1 = '';
  const user = () => ({ tenantId });
  const PERIOD = { fromDate: '2026-03-01T00:00:00Z', toDate: '2026-03-31T23:59:59Z' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [
        PrismaService,
        TenantContextService,
        WeezeventSalesAnalyticsService,
        { provide: AppConfigService, useValue: testAppConfig({ DATABASE_URL: process.env.DATABASE_URL }) },
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantCtx = moduleRef.get(TenantContextService);
    service = moduleRef.get(WeezeventSalesAnalyticsService);

    const seedTenant = async (name: string) => {
      const t = await prisma.tenant.create({ data: { name: `AN ${name} ${suffix}`, slug: `an-${name}-${suffix}` } });
      return t.id;
    };
    tenantId = await seedTenant('a');
    otherTenantId = await seedTenant('b');

    await tenantCtx.runForTenant(tenantId, async () => {
      const integ = await prisma.integration.create({ data: { name: 'AN', provider: 'WEEZEVENT' } as any });
      ev1 = (await prisma.salesEvent.create({ data: { externalId: 'wz-ev-1', integrationId: integ.id, name: 'Match 1', organizationId: 'o', rawData: {} } as any })).id;
      const product = (externalId: string, name: string, categoryId: string | null) =>
        prisma.salesProduct.create({ data: { externalId, integrationId: integ.id, name, categoryId, allergens: [], rawData: {} } as any });
      const burger = await product('p-burger', 'Burger', 'cat-food');
      const fries = await product('p-fries', 'Fries', 'cat-food');
      const soda = await product('p-soda', 'Soda', 'cat-drink');
      const menuBurger = await prisma.menuItem.create({
        data: { name: `Burger menu ${suffix}`, basePrice: 10, totalCost: 3.5, allergens: [], storageType: [] } as any,
      });
      await prisma.productMapping.create({ data: { salesProductId: burger.id, menuItemId: menuBurger.id } as any });

      let n = 0;
      const tx = async (opts: { eventId: string | null; eventName: string | null; date: string; amount: number; deleted?: boolean; items: Array<[string | null, string, number, number]> }) => {
        n++;
        const t = await prisma.salesTransaction.create({
          data: {
            externalId: `tx-${n}`, integrationId: integ.id, amount: opts.amount, status: 'V', transactionDate: new Date(opts.date),
            eventId: opts.eventId, eventName: opts.eventName, rawData: {}, deletedAt: opts.deleted ? new Date() : null,
          } as any,
        });
        await prisma.salesTransactionItem.createMany({
          data: opts.items.map(([productId, productName, quantity, unitPrice]) => ({
            transactionId: t.id, productId, productName, quantity, unitPrice, vat: 0, rawData: {},
          })) as any,
        });
      };
      await tx({ eventId: ev1, eventName: 'Match 1', date: '2026-03-10T19:00:00Z', amount: 25, items: [[burger.id, 'Burger', 2, 10], [fries.id, 'Fries', 1, 5]] });
      await tx({ eventId: ev1, eventName: 'Match 1', date: '2026-03-10T20:00:00Z', amount: 10, items: [[burger.id, 'Burger', 1, 10]] });
      await tx({ eventId: null, eventName: null, date: '2026-03-12T12:00:00Z', amount: 6, items: [[soda.id, 'Soda', 2, 3]] });
      // Hors analyses : supprimée côté Weezevent, ou hors période.
      await tx({ eventId: ev1, eventName: 'Match 1', date: '2026-03-10T21:00:00Z', amount: 999, deleted: true, items: [[burger.id, 'Burger', 50, 10]] });
      await tx({ eventId: ev1, eventName: 'Match 1', date: '2026-05-01T21:00:00Z', amount: 777, items: [[fries.id, 'Fries', 40, 5]] });
    });
    // Autre tenant : ne doit jamais apparaître.
    await tenantCtx.runForTenant(otherTenantId, async () => {
      const integ = await prisma.integration.create({ data: { name: 'AN2', provider: 'WEEZEVENT' } as any });
      const t = await prisma.salesTransaction.create({
        data: { externalId: 'tx-x', integrationId: integ.id, amount: 500, status: 'V', transactionDate: new Date('2026-03-10T19:00:00Z'), rawData: {} } as any,
      });
      await prisma.salesTransactionItem.createMany({ data: [{ transactionId: t.id, productId: null, productName: 'Intrus', quantity: 100, unitPrice: 5, vat: 0, rawData: {} }] as any });
    });
  }, 60000);

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) if (id) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    await prisma.onModuleDestroy();
  });

  it('ventes par produit sur la période, triées par montant', async () => {
    const res = await service.getSalesByProduct(user(), PERIOD);
    expect(res.data.map((p) => [p.productName, p.quantity, p.totalAmount, p.transactionCount])).toEqual([
      ['Burger', 3, 30, 2],
      ['Soda', 2, 6, 1],
      ['Fries', 1, 5, 1],
    ]);
    expect(res.meta.total).toBe(3);
  });

  it('ventes par produit filtrées par événement (sans période)', async () => {
    const res = await service.getSalesByProduct(user(), { eventId: ev1 });
    expect(res.data.map((p) => [p.productName, p.totalAmount])).toEqual([
      ['Fries', 205],
      ['Burger', 30],
    ]);
  });

  it('ventes par événement, transactions sans événement regroupées en « unknown »', async () => {
    const res = await service.getSalesByEvent(user(), PERIOD);
    expect(res.data).toEqual([
      { eventId: ev1, eventName: 'Match 1', totalAmount: 35, transactionCount: 2, itemCount: 3 },
      { eventId: 'unknown', eventName: 'Unknown Event', totalAmount: 6, transactionCount: 1, itemCount: 1 },
    ]);
  });

  it('marge : coût de l’article rattaché, lignes non rattachées signalées', async () => {
    const res = await service.getMarginAnalysis(user(), PERIOD);
    expect(res.summary).toMatchObject({ totalSales: 41, totalCost: 10.5, totalMargin: 30.5, mappedItems: 2, unmappedItems: 2, mappingRate: 50 });
    expect(res.summary.marginWarning).toContain('2 ligne(s)');
    expect(res.productMargins.map((m) => [m.productName, m.quantity, m.sales, m.cost])).toEqual([
      ['Burger', 2, 20, 7],
      ['Burger', 1, 10, 3.5],
    ]);
  });

  it('meilleurs produits : limite, prix moyen et catégorie', async () => {
    const res = await service.getTopProducts(user(), { ...PERIOD, limit: 2 });
    expect(res.data).toEqual([
      { productId: expect.any(String), productName: 'Burger', category: 'cat-food', quantity: 3, revenue: 30, averagePrice: 10 },
      { productId: expect.any(String), productName: 'Soda', category: 'cat-drink', quantity: 2, revenue: 6, averagePrice: 3 },
    ]);
    expect(res.meta).toMatchObject({ total: 3, limit: 2 });
  });

  it('chronologie minute d’un événement (analyse) : la requête SQL s’exécute et agrège par minute', async () => {
    const rows = await tenantCtx.runForTenant(tenantId, () =>
      eventMinuteTimeline(prisma, tenantId, ev1, Prisma.empty, Prisma.empty, Prisma.empty, Prisma.empty, 100),
    );
    // Transactions de statut 'V' de l'événement, supprimées exclues (BUG-028), toutes périodes.
    const minutes = rows.map((r) => r.minute);
    expect(minutes).toEqual(expect.arrayContaining(['19:00', '20:00']));
    // Transaction supprimée côté Weezevent (50 burgers à 21:00) absente ; reste la vente de mai à 21:00.
    expect(rows.filter((r) => r.minute === '21:00').map((r) => r.quantity)).toEqual([40]);
    expect(rows.find((r) => r.minute === '20:00')).toMatchObject({ hour: 20, quantity: 1 });
  });
});
