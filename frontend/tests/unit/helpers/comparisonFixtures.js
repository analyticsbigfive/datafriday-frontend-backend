/**
 * Fabriques partagées des tests de montage du drawer Comparaison : faux runtime
 * (forme exacte de useComparisonRuntime), faux useComparisonDrawer et stubs Vuetify minimaux.
 */
import { ref, computed, shallowRef, h } from 'vue'

const delta = (text = '▲ 4,2 %', tone = 'good') => ({ kind: 'delta', delta: 4.2, unit: '%', invert: false, tone, text, isNew: false })

export const CHIP_KEYS = ['revenue', 'avgRevenuePerEvent', 'cost', 'transactions', 'avgTransaction', 'attendees', 'transferRate', 'perCapita']

export function fakeChipDeltas() {
  return Object.fromEntries(CHIP_KEYS.map((k) => [k, delta()]))
}

export function fakeDeltasVsMain() {
  return {
    chips: fakeChipDeltas(),
    widgets: {
      revenuePerTpe: delta(), revenuePerCollaborator: delta(), margin: delta('▲ 1,0 pts'),
      transactionRate: delta('▼ 2,0 %', 'bad'), stockValue: { kind: 'same', tone: 'neutral', text: '=' },
    },
    categories: new Map(),
    breakdowns: {
      revenue: { item: new Map(), type: new Map(), category: new Map(), industrial: new Map(), brand: new Map(), promotion: new Map(), promotionType: new Map() },
      quantity: { item: new Map(), type: new Map(), category: new Map(), industrial: new Map(), brand: new Map(), promotion: new Map(), promotionType: new Map() },
      supplierCost: new Map(),
    },
    shopDistribution: {
      revenue: { shop: new Map([['Buvette Nord', delta('▲ 7,5 %')]]), type: new Map(), area: new Map() },
      quantity: { shop: new Map(), type: new Map(), area: new Map() },
    },
    discount: delta(),
    itemsByShop: new Map(),
    sections: { shopChartRevenue: delta(), articleDistributionRevenue: delta(), itemsByShopRevenue: delta() },
  }
}

const num = (v) => ({ value: v })
/** Faux retour de useMetricsCalculator (computed-like : { value }). */
export function fakeMetrics() {
  return new Proxy({}, {
    get: (_, key) => {
      if (key === 'isSingleEventMode') return ref(false)
      if (typeof key === 'symbol') return undefined
      if (String(key).startsWith('display') || String(key).startsWith('total')) return num(1234.5)
      return num(0)
    },
  })
}

export const RECORDS = [
  { eventId: 'e1', eventName: 'Match 1', eventDate: '2026-01-10', shopId: 's1', shopName: 'Buvette Nord', menuItemId: 'm1', menuItemName: 'Biere', quantity: 10, revenue: 50, totalPrice: 50, price: 5, amount: 50, eventType: 'Sport', itemType: 'Boisson', itemCategory: 'Biere' },
  { eventId: 'e2', eventName: 'Match 2', eventDate: '2026-01-20', shopId: 's1', shopName: 'Buvette Nord', menuItemId: 'm1', menuItemName: 'Biere', quantity: 20, revenue: 100, totalPrice: 100, price: 5, amount: 100, eventType: 'Sport', itemType: 'Boisson', itemCategory: 'Biere' },
]

export const APPLIED = { kind: 'period', period: 'prev', from: '', to: '', eventTypes: [], categories: [], subcategories: [], eventIds: [] }

/** Faux useComparisonDrawer : refs et espions. */
export function fakeComparison(over = {}) {
  return {
    open: ref(true),
    layout: ref('split'),
    view: ref('ready'),
    applied: shallowRef({ ...APPLIED }),
    run: jest.fn(),
    backToReport: jest.fn(),
    showForm: jest.fn(),
    toggleExpandDrawer: jest.fn(),
    ...over,
  }
}

/** Faux useComparisonRuntime ('ready' complet par défaut). */
export function fakeRuntime(over = {}) {
  const deltas = fakeDeltasVsMain()
  const report = {
    metrics: fakeMetrics(),
    kpiSourceState: computed(() => 'ready'),
    rendementCards: computed(() => ({
      revenuePerTpe: { loading: false, value: '12 €', subtext: '', warning: null },
      revenuePerCollaborator: { loading: false, value: '34 €', subtext: '', warning: null },
      stockValue: { loading: false, value: '—', subtext: '', warning: null },
    })),
    chartRecords: computed(() => RECORDS),
    articleRecords: computed(() => RECORDS),
    events: computed(() => [{ id: 'e1', name: 'Match 1', date: '2026-01-10' }, { id: 'e2', name: 'Match 2', date: '2026-01-20' }]),
    isPredict: computed(() => false),
    dimensionsIndex: computed(() => null),
    dimensionsStatus: computed(() => 'idle'),
    chips: computed(() => ({ revenue: 150, avgRevenuePerEvent: 75, cost: 40, transactions: 30, avgTransaction: 5, attendees: 200, transferRate: 15, perCapita: 0.75 })),
    snapshot: computed(() => ({ version: 1 })),
    widgets: computed(() => ({})),
    totals: computed(() => ({})),
    clearCache: jest.fn(),
  }
  const base = {
    active: computed(() => true),
    state: ref('ready'),
    refreshing: ref(false),
    pending: ref(false),
    progress: ref({ loaded: 1, total: 4 }),
    error: ref(null),
    appliedFilters: ref([{ key: 'timeRange', label: 'Saison 2025', own: true }, { key: 'pdv', label: 'Buvette Nord', own: false }]),
    excludedEvents: ref([]),
    sameAsMain: ref(false),
    truncation: ref({ truncated: false, total: 2, kept: 2, cap: 100 }),
    intraEventRangeIgnored: ref(false),
    isPredict: ref(false),
    events: report.events,
    deltasVsMain: ref(deltas),
    mainDeltasVsComparison: ref(null),
    widgetDeltas: ref({ tpe: deltas.widgets.revenuePerTpe, collaborator: deltas.widgets.revenuePerCollaborator, margin: deltas.widgets.margin, transactionRate: deltas.widgets.transactionRate, stock: deltas.widgets.stockValue }),
    chipDeltas: ref(deltas.chips),
    trend: ref(null),
    report,
    retry: jest.fn(),
    flushNow: jest.fn(),
  }
  return { ...base, ...over }
}

/** Stubs Vuetify minimaux : rendent leurs slots pour que le contenu reste visible. */
const passthrough = (tag) => ({ inheritAttrs: true, render() { return h(tag, this.$attrs, this.$slots.default ? this.$slots.default() : []) } })
export const vuetifyStubs = {
  'v-icon': passthrough('i'),
  'v-row': passthrough('div'),
  'v-col': passthrough('div'),
  'v-card': passthrough('div'),
  'v-progress-circular': passthrough('span'),
  'v-list-item': { inheritAttrs: true, render() { return h('div', { role: 'menuitem', ...this.$attrs }, [this.$slots.prepend ? this.$slots.prepend() : null, this.$slots.default ? this.$slots.default() : null]) } },
  'v-list-item-title': passthrough('span'),
  'v-tooltip': true,
  'v-skeleton-loader': true,
}
/** Directive v-can neutre (droit accordé). */
export const canDirective = { mounted() {}, updated() {} }
export const globalMountOptions = (extra = {}) => ({
  stubs: { ...vuetifyStubs, ...(extra.stubs || {}) },
  directives: { can: canDirective },
  mocks: { $vuetify: { theme: { global: { current: { dark: false } } } } },
})
