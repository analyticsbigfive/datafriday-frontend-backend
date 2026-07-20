import { getProductCategory } from '@/api/endpoints/product.api'

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
    productCategories: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_PRODUCT_CATEGORIES(state, list) {
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
    ADD_PRODUCT_CATEGORY(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_PRODUCT_CATEGORY(state, updated) {
      state.list = state.list.map((c) => (c.id === updated.id ? updated : c))
    },
    REMOVE_PRODUCT_CATEGORY(state, id) {
      state.list = state.list.filter((c) => c.id !== id)
    },
  },

  actions: {
    async fetchProductCategories({ state, commit, getters, rootGetters, dispatch }, { forceRefresh = false } = {}) {
      if (state.fetching) {
        if (forceRefresh) commit('SET_PENDING_REFRESH', true)
        return
      }
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      commit('SET_PENDING_REFRESH', false)
      try {
        // BUG-169 : GET /product-categories est désormais paginé côté serveur (défaut
        // limit=200, clampé à 500) — on boucle sur `meta.total` pour reconstituer la liste
        // COMPLÈTE avant de committer, comme marketPrices.js/fetchRows. Le contrat du store
        // (getter = liste entière) ne change pas : tous les consommateurs (dropdowns inclus)
        // restent servis.
        const limit = 200
        let page = 1
        let raw = []
        while (true) {
          const result = await getProductCategory({ page, limit })
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

        const types = rootGetters['productTypes/productTypes'] || []

        const list = raw
          .map((c) => {
            const typeId = c?.typeId || c?.type?.id || c?.productTypeId
            const typeName =
              c?.typeName ||
              c?.type?.name ||
              c?.productType?.name ||
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

        commit('SET_PRODUCT_CATEGORIES', list)
      } finally {
        commit('SET_FETCHING', false)
        if (state.pendingForceRefresh) {
          commit('SET_PENDING_REFRESH', false)
          dispatch('fetchProductCategories', { forceRefresh: true })
        }
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addProductCategory({ commit }, item) {
      commit('ADD_PRODUCT_CATEGORY', item)
    },

    updateProductCategory({ commit }, item) {
      commit('UPDATE_PRODUCT_CATEGORY', item)
    },

    removeProductCategory({ commit }, id) {
      commit('REMOVE_PRODUCT_CATEGORY', id)
    },
  },
}
