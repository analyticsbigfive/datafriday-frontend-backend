import {
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from '@/api/endpoints/paymentMethods.api'

const TTL = 15 * 60 * 1000 // 15 minutes, gabarit standard du projet

const bySortOrder = (a, b) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name || '').localeCompare(String(b.name || ''))

/**
 * Référentiel « Moyens de paiement » du tenant (Configuration > Moyens de paiement), consommé
 * aussi par l'outil POS pour choisir les moyens d'un évènement.
 */
export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    paymentMethods: (state) => state.list,
    activePaymentMethods: (state) => state.list.filter((m) => m.active),
    isCacheValid: (state) => state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_LIST(state, list) {
      state.list = [...list].sort(bySortOrder)
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_ITEM(state, item) {
      state.list = [...state.list, item].sort(bySortOrder)
    },
    UPDATE_ITEM(state, updated) {
      state.list = state.list
        .map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
        .sort(bySortOrder)
    },
    REMOVE_ITEM(state, id) {
      state.list = state.list.filter((item) => item.id !== id)
    },
  },

  actions: {
    async fetchList({ state, commit, getters }, { force = false } = {}) {
      if (state.fetching) return
      if (!force && getters.isCacheValid) return
      commit('SET_FETCHING', true)
      try {
        const rows = await getPaymentMethods()
        commit('SET_LIST', rows.filter((row) => !!row?.id))
      } finally {
        commit('SET_FETCHING', false)
      }
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    async create({ commit }, payload) {
      const created = await createPaymentMethod(payload)
      commit('ADD_ITEM', created)
      return created
    },

    async update({ commit }, { id, payload }) {
      const updated = await updatePaymentMethod(id, payload)
      commit('UPDATE_ITEM', { ...updated, id })
      return updated
    },

    async remove({ commit }, id) {
      await deletePaymentMethod(id)
      commit('REMOVE_ITEM', id)
    },
  },
}
