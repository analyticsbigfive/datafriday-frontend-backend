// Store Saisons — périodes personnalisées (custom ranges nommés) proposées
// comme presets de dates dans Analyse/Predict et gérées dans
// Settings > Configuration > Saisons.
// Pattern standard (state list/cachedAt/fetching, getter isCacheValid 15 min).
import {
  getSeasons,
  createSeason,
  updateSeason,
  deleteSeason,
} from '@/api/endpoints/seasons.api'

const CACHE_TTL = 15 * 60 * 1000

export default {
  namespaced: true,
  state: () => ({
    seasons: [],
    cachedAt: 0,
    fetching: false,
  }),
  getters: {
    seasons: (s) => s.seasons,
    isCacheValid: (s) => s.cachedAt > 0 && Date.now() - s.cachedAt < CACHE_TTL,
    /** Saisons applicables à un espace : allSpaces OU jointure explicite. */
    seasonsForSpace: (s) => (spaceId) =>
      s.seasons.filter(
        (season) => season.allSpaces || (season.spaceIds || []).includes(spaceId),
      ),
    seasonById: (s) => (id) => s.seasons.find((season) => season.id === id) || null,
  },
  mutations: {
    setSeasons(s, v) { s.seasons = v },
    setCachedAt(s, v) { s.cachedAt = v },
    setFetching(s, v) { s.fetching = v },
  },
  actions: {
    async fetchAll({ commit, getters }, { force = false } = {}) {
      if (!force && getters.isCacheValid) return
      commit('setFetching', true)
      try {
        const seasons = await getSeasons()
        commit('setSeasons', seasons)
        commit('setCachedAt', Date.now())
      } finally {
        commit('setFetching', false)
      }
    },

    // Mutation puis refetch (listes courtes, correction > micro-perf).
    async create({ dispatch }, payload) {
      await createSeason(payload)
      await dispatch('fetchAll', { force: true })
    },
    async update({ dispatch }, { id, ...payload }) {
      await updateSeason(id, payload)
      await dispatch('fetchAll', { force: true })
    },
    async remove({ dispatch }, id) {
      await deleteSeason(id)
      await dispatch('fetchAll', { force: true })
    },
  },
}
