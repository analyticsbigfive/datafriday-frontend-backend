import { getDepartments } from '@/api/endpoints/department.api'

const TTL = 15 * 60 * 1000

// GLOBAL référentiel (8 départements, 35 sous-types au total) — pas de pagination réelle
// nécessaire côté dropdowns/consommateurs (Builder/HR liront la liste complète une fois
// branchés, Étape 3+). `list[i].subtypes` est déjà inclus par le backend (GET /departments).
export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    departments: (state) => state.list,
    isCacheValid: (state) => state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_LIST(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
  },

  actions: {
    async fetchDepartments({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const result = await getDepartments({ limit: 500 })
        const list = (result?.data || [])
          .map((d) => ({ ...d, id: d?.id || d?._id }))
          .filter((d) => !!d.id)
        commit('SET_LIST', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },
  },
}
