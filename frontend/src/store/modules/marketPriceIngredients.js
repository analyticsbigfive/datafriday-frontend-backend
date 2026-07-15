import { getMarketPricesWithIngredients } from '@/api/endpoints/menu.api'

const TTL = 15 * 60 * 1000 // 15 minutes

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
    async fetchRows({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const res = await getMarketPricesWithIngredients()
        const rows = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.items)
              ? res.items
              : Array.isArray(res?.data?.data)
                ? res.data.data
                : Array.isArray(res?.data?.items)
                  ? res.data.items
                  : []
        commit('SET_ROWS', rows)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },
  },
}
