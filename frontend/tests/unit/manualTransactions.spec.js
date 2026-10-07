import { manualTransactions } from '@/utils/manualTransactions'

describe('manualTransactions (quantités manuelles « Sans ventes prévues », Bertrand 2026-10-07)', () => {
  it('ratio transactions / unités du PDV appliqué à chaque unité manuelle', () => {
    const ratios = new Map([['shop-a', 0.8]])
    expect(manualTransactions([{ shopId: 'shop-a', totalQuantity: 10 }], ratios)).toBe(8)
  })

  it('PDV sans prévision ou ratio inconnu : 1 transaction par unité', () => {
    expect(manualTransactions([{ shopId: 'shop-b', totalQuantity: 10 }], new Map())).toBe(10)
    expect(manualTransactions([{ shopId: 'shop-b', totalQuantity: 10 }], null)).toBe(10)
  })

  it('quantité nulle ou absente : rien', () => {
    expect(manualTransactions([{ shopId: 'shop-a', totalQuantity: 0 }], new Map())).toBe(0)
    expect(manualTransactions([], new Map())).toBe(0)
  })
})
