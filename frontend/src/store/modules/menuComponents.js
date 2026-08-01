import { getMenuComponents } from '@/api/endpoints/menu.api'

// Cache TTL retiré (demande 2026-08-01) : on refetch TOUJOURS frais depuis le backend, pour ne
// jamais conserver localement un composant supprimé (le TTL de 15 min laissait une fenêtre où la
// liste restait périmée après une suppression). Seul garde restant : `fetching`, qui évite des
// appels concurrents en double (le fetch en vol étant lui-même frais).
export default {
  namespaced: true,

  state: () => ({
    rows: [],
    fetching: false,
  }),

  getters: {
    rows: (state) => state.rows,
  },

  mutations: {
    SET_ROWS(state, rows) {
      state.rows = rows
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
  },

  actions: {
    // Le payload (`{ forceRefresh }`) est toléré mais ignoré : sans cache, chaque appel refetch.
    async fetchComponents({ state, commit }) {
      if (state.fetching) return
      commit('SET_FETCHING', true)
      try {
        const limit = 100
        let page = 1
        let rows = []
        // Le backend plafonne chaque appel à `limit` composants (cf. BUG-054, même schéma que
        // BUG-040/BUG-052) : on boucle sur `meta.total` tant qu'il en reste, pour ne pas tronquer
        // silencieusement les tenants ayant plus de `limit` composants.
        while (true) {
          const res = await getMenuComponents({ page, limit })
          const pageRows = Array.isArray(res)
            ? res
            : Array.isArray(res?.data)
              ? res.data
              : Array.isArray(res?.items)
                ? res.items
                : []
          rows = rows.concat(pageRows)
          const total = res?.meta?.total ?? res?.data?.meta?.total
          if (!total || pageRows.length < limit || rows.length >= total) break
          page += 1
        }
        commit('SET_ROWS', rows)
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    // Conservée pour compat : ComponentCreateView dispatch encore `invalidate`. Devenue no-op
    // (plus de cache à invalider) — le prochain fetchComponents refait de toute façon l'appel.
    invalidate() {},
  },
}
