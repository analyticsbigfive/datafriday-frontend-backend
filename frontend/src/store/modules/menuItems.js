import { getAllMenuItems } from '@/api/endpoints/menu-item.api'

const TTL = 15 * 60 * 1000 // 15 minutes

export default {
  namespaced: true,

  state: () => ({
    rows: [],
    cachedAt: null,
    isFetching: false,
    pendingForceRefresh: false,
    // Cache scopé par espace, séparé du catalogue tenant complet (`rows`) — utilisé
    // par SpaceMenuView pour éviter de charger tout le catalogue quand un seul espace
    // est affiché. Clé = spaceId.
    bySpace: {},
  }),

  getters: {
    rows: (state) => state.rows,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
    forSpace: (state) => (spaceId) => state.bySpace[spaceId]?.rows || [],
    isSpaceCacheValid: (state) => (spaceId) => {
      const entry = state.bySpace[spaceId]
      return !!entry && entry.cachedAt !== null && Date.now() - entry.cachedAt < TTL
    },
  },

  mutations: {
    SET_ROWS(state, rows) {
      state.rows = rows
      state.cachedAt = Date.now()
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    REMOVE_ROWS(state, ids) {
      const set = new Set(ids)
      state.rows = state.rows.filter(r => !set.has(r.id || r._id))
    },
    SET_FETCHING(state, val) {
      state.isFetching = val
    },
    SET_PENDING_REFRESH(state, val) {
      state.pendingForceRefresh = val
    },
    SET_SPACE_ROWS(state, { spaceId, rows }) {
      state.bySpace = {
        ...state.bySpace,
        [spaceId]: { rows, cachedAt: Date.now(), isFetching: false },
      }
    },
    SET_SPACE_FETCHING(state, { spaceId, val }) {
      const entry = state.bySpace[spaceId] || { rows: [], cachedAt: null }
      state.bySpace = { ...state.bySpace, [spaceId]: { ...entry, isFetching: val } }
    },
    INVALIDATE_SPACE(state, spaceId) {
      if (!state.bySpace[spaceId]) return
      state.bySpace = { ...state.bySpace, [spaceId]: { ...state.bySpace[spaceId], cachedAt: null } }
    },
  },

  actions: {
    async fetchMenuItems({ commit, getters, state, dispatch }, { forceRefresh = false } = {}) {
      if (state.isFetching) {
        if (forceRefresh) commit('SET_PENDING_REFRESH', true)
        return
      }
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      commit('SET_PENDING_REFRESH', false)
      try {
        const res = await getAllMenuItems()
        const rows = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.data?.data)
              ? res.data.data
              : []
        commit('SET_ROWS', rows)
      } finally {
        commit('SET_FETCHING', false)
        if (state.pendingForceRefresh) {
          commit('SET_PENDING_REFRESH', false)
          dispatch('fetchMenuItems', { forceRefresh: true })
        }
      }
    },

    /**
     * Charge les menu items scopés à un espace (MenuItem.spaceIds côté backend), sans
     * toucher au cache "catalogue tenant complet" (`rows`) utilisé par le builder,
     * le wizard d'intégration, etc.
     */
    async fetchMenuItemsForSpace({ commit, getters, state }, { spaceId, forceRefresh = false } = {}) {
      if (!spaceId) return
      if (state.bySpace[spaceId]?.isFetching) return
      if (!forceRefresh && getters.isSpaceCacheValid(spaceId)) return
      commit('SET_SPACE_FETCHING', { spaceId, val: true })
      try {
        const res = await getAllMenuItems(spaceId)
        const rows = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.data?.data)
              ? res.data.data
              : []
        commit('SET_SPACE_ROWS', { spaceId, rows })
      } finally {
        commit('SET_SPACE_FETCHING', { spaceId, val: false })
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    removeRows({ commit }, ids) {
      commit('REMOVE_ROWS', Array.isArray(ids) ? ids : [ids])
    },
  },
}
