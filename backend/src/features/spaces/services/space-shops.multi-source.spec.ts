import { SpaceShopsService } from './space-shops.service';

/**
 * Constat L2 (ADR_MULTI_SOURCE 4.5) : l'arrêt du pre-event à la première vente lit TOUTES les
 * intégrations mappées à l'espace (Weezevent, Digifood, caisse Data Friday), pas la première
 * au hasard. Une seule intégration : SQL historique (`=`) inchangé.
 */
describe('SpaceShopsService.firstValidSaleByElementSince : plusieurs sources', () => {
  const build = (integrationIds: string[]) => {
    const prisma: any = {
      locationSpaceMapping: { findMany: jest.fn().mockResolvedValue(integrationIds.map((salesLocationId) => ({ salesLocationId }))) },
      $queryRaw: jest.fn().mockResolvedValue([{ elementId: 'pdv-a', firstAt: new Date('2026-10-16T18:00:00Z') }]),
    };
    const scope: any = { resolveShopIdsForSpace: jest.fn().mockResolvedValue(['pdv-a']) };
    const service = new SpaceShopsService(prisma, {} as any, {} as any, {} as any, {} as any, scope);
    return { prisma, service };
  };
  const sql = (prisma: any) => prisma.$queryRaw.mock.calls[0][0];

  it('deux intégrations (Weezevent + caisse) : filtre ANY sur les deux, la vente de la caisse compte', async () => {
    const { prisma, service } = build(['int-W', 'int-POS']);
    const first = await service.firstValidSaleByElementSince('space-1', 'tenant-1', new Date('2026-10-16T00:00:00Z'));
    expect(first.get('pdv-a')).toEqual(new Date('2026-10-16T18:00:00Z'));
    expect(sql(prisma).strings.join('?')).toContain('AND t."integrationId" = ANY(');
    expect(sql(prisma).values).toContainEqual(['int-W', 'int-POS']);
  });

  it('une seule intégration : SQL historique, égalité simple', async () => {
    const { prisma, service } = build(['int-W']);
    await service.firstValidSaleByElementSince('space-1', 'tenant-1', new Date());
    expect(sql(prisma).strings.join('?')).toContain('AND t."integrationId" = ?');
    expect(sql(prisma).strings.join('?')).not.toContain('ANY(${');
    expect(sql(prisma).values).toContain('int-W');
  });

  it('aucune intégration mappée : pas de filtre d\'intégration (comportement d\'avant)', async () => {
    const { prisma, service } = build([]);
    await service.firstValidSaleByElementSince('space-1', 'tenant-1', new Date());
    expect(sql(prisma).strings.join('?')).not.toContain('t."integrationId" =');
  });
});
