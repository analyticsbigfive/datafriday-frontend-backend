import { marginPercent, rowSaleValue, summarizeSaleValue } from '@/utils/inventorySaleValue'

const shop = (itemId, totalUnits, cost) => ({ shopId: 's1', itemId, totalUnits, cost })
const row = (itemName, shops) => ({ itemName, shops, totalUnits: shops.reduce((a, s) => a + s.totalUnits, 0) })

// Prix HT unitaire : A = 10, B = 4 ; C sans prix.
const prices = { a1: 10, a2: 10, b1: 4 }

describe('marginPercent', () => {
  it('suit la formule (HT - coût) / HT', () => {
    expect(marginPercent(100, 40)).toBe(60)
  })
  it('null si HT absent ou <= 0', () => {
    expect(marginPercent(0, 10)).toBeNull()
    expect(marginPercent(null, 10)).toBeNull()
  })
})

describe('rowSaleValue', () => {
  it('ligne avec prix : valeur HT et marge', () => {
    const r = rowSaleValue(row('A', [shop('a1', 5, 20)]), prices)
    expect(r.ht).toBe(50)
    expect(r.margin).toBe(60)
  })
  it('somme les PdV d un même article (ids différents)', () => {
    const r = rowSaleValue(row('A', [shop('a1', 5, 20), shop('a2', 5, 20)]), prices)
    expect(r.ht).toBe(100)
    expect(r.margin).toBe(60)
  })
  it('ligne sans prix : ht et marge null, jamais 0', () => {
    const r = rowSaleValue(row('C', [shop('c1', 3, 9)]), prices)
    expect(r.ht).toBeNull()
    expect(r.margin).toBeNull()
    expect(r.hasUnits).toBe(true)
  })
  it('prix présent mais coût inconnu : HT valorisé, marge null', () => {
    const r = rowSaleValue(row('A', [shop('a1', 2, null)]), prices)
    expect(r.ht).toBe(20)
    expect(r.margin).toBeNull()
  })
})

describe('summarizeSaleValue', () => {
  const rows = [
    row('A', [shop('a1', 5, 20)]), // HT 50, coût 20
    row('B', [shop('b1', 10, 30)]), // HT 40, coût 30
    row('C', [shop('c1', 3, 100)]), // sans prix
    row('D', [shop('d1', 0, null)]), // rien compté
  ]

  it('totaux sur le périmètre : marge sur les seules lignes avec prix', () => {
    const s = summarizeSaleValue(rows, prices)
    expect(s.totalHt).toBe(90)
    // (90 - 50) / 90, le coût de C (100) n'entre pas dans la marge.
    expect(s.margin).toBeCloseTo((40 / 90) * 100, 6)
    expect(s.unpricedCount).toBe(1)
  })

  it('suit la liste filtrée passée en entrée', () => {
    const s = summarizeSaleValue(rows.slice(0, 1), prices)
    expect(s.totalHt).toBe(50)
    expect(s.margin).toBe(60)
    expect(s.unpricedCount).toBe(0)
  })

  it('la sélection d articles restreint le périmètre', () => {
    const s = summarizeSaleValue(rows, prices, ['B'])
    expect(s.totalHt).toBe(40)
    expect(s.margin).toBe(25)
  })

  it('une sélection obsolète est ignorée (liste entière)', () => {
    expect(summarizeSaleValue(rows, prices, ['Z']).totalHt).toBe(90)
  })

  it('tout sans prix : null partout', () => {
    const s = summarizeSaleValue([rows[2]], prices)
    expect(s.totalHt).toBeNull()
    expect(s.margin).toBeNull()
    expect(s.unpricedCount).toBe(1)
  })

  it('map vide : aucun prix', () => {
    expect(summarizeSaleValue(rows, {}).totalHt).toBeNull()
  })
})
