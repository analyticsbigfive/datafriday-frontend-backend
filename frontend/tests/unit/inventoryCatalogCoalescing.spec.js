/**
 * Dédup in-flight des catalogues globaux du store `inventory` (market prices /
 * packaging types) — lot A du plan de chargement progressif.
 *
 * Le bug couvert : `isMarketPricesCacheValid` ne teste que `cachedAt`, jamais
 * « une requête est déjà partie ». Deux dispatchs concurrents (AnalyseView
 * fire-and-forget + Inventory/Restock awaited) passaient donc TOUS LES DEUX la
 * garde avant le premier commit → 2× `GET /market-prices` (~60 s à froid).
 */
import { createStore } from 'vuex'

jest.mock('@/api/endpoints/market.price.api', () => ({
  getMarketPrices: jest.fn(),
}))
jest.mock('@/api/endpoints/inventory.api', () => ({
  getInventory: jest.fn(),
  saveInventory: jest.fn(),
  saveInventoryCount: jest.fn(),
  getAllPackagingTypes: jest.fn(),
}))
jest.mock('@/utils/demoMode', () => ({ isDemoMode: () => false }))
jest.mock('@/data/localDb', () => ({
  getInventoryCounts: () => ({}),
  setInventoryCounts: () => {},
  getMarketPricesCache: () => null,
  setMarketPricesCache: () => {},
}))

import { getMarketPrices } from '@/api/endpoints/market.price.api'
import { getAllPackagingTypes } from '@/api/endpoints/inventory.api'
import inventory from '@/store/modules/inventory'

function makeStore() {
  return createStore({ modules: { inventory: { ...inventory, namespaced: true } } })
}

/** Promise résolue à la main : garde la requête « en vol » le temps du 2e dispatch. */
function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

describe('inventory — dédup in-flight des catalogues globaux', () => {
  beforeEach(() => {
    getMarketPrices.mockReset()
    getAllPackagingTypes.mockReset()
  })

  it('loadMarketPrices : deux dispatchs concurrents → UN SEUL GET', async () => {
    const d = deferred()
    getMarketPrices.mockReturnValue(d.promise)
    const store = makeStore()

    // Les deux partent AVANT que la 1re réponse n'arrive (le cas réel : AnalyseView
    // fire-and-forget puis SpaceInventoryView.loadForSpace).
    const a = store.dispatch('inventory/loadMarketPrices')
    const b = store.dispatch('inventory/loadMarketPrices')
    d.resolve([{ id: 'mp-1' }])
    await Promise.all([a, b])

    expect(getMarketPrices).toHaveBeenCalledTimes(1)
    expect(store.state.inventory.marketPrices).toHaveLength(1)
  })

  it('loadMarketPrices : le vol terminé est bien libéré (cache invalidé → nouveau GET)', async () => {
    getMarketPrices.mockResolvedValue([{ id: 'mp-1' }])
    const store = makeStore()

    await store.dispatch('inventory/loadMarketPrices')
    // Sans invalidation, la garde `cachedAt` reprend la main (comportement existant).
    await store.dispatch('inventory/loadMarketPrices')
    expect(getMarketPrices).toHaveBeenCalledTimes(1)

    // Cache invalidé : la Map in-flight ne doit PAS bloquer un rechargement légitime.
    store.commit('inventory/INVALIDATE_MARKET_PRICES')
    await store.dispatch('inventory/loadMarketPrices')
    expect(getMarketPrices).toHaveBeenCalledTimes(2)
  })

  it('loadMarketPrices : un échec réseau libère aussi le vol (pas de blocage définitif)', async () => {
    getMarketPrices.mockRejectedValueOnce(new Error('boom'))
    const store = makeStore()

    await store.dispatch('inventory/loadMarketPrices') // catch interne → pas de throw
    getMarketPrices.mockResolvedValue([{ id: 'mp-1' }])
    await store.dispatch('inventory/loadMarketPrices')

    expect(getMarketPrices).toHaveBeenCalledTimes(2)
    expect(store.state.inventory.marketPrices).toHaveLength(1)
  })

  it('loadPackagingTypes : même coalescing', async () => {
    const d = deferred()
    getAllPackagingTypes.mockReturnValue(d.promise)
    const store = makeStore()

    const a = store.dispatch('inventory/loadPackagingTypes')
    const b = store.dispatch('inventory/loadPackagingTypes')
    d.resolve([{ id: 'pk-1' }, { id: 'pk-2' }])
    await Promise.all([a, b])

    expect(getAllPackagingTypes).toHaveBeenCalledTimes(1)
    expect(store.state.inventory.packagingTypes).toHaveLength(2)
  })

  it('les deux catalogues ont des clés in-flight DISTINCTES (pas de collision)', async () => {
    const dm = deferred()
    const dp = deferred()
    getMarketPrices.mockReturnValue(dm.promise)
    getAllPackagingTypes.mockReturnValue(dp.promise)
    const store = makeStore()

    const a = store.dispatch('inventory/loadMarketPrices')
    const b = store.dispatch('inventory/loadPackagingTypes')
    dm.resolve([{ id: 'mp-1' }])
    dp.resolve([{ id: 'pk-1' }])
    await Promise.all([a, b])

    expect(getMarketPrices).toHaveBeenCalledTimes(1)
    expect(getAllPackagingTypes).toHaveBeenCalledTimes(1)
    expect(store.state.inventory.marketPrices).toHaveLength(1)
    expect(store.state.inventory.packagingTypes).toHaveLength(1)
  })
})
