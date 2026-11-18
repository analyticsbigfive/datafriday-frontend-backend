/**
 * Préchauffage du contexte PdV « All Configurations » dès l'arrivée de la liste des configurations.
 *  - pickConfigsToPrewarm (pur) : quand NE PAS préchauffer ;
 *  - action prewarmAllConfigsContext : remplit le cache de l'union, qui ne relit plus rien ensuite,
 *    et donne le même contexte que l'union lancée seule.
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
import analyse, { resetConfigShopEntryCache, resolveConfigSelectionAfterLoad } from '@/store/modules/analyse'
import { pickConfigsToPrewarm } from '@/utils/analyseAllConfigsPrewarm'

const SPACE_ID = 'sp-1'
const CFGS = [{ id: 'cfg-1', name: 'Config 1' }, { id: 'cfg-2', name: 'Config 2' }]

describe('pickConfigsToPrewarm', () => {
  const pick = (over = {}) => pickConfigsToPrewarm({
    configurations: CFGS, currentSelection: null, toolbox: 'analyse', urlConfig: '',
    resolveSelection: resolveConfigSelectionAfterLoad, ...over,
  })

  it('préchauffe toutes les configurations quand l\'union sera demandée', () => {
    expect(pick().map((c) => c.id)).toEqual(['cfg-1', 'cfg-2'])
  })

  it('ne préchauffe pas dans Event Predict (union reportée au retour sur Analyse)', () => {
    expect(pick({ toolbox: 'event-predict' })).toEqual([])
  })

  it('ne préchauffe pas pour un lien profond ?config=<id>', () => {
    expect(pick({ urlConfig: 'cfg-2' })).toEqual([])
  })

  it('préchauffe quand l\'URL porte la sentinelle cfg-all', () => {
    expect(pick({ urlConfig: 'cfg-all' })).toHaveLength(2)
  })

  it('ne préchauffe pas quand une configuration précise est conservée', () => {
    expect(pick({ currentSelection: 'cfg-2' })).toEqual([])
  })

  it('préchauffe quand la sélection précédente est périmée (retombe sur All)', () => {
    expect(pick({ currentSelection: 'cfg-vieille' })).toHaveLength(2)
  })

  it('ignore la sentinelle cfg-all de la liste et la liste vide', () => {
    expect(pick({ configurations: [{ id: 'cfg-all' }] })).toEqual([])
    expect(pick({ configurations: [] })).toEqual([])
    expect(pick({ configurations: null })).toEqual([])
  })
})

describe('analyse/prewarmAllConfigsContext', () => {
  const FULL = (id) => ({
    id,
    data: { floors: [{ name: 'RDC', elements: [{ id: `el-${id}`, name: `Bar ${id}`, type: 'shop' }] }] },
  })

  function makeStore() {
    const fetchForSpace = jest.fn(() => Promise.resolve([
      { id: 'sh-1', name: 'Bar cfg-1', configId: 'cfg-1' },
      { id: 'sh-2', name: 'Bar cfg-2', configId: 'cfg-2' },
    ]))
    const spaceShops = { namespaced: true, actions: { fetchForSpace } }
    const store = createStore({ modules: { analyse, spaceShops } })
    store.commit('analyse/SET_SPACE_ID', SPACE_ID)
    return { store, fetchForSpace }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    resetConfigShopEntryCache()
    getBuilderState.mockResolvedValue({ zones: [] })
    getConfiguration.mockImplementation((id) => Promise.resolve(FULL(id)))
    getConfigShopMenuItemsLight.mockResolvedValue({ 'sh-1': { items: [{ id: 'mi-1', name: 'Beer' }] } })
  })

  it('lit chaque configuration une fois, et l\'union lancée ensuite ne relit rien', async () => {
    const { store } = makeStore()
    await store.dispatch('analyse/prewarmAllConfigsContext', { configurations: CFGS })
    expect(getConfiguration).toHaveBeenCalledTimes(2)
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(2)

    store.commit('analyse/SET_CONFIGURATIONS', CFGS)
    await store.dispatch('analyse/loadAllConfigsShopContext')

    expect(getConfiguration).toHaveBeenCalledTimes(2)
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(2)
    expect(store.state.analyse.configShopContext.configId).toBeNull()
  })

  it('donne le même contexte union que sans préchauffage', async () => {
    const a = makeStore().store
    a.commit('analyse/SET_CONFIGURATIONS', CFGS)
    await a.dispatch('analyse/loadAllConfigsShopContext')

    resetConfigShopEntryCache()
    const b = makeStore().store
    await b.dispatch('analyse/prewarmAllConfigsContext', { configurations: CFGS })
    b.commit('analyse/SET_CONFIGURATIONS', CFGS)
    await b.dispatch('analyse/loadAllConfigsShopContext')

    const ca = a.state.analyse.configShopContext
    const cb = b.state.analyse.configShopContext
    expect(cb.floorElements.map((e) => e.name)).toEqual(ca.floorElements.map((e) => e.name))
    expect([...cb.assignmentItemsByShop.entries()]).toEqual([...ca.assignmentItemsByShop.entries()])
    expect(cb.assignment).toEqual(ca.assignment)
  })

  it('ne lit rien dans Event Predict, ni pour un lien profond, ni si une config précise est conservée', async () => {
    const ep = makeStore().store
    ep.commit('analyse/SET_TOOLBOX', 'event-predict')
    await ep.dispatch('analyse/prewarmAllConfigsContext', { configurations: CFGS })

    const deep = makeStore().store
    await deep.dispatch('analyse/prewarmAllConfigsContext', { configurations: CFGS, urlConfig: 'cfg-2' })

    const kept = makeStore().store
    kept.commit('analyse/UPDATE_FILTER', { key: 'selectedConfigurationId', value: 'cfg-1' })
    await kept.dispatch('analyse/prewarmAllConfigsContext', { configurations: CFGS })

    expect(getConfiguration).not.toHaveBeenCalled()
    expect(getConfigShopMenuItemsLight).not.toHaveBeenCalled()
  })

  it('ne lève jamais, même si la lecture d\'une configuration échoue', async () => {
    getConfiguration.mockRejectedValue(new Error('boom'))
    const { store } = makeStore()
    await expect(store.dispatch('analyse/prewarmAllConfigsContext', { configurations: CFGS })).resolves.toBeUndefined()
  })

  it('un lot d\'articles en échec n\'est pas mémorisé : l\'union relit', async () => {
    getConfigShopMenuItemsLight.mockRejectedValueOnce(new Error('boom'))
    const { store } = makeStore()
    await store.dispatch('analyse/prewarmAllConfigsContext', { configurations: [CFGS[0]] })
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(1)

    store.commit('analyse/SET_CONFIGURATIONS', [CFGS[0]])
    await store.dispatch('analyse/loadAllConfigsShopContext')
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(2)
    expect(store.state.analyse.configShopContext.assignmentItemsByShop.size).toBeGreaterThan(0)
  })
})
