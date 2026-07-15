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
    async fetchMarketPriceCategories({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getMarketPriceTypes()
        const typesRaw = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []

        const list = typesRaw
          .flatMap((type) =>
            Array.isArray(type.categories)
              ? type.categories.map((c) => ({
                  ...c,
                  id: c?.id || c?._id,
                  typeId: c?.typeId || type.id,
                  typeName: type.name || '',
                }))
              : []
          )
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

    addMarketPriceCategory({ commit }, item) {
      commit('ADD_MARKET_PRICE_CATEGORY', item)
    },

    updateMarketPriceCategory({ commit }, item) {
      commit('UPDATE_MARKET_PRICE_CATEGORY', item)
    },

    removeMarketPriceCategory({ commit }, id) {
      commit('REMOVE_MARKET_PRICE_CATEGORY', id)
    },
  },
}
