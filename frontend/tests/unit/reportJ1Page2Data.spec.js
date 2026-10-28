import { ref, computed } from 'vue'
import { toBuildContext, isReportSettled, waitUntil } from '@/composables/useReportJ1Page2Data'
import { slotBox, CELL_W, CELL_H, GRID_GAP } from '@/utils/reportJ1Page2Geometry'

jest.mock('@/composables/useComparisonReport', () => ({ useComparisonReport: jest.fn() }))

const report = (over = {}) => ({
  status: ref('ready'),
  dimensionsStatus: ref('ready'),
  rendementCards: computed(() => ({ stockValue: { loading: false } })),
  rendementRaw: ref({ stockValue: 5 }),
  chartRecords: ref([{ revenue: 1 }]),
  articleRecords: ref([{ revenue: 2 }]),
  itemLevelRecords: ref([{ revenue: 3 }]),
  filteredBaskets: ref([{ id: 'b' }]),
  events: computed(() => [{ id: 'e1' }]),
  dimensionsIndex: ref(new Map()),
  metrics: { displayRevenue: ref(10) },
  ...over,
})

describe('toBuildContext', () => {
  it('mappe les sorties du rapport vers le contexte', () => {
    const t = (k) => k
    const ctx = toBuildContext(report(), t)
    expect(ctx.chartRecords).toEqual([{ revenue: 1 }])
    expect(ctx.articleRecords).toEqual([{ revenue: 2 }])
    expect(ctx.itemRecords).toEqual([{ revenue: 3 }])
    expect(ctx.baskets).toEqual([{ id: 'b' }])
    expect(ctx.events).toEqual([{ id: 'e1' }])
    expect(ctx.rendementRaw).toEqual({ stockValue: 5 })
    expect(ctx.dimensionsStatus).toBe('ready')
    expect(ctx.shopRates).toEqual([])
    expect(ctx.t).toBe(t)
  })

  it('tolère un rapport vide', () => {
    const ctx = toBuildContext({}, (k) => k)
    expect(ctx.chartRecords).toEqual([])
    expect(ctx.dimensionsStatus).toBe('idle')
    expect(ctx.metrics).toBeNull()
  })
})

describe('isReportSettled', () => {
  it('attend le statut, les dimensions et le stock', () => {
    expect(isReportSettled(report())).toBe(true)
    expect(isReportSettled(report({ status: ref('loading') }))).toBe(false)
    expect(isReportSettled(report({ status: ref('idle') }))).toBe(false)
    expect(isReportSettled(report({ dimensionsStatus: ref('loading') }))).toBe(false)
    expect(isReportSettled(report({ dimensionsStatus: ref('error') }))).toBe(true)
    expect(isReportSettled(report({ rendementCards: ref({ stockValue: { loading: true } }) }))).toBe(false)
  })

  it('sans permission financière, dimensions et stock ne sont pas attendus', () => {
    const r = report({ dimensionsStatus: ref('idle'), rendementCards: ref({ stockValue: { loading: true } }) })
    expect(isReportSettled(r, { canView: false })).toBe(true)
  })
})

describe('waitUntil', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('résout true quand la condition devient vraie', async () => {
    const flag = ref(false)
    const p = waitUntil(() => flag.value, 1000)
    flag.value = true
    await expect(p).resolves.toBe(true)
  })

  it('résout true tout de suite si déjà vrai', async () => {
    await expect(waitUntil(() => true, 1000)).resolves.toBe(true)
  })

  it('résout false au timeout', async () => {
    const p = waitUntil(() => false, 1000)
    jest.advanceTimersByTime(1001)
    await expect(p).resolves.toBe(false)
  })
})

describe('slotBox', () => {
  it('une case 2x2 cumule les gaps', () => {
    const b = slotBox(2, 2)
    expect(b.width).toBe(2 * CELL_W + GRID_GAP)
    expect(b.height).toBe(2 * CELL_H + GRID_GAP)
    expect(b.renderWidth).toBeLessThan(b.width)
    expect(b.renderHeight).toBeGreaterThan(0)
  })
})
