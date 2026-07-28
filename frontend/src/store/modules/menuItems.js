import { getAllMenuItems } from '@/api/endpoints/menu-item.api'

const TTL = 15 * 60 * 1000 // 15 minutes

// Single-flight registry HORS du state Vuex (une Promise dans le state réactif =
// anti-pattern). Deux fetchMenuItems() concurrents attendent la MÊME Promise
// → cf. shopMenuItems.js pour le pattern de référence.
let inflight = null

export default {
  namespaced: true,

  state: () => ({
    rows: [],
    cachedAt: null,
    isFetching: false,
    pendingForceRefresh: false,
  }),

  getters: {
    rows: (state) => state.rows,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
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
  },

  actions: {
    async fetchMenuItems({ commit, getters, state, dispatch }, { forceRefresh = false } = {}) {
      if (!forceRefresh && getters.isCacheValid) return
      // Coalesce les appels concurrents : on retourne (await) la Promise en vol.
      if (inflight) {
        if (forceRefresh) commit('SET_PENDING_REFRESH', true)
        return inflight
      }
      commit('SET_FETCHING', true)
      commit('SET_PENDING_REFRESH', false)
      const p = (async () => {
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
          inflight = null
          if (state.pendingForceRefresh) {
            commit('SET_PENDING_REFRESH', false)
            dispatch('fetchMenuItems', { forceRefresh: true })
          }
        }
      })()
      inflight = p
      return p
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    removeRows({ commit }, ids) {
      commit('REMOVE_ROWS', Array.isArray(ids) ? ids : [ids])
    },
  },
}
