import { IngredientsService } from './ingredients.service';

function build() {
  const existing = { id: 'ing-1', costPerRecipeUnit: '1.5', marketPriceId: null };
  const prisma: any = {
    ingredient: {
      findFirst: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue({ id: 'ing-1' }),
    },
  };
  const redis: any = { getOrSet: jest.fn(), scanDelete: jest.fn(), del: jest.fn(), delByPattern: jest.fn() };
  const propagation = { propagateFromBricks: jest.fn().mockResolvedValue({ components: 0, menuItems: 0 }) };
  const service = new IngredientsService(prisma, redis, propagation as any);
  (service as any).listCache = { invalidate: jest.fn(), key: jest.fn() };
  return { service, propagation };
}

describe('IngredientsService.update propagation', () => {
  it('propage ingredient_edit quand le coût change', async () => {
    const { service, propagation } = build();
    await service.update('ing-1', { costPerRecipeUnit: 2 }, 'tenant-1');
    expect(propagation.propagateFromBricks).toHaveBeenCalledWith({ ingredientIds: ['ing-1'] }, 'tenant-1', 'ingredient_edit', { ingredientId: 'ing-1' });
  });

  it('ne propage pas pour un simple renommage ou un coût identique', async () => {
    const { service, propagation } = build();
    await service.update('ing-1', { name: 'Autre', costPerRecipeUnit: 1.5 }, 'tenant-1');
    expect(propagation.propagateFromBricks).not.toHaveBeenCalled();
  });
});
