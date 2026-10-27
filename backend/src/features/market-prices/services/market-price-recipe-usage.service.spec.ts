import { MarketPriceRecipeUsageService } from './market-price-recipe-usage.service';

describe('MarketPriceRecipeUsageService', () => {
  const build = (ingredients: any[], packagings: any[], prices: any[], scope: any = {}) => {
    const prisma: any = {
      ingredient: { findMany: jest.fn().mockResolvedValue(ingredients) },
      packaging: { findMany: jest.fn().mockResolvedValue(packagings) },
      marketPrice: { findMany: jest.fn().mockResolvedValue(prices) },
    };
    const queryService: any = { spaceScopeFilter: jest.fn().mockResolvedValue(scope) };
    return { prisma, queryService, service: new MarketPriceRecipeUsageService(prisma, queryService) };
  };

  it('fusionne ingrédients et emballages sans doublon et filtre par tenant', async () => {
    const { prisma, service } = build(
      [{ marketPriceId: 'a' }, { marketPriceId: 'b' }],
      [{ marketPriceId: 'b' }, { marketPriceId: 'c' }],
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    );
    const res = await service.findUsedMarketPriceIds('t1');
    expect(res).toEqual({ marketPriceIds: ['a', 'b', 'c'] });
    const where = prisma.marketPrice.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.deletedAt).toBeNull();
    expect(where.id.in.sort()).toEqual(['a', 'b', 'c']);
    expect(prisma.ingredient.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
    expect(prisma.packaging.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
  });

  it('applique le filtre de périmètre des comptes restreints', async () => {
    const scope = { supplierRel: { sites: { hasSome: ['s1'] } } };
    const { prisma, service } = build([{ marketPriceId: 'a' }], [], [], scope);
    const res = await service.findUsedMarketPriceIds('t1', { id: 'u' } as any);
    expect(res).toEqual({ marketPriceIds: [] });
    expect(prisma.marketPrice.findMany.mock.calls[0][0].where.supplierRel).toEqual(scope.supplierRel);
  });

  it('ne requête pas les prix quand aucune recette ne les utilise', async () => {
    const { prisma, service } = build([], [], []);
    expect(await service.findUsedMarketPriceIds('t1')).toEqual({ marketPriceIds: [] });
    expect(prisma.marketPrice.findMany).not.toHaveBeenCalled();
  });
});
