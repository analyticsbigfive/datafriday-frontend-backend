import { isKitchenMade, resolveKitchenGroup } from '@/utils/finishedItemKitchenGroup'

const labels = { local: 'Cuisine locale', undefined: 'Cuisine non définie' }
const kitchens = [{ id: 'k1', name: 'Cuisine Centrale', email: 'cc@x.fr', tel: '0102' }]

describe('finishedItemKitchenGroup', () => {
  it('un Menu Item non prêt à la vente n est pas fabriqué en cuisine', () => {
    expect(isKitchenMade({ readyForSale: 'No' }, false)).toBe(false)
    expect(isKitchenMade(null, false)).toBe(false)
  })

  it('un composant ou un Menu Item Yes est fabriqué en cuisine', () => {
    expect(isKitchenMade({}, true)).toBe(true)
    expect(isKitchenMade({ readyForSale: 'Yes' }, false)).toBe(true)
  })

  it('Menu Item Yes relié à une cuisine centrale : groupe cuisine avec contacts', () => {
    const g = resolveKitchenGroup({ readyForSale: 'Yes', kitchenType: 'Central', kitchenId: 'k1' }, false, kitchens, labels)
    expect(g).toEqual({
      supplierId: '__kitchen_k1__',
      supplierName: 'Cuisine Centrale',
      supplierEmail: 'cc@x.fr',
      supplierPhone: '0102',
    })
  })

  it('cuisine locale : sans contacts', () => {
    const g = resolveKitchenGroup({ readyForSale: 'Yes', kitchenType: 'Local' }, false, kitchens, labels)
    expect(g.supplierName).toBe('Cuisine locale')
    expect(g.supplierEmail).toBe('')
  })

  it('Menu Item Yes sans cuisine : Cuisine non définie', () => {
    const g = resolveKitchenGroup({ readyForSale: 'Yes' }, false, kitchens, labels)
    expect(g.supplierId).toBe('__kitchen_undefined__')
    expect(g.supplierName).toBe('Cuisine non définie')
  })

  it('article non fabriqué en cuisine : null', () => {
    expect(resolveKitchenGroup({ readyForSale: 'No' }, false, kitchens, labels)).toBeNull()
  })
})
