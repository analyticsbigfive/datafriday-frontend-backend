import { getWeezeventProducts } from '@/api/endpoints/aggregation.api'

const TTL = 15 * 60 * 1000 // 15 minutes

function unwrap(res) {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.products)) return res.products
  if (Array.isArray(res?.data?.data)) return res.data.data
  if (Array.isArray(res?.data?.products)) return res.data.products
  return []
}

export default {
  namespaced: true,

  state: () => ({
    cache: {}, // { [locationId]: { rows: [], cachedAt: number } }
    fetching: {}, // { [locationId]: boolean }
  }),

  getters: {
    forLocation: (state) => (locationId) => state.cache[locationId]?.rows || [],
    isCacheValidForLocation: (state) => (locationId) => {
      const entry = state.cache[locationId]
      return !!entry && Date.now() - entry.cachedAt < TTL
    },
  },

  mutations: {
    SET_FOR_LOCATION(state, { locationId, rows }) {
      state.cache = { ...state.cache, [locationId]: { rows, cachedAt: Date.now() } }
    },
    SET_FETCHING_FOR_LOCATION(state, { locationId, val }) {
      state.fetching = { ...state.fetching, [locationId]: val }
    },
    INVALIDATE_FOR_LOCATION(state, locationId) {
      const cache = { ...state.cache }
      delete cache[locationId]
      state.cache = cache
    },
  },

  actions: {
    async fetchForLocation({ state, commit, getters }, { locationId, forceRefresh = false } = {}) {
      if (!locationId) return
      if (state.fetching[locationId]) return
      if (!forceRefresh && getters.isCacheValidForLocation(locationId)) return
      commit('SET_FETCHING_FOR_LOCATION', { locationId, val: true })
      try {
        const res = await getWeezeventProducts(null, locationId)
        commit('SET_FOR_LOCATION', { locationId, rows: unwrap(res) })
      } finally {
        commit('SET_FETCHING_FOR_LOCATION', { locationId, val: false })
      }
    },
    invalidateForLocation({ commit }, locationId) {
      commit('INVALIDATE_FOR_LOCATION', locationId)
    },
  },
}
