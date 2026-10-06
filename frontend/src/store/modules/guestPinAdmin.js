// Back-office directeur — fenêtres d'inventaire pré/post-event et accès PIN par PDV.
// Pas de cache TTL ici (contrairement au patron `list/cachedAt/fetching` standard) :
// le tableau de statut doit refléter l'état temps réel (PIN généré, appareil lié,
// fenêtre clôturée) pendant que l'événement est en cours — un cache 15 min masquerait
// des actions que le directeur vient de faire lui-même.

import {
  getStatusBoard,
  getPeriods,
  validateAccess,
  requestCorrection,
  startWindow,
  stopWindow,
  startElement,
  stopElement,
} from '@/api/endpoints/guestPinAdmin.api'

const state = {
  windows: [], // [{ id, phase, status, showExpected, openedAt, closedAt, accesses: [...] }]
  fetching: false,
  spaceId: null,
  eventId: null,
  // Périodes pre/post-event de l'event affiché (cf. getPeriods), null tant que non chargées.
  periods: null,
}

const getters = {
  windows: (state) => state.windows,
  windowByPhase: (state) => (phase) => state.windows.find((w) => w.phase === phase) ?? null,
  periodByPhase: (state) => (phase) => state.periods?.[phase] ?? null,
}

const mutations = {
  SET_WINDOWS(state, { spaceId, eventId, windows }) {
    state.spaceId = spaceId
    state.eventId = eventId
    state.windows = windows
  },
  SET_PERIODS(state, periods) {
    state.periods = periods
  },
  SET_FETCHING(state, value) {
    state.fetching = value
  },
}

const actions = {
  async fetchStatusBoard({ commit }, { spaceId, eventId }) {
    commit('SET_FETCHING', true)
    try {
      const windows = await getStatusBoard(spaceId, eventId)
      commit('SET_WINDOWS', { spaceId, eventId, windows })
      return windows
    } finally {
      commit('SET_FETCHING', false)
    }
  },

  async fetchPeriods({ commit }, { spaceId, eventId }) {
    commit('SET_PERIODS', null)
    const periods = await getPeriods(spaceId, eventId)
    commit('SET_PERIODS', periods)
    return periods
  },

  /** ▶ / ■ du bandeau (tous les PDV) et des lignes PDV (un seul). Le serveur renvoie
   *  le tableau de statut à jour : pas de second aller-retour. */
  async startWindow({ commit }, { spaceId, eventId, phase }) {
    const windows = await startWindow({ spaceId, eventId, phase })
    commit('SET_WINDOWS', { spaceId, eventId, windows })
  },
  async stopWindow({ commit }, { spaceId, eventId, phase }) {
    const windows = await stopWindow({ spaceId, eventId, phase })
    commit('SET_WINDOWS', { spaceId, eventId, windows })
  },
  async startElement({ commit }, { spaceId, eventId, phase, elementId }) {
    const windows = await startElement({ spaceId, eventId, phase, elementId })
    commit('SET_WINDOWS', { spaceId, eventId, windows })
  },
  async stopElement({ commit }, { spaceId, eventId, phase, elementId }) {
    const windows = await stopElement({ spaceId, eventId, phase, elementId })
    commit('SET_WINDOWS', { spaceId, eventId, windows })
  },

  /** Verrouille l'écriture invité pour ce PDV (relecture directeur terminée). */
  async validate({ state, dispatch }, accessId) {
    const result = await validateAccess(accessId)
    await dispatch('fetchStatusBoard', { spaceId: state.spaceId, eventId: state.eventId })
    return result
  },

  /** Renvoie ce PDV pour correction : réouvre l'écriture, même PIN. */
  async requestCorrection({ state, dispatch }, accessId) {
    const result = await requestCorrection(accessId)
    await dispatch('fetchStatusBoard', { spaceId: state.spaceId, eventId: state.eventId })
    return result
  },
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions,
}
