import { getUsers } from '@/api/endpoints/user.api'

const TTL = 15 * 60 * 1000

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    users: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_USERS(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    ADD_USER(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_USER(state, updated) {
      state.list = state.list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u))
    },
    REMOVE_USER(state, id) {
      state.list = state.list.filter((u) => u.id !== id)
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
  },

  actions: {
    async fetchUsers({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getUsers()
        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []

        const list = raw
          .map((u) => ({ ...u, id: u?.id || u?._id }))
          .filter((u) => !!u.id)

        commit('SET_USERS', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    addUser({ commit }, item) {
      commit('ADD_USER', item)
    },

    updateUser({ commit }, item) {
      commit('UPDATE_USER', item)
    },

    removeUser({ commit }, id) {
      commit('REMOVE_USER', id)
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },
  },
}
