import { MenuComponentsService } from './menu-components.service';

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

  let service: MenuComponentsService;

  beforeEach(() => {
    service = new MenuComponentsService(mockPrisma, mockRedis);
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

    const unitCost = await (service as any).computeComponentUnitCost('comp-1', 'tenant-1');

    expect(unitCost).toBe(1); // 20 / 20
  });

  it('treats a falsy numberOfUnitsRecipe (null/undefined/0) as 1 to avoid dividing by zero', async () => {
    mockPrisma.menuComponent.findFirst.mockResolvedValue({
      id: 'comp-2',
      numberOfUnitsRecipe: null,
      ingredients: [{ ingredientId: 'ing-1', unitCost: 10, quantity: 2 }], // batch cost = 20
      children: [],
    });

    const unitCost = await (service as any).computeComponentUnitCost('comp-2', 'tenant-1');

    expect(unitCost).toBe(20); // unchanged, divided by 1

    mockPrisma.menuComponent.findFirst.mockResolvedValue({
      id: 'comp-3',
      numberOfUnitsRecipe: 0,
      ingredients: [{ ingredientId: 'ing-1', unitCost: 10, quantity: 2 }],
      children: [],
    });

    const unitCostZero = await (service as any).computeComponentUnitCost('comp-3', 'tenant-1');

    expect(unitCostZero).toBe(20);
  });
});
