import { marketPricePackSize, packSizeMissing } from '@/utils/marketPricePackSize'

describe('marketPricePackSize', () => {
  it('prend inventoryQuantityPackaged quand il existe', () => {
    expect(marketPricePackSize({ inventoryQuantityPackaged: 12, packedUnits: 6, unitsPerPurchase: 24 })).toBe(12)
  })

  it('prend packedUnits quand il est superieur a 1', () => {
    expect(marketPricePackSize({ packedUnits: 30 })).toBe(30)
  })

  it('packedUnits 30 prime sur unitsPerPurchase 20 meme type', () => {
    expect(marketPricePackSize({
      inventoryPackaging: 'Carton', purchasePackaging: 'Carton', packedUnits: 30, unitsPerPurchase: 20,
    })).toBe(30)
  })

  it('exemple Coca-Cola Sans Sucre CAN 33CL : 24 et non 1', () => {
    expect(marketPricePackSize({
      itemName: 'Coca-Cola Sans Sucre CAN 33CL',
      inventoryPackaging: 'Carton', purchasePackaging: 'Carton', packedUnits: 1, unitsPerPurchase: 24,
    })).toBe(24)
  })

  it('packedUnits vide ou 0 avec meme type : unitsPerPurchase', () => {
    expect(marketPricePackSize({ inventoryPackaging: 'Carton', purchasePackaging: 'Carton', unitsPerPurchase: 24 })).toBe(24)
    expect(marketPricePackSize({ inventoryPackaging: 'Carton', purchasePackaging: 'Carton', packedUnits: 0, unitsPerPurchase: 24 })).toBe(24)
  })

  it('compare les types sans casse ni espaces', () => {
    expect(marketPricePackSize({ inventoryPackaging: ' carton ', purchasePackaging: 'CARTON', packedUnits: 1, unitsPerPurchase: 6 })).toBe(6)
  })

  it('types differents (Sachet / Box) : packedUnits 1 est conserve, sinon inconnue', () => {
    expect(marketPricePackSize({ inventoryPackaging: 'Sachet', purchasePackaging: 'Box', packedUnits: 1, unitsPerPurchase: 24 })).toBe(1)
    expect(marketPricePackSize({ inventoryPackaging: 'Sachet', purchasePackaging: 'Box', packedUnits: 0, unitsPerPurchase: 24 })).toBeNull()
  })

  it('types vides : unitsPerPurchase ignore', () => {
    expect(marketPricePackSize({ packedUnits: 0, unitsPerPurchase: 24 })).toBeNull()
  })

  it('packedUnits 1 sans unitsPerPurchase utile : 1', () => {
    expect(marketPricePackSize({ inventoryPackaging: 'Carton', purchasePackaging: 'Carton', packedUnits: 1, unitsPerPurchase: 1 })).toBe(1)
  })

  it('rien de renseigne ou Market Price absent : null', () => {
    expect(marketPricePackSize({})).toBeNull()
    expect(marketPricePackSize(null)).toBeNull()
    expect(marketPricePackSize(undefined)).toBeNull()
  })
})

describe('packSizeMissing', () => {
  it('type sans aucune contenance : alerte', () => {
    expect(packSizeMissing({ inventoryPackaging: 'Carton', purchasePackaging: 'Box' })).toBe(true)
  })
  it('contenance connue (stockage ou achat de même type) : pas d alerte', () => {
    expect(packSizeMissing({ inventoryPackaging: 'Carton', packedUnits: 24 })).toBe(false)
    expect(packSizeMissing({ inventoryPackaging: 'Carton', purchasePackaging: 'Carton', unitsPerPurchase: 24 })).toBe(false)
  })
  it('sans type de conditionnement ou Market Price absent : pas d alerte', () => {
    expect(packSizeMissing({ unit: 'kg' })).toBe(false)
    expect(packSizeMissing(null)).toBe(false)
  })
})
