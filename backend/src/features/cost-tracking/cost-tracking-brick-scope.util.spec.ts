import {
  articlesUsing, articlesWithComponent, collectRecipeBricks, normalizeSupplierName, resolveBricks, supplierKeyOf,
} from './cost-tracking-brick-scope.util';
import { BrickSnapshotPoint, RecipeLine } from './cost-tracking.types';

const line = (kind: RecipeLine['kind'], refId: string, name: string | null = refId): RecipeLine => ({ kind, refId, name, quantity: 1, unitCost: 1 });
const version = (refId: string, at: string, supplierId: string | null, supplierName: string | null): BrickSnapshotPoint => ({
  id: `${refId}-${at}`, kind: 'ingredient', refId, name: refId, unitCost: 1, recipeUnit: 'kg', supplierId, supplierName, marketPriceId: null,
  effectiveFrom: new Date(at), reason: 'market_price',
});

describe('supplierKeyOf', () => {
  it('préfère l\'id, sinon le nom normalisé, sinon null', () => {
    expect(supplierKeyOf('s1', 'Metro')).toBe('s1');
    expect(supplierKeyOf(null, '  Métro   Cash ')).toBe('name:metro cash');
    expect(supplierKeyOf(null, null)).toBeNull();
    expect(supplierKeyOf(null, '  ')).toBeNull();
  });
  it('normalise accents, casse et espaces', () => {
    expect(normalizeSupplierName('  ÉPICERIE  du Sud ')).toBe('epicerie du sud');
  });
});

describe('collectRecipeBricks', () => {
  it('déduplique, rattache les articles et ignore les combos', () => {
    const recipes = new Map<string, RecipeLine[]>([
      ['m1', [line('ingredient', 'i1', 'Steak'), line('component', 'c1'), line('combo', 'm9')]],
      ['m2', [line('ingredient', 'i1', 'Steak'), line('packaging', 'p1')]],
    ]);
    const bricks = collectRecipeBricks(recipes);
    expect([...bricks.keys()].sort()).toEqual(['component:c1', 'ingredient:i1', 'packaging:p1']);
    expect(bricks.get('ingredient:i1')?.articleIds).toEqual(['m1', 'm2']);
  });
});

describe('articlesWithComponent', () => {
  it('ne reconnaît que les lignes composant', () => {
    const recipes = new Map<string, RecipeLine[]>([
      ['m1', [line('component', 'c1')]],
      ['m2', [line('ingredient', 'c1')]],
    ]);
    expect([...articlesWithComponent(recipes, 'c1')]).toEqual(['m1']);
  });
});

describe('resolveBricks / articlesUsing', () => {
  const bricks = collectRecipeBricks(new Map([['m1', [line('ingredient', 'i1'), line('ingredient', 'i2'), line('ingredient', 'i3')]], ['m2', [line('ingredient', 'i3')]]]));
  const versions = new Map([
    ['ingredient:i1', [version('i1', '2026-09-01T00:00:00Z', 's1', 'Metro'), version('i1', '2026-10-01T00:00:00Z', 's2', 'Promocash')]],
    ['ingredient:i2', [version('i2', '2026-09-01T00:00:00Z', null, 'Promocash ')]],
  ]);

  it('retient le fournisseur de la dernière version', () => {
    const resolved = resolveBricks(bricks.values(), versions);
    expect(resolved.map((b) => b.supplierKey)).toEqual(['s2', 'name:promocash', null]);
  });

  it('articlesUsing garde l\'ordre des articles', () => {
    const arts = [{ id: 'm2' }, { id: 'm1' }, { id: 'm3' }] as any[];
    expect(articlesUsing(arts, [bricks.get('ingredient:i3')!]).map((a) => a.id)).toEqual(['m2', 'm1']);
    expect(articlesUsing(arts, [bricks.get('ingredient:i1')!]).map((a) => a.id)).toEqual(['m1']);
  });
});
