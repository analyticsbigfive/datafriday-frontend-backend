/**
 * ComparisonDrawerContent : aiguillage des vues form / loading / error / empty / ready,
 * avec le vrai formulaire (useComparisonForm) et le vrai rapport (cartes lourdes stubbées).
 */
jest.mock('@/store', () => ({
  __esModule: true,
  default: { state: { seasons: { seasons: [] } }, getters: {}, commit: jest.fn(), dispatch: jest.fn() },
}))
jest.mock('@/api/endpoints/eventPredict.api', () => ({ listEventPredictVersions: jest.fn(), getEventIdsWithPredictVersions: jest.fn() }))
jest.mock('vuetify', () => ({ useTheme: () => ({ global: { current: { value: { dark: false } } } }) }))
jest.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: jest.fn() }) }))

import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import store from '@/store'
import { getEventIdsWithPredictVersions } from '@/api/endpoints/eventPredict.api'
import { useComparisonForm } from '@/composables/useComparisonForm'
import { useComparisonDrawer } from '@/composables/useComparisonDrawer'
import ComparisonDrawerContent from '@/components/space-workspace/analyse/comparison/ComparisonDrawerContent.vue'
import { globalMountOptions, fakeRuntime, APPLIED } from './helpers/comparisonFixtures'

const EVENTS = [
  { id: 'e1', name: 'Match 1', date: '2026-01-10', eventType: 'Sport', category: 'Basket', doorsOpening: '18:00', showTime: '20:00' },
]
const MAIN = { timeRange: 'last12months', startDate: null, endDate: null, temperatureRange: [-10, 45], selectedEventTypes: [], selectedEventCategories: [], selectedSubcategories: [] }

const lightStub = (name, cls) => ({ name, props: { records: Array, events: Array, deltas: Object, trend: Array, readonly: Boolean, embedded: Boolean, isPredictMode: Boolean, dimensionsIndex: null, dimensionsStatus: String, status: String, mode: String }, template: `<div class="${cls}" />` })
const stubs = {
  EventRevenueByShopChart: lightStub('EventRevenueByShopChart', 'stub-chart'),
  MenuItemRevenueDistribution: lightStub('MenuItemRevenueDistribution', 'stub-dist'),
  PromotionSection: lightStub('PromotionSection', 'stub-promo'),
  MenuItemsByShopTable: lightStub('MenuItemsByShopTable', 'stub-table'),
}

let warns
beforeEach(() => {
  jest.clearAllMocks()
  getEventIdsWithPredictVersions.mockResolvedValue([])
  warns = []
  jest.spyOn(console, 'warn').mockImplementation((...a) => { warns.push(String(a[0])) })
})
afterEach(() => {
  console.warn.mockRestore()
  expect(warns.filter((m) => !m.includes('Failed to resolve component'))).toEqual([])
})

const tick = () => new Promise((r) => setTimeout(r, 0))

function mountContent({ view = 'form', state = 'ready', runtimeOver = {} } = {}) {
  store.getters = { 'analyse/analysableEvents': EVENTS, 'analyse/filteredEvents': EVENTS, 'analyse/uniqueDoorsOpenings': [], 'analyse/uniqueShowTimes': [] }
  const runtime = fakeRuntime(runtimeOver)
  runtime.state.value = state
  const ctx = {}
  const Harness = defineComponent({
    setup(_, { expose }) {
      const comparison = useComparisonDrawer({ leftOpen: ref(true), summaryOpen: ref(true) })
      comparison.openDrawer()
      comparison.run({ ...APPLIED })
      comparison.setView(view)
      const form = useComparisonForm({ mainFilters: ref(MAIN), mainEvents: ref(EVENTS), translate: (k) => k, locale: 'fr', enabled: ref(true) })
      Object.assign(ctx, { comparison, form })
      expose({})
      return () => h(ComparisonDrawerContent, {
        comparison, form, runtime,
        onExportCsv: ctx.onExportCsv, onCopy: ctx.onCopy, onShare: ctx.onShare,
      })
    },
  })
  ctx.onExportCsv = jest.fn(); ctx.onCopy = jest.fn(); ctx.onShare = jest.fn()
  const w = mount(Harness, { global: globalMountOptions({ stubs }) })
  return { w, runtime, ctx }
}

describe('ComparisonDrawerContent', () => {
  it('vue form : formulaire affiché, pas de rapport', async () => {
    const { w, ctx } = mountContent({ view: 'form' })
    await tick(); await nextTick()
    expect(w.find('select').exists()).toBe(true)
    expect(w.find('#comparison-capture-root').exists()).toBe(false)
    expect(ctx.comparison.view.value).toBe('form')
  })

  it('vue loading : squelettes et progression', () => {
    const { w } = mountContent({ view: 'loading', state: 'loading' })
    expect(w.find('.cl').exists()).toBe(true)
    expect(w.find('[role="progressbar"]').exists()).toBe(true)
  })

  it('vue error : message, Réessayer relance, Modifier ramène au formulaire', async () => {
    const { w, runtime, ctx } = mountContent({ view: 'error', state: 'error', runtimeOver: { error: ref('Echec réseau') } })
    expect(w.find('.cer').exists()).toBe(true)
    expect(w.text()).toContain('Echec réseau')
    const [retry, edit] = w.findAll('.cer button')
    await retry.trigger('click')
    expect(runtime.retry).toHaveBeenCalledTimes(1)
    await edit.trigger('click')
    expect(ctx.comparison.view.value).toBe('form')
  })

  it('vue ready + état empty : encart vide, Modifier ramène au formulaire', async () => {
    const { w, ctx } = mountContent({ view: 'ready', state: 'empty' })
    expect(w.find('.ce').exists()).toBe(true)
    await w.find('.ce button').trigger('click')
    expect(ctx.comparison.view.value).toBe('form')
  })

  it('vue ready : rapport, et les trois actions remontent au parent', async () => {
    const { w, ctx } = mountContent({ view: 'ready', state: 'ready' })
    expect(w.find('#comparison-capture-root').exists()).toBe(true)
    const [, exp, copy, share] = w.findAll('header.cb button')
    await exp.trigger('click')
    await copy.trigger('click')
    await share.trigger('click')
    expect(ctx.onExportCsv).toHaveBeenCalledTimes(1)
    expect(ctx.onCopy).toHaveBeenCalledTimes(1)
    expect(ctx.onShare).toHaveBeenCalledTimes(1)
  })

  it('vue ready mais état idle/loading : repli sur le chargement', () => {
    const { w } = mountContent({ view: 'ready', state: 'loading' })
    expect(w.find('.cl').exists()).toBe(true)
  })
})
