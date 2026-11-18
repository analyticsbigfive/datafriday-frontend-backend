/**
 * useInventoryData.loadContext : le batch des articles par PdV part AVEC les rows et le plan
 * de la configuration, pas après eux. Même contenu final qu'avant ; le repli per-shop reste
 * en place quand le batch échoue.
 */
import { ref, defineComponent, h } from 'vue'
import { createStore } from 'vuex'
import { mount } from '@vue/test-utils'

jest.mock('@/api/endpoints/space.api', () => ({
  getSpaceShopList: jest.fn(),
}))
jest.mock('@/api/endpoints/menu.api', () => ({
  getShopMenuItems: jest.fn(),
  getConfigShopMenuItemsLight: jest.fn(),
}))
jest.mock('@/api/endpoints/configuration.api', () => ({
  getConfiguration: jest.fn(),
}))

import { getSpaceShopList } from '@/api/endpoints/space.api'
import { getShopMenuItems, getConfigShopMenuItemsLight } from '@/api/endpoints/menu.api'
import { getConfiguration } from '@/api/endpoints/configuration.api'
import spaceShops from '@/store/modules/spaceShops'
import shopMenuItems from '@/store/modules/shopMenuItems'
import { useInventoryData } from '@/composables/useInventoryData'
import { INVENTORY_SCOPE_SPACE } from '@/utils/inventoryScope'

const CFG = 'cfg-1'
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

function deferred() {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

function mountComposable(store, configId) {
  let api
  const Comp = defineComponent({
    setup() {
      api = useInventoryData(ref(configId))
      return () => h('div')
    },
  })
  mount(Comp, { global: { plugins: [store] } })
  return api
}

function makeStore() {
  return createStore({
    modules: {
      spaceShops: { namespaced: true, ...spaceShops },
      shopMenuItems: { namespaced: true, ...shopMenuItems },
      analyse: { namespaced: true, state: () => ({ menuItems: [], components: [], configurations: [] }) },
      inventory: { namespaced: true, state: () => ({ marketPrices: [] }) },
    },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  // cache MODULE-LEVEL de spaceShops : purge, sinon les rows d'un test fuient dans le suivant
  createStore({ modules: { spaceShops: { namespaced: true, ...spaceShops } } })
    .dispatch('spaceShops/invalidateForSpace', { spaceId: 'sp1' })
  getSpaceShopList.mockResolvedValue([{ id: 's1', name: 'Bar', configId: CFG, isOpen: true }])
  getConfiguration.mockResolvedValue({ data: { floors: [] } })
  getConfigShopMenuItemsLight.mockResolvedValue({
    s1: { items: [{ id: 'mi-1', name: 'Beer', enabled: true, basePrice: 5 }] },
  })
})

describe('useInventoryData.loadContext : départ du batch des articles', () => {
  it('le batch part avant la fin du détail de configuration', async () => {
    const config = deferred()
    getConfiguration.mockReturnValue(config.promise)

    const api = mountComposable(makeStore(), CFG)
    const done = api.loadContext('sp1', CFG)
    await tick(10)

    // détail de config encore en attente : le batch est déjà parti
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(1)
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledWith('sp1', CFG, { itemsScope: 'space' })

    config.resolve({ data: { floors: [] } })
    await done
    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(1)
  })

  it('même contenu qu\'avant : PdV de la config, articles du batch', async () => {
    const api = mountComposable(makeStore(), CFG)
    await api.loadContext('sp1', CFG)

    expect(api.contextError.value).toBeNull()
    expect(api.shops.value.map((s) => s.shopId)).toEqual(['s1'])
    expect(api.shops.value[0].items.map((i) => i.name)).toEqual(['Beer'])
    expect(getShopMenuItems).not.toHaveBeenCalled() // pas de repli per-shop quand le batch répond
  })

  it('PdV absent du batch = « 0 article », pas un échec', async () => {
    getConfigShopMenuItemsLight.mockResolvedValue({})
    const api = mountComposable(makeStore(), CFG)
    await api.loadContext('sp1', CFG)

    expect(api.shops.value.map((s) => s.shopId)).toEqual(['s1'])
    expect(api.shops.value[0].items).toEqual([])
    expect(getShopMenuItems).not.toHaveBeenCalled()
  })

  it('batch en échec : repli per-shop conservé', async () => {
    getConfigShopMenuItemsLight.mockRejectedValue(new Error('batch KO'))
    getShopMenuItems.mockResolvedValue({ menuItems: [{ id: 'mi-1', name: 'Beer', enabled: true }] })

    const api = mountComposable(makeStore(), CFG)
    await api.loadContext('sp1', CFG)

    expect(getShopMenuItems).toHaveBeenCalled()
    expect(api.shops.value[0].items.map((i) => i.name)).toEqual(['Beer'])
  })

  it('« Voir tout l\'inventaire » : le batch demande aussi les PdV de toutes les configurations', async () => {
    const api = mountComposable(makeStore(), CFG)
    await api.loadContext('sp1', CFG, { scope: INVENTORY_SCOPE_SPACE })

    expect(getConfigShopMenuItemsLight).toHaveBeenCalledWith('sp1', CFG, { itemsScope: 'space', shopsScope: 'space' })
  })

  it('deux chargements simultanés du même contexte : un seul batch (single-flight conservé)', async () => {
    const api = mountComposable(makeStore(), CFG)
    await Promise.all([api.loadContext('sp1', CFG), api.loadContext('sp1', CFG)])

    expect(getConfigShopMenuItemsLight).toHaveBeenCalledTimes(1)
  })
})
