/**
 * fetchSpaceData, départs anticipés (Analyse, Live) :
 *  - `earlyCatalogs` : les catalogues de la vague 2a partent AVEC la phase 1, pas après ;
 *  - `onConfigurations` : rappelé dès que la liste des configurations répond, avant la fin de la phase 1 ;
 *  - le rappel d'enrichissement ne précède jamais les commits de la phase 1 de l'appelant,
 *    même quand tous les catalogues sont déjà arrivés ;
 *  - sans option, le comportement d'avant est conservé (catalogues lancés après la phase 1).
 */
jest.mock('@/api/endpoints/space.api', () => ({
  getSpace: jest.fn(),
  getSpaceConfigurations: jest.fn(),
  getSpaceShopDetails: jest.fn(),
  getSpaceShopGranular: jest.fn(),
}))
jest.mock('@/api/endpoints/event.api', () => ({ getEvents: jest.fn() }))
jest.mock('@/api/endpoints/menu-item.api', () => ({ getAllMenuItems: jest.fn() }))
jest.mock('@/api/endpoints/menu.api', () => ({
  getProductTypes: jest.fn(),
  getProductCategories: jest.fn(),
  getMenuComponents: jest.fn(),
  getMenuComponent: jest.fn(),
}))
jest.mock('@/api/endpoints/ingredient.api', () => ({ getIngredients: jest.fn() }))
jest.mock('@/api/endpoints/inventory.api', () => ({ getAllPackagingTypes: jest.fn() }))
jest.mock('@/api/endpoints/aggregation.api', () => ({ getWeezeventProducts: jest.fn() }))
jest.mock('@/api/endpoints/mapping.api', () => ({ getProductMappings: jest.fn() }))

import {
  getSpace, getSpaceConfigurations, getSpaceShopGranular,
} from '@/api/endpoints/space.api'
import { getEvents } from '@/api/endpoints/event.api'
import { getAllMenuItems } from '@/api/endpoints/menu-item.api'
import { getProductTypes, getProductCategories } from '@/api/endpoints/menu.api'
import { getWeezeventProducts } from '@/api/endpoints/aggregation.api'
import { getProductMappings } from '@/api/endpoints/mapping.api'
import { fetchSpaceData } from '@/composables/useSpaceData'

const SPACE_ID = 'sp-1'
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

function deferred() {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

function mockCatalogs() {
  getAllMenuItems.mockResolvedValue([{ id: 'mi-1', name: 'Beer' }])
  getProductTypes.mockResolvedValue([{ id: 'pt-1', name: 'Beverage' }])
  getProductCategories.mockResolvedValue([{ id: 'pc-1', name: 'Beer', typeId: 'pt-1' }])
  getWeezeventProducts.mockResolvedValue([])
  getProductMappings.mockResolvedValue([])
  getSpaceShopGranular.mockResolvedValue({ shopGranularData: [] })
}

const catalogMocks = () => [getAllMenuItems, getProductTypes, getProductCategories, getWeezeventProducts, getProductMappings]

beforeEach(() => {
  jest.clearAllMocks()
  mockCatalogs()
  getSpace.mockResolvedValue({ id: SPACE_ID, name: 'Arena' })
  getSpaceConfigurations.mockResolvedValue([{ id: 'cfg-1', name: 'Cfg' }])
  getEvents.mockResolvedValue({ data: [{ id: 'e1', date: '2026-01-01' }] })
})

describe('fetchSpaceData, catalogues de la vague 2a', () => {
  it('earlyCatalogs : les catalogues partent avant la fin de la phase 1', async () => {
    const events = deferred()
    getEvents.mockReturnValue(events.promise)

    const done = fetchSpaceData(SPACE_ID, () => {}, { skipRecipeCatalog: true, earlyCatalogs: true })
    await tick(5)

    catalogMocks().forEach((m) => expect(m).toHaveBeenCalledTimes(1))

    events.resolve({ data: [] })
    await done
    await tick(5)
    // lus une seule fois : la vague 2a réutilise les promesses déjà lancées
    catalogMocks().forEach((m) => expect(m).toHaveBeenCalledTimes(1))
  })

  it('sans option : les catalogues ne partent qu\'après la phase 1 (comportement d\'avant)', async () => {
    const events = deferred()
    getEvents.mockReturnValue(events.promise)

    const done = fetchSpaceData(SPACE_ID, () => {}, { skipRecipeCatalog: true })
    await tick(5)
    catalogMocks().forEach((m) => expect(m).not.toHaveBeenCalled())

    events.resolve({ data: [] })
    await done
    await tick(5)
    catalogMocks().forEach((m) => expect(m).toHaveBeenCalledTimes(1))
  })

  it('earlyCatalogs : le rappel d\'enrichissement vient APRES les commits de la phase 1', async () => {
    const order = []
    // tout est déjà résolu quand la phase 1 se termine : pire cas pour l'ordre. L'appelant met
    // plusieurs microtâches à committer (dispatch, enveloppes) : l'ordre ne doit pas dépendre
    // de leur nombre.
    await fetchSpaceData(SPACE_ID, () => order.push('enrichissement'), { skipRecipeCatalog: true, earlyCatalogs: true })
    for (let i = 0; i < 25; i += 1) await null
    order.push('commit phase 1')
    await tick(10)

    expect(order[0]).toBe('commit phase 1')
    expect(order).toContain('enrichissement')
  })

  it('earlyCatalogs : même contenu d\'enrichissement qu\'à la suite', async () => {
    const run = async (opts) => {
      const calls = []
      await fetchSpaceData(SPACE_ID, (e) => calls.push(e), { skipRecipeCatalog: true, ...opts })
      await tick(10)
      return calls
    }
    const before = await run({})
    const early = await run({ earlyCatalogs: true })

    expect(early).toHaveLength(before.length)
    expect(early[0].menuItems.map((m) => m.id)).toEqual(before[0].menuItems.map((m) => m.id))
    expect(early[0].productTypes).toEqual(before[0].productTypes)
    expect(early[0].productCategories).toEqual(before[0].productCategories)
  })
})

describe('fetchSpaceData, rappel onConfigurations', () => {
  it('est appelé dès que la liste répond, avant la fin de la phase 1', async () => {
    const events = deferred()
    getEvents.mockReturnValue(events.promise)
    const onConfigurations = jest.fn()

    const done = fetchSpaceData(SPACE_ID, () => {}, { skipRecipeCatalog: true, onConfigurations })
    await tick(5)

    expect(onConfigurations).toHaveBeenCalledTimes(1)
    expect(onConfigurations).toHaveBeenCalledWith([{ id: 'cfg-1', name: 'Cfg' }])

    events.resolve({ data: [] })
    await done
  })

  it('un rappel qui lève ne casse pas le chargement', async () => {
    const onConfigurations = jest.fn(() => { throw new Error('boom') })
    const data = await fetchSpaceData(SPACE_ID, () => {}, { skipRecipeCatalog: true, onConfigurations })
    expect(data.configurations).toEqual([{ id: 'cfg-1', name: 'Cfg' }])
  })

  it('n\'est pas appelé quand la lecture des configurations échoue, et le repli [] est signalé', async () => {
    getSpaceConfigurations.mockRejectedValue(new Error('KO'))
    const onConfigurations = jest.fn()
    const data = await fetchSpaceData(SPACE_ID, () => {}, { skipRecipeCatalog: true, onConfigurations })

    expect(onConfigurations).not.toHaveBeenCalled()
    expect(data.configurations).toEqual([])
    expect(data._configurationsFetchFailed).toBe(true)
  })
})
