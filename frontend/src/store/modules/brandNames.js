import { getBrandNames } from '@/api/endpoints/brand-name.api'

const TTL = 15 * 60 * 1000

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    brandNames: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_BRAND_NAMES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_BRAND_NAME(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_BRAND_NAME(state, updated) {
      state.list = state.list.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
    },
    REMOVE_BRAND_NAME(state, id) {
      state.list = state.list.filter((b) => b.id !== id)
    },
  },

  actions: {
    async fetchBrandNames({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getBrandNames()
        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []

        const list = raw
          .map((b) => ({ ...b, id: b?.id || b?._id }))
          .filter((b) => !!b.id)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

        commit('SET_BRAND_NAMES', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addBrandName({ commit }, item) {
      commit('ADD_BRAND_NAME', item)
    },

    updateBrandName({ commit }, item) {
      commit('UPDATE_BRAND_NAME', item)
    },

    removeBrandName({ commit }, id) {
      commit('REMOVE_BRAND_NAME', id)
    },
  },
}
