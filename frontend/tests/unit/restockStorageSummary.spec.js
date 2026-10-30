import {
  buildStorageSummary,
  orderAmount,
  unitPriceOfMarketPrice,
  pdvCounts,
  stockCounts,
} from '@/utils/restockStorageSummary'

const mps = {
  fut: { id: 'mp1', itemName: '1664 - 30L', pricePerUnit: 3, purchaseUnitConversion: 1, image: 'data:img' },
  sac: { id: 'mp2', itemName: 'Bun Burger', price: 20, unitsPerPurchase: 40, purchaseUnitConversion: 1 },
  nu: { id: 'mp3', itemName: 'Sans prix' },
}
const row = (itemKey, itemName, extra = {}) => ({ itemKey, itemName, unit: 'L', shopCount: 3, ...extra })
const base = (over = {}) => ({
  rows: [row('a', '1664 - 30L'), row('b', 'Bun Burger'), row('c', 'Sans prix')],
  orderByItem: { a: 60, b: 8, c: 5 },
  excluded: {},
  marketPriceFor: (r) => ({ a: mps.fut, b: mps.sac, c: mps.nu })[r.itemKey],
  packagingFor: () => null,
  buyLabel: (r) => `lbl-${r.itemKey}`,
  ...over,
})

describe('unitPriceOfMarketPrice', () => {
  it('lit pricePerUnit, sinon price / unitsPerPurchase, sinon null', () => {
    expect(unitPriceOfMarketPrice(mps.fut)).toBe(3)
    expect(unitPriceOfMarketPrice(mps.sac)).toBe(0.5)
    expect(unitPriceOfMarketPrice(mps.nu)).toBeNull()
    expect(unitPriceOfMarketPrice(null)).toBeNull()
  })
})

describe('orderAmount', () => {
  it('avec colis : colis entiers x unités par colis x prix unitaire', () => {
    // 4 fûts de 30 L a 3 EUR/L = 360 (les 100 L demandés ne comptent pas)
    expect(orderAmount(100, mps.fut, { packedCount: 4, packagingUnitNumber: 30 })).toBe(360)
  })
  it('sans colis : quantité x conversion x prix unitaire', () => {
    expect(orderAmount(60, mps.fut, null)).toBe(180)
    expect(orderAmount(10, { pricePerUnit: 2, purchaseUnitConversion: 0.5 }, null)).toBe(10)
  })
  it('sans prix ou sans quantité : 0', () => {
    expect(orderAmount(5, mps.nu, null)).toBe(0)
    expect(orderAmount(5, null, null)).toBe(0)
    expect(orderAmount(0, mps.fut, null)).toBe(0)
  })
})

describe('buildStorageSummary', () => {
  it('somme les montants, trie par montant décroissant, article sans prix à 0', () => {
    const s = buildStorageSummary(base())
    expect(s.total).toBe(184)
    expect(s.lines.map((l) => l.itemKey)).toEqual(['a', 'b', 'c'])
    expect(s.lines[2].amount).toBe(0)
    expect(s.lines[0].image).toBe('data:img')
    expect(s.lines[1].image).toBe('')
    expect(s.lines[0].quantityLabel).toBe('lbl-a')
    expect(s.selectedCount).toBe(3)
    expect(s.totalCount).toBe(3)
  })
  it('utilise le colis quand il existe', () => {
    const s = buildStorageSummary(base({
      packagingFor: (r) => (r.itemKey === 'a' ? { packedCount: 2, packagingUnitNumber: 30 } : null),
    }))
    expect(s.lines.find((l) => l.itemKey === 'a').amount).toBe(180)
  })
  it('exclut un article décoché du montant, de la liste et du compte X', () => {
    const s = buildStorageSummary(base({ excluded: { a: true } }))
    expect(s.lines.map((l) => l.itemKey)).toEqual(['b', 'c'])
    expect(s.total).toBe(4)
    expect(s.selectedCount).toBe(2)
    expect(s.totalCount).toBe(3)
  })
  it('exclut une quantité à commander nulle ou absente', () => {
    const s = buildStorageSummary(base({ orderByItem: { a: 0, b: 8 } }))
    expect(s.lines.map((l) => l.itemKey)).toEqual(['b'])
  })
  it('ne casse pas sans données', () => {
    expect(buildStorageSummary()).toEqual({ total: 0, selectedCount: 0, totalCount: 0, lines: [] })
  })
})

describe('pdvCounts', () => {
  it('a = PDV avec quantité à déposer, b = PDV de l article', () => {
    const shopRows = [
      { shopId: 's1', restockQuantity: 2 },
      { shopId: 's2', restockQuantity: 0 },
      { shopId: 's3', restockQuantity: 1 },
    ]
    expect(pdvCounts({ shopCount: 3 }, shopRows)).toEqual({ a: 2, b: 3 })
  })
  it('plan figé (shopCount 0) : b inconnu', () => {
    expect(pdvCounts({ shopCount: 0 }, [{ shopId: 's1', restockQuantity: 1 }])).toEqual({ a: 1, b: null })
  })
  it('aucune donnée : null', () => {
    expect(pdvCounts({ shopCount: 0 }, [])).toBeNull()
  })
})

describe('stockCounts', () => {
  const storageRows = [
    { elementId: 'e1', name: 'Bun Burger', marketPriceId: 'mp2', required: 4 },
    { elementId: 'e2', name: 'bun burger', marketPriceId: null, required: 0 },
    { elementId: 'e3', name: 'Autre', marketPriceId: 'mpX', required: 9 },
  ]
  it('c/d par id Market Price ou nom normalisé', () => {
    expect(stockCounts(mps.sac, row('b', 'Bun Burger'), storageRows)).toEqual({ c: 1, d: 2 })
  })
  it('aucun stockage : null', () => {
    expect(stockCounts(mps.fut, row('a', '1664 - 30L'), storageRows)).toBeNull()
  })
})
