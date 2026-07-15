import { getComponentTypes } from '@/api/endpoints/menu.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    componentTypes: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_COMPONENT_TYPES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_COMPONENT_TYPE(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_COMPONENT_TYPE(state, updated) {
      state.list = state.list.map((t) => (t.id === updated.id ? updated : t))
    },
    REMOVE_COMPONENT_TYPE(state, id) {
      state.list = state.list.filter((t) => t.id !== id)
    },
  },

  actions: {
    async fetchComponentTypes({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getComponentTypes()
        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []

        const list = raw
          .map((t) => ({ ...t, id: t?.id || t?._id }))
          .filter((t) => !!t.id)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

        commit('SET_COMPONENT_TYPES', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addComponentType({ commit }, item) {
      commit('ADD_COMPONENT_TYPE', item)
    },

    updateComponentType({ commit }, item) {
      commit('UPDATE_COMPONENT_TYPE', item)
    },

    removeComponentType({ commit }, id) {
      commit('REMOVE_COMPONENT_TYPE', id)
    },
  },
}
