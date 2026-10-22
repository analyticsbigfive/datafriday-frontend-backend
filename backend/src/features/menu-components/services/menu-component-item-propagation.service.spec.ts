import { MenuComponentItemPropagationService } from './menu-component-item-propagation.service';

function build(overrides: Record<string, any> = {}) {
  const prisma: any = {
    componentComponent: {
      findMany: jest.fn()
        .mockResolvedValueOnce([{ parentId: 'comp-2' }]) // parents de comp-1
        .mockResolvedValue([]),
    },
    menuItemComponent: { findMany: jest.fn().mockResolvedValue([{ menuItemId: 'item-1' }, { menuItemId: 'item-1' }, { menuItemId: 'item-2' }]) },
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
  const costSnapshot = { recordIfChanged: jest.fn().mockResolvedValue(0) };
  const service = new MenuComponentItemPropagationService(prisma, componentCost as any, menuItemCost as any, costSnapshot as any);
  return { service, prisma, componentCost, menuItemCost, costSnapshot };
}

describe('MenuComponentItemPropagationService', () => {
  it('rafraîchit les composants parents, recalcule les articles (combos inclus) puis snapshot component_edit', async () => {
    const { service, prisma, componentCost, menuItemCost, costSnapshot } = build();
    const result = await service.propagate('comp-1', 'tenant-1');

    expect(componentCost.refreshCosts).toHaveBeenCalledWith('tenant-1', { componentIds: ['comp-2'] });
    expect(prisma.menuItemComponent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { componentId: { in: ['comp-1', 'comp-2'] }, menuItem: { tenantId: 'tenant-1', deletedAt: null } },
    }));
    expect(menuItemCost.refreshCosts).toHaveBeenCalledWith('tenant-1', { itemIds: ['item-1', 'item-2', 'combo-1'], skipSnapshot: true });
    expect(menuItemCost.refreshComboCost).toHaveBeenCalledWith('tenant-1', 'combo-1', { skipSnapshot: true });
    expect(costSnapshot.recordIfChanged).toHaveBeenCalledTimes(1);
    expect(costSnapshot.recordIfChanged).toHaveBeenCalledWith('tenant-1', ['item-1', 'item-2', 'combo-1'], 'component_edit', { componentId: 'comp-1' });
    expect(result).toEqual({ components: 2, menuItems: 3 });
  });

  it('ne recalcule rien quand aucun article n utilise le composant', async () => {
    const { service, menuItemCost, costSnapshot } = build({
      componentComponent: { findMany: jest.fn().mockResolvedValue([]) },
      menuItemComponent: { findMany: jest.fn().mockResolvedValue([]) },
      menuItemCombo: { findMany: jest.fn().mockResolvedValue([]) },
    });
    expect(await service.propagate('comp-1', 'tenant-1')).toEqual({ components: 1, menuItems: 0 });
    expect(menuItemCost.refreshCosts).not.toHaveBeenCalled();
    expect(costSnapshot.recordIfChanged).not.toHaveBeenCalled();
  });

  it('traite les articles par lots de 200', async () => {
    const lines = Array.from({ length: 450 }, (_, i) => ({ menuItemId: `item-${i}` }));
    const { service, menuItemCost } = build({
      componentComponent: { findMany: jest.fn().mockResolvedValue([]) },
      menuItemComponent: { findMany: jest.fn().mockResolvedValue(lines) },
      menuItemCombo: { findMany: jest.fn().mockResolvedValue([]) },
    });
    await service.propagate('comp-1', 'tenant-1');
    expect(menuItemCost.refreshCosts.mock.calls.map((c) => c[1].itemIds.length)).toEqual([200, 200, 50]);
  });

  it('reste non bloquant si le recalcul échoue', async () => {
    const { service } = build({ componentComponent: { findMany: jest.fn().mockRejectedValue(new Error('db')) } });
    await expect(service.propagate('comp-1', 'tenant-1')).resolves.toEqual({ components: 0, menuItems: 0 });
  });
});
