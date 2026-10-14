/**
 * useComparisonExport : CSV du rapport de comparaison (vrai useAnalyseDataset en mode standalone,
 * vrai useAnalyseExport), table d'écarts, nom de fichier, non-pollution du dataset du principal.
 */
import { defineComponent, computed, ref, shallowRef, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createStore } from 'vuex'
import { useComparisonExport } from '@/composables/useComparisonExport'
import { fakeRuntime, fakeComparison } from './helpers/comparisonFixtures'
import { buildReportSnapshot } from '@/utils/comparisonReportSnapshot'
import { computeReportDeltas } from '@/utils/comparisonDeltas'

function makeStore() {
  return createStore({
    modules: {
      analyse: {
        namespaced: true,
        state: () => ({ selectedToolbox: 'analyse', dataset: 'PRINCIPAL', menuItemCostMap: {} }),
        mutations: { SET_ANALYSE_DATASET(state, v) { state.dataset = v || null } },
      },
    },
  })
}

function snap(revenue) {
  return buildReportSnapshot({
    isPredict: false, eventCount: 2,
    chips: { revenue, avgRevenuePerEvent: revenue / 2, cost: 10, transactions: 4, avgTransaction: 5, attendees: 100, transferRate: 4, perCapita: 1 },
    widgets: { revenuePerTpe: 1, revenuePerCollaborator: 2, margin: 50, transactionRate: 1, stockValue: null },
    chartRecords: [], articleRecords: [], dimensionsIndex: null,
  })
}

let captured
let RealBlob
let anchor
beforeEach(() => {
  captured = []
  RealBlob = global.Blob
  global.Blob = function FakeBlob(parts) { captured.push(parts.join('')) }
  global.URL.createObjectURL = jest.fn(() => 'blob:test')
  global.URL.revokeObjectURL = jest.fn()
  const realCreate = document.createElement.bind(document)
  anchor = { click: jest.fn(), href: '', download: '' }
  jest.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'a' ? anchor : realCreate(tag)))
})
afterEach(() => {
  global.Blob = RealBlob
  document.createElement.mockRestore()
})

function mountExport({ runtimeOver = {}, stateValue = 'ready' } = {}) {
  const store = makeStore()
  const notify = jest.fn()
  const api = {}
  const rt = fakeRuntime(runtimeOver)
  rt.state.value = stateValue
  const A = snap(200)
  const B = snap(100)
  rt.report.snapshot = computed(() => A)
  rt.report.filters = computed(() => ({ timeRange: 'season:2025' }))
  rt.deltasVsMain.value = computeReportDeltas(A, B)
  const Host = defineComponent({
    setup() {
      Object.assign(api, useComparisonExport({
        comparison: fakeComparison(),
        runtime: rt,
        mainSnapshot: shallowRef(B),
        spaceName: computed(() => 'Stade Océane'),
        notify,
      }))
      return () => null
    },
  })
  mount(Host, { global: { plugins: [store] } })
  return { api, store, notify, rt }
}

describe('useComparisonExport', () => {
  it('exporte un CSV Excel FR avec la table « Écarts vs principal » après les KPI', () => {
    const { api } = mountExport()
    api.exportCsv()
    expect(captured).toHaveLength(1)
    const csv = captured[0]
    expect(csv.startsWith('﻿')).toBe(true)
    const titles = csv.split('\r\n').filter((l) => l.startsWith('# '))
    const iKpi = titles.findIndex((l) => l.includes('KPI'))
    const iDelta = titles.findIndex((l) => l.includes('Écarts vs principal'))
    expect(iKpi).toBeGreaterThanOrEqual(0)
    expect(iDelta).toBe(iKpi + 1)
    // Écart de CA : 200 vs 100 = +100 %, décimales en virgule.
    expect(csv).toMatch(/CA;200;100;100;%/)
    // Colonnes « vs précédent » du principal retirées du tableau KPI.
    expect(csv).not.toContain('vs précédent')
    // Libellé de la comparaison dans les paramètres.
    expect(csv).toMatch(/Comparaison;/)
  })

  it('nomme le fichier avec l\'espace, le libellé et la date', () => {
    const { api } = mountExport()
    api.exportCsv()
    expect(anchor.download).toMatch(/^comparaison-stade-oceane-.*\d{4}-\d{2}-\d{2}\.csv$/)
    expect(api.fileBase()).toBe(anchor.download.replace('.csv', ''))
  })

  it('ne touche jamais au dataset du principal dans le store', () => {
    const { api, store } = mountExport()
    api.exportCsv()
    expect(store.state.analyse.dataset).toBe('PRINCIPAL')
  })

  it('refuse d\'exporter pendant le chargement, la mise à jour ou le debounce', () => {
    const loading = mountExport({ stateValue: 'loading' })
    expect(loading.api.canExport.value).toBe(false)
    loading.api.exportCsv()
    const refreshing = mountExport({ runtimeOver: { refreshing: ref(true) } })
    expect(refreshing.api.canExport.value).toBe(false)
    const pending = mountExport({ runtimeOver: { pending: ref(true) } })
    expect(pending.api.canExport.value).toBe(false)
    expect(captured).toHaveLength(0)
  })

  it('signale une erreur dans le snackbar si la construction échoue', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { api, notify, rt } = mountExport()
    rt.deltasVsMain = computed(() => { throw new Error('boom') })
    api.exportCsv()
    await nextTick()
    expect(notify).toHaveBeenCalledWith(expect.any(String), 'error')
    expect(captured).toHaveLength(0)
    err.mockRestore()
  })
})
