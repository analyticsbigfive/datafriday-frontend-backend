import { getEvents } from '@/api/endpoints/event.api'

const TTL = 5 * 60 * 1000 // 5 minutes

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
      if (state.fetching) return
      if (!forceRefresh && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const data = await getEvents()
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
              ? data.data.data
              : []
        commit('SET_EVENTS', list)
      } finally {
        commit('SET_FETCHING', false)
      }
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
          title: 'Event mis à jour',
          message: name ? `« ${name} »` : 'Un event a été modifié',
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
