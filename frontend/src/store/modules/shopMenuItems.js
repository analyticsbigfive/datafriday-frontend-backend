import { getShopMenuItems } from '@/api/endpoints/menu.api'

const TTL = 15 * 60 * 1000 // 15 minutes

// Single-flight registry HORS du state Vuex (une Promise dans le state réactif =
// anti-pattern). Deux fetchForShop(shopId) concurrents attendent la MÊME Promise
// → le getter forShop n'est jamais lu vide par une course (bug : l'ancien
// `if (state.fetching) return` résolvait AVANT hydratation).
const inflight = new Map() // cacheKey → Promise

// Clé de cache = shop + config. L'assignation menu d'un shop est SCOPÉE par
// configuration côté backend (`GET /space-menu/shop/:id?configId=...`) : sans
// configId le backend retombe sur une config arbitraire (cf. menu.api.js).
// Rétro-compat : sans configId → clé `shopId::` = comportement historique.
function cacheKey(shopId, configId) {
  return `${shopId}::${configId || ''}`
}

function unwrap(res) {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.menuItems)) return res.menuItems
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.menuItems)) return res.data.menuItems
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.data)) return res.data.data
  return []
}

export default {
  namespaced: true,

  state: () => ({
    cache: {}, // { [`${shopId}::${configId}`]: { rows: [], cachedAt: number } }
    fetching: {}, // { [cacheKey]: boolean }
  }),

  getters: {
    // configId optionnel (rétro-compat : sans lui → clé historique `shopId::`).
    forShop: (state) => (shopId, configId) => state.cache[cacheKey(shopId, configId)]?.rows || [],
    isCacheValidForShop: (state) => (shopId, configId) => {
      const entry = state.cache[cacheKey(shopId, configId)]
      return !!entry && Date.now() - entry.cachedAt < TTL
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
        // Sans configId précis : purge toutes les entrées de ce shop (tous configs).
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
      // Coalesce les appels concurrents : on retourne (await) la Promise en vol.
      const key = cacheKey(shopId, configId)
      if (inflight.has(key)) return inflight.get(key)
      commit('SET_FETCHING_FOR_SHOP', { shopId, configId, val: true })
      const p = (async () => {
        try {
          const res = await getShopMenuItems(shopId, configId)
          commit('SET_FOR_SHOP', { shopId, configId, rows: unwrap(res) })
        } finally {
          commit('SET_FETCHING_FOR_SHOP', { shopId, configId, val: false })
          inflight.delete(key)
        }
      })()
      inflight.set(key, p)
      return p
    },
    // Accepte soit un shopId (string, purge tous configs) soit { shopId, configId }.
    invalidateForShop({ commit }, payload) {
      if (typeof payload === 'string') commit('INVALIDATE_FOR_SHOP', { shopId: payload })
      else commit('INVALIDATE_FOR_SHOP', payload || {})
    },
  },
}
