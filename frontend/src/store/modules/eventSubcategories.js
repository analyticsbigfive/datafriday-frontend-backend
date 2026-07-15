import { getEventSubcategories } from '@/api/endpoints/event.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    eventSubcategories: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_EVENT_SUBCATEGORIES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_EVENT_SUBCATEGORY(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_EVENT_SUBCATEGORY(state, updated) {
      state.list = state.list.map((s) => (s.id === updated.id ? updated : s))
    },
    REMOVE_EVENT_SUBCATEGORY(state, id) {
      state.list = state.list.filter((s) => s.id !== id)
    },
  },

  actions: {
    async fetchEventSubcategories({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getEventSubcategories()
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []
        commit('SET_EVENT_SUBCATEGORIES', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addEventSubcategory({ commit }, item) {
      commit('ADD_EVENT_SUBCATEGORY', item)
    },

    updateEventSubcategory({ commit }, item) {
      commit('UPDATE_EVENT_SUBCATEGORY', item)
    },

    removeEventSubcategory({ commit }, id) {
      commit('REMOVE_EVENT_SUBCATEGORY', id)
    },
  },
}
