import { getMarketPriceTypes } from '@/api/endpoints/market.price.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    marketPriceTypes: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_MARKET_PRICE_TYPES(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_MARKET_PRICE_TYPE(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_MARKET_PRICE_TYPE(state, updated) {
      state.list = state.list.map((t) => (t.id === updated.id ? updated : t))
    },
    REMOVE_MARKET_PRICE_TYPE(state, id) {
      state.list = state.list.filter((t) => t.id !== id)
    },
  },

  actions: {
    async fetchMarketPriceTypes({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const limit = 200
        let page = 1
        let raw = []
        // BUG-169: le backend plafonne chaque appel à `limit` lignes (même pattern que
        // marketPrices.js) : on boucle sur `meta.total` tant qu'il en reste, pour ne pas
        // tronquer silencieusement les dropdowns consommant cette liste complète
        // (MarketPriceCreateDrawer/EditDrawer/EditSupplierDrawer/CsvImportDrawer, filtres
        // de MarketPriceListView).
        while (true) {
          const result = await getMarketPriceTypes({ page, limit })
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

        commit('SET_MARKET_PRICE_TYPES', list)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addMarketPriceType({ commit }, item) {
      commit('ADD_MARKET_PRICE_TYPE', item)
    },

    updateMarketPriceType({ commit }, item) {
      commit('UPDATE_MARKET_PRICE_TYPE', item)
    },

    removeMarketPriceType({ commit }, id) {
      commit('REMOVE_MARKET_PRICE_TYPE', id)
    },
  },
}
