import { MenuComponentItemPropagationService } from './menu-component-item-propagation.service';

function build(overrides: Record<string, any> = {}) {
  const prisma: any = {
    componentIngredient: { findMany: jest.fn().mockResolvedValue([{ componentId: 'comp-1' }]) },
    componentComponent: {
      findMany: jest.fn().mockResolvedValueOnce([{ parentId: 'comp-2' }]).mockResolvedValue([]),
    },
    menuItemIngredient: { findMany: jest.fn().mockResolvedValue([{ menuItemId: 'item-1' }]) },
    menuItemPackaging: { findMany: jest.fn().mockResolvedValue([{ menuItemId: 'item-3' }]) },
    menuItemComponent: { findMany: jest.fn().mockResolvedValue([{ menuItemId: 'item-2' }, { menuItemId: 'item-1' }]) },
    menuItemCombo: {
      findMany: jest.fn()
        .mockResolvedValueOnce([{ parentId: 'combo-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ parentId: 'combo-1' }]),
    },
    ...overrides,
  };
  const componentCost = { refreshCosts: jest.fn().mockResolvedValue({}) };
  const menuItemCost = { refreshCosts: jest.fn().mockResolvedValue({}), refreshComboCost: jest.fn().mockResolvedValue(0) };
  const costSnapshot = { recordIfChanged: jest.fn().mockResolvedValue(0) };
  const service = new MenuComponentItemPropagationService(prisma, componentCost as any, menuItemCost as any, costSnapshot as any);
  return { service, prisma, componentCost, menuItemCost, costSnapshot };
}

describe('MenuComponentItemPropagationService.propagateFromBricks', () => {
  it('ingrédient : composants (parents inclus), articles (ligne, composant, combo) puis snapshot ingredient_edit', async () => {
    const { service, componentCost, menuItemCost, costSnapshot, prisma } = build();
    const result = await service.propagateFromBricks({ ingredientIds: ['ing-1', 'ing-1'] }, 'tenant-1', 'ingredient_edit', { ingredientId: 'ing-1' });

    expect(prisma.componentIngredient.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ingredientId: { in: ['ing-1'] }, component: { tenantId: 'tenant-1', deletedAt: null } },
    }));
    expect(componentCost.refreshCosts).toHaveBeenCalledWith('tenant-1', { componentIds: ['comp-1', 'comp-2'] });
    expect(menuItemCost.refreshCosts).toHaveBeenCalledWith('tenant-1', { itemIds: ['item-1', 'item-2', 'combo-1'], skipSnapshot: true });
    expect(menuItemCost.refreshComboCost).toHaveBeenCalledWith('tenant-1', 'combo-1', { skipSnapshot: true });
    expect(costSnapshot.recordIfChanged).toHaveBeenCalledTimes(1);
    expect(costSnapshot.recordIfChanged).toHaveBeenCalledWith('tenant-1', ['item-1', 'item-2', 'combo-1'], 'ingredient_edit', { ingredientId: 'ing-1' });
    expect(result).toEqual({ components: 2, menuItems: 3 });
  });

  it('emballage : pas de composant, articles via ligne emballage, snapshot packaging_edit', async () => {
    const { service, componentCost, costSnapshot, prisma } = build({
      menuItemCombo: { findMany: jest.fn().mockResolvedValue([]) },
      componentComponent: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const result = await service.propagateFromBricks({ packagingIds: ['pk-1'] }, 'tenant-1', 'packaging_edit', { packagingId: 'pk-1' });

    expect(prisma.componentIngredient.findMany).not.toHaveBeenCalled();
    expect(componentCost.refreshCosts).not.toHaveBeenCalled();
    expect(costSnapshot.recordIfChanged).toHaveBeenCalledWith('tenant-1', ['item-3'], 'packaging_edit', { packagingId: 'pk-1' });
    expect(result).toEqual({ components: 0, menuItems: 1 });
  });

  it('ne fait rien sans identifiant', async () => {
    const { service, menuItemCost } = build();
    expect(await service.propagateFromBricks({}, 'tenant-1', 'ingredient_edit', {})).toEqual({ components: 0, menuItems: 0 });
    expect(menuItemCost.refreshCosts).not.toHaveBeenCalled();
  });

  it('reste non bloquant si le recalcul échoue', async () => {
    const { service } = build({ componentIngredient: { findMany: jest.fn().mockRejectedValue(new Error('db')) } });
    await expect(service.propagateFromBricks({ ingredientIds: ['ing-1'] }, 'tenant-1', 'ingredient_edit', {})).resolves.toEqual({ components: 0, menuItems: 0 });
  });
});
