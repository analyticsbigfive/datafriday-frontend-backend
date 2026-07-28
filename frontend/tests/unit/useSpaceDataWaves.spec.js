/**
 * useSpaceData — découpage de la phase 2 en deux vagues (lot D du plan de
 * chargement progressif).
 *
 * Invariants couverts :
 *   - `onEnrichment` est appelé DEUX fois (2a graphes, puis 2b recettes) ;
 *   - la vague 2a porte les données des graphes SANS attendre les catalogues
 *     recette (c'est tout l'objet du lot : `enriching` retombe plus tôt) ;
 *   - la vague 2b n'envoie QUE son delta — réémettre le granular relancerait
 *     toute la réconciliation une 2e fois pour des données identiques ;
 *   - un échec de la vague 2b n'écrase PAS ce que 2a a déjà affiché ;
 *   - le chemin legacy (sans callback) retourne toujours l'objet complet.
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
  getSpace, getSpaceConfigurations, getSpaceShopDetails, getSpaceShopGranular,
} from '@/api/endpoints/space.api'
import { getEvents } from '@/api/endpoints/event.api'
import { getAllMenuItems } from '@/api/endpoints/menu-item.api'
import { getProductTypes, getProductCategories, getMenuComponents } from '@/api/endpoints/menu.api'
import { getIngredients } from '@/api/endpoints/ingredient.api'
import { getAllPackagingTypes } from '@/api/endpoints/inventory.api'
import { getWeezeventProducts } from '@/api/endpoints/aggregation.api'
import { getProductMappings } from '@/api/endpoints/mapping.api'
import { fetchSpaceData } from '@/composables/useSpaceData'

const SPACE_ID = 'sp-1'

function mockHappyPath() {
  getSpace.mockResolvedValue({ id: SPACE_ID, name: 'Arena' })
  getSpaceConfigurations.mockResolvedValue([{ id: 'cfg-1', name: 'Cfg' }])
  getSpaceShopDetails.mockResolvedValue({ shops: [{ id: 'sh-1' }], suppliers: [{ id: 'sup-1' }] })
  getEvents.mockResolvedValue({ data: [{ id: 'e1', date: '2026-01-01' }] })
  getAllMenuItems.mockResolvedValue([{ id: 'mi-1', name: 'Beer' }])
  getSpaceShopGranular.mockResolvedValue({
    shopGranularData: [{ shopName: 'Bar', menuItemId: 'mi-1', revenueHt: 10, quantity: 1 }],
  })
  getProductTypes.mockResolvedValue([{ id: 'pt-1', name: 'Beverage' }])
  getProductCategories.mockResolvedValue([{ id: 'pc-1', name: 'Beer', typeId: 'pt-1' }])
  getWeezeventProducts.mockResolvedValue([])
  getProductMappings.mockResolvedValue([])
  // Vague 2b
  getIngredients.mockResolvedValue([{ id: 'ing-1', name: 'Malt' }])
  getMenuComponents.mockResolvedValue({ data: [{ id: 'cmp-1', name: 'Cup', subComponents: [{ name: 'x' }] }] })
  getAllPackagingTypes.mockResolvedValue([{ id: 'pk-1', name: 'Cup 50cl' }])
}

/** Laisse tourner les microtâches jusqu'à ce que les 2 vagues aient émis. */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('useSpaceData — phase 2 en deux vagues', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHappyPath()
  })

  it('appelle onEnrichment deux fois : graphes (2a) puis recettes (2b)', async () => {
    const calls = []
    await fetchSpaceData(SPACE_ID, (e) => calls.push(e))
    await flush()

    expect(calls).toHaveLength(2)

    // 2a : de quoi peindre les graphes.
    const [wave2a, wave2b] = calls
    expect(wave2a.shopGranularData).toHaveLength(1)
    expect(wave2a.menuItems).toHaveLength(1)
    expect(wave2a.productTypes).toHaveLength(1)
    expect(wave2a.productCategories).toHaveLength(1)
    // Le costMap (marge) est calculé en 2a : il n'attend pas les recettes.
    expect(wave2a.menuItemCostMap).toBeDefined()
    // ...et PAS les catalogues recette (c'est tout l'objet du découpage).
    expect(wave2a.components).toBeUndefined()
    expect(wave2a.ingredients).toBeUndefined()

    // 2b : DELTA recette uniquement — pas de granular réémis (sinon la
    // réconciliation se relance intégralement pour des données identiques).
    expect(wave2b.components).toHaveLength(1)
    expect(wave2b.ingredients).toHaveLength(1)
    expect(wave2b.menuItems).toHaveLength(1)
    expect(wave2b.shopGranularData).toBeUndefined()
    expect(wave2b.productTypes).toBeUndefined()
  })

  it("la vague 2a n'attend pas les endpoints recette", async () => {
    let releaseIngredients
    getIngredients.mockReturnValue(new Promise((r) => { releaseIngredients = r }))
    const calls = []

    await fetchSpaceData(SPACE_ID, (e) => calls.push(e))
    await flush()

    // 2b est bloquée sur /ingredients, mais 2a a déjà émis.
    expect(calls).toHaveLength(1)
    expect(calls[0].shopGranularData).toHaveLength(1)

    releaseIngredients([{ id: 'ing-1', name: 'Malt' }])
    await flush()
    expect(calls).toHaveLength(2)
  })

  it("un échec de la vague 2b n'écrase pas les données de 2a", async () => {
    // Un throw HORS des .catch par endpoint (ici la normalisation du catalogue).
    getMenuComponents.mockRejectedValue(new Error('boom'))
    getIngredients.mockImplementation(() => { throw new Error('sync boom') })
    const calls = []

    await fetchSpaceData(SPACE_ID, (e) => calls.push(e))
    await flush()

    expect(calls.length).toBeGreaterThanOrEqual(1)
    // 1re émission intacte.
    expect(calls[0].shopGranularData).toHaveLength(1)
    expect(calls[0].menuItems).toHaveLength(1)
    // Une 2e émission éventuelle ne doit JAMAIS porter un menuItems vide.
    for (const c of calls.slice(1)) {
      expect(c.menuItems === undefined || c.menuItems.length > 0).toBe(true)
    }
  })

  it('chemin legacy (sans callback) : tout est retourné en une fois', async () => {
    const data = await fetchSpaceData(SPACE_ID)

    expect(data.menuItems).toHaveLength(1)
    expect(data.shopGranularData).toHaveLength(1)
    expect(data.components).toHaveLength(1)
    expect(data.ingredients).toHaveLength(1)
    expect(data.productTypes).toHaveLength(1)
  })
})
