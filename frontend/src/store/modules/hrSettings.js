// Store Settings HR — Goals (CA par TPE) & Staff par Responsable de zone.
// Pattern standard (state list/cachedAt/fetching, getter isCacheValid 15 min).
// Persistance BDD via api/endpoints/hrSettings.api.js (pas localStorage).
import {
  getHrGoals,
  createHrGoal,
  updateHrGoal,
  deleteHrGoal,
  getHrStaffRatios,
  createHrStaffRatio,
  updateHrStaffRatio,
  deleteHrStaffRatio,
} from '@/api/endpoints/hrSettings.api'

const CACHE_TTL = 15 * 60 * 1000

export default {
  namespaced: true,
  state: () => ({
    goals: [],
    staffRatios: [],
    cachedAt: 0,
    fetching: false,
  }),
  getters: {
    goals: (s) => s.goals,
    staffRatios: (s) => s.staffRatios,
    isCacheValid: (s) => s.cachedAt > 0 && Date.now() - s.cachedAt < CACHE_TTL,
  },
  mutations: {
    setGoals(s, v) { s.goals = v },
    setStaffRatios(s, v) { s.staffRatios = v },
    setCachedAt(s, v) { s.cachedAt = v },
    setFetching(s, v) { s.fetching = v },
  },
  actions: {
    async fetchAll({ commit, getters }, { force = false } = {}) {
      if (!force && getters.isCacheValid) return
      commit('setFetching', true)
      try {
        const [goals, ratios] = await Promise.all([getHrGoals(), getHrStaffRatios()])
        commit('setGoals', goals)
        commit('setStaffRatios', ratios)
        commit('setCachedAt', Date.now())
      } finally {
        commit('setFetching', false)
      }
    },

    // Goals — mutation puis refetch (listes courtes, correction > micro-perf).
    async createGoal({ dispatch }, payload) {
      await createHrGoal(payload)
      await dispatch('fetchAll', { force: true })
    },
    async updateGoal({ dispatch }, { id, ...payload }) {
      await updateHrGoal(id, payload)
      await dispatch('fetchAll', { force: true })
    },
    async removeGoal({ dispatch }, id) {
      await deleteHrGoal(id)
      await dispatch('fetchAll', { force: true })
    },

    // Staff par Responsable de zone.
    async createRatio({ dispatch }, payload) {
      await createHrStaffRatio(payload)
      await dispatch('fetchAll', { force: true })
    },
    async updateRatio({ dispatch }, { id, ...payload }) {
      await updateHrStaffRatio(id, payload)
      await dispatch('fetchAll', { force: true })
    },
    async removeRatio({ dispatch }, id) {
      await deleteHrStaffRatio(id)
      await dispatch('fetchAll', { force: true })
    },
  },
}
