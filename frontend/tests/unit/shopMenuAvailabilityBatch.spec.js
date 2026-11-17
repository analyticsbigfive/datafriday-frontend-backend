import { buildShopRowsFromBatch, loadShopRowsForConfig } from '@/utils/shopMenuAvailabilityBatch'
import { deriveShopMenuEntry } from '@/utils/shopMenuAssignmentMaps'

jest.mock('@/api/endpoints/menu.api', () => ({
  getShopAvailableMenuItems: jest.fn(),
  getSpaceMenuItemsWithAvailability: jest.fn(),
  getSpaceMenuConfiguration: jest.fn(),
}))
// eslint-disable-next-line import/first
import * as menuApi from '@/api/endpoints/menu.api'
// eslint-disable-next-line import/first
import shopMenuAvailability from '@/store/modules/shopMenuAvailability'

const spaceItems = [
  { id: 'mi-1', name: 'Bière', available: true, hasRecipe: true, missingIngredients: [], price: 7, productCategory: { name: 'Boissons' } },
  { id: 'mi-2', name: 'Hot-dog', available: false, hasRecipe: true, missingIngredients: [{ name: 'Saucisse' }], price: 6 },
  { id: 'mi-3', name: 'Frites', available: true, hasRecipe: true, missingIngredients: [] },
]

// shop-a : mi-1 activé, mi-2 assigné désactivé ; shop-b : rien d'assigné (absent de la matrice)
const matrix = { 'shop-a': { 'mi-1': true, 'mi-2': false } }

describe('buildShopRowsFromBatch', () => {
  it('reproduit enabled et assigned de GET /space-menu/shop/:id/items', () => {
    const rows = buildShopRowsFromBatch(spaceItems, matrix['shop-a'])
    expect(rows.map((r) => [r.id, r.enabled, r.assigned])).toEqual([
      ['mi-1', true, true],
      ['mi-2', false, true],
      ['mi-3', false, false],
    ])
  })

  it('un PdV sans aucune assignation voit tous les articles, non activés et non assignés', () => {
    const rows = buildShopRowsFromBatch(spaceItems, undefined)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.enabled === false && r.assigned === false)).toBe(true)
  })

  it('garde tous les champs de l article (disponibilité, recette, ingrédients manquants)', () => {
    const [first, second] = buildShopRowsFromBatch(spaceItems, matrix['shop-a'])
    expect(first.productCategory).toEqual({ name: 'Boissons' })
    expect(second.available).toBe(false)
    expect(second.missingIngredients).toEqual([{ name: 'Saucisse' }])
  })

  it('ne modifie pas la liste d articles de l espace (partagée entre PdV)', () => {
    buildShopRowsFromBatch(spaceItems, matrix['shop-a'])
    expect(spaceItems[0]).not.toHaveProperty('enabled')
  })

  it('alimente deriveShopMenuEntry comme la réponse par PdV : activés, improduisibles, appartenance', () => {
    const entry = deriveShopMenuEntry(buildShopRowsFromBatch(spaceItems, matrix['shop-a']))
    expect([...entry.enabledIds]).toEqual(['mi-1'])
    expect(entry.displayItems.map((i) => i.id)).toEqual(['mi-1', 'mi-2'])
    expect([...entry.unavailable.ids]).toEqual(['mi-2'])
    expect(entry.membership.ids.size).toBe(3)
  })
})

describe('loadShopRowsForConfig', () => {
  const base = { spaceId: 'sp1', configId: 'cfg1', shopIds: ['shop-a', 'shop-b'] }

  it('fait 2 appels en parallèle pour toute la configuration et rend les lignes de chaque PdV', async () => {
    const fetchSpaceItems = jest.fn().mockResolvedValue({ items: spaceItems })
    const fetchMatrix = jest.fn().mockResolvedValue({ menuItems: matrix })
    const out = await loadShopRowsForConfig({ ...base, fetchSpaceItems, fetchMatrix })
    expect(fetchSpaceItems).toHaveBeenCalledTimes(1)
    expect(fetchSpaceItems).toHaveBeenCalledWith('sp1')
    expect(fetchMatrix).toHaveBeenCalledTimes(1)
    expect(fetchMatrix).toHaveBeenCalledWith('sp1', 'cfg1')
    expect(Object.keys(out)).toEqual(['shop-a', 'shop-b'])
    expect(out['shop-a'][0].enabled).toBe(true)
    expect(out['shop-b'].every((r) => r.assigned === false)).toBe(true)
  })

  it('accepte les réponses enveloppées dans data', async () => {
    const out = await loadShopRowsForConfig({
      ...base,
      fetchSpaceItems: jest.fn().mockResolvedValue({ data: { items: spaceItems } }),
      fetchMatrix: jest.fn().mockResolvedValue({ data: { menuItems: matrix } }),
    })
    expect(out['shop-a']).toHaveLength(3)
  })

  it('rend null si un des deux appels échoue (repli sur la boucle par PdV)', async () => {
    const ok = jest.fn().mockResolvedValue({ items: spaceItems, menuItems: matrix })
    const ko = jest.fn().mockRejectedValue(new Error('500'))
    expect(await loadShopRowsForConfig({ ...base, fetchSpaceItems: ko, fetchMatrix: ok })).toBeNull()
    expect(await loadShopRowsForConfig({ ...base, fetchSpaceItems: ok, fetchMatrix: ko })).toBeNull()
  })

  it('rend null si l un des lots revient vide ou invalide', async () => {
    const goodItems = jest.fn().mockResolvedValue({ items: spaceItems })
    const goodMatrix = jest.fn().mockResolvedValue({ menuItems: matrix })
    for (const bad of [{ menuItems: {} }, { menuItems: [] }, {}, null]) {
      expect(await loadShopRowsForConfig({ ...base, fetchSpaceItems: goodItems, fetchMatrix: jest.fn().mockResolvedValue(bad) })).toBeNull()
    }
    for (const bad of [{ items: [] }, {}, null]) {
      expect(await loadShopRowsForConfig({ ...base, fetchSpaceItems: jest.fn().mockResolvedValue(bad), fetchMatrix: goodMatrix })).toBeNull()
    }
  })

  it('rend null sans espace, configuration ou PdV, sans appeler le serveur', async () => {
    const fetchSpaceItems = jest.fn()
    const fetchMatrix = jest.fn()
    expect(await loadShopRowsForConfig({ spaceId: '', configId: 'c', shopIds: ['a'], fetchSpaceItems, fetchMatrix })).toBeNull()
    expect(await loadShopRowsForConfig({ spaceId: 's', configId: '', shopIds: ['a'], fetchSpaceItems, fetchMatrix })).toBeNull()
    expect(await loadShopRowsForConfig({ spaceId: 's', configId: 'c', shopIds: [], fetchSpaceItems, fetchMatrix })).toBeNull()
    expect(fetchSpaceItems).not.toHaveBeenCalled()
  })
})

describe('store shopMenuAvailability : action hydrateForShops', () => {
  const makeCtx = (validIds = []) => {
    const commit = jest.fn()
    const getters = { isCacheValidForShop: (id) => validIds.includes(id) }
    return { commit, getters }
  }
  const hydrate = shopMenuAvailability.actions.hydrateForShops

  beforeEach(() => {
    menuApi.getSpaceMenuItemsWithAvailability.mockReset()
    menuApi.getSpaceMenuConfiguration.mockReset()
  })

  it('écrit le cache de chaque PdV demandé en 2 appels', async () => {
    menuApi.getSpaceMenuItemsWithAvailability.mockResolvedValue({ items: spaceItems })
    menuApi.getSpaceMenuConfiguration.mockResolvedValue({ menuItems: matrix })
    const ctx = makeCtx()
    const ok = await hydrate(ctx, { spaceId: 'sp1', configId: 'cfg1', shopIds: ['shop-a', 'shop-b'] })
    expect(ok).toBe(true)
    expect(menuApi.getSpaceMenuItemsWithAvailability).toHaveBeenCalledTimes(1)
    expect(menuApi.getSpaceMenuConfiguration).toHaveBeenCalledTimes(1)
    expect(ctx.commit).toHaveBeenCalledTimes(2)
    expect(ctx.commit.mock.calls.map((c) => [c[0], c[1].shopId, c[1].configId])).toEqual([
      ['SET_FOR_SHOP', 'shop-a', 'cfg1'],
      ['SET_FOR_SHOP', 'shop-b', 'cfg1'],
    ])
  })

  it('ne réécrit pas un PdV dont le cache est encore valide, sauf forceRefresh', async () => {
    menuApi.getSpaceMenuItemsWithAvailability.mockResolvedValue({ items: spaceItems })
    menuApi.getSpaceMenuConfiguration.mockResolvedValue({ menuItems: matrix })
    const ctx = makeCtx(['shop-a'])
    await hydrate(ctx, { spaceId: 'sp1', configId: 'cfg1', shopIds: ['shop-a', 'shop-b'] })
    expect(ctx.commit.mock.calls.map((c) => c[1].shopId)).toEqual(['shop-b'])
    const forced = makeCtx(['shop-a'])
    await hydrate(forced, { spaceId: 'sp1', configId: 'cfg1', shopIds: ['shop-a', 'shop-b'], forceRefresh: true })
    expect(forced.commit.mock.calls.map((c) => c[1].shopId)).toEqual(['shop-a', 'shop-b'])
  })

  it('tous les caches valides : aucun appel serveur', async () => {
    const ctx = makeCtx(['shop-a', 'shop-b'])
    expect(await hydrate(ctx, { spaceId: 'sp1', configId: 'cfg1', shopIds: ['shop-a', 'shop-b'] })).toBe(true)
    expect(menuApi.getSpaceMenuItemsWithAvailability).not.toHaveBeenCalled()
  })

  it('ne lève jamais et n écrit rien quand le lot échoue', async () => {
    menuApi.getSpaceMenuItemsWithAvailability.mockRejectedValue(new Error('500'))
    menuApi.getSpaceMenuConfiguration.mockResolvedValue({ menuItems: matrix })
    const ctx = makeCtx()
    expect(await hydrate(ctx, { spaceId: 'sp1', configId: 'cfg2', shopIds: ['shop-a'] })).toBe(false)
    expect(ctx.commit).not.toHaveBeenCalled()
  })

  it('refuse sans configuration (la matrice en dépend)', async () => {
    const ctx = makeCtx()
    expect(await hydrate(ctx, { spaceId: 'sp1', configId: null, shopIds: ['shop-a'] })).toBe(false)
    expect(menuApi.getSpaceMenuConfiguration).not.toHaveBeenCalled()
  })
})
