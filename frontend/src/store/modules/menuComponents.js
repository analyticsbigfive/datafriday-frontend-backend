import { getMenuComponents } from '@/api/endpoints/menu.api'

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
    async fetchComponents({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const limit = 100
        let page = 1
        let rows = []
        // Le backend plafonne chaque appel à `limit` composants (cf. BUG-054, même schéma que
        // BUG-040/BUG-052) : on boucle sur `meta.total` tant qu'il en reste, pour ne pas tronquer
        // silencieusement les tenants ayant plus de `limit` composants.
        while (true) {
          const res = await getMenuComponents({ page, limit })
          const pageRows = Array.isArray(res)
            ? res
            : Array.isArray(res?.data)
              ? res.data
              : Array.isArray(res?.items)
                ? res.items
                : []
          rows = rows.concat(pageRows)
          const total = res?.meta?.total ?? res?.data?.meta?.total
          if (!total || pageRows.length < limit || rows.length >= total) break
          page += 1
        }
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
