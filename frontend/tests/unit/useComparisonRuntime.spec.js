import { ref, shallowRef, computed, nextTick } from 'vue'
import { useComparisonRuntime, widgetDeltasFrom } from '@/composables/useComparisonRuntime'
import { useComparisonDrawer } from '@/composables/useComparisonDrawer'
import { useComparisonSession, clearComparisonSession } from '@/composables/useComparisonSession'

jest.mock('@/store', () => ({ __esModule: true, default: { state: {}, getters: {} } }))
jest.mock('@/composables/useComparisonReport', () => ({ useComparisonReport: jest.fn() }))
// Écart factice : "A par rapport à B" identifiable par les étiquettes des snapshots.
jest.mock('@/utils/comparisonDeltas', () => ({
  computeReportDeltas: jest.fn((a, b) => (a && b ? { from: a.tag, vs: b.tag, widgets: { margin: { text: `${a.tag}/${b.tag}` } } } : null)),
}))

const MODEL = { kind: 'period', period: 'prev' }

// Moteur factice : tout est piloté par des refs.
function fakeEngine() {
  const eng = {
    status: ref('idle'),
    snapshot: ref(null),
    sameAsMain: ref(false),
    inputs: [],
  }
  const factory = (args) => {
    eng.args = args
    return {
      status: computed(() => (args.input.value ? eng.status.value : 'idle')),
      snapshot: computed(() => (args.input.value ? eng.snapshot.value : null)),
      sameAsMain: eng.sameAsMain,
      progress: computed(() => ({ loaded: 1, total: 2 })),
      error: computed(() => null),
      appliedFilters: computed(() => []),
      excludedEvents: computed(() => []),
      truncation: computed(() => ({ truncated: false })),
      intraEventRangeIgnored: computed(() => false),
      isPredict: computed(() => false),
      events: computed(() => []),
      clearCache: jest.fn(),
    }
  }
  return { eng, factory }
}

function setup(over = {}) {
  const panels = { leftOpen: ref(true), summaryOpen: ref(true) }
  const comparison = useComparisonDrawer(panels)
  const mainFilters = ref({ timeRange: '12m', selectedEventIds: [] })
  const mainEvents = shallowRef([{ id: 'm1', name: 'M1', date: '2026-01-01' }])
  const mainSnapshot = shallowRef({ tag: 'main' })
  const mainChartRecords = shallowRef([{ eventId: 'm1', revenue: 10 }])
  const { eng, factory } = fakeEngine()
  const runtime = useComparisonRuntime({
    comparison, mainFilters, mainEvents, mainSnapshot, mainChartRecords,
    spaceId: ref('s1'), canView: ref(true), translate: (k) => k,
    createReport: factory, ...over,
  })
  return { comparison, runtime, eng, mainFilters, mainEvents, mainSnapshot, mainChartRecords }
}

describe('useComparisonRuntime', () => {
  beforeEach(() => { jest.useFakeTimers(); clearComparisonSession() })
  afterEach(() => { jest.useRealTimers(); clearComparisonSession() })

  it('reste idle (input nul, canView faux) tant que le drawer est fermé ou sans modèle', async () => {
    const { comparison, runtime, eng } = setup()
    expect(runtime.state.value).toBe('idle')
    expect(eng.args.input.value).toBeNull()
    comparison.openDrawer()
    await nextTick()
    expect(eng.args.input.value).toBeNull()
    expect(eng.args.canView.value).toBe(false)
    expect(runtime.state.value).toBe('idle')
  })

  it('alimente le moteur à l application et suit loading -> ready dans la vue du drawer', async () => {
    const { comparison, runtime, eng } = setup()
    comparison.openDrawer()
    eng.status.value = 'loading'
    comparison.run(MODEL)
    await nextTick()
    expect(eng.args.input.value).toEqual(MODEL)
    expect(eng.args.canView.value).toBe(true)
    expect(runtime.state.value).toBe('loading')
    expect(comparison.view.value).toBe('loading')
    eng.snapshot.value = { tag: 'cmp' }
    eng.status.value = 'ready'
    await nextTick()
    expect(runtime.state.value).toBe('ready')
    expect(comparison.view.value).toBe('ready')
  })

  it('calcule les écarts dans les deux sens et les pose dans la session', async () => {
    const { comparison, runtime, eng } = setup()
    comparison.openDrawer()
    eng.snapshot.value = { tag: 'cmp' }
    eng.status.value = 'ready'
    comparison.run(MODEL)
    await nextTick()
    expect(runtime.deltasVsMain.value).toMatchObject({ from: 'cmp', vs: 'main' })
    expect(runtime.mainDeltasVsComparison.value).toMatchObject({ from: 'main', vs: 'cmp' })
    expect(runtime.widgetDeltas.value.margin.text).toBe('cmp/main')
    expect(useComparisonSession().mainDeltas.value).toMatchObject({ from: 'main', vs: 'cmp' })
  })

  it('vide la session à la fermeture, en vue form, en erreur et en rapport vide', async () => {
    const { comparison, eng } = setup()
    const session = useComparisonSession()
    comparison.openDrawer()
    eng.snapshot.value = { tag: 'cmp' }
    eng.status.value = 'ready'
    comparison.run(MODEL)
    await nextTick()
    expect(session.isActive.value).toBe(true)

    comparison.showForm()
    await nextTick()
    expect(session.isActive.value).toBe(false)

    comparison.backToReport()
    await nextTick()
    expect(session.isActive.value).toBe(true)

    eng.status.value = 'error'
    await nextTick()
    expect(session.isActive.value).toBe(false)
    expect(comparison.view.value).toBe('error')

    eng.status.value = 'empty'
    await nextTick()
    expect(session.isActive.value).toBe(false)
    expect(comparison.view.value).toBe('ready')

    eng.status.value = 'ready'
    await nextTick()
    expect(session.isActive.value).toBe(true)
    comparison.closeDrawer()
    await nextTick()
    expect(session.isActive.value).toBe(false)
  })

  it('ne pose pas d écart si les mêmes events (snapshot sans comparaison)', async () => {
    const { comparison, runtime, eng } = setup()
    comparison.openDrawer()
    eng.sameAsMain.value = true
    eng.snapshot.value = { tag: 'cmp' }
    eng.status.value = 'ready'
    comparison.run(MODEL)
    await nextTick()
    expect(runtime.deltasVsMain.value).toBeNull()
    expect(useComparisonSession().isActive.value).toBe(false)
  })

  it('ne touche pas la vue form et n impose rien quand l utilisateur modifie ses critères', async () => {
    const { comparison, eng } = setup()
    comparison.openDrawer()
    eng.status.value = 'ready'
    eng.snapshot.value = { tag: 'cmp' }
    comparison.run(MODEL)
    await nextTick()
    comparison.showForm()
    eng.status.value = 'loading'
    await nextTick()
    eng.status.value = 'ready'
    await nextTick()
    expect(comparison.view.value).toBe('form')
  })

  it('recalcule avec debounce 400 ms quand le principal change, sans clignoter', async () => {
    const { comparison, runtime, eng, mainFilters } = setup()
    comparison.openDrawer()
    eng.status.value = 'ready'
    eng.snapshot.value = { tag: 'cmp' }
    comparison.run(MODEL)
    await nextTick()
    const before = eng.args.mainFilters.value
    expect(before.timeRange).toBe('12m')

    mainFilters.value = { ...mainFilters.value, timeRange: '3m' }
    await nextTick()
    expect(runtime.pending.value).toBe(true)
    jest.advanceTimersByTime(399)
    expect(eng.args.mainFilters.value.timeRange).toBe('12m')
    // Un second changement relance le délai.
    mainFilters.value = { ...mainFilters.value, timeRange: '6m' }
    await nextTick()
    jest.advanceTimersByTime(399)
    expect(eng.args.mainFilters.value.timeRange).toBe('12m')
    jest.advanceTimersByTime(1)
    await nextTick()
    expect(eng.args.mainFilters.value.timeRange).toBe('6m')
    expect(runtime.pending.value).toBe(false)
  })

  it('garde le rapport sous un voile (refreshing) et les derniers écarts pendant un rechargement', async () => {
    const { comparison, runtime, eng } = setup()
    comparison.openDrawer()
    eng.status.value = 'ready'
    eng.snapshot.value = { tag: 'cmp' }
    comparison.run(MODEL)
    await nextTick()
    eng.status.value = 'loading'
    eng.snapshot.value = null
    await nextTick()
    expect(runtime.state.value).toBe('ready')
    expect(runtime.refreshing.value).toBe(true)
    expect(runtime.deltasVsMain.value).not.toBeNull()
    expect(comparison.view.value).toBe('ready')
    expect(useComparisonSession().isActive.value).toBe(true)
  })

  it('un nouveau modèle repart sur des squelettes (pas de voile)', async () => {
    const { comparison, runtime, eng } = setup()
    comparison.openDrawer()
    eng.status.value = 'ready'
    eng.snapshot.value = { tag: 'cmp' }
    comparison.run(MODEL)
    await nextTick()
    eng.status.value = 'loading'
    eng.snapshot.value = null
    comparison.run({ ...MODEL, period: 'n1' })
    await nextTick()
    expect(runtime.state.value).toBe('loading')
    expect(runtime.refreshing.value).toBe(false)
    expect(comparison.view.value).toBe('loading')
  })

  it('aucune surveillance du principal drawer fermé (pas de timer)', async () => {
    const { runtime, mainFilters } = setup()
    mainFilters.value = { ...mainFilters.value, timeRange: '1m' }
    await nextTick()
    expect(runtime.pending.value).toBe(false)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('construit la tendance du principal une fois prêt', async () => {
    const { comparison, runtime, eng } = setup()
    comparison.openDrawer()
    expect(runtime.trend.value).toBeNull()
    eng.status.value = 'ready'
    eng.snapshot.value = { tag: 'cmp' }
    comparison.run(MODEL)
    await nextTick()
    expect(runtime.trend.value).toHaveLength(1)
    expect(runtime.trend.value[0]).toMatchObject({ value: 10, name: 'M1' })
  })

  it('widgetDeltasFrom renvoie null sans widgets', () => {
    expect(widgetDeltasFrom(null)).toBeNull()
  })
})
