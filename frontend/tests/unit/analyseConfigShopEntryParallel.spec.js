/**
 * buildConfigShopEntry lance la liste des PdV et le lot d'articles EN MÊME TEMPS que la lecture
 * de la configuration (avant : configuration, puis PdV, puis articles, trois vagues).
 * Le contexte obtenu doit rester identique, y compris quand le lot d'articles échoue.
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
import { getConfiguration } from '@/api/endpoints/configuration.api'
import { getBuilderState } from '@/api/endpoints/builder-v2.api'
import analyse, { resetConfigShopEntryCache } from '@/store/modules/analyse'

const SPACE_ID = 'sp-1'

function deferred() {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

// Configuration SANS floors en mémoire (cas réel de l'union : la liste des configs ne porte pas
// les floors), donc `getConfiguration` est appelé et c'est lui qu'on retient.
function makeStore(fetchForSpace) {
  const spaceShops = { namespaced: true, actions: { fetchForSpace } }
  const store = createStore({ modules: { analyse, spaceShops } })
  store.commit('analyse/SET_SPACE_ID', SPACE_ID)
  store.commit('analyse/SET_CONFIGURATIONS', [{ id: 'cfg-1', name: 'Config 1', eventIds: ['e1'] }])
  return store
}

const FULL_CONFIG = {
  id: 'cfg-1',
  data: { floors: [{ name: 'RDC', elements: [{ id: 'el-1', name: 'Bar', type: 'shop' }] }] },
}

describe('analyse, contexte PdV : lectures lancées en parallèle de la configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetConfigShopEntryCache()
    getBuilderState.mockResolvedValue({ zones: [] })
    getConfigShopMenuItemsLight.mockResolvedValue({ 'sh-1': { items: [{ id: 'mi-1', name: 'Beer' }] } })
  })

  it('PdV et articles partent avant la réponse de la configuration', async () => {
    const config = deferred()
    getConfiguration.mockReturnValue(config.promise)
    const fetchForSpace = jest.fn(() => Promise.resolve([{ id: 'sh-1', name: 'Bar', configId: 'cfg-1' }]))
    const store = makeStore(fetchForSpace)

    const done = store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    // laisse partir les imports dynamiques et les premières microtâches
    await new Promise((r) => setTimeout(r, 20))

    expect(getConfiguration).toHaveBeenCalledTimes(1)
    expect(fetchForSpace).toHaveBeenCalledTimes(1)
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(1)

    config.resolve(FULL_CONFIG)
    await done

    const ctx = store.state.analyse.configShopContext
    expect(ctx.configId).toBe('cfg-1')
    expect(ctx.floorElements.map((e) => e.name)).toEqual(['Bar'])
    expect(ctx.assignmentItemsByShop.get('bar')).toEqual([{ id: 'mi-1', name: 'Beer' }])
  })

  it('même contexte que la lecture à la suite (config en mémoire ou non)', async () => {
    getConfiguration.mockResolvedValue(FULL_CONFIG)
    const fetchForSpace = () => Promise.resolve([{ id: 'sh-1', name: 'Bar', configId: 'cfg-1' }])
    const storeA = makeStore(fetchForSpace)
    await storeA.dispatch('analyse/loadConfigShopContext', 'cfg-1')

    resetConfigShopEntryCache()
    const storeB = makeStore(fetchForSpace)
    storeB.commit('analyse/SET_CONFIGURATIONS', [FULL_CONFIG])
    await storeB.dispatch('analyse/loadConfigShopContext', 'cfg-1')

    const a = storeA.state.analyse.configShopContext
    const b = storeB.state.analyse.configShopContext
    expect(a.floorElements.map((e) => e.name)).toEqual(b.floorElements.map((e) => e.name))
    expect([...a.assignmentItemsByShop.entries()]).toEqual([...b.assignmentItemsByShop.entries()])
  })

  it('un lot d\'articles en échec donne un contexte sans articles et n\'est pas mémorisé', async () => {
    getConfiguration.mockResolvedValue(FULL_CONFIG)
    getConfigShopMenuItemsLight.mockRejectedValueOnce(new Error('boom'))
    const store = makeStore(() => Promise.resolve([{ id: 'sh-1', name: 'Bar', configId: 'cfg-1' }]))

    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    expect(store.state.analyse.configShopContext.assignmentItemsByShop.size).toBe(0)

    // pas mémorisé : le dispatch suivant relit le lot et récupère les articles
    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(2)
    expect(store.state.analyse.configShopContext.assignmentItemsByShop.size).toBe(1)
  })

  it('une liste de PdV en échec ne casse pas le chargement (contexte limité aux floors)', async () => {
    getConfiguration.mockResolvedValue(FULL_CONFIG)
    const store = makeStore(() => Promise.reject(new Error('shops KO')))

    await store.dispatch('analyse/loadConfigShopContext', 'cfg-1')

    const ctx = store.state.analyse.configShopContext
    expect(ctx.floorElements.map((e) => e.name)).toEqual(['Bar'])
    // aucune ligne /shops : le lot d'articles n'est pas rattaché à un PdV
    expect(ctx.assignmentItemsByShop.size).toBe(0)
  })
})
