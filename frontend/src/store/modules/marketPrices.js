import { getMarketPrices } from '@/api/endpoints/menu.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    rows: [],
    cachedAt: null,
    loading: false,
  }),

  getters: {
    rows: (state) => state.rows,
    loading: (state) => state.loading,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_ROWS(state, rows) {
      state.rows = rows
      state.cachedAt = Date.now()
    },
    SET_LOADING(state, val) {
      state.loading = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
  },

  actions: {
    async fetchRows({ commit, getters }, { forceRefresh = false } = {}) {
      if (!forceRefresh && getters.isCacheValid) return

      commit('SET_LOADING', true)
      try {
        const limit = 200
        let page = 1
        let rows = []
        // Le backend plafonne chaque appel à `limit` lignes (cf. BUG-054/BUG-040) : on boucle
        // sur `meta.total` tant qu'il en reste, pour ne pas tronquer silencieusement les tenants
        // ayant plus de `limit` Market Prices.
        while (true) {
          const result = await getMarketPrices({ page, limit })
          const pageRows = Array.isArray(result)
            ? result
            : Array.isArray(result?.data)
              ? result.data
              : Array.isArray(result?.data?.data)
                ? result.data.data
                : []
          rows = rows.concat(pageRows)
          const total = result?.meta?.total ?? result?.data?.meta?.total
          if (!total || pageRows.length < limit || rows.length >= total) break
          page += 1
        }
        commit('SET_ROWS', rows)
      } finally {
        commit('SET_LOADING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },
  },
}
