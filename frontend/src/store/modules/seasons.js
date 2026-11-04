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
let inflight = null

export default {
  namespaced: true,
  state: () => ({
    seasons: [],
    cachedAt: 0,
    fetching: false,
  }),
  getters: {
    seasons: (s) => s.seasons,
    fetching: (s) => s.fetching,
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
    // Un seul appel réseau à la fois : les appelants simultanés partagent la promesse en vol.
    // cachedAt n'est posé qu'en cas de succès (un échec laisse le cache invalide, retry possible).
    fetchAll({ commit, getters }, { force = false } = {}) {
      if (!force && getters.isCacheValid) return Promise.resolve()
      if (inflight) return inflight
      commit('setFetching', true)
      inflight = getSeasons()
        .then((seasons) => {
          commit('setSeasons', seasons)
          commit('setCachedAt', Date.now())
        })
        .finally(() => {
          commit('setFetching', false)
          inflight = null
        })
      return inflight
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
