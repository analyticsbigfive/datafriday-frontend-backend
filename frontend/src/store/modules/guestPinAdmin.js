// Back-office directeur — fenêtres d'inventaire pré/post-event et accès PIN par PDV.
// Pas de cache TTL ici (contrairement au patron `list/cachedAt/fetching` standard) :
// le tableau de statut doit refléter l'état temps réel (PIN généré, appareil lié,
// fenêtre clôturée) pendant que l'événement est en cours — un cache 15 min masquerait
// des actions que le directeur vient de faire lui-même.

import {
  createOrReopenWindow,
  getStatusBoard,
  setWindowPin,
  revokeAccess,
  reactivateAccess,
  validateAccess,
  requestCorrection,
  closeWindow,
} from '@/api/endpoints/guestPinAdmin.api'

const state = {
  windows: [], // [{ id, phase, status, showExpected, openedAt, closedAt, accesses: [...] }]
  fetching: false,
  spaceId: null,
  eventId: null,
}

const getters = {
  windows: (state) => state.windows,
  windowByPhase: (state) => (phase) => state.windows.find((w) => w.phase === phase) ?? null,
}

const mutations = {
  SET_WINDOWS(state, { spaceId, eventId, windows }) {
    state.spaceId = spaceId
    state.eventId = eventId
    state.windows = windows
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

  async openWindow({ dispatch }, { spaceId, eventId, phase, showExpected }) {
    await createOrReopenWindow({ spaceId, eventId, phase, showExpected })
    return dispatch('fetchStatusBoard', { spaceId, eventId })
  },

  /** Retourne { windowId, pin } — le PIN en clair (PARTAGÉ par tous les PDV de la
   *  fenêtre), affiché une seule fois. */
  async generateWindowPin({ state, dispatch }, windowId) {
    const result = await setWindowPin(windowId)
    await dispatch('fetchStatusBoard', { spaceId: state.spaceId, eventId: state.eventId })
    return result
  },

  async revoke({ state, dispatch }, accessId) {
    await revokeAccess(accessId)
    await dispatch('fetchStatusBoard', { spaceId: state.spaceId, eventId: state.eventId })
  },

  /** Réactive un PDV précédemment révoqué, sans toucher au PIN partagé. */
  async reactivate({ state, dispatch }, accessId) {
    const result = await reactivateAccess(accessId)
    await dispatch('fetchStatusBoard', { spaceId: state.spaceId, eventId: state.eventId })
    return result
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

  /** Clôture : révoque TOUS les accès invité de la fenêtre et pousse la logistique
   *  (réutilise l'action existante POST /inventory/:spaceId/push-to-logistic côté serveur). */
  async close({ state, dispatch }, windowId) {
    const result = await closeWindow(windowId)
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
