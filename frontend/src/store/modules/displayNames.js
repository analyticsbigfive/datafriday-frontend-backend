import { getDisplayNames } from '@/api/endpoints/display-name.api'

const TTL = 15 * 60 * 1000

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    displayNames: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_DISPLAY_NAMES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_DISPLAY_NAME(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_DISPLAY_NAME(state, updated) {
      state.list = state.list.map((d) => (d.id === updated.id ? updated : d))
    },
    REMOVE_DISPLAY_NAME(state, id) {
      state.list = state.list.filter((d) => d.id !== id)
    },
  },

  actions: {
    async fetchDisplayNames({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getDisplayNames()
        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []

        const list = raw
          .map((d) => ({ ...d, id: d?.id || d?._id }))
          .filter((d) => !!d.id)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

        commit('SET_DISPLAY_NAMES', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addDisplayName({ commit }, item) {
      commit('ADD_DISPLAY_NAME', item)
    },

    updateDisplayName({ commit }, item) {
      commit('UPDATE_DISPLAY_NAME', item)
    },

    removeDisplayName({ commit }, id) {
      commit('REMOVE_DISPLAY_NAME', id)
    },
  },
}
