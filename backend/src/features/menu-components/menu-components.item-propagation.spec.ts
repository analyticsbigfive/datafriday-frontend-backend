import { createMenuComponentsServices } from './services/menu-components-services.testing';

describe('MenuComponentsService : propagation vers les articles', () => {
  let service: any;
  let propagate: jest.Mock;

  beforeEach(() => {
    const comp = { id: 'comp-1', tenantId: 'tenant-1', spaceIds: [] };
    const prisma: any = {
      menuComponent: {
        update: jest.fn().mockResolvedValue(comp),
        findFirst: jest.fn().mockResolvedValue(comp),
      },
    };
    propagate = jest.fn().mockResolvedValue({ components: 1, menuItems: 0 });
    const services = createMenuComponentsServices({ prisma, redis: { deletePattern: jest.fn() }, itemPropagation: { propagate } });
    service = services.menuComponentsService;
    jest.spyOn(services.menuComponentValidationService as any, 'assertIngredientsExist').mockResolvedValue(undefined);
    jest.spyOn(services.menuComponentValidationService as any, 'assertChildrenExist').mockResolvedValue(undefined);
    jest.spyOn(services.menuComponentValidationService as any, 'assertComponentTypeAccessible').mockResolvedValue(undefined);
    jest.spyOn(services.menuComponentValidationService as any, 'assertComponentCategoryAccessible').mockResolvedValue(undefined);
    jest.spyOn(services.menuComponentCostService, 'refreshCosts').mockResolvedValue(undefined as any);
  });

  it('replaceIngredients et replaceChildren propagent', async () => {
    await service.replaceIngredients('comp-1', [{ ingredientId: 'ing-1', quantity: 1, unit: 'g' }], 'tenant-1');
    await service.replaceChildren('comp-1', [{ childId: 'comp-2', quantity: 1, unit: 'u' }], 'tenant-1');
    expect(propagate).toHaveBeenCalledTimes(2);
    expect(propagate).toHaveBeenCalledWith('comp-1', 'tenant-1');
  });

  it('update propage quand les lignes changent', async () => {
    await service.update('comp-1', { ingredients: [{ ingredientId: 'ing-1', quantity: 1, unit: 'g' }] } as any, 'tenant-1');
    expect(propagate).toHaveBeenCalledWith('comp-1', 'tenant-1');
  });

  it('update propage quand le coût unitaire est saisi', async () => {
    await service.update('comp-1', { unitCost: 3.2 } as any, 'tenant-1');
    expect(propagate).toHaveBeenCalledWith('comp-1', 'tenant-1');
  });

  it('update ne propage pas pour un simple renommage', async () => {
    await service.update('comp-1', { name: 'Autre' } as any, 'tenant-1');
    expect(propagate).not.toHaveBeenCalled();
  });
});
