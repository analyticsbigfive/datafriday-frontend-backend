import { findPurchaseFor, pickSpaceHomonym } from '@/utils/storageRefillSupplier'

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
})
