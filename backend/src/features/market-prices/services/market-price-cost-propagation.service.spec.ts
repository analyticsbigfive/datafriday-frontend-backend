import { MarketPriceCostPropagationService } from './market-price-cost-propagation.service';

function build(overrides: Record<string, any> = {}) {
  const prisma: any = {
    ingredient: { findMany: jest.fn().mockResolvedValue([{ id: 'ing-1' }]) },
    packaging: { findMany: jest.fn().mockResolvedValue([]) },
    componentIngredient: { findMany: jest.fn().mockResolvedValue([{ componentId: 'comp-1' }]) },
    componentComponent: {
      findMany: jest.fn()
        .mockResolvedValueOnce([{ parentId: 'comp-2' }])
        .mockResolvedValue([]),
    },
    menuItemIngredient: { findMany: jest.fn().mockResolvedValue([{ menuItemId: 'item-1' }]) },
    menuItemPackaging: { findMany: jest.fn().mockResolvedValue([]) },
    menuItemComponent: { findMany: jest.fn().mockResolvedValue([{ menuItemId: 'item-2' }]) },
    menuItemCombo: {
      findMany: jest.fn()
        .mockResolvedValueOnce([{ parentId: 'combo-1' }]) // ancêtres, niveau 1
        .mockResolvedValueOnce([]) // ancêtres, niveau 2
        .mockResolvedValue([{ parentId: 'combo-1' }]), // parents de combo à recalculer
    },
    ...overrides,
  };
  const componentCost = { refreshCosts: jest.fn().mockResolvedValue({}) };
  const menuItemCost = { refreshCosts: jest.fn().mockResolvedValue({}), refreshComboCost: jest.fn().mockResolvedValue(0) };
  return { service: new MarketPriceCostPropagationService(prisma, componentCost as any, menuItemCost as any), componentCost, menuItemCost, prisma };
}

describe('MarketPriceCostPropagationService', () => {
  it('recalcule composants (parents inclus), menu items (parents de combo inclus) puis la part combo', async () => {
    const { service, componentCost, menuItemCost } = build();
    const result = await service.propagate(['mp-1', 'mp-1'], 'tenant-1');

    expect(componentCost.refreshCosts).toHaveBeenCalledWith('tenant-1', { componentIds: expect.arrayContaining(['comp-1', 'comp-2']) });
    expect(menuItemCost.refreshCosts).toHaveBeenCalledWith('tenant-1', {
      itemIds: expect.arrayContaining(['item-1', 'item-2', 'combo-1']),
    });
    expect(menuItemCost.refreshComboCost).toHaveBeenCalledWith('tenant-1', 'combo-1');
    expect(result).toEqual({ components: 2, menuItems: 3 });
  });

  it('ne fait rien sans identifiant', async () => {
    const { service, componentCost, menuItemCost } = build();
    expect(await service.propagate([], 'tenant-1')).toEqual({ components: 0, menuItems: 0 });
    expect(componentCost.refreshCosts).not.toHaveBeenCalled();
    expect(menuItemCost.refreshCosts).not.toHaveBeenCalled();
  });

  it('reste non bloquant si le recalcul échoue', async () => {
    const { service } = build({ ingredient: { findMany: jest.fn().mockRejectedValue(new Error('db')) } });
    await expect(service.propagate(['mp-1'], 'tenant-1')).resolves.toEqual({ components: 0, menuItems: 0 });
  });
});
