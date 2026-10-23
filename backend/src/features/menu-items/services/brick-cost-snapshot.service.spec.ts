import { BrickCostSnapshotService } from './brick-cost-snapshot.service';

const ingredient = (id: string, over: Record<string, any> = {}) => ({
  id,
  name: `Ing ${id}`,
  recipeUnit: 'kg',
  supplier: 'Saisi',
  costPerRecipeUnit: 2.5,
  marketPriceId: 'mp1',
  marketPrice: { supplierId: 's1', supplier: 'Metro', supplierRel: { name: 'Metro France' } },
  ...over,
});

function build(bricks: { ingredients?: any[]; packagings?: any[]; components?: any[] }, last: any[] = []) {
  const prisma: any = {
    ingredient: { findMany: jest.fn().mockResolvedValue(bricks.ingredients ?? []) },
    packaging: { findMany: jest.fn().mockResolvedValue(bricks.packagings ?? []) },
    menuComponent: { findMany: jest.fn().mockResolvedValue(bricks.components ?? []) },
    brickCostSnapshot: { createMany: jest.fn().mockImplementation(async ({ data }) => ({ count: data.length })) },
    $queryRaw: jest.fn().mockResolvedValue(last),
  };
  return { service: new BrickCostSnapshotService(prisma), prisma };
}

describe('BrickCostSnapshotService.recordIfChanged', () => {
  it('écrit une version pour une brique sans historique, avec le fournisseur du prix du marché', async () => {
    const { service, prisma } = build({ ingredients: [ingredient('i1')] });
    const created = await service.recordIfChanged('t1', 'ingredient', ['i1'], 'market_price', { marketPriceIds: ['mp1'] });

    expect(created).toBe(1);
    const { data } = prisma.brickCostSnapshot.createMany.mock.calls[0][0];
    expect(data[0]).toMatchObject({
      tenantId: 't1', kind: 'ingredient', refId: 'i1', name: 'Ing i1', unitCost: 2.5, recipeUnit: 'kg',
      supplierId: 's1', supplierName: 'Metro France', marketPriceId: 'mp1', reason: 'market_price', sourceRef: { marketPriceIds: ['mp1'] },
    });
  });

  it('est idempotent : coût et fournisseur identiques à la dernière version, aucune écriture', async () => {
    const { service, prisma } = build(
      { ingredients: [ingredient('i1')] },
      [{ refId: 'i1', unitCost: '2.5000', supplierId: 's1', supplierName: 'Metro France' }],
    );
    expect(await service.recordIfChanged('t1', 'ingredient', ['i1'], 'ingredient_edit')).toBe(0);
    expect(prisma.brickCostSnapshot.createMany).not.toHaveBeenCalled();
  });

  it('écrit quand le coût change', async () => {
    const { service, prisma } = build(
      { ingredients: [ingredient('i1', { costPerRecipeUnit: 3 })] },
      [{ refId: 'i1', unitCost: '2.5000', supplierId: 's1', supplierName: 'Metro France' }],
    );
    expect(await service.recordIfChanged('t1', 'ingredient', ['i1'], 'ingredient_edit')).toBe(1);
    expect(prisma.brickCostSnapshot.createMany.mock.calls[0][0].data[0]).toMatchObject({ unitCost: 3, reason: 'ingredient_edit' });
  });

  it('écrit quand seul le fournisseur change (coût identique)', async () => {
    const { service, prisma } = build(
      { ingredients: [ingredient('i1', { marketPrice: { supplierId: 's2', supplier: 'Promocash', supplierRel: { name: 'Promocash' } } })] },
      [{ refId: 'i1', unitCost: '2.5000', supplierId: 's1', supplierName: 'Metro France' }],
    );
    expect(await service.recordIfChanged('t1', 'ingredient', ['i1'], 'market_price')).toBe(1);
    expect(prisma.brickCostSnapshot.createMany.mock.calls[0][0].data[0]).toMatchObject({ unitCost: 2.5, supplierId: 's2', supplierName: 'Promocash' });
  });

  it('retombe sur le nom de fournisseur saisi quand la brique n\'a pas de prix du marché', async () => {
    const { service, prisma } = build({ ingredients: [ingredient('i1', { marketPriceId: null, marketPrice: null })] });
    await service.recordIfChanged('t1', 'ingredient', ['i1'], 'created');
    expect(prisma.brickCostSnapshot.createMany.mock.calls[0][0].data[0]).toMatchObject({ supplierId: null, supplierName: 'Saisi', marketPriceId: null });
  });

  it('ne traite que les briques en lot : écrit les changées, ignore les inchangées et sans coût', async () => {
    const { service, prisma } = build(
      { ingredients: [ingredient('i1'), ingredient('i2', { costPerRecipeUnit: 9 }), ingredient('i3', { costPerRecipeUnit: null })] },
      [
        { refId: 'i1', unitCost: '2.5', supplierId: 's1', supplierName: 'Metro France' },
        { refId: 'i2', unitCost: '8', supplierId: 's1', supplierName: 'Metro France' },
      ],
    );
    expect(await service.recordIfChanged('t1', 'ingredient', ['i1', 'i2', 'i3', 'i2'], 'manual_refresh')).toBe(1);
    const { data } = prisma.brickCostSnapshot.createMany.mock.calls[0][0];
    expect(data.map((d: any) => d.refId)).toEqual(['i2']);
  });

  it('suit un composant sans fournisseur ni unité de recette', async () => {
    const { service, prisma } = build({ components: [{ id: 'c1', name: 'Sauce', unitCost: 1.2 }] });
    expect(await service.recordIfChanged('t1', 'component', ['c1'], 'component_edit', { componentId: 'c1' })).toBe(1);
    expect(prisma.brickCostSnapshot.createMany.mock.calls[0][0].data[0]).toMatchObject({
      kind: 'component', refId: 'c1', unitCost: 1.2, recipeUnit: null, supplierId: null, supplierName: null,
    });
  });

  it('lit les emballages sur la table Packaging', async () => {
    const { service, prisma } = build({ packagings: [ingredient('p1')] });
    await service.recordIfChanged('t1', 'packaging', ['p1'], 'created');
    expect(prisma.packaging.findMany).toHaveBeenCalled();
    expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
  });

  it('ne lève jamais : un échec de lecture est avalé et retourne 0', async () => {
    const { service, prisma } = build({});
    prisma.ingredient.findMany.mockRejectedValue(new Error('boom'));
    await expect(service.recordIfChanged('t1', 'ingredient', ['i1'], 'created')).resolves.toBe(0);
  });

  it('ne fait aucune requête sans identifiant', async () => {
    const { service, prisma } = build({});
    expect(await service.recordIfChanged('t1', 'ingredient', [], 'created')).toBe(0);
    expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
  });
});
