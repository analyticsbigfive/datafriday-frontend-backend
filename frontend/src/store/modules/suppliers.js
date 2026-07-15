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
        const result = await getSuppliers()
        const list = Array.isArray(result)
          ? result
          : Array.isArray(result?.data)
            ? result.data
            : Array.isArray(result?.data?.data)
              ? result.data.data
              : []
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
