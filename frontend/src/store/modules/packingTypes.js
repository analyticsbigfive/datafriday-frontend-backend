import { getPackingTypes } from '@/api/endpoints/packing-type.api'

const TTL = 15 * 60 * 1000

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    packingTypes: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_PACKING_TYPES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_PACKING_TYPE(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_PACKING_TYPE(state, updated) {
      state.list = state.list.map((p) => (p.id === updated.id ? updated : p))
    },
    REMOVE_PACKING_TYPE(state, id) {
      state.list = state.list.filter((p) => p.id !== id)
    },
  },

  actions: {
    async fetchPackingTypes({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getPackingTypes()
        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []

        const list = raw
          .map((p) => ({ ...p, id: p?.id || p?._id }))
          .filter((p) => !!p.id)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

        commit('SET_PACKING_TYPES', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addPackingType({ commit }, item) {
      commit('ADD_PACKING_TYPE', item)
    },

    updatePackingType({ commit }, item) {
      commit('UPDATE_PACKING_TYPE', item)
    },

    removePackingType({ commit }, id) {
      commit('REMOVE_PACKING_TYPE', id)
    },
  },
}
