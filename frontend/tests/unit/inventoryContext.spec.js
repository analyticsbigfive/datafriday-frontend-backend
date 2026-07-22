/**
 * Inventaire par contexte Event Predict — liste canonique des shops.
 * Couvre : robustesse buildConsolidatedInventory (crash localeCompare), single-flight
 * des stores, buildConfigShopList (union rows+floors, homonymes, enrichissement),
 * et loadContext (TOUS les shops de la config visibles — plus de gate isOpen,
 * enabled présent/absent, storage displayName, chemins d'erreur).
 */
import { ref } from 'vue'
import { createStore } from 'vuex'
import { buildConsolidatedInventory } from '@/utils/inventoryUtils'

// --- Mocks endpoints (consommés par les stores + useInventoryData) -----------
jest.mock('@/api/endpoints/space.api', () => ({
  getSpaceShopList: jest.fn(),
}))
jest.mock('@/api/endpoints/menu.api', () => ({
  getShopMenuItems: jest.fn(),
}))
jest.mock('@/api/endpoints/configuration.api', () => ({
  getConfiguration: jest.fn(),
}))

import { getSpaceShopList } from '@/api/endpoints/space.api'
import { getShopMenuItems } from '@/api/endpoints/menu.api'
import { getConfiguration } from '@/api/endpoints/configuration.api'
import spaceShops from '@/store/modules/spaceShops'
import shopMenuItems from '@/store/modules/shopMenuItems'
import { useInventoryData, buildConfigShopList } from '@/composables/useInventoryData'

// Monte un composable dans un contexte Vue minimal (setup) avec un store injecté.
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

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
      analyse: { namespaced: true, state: () => ({ menuItems: [], components: [] }) },
      inventory: { namespaced: true, state: () => ({ marketPrices: [] }) },
    },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  getConfiguration.mockResolvedValue({ data: { floors: [] } })
  // Le store spaceShops garde un cache MODULE-LEVEL (hors state Vuex, partagé entre
  // instances) → sans purge, les rows du 1er test (sp1::cfg-1 = 18 shops) fuient dans
  // les tests suivants (mêmes spaceId/config) et masquent leur mock. On purge avant
  // chaque test (invalidateForSpace sans configId = toutes les clés `sp1::*`).
  createStore({ modules: { spaceShops: { namespaced: true, ...spaceShops } } })
    .dispatch('spaceShops/invalidateForSpace', { spaceId: 'sp1' })
})

describe('buildConsolidatedInventory — robustesse (plus de crash localeCompare)', () => {
  it('un component sans name est ignoré, aucun crash au sort', () => {
    const item = {
      id: 'mi-1',
      name: 'Menu Sans Combo',
      readyForSale: 'No',
      comboItem: 'No',
      components: [
        { id: 'c-nameless', itemType: 'Ingredient' }, // pas de name → clé undefined
        { id: 'c-ok', name: 'Sel', itemType: 'Ingredient' },
      ],
    }
    let res
    expect(() => {
      res = buildConsolidatedInventory([item], [item], [], false, [])
    }).not.toThrow()
    expect(res.every((r) => typeof r.name === 'string' && r.name.length > 0)).toBe(true)
    expect(res.map((r) => r.name)).toContain('Sel')
  })

  it('des ids numériques ne cassent pas le calcul isPackaging (toLowerCase)', () => {
    const item = {
      id: 42,
      name: 'Ready Item',
      readyForSale: 'Yes',
      comboItem: 'No',
      components: [{ id: 7, name: 'Gobelet', category: 'Packaging', itemType: 'Component' }],
    }
    expect(() => buildConsolidatedInventory([item], [item], [], false, [])).not.toThrow()
  })
})

describe('stores — single-flight attend l\'hydratation', () => {
  it('deux fetchForShop concurrents partagent la MÊME promesse (1 seul appel API) et hydratent', async () => {
    getShopMenuItems.mockResolvedValue({ menuItems: [{ id: 'i1', name: 'A', enabled: true }] })
    const store = makeStore()
    const [a, b] = [
      store.dispatch('shopMenuItems/fetchForShop', { shopId: 's1' }),
      store.dispatch('shopMenuItems/fetchForShop', { shopId: 's1' }),
    ]
    await Promise.all([a, b])
    expect(getShopMenuItems).toHaveBeenCalledTimes(1)
    expect(store.getters['shopMenuItems/forShop']('s1')).toHaveLength(1)
  })

  it('fetchForSpace retourne les rows unwrappées (module action-only)', async () => {
    getSpaceShopList.mockResolvedValue([{ id: 's1', name: 'Bar', configId: 'cfg-1' }])
    const store = makeStore()
    const [a, b] = await Promise.all([
      store.dispatch('spaceShops/fetchForSpace', { spaceId: 'sp1' }),
      store.dispatch('spaceShops/fetchForSpace', { spaceId: 'sp1' }),
    ])
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })
})

describe('buildConfigShopList — union rows NestJS + éléments de plan', () => {
  it('element floor matché par id → enrichit floorName/shopType/shopArea, pas de doublon', () => {
    const rows = [{ id: 's1', name: 'Bar Nord', isOpen: true }]
    const floors = [
      {
        name: 'Floor A',
        elements: [{ id: 's1', type: 'shop', name: 'Bar Nord', shopType: ['Bar'], shopArea: 'Nord' }],
      },
    ]
    const list = buildConfigShopList(rows, floors)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      shopId: 's1',
      source: 'api',
      floorName: 'Floor A',
      shopType: ['Bar'],
      shopArea: 'Nord',
    })
  })

  it('element floor sans row API → nouvelle entrée source:config, isOpen null', () => {
    const rows = [{ id: 's1', name: 'Bar', isOpen: true }]
    const floors = [
      {
        name: 'Floor B',
        elements: [{ id: 'floor-only-1', type: 'shop', name: 'Kiosque', shopType: ['Kiosque'] }],
      },
    ]
    const list = buildConfigShopList(rows, floors)
    expect(list).toHaveLength(2)
    const kiosque = list.find((e) => e.shopId === 'floor-only-1')
    expect(kiosque).toMatchObject({
      name: 'Kiosque',
      source: 'config',
      isOpen: null,
      floorName: 'Floor B',
    })
  })

  it('match par nom : enrichit SEULEMENT si non ambigu (homonymes jamais mergés)', () => {
    const rows = [
      { id: 'a', name: 'Buvette', isOpen: true },
      { id: 'b', name: 'Buvette', isOpen: false },
    ]
    const floors = [
      { name: 'F1', elements: [{ id: 'el-x', type: 'shop', name: 'Buvette', shopArea: 'Sud' }] },
    ]
    const list = buildConfigShopList(rows, floors)
    // 2 homonymes ambigus → PAS d'enrichissement, l'élément devient sa propre entrée.
    expect(list).toHaveLength(3)
    expect(list.filter((e) => e.shopArea === 'Sud').map((e) => e.shopId)).toEqual(['el-x'])
  })

  it('match par nom non ambigu (id différent) → enrichit sans créer d\'entrée', () => {
    const rows = [{ id: 'a', name: 'Grande Buvette', isOpen: true }]
    const floors = [
      {
        name: 'F1',
        elements: [{ id: 'el-y', type: 'shop', name: 'Grande Buvette', shopArea: 'Est' }],
      },
    ]
    const list = buildConfigShopList(rows, floors)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ shopId: 'a', shopArea: 'Est', floorName: 'F1' })
  })

  it('éléments non-shop ignorés ; rows sans id skippées', () => {
    const rows = [{ name: 'Sans Id' }]
    const floors = [
      { name: 'F1', elements: [{ id: 'st-1', type: 'storage', name: 'Réserve' }] },
    ]
    expect(buildConfigShopList(rows, floors)).toHaveLength(0)
  })
})

describe('useInventoryData.loadContext — TOUS les shops de la config', () => {
  const CFG = 'cfg-1'

  function shopRow(id, name, extra = {}) {
    return { id, name, configId: CFG, ...extra }
  }

  it('5 ouverts + 13 fermés ⇒ 18 shops (fermés visibles), menus fetchés pour les 18', async () => {
    const open = Array.from({ length: 5 }, (_, i) =>
      shopRow(`open-${i}`, `Open ${i}`, { isOpen: true, menuItemsCount: 3 }),
    )
    const closed = Array.from({ length: 13 }, (_, i) =>
      shopRow(`closed-${i}`, `Closed ${i}`, { isOpen: false, menuItemsCount: 0 }),
    )
    getSpaceShopList.mockResolvedValue([...open, ...closed])
    getShopMenuItems.mockResolvedValue({ menuItems: [{ id: 'x', name: 'Item', enabled: true }] })

    const store = makeStore()
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)

    expect(api.shops.value).toHaveLength(18)
    expect(getShopMenuItems).toHaveBeenCalledTimes(18)
    const closedShop = api.shops.value.find((s) => s.shopId === 'closed-0')
    expect(closedShop.isOpen).toBe(false) // statut d'affichage conservé
    expect(closedShop.items).toHaveLength(1) // items assignés visibles même fermé
  })

  it('fetchForSpace reçoit le configId (filtrage serveur)', async () => {
    getSpaceShopList.mockResolvedValue([])
    const store = makeStore()
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)
    expect(getSpaceShopList).toHaveBeenCalledWith('sp1', CFG)
  })

  it('shop du plan sans row NestJS : présent, 404 menu toléré ⇒ 0 item sans warning', async () => {
    getSpaceShopList.mockResolvedValue([shopRow('s1', 'Bar', { isOpen: true })])
    getConfiguration.mockResolvedValue({
      data: {
        floors: [
          { name: 'F1', elements: [{ id: 'floor-only', type: 'shop', name: 'Kiosque' }] },
        ],
      },
    })
    getShopMenuItems.mockImplementation((shopId) => {
      if (shopId === 'floor-only') return Promise.reject({ response: { status: 404 } })
      return Promise.resolve({ menuItems: [{ id: 'x', name: 'Item', enabled: true }] })
    })

    const store = makeStore()
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)

    expect(api.shops.value.map((s) => s.shopId).sort()).toEqual(['floor-only', 's1'])
    const kiosque = api.shops.value.find((s) => s.shopId === 'floor-only')
    expect(kiosque.items).toHaveLength(0)
    expect(kiosque.source).toBe('config')
    expect(api.contextWarning.value).toBeNull()
  })

  it('enabled présent → filtre enabled===true ; shop reste une carte même à 0 item', async () => {
    getSpaceShopList.mockResolvedValue([shopRow('open-1', 'Open', { isOpen: true })])
    getShopMenuItems.mockResolvedValue({
      menuItems: [
        { id: 'a', name: 'A', enabled: false },
        { id: 'b', name: 'B', enabled: false },
      ],
    })
    const store = makeStore()
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)

    expect(api.shops.value).toHaveLength(1)
    expect(api.shops.value[0].items).toHaveLength(0)
  })

  it('payload sans champ enabled → fallback « tous les items »', async () => {
    getSpaceShopList.mockResolvedValue([shopRow('s1', 'Bar', { isOpen: false })])
    getShopMenuItems.mockResolvedValue({ menuItems: [{ id: 'x', name: 'Item' }] })
    const store = makeStore()
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)

    expect(api.shops.value).toHaveLength(1)
    expect(api.shops.value[0].items).toHaveLength(1)
  })

  it('homonymes : deux shops même nom → deux cartes + deux entrées dans shopsByName', async () => {
    getSpaceShopList.mockResolvedValue([
      shopRow('id-1', 'Buvette', { isOpen: true }),
      shopRow('id-2', 'Buvette', { isOpen: true }),
    ])
    getShopMenuItems.mockResolvedValue({ menuItems: [{ id: 'x', name: 'Item', enabled: true }] })
    const store = makeStore()
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)

    expect(api.shops.value).toHaveLength(2)
    const byName = [...api.shopsByName.value.values()]
    expect(byName).toHaveLength(1) // même clé normalisée
    expect(byName[0]).toHaveLength(2) // mais 2 shops dans le tableau
  })

  it('filtre configId (String vs number) : ne garde que la config demandée', async () => {
    getSpaceShopList.mockResolvedValue([
      { id: 'a', name: 'Bon', configId: 1, isOpen: true },
      { id: 'b', name: 'Autre', configId: 2, isOpen: true },
    ])
    getShopMenuItems.mockResolvedValue({ menuItems: [{ id: 'x', name: 'Item', enabled: true }] })
    const store = makeStore()
    const api = mountComposable(store, 1)
    await api.loadContext('sp1', 1)

    expect(api.shops.value.map((s) => s.shopId)).toEqual(['a'])
  })

  it('storage : homonymes désambiguïsés par displayName « — floor », clé = element.id', async () => {
    getSpaceShopList.mockResolvedValue([])
    getConfiguration.mockResolvedValue({
      data: {
        floors: [
          { name: 'Floor A', elements: [{ id: 'st-1', type: 'storage', name: 'Réserve' }] },
          {
            name: 'Floor B',
            elements: [
              { id: 'st-2', type: 'storage', name: 'Réserve' },
              { id: 'st-3', type: 'storage', name: 'Cave' },
            ],
          },
        ],
      },
    })
    const store = makeStore()
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)

    const storages = api.storagesWithInventory.value.map((e) => e.element)
    expect(storages.map((s) => s.id)).toEqual(['st-1', 'st-2', 'st-3'])
    expect(storages.find((s) => s.id === 'st-1').displayName).toBe('Réserve — Floor A')
    expect(storages.find((s) => s.id === 'st-2').displayName).toBe('Réserve — Floor B')
    expect(storages.find((s) => s.id === 'st-3').displayName).toBe('Cave')
  })

  it('rows KO + config KO → contextError', async () => {
    getSpaceShopList.mockRejectedValue(new Error('boom'))
    getConfiguration.mockRejectedValue(new Error('boom2'))
    const store = makeStore()
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)
    expect(api.contextError.value).toBeTruthy()
    expect(api.shops.value).toHaveLength(0)
  })

  it('rows KO mais config OK → shops depuis le plan + warning assignment-partial', async () => {
    getSpaceShopList.mockRejectedValue(new Error('boom'))
    getConfiguration.mockResolvedValue({
      data: {
        floors: [{ name: 'F1', elements: [{ id: 'el-1', type: 'shop', name: 'Bar Plan' }] }],
      },
    })
    getShopMenuItems.mockResolvedValue({ menuItems: [] })
    const store = makeStore()
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)

    expect(api.contextError.value).toBeNull()
    expect(api.contextWarning.value).toBe('assignment-partial')
    expect(api.shops.value.map((s) => s.shopId)).toEqual(['el-1'])
  })
})

/**
 * BUG-227 — la vignette d'un article vient du CATALOGUE, jamais du payload
 * d'assignation. C'est ce qui a permis de retirer `picture` de
 * getConfigShopMenuItemsLight (photo base64 réémise une fois par PdV : 5,6 Mo /
 * 53 s). Sans ce test, une refonte de `enrichForBuild` casserait les vignettes de
 * Space Inventory en silence — aucun autre test ne couvre ce chemin.
 */
describe('useInventoryData — vignette résolue depuis le catalogue (BUG-227)', () => {
  const CFG = 'cfg-1'
  const PIC = 'data:image/jpeg;base64,AAAA'

  function makeStoreWithCatalog(menuItems) {
    return createStore({
      modules: {
        spaceShops: { namespaced: true, ...spaceShops },
        shopMenuItems: { namespaced: true, ...shopMenuItems },
        analyse: { namespaced: true, state: () => ({ menuItems, components: [] }) },
        inventory: { namespaced: true, state: () => ({ marketPrices: [] }) },
      },
    })
  }

  it('item d\'assignation SANS picture + catalogue porteur ⇒ photo du catalogue', async () => {
    getSpaceShopList.mockResolvedValue([{ id: 's1', name: 'Bar', configId: CFG, isOpen: true }])
    // Payload d'assignation tel qu'il est depuis le fix : aucune photo.
    getShopMenuItems.mockResolvedValue({
      menuItems: [{ id: 'mi-1', name: 'BURGER SEUL', enabled: true, basePrice: 9 }],
    })

    const store = makeStoreWithCatalog([{ id: 'mi-1', name: 'BURGER SEUL', picture: PIC }])
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)

    // Le payload d'assignation ne transporte plus la photo…
    expect(api.shops.value[0].items[0].picture).toBeUndefined()
    // …et pourtant l'article affiché en porte une, résolue par id via le catalogue.
    const shop = api.shopsWithInventory.value.find((s) => s.element.id === 's1')
    expect(shop.availableMenuItems[0].picture).toBe(PIC)
  })

  it('repli par NOM normalisé quand l\'id d\'assignation diffère de l\'id catalogue', async () => {
    getSpaceShopList.mockResolvedValue([{ id: 's1', name: 'Bar', configId: CFG, isOpen: true }])
    getShopMenuItems.mockResolvedValue({
      menuItems: [{ id: 'nest-42', name: 'Burger Seul', enabled: true }],
    })

    const store = makeStoreWithCatalog([{ id: 'mi-1', name: 'BURGER SEUL', picture: PIC }])
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)

    const shop = api.shopsWithInventory.value.find((s) => s.element.id === 's1')
    expect(shop.availableMenuItems[0].picture).toBe(PIC)
  })

  it('article absent du catalogue : pas de photo, pas de crash', async () => {
    getSpaceShopList.mockResolvedValue([{ id: 's1', name: 'Bar', configId: CFG, isOpen: true }])
    getShopMenuItems.mockResolvedValue({
      menuItems: [{ id: 'ghost', name: 'Article hors catalogue', enabled: true }],
    })

    const store = makeStoreWithCatalog([])
    const api = mountComposable(store, CFG)
    await api.loadContext('sp1', CFG)

    const shop = api.shopsWithInventory.value.find((s) => s.element.id === 's1')
    expect(shop.availableMenuItems).toHaveLength(1)
    expect(shop.availableMenuItems[0].picture).toBeUndefined()
  })
})
