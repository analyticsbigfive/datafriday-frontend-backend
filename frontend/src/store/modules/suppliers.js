import { getSuppliers } from '@/api/endpoints/menu.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    suppliers: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_SUPPLIERS(state, suppliers) {
      state.list = suppliers
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_SUPPLIER(state, supplier) {
      state.list = [...state.list, supplier]
    },
    UPDATE_SUPPLIER(state, updated) {
      state.list = state.list.map((s) => (s.id === updated.id ? updated : s))
    },
    REMOVE_SUPPLIER(state, id) {
      state.list = state.list.filter((s) => s.id !== id)
    },
  },

  actions: {
    async fetchSuppliers({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const limit = 100
        let page = 1
        let list = []
        // Le backend plafonne chaque appel à `limit` fournisseurs (cf. BUG-052, miroir de
        // BUG-040 côté Market Prices) : on boucle sur `meta.total` tant qu'il en reste, pour ne
        // pas tronquer silencieusement les tenants ayant plus de `limit` fournisseurs.
        while (true) {
          const result = await getSuppliers({ page, limit })
          const pageList = Array.isArray(result)
            ? result
            : Array.isArray(result?.data)
              ? result.data
              : Array.isArray(result?.data?.data)
                ? result.data.data
                : []
          list = list.concat(pageList)
          const total = result?.meta?.total ?? result?.data?.meta?.total
          if (!total || pageList.length < limit || list.length >= total) break
          page += 1
        }
        commit('SET_SUPPLIERS', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addSupplier({ commit }, supplier) {
      commit('ADD_SUPPLIER', supplier)
    },

    updateSupplier({ commit }, supplier) {
      commit('UPDATE_SUPPLIER', supplier)
    },

    removeSupplier({ commit }, id) {
      commit('REMOVE_SUPPLIER', id)
    },
  },
}
