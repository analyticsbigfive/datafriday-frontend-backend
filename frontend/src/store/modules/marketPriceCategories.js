import { getMarketPriceCategories } from '@/api/endpoints/market.price.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    marketPriceCategories: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_MARKET_PRICE_CATEGORIES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_MARKET_PRICE_CATEGORY(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_MARKET_PRICE_CATEGORY(state, updated) {
      state.list = state.list.map((c) => (c.id === updated.id ? updated : c))
    },
    REMOVE_MARKET_PRICE_CATEGORY(state, id) {
      state.list = state.list.filter((c) => c.id !== id)
    },
  },

  actions: {
    async fetchMarketPriceCategories({ state, commit, getters, rootGetters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const limit = 200
        let page = 1
        let raw = []
        // BUG-169: même boucle de pagination que marketPriceTypes.js/marketPrices.js —
        // le backend plafonne chaque appel à `limit` lignes, on accumule toutes les pages
        // avant de committer, pour que les dropdowns consommant cette liste complète
        // (cf. fetchMarketPriceTypes ci-dessus) ne voient jamais une page partielle.
        while (true) {
          const result = await getMarketPriceCategories({ page, limit })
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

        const types = rootGetters['marketPriceTypes/marketPriceTypes'] || []

        const list = raw
          .map((c) => {
            const typeId = c?.typeId || c?.type?.id || c?.marketPriceTypeId
            const typeName =
              c?.typeName ||
              c?.type?.name ||
              c?.marketPriceType?.name ||
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

        commit('SET_MARKET_PRICE_CATEGORIES', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addMarketPriceCategory({ commit, dispatch }, item) {
      commit('ADD_MARKET_PRICE_CATEGORY', item)
      dispatch('marketPriceTypes/invalidate', null, { root: true })
    },

    updateMarketPriceCategory({ commit, dispatch }, item) {
      commit('UPDATE_MARKET_PRICE_CATEGORY', item)
      dispatch('marketPriceTypes/invalidate', null, { root: true })
    },

    removeMarketPriceCategory({ commit, dispatch }, id) {
      commit('REMOVE_MARKET_PRICE_CATEGORY', id)
      dispatch('marketPriceTypes/invalidate', null, { root: true })
    },
  },
}
