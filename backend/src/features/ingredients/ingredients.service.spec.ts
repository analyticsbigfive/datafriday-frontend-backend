import { ConflictException } from '@nestjs/common';
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
  return { service, propagation, prisma };
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

describe('IngredientsService.remove', () => {
  const usageTable = (count: number, field: string) => ({
    count: jest.fn().mockResolvedValue(count),
    findMany: jest.fn().mockResolvedValue(count ? [{ [field]: { name: 'Burger' } }] : []),
  });

  it('refuse (409) si utilisé dans un composant', async () => {
    const { service, prisma } = build();
    prisma.componentIngredient = usageTable(1, 'component');
    prisma.menuItemIngredient = usageTable(0, 'menuItem');
    await expect(service.remove('ing-1', 'tenant-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it('supprime (soft) si inutilisé', async () => {
    const { service, prisma } = build();
    prisma.componentIngredient = usageTable(0, 'component');
    prisma.menuItemIngredient = usageTable(0, 'menuItem');
    await service.remove('ing-1', 'tenant-1');
    expect(prisma.ingredient.update).toHaveBeenCalledWith({ where: { id: 'ing-1' }, data: { deletedAt: expect.any(Date) } });
  });
});
