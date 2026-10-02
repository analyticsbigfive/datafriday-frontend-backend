import { Test } from '@nestjs/testing';
import { ClsModule } from 'nestjs-cls';
import { PrismaService } from '../../../../core/database/prisma.service';
import { TenantContextService } from '../../../../core/tenant/tenant-context.service';
import { AppConfigService } from '../../../../config/app-config.service';
import { testAppConfig } from '../../../../config/app-config.testing';
import { upsertQueuedEntities } from './queued-entity.queries';
import { WeezeventQueuedEntitySyncService } from './queued-entity-sync.service';

const hasDatabase = !!process.env.DATABASE_URL;

(hasDatabase ? describe : describe.skip)('upsertQueuedEntities (base réelle)', () => {
  let prisma: PrismaService;
  let tenantCtx: TenantContextService;
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const tenants: string[] = [];
  const integrations: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [
        PrismaService,
        TenantContextService,
        { provide: AppConfigService, useValue: testAppConfig({ DATABASE_URL: process.env.DATABASE_URL }) },
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantCtx = moduleRef.get(TenantContextService);
    for (const name of ['A', 'B']) {
      const t = await prisma.tenant.create({ data: { name: `QE ${name} ${suffix}`, slug: `qe-${name.toLowerCase()}-${suffix}` } });
      tenants.push(t.id);
      const integ = await tenantCtx.runForTenant(t.id, () =>
        prisma.integration.create({ data: { name: `QE ${name}`, provider: 'WEEZEVENT' } as any }),
      );
      integrations[t.id] = integ.id;
    }
  }, 30000);

  afterAll(async () => {
    for (const id of tenants) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    await prisma.onModuleDestroy();
  });

  const order = (id: string, status: string, total: number) => ({
    weezeventId: id,
    values: { status, totalAmount: total, orderDate: new Date('2026-09-01T18:00:00Z'), metadata: { a: 1 }, rawData: { id, status } },
  });

  it('crée puis met à jour une page, et compte créations et mises à jour', async () => {
    const [a] = tenants;
    const first = await upsertQueuedEntities(prisma, 'WeezeventOrder', a, integrations[a], [order('1', 'paid', 12.5), order('2', 'paid', 3)]);
    expect(first).toEqual({ created: 2, updated: 0 });

    const second = await upsertQueuedEntities(prisma, 'WeezeventOrder', a, integrations[a], [order('2', 'refunded', 3), order('3', 'paid', 7)]);
    expect(second).toEqual({ created: 1, updated: 1 });

    const rows = await tenantCtx.runForTenant(a, () =>
      prisma.weezeventOrder.findMany({ orderBy: { weezeventId: 'asc' }, select: { weezeventId: true, status: true, totalAmount: true, rawData: true } }),
    );
    expect(rows.map((r) => [r.weezeventId, r.status, Number(r.totalAmount)])).toEqual([
      ['1', 'paid', 12.5],
      ['2', 'refunded', 3],
      ['3', 'paid', 7],
    ]);
    expect(rows[1].rawData).toEqual({ id: '2', status: 'refunded' });
  });

  it("le même identifiant Weezevent chez un autre tenant crée sa propre ligne sans toucher l'autre", async () => {
    const [a, b] = tenants;
    const res = await upsertQueuedEntities(prisma, 'WeezeventOrder', b, integrations[b], [order('1', 'cancelled', 1)]);
    expect(res).toEqual({ created: 1, updated: 0 });
    const aRow = await tenantCtx.runForTenant(a, () => prisma.weezeventOrder.findFirst({ where: { weezeventId: '1' } }));
    expect(aRow?.status).toBe('paid');
  });

  it('prix et participants : colonnes propres à chaque table', async () => {
    const [a] = tenants;
    const price = await upsertQueuedEntities(prisma, 'WeezeventPrice', a, integrations[a], [
      { weezeventId: 'p1', values: { name: 'Bière', amount: 6, currency: 'EUR', validFrom: null, rawData: {} } },
    ]);
    const attendee = await upsertQueuedEntities(prisma, 'WeezeventAttendee', a, integrations[a], [
      { weezeventId: 'u1', values: { status: 'valid', email: 'x@y.z', rawData: {} } },
    ]);
    expect([price.created, attendee.created]).toEqual([1, 1]);
  });

  it('colonnes mises à jour au choix (updateColumns)', async () => {
    const [a] = tenants;
    await upsertQueuedEntities(prisma, 'WeezeventAttendee', a, integrations[a], [{ weezeventId: 'u2', values: { status: 'valid', email: 'old@x.fr', rawData: {} } }]);
    await upsertQueuedEntities(prisma, 'WeezeventAttendee', a, integrations[a], [{ weezeventId: 'u2', values: { status: 'scanned', email: 'new@x.fr', rawData: {} } }], new Date(), ['email']);
    const row = await tenantCtx.runForTenant(a, () => prisma.weezeventAttendee.findFirst({ where: { weezeventId: 'u2' } }));
    expect([row?.email, row?.status]).toEqual(['new@x.fr', 'valid']);
  });

  it("synchro des participants : l'id Weezevent externe est résolu en SalesEvent interne", async () => {
    const [a] = tenants;
    const integrationId = integrations[a];
    const salesEvent = await tenantCtx.runForTenant(a, () =>
      prisma.salesEvent.create({ data: { externalId: 'wz-777', integrationId, name: 'Match', organizationId: 'org', rawData: {} } as any }),
    );
    await tenantCtx.runForTenant(a, () =>
      prisma.weezeventIntegrationConfig.create({ data: { integrationId, organizationId: 'org', clientId: 'c', clientSecret: 's' } as any }),
    );
    const client = {
      getAttendees: jest.fn().mockResolvedValue({
        data: [{ id: 1, status: 'valid', email: 'a@b.c' }, { id: 2, status: 'valid' }],
        meta: { total_pages: 1 },
      }),
    };
    const service = new WeezeventQueuedEntitySyncService(prisma, client as any);
    const result = await tenantCtx.runForTenant(a, () => service.syncAttendees(a, integrationId, 'wz-777'));

    expect(result).toMatchObject({ itemsCreated: 2, errors: 0, success: true });
    expect(client.getAttendees).toHaveBeenCalledWith(a, integrationId, 'org', 'wz-777', { page: 1, perPage: 100 });
    const rows = await tenantCtx.runForTenant(a, () => prisma.weezeventAttendee.findMany({ where: { weezeventId: { in: ['1', '2'] } } }));
    expect(rows.map((r) => r.eventId)).toEqual([salesEvent.id, salesEvent.id]);
  });

  it('synchro des prix : événement et produit externes résolus en ids internes', async () => {
    const [a] = tenants;
    const integrationId = integrations[a];
    const [salesEvent, salesProduct] = await tenantCtx.runForTenant(a, () =>
      Promise.all([
        prisma.salesEvent.create({ data: { externalId: 'wz-888', integrationId, name: 'Match 2', organizationId: 'org', rawData: {} } as any }),
        prisma.salesProduct.create({ data: { externalId: 'p-9', integrationId, name: 'Bière', rawData: {} } as any }),
      ]),
    );
    const client = {
      getPrices: jest.fn().mockResolvedValue({
        data: [{ id: 'pr-1', product_id: 'p-9', name: 'Bière 50cl', amount: 7 }, { id: 'pr-2', product_id: 'inconnu', amount: 1 }],
      }),
    };
    const service = new WeezeventQueuedEntitySyncService(prisma, client as any);
    const result = await tenantCtx.runForTenant(a, () => service.syncPrices(a, integrationId, 'wz-888'));

    expect(result).toMatchObject({ itemsCreated: 2, errors: 0 });
    const rows = await tenantCtx.runForTenant(a, () =>
      prisma.weezeventPrice.findMany({ where: { weezeventId: { in: ['pr-1', 'pr-2'] } }, orderBy: { weezeventId: 'asc' } }),
    );
    expect(rows.map((r) => [r.eventId, r.productId])).toEqual([
      [salesEvent.id, salesProduct.id],
      [salesEvent.id, null],
    ]);
  });
});
