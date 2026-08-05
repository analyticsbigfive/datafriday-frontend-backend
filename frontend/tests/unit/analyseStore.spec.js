import analyse, {
  resolveConfigSelectionAfterLoad,
  filterValidConfigurations,
  isDeletedConfig,
  isValidConfigId,
} from '@/store/modules/analyse'

function makeStore() {
  // Bootstrap a tiny Vuex-style state harness so we can test mutations/actions.
  const state = analyse.state()
  return { state, mutations: analyse.mutations, actions: analyse.actions }
}

describe('analyse store — cache invalidation', () => {
  // NB : SET_TIMELINE_FOR_EVENT préprocesse (preprocessTimelineRecords) → les
  // records doivent porter `minute` (shape canonique), sinon ils sont ignorés.
  const tlRecord = (over = {}) => ({
    minute: '19:00', shopId: 's1', menuItemId: 'm1',
    totalRevenue: 10, totalQuantity: 1, transactionCount: 1, ...over,
  })

  it('SET_TIMELINE_FOR_EVENT writes preprocessed records into timelineCacheByEventId', () => {
    const { state, mutations } = makeStore()
    mutations.SET_TIMELINE_FOR_EVENT(state, { eventId: 'evt-1', data: [tlRecord()] })
    expect(state.timelineCacheByEventId['evt-1']).toHaveLength(1)
    expect(state.timelineCacheByEventId['evt-1'][0]).toMatchObject({
      minute: '19:00', shopId: 's1', totalRevenue: 10,
    })
  })

  it('INVALIDATE_TIMELINE_FOR_EVENT removes one key only', () => {
    const { state, mutations } = makeStore()
    mutations.SET_TIMELINE_FOR_EVENT(state, { eventId: 'evt-1', data: [tlRecord()] })
    mutations.SET_TIMELINE_FOR_EVENT(state, { eventId: 'evt-2', data: [tlRecord({ totalRevenue: 2 })] })
    mutations.INVALIDATE_TIMELINE_FOR_EVENT(state, 'evt-1')
    expect(state.timelineCacheByEventId['evt-1']).toBeUndefined()
    expect(state.timelineCacheByEventId['evt-2']).toHaveLength(1)
    expect(state.timelineCacheByEventId['evt-2'][0].totalRevenue).toBe(2)
  })

  it('SET_PREDICTION_FOR_KEY caches by event::config::hash key', () => {
    const { state, mutations } = makeStore()
    mutations.SET_PREDICTION_FOR_KEY(state, {
      key: 'evt-1::cfg-a::h1',
      data: { revenue: 100 },
    })
    expect(state.predictionCacheByEventConfigKey['evt-1::cfg-a::h1']).toEqual({
      revenue: 100,
    })
  })

  it('INVALIDATE_PREDICTIONS_FOR_EVENT drops all keys for that event', () => {
    const { state, mutations } = makeStore()
    mutations.SET_PREDICTION_FOR_KEY(state, { key: 'evt-1::cfg-a::h1', data: 1 })
    mutations.SET_PREDICTION_FOR_KEY(state, { key: 'evt-1::cfg-b::h2', data: 2 })
    mutations.SET_PREDICTION_FOR_KEY(state, { key: 'evt-2::cfg-a::h1', data: 3 })
    mutations.INVALIDATE_PREDICTIONS_FOR_EVENT(state, 'evt-1')
    const remaining = Object.keys(state.predictionCacheByEventConfigKey)
    expect(remaining).toEqual(['evt-2::cfg-a::h1'])
  })

  it('invalidateEvent action wipes timeline + predictions for that event', () => {
    const { state, mutations, actions } = makeStore()
    mutations.SET_TIMELINE_FOR_EVENT(state, { eventId: 'evt-1', data: [1] })
    mutations.SET_PREDICTION_FOR_KEY(state, { key: 'evt-1::cfg::h', data: 1 })
    mutations.SET_PREDICTION_FOR_KEY(state, { key: 'evt-2::cfg::h', data: 2 })

    const commit = (type, payload) => mutations[type](state, payload)
    actions.invalidateEvent({ commit }, 'evt-1')

    expect(state.timelineCacheByEventId['evt-1']).toBeUndefined()
    expect(state.predictionCacheByEventConfigKey['evt-1::cfg::h']).toBeUndefined()
    expect(state.predictionCacheByEventConfigKey['evt-2::cfg::h']).toBe(2)
  })

  it('setActivePredictionVersion records last active version per event', () => {
    const { state, mutations, actions } = makeStore()
    const commit = (type, payload) => mutations[type](state, payload)
    actions.setActivePredictionVersion(
      { commit },
      { eventId: 'evt-1', versionId: 'v-42' },
    )
    expect(state.activePredictionVersionByEventId['evt-1']).toBe('v-42')
  })

  it('aggregatedTimelineByEvent getter aggregates cache per minute', () => {
    const { state, mutations } = makeStore()
    mutations.SET_TIMELINE_FOR_EVENT(state, {
      eventId: 'evt-1',
      data: [
        { minute: '19:00', shopId: 's1', menuItemId: 'm1', totalRevenue: 100, totalQuantity: 10, transactionCount: 5 },
        { minute: '19:00', shopId: 's2', menuItemId: 'm2', totalRevenue: 50, totalQuantity: 5, transactionCount: 2 },
        { minute: '19:30', shopId: 's1', menuItemId: 'm1', totalRevenue: 30, totalQuantity: 3, transactionCount: 1 },
      ],
    })
    const getter = analyse.getters.aggregatedTimelineByEvent(state)
    const out = getter({ eventId: 'evt-1', bucketMinutes: 15, groupBy: 'global' })
    expect(out).toHaveLength(2)
    const first = out.find((p) => p.minute === '19:00')
    expect(first.totalRevenue).toBe(150)
  })

  it('aggregatedTimelineByEvent honors shopIds + range filters', () => {
    const { state, mutations } = makeStore()
    mutations.SET_TIMELINE_FOR_EVENT(state, {
      eventId: 'evt-1',
      data: [
        { minute: '19:00', shopId: 's1', menuItemId: 'm1', totalRevenue: 100, totalQuantity: 10, transactionCount: 5 },
        { minute: '20:00', shopId: 's2', menuItemId: 'm2', totalRevenue: 50, totalQuantity: 5, transactionCount: 2 },
      ],
    })
    const getter = analyse.getters.aggregatedTimelineByEvent(state)
    const out = getter({
      eventId: 'evt-1',
      bucketMinutes: 1,
      shopIds: ['s1'],
      range: { start: '19:00', end: '19:30' },
    })
    expect(out).toHaveLength(1)
    expect(out[0].totalRevenue).toBe(100)
  })

  /**
   * BUG-300-01 — changement d'espace : le contexte config (floorElements →
   * shopArea) doit être purgé, sinon la garde « déjà chargé » du différé
   * « All Configurations » voit le contexte de l'ANCIEN espace et ne recharge
   * jamais → donut « Par zone » définitivement vide sur le nouvel espace.
   */
  it("BUG-300-01 — CLEAR_SPACE_KEYED_CACHES purge le contexte config et invalide les vols en cours", () => {
    const { state, mutations } = makeStore()
    state.configShopContext = {
      configId: null,
      floorElements: [{ id: 'el-aix-1', name: 'Bar Nord', area: 'Zone A' }],
      assignment: {},
    }
    state.configContextSettled = true
    state.configContextError = 'boom'
    state.configContextLoadingId = 'cfg-42'
    const reqBefore = state.configContextReqId

    mutations.CLEAR_SPACE_KEYED_CACHES(state, { keepSpaceId: 'space-auxerre' })

    expect(state.configShopContext.floorElements).toHaveLength(0)
    expect(state.configShopContext.configId).toBeNull()
    expect(state.configContextSettled).toBe(false)
    expect(state.configContextError).toBeNull()
    expect(state.configContextLoadingId).toBeNull()
    // Jeton bumpé : un loadAllConfigsShopContext de l'ancien espace encore en
    // vol se verra `stale()` et ne commitera pas ses floorElements par-dessus.
    expect(state.configContextReqId).toBe((reqBefore || 0) + 1)
  })
})

describe('analyse store — getters data-driven (options depuis les ventes)', () => {
  const g = analyse.getters

  const RECORDS = [
    { eventId: 'e1', shopName: 'Bar Nord', shopArea: 'N0', shopType: 'beverages', menuItemType: 'Beverage' },
    { eventId: 'e1', shopName: 'Food Court', shopArea: 'N1', shopType: 'food', menuItemType: 'Food' },
    { eventId: 'e9', shopName: 'Hors Scope', shopArea: 'N9', shopType: 'bar' }, // event hors analysables
  ]

  function makeGetters({ records = RECORDS, events = [{ id: 'e1' }, { id: 'e9' }], analysable = [{ id: 'e1' }], filtered = analysable, stateOverrides = {} } = {}) {
    const state = { ...analyse.state(), events, ...stateOverrides }
    const getters = {
      reconciledShopGranularData: records,
      analysableEvents: analysable,
      filteredEvents: filtered,
    }
    for (const name of ['optionsBaseRecords', 'salesShopNames', 'salesShopTypes', 'salesShopAreas', 'salesMenuItemNames', 'salesMenuItemTypes', 'salesMenuItemCategories', 'filtersState']) {
      Object.defineProperty(getters, name, {
        get: () => g[name](state, getters),
        configurable: true,
      })
    }
    return { state, getters }
  }

  it('optionsBaseRecords = records scopés aux events analysables', () => {
    const { getters } = makeGetters()
    expect(getters.optionsBaseRecords.map((r) => r.shopName)).toEqual(['Bar Nord', 'Food Court'])
  })

  it('optionsBaseRecords ne filtre pas pendant le loading (state.events vide)', () => {
    const { getters } = makeGetters({ events: [], analysable: [] })
    expect(getters.optionsBaseRecords).toHaveLength(3)
  })

  // Module Live (docs/modules/11_LIVE.md), bug trouvé le 2026-08-05 : Types de
  // PDV/Zones/Points de vente affichaient des compteurs sur TOUT l'historique
  // analysable de l'espace au lieu du seul event live. isLiveRoute bascule la
  // base sur filteredEvents (déjà réduit au seul event live par applyLiveScope).
  it('optionsBaseRecords se scope à filteredEvents (pas analysableEvents) quand isLiveRoute', () => {
    const { getters } = makeGetters({
      // analysable inclut e1 ET un event historique e2 ; filteredEvents (le
      // scope live réel) ne contient QUE l'event live e1.
      analysable: [{ id: 'e1' }, { id: 'e2' }],
      filtered: [{ id: 'e1' }],
      stateOverrides: { isLiveRoute: true },
      records: [
        ...RECORDS,
        { eventId: 'e2', shopName: 'Ancien Event', shopArea: 'N2', shopType: 'beer' },
      ],
    })
    expect(getters.optionsBaseRecords.map((r) => r.shopName)).toEqual(['Bar Nord', 'Food Court'])
  })

  it('optionsBaseRecords reste sur analysableEvents quand isLiveRoute est false (comportement Analyse inchangé)', () => {
    const { getters } = makeGetters({
      analysable: [{ id: 'e1' }, { id: 'e2' }],
      filtered: [{ id: 'e1' }],
      records: [
        ...RECORDS,
        { eventId: 'e2', shopName: 'Ancien Event', shopArea: 'N2', shopType: 'beer' },
      ],
    })
    expect(getters.optionsBaseRecords.map((r) => r.shopName)).toEqual(['Bar Nord', 'Food Court', 'Ancien Event'])
  })

  it('salesShopNames / salesShopAreas dérivés des ventes (distinct + tri)', () => {
    const { getters } = makeGetters()
    expect(getters.salesShopNames).toEqual(['Bar Nord', 'Food Court'])
    expect(getters.salesShopAreas).toEqual(['N0', 'N1'])
  })

  it('salesShopTypes exclut les sentinelles des OPTIONS', () => {
    const { getters } = makeGetters({
      records: [
        { eventId: 'e1', shopName: 'A', shopType: 'beverages' },
        { eventId: 'e1', shopName: 'B' }, // sans type → sentinelle → exclue des options
      ],
    })
    expect(getters.salesShopTypes).toEqual(['beverages'])
  })

  it('salesMenuItem* = soldItemOptions SANS repli assignés', () => {
    const { getters } = makeGetters({
      stateOverrides: { soldItemOptions: { names: ['Coca'], types: ['Beverage'], categories: ['Soft'] } },
    })
    expect(getters.salesMenuItemNames).toEqual(['Coca'])
    expect(getters.salesMenuItemTypes).toEqual(['Beverage'])
    expect(getters.salesMenuItemCategories).toEqual(['Soft'])
    const empty = makeGetters()
    expect(empty.getters.salesMenuItemNames).toEqual([]) // pas de repli
  })

  it("filtersState : ready quand ventes + articles vendus présents ; error/loading contexte UNIQUEMENT si une config est sélectionnée", () => {
    const SOLD = { soldItemOptions: { names: ['Coca'], types: [], categories: [] } }
    expect(makeGetters({ stateOverrides: { ...SOLD } }).getters.filtersState).toBe('ready')
    // erreur contexte SANS config sélectionnée → ignorée (enrichissement seulement,
    // l'union « All Configurations » différée ne doit jamais afficher d'échec)
    expect(
      makeGetters({ stateOverrides: { ...SOLD, configContextError: 'boom' } }).getters.filtersState,
    ).toBe('ready')
    const err = makeGetters({ stateOverrides: { ...SOLD, configContextError: 'boom' } })
    err.state.filters.selectedConfigurationId = 'cfg1'
    expect(err.getters.filtersState).toBe('error')
    const load = makeGetters({ stateOverrides: { ...SOLD, configContextLoading: true } })
    load.state.filters.selectedConfigurationId = 'cfg1'
    expect(load.getters.filtersState).toBe('loading')
  })

  it('filtersState : états vides NEUTRES (jamais error) quand options absentes hors chargement', () => {
    // Aucune vente dans le scope → empty-no-shops (message neutre côté panneau).
    expect(makeGetters({ records: [] }).getters.filtersState).toBe('empty-no-shops')
    // Ventes présentes mais aucun article vendu remonté → empty-no-items.
    expect(makeGetters().getters.filtersState).toBe('empty-no-items')
  })

  it('filtersState = loading pendant la phase 2 quand aucun record', () => {
    const { getters } = makeGetters({ stateOverrides: { enriching: true, shopGranularData: [] } })
    expect(getters.filtersState).toBe('loading')
  })
})

describe('analyse store — actions filtres data-driven', () => {
  it('setSoldItemOptions écrit les 3 ensembles dans le state', () => {
    const { state, mutations, actions } = makeStore()
    const commit = (type, payload) => mutations[type](state, payload)
    actions.setSoldItemOptions({ commit }, { names: ['Coca'], types: ['Beverage'], categories: ['Soft'] })
    expect(state.soldItemOptions).toEqual({ names: ['Coca'], types: ['Beverage'], categories: ['Soft'] })
  })

  it('pruneFiltersToOptions retire les sélections absentes des options sales*, garde les valides', () => {
    const { state, mutations, actions } = makeStore()
    state.filters.selectedShopIds = ['Bar Nord', 'Ghost Bar']
    state.filters.selectedMenuItemIds = ['Burger', 'Pizza']
    const getters = {
      salesShopNames: ['Bar Nord'],
      salesShopTypes: [],
      salesShopAreas: [],
      salesMenuItemNames: ['Burger'],
      salesMenuItemTypes: [],
      salesMenuItemCategories: [],
    }
    const commit = (type, payload) => mutations[type](state, payload)
    actions.pruneFiltersToOptions({ state, getters, commit })
    expect(state.filters.selectedShopIds).toEqual(['Bar Nord'])
    expect(state.filters.selectedMenuItemIds).toEqual(['Burger'])
  })

  it('pruneFiltersToOptions ne touche PAS une dimension dont les options sont vides (anti-race)', () => {
    const { state, mutations, actions } = makeStore()
    state.filters.selectedShopIds = ['Quelque PdV']
    const getters = {
      salesShopNames: [],
      salesShopTypes: [],
      salesShopAreas: [],
      salesMenuItemNames: [],
      salesMenuItemTypes: [],
      salesMenuItemCategories: [],
    }
    const commit = (type, payload) => mutations[type](state, payload)
    actions.pruneFiltersToOptions({ state, getters, commit })
    expect(state.filters.selectedShopIds).toEqual(['Quelque PdV'])
  })
})

describe('analyse store — configs supprimées filtrées', () => {
  it('isDeletedConfig repère tous les flags defensifs', () => {
    expect(isDeletedConfig({ id: 'a' })).toBe(false)
    expect(isDeletedConfig({ id: 'a', deleted: true })).toBe(true)
    expect(isDeletedConfig({ id: 'a', isDeleted: true })).toBe(true)
    expect(isDeletedConfig({ id: 'a', archived: true })).toBe(true)
    expect(isDeletedConfig({ id: 'a', deletedAt: '2026-01-01' })).toBe(true)
    expect(isDeletedConfig({ id: 'a', status: 'DELETED' })).toBe(true)
    expect(isDeletedConfig({ id: 'a', status: 'active' })).toBe(false)
    expect(isDeletedConfig(null)).toBe(true)
  })

  it('filterValidConfigurations garde id + non supprimées, préserve cfg-all', () => {
    const out = filterValidConfigurations([
      { id: 'cfg-all', name: 'All' },
      { id: 'cfg-1', name: 'Match' },
      { id: 'cfg-2', name: 'Dead', deletedAt: '2026-01-01' },
      { name: 'NoId' },
      null,
    ])
    expect(out.map((c) => c.id)).toEqual(['cfg-all', 'cfg-1'])
  })

  it('filterValidConfigurations tolère non-array', () => {
    expect(filterValidConfigurations(undefined)).toEqual([])
    expect(filterValidConfigurations(null)).toEqual([])
  })

  it('SET_CONFIGURATIONS écrit une liste déjà nettoyée', () => {
    const { state, mutations } = makeStore()
    mutations.SET_CONFIGURATIONS(state, [
      { id: 'cfg-1', name: 'Ok' },
      { id: 'cfg-2', name: 'Gone', isDeleted: true },
    ])
    expect(state.configurations.map((c) => c.id)).toEqual(['cfg-1'])
  })

  it('isValidConfigId rejette id absent / supprimé / cfg-all', () => {
    const list = [{ id: 'cfg-1', name: 'Ok' }, { id: 'cfg-2', name: 'X', deleted: true }]
    expect(isValidConfigId('cfg-1', list)).toBe(true)
    expect(isValidConfigId('cfg-2', list)).toBe(false) // supprimée
    expect(isValidConfigId('ghost', list)).toBe(false) // absente
    expect(isValidConfigId('cfg-all', list)).toBe(false)
    expect(isValidConfigId(null, list)).toBe(false)
  })

  it('resolveConfigSelectionAfterLoad reset un id périmé, garde un id valide', () => {
    const list = [{ id: 'cfg-1', name: 'Ok' }]
    expect(resolveConfigSelectionAfterLoad('cfg-1', list)).toBe('cfg-1')
    expect(resolveConfigSelectionAfterLoad('ghost', list)).toBeNull()
    expect(resolveConfigSelectionAfterLoad('cfg-all', list)).toBeNull()
  })
})

describe('resolveConfigSelectionAfterLoad (fix « retombe sur All »)', () => {
  it('préserve la sélection si la config existe dans le space chargé', () => {
    expect(resolveConfigSelectionAfterLoad('cfg-1', [{ id: 'cfg-1' }, { id: 'cfg-2' }])).toBe('cfg-1')
  })
  it('reset si id périmé (autre espace)', () => {
    expect(resolveConfigSelectionAfterLoad('cfg-ghost', [{ id: 'cfg-1' }])).toBeNull()
  })
  it('null / cfg-all / configs vides → null', () => {
    expect(resolveConfigSelectionAfterLoad(null, [{ id: 'cfg-1' }])).toBeNull()
    expect(resolveConfigSelectionAfterLoad('cfg-all', [{ id: 'cfg-all' }])).toBeNull()
    expect(resolveConfigSelectionAfterLoad('cfg-1', [])).toBeNull()
  })

  // Fetch `/configurations` en échec → useSpaceData replie sur `[]`. Cette liste ne
  // prouve RIEN sur la validité de l'id : l'effacer ferait retomber le select sur
  // « All Configurations » sur un simple aléa réseau.
  it('fetch configurations en ÉCHEC → conserve la sélection malgré la liste vide', () => {
    expect(
      resolveConfigSelectionAfterLoad('cfg-1', [], { configurationsFetchFailed: true }),
    ).toBe('cfg-1')
  })

  it('fetch OK avec liste vide → purge (l\'espace n\'a réellement aucune config)', () => {
    expect(
      resolveConfigSelectionAfterLoad('cfg-1', [], { configurationsFetchFailed: false }),
    ).toBeNull()
  })

  it('échec du fetch ne ressuscite ni null ni la sentinelle cfg-all', () => {
    expect(resolveConfigSelectionAfterLoad(null, [], { configurationsFetchFailed: true })).toBeNull()
    expect(resolveConfigSelectionAfterLoad('cfg-all', [], { configurationsFetchFailed: true })).toBeNull()
  })
})

describe('bornes de comparaison Précédent / N-1 (parité versionReact)', () => {
  const g0 = analyse.getters
  function boundsGetters({ timeRange = 'all', dateBounds = { start: null, end: null } } = {}) {
    const state = analyse.state()
    state.filters.timeRange = timeRange
    const getters = { dateBounds }
    for (const name of ['previousPeriodBounds', 'yearOverYearBounds']) {
      Object.defineProperty(getters, name, {
        get: () => g0[name](state, getters),
        configurable: true,
      })
    }
    return getters
  }

  it("'all' (Tout l'historique) → comparaison désactivée : bornes nulles", () => {
    const g = boundsGetters()
    expect(g.previousPeriodBounds).toEqual({ start: null, end: null })
    expect(g.yearOverYearBounds).toEqual({ start: null, end: null })
  })

  it('thisyear → Précédent = mêmes jours écoulés l’an dernier (parité React)', () => {
    const now = new Date()
    const y = now.getFullYear()
    const g = boundsGetters({
      timeRange: 'thisyear',
      dateBounds: { start: new Date(y, 0, 1), end: now },
    })
    const prev = g.previousPeriodBounds
    expect(prev.start.getFullYear()).toBe(y - 1)
    expect(prev.start.getMonth()).toBe(0)
    expect(prev.start.getDate()).toBe(1)
    expect(prev.end.getFullYear()).toBe(y - 1)
    // Même nombre de jours écoulés (à la journée près).
    const daysSoFar = Math.floor((now - new Date(y, 0, 1)) / 86400000)
    const prevDays = Math.floor((prev.end - prev.start) / 86400000)
    expect(Math.abs(prevDays - daysSoFar)).toBeLessThanOrEqual(1)
  })

  it('thismonth → Précédent = mois dernier ENTIER', () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const g = boundsGetters({
      timeRange: 'thismonth',
      dateBounds: { start: new Date(y, m, 1), end: now },
    })
    const prev = g.previousPeriodBounds
    const expectedStart = new Date(y, m - 1, 1)
    const expectedEnd = new Date(y, m, 0)
    expect(prev.start.getMonth()).toBe(expectedStart.getMonth())
    expect(prev.start.getDate()).toBe(1)
    expect(prev.end.getDate()).toBe(expectedEnd.getDate()) // dernier jour du mois précédent
    expect(prev.end.getHours()).toBe(23)
  })

  it('custom → décalage de la durée avec 1 jour d’écart (parité React)', () => {
    const start = new Date(2026, 2, 10) // 10 mars
    const end = new Date(2026, 2, 19)   // 19 mars (durée 9 j)
    const g = boundsGetters({ timeRange: 'custom', dateBounds: { start, end } })
    const prev = g.previousPeriodBounds
    expect(prev.end.getDate()).toBe(9) // 9 mars 23:59:59.999
    expect(prev.end.getMonth()).toBe(2)
    expect(prev.end.getHours()).toBe(23)
    expect(prev.start.getDate()).toBe(28) // 28 févr 00:00 (9 j avant le 9 mars)
    expect(prev.start.getMonth()).toBe(1)
    expect(prev.start.getHours()).toBe(0)
  })

  it('N-1 = bornes courantes décalées de -1 an (setFullYear)', () => {
    const g = boundsGetters({
      timeRange: 'thisyear',
      dateBounds: { start: new Date(2026, 0, 1), end: new Date(2026, 6, 13) },
    })
    const yoy = g.yearOverYearBounds
    expect(yoy.start.getFullYear()).toBe(2025)
    expect(yoy.start.getMonth()).toBe(0)
    expect(yoy.start.getDate()).toBe(1)
    expect(yoy.end.getFullYear()).toBe(2025)
    expect(yoy.end.getMonth()).toBe(6)
    expect(yoy.end.getDate()).toBe(13)
  })
})
