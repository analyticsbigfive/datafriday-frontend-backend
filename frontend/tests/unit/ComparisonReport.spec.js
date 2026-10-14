/**
 * ComparisonReport et ComparisonDrawerContent : montage réel avec un runtime factice de
 * la forme exacte de useComparisonRuntime. Les graphes Chart.js et les tableaux lourds sont
 * stubbés dans les tests de contenu ; FinancialMetricsGrid, bandeau, filtres et notices sont réels.
 */
jest.mock('@/store', () => ({
  __esModule: true,
  default: { state: { seasons: { seasons: [] }, analyse: { filters: {} } }, getters: {}, commit: jest.fn(), dispatch: jest.fn() },
}))
jest.mock('@/api/endpoints/eventPredict.api', () => ({ listEventPredictVersions: jest.fn(), getEventIdsWithPredictVersions: jest.fn() }))

jest.mock('vuetify', () => ({
  useTheme: () => ({ global: { current: { value: { dark: false } } }, current: { value: { dark: false } } }),
  useDisplay: () => ({ mobile: { value: false }, smAndDown: { value: false }, width: { value: 1400 } }),
}))

jest.mock('vue-chartjs', () => ({
  Doughnut: { name: 'Doughnut', props: ['data', 'options'], template: '<canvas class="stub-doughnut" />' },
  Bar: { name: 'Bar', props: ['data', 'options'], template: '<canvas class="stub-bar" />' },
  Line: { name: 'Line', props: ['data', 'options'], template: '<canvas class="stub-line" />' },
}))

jest.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: jest.fn() }) }))

import { createStore } from 'vuex'
import { mount } from '@vue/test-utils'
import { nextTick, ref, computed } from 'vue'
import { globalMountOptions, fakeRuntime, fakeComparison } from './helpers/comparisonFixtures'
import ComparisonReport from '@/components/space-workspace/analyse/comparison/ComparisonReport.vue'

const heavy = {
  EventRevenueByShopChart: { name: 'EventRevenueByShopChart', props: { records: Array, events: Array, isPredictMode: Boolean, trend: Array, embedded: Boolean, readonly: Boolean }, template: '<div class="stub-chart" />' },
  MenuItemRevenueDistribution: { name: 'MenuItemRevenueDistribution', props: { records: Array, dimensionsIndex: null, dimensionsStatus: String, deltas: Object, readonly: Boolean }, emits: ['mode-change'], template: '<div class="stub-dist" @click="$emit(\'mode-change\', \'quantity\')" />' },
  PromotionSection: { name: 'PromotionSection', props: { records: Array, dimensionsIndex: null, status: String, mode: String, deltas: Object, readonly: Boolean }, template: '<div class="stub-promo">{{ mode }}</div>' },
  MenuItemsByShopTable: { name: 'MenuItemsByShopTable', props: { records: Array, deltas: Object, readonly: Boolean }, template: '<div class="stub-table" />' },
}

let warn
let warns
beforeEach(() => {
  warns = []
  warn = jest.spyOn(console, 'warn').mockImplementation((...a) => { warns.push(String(a[0])) })
})
afterEach(() => {
  warn.mockRestore()
  const real = warns.filter((m) => !m.includes('Failed to resolve component'))
  expect(real).toEqual([])
})

// Store Vuex réel minimal pour les vrais sous-composants (ils lisent state.analyse en lecture).
function realStore() {
  return createStore({
    state: { seasons: { seasons: [] }, auth: { user: null } },
    getters: { 'analyse/filteredEvents': () => [] },
    modules: {
      analyse: {
        namespaced: false,
        state: () => ({ filters: {}, productTypesList: [], productCategoriesList: [] }),
        getters: {},
      },
    },
  })
}

function mountReport({ runtime = fakeRuntime(), comparison = fakeComparison(), stubs = heavy, real = false } = {}) {
  const g = globalMountOptions({ stubs })
  if (real) g.plugins = [realStore()]
  const w = mount(ComparisonReport, { props: { runtime, comparison }, global: g })
  return { w, runtime, comparison }
}

describe('ComparisonReport', () => {
  it('monte le bandeau, les filtres, les widgets réels et les cartes (stubs lourds)', () => {
    const { w } = mountReport()
    expect(w.attributes('id')).toBe('comparison-capture-root')
    expect(w.find('header.cb').exists()).toBe(true)
    expect(w.findAll('.cfl__tag')).toHaveLength(2)
    expect(w.find('.cn').exists()).toBe(false)
    expect(w.find('.fmg-row').exists()).toBe(true)
    expect(w.findAll('.delta-pill').length).toBeGreaterThan(0)
    expect(w.find('.stub-chart').exists()).toBe(true)
    expect(w.find('.stub-dist').exists()).toBe(true)
    expect(w.find('.stub-promo').exists()).toBe(true)
    expect(w.find('.stub-table').exists()).toBe(true)
    expect(w.text()).toContain('2')
  })

  it('transmet les props lecture seule aux cartes', () => {
    const { w } = mountReport()
    expect(w.findComponent({ name: 'EventRevenueByShopChart' }).props('readonly')).toBe(true)
    expect(w.findComponent({ name: 'MenuItemRevenueDistribution' }).props('deltas')).toBeTruthy()
    expect(w.findComponent({ name: 'MenuItemsByShopTable' }).props('records')).toHaveLength(2)
  })

  it('relaie le mode de répartition à PromotionSection', async () => {
    const { w } = mountReport()
    expect(w.find('.stub-promo').text()).toBe('revenue')
    await w.find('.stub-dist').trigger('click')
    expect(w.find('.stub-promo').text()).toBe('quantity')
  })

  it('relaie export-csv, copy, share ; edit ramène au formulaire ; extension', async () => {
    const { w, comparison } = mountReport()
    const buttons = w.findAll('header.cb button')
    for (const b of buttons) await b.trigger('click')
    expect(w.emitted('export-csv')).toHaveLength(1)
    expect(w.emitted('copy')).toHaveLength(1)
    expect(w.emitted('share')).toHaveLength(1)
    expect(comparison.toggleExpandDrawer).toHaveBeenCalledTimes(1)
    expect(comparison.showForm).toHaveBeenCalledTimes(1)
  })

  it('affiche les notices et le voile de mise à jour', async () => {
    const runtime = fakeRuntime()
    runtime.sameAsMain.value = true
    runtime.refreshing.value = true
    const { w } = mountReport({ runtime })
    await nextTick()
    expect(w.find('.cn__alert').exists()).toBe(true)
    expect(w.find('.cr__veil').exists()).toBe(true)
    expect(w.attributes('aria-busy')).toBe('true')
  })

  it('monte aussi avec les vrais sous-composants non graphiques (tableaux et répartitions réels)', () => {
    // Seul le graphe Chart.js est stubbé : les autres cartes sont les vrais composants.
    const { w } = mountReport({ real: true, stubs: { EventRevenueByShopChart: heavy.EventRevenueByShopChart } })
    expect(w.find('#comparison-capture-root').exists()).toBe(true)
    expect(w.findComponent({ name: 'FinancialMetricsGrid' }).exists()).toBe(true)
  })

  it('les vrais composants affichent les données reçues (article, PdV)', () => {
    const { w } = mountReport({ real: true, stubs: { EventRevenueByShopChart: heavy.EventRevenueByShopChart } })
    expect(w.text()).toContain('Biere')
    expect(w.text()).toContain('Buvette Nord')
  })

  it('monte sans écarts, sans records et sans tendance (premier affichage, Predict)', () => {
    const runtime = fakeRuntime({ deltasVsMain: ref(null), widgetDeltas: ref(null), chipDeltas: ref(null) })
    runtime.report.chartRecords = computed(() => [])
    runtime.report.articleRecords = computed(() => [])
    runtime.isPredict.value = true
    runtime.report.isPredict = computed(() => true)
    const { w } = mountReport({ runtime, real: true, stubs: { EventRevenueByShopChart: heavy.EventRevenueByShopChart } })
    expect(w.find('#comparison-capture-root').exists()).toBe(true)
  })

  it('monte le vrai graphe CA par shop en lecture seule avec une tendance (Chart.js simulé)', async () => {
    const runtime = fakeRuntime()
    runtime.trend.value = [{ value: 40, label: 'Principal 1 10/01' }, { value: 90, label: 'Principal 2 20/01' }]
    const { w } = mountReport({ runtime, real: true, stubs: {} })
    await nextTick()
    expect(w.findComponent({ name: 'EventRevenueByShopChart' }).exists()).toBe(true)
    expect(w.find('.stub-bar, .stub-line').exists()).toBe(true)
  })

  it('contient la bande des 8 puces pour la capture, masquée à l\'écran', () => {
    const { w } = mountReport()
    const snap = w.find('#comparison-capture-root .cr__snap')
    expect(snap.exists()).toBe(true)
    expect(snap.findAll('.cks__chip')).toHaveLength(8)
    expect(snap.find('.cks__strip--wrap').exists()).toBe(true)
    expect(snap.attributes('aria-hidden')).toBe('true')
  })

  it('transmet les états des actions au bandeau', () => {
    const w = mount(ComparisonReport, {
      props: { runtime: fakeRuntime(), comparison: fakeComparison(), exporting: true, copying: true, sharing: true },
      global: globalMountOptions({ stubs: heavy }),
    })
    const banner = w.findComponent({ name: 'ComparisonBanner' })
    expect(banner.props()).toMatchObject({ exporting: true, copying: true, sharing: true, exportDisabled: false })
  })

  it('bloque l\'export pendant un recalcul', () => {
    const runtime = fakeRuntime()
    runtime.refreshing.value = true
    const { w } = mountReport({ runtime })
    expect(w.findComponent({ name: 'ComparisonBanner' }).props('exportDisabled')).toBe(true)
  })
})

