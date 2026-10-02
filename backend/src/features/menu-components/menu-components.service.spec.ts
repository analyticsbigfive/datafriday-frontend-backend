import { createMenuComponentsServices } from './services/menu-components-services.testing';

describe('MenuComponentsService computeComponentUnitCost', () => {
  const mockPrisma = {
    menuComponent: {
      findFirst: jest.fn(),
    },
    ingredient: {
      findFirst: jest.fn(),
    },
  } as any;

  const mockRedis = {} as any;
  let menuComponentCostService: any;

  beforeEach(() => {
    ({ menuComponentCostService } = createMenuComponentsServices({ prisma: mockPrisma, redis: mockRedis }));
    jest.clearAllMocks();
  });

  // BUG-001: une recette dont `numberOfUnitsRecipe` produit plusieurs unités doit voir son coût
  // divisé par ce nombre pour obtenir le coût unitaire, pas le coût de la fournée entière.
  it('divides the total recipe cost by numberOfUnitsRecipe when it is greater than 1', async () => {
    mockPrisma.menuComponent.findFirst.mockResolvedValue({
      id: 'comp-1',
      numberOfUnitsRecipe: 20,
      ingredients: [{ ingredientId: 'ing-1', unitCost: 10, quantity: 2 }], // batch cost = 20
      children: [],
    });

    const unitCost = await (menuComponentCostService as any).computeComponentUnitCost('comp-1', 'tenant-1');

    expect(unitCost).toBe(1); // 20 / 20
  });

  it('treats a falsy numberOfUnitsRecipe (null/undefined/0) as 1 to avoid dividing by zero', async () => {
    mockPrisma.menuComponent.findFirst.mockResolvedValue({
      id: 'comp-2',
      numberOfUnitsRecipe: null,
      ingredients: [{ ingredientId: 'ing-1', unitCost: 10, quantity: 2 }], // batch cost = 20
      children: [],
    });

    const unitCost = await (menuComponentCostService as any).computeComponentUnitCost('comp-2', 'tenant-1');

    expect(unitCost).toBe(20); // unchanged, divided by 1

    mockPrisma.menuComponent.findFirst.mockResolvedValue({
      id: 'comp-3',
      numberOfUnitsRecipe: 0,
      ingredients: [{ ingredientId: 'ing-1', unitCost: 10, quantity: 2 }],
      children: [],
    });

    const unitCostZero = await (menuComponentCostService as any).computeComponentUnitCost('comp-3', 'tenant-1');

    expect(unitCostZero).toBe(20);
  });
});

describe('MenuComponentsService.create : purge du cache liste', () => {
  const created = { id: 'mc-new', name: 'Sauce maison' };
  let prisma: any;
  let redis: any;
  let menuComponentValidationService: any;
  let menuComponentCostService: any;
  let menuComponentsService: any;

  beforeEach(() => {
    prisma = {
      menuComponent: {
        create: jest.fn().mockResolvedValue(created),
        findFirst: jest.fn().mockResolvedValue(created),
      },
    };
    redis = { deletePattern: jest.fn().mockResolvedValue(1) };
    ({ menuComponentValidationService, menuComponentCostService, menuComponentsService } = createMenuComponentsServices({ prisma, redis }));
    // Validations de références et recalcul des coûts hors sujet ici.
    jest.spyOn(menuComponentValidationService as any, 'assertIngredientsExist').mockResolvedValue(undefined);
    jest.spyOn(menuComponentValidationService as any, 'assertChildrenExist').mockResolvedValue(undefined);
    jest.spyOn(menuComponentValidationService as any, 'assertComponentTypeAccessible').mockResolvedValue(undefined);
    jest.spyOn(menuComponentValidationService as any, 'assertComponentCategoryAccessible').mockResolvedValue(undefined);
    jest.spyOn(menuComponentCostService, 'refreshCosts').mockResolvedValue(undefined as any);
  });

  // Bug liste Composants (2026-09-24) : créé avec des ingrédients, le composant sortait par le
  // retour anticipé sans purger le cache `findAll` (TTL 1 h) et restait absent de la liste.
  it('purge le cache quand le composant est créé avec des ingrédients', async () => {
    await menuComponentsService.create(
      { name: 'Sauce maison', ingredients: [{ ingredientId: 'ing-1', quantity: 2, unit: 'g' }] } as any,
      'tenant-1',
    );
    expect(menuComponentCostService.refreshCosts).toHaveBeenCalled();
    expect(redis.deletePattern).toHaveBeenCalledWith('menu-components:tenant-1:*');
  });

  it('purge le cache quand le composant est créé sans ligne', async () => {
    await menuComponentsService.create({ name: 'Sauce maison' } as any, 'tenant-1');
    expect(redis.deletePattern).toHaveBeenCalledWith('menu-components:tenant-1:*');
  });
});
