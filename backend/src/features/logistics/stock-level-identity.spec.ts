import { canAdoptStockLevelByName } from './stock-level-identity';

describe('canAdoptStockLevelByName (ADR-0006, ligne de stock trouvée par nom)', () => {
  const mp = (id: string) => ({ itemKind: 'marketPrice', itemRefId: id });

  it('identité inconnue : repli historique, la ligne de même nom est adoptée', () => {
    expect(canAdoptStockLevelByName(mp('mp-old'), null)).toBe(true);
  });

  it('ligne legacy sans identité : adoptée (auto-guérison)', () => {
    expect(canAdoptStockLevelByName({ itemKind: null, itemRefId: null }, mp('mp-new'))).toBe(true);
  });

  it('même identité : adoptée', () => {
    expect(canAdoptStockLevelByName(mp('mp-1'), mp('mp-1'))).toBe(true);
  });

  it('variante de prix : deux MarketPrice de même nom sont le même produit (Nantes-Montpellier F, Coca-Cola Cherry - CAN 33CL)', () => {
    expect(
      canAdoptStockLevelByName(mp('cms96cgtt00qvom05vq73vpvn'), mp('cmsu2ud5n07cygpkznpz6dojm')),
    ).toBe(true);
  });

  it('vrai homonyme entre tables (MenuItem vs MarketPrice de même nom) : jamais adopté', () => {
    expect(
      canAdoptStockLevelByName({ itemKind: 'menuItem', itemRefId: 'mi-coca' }, mp('mp-coca')),
    ).toBe(false);
    expect(
      canAdoptStockLevelByName(mp('mp-coca'), { itemKind: 'ingredient', itemRefId: 'ing-coca' }),
    ).toBe(false);
  });
});
