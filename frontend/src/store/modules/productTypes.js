import { getProductType } from '@/api/endpoints/product.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
    pendingForceRefresh: false,
  }),

  getters: {
    productTypes: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_PRODUCT_TYPES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    SET_PENDING_REFRESH(state, val) {
      state.pendingForceRefresh = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_PRODUCT_TYPE(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_PRODUCT_TYPE(state, updated) {
      state.list = state.list.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
    },
    REMOVE_PRODUCT_TYPE(state, id) {
      state.list = state.list.filter((t) => t.id !== id)
    },
  },

  actions: {
    async fetchProductTypes({ state, commit, getters, dispatch }, { forceRefresh = false } = {}) {
      if (state.fetching) {
        if (forceRefresh) commit('SET_PENDING_REFRESH', true)
        return
      }
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      commit('SET_PENDING_REFRESH', false)
      try {
        // BUG-169 : GET /product-types est désormais paginé côté serveur (défaut limit=200,
        // clampé à 500) — on boucle sur `meta.total` pour reconstituer la liste COMPLÈTE avant
        // de committer, comme marketPrices.js/fetchRows. Le contrat du store (getter = liste
        // entière) ne change pas : tous les consommateurs (dropdowns inclus) restent servis.
        const limit = 200
        let page = 1
        let raw = []
        while (true) {
          const result = await getProductType({ page, limit })
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

        commit('SET_PRODUCT_TYPES', list)
      } finally {
        commit('SET_FETCHING', false)
        if (state.pendingForceRefresh) {
          commit('SET_PENDING_REFRESH', false)
          dispatch('fetchProductTypes', { forceRefresh: true })
        }
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addProductType({ commit }, item) {
      commit('ADD_PRODUCT_TYPE', item)
    },

    updateProductType({ commit }, item) {
      commit('UPDATE_PRODUCT_TYPE', item)
    },

    removeProductType({ commit }, id) {
      commit('REMOVE_PRODUCT_TYPE', id)
    },
  },
}
