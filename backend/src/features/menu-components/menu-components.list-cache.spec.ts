import { createMenuComponentsServices } from './services/menu-components-services.testing';

// La liste GET /menu-components est en cache Redis (1 h). Toute écriture sur la composition d'un
// composant doit la purger, sinon la liste (et les écrans qui s'en servent) garde l'ancienne recette.
describe('MenuComponentsService : purge du cache de la liste après modification de la composition', () => {
  let service: any;
  let redis: { deletePattern: jest.Mock };
  let refreshCosts: jest.SpyInstance;

  beforeEach(() => {
    const comp = { id: 'comp-1', tenantId: 'tenant-1', spaceIds: [] };
    const prisma: any = {
      menuComponent: {
        update: jest.fn().mockResolvedValue(comp),
        findFirst: jest.fn().mockResolvedValue(comp),
      },
    };
    redis = { deletePattern: jest.fn().mockResolvedValue(1) };
    const services = createMenuComponentsServices({
      prisma,
      redis,
      itemPropagation: { propagate: jest.fn().mockResolvedValue({ components: 0, menuItems: 0 }) },
    });
    service = services.menuComponentsService;
    jest.spyOn(services.menuComponentValidationService as any, 'assertIngredientsExist').mockResolvedValue(undefined);
    jest.spyOn(services.menuComponentValidationService as any, 'assertChildrenExist').mockResolvedValue(undefined);
    refreshCosts = jest.spyOn(services.menuComponentCostService, 'refreshCosts').mockResolvedValue(undefined as any);
  });

  it('replaceIngredients purge la liste du tenant, après le recalcul des coûts', async () => {
    await service.replaceIngredients('comp-1', [{ ingredientId: 'ing-1', quantity: 1, unit: 'g' }], 'tenant-1');
    expect(redis.deletePattern).toHaveBeenCalledTimes(1);
    expect(redis.deletePattern).toHaveBeenCalledWith('menu-components:tenant-1:*');
    // Purger avant le recalcul laisserait une lecture concurrente remettre en cache un coût périmé.
    expect(refreshCosts.mock.invocationCallOrder[0]).toBeLessThan(redis.deletePattern.mock.invocationCallOrder[0]);
  });

  it('replaceChildren purge la liste du tenant, après le recalcul des coûts', async () => {
    await service.replaceChildren('comp-1', [{ childId: 'comp-2', quantity: 1, unit: 'u' }], 'tenant-1');
    expect(redis.deletePattern).toHaveBeenCalledTimes(1);
    expect(redis.deletePattern).toHaveBeenCalledWith('menu-components:tenant-1:*');
    expect(refreshCosts.mock.invocationCallOrder[0]).toBeLessThan(redis.deletePattern.mock.invocationCallOrder[0]);
  });

  it('un tenant ne purge pas le cache d un autre', async () => {
    await service.replaceIngredients('comp-1', [], 'tenant-1');
    expect(redis.deletePattern).not.toHaveBeenCalledWith('menu-components:tenant-2:*');
  });
});
