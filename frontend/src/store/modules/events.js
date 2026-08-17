import { getEvents } from '@/api/endpoints/event.api'

// BUG-147 : aligné sur la convention établie (15 min, cf. eventTypes.js/eventCategories.js/
// eventSubcategories.js) — aucun consommateur identifié n'a besoin d'une fraîcheur plus courte.
const TTL = 15 * 60 * 1000 // 15 minutes

// Single-flight registry HORS du state Vuex — cf. menuItems.js pour le pattern
// de référence. Deux fetchEvents() concurrents attendent la MÊME Promise.
let inflight = null

export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    events: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_EVENTS(state, list) {
      state.list = list
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_EVENT(state, item) {
      state.list = [...state.list, item]
    },
    UPDATE_EVENT(state, updated) {
      state.list = state.list.map((e) => (e.id === updated.id ? updated : e))
    },
    REMOVE_EVENT(state, id) {
      state.list = state.list.filter((e) => e.id !== id)
    },
  },

  actions: {
    async fetchEvents({ state, commit, getters }, { forceRefresh = false } = {}) {
      if (!forceRefresh && getters.isCacheValid) return
      if (inflight) return inflight

      commit('SET_FETCHING', true)
      const p = (async () => {
        try {
          // Le backend plafonne GET /events à `limit` (défaut 50) : on boucle
          // sur `meta.total` tant qu'il en reste, sinon la liste est tronquée
          // silencieusement pour tout tenant ayant plus de 50 events (même
          // cause racine que BUG-040/BUG-054 côté Market Prices/Menu Items).
          const limit = 200
          let page = 1
          let list = []
          while (true) {
            const result = await getEvents({ page, limit })
            const pageRows = Array.isArray(result)
              ? result
              : Array.isArray(result?.data)
                ? result.data
                : Array.isArray(result?.data?.data)
                  ? result.data.data
                  : []
            list = list.concat(pageRows)
            const total = result?.meta?.total ?? result?.data?.meta?.total
            if (!total || pageRows.length < limit || list.length >= total) break
            page += 1
          }
          commit('SET_EVENTS', list)
        } finally {
          commit('SET_FETCHING', false)
          inflight = null
        }
      })()
      inflight = p
      return p
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addEvent({ commit }, item) {
      // PAS de notification ici : addEvent est aussi appelé en BOUCLE par les
      // imports en masse (CsvImportDrawer, StepProcessTimeline) → flood. La
      // demande porte sur l'event « mis à jour », couvert par updateEvent.
      commit('ADD_EVENT', item)
    },

    updateEvent({ commit, dispatch }, item) {
      commit('UPDATE_EVENT', item)
      const name = item?.name || item?.title || ''
      dispatch(
        'notifications/push',
        {
          type: 'event',
          // Clés i18n : traduites au rendu par NotificationPanel (le store n'a
          // pas accès au t() réactif ; la notif suit la langue de l'app).
          titleKey: 'notifEventUpdatedTitle',
          messageKey: name ? 'notifEventUpdatedName' : 'notifEventUpdatedNoName',
          params: name ? { name } : null,
          meta: { id: item?.id },
        },
        { root: true },
      )
    },

    removeEvent({ commit }, id) {
      commit('REMOVE_EVENT', id)
    },
  },
}
