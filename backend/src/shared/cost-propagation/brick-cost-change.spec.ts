import { hasBrickCostChange } from './brick-cost-change';

describe('hasBrickCostChange', () => {
  const before = { costPerRecipeUnit: '1.5000', costPerPurchaseUnit: null, storageType: ['frozen'], name: 'A' };

  it('ignore un champ sans effet coût', () => {
    expect(hasBrickCostChange(before, { name: 'B' })).toBe(false);
  });
  it('ignore une valeur identique (Decimal contre nombre)', () => {
    expect(hasBrickCostChange(before, { costPerRecipeUnit: 1.5, storageType: ['frozen'] })).toBe(false);
  });
  it('détecte un coût modifié', () => {
    expect(hasBrickCostChange(before, { costPerRecipeUnit: 2 })).toBe(true);
  });
  it('détecte un champ renseigné alors qu il était vide', () => {
    expect(hasBrickCostChange(before, { costPerPurchaseUnit: 10 })).toBe(true);
  });
  it('détecte un type de stockage modifié', () => {
    expect(hasBrickCostChange(before, { storageType: ['ambient'] })).toBe(true);
  });
});
