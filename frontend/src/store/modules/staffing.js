// Store Staffing — lignes de staff par événement (onglet Staff d'EventPredict).
// Pattern standard des modules (state/cachedAt/fetching + fetch({force})),
// scoping par eventId : changer d'événement invalide le cache.
import {
  getEventStaffing,
  generateEventStaffing,
  patchStaffLine,
  addStaffLine,
  deleteStaffLine,
} from '@/api/endpoints/staffing.api'

const CACHE_TTL = 15 * 60 * 1000 // 15 min — même TTL que les autres modules

export default {
  namespaced: true,

  state: () => ({
    eventId: null,
    // Payload backend : { settings, schedule, elements: [...], totals, warnings }
    payload: null,
    cachedAt: 0,
    fetching: false,
    saving: false,
  }),

  getters: {
    payload: (s) => s.payload,
    elements: (s) => s.payload?.elements ?? [],
    settings: (s) => s.payload?.settings ?? null,
    schedule: (s) => s.payload?.schedule ?? null,
    totals: (s) => s.payload?.totals ?? null,
    warnings: (s) => s.payload?.warnings ?? [],
    predictedCostByElement: (s) =>
      Object.fromEntries((s.payload?.elements ?? []).map((e) => [e.elementId, e.predictedCost])),
    adjustedCostByElement: (s) =>
      Object.fromEntries((s.payload?.elements ?? []).map((e) => [e.elementId, e.adjustedCost])),
    eventTotals: (s) => s.payload?.totals ?? null,
    isCacheValid: (s, _g, _rs, _rg) => (eventId) =>
      s.eventId === eventId && s.cachedAt > 0 && Date.now() - s.cachedAt < CACHE_TTL,
    fetching: (s) => s.fetching,
    saving: (s) => s.saving,
  },

  mutations: {
    setPayload(state, { eventId, payload }) {
      state.eventId = eventId
      state.payload = payload
      state.cachedAt = Date.now()
    },
    setFetching(state, v) {
      state.fetching = v
    },
    setSaving(state, v) {
      state.saving = v
    },
    invalidate(state) {
      state.cachedAt = 0
    },
  },

  actions: {
    async fetchStaffing({ commit, getters }, { eventId, force = false }) {
      if (!force && getters.isCacheValid(eventId)) return
      commit('setFetching', true)
      try {
        const payload = await getEventStaffing(eventId)
        commit('setPayload', { eventId, payload })
      } finally {
        commit('setFetching', false)
      }
    },

    async generate({ commit }, eventId) {
      commit('setSaving', true)
      try {
        const payload = await generateEventStaffing(eventId)
        commit('setPayload', { eventId, payload })
      } finally {
        commit('setSaving', false)
      }
    },

    async patchLine({ commit, dispatch, state }, { lineId, ...payload }) {
      commit('setSaving', true)
      try {
        await patchStaffLine(lineId, payload)
        if (state.eventId) await dispatch('fetchStaffing', { eventId: state.eventId, force: true })
      } finally {
        commit('setSaving', false)
      }
    },

    async addLine({ commit, dispatch }, { eventId, ...payload }) {
      commit('setSaving', true)
      try {
        await addStaffLine(eventId, payload)
        await dispatch('fetchStaffing', { eventId, force: true })
      } finally {
        commit('setSaving', false)
      }
    },

    async removeLine({ commit, dispatch, state }, lineId) {
      commit('setSaving', true)
      try {
        await deleteStaffLine(lineId)
        if (state.eventId) await dispatch('fetchStaffing', { eventId: state.eventId, force: true })
      } finally {
        commit('setSaving', false)
      }
    },

    invalidate({ commit }) {
      commit('invalidate')
    },
  },
}
