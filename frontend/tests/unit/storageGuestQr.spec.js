/**
 * QR code des espaces de stockage (demande Bertrand 2026-10-08) : bouton QR sur la
 * carte stockage du directeur, et liste d'articles d'un stockage côté invité calculée
 * par la même fonction que l'onglet Stockages du staff.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { createStore } from 'vuex'
import { defineComponent, h } from 'vue'

jest.mock('@/api/endpoints/guestPinAdmin.api', () => ({
  getStorageSlugs: jest.fn(),
}))
jest.mock('@/api/endpoints/guestPin.api', () => ({
  getGuestCatalog: jest.fn(),
  getGuestInventory: jest.fn(),
  saveGuestCount: jest.fn(),
  submitGuestCount: jest.fn(),
  notifyGuestElementComplete: jest.fn(),
}))
jest.mock('vue-router', () => ({ useRoute: () => ({ meta: { guestMode: true } }) }))

import { getStorageSlugs } from '@/api/endpoints/guestPinAdmin.api'
import { getGuestCatalog, getGuestInventory } from '@/api/endpoints/guestPin.api'
import { useStorageQrSlug } from '@/composables/useStorageQrSlug'
import { useGuestInventorySession } from '@/composables/useGuestInventorySession'

function withSetup(fn, store) {
  let result
  const Comp = defineComponent({ setup() { result = fn(); return () => h('div') } })
  mount(Comp, { global: store ? { plugins: [store] } : {} })
  return result
}

describe('useStorageQrSlug', () => {
  beforeEach(() => getStorageSlugs.mockReset())

  it('une seule requête par espace, partagée entre les cartes', async () => {
    getStorageSlugs.mockResolvedValue({ 'st-1': 'reserve-nord', 'st-2': 'chambre-froide' })
    const a = withSetup(() => useStorageQrSlug(() => 'space-a', () => 'st-1'))
    const b = withSetup(() => useStorageQrSlug(() => 'space-a', () => 'st-2'))
    await flushPromises()
    expect(getStorageSlugs).toHaveBeenCalledTimes(1)
    expect(a.slug.value).toBe('reserve-nord')
    expect(b.slug.value).toBe('chambre-froide')
  })

  it('sans droit (spaceId null) : aucune requête, pas de slug', async () => {
    const r = withSetup(() => useStorageQrSlug(() => null, () => 'st-1'))
    await flushPromises()
    expect(getStorageSlugs).not.toHaveBeenCalled()
    expect(r.slug.value).toBeNull()
  })

  it('stockage absent de la réponse (créé depuis) : une relecture', async () => {
    getStorageSlugs.mockResolvedValueOnce({ 'st-1': 'reserve-nord' })
    withSetup(() => useStorageQrSlug(() => 'space-b', () => 'st-1'))
    await flushPromises()
    getStorageSlugs.mockResolvedValueOnce({ 'st-1': 'reserve-nord', 'st-9': 'nouveau' })
    const r = withSetup(() => useStorageQrSlug(() => 'space-b', () => 'st-9'))
    await flushPromises()
    expect(getStorageSlugs).toHaveBeenCalledTimes(2)
    expect(r.slug.value).toBe('nouveau')
  })
})

describe('useGuestInventorySession : stockage', () => {
  const store = createStore({
    modules: {
      guestPin: {
        namespaced: true,
        getters: {
          session: () => ({ elementId: 'st-1', elementName: 'Réserve Nord', spaceId: 's', eventId: 'e' }),
          slug: () => 'reserve-nord',
        },
      },
    },
  })

  // Bière (froid) servie par la Buvette A, chips (sec) par la Buvette B.
  const beer = { id: 'mi-beer', name: 'Bière', readyForSale: 'Yes', storageType: ['Froid'], components: [] }
  const chips = { id: 'mi-chips', name: 'Chips', readyForSale: 'Yes', storageType: ['Sec'], components: [] }
  const baseCatalog = {
    elementName: 'Réserve Nord',
    elementType: 'storage',
    fbElements: [
      { id: 'shop-a', name: 'Buvette A', menuItemIds: ['mi-beer'] },
      { id: 'shop-b', name: 'Buvette B', menuItemIds: ['mi-chips'] },
    ],
    availableMenuItems: [],
    allMenuItemsData: [beer, chips],
    marketPrices: [],
    components: [],
    storageTypes: [{ name: 'Froid', code: 'cold' }, { name: 'Sec', code: 'dry' }],
  }

  beforeEach(() => {
    getGuestInventory.mockResolvedValue({ savedCounts: { 'mi-beer': { packedUnits: 2, isCounted: true } } })
  })

  async function load(storage) {
    getGuestCatalog.mockResolvedValue({ ...baseCatalog, storage })
    const session = withSetup(() => useGuestInventorySession(), store)
    await session.loadGuestInventory()
    return session
  }

  it('articles des PdV filtrés par type de stockage, carte unique du stockage', async () => {
    const session = await load({ storageTypes: ['cold'], selectedShopIds: [] })
    const card = session.guestCards.value[0]
    expect(card.element).toMatchObject({ id: 'st-1', name: 'Réserve Nord' })
    expect(card.consolidatedInventory.map((i) => i.name)).toEqual(['Bière'])
    expect(session.guestInventoryCounts.value['st-1']['mi-beer']).toMatchObject({ packedUnits: 2, isCounted: true })
  })

  it('restreint aux PdV servis par le stockage', async () => {
    const session = await load({ storageTypes: [], selectedShopIds: ['shop-b'] })
    expect(session.guestCards.value[0].consolidatedInventory.map((i) => i.name)).toEqual(['Chips'])
  })
})
