import { getAllSpaces } from '@/api/endpoints/space.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    isFetching: false,
  }),

  getters: {
    spaces: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_SPACES(state, spaces) {
      state.list = spaces
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.isFetching = val
    },
    ADD_SPACE(state, space) {
      state.list = [...state.list, space]
    },
    UPDATE_SPACE(state, updated) {
      state.list = state.list.map((s) => (s.id === updated.id ? updated : s))
    },
    REMOVE_SPACE(state, id) {
      state.list = state.list.filter((s) => s.id !== id)
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
  },

  actions: {
    async fetchSpaces({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.isFetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const spaces = await getAllSpaces()
        commit('SET_SPACES', spaces?.data ?? spaces ?? [])
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    addSpace({ commit }, space) {
      commit('ADD_SPACE', space)
    },

    updateSpace({ commit }, space) {
      commit('UPDATE_SPACE', space)
    },

    removeSpace({ commit }, id) {
      commit('REMOVE_SPACE', id)
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },
  },
}
