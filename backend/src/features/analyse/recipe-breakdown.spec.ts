import { ComponentNode, comboWeights, industrialSharesOf, recipeCostParts, supplierCostsPerUnit } from './recipe-breakdown';

const p = (supplierId: string | null, industrialId: string | null, name = supplierId) => ({ supplierId, supplierName: name, industrialId });

describe('recipe-breakdown', () => {
  it('ventile un composant sur ses ingrédients au prorata du coût', () => {
    const components = new Map<string, ComponentNode>([
      ['c1', { unitCost: 10, children: [], ingredients: [
        { quantity: 1, ingredient: { costPerRecipeUnit: 3, partner: p('s1', 'i1') } },
        { quantity: 1, ingredient: { costPerRecipeUnit: 1, partner: p('s2', null) } },
      ] }],
    ]);
    const parts = recipeCostParts({ ingredients: [], packagings: [], components: [{ numberOfUnits: 2, componentId: 'c1' }] }, components);
    expect(parts.map((x) => x.amount)).toEqual([15, 5]);
  });

  it('coût fournisseur par unité vendue, divisé par la taille du lot', () => {
    const parts = [
      { amount: 6, partner: p('s1', null, 'Sysco') },
      { amount: 2, partner: p(null, null, 'Texte libre') },
      { amount: 1, partner: null },
      { amount: 0, partner: p('s3', null) },
    ];
    expect(supplierCostsPerUnit(parts, 2)).toEqual([
      { supplierId: 's1', name: 'Sysco', unitCost: 3 },
      { supplierId: null, name: 'Texte libre', unitCost: 1 },
      { supplierId: null, name: null, unitCost: 0.5 },
    ]);
  });

  it('parts industriel au prorata du coût, vide sans industriel, égal si coûts nuls', () => {
    expect(industrialSharesOf([{ amount: 3, partner: p('s', 'i1') }, { amount: 1, partner: p('s', 'i2') }, { amount: 5, partner: p('s', null) }]))
      .toEqual([{ industrialId: 'i1', share: 0.75 }, { industrialId: 'i2', share: 0.25 }]);
    expect(industrialSharesOf([{ amount: 5, partner: p('s', null) }])).toEqual([]);
    expect(industrialSharesOf([{ amount: 0, partner: p('s', 'i1') }, { amount: 0, partner: p('s', 'i2') }]).map((s) => s.share)).toEqual([0.5, 0.5]);
  });

  it('poids de combo au prorata des prix, repli sur les quantités', () => {
    expect(comboWeights([{ menuItemId: 'a', quantity: 1, price: 6 }, { menuItemId: 'b', quantity: 1, price: 2 }]))
      .toEqual([{ menuItemId: 'a', weight: 0.75 }, { menuItemId: 'b', weight: 0.25 }]);
    expect(comboWeights([{ menuItemId: 'a', quantity: 3, price: 0 }, { menuItemId: 'b', quantity: 1, price: 0 }]).map((w) => w.weight)).toEqual([0.75, 0.25]);
  });

  it('un cycle de composants ne boucle pas', () => {
    const components = new Map<string, ComponentNode>([
      ['a', { unitCost: 1, ingredients: [], children: [{ quantity: 1, childId: 'b' }] }],
      ['b', { unitCost: 1, ingredients: [], children: [{ quantity: 1, childId: 'a' }] }],
    ]);
    expect(() => recipeCostParts({ ingredients: [], packagings: [], components: [{ numberOfUnits: 1, componentId: 'a' }] }, components)).not.toThrow();
  });
});
