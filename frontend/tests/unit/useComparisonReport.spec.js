/**
 * useComparisonReport : rapport de comparaison calculé sans écrire dans le store du principal.
 * Store Vuex minimal simulé, API mockées, records factices.
 */
jest.mock('@/store', () => ({
  __esModule: true,
  default: {
    state: {
      seasons: { seasons: [] },
      analyse: {
        menuItemCostMap: { m1: 2 },
        configShopContext: { floorElements: [] },
        menuItems: [],
        productCategoriesList: [],
        productTypesList: [],
        weezeventProducts: [],
      },
    },
    getters: {},
    commit: jest.fn(),
    dispatch: jest.fn(),
  },
}))
jest.mock('vuex', () => ({ useStore: () => require('@/store').default }))
jest.mock('vue-router', () => ({ useRoute: () => ({ params: { spaceId: 's1' } }) }))
jest.mock('@/api/endpoints/space.api', () => ({
  getSpaceEventTimelineBatch: jest.fn(),
  getSpaceTransactionBasketsBatch: jest.fn(),
}))
jest.mock('@/api/endpoints/eventPredict.api', () => ({ listEventPredictVersions: jest.fn() }))
jest.mock('@/api/endpoints/analyse-rendement.api', () => ({
  getStockValuation: jest.fn(),
  getEventValuations: jest.fn(),
  getArticleDimensions: jest.fn(),
}))
// Le prétraitement minute n'est pas l'objet du test : les lignes factices sont déjà au bon grain.
jest.mock('@/utils/timelineBucketing', () => ({
  ...jest.requireActual('@/utils/timelineBucketing'),
  preprocessTimelineRecords: (rows) => rows,
}))

import { createApp, ref, nextTick } from 'vue'
import store from '@/store'
import { getSpaceEventTimelineBatch, getSpaceTransactionBasketsBatch } from '@/api/endpoints/space.api'
import { listEventPredictVersions } from '@/api/endpoints/eventPredict.api'
import { getStockValuation } from '@/api/endpoints/analyse-rendement.api'
import { useComparisonReport } from '@/composables/useComparisonReport'
import { ITEM_LEVEL_EVENT_CAP } from '@/composables/useAnalyseItemRecords'

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))
async function settle() {
  for (let i = 0; i < 6; i++) { await tick(); await nextTick() }
}

function mount(fn) {
  let out
  const app = createApp({ setup() { out = fn(); return () => null } })
  app.mount(document.createElement('div'))
  return { out, app }
}

const ev = (id, date, extra = {}) => ({ id, name: `Match ${id}`, date, ...extra })
const sale = (eventId, o = {}) => ({
  eventId, shopName: 'Bar', menuItemId: 'm1', menuItemName: 'Bière', menuItemType: 'Beverage',
  menuItemCategory: 'Beer', quantity: 10, revenue: 100, transactionCount: 5, ...o,
})
const basket = (eventId) => ({ eventId, shopName: 'Bar', minute: '20:00', transactionCount: 3, categoryCombo: 'Beer', typeCombo: 'Beverage', itemCombo: 'Bière' })

const EVENTS = [ev('e1', '2026-01-10'), ev('e2', '2026-01-20'), ev('e3', '2026-02-05')]
// Copie fidèle des clés de state.filters lues par les puces (tout est tableau vide par défaut).
const ARRAY_KEYS = [
  'selectedEventIds', 'selectedShopIds', 'selectedShopTypes', 'selectedShopAreas', 'selectedMenuItemIds',
  'selectedMenuItemTypes', 'selectedMenuItemCategories', 'selectedEventTypes', 'selectedEventCategories',
  'selectedSubcategories', 'selectedTeams', 'selectedSponsors', 'selectedSessions', 'selectedPerformerNames',
  'selectedVisitingTeams', 'selectedOpeningActs', 'selectedIntermissions', 'selectedDoorsOpenings',
  'selectedShowTimes', 'selectedDaysOfWeek', 'selectedWeather', 'selectedBrands', 'selectedIndustrials',
  'selectedSuppliers', 'selectedPromotions', 'selectedPromotionTypes',
]
const MAIN_FILTERS = {
  ...Object.fromEntries(ARRAY_KEYS.map((k) => [k, []])),
  timeRange: 'all', startDate: null, endDate: null, searchQuery: '', selectedTimeRange: null,
  selectedConfigurationId: null, temperatureRange: [-10, 45],
}

let deferred
function setupApis({ delay = false } = {}) {
  getSpaceEventTimelineBatch.mockImplementation(async (spaceId, ids) => {
    if (delay) await new Promise((r) => { deferred = r })
    return new Map(ids.map((id) => [id, [sale(id), sale(id, { shopName: 'Snack', menuItemId: 'm2', menuItemName: 'Frites', menuItemType: 'Food', menuItemCategory: 'Fries', revenue: 20, quantity: 4, transactionCount: 2 })]]))
  })
  getSpaceTransactionBasketsBatch.mockImplementation(async (spaceId, ids) => new Map(ids.map((id) => [id, [basket(id)]])))
}

function build({ input, mainEvents = [], mainSnapshot = null, canView = false, analysable = EVENTS, mainFilters = MAIN_FILTERS } = {}) {
  store.getters = {
    'analyse/analysableEvents': analysable,
    'analyse/filteredEvents': mainEvents,
    'analyse/activeConfiguration': null,
  }
  const inputRef = ref(input ?? null)
  const mainFiltersRef = ref(mainFilters)
  const { out } = mount(() => useComparisonReport({
    input: inputRef,
    mainFilters: mainFiltersRef,
    mainEvents: ref(mainEvents),
    mainSnapshot,
    spaceId: ref('s1'),
    canView: ref(canView),
    translate: (k) => k,
    articleDimensions: { index: ref(null), status: ref('ready') },
  }))
  return { report: out, inputRef, mainFiltersRef }
}

beforeEach(() => {
  jest.clearAllMocks()
  setupApis()
  getStockValuation.mockResolvedValue({ total: 500, byElement: [{}] })
  listEventPredictVersions.mockResolvedValue([])
})

describe('useComparisonReport', () => {
  it('idle sans saisie : rien n\'est chargé', async () => {
    const { report } = build()
    await settle()
    expect(report.status.value).toBe('idle')
    expect(report.events.value).toEqual([])
    expect(report.snapshot.value).toBeNull()
    expect(getSpaceEventTimelineBatch).not.toHaveBeenCalled()
    expect(getSpaceTransactionBasketsBatch).not.toHaveBeenCalled()
  })

  it('type Événement : charge, progresse, puis calcule puces, jeux de records et snapshot', async () => {
    setupApis({ delay: true })
    const { report } = build({ input: { kind: 'event', eventIds: ['e1', 'e2'] }, mainEvents: [ev('e3', '2026-02-05')] })
    await settle()
    expect(report.status.value).toBe('loading')
    expect(report.progress.value).toEqual({ loaded: 0, total: 2 })
    expect(report.snapshot.value).toBeNull()

    deferred()
    await settle()
    expect(report.status.value).toBe('ready')
    expect(report.progress.value).toEqual({ loaded: 2, total: 2 })
    expect(report.events.value.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(report.sameAsMain.value).toBe(false)
    expect(report.chartRecords.value).toHaveLength(4)
    expect(report.articleRecords.value).toBe(report.chartRecords.value)
    // CA = 2 events x (100 + 20), transactions = 2 paniers x 3
    expect(report.chips.value.revenue).toBe(240)
    expect(report.chips.value.transactions).toBe(6)
    expect(report.chips.value.avgTransaction).toBe(40)
    expect(report.chips.value.avgRevenuePerEvent).toBe(120)
    expect(report.totals.value.revenue).toBe(240)
    expect(report.totals.value.eventCount).toBe(2)
    // coût : 10 unités x 2 EUR x 2 events
    expect(report.chips.value.cost).toBe(40)
    expect(report.snapshot.value.eventCount).toBe(2)
    expect(report.snapshot.value.sections.shopChartRevenue).toBe(240)
    expect(report.eventRevenueSeries.value.map((s) => s.eventId)).toEqual(['e1', 'e2'])
    expect(report.appliedFilters.value.find((f) => f.key === 'selectedEventIds').own).toBe(true)
  })

  it('applique les filtres du principal (PdV) au rapport de comparaison', async () => {
    const { report } = build({
      input: { kind: 'event', eventIds: ['e1'] },
      mainFilters: { ...MAIN_FILTERS, selectedShopIds: ['Snack'] },
    })
    await settle()
    expect(report.status.value).toBe('ready')
    expect(report.chartRecords.value.map((r) => r.shopName)).toEqual(['Snack'])
    expect(report.chips.value.revenue).toBe(20)
  })

  it('type Période personnalisée : bornes en heure locale, jour inclus', async () => {
    const { report } = build({ input: { kind: 'period', period: 'custom', from: '2026-01-10', to: '2026-01-20' } })
    await settle()
    expect(report.events.value.map((e) => e.id)).toEqual(['e1', 'e2'])
    const single = build({ input: { kind: 'period', period: 'custom', from: '2026-01-20', to: '2026-01-20' } })
    await settle()
    expect(single.report.events.value.map((e) => e.id)).toEqual(['e2'])
  })

  it('sameAsMain : mêmes events que le principal, pas d\'écart calculé', async () => {
    const mainSnapshot = ref({ chips: {}, widgets: {} })
    const { report } = build({
      input: { kind: 'event', eventIds: ['e1', 'e2'] },
      mainEvents: [ev('e2', '2026-01-20'), ev('e1', '2026-01-10')],
      mainSnapshot,
    })
    await settle()
    expect(report.sameAsMain.value).toBe(true)
    expect(report.deltasVsMain.value).toBeNull()
    expect(report.mainDeltasVsComparison.value).toBeNull()
  })

  it('écarts réciproques avec le snapshot du principal', async () => {
    const main = ref(null)
    const { report } = build({ input: { kind: 'event', eventIds: ['e1', 'e2'] }, mainEvents: [ev('e3', '2026-02-05')], mainSnapshot: main })
    await settle()
    expect(report.deltasVsMain.value).toBeNull()
    main.value = JSON.parse(JSON.stringify({ ...report.snapshot.value, chips: { ...report.snapshot.value.chips, revenue: 120 } }))
    await nextTick()
    expect(report.deltasVsMain.value.chips.revenue.delta).toBeCloseTo(100)
    expect(report.mainDeltasVsComparison.value.chips.revenue.delta).toBeCloseTo(-50)
  })

  it('plafond ITEM_LEVEL_EVENT_CAP avec indicateur « tronqué »', async () => {
    const many = Array.from({ length: ITEM_LEVEL_EVENT_CAP + 20 }, (_, i) => ev(`x${i}`, '2026-01-10'))
    const { report } = build({ input: { kind: 'event', eventIds: many.map((e) => e.id) }, analysable: many })
    await settle()
    expect(report.truncation.value).toEqual({ truncated: true, total: ITEM_LEVEL_EVENT_CAP + 20, kept: ITEM_LEVEL_EVENT_CAP, cap: ITEM_LEVEL_EVENT_CAP })
    expect(report.events.value).toHaveLength(ITEM_LEVEL_EVENT_CAP)
    expect(getSpaceEventTimelineBatch.mock.calls[0][1]).toHaveLength(ITEM_LEVEL_EVENT_CAP)
    expect(report.progress.value.total).toBe(ITEM_LEVEL_EVENT_CAP)
  })

  it('aucun event correspondant : état empty', async () => {
    const { report } = build({ input: { kind: 'event', eventIds: ['inconnu'] } })
    await settle()
    expect(report.status.value).toBe('empty')
    expect(report.snapshot.value).toBeNull()
  })

  it('Predict : events sans scénario exclus et listés, champs sans objet à null, pas de stock ni de ventes réelles', async () => {
    listEventPredictVersions.mockImplementation(async (id) => (id === 'e1'
      ? [{ id: 'v1', isDefault: true, predictedRecords: [{ shopId: 's', shop: 'Bar', menuItemId: 'm1', itemName: 'Bière', totalQuantity: 30, totalRevenue: 90 }] }]
      : []))
    const { report } = build({ input: { kind: 'predict' }, mainEvents: [EVENTS[0], EVENTS[1]], canView: true })
    await settle()
    await tick(400)
    expect(report.isPredict.value).toBe(true)
    expect(report.status.value).toBe('ready')
    expect(report.events.value.map((e) => e.id)).toEqual(['e1'])
    expect(report.excludedEvents.value.map((e) => [e.id, e.reason])).toEqual([['e2', 'no-scenario'], ['e3', 'no-scenario']])
    expect(report.sameAsMain.value).toBe(false)
    expect(report.chartRecords.value).toHaveLength(1)
    expect(report.chips.value.revenue).toBe(90)
    expect(report.chips.value.transactions).toBeNull()
    expect(report.chips.value.avgTransaction).toBeNull()
    expect(report.chips.value.transferRate).toBeNull()
    expect(report.widgets.value.transactionRate).toBeNull()
    expect(report.widgets.value.stockValue).toBeNull()
    expect(report.rendementCards.value.stockValue).toMatchObject({ value: '—', loading: false })
    expect(getSpaceEventTimelineBatch).not.toHaveBeenCalled()
    expect(getSpaceTransactionBasketsBatch).not.toHaveBeenCalled()
    expect(getStockValuation).not.toHaveBeenCalled()
  })

  it('Predict : aucun event avec scénario = empty', async () => {
    const { report } = build({ input: { kind: 'predict' } })
    await settle()
    expect(report.status.value).toBe('empty')
    expect(report.excludedEvents.value).toHaveLength(3)
  })

  it('n\'écrit jamais dans le store du principal ni dans ses filtres', async () => {
    const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o) }
    const filters = deepFreeze(JSON.parse(JSON.stringify(MAIN_FILTERS)))
    store.state.analyse = deepFreeze({ ...store.state.analyse })
    const before = JSON.stringify([store.state, filters])
    const { report } = build({ input: { kind: 'event', eventIds: ['e1', 'e2'], selectedDaysOfWeek: ['sat'] }, mainFilters: filters })
    await settle()
    expect(report.filters.value.selectedDaysOfWeek).toEqual(['sat'])
    expect(JSON.stringify([store.state, filters])).toBe(before)
    expect(store.commit).not.toHaveBeenCalled()
    expect(store.dispatch).not.toHaveBeenCalled()
  })

  it('stock du jour demandé avec le droit financier, hors Predict', async () => {
    const { report } = build({ input: { kind: 'event', eventIds: ['e1'] }, canView: true })
    await settle()
    await tick(400)
    await settle()
    expect(getStockValuation).toHaveBeenCalledTimes(1)
    expect(report.rendementRaw.value.stockValue).toBe(500)
    expect(report.widgets.value.stockValue).toBe(500)
  })
})
