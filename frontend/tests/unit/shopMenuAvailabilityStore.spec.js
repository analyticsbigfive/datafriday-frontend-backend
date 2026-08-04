/**
 * BUG-291-02 — un article marqué « non disponible » par le serveur (pas de recette,
 * ingrédient inactif, fournisseur non résolu ou ne livrant pas l'espace) ne doit ni
 * apparaître dans Event Predict, ni compter dans les ventes prédites, ni entrer
 * dans le stock-up.
 *
 * `available` vient de `GET /space-menu/shop/:id/items` — la MÊME valeur que celle
 * affichée par le tiroir Space Menu. Ne pas la re-dériver côté front : c'est
 * exactement la divergence entre écrans que ce lot supprime.
 *
 * ⚠️ Ne pas confondre avec « unmapped », qui signifie « vendu sur Weezevent mais
 * non assigné » (`analyseReconciliation.js`) — deux sujets sans rapport.
 */
jest.mock('@/api/endpoints/menu.api', () => ({
  getShopAvailableMenuItems: jest.fn(),
}))

import { getShopAvailableMenuItems } from '@/api/endpoints/menu.api'
import shopMenuAvailability from '@/store/modules/shopMenuAvailability'

const SHOP = 'cms87an8m00fm1d79029omqst' // 1 A
const CFG = 'cms88nx6f00x31d79s5agkbab' // foot 19h-21h standard

// Extrait réel du tiroir : Cookie sans recette, Café indisponible, Coca OK.
const payload = {
  shopId: SHOP,
  counts: { total: 3, available: 1, notAvailable: 2, enabled: 3 },
  items: [
    { id: 'mi-coca', name: 'Coca-Cola', enabled: true, available: true, hasRecipe: true },
    {
      id: 'mi-cookie', name: 'Cookie', enabled: true, available: false, hasRecipe: false,
      missingIngredients: [],
    },
    {
      id: 'mi-cafe', name: 'Café', enabled: true, available: false, hasRecipe: true,
      missingIngredients: [{ kind: 'ingredient', name: 'Café grains', reason: 'NO_SUPPLIER' }],
    },
  ],
}

const makeStore = () => {
  const state = shopMenuAvailability.state()
  const commit = (type, payload) => shopMenuAvailability.mutations[type](state, payload)
  const getters = {
    forShop: shopMenuAvailability.getters.forShop(state),
    isCacheValidForShop: shopMenuAvailability.getters.isCacheValidForShop(state),
    unavailableIdsForShop: shopMenuAvailability.getters.unavailableIdsForShop(state),
  }
  // Les getters capturent `state` par référence → relire après mutation est correct.
  const live = {
    forShop: (...a) => shopMenuAvailability.getters.forShop(state)(...a),
    unavailableIdsForShop: (...a) =>
      shopMenuAvailability.getters.unavailableIdsForShop(state)(...a),
    isCacheValidForShop: (...a) =>
      shopMenuAvailability.getters.isCacheValidForShop(state)(...a),
  }
  return { state, commit, getters, live }
}

describe('store shopMenuAvailability — BUG-291-02', () => {
  beforeEach(() => {
    getShopAvailableMenuItems.mockReset()
  })

  it('déballe `items` et met en cache par (shop, config)', async () => {
    getShopAvailableMenuItems.mockResolvedValue(payload)
    const { commit, live } = makeStore()

    await shopMenuAvailability.actions.fetchForShop(
      { commit, getters: { isCacheValidForShop: () => false } },
      { shopId: SHOP, configId: CFG },
    )

    expect(getShopAvailableMenuItems).toHaveBeenCalledWith(SHOP, CFG)
    expect(live.forShop(SHOP, CFG)).toHaveLength(3)
    // Le cache est scopé par config : une autre config ne doit pas lire celle-ci.
    expect(live.forShop(SHOP, 'autre-config')).toEqual([])
  })

  it('expose les ids NON disponibles, toutes raisons confondues', async () => {
    getShopAvailableMenuItems.mockResolvedValue(payload)
    const { commit, live } = makeStore()

    await shopMenuAvailability.actions.fetchForShop(
      { commit, getters: { isCacheValidForShop: () => false } },
      { shopId: SHOP, configId: CFG },
    )

    const unavailable = live.unavailableIdsForShop(SHOP, CFG)
    // Cookie (pas de recette) ET Café (fournisseur non résolu) — deux raisons
    // différentes, une seule règle d'exclusion.
    expect([...unavailable].sort()).toEqual(['mi-cafe', 'mi-cookie'])
    expect(unavailable.has('mi-coca')).toBe(false)
  })

  it('ne considère PAS indisponible un item dont le backend n\'envoie pas `available`', async () => {
    // Garde-fou anti-régression : un backend antérieur ne doit pas vider tous les menus.
    getShopAvailableMenuItems.mockResolvedValue({
      items: [{ id: 'mi-legacy', name: 'Article legacy', enabled: true }],
    })
    const { commit, live } = makeStore()

    await shopMenuAvailability.actions.fetchForShop(
      { commit, getters: { isCacheValidForShop: () => false } },
      { shopId: SHOP, configId: CFG },
    )

    expect(live.unavailableIdsForShop(SHOP, CFG).size).toBe(0)
  })

  it('ne refetch pas quand le cache est valide', async () => {
    const { commit } = makeStore()
    await shopMenuAvailability.actions.fetchForShop(
      { commit, getters: { isCacheValidForShop: () => true } },
      { shopId: SHOP, configId: CFG },
    )
    expect(getShopAvailableMenuItems).not.toHaveBeenCalled()
  })

  it('purge le cache d\'un shop sur invalidation', async () => {
    getShopAvailableMenuItems.mockResolvedValue(payload)
    const { commit, live } = makeStore()
    await shopMenuAvailability.actions.fetchForShop(
      { commit, getters: { isCacheValidForShop: () => false } },
      { shopId: SHOP, configId: CFG },
    )
    expect(live.forShop(SHOP, CFG)).toHaveLength(3)

    shopMenuAvailability.actions.invalidateForShop({ commit }, SHOP)
    expect(live.forShop(SHOP, CFG)).toEqual([])
  })
})

describe('filtre d\'exclusion appliqué dans loadShopMenuAssignment', () => {
  // Réplique exacte du prédicat de `EventPredictView.loadShopMenuAssignment`.
  const keep = (it) => it && it.enabled === true && it.available !== false

  it('garde l\'article disponible et activé', () => {
    expect(payload.items.filter(keep).map((i) => i.name)).toEqual(['Coca-Cola'])
  })

  it('exclut un article sans recette même s\'il est activé sur le shop', () => {
    // Cas de la capture : Cookie coché dans Space Menu, mais « Non disponible ».
    expect(keep({ id: 'mi-cookie', enabled: true, available: false })).toBe(false)
  })

  it('exclut un article désactivé, disponible ou non', () => {
    expect(keep({ id: 'x', enabled: false, available: true })).toBe(false)
  })

  it('garde un article activé quand `available` est absent (backend antérieur)', () => {
    expect(keep({ id: 'x', enabled: true })).toBe(true)
  })
})
