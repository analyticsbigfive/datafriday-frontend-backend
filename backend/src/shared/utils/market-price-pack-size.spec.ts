import { marketPricePackSize } from './market-price-pack-size';

describe('marketPricePackSize', () => {
  it('Coca-Cola reel : Carton/Carton, packedUnits=1, unitsPerPurchase=24 donne 24', () => {
    expect(
      marketPricePackSize({ inventoryPackaging: 'Carton', purchasePackaging: 'Carton', packedUnits: 1, unitsPerPurchase: 24 }),
    ).toBe(24);
  });

  it('packedUnits=30 prime sur unitsPerPurchase=20 meme type', () => {
    expect(
      marketPricePackSize({ inventoryPackaging: 'Box', purchasePackaging: 'Box', packedUnits: 30, unitsPerPurchase: 20 }),
    ).toBe(30);
  });

  it('types differents (Sachet/Box) sans packedUnits donne null', () => {
    expect(
      marketPricePackSize({ inventoryPackaging: 'Sachet', purchasePackaging: 'Box', packedUnits: null, unitsPerPurchase: 12 }),
    ).toBeNull();
  });

  it('packedUnits=1 sans unitsPerPurchase donne 1', () => {
    expect(marketPricePackSize({ packedUnits: 1 })).toBe(1);
  });

  it('tout vide ou 0 donne null', () => {
    expect(marketPricePackSize({})).toBeNull();
    expect(marketPricePackSize({ packedUnits: 0, unitsPerPurchase: 0 })).toBeNull();
    expect(marketPricePackSize(null)).toBeNull();
  });

  it('ignore la casse et les espaces des types', () => {
    expect(
      marketPricePackSize({ inventoryPackaging: ' Carton ', purchasePackaging: 'carton', packedUnits: 0, unitsPerPurchase: 6 }),
    ).toBe(6);
  });

  it('types vides ne comptent pas comme identiques', () => {
    expect(marketPricePackSize({ inventoryPackaging: '', purchasePackaging: '', packedUnits: null, unitsPerPurchase: 6 })).toBeNull();
  });
});
