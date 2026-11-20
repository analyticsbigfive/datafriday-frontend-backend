/**
 * ComparisonDrawerContent : aiguillage des vues form / loading / error / empty / ready,
 * avec le vrai formulaire (useComparisonForm) et le vrai rapport (cartes lourdes stubbées).
 */
jest.mock('@/store', () => ({
  __esModule: true,
  default: { state: { seasons: { seasons: [] } }, getters: {}, commit: jest.fn(), dispatch: jest.fn() },
}))
jest.mock('@/api/endpoints/eventPredict.api', () => ({ listEventPredictVersions: jest.fn(), getEventIdsWithPredictVersions: jest.fn() }))
// La page 2 du rapport J+1 (bouton « + » des widgets) charge sa mise en page par l'API : stubbée,
// sinon l'import d'axios (ESM) fait échouer le fichier avant tout test.
jest.mock('@/api/endpoints/report-layout.api', () => ({
  getJ1Page2Layout: jest.fn().mockResolvedValue({ layout: { version: 1, slots: [] }, version: 1 }),
  putJ1Page2Layout: jest.fn().mockResolvedValue({ layout: { version: 1, slots: [] }, version: 1 }),
}))
jest.mock('vuetify', () => ({ useTheme: () => ({ global: { current: { value: { dark: false } } } }) }))
jest.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: jest.fn() }) }))

import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import store from '@/store'
import { getEventIdsWithPredictVersions } from '@/api/endpoints/eventPredict.api'
import { useComparisonForm } from '@/composables/useComparisonForm'
import { useComparisonDrawer } from '@/composables/useComparisonDrawer'
import { useForecastModificationsForm } from '@/composables/useForecastModificationsForm'
import ComparisonDrawerContent from '@/components/space-workspace/analyse/comparison/ComparisonDrawerContent.vue'
import { globalMountOptions, fakeRuntime, APPLIED } from './helpers/comparisonFixtures'

const EVENTS = [
  { id: 'e1', name: 'Match 1', date: '2026-01-10', eventType: 'Sport', category: 'Basket', doorsOpening: '18:00', showTime: '20:00' },
]
const MAIN = { timeRange: 'last12months', startDate: null, endDate: null, temperatureRange: [-10, 45], selectedEventTypes: [], selectedEventCategories: [], selectedSubcategories: [] }

const FORECAST_RECORDS = [
  { eventId: 'e1', shopId: 's1', menuItemId: 'm1', menuItemName: 'Bière blonde', menuItemCategory: 'Bières', menuItemType: 'Boisson', quantity: 1, revenue: 8 },
]
const FORECAST_CATALOG = new Map([['m1', { id: 'm1', name: 'Bière blonde', basePrice: 8, pricing: { vatRate: 10 } }]])
const FORECAST_BASES = { transformationRate: 12.5, perCapita: 8, basket: 15 }

const lightStub = (name, cls) => ({ name, props: { records: Array, events: Array, deltas: Object, trend: Array, readonly: Boolean, embedded: Boolean, isPredictMode: Boolean, dimensionsIndex: null, dimensionsStatus: String, status: String, mode: String }, template: `<div class="${cls}" />` })
const stubs = {
  EventRevenueByShopChart: lightStub('EventRevenueByShopChart', 'stub-chart'),
  ShopDistributionPieChart: lightStub('ShopDistributionPieChart', 'stub-shopdist'),
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

function mountContent({ view = 'form', state = 'ready', runtimeOver = {}, forecast = false } = {}) {
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
      const forecastForm = forecast
        ? useForecastModificationsForm({ articleRecords: FORECAST_RECORDS, catalogById: FORECAST_CATALOG })
        : null
      Object.assign(ctx, { comparison, form, forecastForm })
      expose({})
      return () => h(ComparisonDrawerContent, {
        comparison, form, runtime,
        ...(forecast ? { forecastForm, forecastBaseValues: FORECAST_BASES } : {}),
        onExportCsv: ctx.onExportCsv, onCopy: ctx.onCopy, onShare: ctx.onShare,
      })
    },
  })
  ctx.onExportCsv = jest.fn(); ctx.onCopy = jest.fn(); ctx.onShare = jest.fn()
  const w = mount(Harness, { global: { ...globalMountOptions({ stubs }), provide: { store } } })
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

  it('sans forecastForm : le formulaire de comparaison, jamais celui du Forecast', async () => {
    const { w } = mountContent({ view: 'form' })
    await tick(); await nextTick()
    expect(w.find('.fc-form').exists()).toBe(false)
    expect(w.find('form.cf-form').exists()).toBe(true)
  })

  it('avec forecastForm, vue form : le formulaire Forecast remplace celui de la comparaison', async () => {
    const { w } = mountContent({ view: 'form', forecast: true })
    await tick(); await nextTick()
    expect(w.find('form.fc-form').exists()).toBe(true)
    expect(w.find('.cf-evlist').exists()).toBe(false)
    expect(w.find('.cf-pv__n').exists()).toBe(false)
    expect(w.findAll('select')[0].findAll('option')).toHaveLength(6)
  })

  it('avec forecastForm, hors vue form : le rapport habituel est affiché', async () => {
    const { w } = mountContent({ view: 'ready', state: 'ready', forecast: true })
    expect(w.find('form.fc-form').exists()).toBe(false)
    expect(w.find('#comparison-capture-root').exists()).toBe(true)
  })

  it('rapport Forecast : l\'encart de périmètre apparaît avec des events sans prévision par article', () => {
    const forecastStats = ref({ priceModificationCount: 1, eventsWithArticleGrain: ['e1'], eventsWithoutArticleGrain: ['e2', 'e3'] })
    const { w } = mountContent({ view: 'ready', state: 'ready', forecast: true, runtimeOver: { forecastStats } })
    const notice = w.find('.fsn')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('2 événement(s)')
  })

  it('rapport sans forecastStats ou sans événement concerné : pas d\'encart de périmètre', () => {
    expect(mountContent({ view: 'ready', state: 'ready' }).w.find('.fsn').exists()).toBe(false)
    const none = ref({ priceModificationCount: 1, eventsWithArticleGrain: ['e1'], eventsWithoutArticleGrain: [] })
    expect(mountContent({ view: 'ready', state: 'ready', runtimeOver: { forecastStats: none } }).w.find('.fsn').exists()).toBe(false)
  })

  it('Forecast : Appliquer enregistre le modèle forecast et passe en chargement', async () => {
    const { w, ctx } = mountContent({ view: 'form', forecast: true })
    await tick(); await nextTick()
    await w.findAll('select')[0].setValue('basket')
    await w.find('input[type="range"]').setValue(10)
    await w.find('.fc-add').trigger('click')
    await w.find('.fc-btn--primary').trigger('click')
    expect(ctx.comparison.view.value).toBe('loading')
    expect(ctx.comparison.applied.value.kind).toBe('forecast')
    expect(ctx.comparison.applied.value.modifications).toHaveLength(1)
    expect(ctx.comparison.applied.value.modifications[0]).toMatchObject({ type: 'basket', value: 10 })
  })

  it('Forecast : « Retour au rapport » revient au rapport (un rapport existe)', async () => {
    const { w, ctx } = mountContent({ view: 'form', forecast: true })
    await tick(); await nextTick()
    const back = w.findAll('.fc-btn--ghost')[1]
    expect(back).toBeDefined()
    await back.trigger('click')
    expect(ctx.comparison.view.value).toBe('ready')
  })

  it('Forecast : le brouillon survit au changement de vue (même instance)', async () => {
    const { w, ctx } = mountContent({ view: 'form', forecast: true })
    await tick(); await nextTick()
    await w.findAll('select')[0].setValue('basket')
    await w.find('input[type="range"]').setValue(5)
    await w.find('.fc-add').trigger('click')
    ctx.comparison.setView('ready')
    await nextTick()
    ctx.comparison.setView('form')
    await nextTick()
    expect(w.findAll('.fc-row')).toHaveLength(1)
  })
})
