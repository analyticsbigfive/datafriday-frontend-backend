import { storageRowSupplier } from '@/utils/restockStorageRowSupplier'

describe('storageRowSupplier', () => {
  const marketPrices = [
    { id: 'mp1', supplierId: 's1' },
    { id: 'mp2', supplierRel: { name: 'Socodis' } },
  ]
  const suppliers = [{ id: 's1', name: 'France Boisson' }]

  it('fournisseur par id du Market Price de la ligne', () => {
    expect(storageRowSupplier({ marketPriceId: 'mp1' }, { marketPrices, suppliers })).toEqual({
      supplierName: 'France Boisson',
      marketPriceRow: marketPrices[0],
    })
  })
  it('repli sur la relation du Market Price', () => {
    expect(storageRowSupplier({ marketPriceId: 'mp2' }, { marketPrices, suppliers }).supplierName).toBe('Socodis')
  })
  it('ligne sans Market Price : rien', () => {
    expect(storageRowSupplier({ name: 'x' }, { marketPrices, suppliers })).toEqual({ supplierName: '', marketPriceRow: null })
  })
})
