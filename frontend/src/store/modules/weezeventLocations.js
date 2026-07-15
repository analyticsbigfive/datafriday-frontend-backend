import { getWeezeventLocations } from '@/api/endpoints/aggregation.api'

const TTL = 15 * 60 * 1000 // 15 minutes

function unwrap(res) {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.locations)) return res.locations
  if (Array.isArray(res?.data?.data)) return res.data.data
  if (Array.isArray(res?.data?.locations)) return res.data.locations
  return []
}

export default {
  namespaced: true,

  state: () => ({
    rows: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    rows: (state) => state.rows,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_ROWS(state, rows) {
      state.rows = rows
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
  },

  actions: {
    async fetchLocations({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const res = await getWeezeventLocations()
        commit('SET_ROWS', unwrap(res))
      } finally {
        commit('SET_FETCHING', false)
      }
    },
    invalidate({ commit }) {
      commit('INVALIDATE')
    },
  },
}
