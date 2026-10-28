import { buildSlotData } from '@/utils/reportJ1Page2Build'

const t = (k) => k
const base = {
  metrics: { displayRevenue: 1000, displayTransactions: 100, displayAttendees: 500, displayMargin: 62.5, displayTransactionRate: 1.25 },
  rendementRaw: { revenuePerTpe: 250, revenuePerCollaborator: 100, stockValue: 4000 },
  chartRecords: [
    { shopName: 'Bar A', eventId: 'e1', revenue: 300, quantity: 30 },
    { shopName: 'Bar B', eventId: 'e1', revenue: 700, quantity: 70 },
  ],
  articleRecords: [
    { shopName: 'Bar A', eventId: 'e1', menuItemId: 'm1', menuItemName: 'Pinte', menuItemType: 'Beverage', menuItemCategory: 'Beer', revenue: 300, quantity: 30 },
    { shopName: 'Bar B', eventId: 'e1', menuItemId: 'm2', menuItemName: 'Burger', menuItemType: 'Food', menuItemCategory: 'Burgers', revenue: 700, quantity: 70 },
  ],
  itemRecords: [],
  events: [{ id: 'e1', name: 'Match' }],
  baskets: [
    { transactionCount: 5, categoryCombo: ['Beer'], itemCombo: ['Pinte'] },
    { transactionCount: 3, categoryCombo: ['Beer', 'Food'], itemCombo: ['Pinte', 'Burger'] },
  ],
  dimensionsIndex: new Map([
    ['m1', { menuItemId: 'm1', brandName: 'Kro', industrialShares: [{ name: 'Ind1', share: 1 }], supplierCosts: [{ name: 'Sup1', unitCost: 1 }], promotion: { typeName: 'Happy' } }],
    ['m2', { menuItemId: 'm2', brandName: null, industrialShares: [], supplierCosts: [] }],
  ]),
  dimensionsStatus: 'ready',
  shopRates: [{ shopName: 'Bar A', transactionRate: 1.5 }],
  t,
}
const none = { ...base, metrics: {}, chartRecords: [], articleRecords: [], itemRecords: [], events: [], baskets: [] }
const donut = (variant, extra) => ({ kind: 'donut', variant, options: {}, ...extra })

describe('kpi-bar / widget-bar', () => {
  it('huit puces et cinq widgets formatés', () => {
    const k = buildSlotData({ kind: 'kpi-bar' }, base)
    expect(k.status).toBe('ok')
    expect(k.data.items).toHaveLength(8)
    expect(typeof k.data.items[0].value).toBe('string')
    const w = buildSlotData({ kind: 'widget-bar' }, base)
    expect(w.data.items).toHaveLength(5)
    expect(w.data.items[3].value).toMatch(/\/min$/)
  })
  it('valeurs absentes: tiret, pas de plantage', () => {
    const w = buildSlotData({ kind: 'widget-bar' }, { ...none, rendementRaw: {} })
    expect(w.status).toBe('ok')
    expect(w.data.items[0].value).toBe('n.d.')
  })
})

describe('donut', () => {
  it('shop: ok avec total et format', () => {
    const r = buildSlotData(donut('shop'), base)
    expect(r.status).toBe('ok')
    expect(r.data.total).toBe(1000)
    expect(r.data.valueFormat).toBe('currency')
    expect(r.data.entries[0]).toMatchObject({ label: 'Bar B', value: 700 })
  })
  it('metric quantity -> count', () => {
    const r = buildSlotData(donut('shop', { options: { metric: 'quantity' } }), base)
    expect(r.data.valueFormat).toBe('count')
    expect(r.data.total).toBe(100)
  })
  it('articleType, articleCategory, displayName ok', () => {
    for (const v of ['articleType', 'articleCategory', 'displayName']) {
      const r = buildSlotData(donut(v), base)
      expect(r.status).toBe('ok')
      expect(r.data.total).toBe(1000)
    }
  })
  it('dimensions: ok, puis error sans index', () => {
    for (const v of ['industrial', 'brand', 'supplier', 'promotion', 'promotionType']) {
      expect(buildSlotData(donut(v), base).status).toBe('ok')
    }
    expect(buildSlotData(donut('brand'), { ...base, dimensionsIndex: null }).status).toBe('error')
    expect(buildSlotData(donut('brand'), { ...base, dimensionsStatus: 'error' }).status).toBe('error')
  })
  it('paniers: ok en count, combinaisons', () => {
    const r = buildSlotData(donut('basketMix'), base)
    expect(r.data.valueFormat).toBe('count')
    expect(r.data.total).toBe(8)
    expect(buildSlotData(donut('basketMixItem'), base).status).toBe('ok')
  })
  it('empty sans donnée, error si variante inconnue', () => {
    for (const v of ['shop', 'articleType', 'displayName', 'basketMix', 'basketMixItem']) {
      expect(buildSlotData(donut(v), none).status).toBe('empty')
    }
    expect(buildSlotData(donut('nope'), base).status).toBe('error')
  })
})

describe('perf-table', () => {
  const p = (variant) => ({ kind: 'perf-table', variant })
  it('shops triés par CA desc avec taux', () => {
    const r = buildSlotData(p('shops'), base)
    expect(r.status).toBe('ok')
    expect(r.data.columns.map((c) => c.key)).toEqual(['name', 'revenue', 'units', 'rate'])
    expect(r.data.rows.map((x) => x.name)).toEqual(['Bar B', 'Bar A'])
    expect(r.data.rows[1].rate).toBe('1.50')
  })
  it('events et items ok', () => {
    expect(buildSlotData(p('events'), base).data.rows[0].name).toBe('Match')
    expect(buildSlotData(p('items'), base).data.rows[0].name).toBe('Burger')
  })
  it('empty', () => {
    for (const v of ['shops', 'events', 'items']) expect(buildSlotData(p(v), none).status).toBe('empty')
  })
})

describe('revenue-bars / items-by-shop', () => {
  it('barres triées desc', () => {
    const r = buildSlotData({ kind: 'revenue-bars' }, base)
    expect(r.data.bars).toEqual([{ label: 'Bar B', value: 700 }, { label: 'Bar A', value: 300 }])
    expect(buildSlotData({ kind: 'revenue-bars' }, none).status).toBe('empty')
  })
  it('articles par PdV', () => {
    const r = buildSlotData({ kind: 'items-by-shop' }, base)
    expect(r.status).toBe('ok')
    expect(r.data.shops[0]).toMatchObject({ shop: 'Bar B', total: 70 })
    expect(r.data.shops[0].items[0]).toEqual({ name: 'Burger', qty: 70, revenue: 700 })
    expect(buildSlotData({ kind: 'items-by-shop' }, none).status).toBe('empty')
  })
  it('kind inconnu -> error', () => {
    expect(buildSlotData({ kind: 'zzz' }, base).status).toBe('error')
  })
})
