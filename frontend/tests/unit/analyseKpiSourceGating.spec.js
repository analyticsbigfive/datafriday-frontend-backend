/**
 * BUG-350-01 — « aucune valeur provisoire nulle part » + cap item-level à 100.
 *
 * Contexte : l'écran Analyse publiait le repli shop-level comme un CA définitif,
 * puis le remplaçait par l'item-level quelques secondes plus tard (7 % d'écart
 * mesuré sur Jean Bouin, 28 % sur Auxerre — BUG-247-01). Deux moteurs de calcul
 * différents, pas deux étapes de chargement.
 *
 * Invariants couverts ici :
 *   - `sourceState` distingue 'loading' / 'ready' / 'empty' — le piège étant que
 *     `records.length === 0` est aussi un état TERMINAL (batch KO, PdV non mappés,
 *     dates d'event hors fenêtre). Le confondre avec « en cours » figerait l'écran
 *     sur un squelette éternel, pire que la valeur provisoire retirée ;
 *   - `truncatedEventCount` remonte dès que le périmètre dépasse le cap ;
 *   - le cap exposé vaut bien 100 (levée du différé BUG-298-01, JLH 2026-08-21) ;
 *   - `useMetricsCalculator.margin` vaut `null` — et non 100 — quand aucun coût
 *     n'est résolvable, cas STRUCTUREL sur les records shop-level dont la RPC
 *     force `menuItemId` à NULL.
 */
jest.mock('@/api/endpoints/space.api', () => ({
  getSpaceEventTimelineBatch: jest.fn(),
}))
jest.mock('vue-router', () => ({ useRoute: () => ({ params: { spaceId: 'sp-1' } }) }))
jest.mock('@/store', () => ({ state: { analyse: { menuItemCostMap: {} } } }))
jest.mock('@/composables/useReconciliationContext', () => ({
  useReconciliationContext: () => ({ value: {} }),
}))
jest.mock('@/utils/analyseReconciliation', () => ({ reconcileRecord: (r) => r }))
jest.mock('@/utils/timelineBucketing', () => ({
  preprocessTimelineRecords: (rows) => rows,
  hasActiveRange: () => false,
}))

import { computed, ref, nextTick } from 'vue'
import { getSpaceEventTimelineBatch } from '@/api/endpoints/space.api'
import {
  useAnalyseItemRecords,
  ITEM_LEVEL_EVENT_CAP,
} from '@/composables/useAnalyseItemRecords'
import { useMetricsCalculator } from '@/composables/useMetricsCalculator'
import { pickRevenueRecords, resolveKpiSourceState } from '@/utils/analyseRevenueSource'

const flush = async () => {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

const mkEvents = (n) => Array.from({ length: n }, (_, i) => ({ id: `ev-${i}` }))

describe('BUG-350-01 — cap item-level', () => {
  beforeEach(() => jest.clearAllMocks())

  it('expose un cap de 100 (différé BUG-298-01 levé)', () => {
    expect(ITEM_LEVEL_EVENT_CAP).toBe(100)
  })

  it('ne signale aucune troncature à exactement 100 events', async () => {
    getSpaceEventTimelineBatch.mockResolvedValue(new Map())
    const events = ref(mkEvents(100))
    const { truncatedEventCount } = useAnalyseItemRecords(computed(() => events.value))
    await flush()
    expect(truncatedEventCount.value).toBe(0)
  })

  it('signale la troncature au-delà du cap', async () => {
    getSpaceEventTimelineBatch.mockResolvedValue(new Map())
    const events = ref(mkEvents(101))
    const { truncatedEventCount } = useAnalyseItemRecords(computed(() => events.value))
    await flush()
    expect(truncatedEventCount.value).toBe(1)
  })
})

describe('BUG-350-01 — sourceState : loading / ready / empty', () => {
  beforeEach(() => jest.clearAllMocks())

  it("vaut 'empty' — jamais 'loading' — quand le périmètre est vide", async () => {
    getSpaceEventTimelineBatch.mockResolvedValue(new Map())
    const events = ref([])
    const { sourceState } = useAnalyseItemRecords(computed(() => events.value))
    await flush()
    expect(sourceState.value).toBe('empty')
  })

  it("vaut 'ready' dès qu'un record est disponible", async () => {
    getSpaceEventTimelineBatch.mockResolvedValue(
      new Map([['ev-0', [{ revenue: 10, quantity: 1 }]]]),
    )
    const events = ref(mkEvents(1))
    const { sourceState } = useAnalyseItemRecords(computed(() => events.value))
    await flush()
    expect(sourceState.value).toBe('ready')
  })

  it("vaut 'empty' après un batch en ÉCHEC (état terminal, pas un chargement)", async () => {
    getSpaceEventTimelineBatch.mockRejectedValue(new Error('boom'))
    const events = ref(mkEvents(2))
    const { sourceState, fetchError } = useAnalyseItemRecords(computed(() => events.value))
    await flush()
    // C'est LE cas qui figerait l'écran si l'état était un booléen `!length`.
    expect(sourceState.value).toBe('empty')
    expect(fetchError.value).toBeTruthy()
  })

  it("vaut 'empty' quand le batch répond mais ne renvoie aucune ligne", async () => {
    getSpaceEventTimelineBatch.mockResolvedValue(new Map([['ev-0', []]]))
    const events = ref(mkEvents(1))
    const { sourceState } = useAnalyseItemRecords(computed(() => events.value))
    await flush()
    expect(sourceState.value).toBe('empty')
  })
})

describe('BUG-350-01 — choix de source (analyseRevenueSource)', () => {
  const ITEM = [{ id: 'item' }]
  const SHOP = [{ id: 'shop' }]

  it('mode Analyse : item-level uniquement, AUCUN repli shop-level', () => {
    // Le cœur du bug : ce repli publiait un CA calculé par l'autre moteur comme
    // s'il était définitif (7,12 % d'écart sur Jean Bouin).
    expect(
      pickRevenueRecords({ isPredict: false, itemLevelRecords: [], shopLevelRecords: SHOP }),
    ).toEqual([])
    expect(
      pickRevenueRecords({ isPredict: false, itemLevelRecords: ITEM, shopLevelRecords: SHOP }),
    ).toEqual(ITEM)
  })

  it('mode PREDICT : le shop-level reste servi même sans item-level', () => {
    // Non-régression critique : en Predict le shop-level EST la source canonique
    // (la prédiction n'a pas de grain article et couvre les events à venir).
    // Retirer le repli sans cette exception blanchirait tout l'écran Predict.
    expect(
      pickRevenueRecords({ isPredict: true, itemLevelRecords: [], shopLevelRecords: SHOP }),
    ).toEqual(SHOP)
  })

  it('bascule de source : shop-level canonique sert le shop-level en Analyse', () => {
    expect(
      pickRevenueRecords({
        isPredict: false,
        itemLevelRecords: ITEM,
        shopLevelRecords: SHOP,
        canonicalSource: 'shop-level',
      }),
    ).toEqual(SHOP)
  })

  it('état : relaie l\'item-level en Analyse, force "ready" en Predict', () => {
    expect(resolveKpiSourceState({ isPredict: false, itemLevelState: 'loading' })).toBe('loading')
    expect(resolveKpiSourceState({ isPredict: false, itemLevelState: 'empty' })).toBe('empty')
    expect(resolveKpiSourceState({ isPredict: true, itemLevelState: 'loading' })).toBe('ready')
  })

  it('état : jamais de squelette quand le shop-level est canonique', () => {
    expect(
      resolveKpiSourceState({
        isPredict: false,
        itemLevelState: 'loading',
        canonicalSource: 'shop-level',
      }),
    ).toBe('ready')
  })
})

describe('BUG-350-01 — marge non calculable', () => {
  const build = (records, costMap) =>
    useMetricsCalculator({
      filteredShopGranularData: computed(() => records),
      chartFilteredEvents: computed(() => [{ id: 'ev-0', ticketsScanned: 100 }]),
      menuItemCostMap: computed(() => costMap),
      isTimelineFilterActive: computed(() => false),
      operatingMinutes: computed(() => 90),
      selectedEventIds: computed(() => []),
      overrideTransactionRate: computed(() => null),
    })

  it('renvoie null (et non 100) sur des records shop-level sans menuItemId', () => {
    // Reproduit le payload réel de la RPC get_space_shop_details : menuItemId
    // forcé à NULL → costMap[undefined] = 0 → marge 100 % par construction.
    const m = build(
      [{ eventId: 'ev-0', revenue: 1000, quantity: 40, menuItemId: null }],
      { 'mi-1': 2 },
    )
    expect(m.margin.value).toBeNull()
    expect(m.costResolvable.value).toBe(false)
  })

  it('renvoie null quand la costMap est vide (catalogue pas encore chargé)', () => {
    const m = build([{ eventId: 'ev-0', revenue: 1000, quantity: 40, menuItemId: 'mi-1' }], {})
    expect(m.margin.value).toBeNull()
  })

  it('calcule la marge dès que grain article ET coûts sont présents', () => {
    const m = build(
      [{ eventId: 'ev-0', revenue: 1000, quantity: 100, menuItemId: 'mi-1' }],
      { 'mi-1': 2 },
    )
    // coût = 2 × 100 = 200 → marge = (1000 − 200) / 1000 = 80 %
    expect(m.margin.value).toBeCloseTo(80, 5)
    expect(m.costResolvable.value).toBe(true)
  })

  it('renvoie null sur un CA nul (aucune marge définissable)', () => {
    const m = build([], { 'mi-1': 2 })
    expect(m.margin.value).toBeNull()
  })
})
