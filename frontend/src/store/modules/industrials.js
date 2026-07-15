import { getIndustrials } from '@/api/endpoints/industrial.api'

const TTL = 15 * 60 * 1000

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    industrials: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_INDUSTRIALS(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_INDUSTRIAL(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_INDUSTRIAL(state, updated) {
      state.list = state.list.map((i) => (i.id === updated.id ? updated : i))
    },
    REMOVE_INDUSTRIAL(state, id) {
      state.list = state.list.filter((i) => i.id !== id)
    },
  },

  actions: {
    async fetchIndustrials({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getIndustrials()
        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []

        const list = raw
          .map((i) => ({ ...i, id: i?.id || i?._id }))
          .filter((i) => !!i.id)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

        commit('SET_INDUSTRIALS', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addIndustrial({ commit }, item) {
      commit('ADD_INDUSTRIAL', item)
    },

    updateIndustrial({ commit }, item) {
      commit('UPDATE_INDUSTRIAL', item)
    },

    removeIndustrial({ commit }, id) {
      commit('REMOVE_INDUSTRIAL', id)
    },
  },
}
