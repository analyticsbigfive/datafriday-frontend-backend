import { ComponentNode } from '../analyse/recipe-breakdown';
import { componentLeaves } from './cost-tracking-component-leaves.util';

const ing = (id: string, quantity: number, costPerRecipeUnit: number) => ({ quantity, ingredient: { costPerRecipeUnit, partner: { supplierId: id, supplierName: null, industrialId: null } } });

describe('componentLeaves', () => {
  it('répartit au prorata du coût, sous-composants dépliés, parts qui somment à 1', () => {
    const nodes = new Map<string, ComponentNode>([
      ['parent', { unitCost: 4, ingredients: [ing('i1', 1, 1)], children: [{ quantity: 1, childId: 'child' }] }],
      ['child', { unitCost: 3, ingredients: [ing('i2', 1, 1), ing('i1', 1, 2)], children: [] }],
    ]);
    const leaves = componentLeaves('parent', nodes);
    const byId = Object.fromEntries(leaves.map((l) => [l.ingredientId, l.share]));
    expect(byId.i1).toBeCloseTo(1 / 4 + (3 / 4) * (2 / 3), 6);
    expect(byId.i2).toBeCloseTo((3 / 4) * (1 / 3), 6);
    expect(leaves.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 6);
  });

  it('composant inconnu : une part sans ingrédient', () => {
    expect(componentLeaves('zz', new Map())).toEqual([{ ingredientId: null, share: 1 }]);
  });
});
