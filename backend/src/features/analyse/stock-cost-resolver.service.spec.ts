import { StockCostResolverService } from './stock-cost-resolver.service';

describe('StockCostResolverService', () => {
  const prisma: any = {
    ingredient: { findMany: jest.fn() },
    packaging: { findMany: jest.fn() },
    menuComponent: { findMany: jest.fn() },
    menuItem: { findMany: jest.fn() },
    marketPrice: { findMany: jest.fn() },
  };
  const service = new StockCostResolverService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.ingredient.findMany.mockResolvedValue([{ id: 'ing1', marketPriceId: 'mp2' }]);
    prisma.packaging.findMany.mockResolvedValue([]);
    prisma.menuComponent.findMany.mockResolvedValue([{ id: 'comp1', unitCost: 1.5 }]);
    prisma.menuItem.findMany.mockResolvedValue([{ id: 'mi1', totalCost: 4, numberOfPiecesRecipe: null }, { id: 'mi2', totalCost: 12, numberOfPiecesRecipe: 4 }, { id: 'mi3', totalCost: 5, numberOfPiecesRecipe: 0 }]);
    prisma.marketPrice.findMany.mockResolvedValue([
      { id: 'mp1', pricePerUnit: 2, supplierId: 's1', industrialId: 'i1' },
      { id: 'mp2', pricePerUnit: 0.5, supplierId: null, industrialId: null },
      { id: 'mp0', pricePerUnit: 0, supplierId: null, industrialId: null },
    ]);
  });

  it('résout chaque kind sur sa source de coût', async () => {
    const res = await service.resolve('t1', [
      { key: 'a', itemKind: 'marketPrice', itemRefId: 'mp1' },
      { key: 'b', itemKind: 'ingredient', itemRefId: 'ing1' },
      { key: 'c', itemKind: 'menuComponent', itemRefId: 'comp1' },
      { key: 'd', itemKind: 'menuItem', itemRefId: 'mi1' },
    ]);
    expect(res.get('a')).toEqual({ unitCost: 2, marketPrice: { id: 'mp1', supplierId: 's1', industrialId: 'i1' } });
    expect(res.get('b')?.unitCost).toBe(0.5);
    expect(res.get('c')).toEqual({ unitCost: 1.5, marketPrice: null });
    expect(res.get('d')).toEqual({ unitCost: 4, marketPrice: null });
  });

  it('article compté tel quel : totalCost ramené à la pièce, repli 1 si lot nul ou inconnu', async () => {
    const res = await service.resolve('t1', [
      { key: 'p', itemKind: 'menuItem', itemRefId: 'mi2' },
      { key: 'n', itemKind: 'menuItem', itemRefId: 'mi1' },
      { key: 'z', itemKind: 'menuItem', itemRefId: 'mi3' },
    ]);
    expect([res.get('p')?.unitCost, res.get('n')?.unitCost, res.get('z')?.unitCost]).toEqual([3, 4, 5]);
  });

  it('ne fabrique jamais un coût de 0 (coût nul ou inconnu : null)', async () => {
    const res = await service.resolve('t1', [
      { key: 'zero', itemKind: 'marketPrice', itemRefId: 'mp0' },
      { key: 'unknown', itemKind: 'marketPrice', itemRefId: 'nope' },
    ]);
    expect(res.get('zero')?.unitCost).toBeNull();
    expect(res.get('unknown')?.unitCost).toBeNull();
  });

  it('identité inconnue : Market Price, puis composant, puis article', async () => {
    const res = await service.resolve('t1', [
      { key: 'x', itemRefId: 'mp1' },
      { key: 'y', itemRefId: 'comp1' },
      { key: 'z', itemRefId: 'mi1' },
    ]);
    expect([res.get('x')?.unitCost, res.get('y')?.unitCost, res.get('z')?.unitCost]).toEqual([2, 1.5, 4]);
  });

  it('se rabat sur le marketPriceId de la ligne quand l\'identité ne donne rien', async () => {
    const res = await service.resolve('t1', [{ key: 'l', itemKind: null, itemRefId: null, marketPriceId: 'mp1' }]);
    expect(res.get('l')?.unitCost).toBe(2);
  });

  it('groupe les lectures : une requête par table, quel que soit le nombre de lignes', async () => {
    await service.resolve('t1', Array.from({ length: 50 }, (_, i) => ({ key: `k${i}`, itemKind: 'marketPrice', itemRefId: 'mp1' })));
    expect(prisma.marketPrice.findMany).toHaveBeenCalledTimes(1);
  });
});
