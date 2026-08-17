import { getMenuComponents } from '@/api/endpoints/menu.api'

// Cache TTL retiré (demande 2026-08-01) : on refetch TOUJOURS frais depuis le backend, pour ne
// jamais conserver localement un composant supprimé (le TTL de 15 min laissait une fenêtre où la
// liste restait périmée après une suppression).

async function fetchAllPages() {
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
  return rows
}

// Fetch en vol + refetch en attente, partagés entre toutes les instances de composant (le module
// Vuex est un singleton) — variables de module plutôt que state, pour ne pas rendre une Promise
// réactive.
let inFlight = null
let queuedRefetch = false

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
    // Mise à jour locale immédiate après une mutation dont on connaît déjà le résultat
    // (création/duplication/suppression) — évite de dépendre d'un refetch réseau (latence,
    // cache backend, concurrence) juste pour refléter un changement qu'on vient de faire
    // nous-mêmes. UPSERT : remplace la ligne si l'id existe déjà, l'ajoute sinon.
    UPSERT_ROW(state, row) {
      const id = row?.id ?? row?._id
      if (!id) return
      const idx = state.rows.findIndex((r) => (r?.id ?? r?._id) === id)
      if (idx === -1) state.rows = [...state.rows, row]
      else state.rows = [...state.rows.slice(0, idx), row, ...state.rows.slice(idx + 1)]
    },
    REMOVE_ROW(state, id) {
      state.rows = state.rows.filter((r) => (r?.id ?? r?._id) !== id)
    },
  },

  actions: {
    // Le payload (`{ forceRefresh }`) est toléré mais ignoré : sans cache, chaque appel refetch.
    //
    // BUG constaté 2026-08-14 (duplication de composant) : un appel arrivant PENDANT un fetch déjà
    // en vol (gros catalogue, plusieurs pages séquentielles) se faisait purement et simplement
    // ignorer (`if (state.fetching) return`) — pas d'erreur, pas de refresh, jusqu'au prochain
    // rechargement complet de page. Un composant tout juste dupliqué/supprimé n'apparaissait/
    // disparaissait donc pas tant qu'aucun rechargement manuel n'était fait. Fix : les appels
    // concurrents partagent la même Promise (au lieu de no-op) ; si un appel arrive PENDANT le
    // fetch en vol, on enchaîne un second fetch juste après pour garantir des données réellement
    // fraîches (le fetch en vol a pu démarrer AVANT que la mutation d'origine ne soit persistée).
    async fetchComponents({ commit, dispatch }) {
      if (inFlight) {
        queuedRefetch = true
        return inFlight
      }
      commit('SET_FETCHING', true)
      inFlight = (async () => {
        try {
          const rows = await fetchAllPages()
          commit('SET_ROWS', rows)
        } finally {
          commit('SET_FETCHING', false)
          inFlight = null
        }
      })()
      await inFlight
      if (queuedRefetch) {
        queuedRefetch = false
        await dispatch('fetchComponents')
      }
    },

    // Conservée pour compat : ComponentCreateView dispatch encore `invalidate`. Devenue no-op
    // (plus de cache à invalider) — le prochain fetchComponents refait de toute façon l'appel.
    invalidate() {},
  },
}
