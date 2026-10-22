import {
  getCostTrackingCatalog,
  getCostTrackingSeries,
  getCostTrackingArticleHistory,
} from '@/api/endpoints/cost-tracking.api'

const TTL = 15 * 60 * 1000 // 15 minutes (catalogue uniquement)

// Jeton de requête : seule la dernière demande de séries / d'historique peut écrire
// dans le state (changement rapide de filtre ou d'espace).
let seriesToken = 0
let historyToken = 0

const messageOf = (e) => e?.response?.data?.message || e?.message || 'error'

export default {
  namespaced: true,

  state: () => ({
    // catalogue
    catalog: null,
    catalogSpaceId: null,
    cachedAt: null,
    fetching: false,
    // filtres de la page (état partagé entre composants)
    filters: { typeId: null, categoryId: null, menuItemId: null, groupBy: null },
    // séries
    series: null,
    seriesLoading: false,
    seriesError: null,
    // historique d'un article
    history: null,
    historyLoading: false,
    historyError: null,
    catalogError: null,
  }),

  getters: {
    catalog: (state) => state.catalog,
    series: (state) => state.series,
    filters: (state) => state.filters,
    history: (state) => state.history,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_CATALOG(state, { spaceId, catalog }) {
      state.catalog = catalog
      state.catalogSpaceId = spaceId
      state.cachedAt = Date.now()
      state.catalogError = null
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    SET_CATALOG_ERROR(state, err) {
      state.catalogError = err
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    SET_FILTERS(state, patch) {
      state.filters = { ...state.filters, ...patch }
    },
    RESET_FILTERS(state) {
      state.filters = { typeId: null, categoryId: null, menuItemId: null, groupBy: null }
    },
    SET_SERIES(state, series) {
      state.series = series
    },
    SET_SERIES_LOADING(state, val) {
      state.seriesLoading = val
    },
    SET_SERIES_ERROR(state, err) {
      state.seriesError = err
    },
    SET_HISTORY(state, history) {
      state.history = history
    },
    SET_HISTORY_LOADING(state, val) {
      state.historyLoading = val
    },
    SET_HISTORY_ERROR(state, err) {
      state.historyError = err
    },
    RESET(state) {
      state.catalog = null
      state.catalogSpaceId = null
      state.cachedAt = null
      state.fetching = false
      state.catalogError = null
      state.series = null
      state.seriesLoading = false
      state.seriesError = null
      state.history = null
      state.historyLoading = false
      state.historyError = null
      state.filters = { typeId: null, categoryId: null, menuItemId: null, groupBy: null }
    },
  },

  actions: {
    async fetchCatalog({ state, commit, getters }, { spaceId, force = false } = {}) {
      if (!spaceId) return
      if (state.fetching) return
      if (!force && state.catalogSpaceId === spaceId && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const catalog = await getCostTrackingCatalog(spaceId)
        commit('SET_CATALOG', { spaceId, catalog })
      } catch (e) {
        commit('SET_CATALOG_ERROR', messageOf(e))
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    async fetchSeries({ commit }, { spaceId, params = {} } = {}) {
      if (!spaceId) return
      const token = ++seriesToken
      commit('SET_SERIES_LOADING', true)
      commit('SET_SERIES_ERROR', null)
      try {
        const series = await getCostTrackingSeries(spaceId, params)
        if (token !== seriesToken) return
        commit('SET_SERIES', series)
      } catch (e) {
        if (token !== seriesToken) return
        commit('SET_SERIES_ERROR', messageOf(e))
      } finally {
        if (token === seriesToken) commit('SET_SERIES_LOADING', false)
      }
    },

    async fetchHistory({ commit }, { spaceId, menuItemId, limit } = {}) {
      if (!spaceId || !menuItemId) return
      const token = ++historyToken
      commit('SET_HISTORY', null)
      commit('SET_HISTORY_LOADING', true)
      commit('SET_HISTORY_ERROR', null)
      try {
        const history = await getCostTrackingArticleHistory(spaceId, menuItemId, { limit })
        if (token !== historyToken) return
        commit('SET_HISTORY', history)
      } catch (e) {
        if (token !== historyToken) return
        commit('SET_HISTORY_ERROR', messageOf(e))
      } finally {
        if (token === historyToken) commit('SET_HISTORY_LOADING', false)
      }
    },

    clearHistory({ commit }) {
      historyToken += 1
      commit('SET_HISTORY', null)
      commit('SET_HISTORY_LOADING', false)
      commit('SET_HISTORY_ERROR', null)
    },

    setFilters({ commit }, patch) {
      commit('SET_FILTERS', patch)
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    reset({ commit }) {
      seriesToken += 1
      historyToken += 1
      commit('RESET')
    },
  },
}
