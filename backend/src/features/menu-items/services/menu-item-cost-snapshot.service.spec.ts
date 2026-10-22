import { MenuItemCostSnapshotService } from './menu-item-cost-snapshot.service';

const item = (id: string, over: Record<string, any> = {}) => ({
  id,
  totalCost: 3,
  numberOfPiecesRecipe: 2,
  basePrice: 10,
  vatRate: 5.5,
  components: [{ componentId: 'c1', numberOfUnits: 1, unitCost: 3, component: { name: 'Pain' } }],
  ingredients: [],
  packagings: [],
  comboChildren: [],
  ...over,
});

function build(items: any[], lastHashes: Array<{ menuItemId: string; recipeHash: string }> = []) {
  const prisma: any = {
    menuItem: { findMany: jest.fn().mockResolvedValue(items) },
    menuItemCostSnapshot: { createMany: jest.fn().mockImplementation(async ({ data }) => ({ count: data.length })) },
    $queryRaw: jest.fn().mockResolvedValue(lastHashes),
  };
  return { service: new MenuItemCostSnapshotService(prisma), prisma };
}

describe('MenuItemCostSnapshotService.recordIfChanged', () => {
  it('écrit un snapshot pour un article sans historique, valeurs persistées et recette figée', async () => {
    const { service, prisma } = build([item('a')]);
    const created = await service.recordIfChanged('t1', ['a'], 'market_price', { marketPriceIds: ['mp'] });

    expect(created).toBe(1);
    const { data } = prisma.menuItemCostSnapshot.createMany.mock.calls[0][0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      tenantId: 't1', menuItemId: 'a', totalCost: 3, numberOfPieces: 2, costPerPiece: 1.5, basePrice: 10, vatRate: 5.5,
      reason: 'market_price', sourceRef: { marketPriceIds: ['mp'] },
    });
    expect(data[0].recipe).toEqual([{ kind: 'component', refId: 'c1', name: 'Pain', quantity: 1, unitCost: 3 }]);
  });

  it('est idempotent : second appel sans changement, aucune écriture', async () => {
    const first = build([item('a')]);
    await first.service.recordIfChanged('t1', ['a'], 'created');
    const hash = first.prisma.menuItemCostSnapshot.createMany.mock.calls[0][0].data[0].recipeHash;

    const { service, prisma } = build([item('a')], [{ menuItemId: 'a', recipeHash: hash }]);
    expect(await service.recordIfChanged('t1', ['a'], 'manual_refresh')).toBe(0);
    expect(prisma.menuItemCostSnapshot.createMany).not.toHaveBeenCalled();
  });

  it('écrit une nouvelle version quand le coût d une ligne change, pas quand seul le nom change', async () => {
    const first = build([item('a')]);
    await first.service.recordIfChanged('t1', ['a'], 'created');
    const hash = first.prisma.menuItemCostSnapshot.createMany.mock.calls[0][0].data[0].recipeHash;
    const last = [{ menuItemId: 'a', recipeHash: hash }];

    const renamed = build([item('a', { components: [{ componentId: 'c1', numberOfUnits: 1, unitCost: 3, component: { name: 'Autre nom' } }] })], last);
    expect(await renamed.service.recordIfChanged('t1', ['a'], 'manual_refresh')).toBe(0);

    const repriced = build([item('a', { totalCost: 4, components: [{ componentId: 'c1', numberOfUnits: 1, unitCost: 4, component: { name: 'Pain' } }] })], last);
    expect(await repriced.service.recordIfChanged('t1', ['a'], 'market_price')).toBe(1);
  });

  it('traite un lot de 1200 articles en 3 createMany de 500 maximum', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `i${i}`);
    const { service, prisma } = build([]);
    prisma.menuItem.findMany.mockImplementation(async ({ where }: any) => where.id.in.map((id: string) => item(id)));

    expect(await service.recordIfChanged('t1', ids, 'baseline')).toBe(1200);
    const sizes = prisma.menuItemCostSnapshot.createMany.mock.calls.map((c: any[]) => c[0].data.length);
    expect(sizes).toEqual([500, 500, 200]);
  });

  it('ne lève jamais : un échec d écriture est avalé et retourne 0', async () => {
    const { service, prisma } = build([item('a')]);
    prisma.menuItemCostSnapshot.createMany.mockRejectedValue(new Error('db down'));
    await expect(service.recordIfChanged('t1', ['a'], 'created')).resolves.toBe(0);
  });

  it('ne fait rien sans identifiant et ignore les doublons', async () => {
    const { service, prisma } = build([item('a')]);
    expect(await service.recordIfChanged('t1', [], 'created')).toBe(0);
    expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
    await service.recordIfChanged('t1', ['a', 'a'], 'created');
    expect(prisma.menuItem.findMany.mock.calls[0][0].where.id.in).toEqual(['a']);
  });
});
