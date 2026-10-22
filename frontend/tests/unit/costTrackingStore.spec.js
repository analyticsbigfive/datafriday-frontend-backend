jest.mock('@/api/endpoints/cost-tracking.api', () => ({
  getCostTrackingCatalog: jest.fn(),
  getCostTrackingSeries: jest.fn(),
  getCostTrackingArticleHistory: jest.fn(),
  getCostTrackingArticleIngredients: jest.fn(),
}))

import { createStore } from 'vuex'
import costTracking from '@/store/modules/costTracking'
import {
  getCostTrackingCatalog,
  getCostTrackingSeries,
  getCostTrackingArticleHistory,
} from '@/api/endpoints/cost-tracking.api'

const makeStore = () => createStore({ modules: { costTracking } })
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('costTracking store : catalogue', () => {
  it('charge puis sert le cache tant que le TTL est valide', async () => {
    getCostTrackingCatalog.mockResolvedValue({ types: [{ id: 't1' }] })
    const store = makeStore()
    await store.dispatch('costTracking/fetchCatalog', { spaceId: 's1' })
    await store.dispatch('costTracking/fetchCatalog', { spaceId: 's1' })
    expect(getCostTrackingCatalog).toHaveBeenCalledTimes(1)
    expect(store.getters['costTracking/catalog'].types).toHaveLength(1)
  })

  it('force, invalidate et changement d espace relancent la requete', async () => {
    getCostTrackingCatalog.mockResolvedValue({ types: [] })
    const store = makeStore()
    await store.dispatch('costTracking/fetchCatalog', { spaceId: 's1' })
    await store.dispatch('costTracking/fetchCatalog', { spaceId: 's1', force: true })
    await store.dispatch('costTracking/invalidate')
    await store.dispatch('costTracking/fetchCatalog', { spaceId: 's1' })
    await store.dispatch('costTracking/fetchCatalog', { spaceId: 's2' })
    expect(getCostTrackingCatalog).toHaveBeenCalledTimes(4)
  })

  it('erreur : message stocke, fetching repasse a false', async () => {
    getCostTrackingCatalog.mockRejectedValue(new Error('boom'))
    const store = makeStore()
    await store.dispatch('costTracking/fetchCatalog', { spaceId: 's1' })
    expect(store.state.costTracking.catalogError).toBe('boom')
    expect(store.state.costTracking.fetching).toBe(false)
  })
})

describe('costTracking store : filtres', () => {
  it('setFilters fusionne, RESET_FILTERS remet a zero', async () => {
    const store = makeStore()
    await store.dispatch('costTracking/setFilters', { typeId: 't1' })
    await store.dispatch('costTracking/setFilters', { groupBy: 'type' })
    expect(store.getters['costTracking/filters']).toEqual({
      typeId: 't1', categoryId: null, menuItemId: null, ingredientId: null, groupBy: 'type',
    })
    store.commit('costTracking/RESET_FILTERS')
    expect(store.getters['costTracking/filters'].typeId).toBeNull()
  })
})

describe('costTracking store : séries', () => {
  it('passe les parametres a l API et stocke le resultat', async () => {
    getCostTrackingSeries.mockResolvedValue({ lines: [{ key: 'a' }] })
    const store = makeStore()
    await store.dispatch('costTracking/fetchSeries', { spaceId: 's1', params: { from: '2026-01-01' } })
    expect(getCostTrackingSeries).toHaveBeenCalledWith('s1', { from: '2026-01-01' })
    expect(store.getters['costTracking/series'].lines).toHaveLength(1)
    expect(store.state.costTracking.seriesLoading).toBe(false)
  })

  it('une reponse perimee n ecrase pas la plus recente', async () => {
    const first = deferred()
    const second = deferred()
    getCostTrackingSeries.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const store = makeStore()
    const p1 = store.dispatch('costTracking/fetchSeries', { spaceId: 's1', params: { typeId: 'a' } })
    const p2 = store.dispatch('costTracking/fetchSeries', { spaceId: 's1', params: { typeId: 'b' } })
    second.resolve({ id: 'recent' })
    await p2
    first.resolve({ id: 'old' })
    await p1
    expect(store.getters['costTracking/series'].id).toBe('recent')
    expect(store.state.costTracking.seriesLoading).toBe(false)
  })

  it('erreur : message stocke, series conservees', async () => {
    getCostTrackingSeries.mockResolvedValueOnce({ id: 'ok' })
    const store = makeStore()
    await store.dispatch('costTracking/fetchSeries', { spaceId: 's1' })
    getCostTrackingSeries.mockRejectedValueOnce({ response: { data: { message: 'forbidden' } } })
    await store.dispatch('costTracking/fetchSeries', { spaceId: 's1' })
    expect(store.state.costTracking.seriesError).toBe('forbidden')
    expect(store.getters['costTracking/series'].id).toBe('ok')
  })
})

describe('costTracking store : historique', () => {
  it('charge, puis clearHistory ignore une reponse en vol', async () => {
    const d = deferred()
    getCostTrackingArticleHistory.mockReturnValueOnce(d.promise)
    const store = makeStore()
    const p = store.dispatch('costTracking/fetchHistory', { spaceId: 's1', menuItemId: 'm1', limit: 50 })
    expect(getCostTrackingArticleHistory).toHaveBeenCalledWith('s1', 'm1', { limit: 50 })
    await store.dispatch('costTracking/clearHistory')
    d.resolve({ versions: [{ id: 'v' }] })
    await p
    expect(store.getters['costTracking/history']).toBeNull()
    expect(store.state.costTracking.historyLoading).toBe(false)
  })

  it('reset vide tout', async () => {
    getCostTrackingSeries.mockResolvedValue({ id: 'x' })
    const store = makeStore()
    await store.dispatch('costTracking/fetchSeries', { spaceId: 's1' })
    await store.dispatch('costTracking/reset')
    expect(store.getters['costTracking/series']).toBeNull()
  })
})
