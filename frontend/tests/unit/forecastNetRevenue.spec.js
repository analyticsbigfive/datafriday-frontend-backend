/**
 * Forecast : coût, marge et Revenue net du comparé. Le coût suit la QUANTITÉ du record : un prix
 * modifié sans élasticité change le CA et le revenu net, jamais le coût. Sans modification, le
 * comparé a exactement le coût du principal (écart nul).
 */
import { computed, ref } from 'vue'
import { useMetricsCalculator } from '@/composables/useMetricsCalculator'
import { usePredictCostEstimator } from '@/composables/usePredictCostEstimator'
import { applyForecastModifications } from '@/utils/forecastApplyModifications'
import { chipsFromMetrics } from '@/utils/comparisonReportSnapshot'
import { computeReportDeltas } from '@/utils/comparisonDeltas'
import {
  FORECAST_MODIFICATION_TYPES as T,
  createModification,
} from '@/utils/forecastModificationModel'

const COSTS = { beer: 2 }
const art = (over) => ({
  eventId: 'past', shopId: 's1', shopName: 'Bar A', menuItemId: 'beer', menuItemCategory: 'Bières',
  menuItemType: 'Boisson', quantity: 10, revenue: 100, transactionCount: 8, ...over,
})
const chart = (over) => ({
  eventId: 'past', shopId: 's1', shopName: 'Bar A', menuItemId: null, quantity: 10, revenue: 100, transactionCount: 8, ...over,
})

// Un event passé avec grain article, un event futur prédit au seul grain PdV.
const base = () => ({
  articleRecords: [art({})],
  chartRecords: [chart({}), chart({ eventId: 'future', isPredictive: true, quantity: 20, revenue: 200 })],
})

function chipsOf(chartRecords, articleRecords) {
  const estimator = usePredictCostEstimator({
    enabled: true,
    articleRecords: ref(articleRecords),
    menuItemCostMap: ref(COSTS),
  })
  const metrics = useMetricsCalculator({
    filteredShopGranularData: ref(chartRecords),
    chartFilteredEvents: ref([{ id: 'past' }, { id: 'future' }]),
    menuItemCostMap: ref(COSTS),
    isTimelineFilterActive: ref(false),
    operatingMinutes: computed(() => 360),
    selectedEventIds: computed(() => []),
    perShopTransactionRate: ref(null),
    costEstimator: estimator,
  })
  return { chips: chipsFromMetrics(metrics, { isPredict: true, predictTransactions: true }), metrics }
}

describe('Forecast : coût, marge et Revenue net', () => {
  it('principal : coût = quantité x coût par pièce du PdV, y compris pour l\'event prédit sans article', () => {
    const d = base()
    const { chips, metrics } = chipsOf(d.chartRecords, d.articleRecords)
    // 30 pièces x 2 EUR : 10 de l'event passé (exact) + 20 de l'event futur (coût moyen du PdV).
    expect(chips.cost).toBeCloseTo(60)
    expect(chips.revenue).toBeCloseTo(300)
    expect(chips.netRevenue).toBeCloseTo(240)
    expect(metrics.margin.value).toBeCloseTo(80)
    expect(metrics.costResolvable.value).toBe(true)
  })

  it('prix modifié sans élasticité : le CA et le revenu net bougent, le coût reste identique', () => {
    const d = base()
    const main = chipsOf(d.chartRecords, d.articleRecords).chips
    const out = applyForecastModifications({
      ...d, modifications: [createModification(T.CATEGORY_PCT, { target: 'Bières', value: 10 })],
    })
    const cmp = chipsOf(out.chartRecords, d.articleRecords).chips
    expect(cmp.revenue).toBeGreaterThan(main.revenue)
    expect(cmp.cost).toBeCloseTo(main.cost, 6)
    expect(cmp.netRevenue).toBeCloseTo(cmp.revenue - main.cost)
  })

  it('sans modification : coût, revenu net et écart identiques au principal', () => {
    const d = base()
    const main = chipsOf(d.chartRecords, d.articleRecords).chips
    const out = applyForecastModifications({ ...d, modifications: [] })
    const cmp = chipsOf(out.chartRecords, d.articleRecords).chips
    expect(cmp.cost).toBe(main.cost)
    expect(cmp.netRevenue).toBe(main.netRevenue)
    const snap = (chips) => ({ chips, widgets: {}, categories: [], breakdowns: {}, shopDistribution: {}, itemsByShop: [] })
    const delta = computeReportDeltas(snap(cmp), snap(main)).chips.netRevenue
    expect(delta.kind).toBe('delta')
    expect(delta.text).toBe('= 0,0 %')
  })

  it('écart du revenu net : (comparé - principal) / principal', () => {
    const snap = (netRevenue) => ({ chips: { netRevenue }, widgets: {}, categories: [], breakdowns: {}, shopDistribution: {}, itemsByShop: [] })
    const d = computeReportDeltas(snap(252), snap(240)).chips.netRevenue
    expect(d.delta).toBeCloseTo(5)
    expect(d.text).toBe('▲ 5,0 %')
    expect(d.tone).toBe('good')
    // Principal sans revenu net (coût inconnu) : pas d'écart, « — ».
    expect(computeReportDeltas(snap(252), snap(null)).chips.netRevenue.kind).toBe('none')
  })

  it('aucun coût connu : coût 0, marge et revenu net « — » (jamais CA - 0)', () => {
    const d = base()
    const estimator = usePredictCostEstimator({ enabled: true, articleRecords: ref([]), menuItemCostMap: ref(COSTS) })
    const metrics = useMetricsCalculator({
      filteredShopGranularData: ref(d.chartRecords),
      chartFilteredEvents: ref([{ id: 'past' }]),
      menuItemCostMap: ref(COSTS),
      isTimelineFilterActive: ref(false),
      operatingMinutes: computed(() => 180),
      selectedEventIds: computed(() => []),
      perShopTransactionRate: ref(null),
      costEstimator: estimator,
    })
    const chips = chipsFromMetrics(metrics, { isPredict: true, predictTransactions: true })
    expect(chips.cost).toBe(0)
    expect(metrics.margin.value).toBeNull()
    expect(chips.netRevenue).toBeNull()
  })

  it('estimateur désactivé (Analyse) : calcul au grain article, inchangé', () => {
    const estimator = usePredictCostEstimator({ enabled: false, articleRecords: ref([]), menuItemCostMap: ref(COSTS) })
    expect(estimator.value).toBeNull()
    const metrics = useMetricsCalculator({
      filteredShopGranularData: ref([art({})]),
      chartFilteredEvents: ref([{ id: 'past' }]),
      menuItemCostMap: ref(COSTS),
      isTimelineFilterActive: ref(false),
      operatingMinutes: computed(() => 180),
      selectedEventIds: computed(() => []),
      perShopTransactionRate: ref(null),
      costEstimator: estimator,
    })
    expect(metrics.totalCost.value).toBe(20)
    expect(metrics.margin.value).toBeCloseTo(80)
  })
})
