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
        // BUG-169 : GET /component-types est désormais paginé côté serveur (défaut
        // limit=200, clampé à 500) — on boucle sur `meta.total` pour reconstituer la liste
        // COMPLÈTE avant de committer, comme marketPrices.js/fetchRows. Le contrat du store
        // (getter = liste entière) ne change pas : tous les consommateurs (dropdowns inclus)
        // restent servis.
        const limit = 200
        let page = 1
        let raw = []
        while (true) {
          const result = await getComponentTypes({ page, limit })
          const pageRows = Array.isArray(result)
            ? result
            : Array.isArray(result?.data)
              ? result.data
              : Array.isArray(result?.data?.data)
                ? result.data.data
                : []
          raw = raw.concat(pageRows)
          const total = result?.meta?.total ?? result?.data?.meta?.total
          if (!total || pageRows.length < limit || raw.length >= total) break
          page += 1
        }

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
