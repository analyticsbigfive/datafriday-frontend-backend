import { getEventCategories } from '@/api/endpoints/event.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    eventCategories: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_EVENT_CATEGORIES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_EVENT_CATEGORY(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_EVENT_CATEGORY(state, updated) {
      state.list = state.list.map((c) => (c.id === updated.id ? updated : c))
    },
    REMOVE_EVENT_CATEGORY(state, id) {
      state.list = state.list.filter((c) => c.id !== id)
    },
  },

  actions: {
    async fetchEventCategories({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getEventCategories()
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []
        commit('SET_EVENT_CATEGORIES', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addEventCategory({ commit }, item) {
      commit('ADD_EVENT_CATEGORY', item)
    },

    updateEventCategory({ commit }, item) {
      commit('UPDATE_EVENT_CATEGORY', item)
    },

    removeEventCategory({ commit }, id) {
      commit('REMOVE_EVENT_CATEGORY', id)
    },
  },
}
