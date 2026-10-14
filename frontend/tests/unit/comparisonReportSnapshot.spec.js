import { ref } from 'vue'
import {
  buildReportSnapshot, chipsFromMetrics, widgetsFromMetrics, CHIP_KEYS, WIDGET_KEYS, SNAPSHOT_VERSION,
} from '@/utils/comparisonReportSnapshot'
import { useMainReportSnapshot } from '@/composables/useMainReportSnapshot'

const rec = (o) => ({
  eventId: 'e1', shopName: 'Bar', menuItemId: 'm1', menuItemName: 'Bière', menuItemType: 'Beverage',
  menuItemCategory: 'Beer', quantity: 10, revenue: 50, transactionCount: 5, ...o,
})

// metrics simulées (computed/refs comme useMetricsCalculator)
const metrics = {
  displayRevenue: ref(1000), displayAvgRevenue: ref(500), displayCost: ref(300), displayTransactions: ref(100),
  displayAttendees: ref(400), displayPerCapita: ref(2.5), displayMargin: ref(70), displayTransactionRate: ref(1.2),
}

describe('chipsFromMetrics', () => {
  it('applique les formules du header (panier, transformation)', () => {
    const c = chipsFromMetrics(metrics)
    expect(c).toEqual({
      revenue: 1000, avgRevenuePerEvent: 500, cost: 300, transactions: 100,
      avgTransaction: 10, attendees: 400, transferRate: 25, perCapita: 2.5,
    })
    expect(Object.keys(c)).toEqual(CHIP_KEYS)
  })
  it('Predict : transactions, panier et transformation sans objet', () => {
    const c = chipsFromMetrics(metrics, { isPredict: true })
    expect(c.transactions).toBeNull()
    expect(c.avgTransaction).toBeNull()
    expect(c.transferRate).toBeNull()
    expect(c.revenue).toBe(1000)
  })
  it('sans spectateurs : transformation null', () => {
    const c = chipsFromMetrics({ ...metrics, displayAttendees: ref(0) })
    expect(c.transferRate).toBeNull()
  })
})

describe('widgetsFromMetrics', () => {
  const raw = ref({ revenuePerTpe: 12, revenuePerCollaborator: null, stockValue: 800 })
  it('assemble marge, TX/MIN et rendement', () => {
    const w = widgetsFromMetrics(metrics, raw)
    expect(w).toEqual({ revenuePerTpe: 12, revenuePerCollaborator: null, margin: 70, transactionRate: 1.2, stockValue: 800 })
    expect(Object.keys(w)).toEqual(WIDGET_KEYS)
  })
  it('Predict : TX/MIN et VALO STOCK null', () => {
    const w = widgetsFromMetrics(metrics, raw, { isPredict: true })
    expect(w.transactionRate).toBeNull()
    expect(w.stockValue).toBeNull()
    expect(w.margin).toBe(70)
  })
  it('marge null conservée', () => {
    expect(widgetsFromMetrics({ ...metrics, displayMargin: ref(null) }, raw).margin).toBeNull()
  })
})

describe('buildReportSnapshot', () => {
  const records = [
    rec({}),
    rec({ eventId: 'e2', quantity: 20, revenue: 100 }),
    rec({ shopName: 'Snack', menuItemId: 'm2', menuItemName: 'Frites', menuItemType: 'Food', menuItemCategory: 'Fries', quantity: 4, revenue: 20 }),
  ]
  const base = {
    eventCount: 2, chips: chipsFromMetrics(metrics), widgets: widgetsFromMetrics(metrics, {}), chartRecords: records, articleRecords: records,
  }

  it('produit la forme normalisée', () => {
    const s = buildReportSnapshot(base)
    expect(s.version).toBe(SNAPSHOT_VERSION)
    expect(s.eventCount).toBe(2)
    expect(s.isPredict).toBe(false)
    expect(s.sections).toEqual({ shopChartRevenue: 170, articleDistributionRevenue: 170, itemsByShopRevenue: 170 })
    expect(s.breakdowns.revenue.item).toEqual([{ key: 'Bière', value: 150 }, { key: 'Frites', value: 20 }])
    expect(s.breakdowns.quantity.item).toEqual([{ key: 'Bière', value: 30 }, { key: 'Frites', value: 4 }])
    expect(s.categories).toEqual([{ key: 'Beverage', value: 150 }, { key: 'Food', value: 20 }])
  })

  it('dimensions article null sans index, supplierCost et discount aussi', () => {
    const s = buildReportSnapshot(base)
    expect(s.breakdowns.revenue.brand).toBeNull()
    expect(s.breakdowns.supplierCost).toBeNull()
    expect(s.breakdowns.discount).toBeNull()
  })

  it('avec index : marque, remise et coût fournisseur calculés', () => {
    const index = new Map([
      ['m1', { menuItemId: 'm1', brandName: 'Kronenbourg', supplierCosts: [{ name: 'Brasserie', unitCost: 0.5 }], promotion: { typeName: 'Happy', referencePrice: 6, price: 5 } }],
    ])
    const s = buildReportSnapshot({ ...base, dimensionsIndex: index })
    expect(s.breakdowns.revenue.brand.find((e) => e.key === 'Kronenbourg').value).toBe(150)
    expect(s.breakdowns.supplierCost).toEqual([{ key: 'Brasserie', value: 15 }])
    expect(s.breakdowns.discount).toEqual({ amount: 30, withoutReference: 0 })
    expect(s.breakdowns.revenue.promotion.map((e) => e.key)).toEqual(['promo', 'normal'])
  })

  it('tableau Article par PdV à plat, clé par id', () => {
    const s = buildReportSnapshot(base)
    const bar = s.itemsByShop.find((x) => x.name === 'Bar')
    expect(bar.items[0]).toEqual({ key: 'id:m1', name: 'Bière', avgQuantity: 15, quantity: 30, events: 2 })
    expect(bar.total).toBe(30)
    expect(bar.events).toBe(2)
    expect(() => JSON.stringify(s)).not.toThrow()
  })

  it('article sans id : clé par nom', () => {
    const s = buildReportSnapshot({ ...base, articleRecords: [rec({ menuItemId: null })] })
    expect(s.itemsByShop[0].items[0].key).toBe('name:Bière')
  })

  it('valeurs non finies deviennent null', () => {
    const s = buildReportSnapshot({ ...base, chips: { revenue: NaN, cost: undefined } })
    expect(s.chips.revenue).toBeNull()
    expect(s.chips.cost).toBeNull()
    expect(Object.keys(s.chips)).toEqual(CHIP_KEYS)
  })
})

describe('useMainReportSnapshot', () => {
  const records = ref([rec({})])
  const common = {
    metrics, rendementRaw: ref({ revenuePerTpe: 1, revenuePerCollaborator: 2, stockValue: 3 }),
    chartRecords: records, articleRecords: records, events: ref([{ id: 'e1' }]),
  }
  it('construit le snapshot depuis les computed du principal', () => {
    const snap = useMainReportSnapshot(common)
    expect(snap.value.eventCount).toBe(1)
    expect(snap.value.widgets.stockValue).toBe(3)
    expect(snap.value.chips.revenue).toBe(1000)
  })
  it('null tant que la source charge', () => {
    const state = ref('loading')
    const snap = useMainReportSnapshot({ ...common, sourceState: state })
    expect(snap.value).toBeNull()
    state.value = 'ready'
    expect(snap.value).not.toBeNull()
  })
  it('Predict : champs sans objet à null', () => {
    const snap = useMainReportSnapshot({ ...common, isPredict: ref(true) })
    expect(snap.value.isPredict).toBe(true)
    expect(snap.value.chips.transactions).toBeNull()
    expect(snap.value.widgets.stockValue).toBeNull()
  })
})
