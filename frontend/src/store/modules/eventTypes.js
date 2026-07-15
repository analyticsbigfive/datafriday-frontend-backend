import { getEventTypes } from '@/api/endpoints/event.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    eventTypes: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_EVENT_TYPES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_EVENT_TYPE(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_EVENT_TYPE(state, updated) {
      state.list = state.list.map((t) => (t.id === updated.id ? updated : t))
    },
    REMOVE_EVENT_TYPE(state, id) {
      state.list = state.list.filter((t) => t.id !== id)
    },
  },

  actions: {
    async fetchEventTypes({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getEventTypes()
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []
        commit('SET_EVENT_TYPES', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addEventType({ commit }, item) {
      commit('ADD_EVENT_TYPE', item)
    },

    updateEventType({ commit }, item) {
      commit('UPDATE_EVENT_TYPE', item)
    },

    removeEventType({ commit }, id) {
      commit('REMOVE_EVENT_TYPE', id)
    },
  },
}
