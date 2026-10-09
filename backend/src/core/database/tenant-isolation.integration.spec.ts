import { Test, TestingModule } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { PrismaService } from './prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TENANT_ID_KEY } from '../tenant/tenant-context.constants';
import { AppConfigService } from '../../config/app-config.service';
import { testAppConfig } from '../../config/app-config.testing';
import { upsertProductMappings } from '../../features/mappings/mappings.queries';

/**
 * End-to-end validation of the automatic multi-tenant isolation against a REAL
 * database. Two tenants are seeded; every query is run inside a CLS context for
 * one tenant and we assert the other tenant's data is never read or mutated.
 *
 * Requires DATABASE_URL (skipped otherwise), like prisma.service.spec.ts.
 */
const hasDatabase = !!process.env.DATABASE_URL;

(hasDatabase ? describe : describe.skip)('Tenant isolation (integration)', () => {
  let prisma: PrismaService;
  let cls: ClsService;
  let tenantCtx: TenantContextService;
  let tenantA: string;
  let tenantB: string;

  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  // Run a unit of work inside a CLS context scoped to `tenantId`.
  const inTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    cls.run(async () => {
      cls.set(TENANT_ID_KEY, tenantId);
      return fn();
    });

  // Helper: create a space (tenantId is injected automatically by the middleware).
  const createSpace = (tenantId: string, name: string) =>
    inTenant(tenantId, () => prisma.space.create({ data: { name } as any }));

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [
        PrismaService,
        TenantContextService,
        { provide: AppConfigService, useValue: testAppConfig({ DATABASE_URL: process.env.DATABASE_URL }) },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    cls = moduleRef.get(ClsService);
    tenantCtx = moduleRef.get(TenantContextService);
    await prisma.$connect();

    // Seed two tenants with NO active tenant context (Tenant is not scoped).
    const a = await prisma.tenant.create({
      data: { name: `ISO A ${suffix}`, slug: `iso-a-${suffix}` },
    });
    const b = await prisma.tenant.create({
      data: { name: `ISO B ${suffix}`, slug: `iso-b-${suffix}` },
    });
    tenantA = a.id;
    tenantB = b.id;
  }, 30000);

  afterAll(async () => {
    // Cascade-deletes the seeded spaces; run with no tenant context.
    if (tenantA) await prisma.tenant.delete({ where: { id: tenantA } }).catch(() => undefined);
    if (tenantB) await prisma.tenant.delete({ where: { id: tenantB } }).catch(() => undefined);
    // Ferme aussi le pool pg du driver adapter (sinon Jest ne se termine pas).
    await prisma.onModuleDestroy();
  });

  it('auto-injects tenantId on create (no tenantId passed)', async () => {
    const space = await createSpace(tenantA, 'A-space');
    expect(space.tenantId).toBe(tenantA);
  });

  it('scopes findMany & count to the active tenant', async () => {
    await createSpace(tenantB, 'B-space');

    const aSpaces = await inTenant(tenantA, () => prisma.space.findMany());
    expect(aSpaces.every((s) => s.tenantId === tenantA)).toBe(true);
    expect(aSpaces.some((s) => s.name === 'B-space')).toBe(false);

    const aCount = await inTenant(tenantA, () => prisma.space.count());
    const bCount = await inTenant(tenantB, () => prisma.space.count());
    expect(aCount).toBeGreaterThanOrEqual(1);
    expect(bCount).toBeGreaterThanOrEqual(1);
  });

  it('blocks cross-tenant findUnique by id', async () => {
    const bSpace = await createSpace(tenantB, 'B-only');

    const leaked = await inTenant(tenantA, () =>
      prisma.space.findUnique({ where: { id: bSpace.id } }),
    );
    expect(leaked).toBeNull();

    const own = await inTenant(tenantB, () =>
      prisma.space.findUnique({ where: { id: bSpace.id } }),
    );
    expect(own?.id).toBe(bSpace.id);
  });

  it('blocks cross-tenant update & delete', async () => {
    const bSpace = await createSpace(tenantB, 'B-protected');

    const updated = await inTenant(tenantA, () =>
      prisma.space.updateMany({ where: { id: bSpace.id }, data: { name: 'hacked' } }),
    );
    expect(updated.count).toBe(0);

    const deleted = await inTenant(tenantA, () =>
      prisma.space.deleteMany({ where: { id: bSpace.id } }),
    );
    expect(deleted.count).toBe(0);

    const intact = await inTenant(tenantB, () =>
      prisma.space.findUnique({ where: { id: bSpace.id } }),
    );
    expect(intact?.name).toBe('B-protected');
  });

  // BUG-035 — cause racine. Contrairement à `Space` (test ci-dessus), le modèle `Tenant`
  // n'a pas de `tenantId` scalaire : il est EXCLU de l'auto-scoping Prisma. Une écriture
  // cross-tenant sur `Tenant` N'EST donc PAS bloquée en base. C'est précisément pourquoi
  // OrganizationsController et TenantsController doivent être protégés au niveau HTTP par
  // SuperAdminGuard — le filet Prisma ne rattrape pas cette surface. Ce test verrouille la
  // propriété : si un jour `Tenant` devenait scopé, il faudrait le savoir.
  it('does NOT auto-scope the Tenant model (root cause of BUG-035)', async () => {
    const hijacked = await inTenant(tenantA, () =>
      prisma.tenant.updateMany({
        where: { id: tenantB },
        data: { name: `hijacked-${suffix}` },
      }),
    );
    // Aucun scoping : depuis le contexte du tenant A, l'écriture atteint bien le tenant B.
    expect(hijacked.count).toBe(1);

    // Restauration pour ne pas polluer les autres assertions / le teardown.
    await prisma.tenant.update({
      where: { id: tenantB },
      data: { name: `ISO B ${suffix}` },
    });
  });

  it('runWithoutTenantScope() bypasses scoping for legitimate cross-tenant ops', async () => {
    const all = await inTenant(tenantA, () =>
      tenantCtx.runWithoutTenantScope(() =>
        prisma.space.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
      ),
    );
    const seen = new Set(all.map((s) => s.tenantId));
    expect(seen.has(tenantA)).toBe(true);
    expect(seen.has(tenantB)).toBe(true);
  });

  it('upsert SQL brut des mappings : un conflit sur la ligne d’un autre tenant la laisse intacte', async () => {
    const seed = (tenantId: string, suffixName: string) =>
      inTenant(tenantId, async () => {
        const integration = await prisma.integration.create({
          data: { name: `ISO ${suffixName}`, provider: 'WEEZEVENT' } as any,
        });
        const product = await prisma.salesProduct.create({
          data: { externalId: `ext-${suffixName}-${suffix}`, integrationId: integration.id, name: 'Bière', rawData: {} } as any,
        });
        const item = await prisma.menuItem.create({ data: { name: `Item ${suffixName}`, basePrice: 5 } as any });
        return { product, item };
      });
    const a = await seed(tenantA, 'map-A');
    const b = await seed(tenantB, 'map-B');
    await inTenant(tenantA, () =>
      prisma.productMapping.create({ data: { salesProductId: a.product.id, menuItemId: a.item.id } as any }),
    );

    // Tenant B tente de remapper le produit de A vers son propre article.
    await upsertProductMappings(prisma, tenantB, [{ weezeventProductId: a.product.id, menuItemId: b.item.id }], 'attacker');

    const mapping = await tenantCtx.runWithoutTenantScope(() =>
      prisma.productMapping.findUnique({ where: { salesProductId: a.product.id } }),
    );
    expect(mapping).toMatchObject({ tenantId: tenantA, menuItemId: a.item.id });
  });

  it('sans contexte (job, cron) : requête refusée, aucun filtre oublié en silence', async () => {
    await expect(prisma.space.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })).rejects.toThrow(
      '[tenant-scope] Space.findMany hors contexte tenant',
    );
  });

  it('runWithoutTenantScope hors requête : lecture transverse explicite', async () => {
    const all = await tenantCtx.runWithoutTenantScope(() =>
      prisma.space.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
    );
    expect(new Set(all.map((sp) => sp.tenantId))).toEqual(new Set([tenantA, tenantB]));
  });

  it('runForTenant hors requête : restreint au tenant, même imbriqué dans un contournement', async () => {
    const rows = await tenantCtx.runWithoutTenantScope(() =>
      tenantCtx.runForTenant(tenantA, () =>
        prisma.space.findMany(),
      ),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((sp) => sp.tenantId === tenantA)).toBe(true);
  });
});
