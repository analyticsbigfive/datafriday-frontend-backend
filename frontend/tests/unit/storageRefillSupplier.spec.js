import { findPurchaseFor, pickSpaceHomonym, pickStorageMarketPrice } from '@/utils/storageRefillSupplier'

describe('storageRefillSupplier', () => {
  const groups = [
    { supplierId: '__finished__', supplierName: 'Sans fournisseur', items: [{ itemName: 'Coca-Cola Cherry - CAN 33CL' }] },
    { supplierId: 'loire', supplierName: 'France boisson Loire', items: [{ itemId: 'ing-loire', itemName: 'Coca-Cola Cherry - CAN 33CL' }] },
  ]

  it('le remplissage du stockage suit l’achat PDV du même article (hors groupe technique)', () => {
    expect(findPurchaseFor(groups, { itemName: 'coca-cola cherry - can 33cl' }).group.supplierId).toBe('loire')
    expect(findPurchaseFor(groups, { itemId: 'ing-loire', itemName: 'autre nom' }).group.supplierId).toBe('loire')
    expect(findPurchaseFor(groups, { itemName: 'Fanta' })).toBeNull()
  })

  describe('pickSpaceHomonym', () => {
    const ingredients = [
      { id: 'ing-none', name: 'Coca-Cola Cherry - CAN 33CL', marketPriceId: 'mp-none' },
      { id: 'ing-idf', name: 'Coca-Cola Cherry - CAN 33CL', marketPriceId: 'mp-idf' },
      { id: 'ing-loire', name: 'Coca-Cola Cherry - CAN 33CL', marketPriceId: 'mp-loire' },
    ]
    const marketPrices = [{ id: 'mp-none' }, { id: 'mp-idf', supplierId: 'idf' }, { id: 'mp-loire', supplierId: 'loire' }]

    it('retient l’homonyme livré dans l’espace', () => {
      expect(pickSpaceHomonym({ itemName: 'Coca-Cola Cherry - CAN 33CL', ingredients, marketPrices, spaceSupplierIds: new Set(['loire']) })).toBe('ing-loire')
    })

    it('rien à départager : nom unique, espace inconnu ou aucun homonyme livré', () => {
      expect(pickSpaceHomonym({ itemName: 'Coca-Cola Cherry - CAN 33CL', ingredients: ingredients.slice(0, 1), marketPrices, spaceSupplierIds: new Set(['loire']) })).toBeNull()
      expect(pickSpaceHomonym({ itemName: 'Coca-Cola Cherry - CAN 33CL', ingredients, marketPrices, spaceSupplierIds: null })).toBeNull()
      expect(pickSpaceHomonym({ itemName: 'Coca-Cola Cherry - CAN 33CL', ingredients, marketPrices, spaceSupplierIds: new Set(['socodis']) })).toBeNull()
    })
  })

  describe('pickStorageMarketPrice', () => {
    const marketPrices = [
      { id: 'mp-a', itemName: 'Agitateur bois', supplierId: '' },
      { id: 'mp-b', itemName: 'Agitateur bois', supplierId: 'nanterre' },
      { id: 'mp-c', itemName: 'Agitateur bois', supplierId: 'episaveurs' },
    ]

    it('l’id de la ligne l’emporte sur les homonymes', () => {
      expect(pickStorageMarketPrice({ marketPriceId: 'mp-c', itemName: 'Agitateur bois', marketPrices, spaceSupplierIds: null }).id).toBe('mp-c')
    })

    it('par nom : homonyme livré dans l’espace, sinon premier avec fournisseur lié', () => {
      expect(pickStorageMarketPrice({ itemName: 'agitateur bois', marketPrices, spaceSupplierIds: new Set(['episaveurs']) }).id).toBe('mp-c')
      expect(pickStorageMarketPrice({ itemName: 'Agitateur bois', marketPrices, spaceSupplierIds: null }).id).toBe('mp-b')
    })

    it('null si aucun Market Price ne correspond', () => {
      expect(pickStorageMarketPrice({ itemName: 'Fanta', marketPrices, spaceSupplierIds: null })).toBeNull()
    })
  })
})
