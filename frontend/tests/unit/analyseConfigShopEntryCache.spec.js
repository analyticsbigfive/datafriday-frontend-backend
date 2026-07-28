/**
 * Cache de résultat de `buildConfigShopEntry` (lot B du plan de chargement progressif).
 *
 * Avant : aucun cache → chaque `loadConfigShopContext` / chaque config de l'union
 * « All Configurations » refaisait `getConfigShopMenuItemsLight`. Un aller-retour
 * A → B → A repayait A, et l'union rechargeait la config déjà chargée en mono-config.
 *
 * Le compteur observé est `getConfigShopMenuItemsLight` : le batch shop-items, l'appel
 * le plus coûteux du build.
 */
jest.mock('@/api/endpoints/menu.api', () => ({
  getConfigShopMenuItemsLight: jest.fn(),
}))
jest.mock('@/api/endpoints/configuration.api', () => ({
  getConfiguration: jest.fn(),
}))
jest.mock('@/api/endpoints/builder-v2.api', () => ({
  getBuilderState: jest.fn(),
}))

import { createStore } from 'vuex'
import { getConfigShopMenuItemsLight } from '@/api/endpoints/menu.api'
import { getBuilderState } from '@/api/endpoints/builder-v2.api'
import analyse, { resetConfigShopEntryCache } from '@/store/modules/analyse'

const SPACE_ID = 'sp-1'

// Config porteuse de ses floors EN MÉMOIRE → `getConfiguration` n'est pas appelé
// (chemin nominal après loadSpace). Le PdV « Bar » relie floors et rows /shops.
const makeConfig = (id) => ({
  id,
  name: `Config ${id}`,
  eventIds: ['e1'],
  data: { floors: [{ name: 'RDC', elements: [{ id: `el-${id}`, name: 'Bar', type: 'shop' }] }] },
})

function makeStore() {
  const spaceShops = {
    namespaced: true,
    actions: {
      fetchForSpace: () => Promise.resolve([{ id: 'sh-1', name: 'Bar', configId: 'cfg-1' }]),
    },
  }
  const store = createStore({ modules: { analyse, spaceShops } })
  store.commit('analyse/SET_SPACE_ID', SPACE_ID)
  store.commit('analyse/SET_CONFIGURATIONS', [makeConfig('cfg-1'), makeConfig('cfg-2')])
  return store
}

describe('analyse — cache de buildConfigShopEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetConfigShopEntryCache()
    getBuilderState.mockResolvedValue({ zones: [] })
    getConfigShopMenuItemsLight.mockResolvedValue({
      'sh-1': { items: [{ id: 'mi-1', name: 'Beer' }] },
    })
  })

  it('deux chargements de la MÊME config → un seul batch shop-items', async () => {
    const store = makeStore()
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')

    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(1)
    expect(store.state.analyse.configShopContext.floorElements.length).toBeGreaterThan(0)
  })

  it('aller-retour A → B → A : le 3e chargement est gratuit', async () => {
    const store = makeStore()
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-2')
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')

    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(2)
    // Le contexte affiché reste bien celui de la dernière config demandée.
    expect(store.state.analyse.configShopContext.configId).toBe('cfg-1')
  })

  it("l'union « All Configurations » réutilise les configs déjà chargées", async () => {
    const store = makeStore()
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(1)

    await store.dispatch('analyse/loadAllConfigsShopContext')
    // cfg-1 vient du cache, seule cfg-2 est réellement fetchée.
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(2)
    expect(store.state.analyse.configShopContext.configId).toBeNull()
  })

  it('appels CONCURRENTS sur la même config → un seul batch (cache de Promise)', async () => {
    const store = makeStore()
    // Le cas réel : useSpaceDataFetch dispatche, et le watcher `selectedConfigurationId`
    // d'AnalyseView dispatche la même config dans la foulée.
    await Promise.all([
      store.dispatch('analyse/loadConfigShopContext', 'cfg-1'),
      store.dispatch('analyse/loadConfigShopContext', 'cfg-1'),
    ])
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(1)
  })

  it('un batch en échec n\'est PAS mémorisé : le dispatch suivant retente', async () => {
    const store = makeStore()
    // `buildConfigShopEntry` avale l'échec du batch (chaque fetch a son .catch) et
    // « réussit » avec un contexte SANS articles. Le mémoriser figerait des PdV sans
    // menu pour toute la session — d'où le flag `_batchFailed`.
    getConfigShopMenuItemsLight.mockRejectedValueOnce(new Error('boom'))
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(1)
    expect(store.state.analyse.configShopContext.assignmentItemsByShop.size).toBe(0)

    // Sans reset ni purge : le retry doit repartir tout seul, et cette fois peupler.
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(2)
    expect(store.state.analyse.configShopContext.assignmentItemsByShop.size).toBe(1)

    // Et le succès, lui, est bien mémorisé.
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(2)
  })

  it('purge du cache (retour du Builder → loadSpace) → refetch', async () => {
    const store = makeStore()
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(1)

    resetConfigShopEntryCache() // ce que fait loadSpace en tête
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(2)
  })
})
