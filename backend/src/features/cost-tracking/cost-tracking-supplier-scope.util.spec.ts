import { collectSupplierScope, componentIdsOf, leafIngredientIds, supplierOptionsOf } from './cost-tracking-supplier-scope.util';
import { BrickKind, BrickSnapshotPoint, RecipeLine } from './cost-tracking.types';

const line = (kind: RecipeLine['kind'], refId: string): RecipeLine => ({ kind, refId, name: refId, quantity: 1, unitCost: 1 });
const v = (kind: BrickKind, refId: string, at: string, supplierId: string | null, supplierName: string | null = null): BrickSnapshotPoint => ({
  id: `${kind}-${refId}-${at}`, kind, refId, name: refId, unitCost: 1, recipeUnit: null, supplierId, supplierName, marketPriceId: null, effectiveFrom: new Date(at), reason: 'x',
});

describe('collectSupplierScope', () => {
  const recipes = new Map([
    ['m1', [line('ingredient', 'i1'), line('component', 'c1')]],
    ['m2', [line('component', 'c2'), line('combo', 'x')]],
  ]);
  const leaves = new Map([['c1', [{ ingredientId: 'i9', share: 1 }]]]);
  const versions = new Map([
    ['ingredient:i1', [v('ingredient', 'i1', '2026-03-01T00:00:00Z', 'a', 'Ancien'), v('ingredient', 'i1', '2026-05-01T00:00:00Z', 'b', 'Nouveau')]],
    ['ingredient:i9', [v('ingredient', 'i9', '2026-03-01T00:00:00Z', null, 'Metro ')]],
    ['component:c1', [v('component', 'c1', '2026-03-01T00:00:00Z', 'ignored')]],
    ['component:c2', [v('component', 'c2', '2026-03-01T00:00:00Z', 'own', 'Maison')]],
  ]);

  it('retient tous les fournisseurs de la période, ingrédients de composants compris', () => {
    const scope = collectSupplierScope(recipes, versions, leaves);
    expect([...scope.keys()].sort()).toEqual(['a', 'b', 'name:metro', 'own']);
    expect([...scope.get('a')!.articleIds]).toEqual(['m1']);
    expect([...scope.get('name:metro')!.brickKeys].sort()).toEqual(['component:c1', 'ingredient:i9']);
    expect([...scope.get('own')!.articleIds]).toEqual(['m2']);
    expect(scope.has('ignored')).toBe(false);
  });

  it('liste déroulante triée par nom', () => {
    const options = supplierOptionsOf(collectSupplierScope(recipes, versions, leaves));
    expect(options.map((o) => o.name)).toEqual(['Ancien', 'Maison', 'Metro ', 'Nouveau']);
  });

  it('identifiants de composants et d ingrédients porteurs', () => {
    expect(componentIdsOf(recipes).sort()).toEqual(['c1', 'c2']);
    expect(leafIngredientIds(leaves)).toEqual(['i9']);
  });
});
