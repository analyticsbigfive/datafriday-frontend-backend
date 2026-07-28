import { getComponentCategories } from '@/api/endpoints/menu.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    componentCategories: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_COMPONENT_CATEGORIES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_COMPONENT_CATEGORY(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_COMPONENT_CATEGORY(state, updated) {
      state.list = state.list.map((c) => (c.id === updated.id ? updated : c))
    },
    REMOVE_COMPONENT_CATEGORY(state, id) {
      state.list = state.list.filter((c) => c.id !== id)
    },
  },

  actions: {
    async fetchComponentCategories({ state, commit, getters, rootGetters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        // BUG-169 : GET /component-categories est désormais paginé côté serveur (défaut
        // limit=200, clampé à 500) — on boucle sur `meta.total` pour reconstituer la liste
        // COMPLÈTE avant de committer, comme marketPrices.js/fetchRows. Le contrat du store
        // (getter = liste entière) ne change pas : tous les consommateurs (dropdowns inclus)
        // restent servis.
        const limit = 200
        let page = 1
        let raw = []
        while (true) {
          const result = await getComponentCategories({ page, limit })
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

        const types = rootGetters['componentTypes/componentTypes'] || []

        const list = raw
          .map((c) => {
            const typeId = c?.typeId || c?.type?.id || c?.componentTypeId
            const typeName =
              c?.typeName ||
              c?.type?.name ||
              c?.componentType?.name ||
              types.find((t) => t.id === typeId)?.name ||
              ''
            return {
              ...c,
              id: c?.id || c?._id,
              typeId,
              typeName,
            }
          })
          .filter((c) => !!c.id)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

        commit('SET_COMPONENT_CATEGORIES', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addComponentCategory({ commit, dispatch }, item) {
      commit('ADD_COMPONENT_CATEGORY', item)
      dispatch('componentTypes/invalidate', null, { root: true })
    },

    updateComponentCategory({ commit, dispatch }, item) {
      commit('UPDATE_COMPONENT_CATEGORY', item)
      dispatch('componentTypes/invalidate', null, { root: true })
    },

    removeComponentCategory({ commit, dispatch }, id) {
      commit('REMOVE_COMPONENT_CATEGORY', id)
      dispatch('componentTypes/invalidate', null, { root: true })
    },
  },
}
