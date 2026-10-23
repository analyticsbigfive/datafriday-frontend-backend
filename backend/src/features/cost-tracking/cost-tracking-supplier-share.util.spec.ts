import { buildSupplierShareSeries, NO_SUPPLIER, sharesAt, SupplierShareContext } from './cost-tracking-supplier-share.util';
import { averageStaircase } from './cost-tracking-series.util';
import { BrickKind, BrickSnapshotPoint, RecipeLine, SnapshotWithRecipe } from './cost-tracking.types';

const from = new Date('2026-04-01T00:00:00Z');
const line = (kind: RecipeLine['kind'], refId: string, quantity: number, unitCost: number): RecipeLine => ({ kind, refId, name: refId, quantity, unitCost });
const version = (at: string, recipe: RecipeLine[], costPerPiece: number, pieces = 1): SnapshotWithRecipe => ({
  id: `v-${at}`, menuItemId: 'm1', effectiveFrom: new Date(at), costPerPiece, totalCost: costPerPiece * pieces, numberOfPieces: pieces, basePrice: 10, reason: 'market_price', recipe,
});
const brickVersion = (kind: BrickKind, refId: string, at: string, supplierId: string | null, supplierName: string | null = null): BrickSnapshotPoint => ({
  id: `${kind}-${refId}-${at}`, kind, refId, name: refId, unitCost: 1, recipeUnit: null, supplierId, supplierName, marketPriceId: null, effectiveFrom: new Date(at), reason: 'market_price',
});
const ctx = (bricks: BrickSnapshotPoint[], leaves: SupplierShareContext['leaves'] = new Map()): SupplierShareContext => {
  const brickVersions = new Map<string, BrickSnapshotPoint[]>();
  for (const b of bricks) brickVersions.set(`${b.kind}:${b.refId}`, [...(brickVersions.get(`${b.kind}:${b.refId}`) ?? []), b]);
  return { brickVersions, leaves };
};
const costs = (series: Map<string, any>, key: string) => series.get(key)?.points.map((p: any) => [p.at.slice(0, 10), p.costPerPiece, !!p.inactive]);

describe('sharesAt', () => {
  it('Burger 2,40 dont 1,10 Metro : la part Metro vaut 1,10, la somme des parts vaut le coût', () => {
    const v = version('2026-03-01T00:00:00Z', [
      line('ingredient', 'steak', 1, 0.6), line('ingredient', 'bun', 1, 0.5), line('ingredient', 'sauce', 2, 0.15),
      line('packaging', 'box', 1, 0.2), line('component', 'cmp', 1, 0.8), line('combo', 'x', 1, 0),
    ], 2.4);
    const c = ctx([
      brickVersion('ingredient', 'steak', '2026-01-01T00:00:00Z', 'metro', 'Metro'),
      brickVersion('ingredient', 'bun', '2026-01-01T00:00:00Z', 'metro', 'Metro'),
      brickVersion('ingredient', 'sauce', '2026-01-01T00:00:00Z', 'bidfood', 'Bidfood'),
      brickVersion('packaging', 'box', '2026-01-01T00:00:00Z', null, 'Metro'),
      brickVersion('ingredient', 'tomato', '2026-01-01T00:00:00Z', 'bidfood', 'Bidfood'),
    ], new Map([['cmp', [{ ingredientId: 'tomato', share: 0.75 }, { ingredientId: null, share: 0.25 }]]]));
    const shares = sharesAt(v, from.getTime(), c);
    expect(shares.get('metro')!.amount).toBeCloseTo(1.1, 6);
    expect(shares.get('name:metro')!.amount).toBeCloseTo(0.2, 6);
    expect(shares.get('bidfood')!.amount).toBeCloseTo(0.3 + 0.6, 6);
    expect(shares.get(NO_SUPPLIER)!.amount).toBeCloseTo(0.2, 6);
    const total = [...shares.values()].reduce((s, x) => s + x.amount, 0);
    expect(total).toBeCloseTo(2.4, 6);
  });

  it('divise par le nombre de pièces et verse l écart de coût non couvert en part sans fournisseur', () => {
    const v = version('2026-03-01T00:00:00Z', [line('ingredient', 'a', 4, 1)], 1.5, 4);
    const shares = sharesAt(v, from.getTime(), ctx([brickVersion('ingredient', 'a', '2026-01-01T00:00:00Z', 's1')]));
    expect(shares.get('s1')!.amount).toBeCloseTo(1, 6);
    expect(shares.get(NO_SUPPLIER)!.amount).toBeCloseTo(0.5, 6);
  });

  it('composant sans composition connue : fournisseur du composant lui-même', () => {
    const v = version('2026-03-01T00:00:00Z', [line('component', 'cmp', 1, 2)], 2);
    const shares = sharesAt(v, from.getTime(), ctx([brickVersion('component', 'cmp', '2026-01-01T00:00:00Z', 's7')]));
    expect(shares.get('s7')!.amount).toBe(2);
  });
});

describe('buildSupplierShareSeries', () => {
  it('un ingrédient qui change de fournisseur : ancien avant la date, nouveau après, somme constante', () => {
    const versions = [version('2026-03-15T00:00:00Z', [line('ingredient', 'steak', 1, 1), line('ingredient', 'bun', 1, 0.5)], 1.5)];
    const c = ctx([
      brickVersion('ingredient', 'steak', '2026-03-01T00:00:00Z', 'metro', 'Metro'),
      brickVersion('ingredient', 'steak', '2026-05-10T00:00:00Z', 'sysco', 'Sysco'),
      brickVersion('ingredient', 'bun', '2026-03-01T00:00:00Z', 'metro', 'Metro'),
    ]);
    const series = buildSupplierShareSeries(versions, from, c);
    expect(costs(series, 'metro')).toEqual([['2026-04-01', 1.5, false], ['2026-05-10', 0.5, false]]);
    expect(costs(series, 'sysco')).toEqual([['2026-05-10', 1, false]]);
    expect(series.get('metro')!.points[0].carried).toBe(true);
    // À chaque instant la somme des parts (dont sans fournisseur) vaut le coût de l'article.
    for (const at of ['2026-04-01', '2026-05-10']) {
      const total = [...series.values()].reduce((s, x) => s + ([...x.points].reverse().find((p) => p.at.slice(0, 10) <= at && !p.inactive)?.costPerPiece ?? 0), 0);
      expect(total).toBeCloseTo(1.5, 6);
    }
  });

  it('un fournisseur abandonné reçoit un point inactif à 0 ; il sort de la moyenne mais pas de la somme', () => {
    const a = buildSupplierShareSeries(
      [version('2026-03-15T00:00:00Z', [line('ingredient', 'steak', 1, 1)], 1)], from,
      ctx([brickVersion('ingredient', 'steak', '2026-03-01T00:00:00Z', 'metro', 'Metro'), brickVersion('ingredient', 'steak', '2026-05-10T00:00:00Z', 'sysco', 'Sysco')]),
    );
    const b = buildSupplierShareSeries(
      [version('2026-03-15T00:00:00Z', [line('ingredient', 'steak', 1, 3)], 3)], from,
      ctx([brickVersion('ingredient', 'steak', '2026-03-01T00:00:00Z', 'metro', 'Metro')]),
    );
    expect(costs(a, 'metro')).toEqual([['2026-04-01', 1, false], ['2026-05-10', 0, true]]);
    const metro = [a.get('metro')!.points, b.get('metro')!.points];
    expect(averageStaircase(metro, 'avg').map((p) => [p.at.slice(0, 10), p.costPerPiece])).toEqual([['2026-04-01', 2], ['2026-05-10', 3]]);
    expect(averageStaircase(metro, 'sum').map((p) => [p.at.slice(0, 10), p.costPerPiece])).toEqual([['2026-04-01', 4], ['2026-05-10', 3]]);
    // Une moyenne dont tous les membres sont partis retombe à 0.
    expect(averageStaircase([a.get('metro')!.points], 'avg').map((p) => p.costPerPiece)).toEqual([1, 0]);
  });

  it('un changement de recette de l article pendant la période décale les parts', () => {
    const versions = [
      version('2026-03-15T00:00:00Z', [line('ingredient', 'a', 1, 1)], 1),
      version('2026-04-20T00:00:00Z', [line('ingredient', 'a', 1, 1), line('ingredient', 'b', 1, 2)], 3),
    ];
    const series = buildSupplierShareSeries(versions, from, ctx([
      brickVersion('ingredient', 'a', '2026-03-01T00:00:00Z', 's1'), brickVersion('ingredient', 'b', '2026-03-01T00:00:00Z', 's2'),
    ]));
    expect(costs(series, 's1')).toEqual([['2026-04-01', 1, false]]);
    expect(costs(series, 's2')).toEqual([['2026-04-20', 2, false]]);
  });

  it('fournisseur jamais utilisé : pas de série ; article sans version : rien', () => {
    expect(buildSupplierShareSeries([], from, ctx([])).size).toBe(0);
    const series = buildSupplierShareSeries([version('2026-03-15T00:00:00Z', [line('ingredient', 'a', 1, 1)], 1)], from, ctx([brickVersion('ingredient', 'a', '2026-03-01T00:00:00Z', 's1')]));
    expect([...series.keys()]).toEqual(['s1']);
  });

  it('première version de l article dans la période : pas de point avant elle', () => {
    const series = buildSupplierShareSeries([version('2026-05-01T00:00:00Z', [line('ingredient', 'a', 1, 1)], 1)], from, ctx([
      brickVersion('ingredient', 'a', '2026-04-10T00:00:00Z', 's1'), brickVersion('ingredient', 'a', '2026-06-01T00:00:00Z', 's2'),
    ]));
    expect(costs(series, 's1')).toEqual([['2026-05-01', 1, false], ['2026-06-01', 0, true]]);
    expect(costs(series, 's2')).toEqual([['2026-06-01', 1, false]]);
  });

  it('ingrédient d un composant : le fournisseur de l ingrédient change, la part suit', () => {
    const versions = [version('2026-03-15T00:00:00Z', [line('component', 'cmp', 1, 2)], 2)];
    const c = ctx([
      brickVersion('ingredient', 'i1', '2026-03-01T00:00:00Z', 'metro'), brickVersion('ingredient', 'i1', '2026-05-01T00:00:00Z', 'sysco'),
      brickVersion('ingredient', 'i2', '2026-03-01T00:00:00Z', 'metro'),
    ], new Map([['cmp', [{ ingredientId: 'i1', share: 0.5 }, { ingredientId: 'i2', share: 0.5 }]]]));
    const series = buildSupplierShareSeries(versions, from, c);
    expect(costs(series, 'metro')).toEqual([['2026-04-01', 2, false], ['2026-05-01', 1, false]]);
    expect(costs(series, 'sysco')).toEqual([['2026-05-01', 1, false]]);
  });
});
