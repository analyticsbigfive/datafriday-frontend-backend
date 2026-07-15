import { getRoles } from '@/api/endpoints/role.api'

const TTL = 15 * 60 * 1000

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    roles: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_ROLES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_ROLE(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_ROLE(state, updated) {
      state.list = state.list.map((r) => (r.id === updated.id ? updated : r))
    },
    REMOVE_ROLE(state, id) {
      state.list = state.list.filter((r) => r.id !== id)
    },
  },

  actions: {
    async fetchRoles({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getRoles()
        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []

        const list = raw
          .map((r) => ({ ...r, id: r?.id || r?._id }))
          .filter((r) => !!r.id)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

        // Ne mémoriser (cachedAt) qu'un résultat NON vide. Un `[]` transitoire
        // (token pas encore prêt au démarrage, blip réseau, 401 récupéré ensuite)
        // ne doit pas être figé 15 min : on laisse le cache invalide pour
        // permettre un nouveau fetch au prochain accès (sinon : menu rôle vide).
        if (list.length) {
          commit('SET_ROLES', list)
        }
      } catch (e) {
        // On laisse le cache invalide afin de retenter au prochain appel, et on
        // log pour le diagnostic. L'action ne rejette pas (appels fire-and-forget).
        // eslint-disable-next-line no-console
        console.error('[roles] fetchRoles a échoué:', e?.response?.status || '', e?.message || e)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addRole({ commit }, item) {
      commit('ADD_ROLE', item)
    },

    updateRole({ commit }, item) {
      commit('UPDATE_ROLE', item)
    },

    removeRole({ commit }, id) {
      commit('REMOVE_ROLE', id)
    },
  },
}
