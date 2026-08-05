import { getShopAvailableMenuItems } from '@/api/endpoints/menu.api'

/**
 * Catalogue d'un shop avec DISPONIBILITÉ calculée côté serveur — BUG-291-02.
 *
 * Source : `GET /space-menu/shop/:id/items` (payload LÉGER : id, nom, catégorie,
 * prix, `available`, `hasRecipe`, `missingIngredients`, `enabled`, `assigned`).
 *
 * ⚠️ NE PAS confondre avec le store `shopMenuItems`, qui interroge
 * `GET /space-menu/shop/:id` — payload LOURD portant les RECETTES complètes
 * (composants, ingrédients, coûts). L'Inventaire en dépend pour construire son
 * arbre (`useInventoryData.js`) : les deux endpoints ne sont pas
 * interchangeables, d'où deux stores distincts plutôt qu'une migration.
 *
 * `available` est la MÊME valeur que celle affichée par le tiroir Space Menu
 * (`ShopMenuItemsDrawer`) : un article « non disponible » là-bas l'est ici aussi,
 * sans re-dérivation front — c'est ce qui garantit que les deux écrans ne
 * divergent pas.
 */

const TTL = 15 * 60 * 1000 // 15 minutes — aligné sur shopMenuItems

// Single-flight HORS state Vuex (une Promise dans un state réactif = anti-pattern) :
// deux appels concurrents attendent la MÊME Promise, le getter n'est jamais lu
// vide par une course.
const inflight = new Map()

function cacheKey(shopId, configId) {
  return `${shopId}::${configId || ''}`
}

function unwrap(res) {
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  return []
}

export default {
  namespaced: true,

  state: () => ({
    cache: {}, // { [`${shopId}::${configId}`]: { rows: [], cachedAt: number } }
    fetching: {},
  }),

  getters: {
    forShop: (state) => (shopId, configId) => state.cache[cacheKey(shopId, configId)]?.rows || [],
    isCacheValidForShop: (state) => (shopId, configId) => {
      const entry = state.cache[cacheKey(shopId, configId)]
      return !!entry && Date.now() - entry.cachedAt < TTL
    },
    /** Set des ids NON disponibles pour ce shop — `available === false` strict. */
    unavailableIdsForShop: (state) => (shopId, configId) => {
      const rows = state.cache[cacheKey(shopId, configId)]?.rows || []
      return new Set(rows.filter((r) => r?.available === false).map((r) => String(r.id)))
    },
  },

  mutations: {
    SET_FOR_SHOP(state, { shopId, configId, rows }) {
      const k = cacheKey(shopId, configId)
      state.cache = { ...state.cache, [k]: { rows, cachedAt: Date.now() } }
    },
    SET_FETCHING_FOR_SHOP(state, { shopId, configId, val }) {
      state.fetching = { ...state.fetching, [cacheKey(shopId, configId)]: val }
    },
    INVALIDATE_FOR_SHOP(state, { shopId, configId } = {}) {
      const cache = { ...state.cache }
      if (configId !== undefined) {
        delete cache[cacheKey(shopId, configId)]
      } else {
        for (const k of Object.keys(cache)) {
          if (k.startsWith(`${shopId}::`)) delete cache[k]
        }
      }
      state.cache = cache
    },
  },

  actions: {
    async fetchForShop({ commit, getters }, { shopId, configId = null, forceRefresh = false } = {}) {
      if (!shopId) return
      if (!forceRefresh && getters.isCacheValidForShop(shopId, configId)) return
      const key = cacheKey(shopId, configId)
      if (inflight.has(key)) return inflight.get(key)
      commit('SET_FETCHING_FOR_SHOP', { shopId, configId, val: true })
      const p = (async () => {
        try {
          // `enabledOnly` NON passé : on veut aussi les items assignés-mais-désactivés
          // pour l'index d'appartenance (`shopMenuMembership`), qui sert de garde-fou
          // anti-ouverture avec un article hors menu.
          const res = await getShopAvailableMenuItems(shopId, configId)
          commit('SET_FOR_SHOP', { shopId, configId, rows: unwrap(res) })
        } finally {
          commit('SET_FETCHING_FOR_SHOP', { shopId, configId, val: false })
          inflight.delete(key)
        }
      })()
      inflight.set(key, p)
      return p
    },

    invalidateForShop({ commit }, payload) {
      if (typeof payload === 'string') commit('INVALIDATE_FOR_SHOP', { shopId: payload })
      else commit('INVALIDATE_FOR_SHOP', payload || {})
    },
  },
}
