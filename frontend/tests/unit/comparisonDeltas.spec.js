import { computeReportDeltas, makeDelta, newDelta, stockDelta } from '@/utils/comparisonDeltas'
import { CHIP_KEYS, WIDGET_KEYS } from '@/utils/comparisonReportSnapshot'

const zeros = (keys) => Object.fromEntries(keys.map((k) => [k, null]))

function snap(over = {}) {
  return {
    version: 1,
    isPredict: false,
    eventCount: 2,
    chips: { ...zeros(CHIP_KEYS), ...(over.chips || {}) },
    widgets: { ...zeros(WIDGET_KEYS), ...(over.widgets || {}) },
    categories: over.categories || [],
    breakdowns: {
      revenue: { item: [], type: [], category: [], industrial: null, brand: null, promotion: null, promotionType: null, ...(over.revenue || {}) },
      quantity: { item: [], type: [], category: [], industrial: null, brand: null, promotion: null, promotionType: null },
      supplierCost: over.supplierCost === undefined ? null : over.supplierCost,
      discount: over.discount === undefined ? null : over.discount,
    },
    shopDistribution: over.shopDistribution,
    itemsByShop: over.itemsByShop || [],
    sections: { shopChartRevenue: 0, articleDistributionRevenue: 0, itemsByShopRevenue: 0, ...(over.sections || {}) },
  }
}

describe('makeDelta / newDelta', () => {
  it('pourcentage, ton et texte', () => {
    const d = makeDelta(110, 100)
    expect(d).toMatchObject({ kind: 'delta', unit: '%', tone: 'good', text: '▲ 10,0 %', isNew: false })
    expect(d.delta).toBeCloseTo(10)
  })
  it('baisse = rouge, coût inversé : baisse = vert', () => {
    expect(makeDelta(90, 100).tone).toBe('bad')
    expect(makeDelta(90, 100, { invert: true }).tone).toBe('good')
    expect(makeDelta(110, 100, { invert: true }).tone).toBe('bad')
  })
  it('sous 0,5 = neutre', () => {
    expect(makeDelta(100.3, 100).tone).toBe('neutral')
  })
  it('points pour les taux', () => {
    const d = makeDelta(72.5, 70, { unit: 'pts' })
    expect(d.delta).toBeCloseTo(2.5)
    expect(d.text).toBe('▲ 2,5 pts')
  })
  it('référence nulle, absente ou valeur absente = « — »', () => {
    for (const d of [makeDelta(5, 0), makeDelta(5, null), makeDelta(null, 5)]) {
      expect(d).toMatchObject({ kind: 'none', delta: null, text: '—' })
    }
    // en points, une référence à 0 reste un vrai écart
    expect(makeDelta(5, 0, { unit: 'pts' }).kind).toBe('delta')
  })
  it('nouveau', () => {
    expect(newDelta()).toMatchObject({ kind: 'new', isNew: true, delta: null, text: '—' })
  })
})

describe('stockDelta (décision 11)', () => {
  it('valeurs égales = same', () => {
    expect(stockDelta(1000, 1000)).toMatchObject({ kind: 'same', delta: null, tone: 'neutral', text: '=' })
    expect(stockDelta(1000.001, 1000)).toMatchObject({ kind: 'same' })
  })
  it('valeurs différentes = écart', () => {
    const d = stockDelta(1100, 1000)
    expect(d.kind).toBe('delta')
    expect(d.delta).toBeCloseTo(10)
  })
  it('valeur absente = « — »', () => {
    expect(stockDelta(null, 1000).kind).toBe('none')
    expect(stockDelta(1000, null).kind).toBe('none')
    expect(stockDelta(null, null).kind).toBe('none')
  })
})

describe('computeReportDeltas', () => {
  it('null si un snapshot manque', () => {
    expect(computeReportDeltas(null, snap())).toBeNull()
    expect(computeReportDeltas(snap(), undefined)).toBeNull()
  })

  it('puces : % partout, coût inversé, référence nulle = « — »', () => {
    const a = snap({ chips: { revenue: 1200, cost: 330, transactions: 100, perCapita: 4 } })
    const b = snap({ chips: { revenue: 1000, cost: 300, transactions: 0, perCapita: null } })
    const d = computeReportDeltas(a, b).chips
    expect(d.revenue.delta).toBeCloseTo(20)
    expect(d.revenue.tone).toBe('good')
    expect(d.cost.delta).toBeCloseTo(10)
    expect(d.cost.tone).toBe('bad')
    expect(d.transactions.kind).toBe('none')
    expect(d.perCapita.kind).toBe('none')
    expect(Object.keys(d)).toEqual(CHIP_KEYS)
  })

  it('marge en POINTS, autres widgets en %', () => {
    const a = snap({ widgets: { margin: 72, transactionRate: 1.1, revenuePerTpe: 20, revenuePerCollaborator: 10 } })
    const b = snap({ widgets: { margin: 70, transactionRate: 1.0, revenuePerTpe: 10, revenuePerCollaborator: null } })
    const w = computeReportDeltas(a, b).widgets
    expect(w.margin).toMatchObject({ unit: 'pts', text: '▲ 2,0 pts' })
    expect(w.transactionRate.unit).toBe('%')
    expect(w.revenuePerTpe.delta).toBeCloseTo(100)
    expect(w.revenuePerCollaborator.kind).toBe('none')
  })

  it('marge : écart en points même sous référence 0', () => {
    const w = computeReportDeltas(snap({ widgets: { margin: 5 } }), snap({ widgets: { margin: 0 } })).widgets
    expect(w.margin.delta).toBe(5)
  })

  it('VALO STOCK identique = same, différent = écart', () => {
    expect(computeReportDeltas(snap({ widgets: { stockValue: 500 } }), snap({ widgets: { stockValue: 500 } })).widgets.stockValue.kind).toBe('same')
    const d = computeReportDeltas(snap({ widgets: { stockValue: 600 } }), snap({ widgets: { stockValue: 500 } })).widgets.stockValue
    expect(d.kind).toBe('delta')
    expect(d.delta).toBeCloseTo(20)
  })

  it('Predict : champs sans objet restent « — »', () => {
    const predict = snap({ chips: { revenue: 900, transactions: null }, widgets: { transactionRate: null, stockValue: null } })
    const real = snap({ chips: { revenue: 1000, transactions: 100 }, widgets: { transactionRate: 1, stockValue: 800 } })
    const d = computeReportDeltas(predict, real)
    expect(d.chips.revenue.delta).toBeCloseTo(-10)
    expect(d.chips.transactions.kind).toBe('none')
    expect(d.widgets.transactionRate.kind).toBe('none')
    expect(d.widgets.stockValue.kind).toBe('none')
  })

  it('cartes de catégories : nouveau quand absentes de la référence', () => {
    const a = snap({ categories: [{ key: 'Beverage', value: 200 }, { key: 'Food', value: 50 }] })
    const b = snap({ categories: [{ key: 'Beverage', value: 100 }] })
    const c = computeReportDeltas(a, b).categories
    expect(c.get('Beverage').delta).toBeCloseTo(100)
    expect(c.get('Food').isNew).toBe(true)
  })

  it('répartitions : par valeur, nouveau, dimension non chargée = Map vide', () => {
    const a = snap({ revenue: { item: [{ key: 'Bière', value: 150 }, { key: 'Pizza', value: 10 }], brand: [{ key: 'X', value: 1 }] } })
    const b = snap({ revenue: { item: [{ key: 'Bière', value: 100 }], brand: null } })
    const d = computeReportDeltas(a, b).breakdowns.revenue
    expect(d.item.get('Bière').delta).toBeCloseTo(50)
    expect(d.item.get('Pizza').isNew).toBe(true)
    expect(d.brand.size).toBe(0)
  })

  it('répartition des PdV par CA : écart par PdV / type / zone, nouveau, mode quantité, snapshot sans la clé', () => {
    const dims = (shop, type = [], area = []) => ({ shop, type, area })
    const a = snap({ shopDistribution: {
      revenue: dims([{ key: 'Buvette', value: 150 }, { key: 'Grill', value: 10 }], [{ key: 'food', value: 80 }], [{ key: 'Nord', value: 5 }]),
      quantity: dims([{ key: 'Buvette', value: 30 }]),
    } })
    const b = snap({ shopDistribution: {
      revenue: dims([{ key: 'Buvette', value: 100 }], [{ key: 'food', value: 0 }], [{ key: 'Nord', value: 10 }]),
      quantity: dims([{ key: 'Buvette', value: 60 }]),
    } })
    const d = computeReportDeltas(a, b).shopDistribution
    expect(d.revenue.shop.get('Buvette').delta).toBeCloseTo(50)
    expect(d.revenue.shop.get('Grill').isNew).toBe(true)
    expect(d.revenue.type.get('food').kind).toBe('none')
    expect(d.revenue.area.get('Nord').delta).toBeCloseTo(-50)
    expect(d.quantity.shop.get('Buvette').delta).toBeCloseTo(-50)
    const none = computeReportDeltas(snap(), snap()).shopDistribution
    expect(none.revenue.shop.size).toBe(0)
    expect(none.quantity.area.size).toBe(0)
  })

  it('coût fournisseur inversé, remise accordée inversée', () => {
    const a = snap({ supplierCost: [{ key: 'F1', value: 120 }], discount: { amount: 60, withoutReference: 0 } })
    const b = snap({ supplierCost: [{ key: 'F1', value: 100 }], discount: { amount: 50, withoutReference: 0 } })
    const d = computeReportDeltas(a, b)
    expect(d.breakdowns.supplierCost.get('F1')).toMatchObject({ tone: 'bad', invert: true })
    expect(d.discount.delta).toBeCloseTo(20)
    expect(d.discount.tone).toBe('bad')
  })

  it('remise absente d\'un côté = « — »', () => {
    expect(computeReportDeltas(snap({ discount: null }), snap({ discount: { amount: 5 } })).discount.kind).toBe('none')
    expect(computeReportDeltas(snap({ discount: { amount: 5 } }), snap({ discount: { amount: 0 } })).discount.kind).toBe('none')
  })

  it('tableau Article par PdV : cellules appariées par PdV puis article', () => {
    const item = (key, q, avg, ev) => ({ key, name: key, quantity: q, avgQuantity: avg, events: ev })
    const a = snap({
      itemsByShop: [
        { name: 'Bar', total: 60, avg: 30, events: 2, items: [item('id:1', 40, 20, 2), item('id:2', 20, 10, 2)] },
        { name: 'Snack', total: 5, avg: 5, events: 1, items: [item('id:3', 5, 5, 1)] },
      ],
    })
    const b = snap({
      itemsByShop: [{ name: 'Bar', total: 50, avg: 25, events: 2, items: [item('id:1', 20, 10, 1)] }],
    })
    const t = computeReportDeltas(a, b).itemsByShop
    const bar = t.get('Bar')
    expect(bar.isNew).toBe(false)
    expect(bar.shop.total.delta).toBeCloseTo(20)
    expect(bar.items.get('id:1').quantity.delta).toBeCloseTo(100)
    expect(bar.items.get('id:1').avgQuantity.delta).toBeCloseTo(100)
    expect(bar.items.get('id:1').events.delta).toBeCloseTo(100)
    expect(bar.items.get('id:2')).toMatchObject({ isNew: true })
    expect(bar.items.get('id:2').quantity.kind).toBe('new')
    const snack = t.get('Snack')
    expect(snack.isNew).toBe(true)
    expect(snack.shop.total.kind).toBe('new')
    expect(snack.items.get('id:3').isNew).toBe(true)
  })

  it('total CA de chaque section', () => {
    const a = snap({ sections: { shopChartRevenue: 220, articleDistributionRevenue: 110, itemsByShopRevenue: 0 } })
    const b = snap({ sections: { shopChartRevenue: 200, articleDistributionRevenue: 100, itemsByShopRevenue: 50 } })
    const s = computeReportDeltas(a, b).sections
    expect(s.shopChartRevenue.delta).toBeCloseTo(10)
    expect(s.articleDistributionRevenue.delta).toBeCloseTo(10)
    expect(s.itemsByShopRevenue.delta).toBeCloseTo(-100)
  })

  it('réciprocité : A vs B et B vs A', () => {
    const a = snap({ chips: { revenue: 120 } })
    const b = snap({ chips: { revenue: 100 } })
    expect(computeReportDeltas(a, b).chips.revenue.delta).toBeCloseTo(20)
    expect(computeReportDeltas(b, a).chips.revenue.delta).toBeCloseTo(-16.6667, 3)
  })
})
