// Store des alias « historique emprunté » Event Predict, par espace.
// State RÉACTIF (contrairement à spaceShops.js) : la liste alimente
// directement la chaîne de computeds d'EventPredictView (réécriture
// d'activeTimelineData → buckets, badge « historique emprunté », stock-up) —
// créer/supprimer un alias doit recalculer sans refetch réseau de timeline.
import {
  getHistoryAliases,
  createHistoryAlias,
  deleteHistoryAlias,
} from '@/api/endpoints/historyAliases.api'

const TTL = 15 * 60 * 1000 // 15 minutes — même durée que les autres modules

export default {
  namespaced: true,
  state: () => ({
    // spaceId -> Array<MenuItemHistoryAlias>
    listBySpace: {},
    // spaceId -> timestamp du dernier fetch réussi
    cachedAt: {},
    fetching: false,
  }),
  getters: {
    forSpace: (state) => (spaceId) => state.listBySpace[spaceId] || [],
  },
  mutations: {
    SET_LIST(state, { spaceId, list }) {
      state.listBySpace = { ...state.listBySpace, [spaceId]: list }
      state.cachedAt = { ...state.cachedAt, [spaceId]: Date.now() }
    },
    UPSERT_ALIAS(state, { spaceId, alias }) {
      const list = state.listBySpace[spaceId] || []
      const idx = list.findIndex(
        (a) => a.id === alias.id || a.sourceName === alias.sourceName,
      )
      const next = idx >= 0 ? list.map((a, i) => (i === idx ? alias : a)) : [alias, ...list]
      state.listBySpace = { ...state.listBySpace, [spaceId]: next }
    },
    REMOVE_ALIAS(state, { spaceId, id }) {
      const list = state.listBySpace[spaceId] || []
      state.listBySpace = {
        ...state.listBySpace,
        [spaceId]: list.filter((a) => a.id !== id),
      }
    },
    SET_FETCHING(state, v) {
      state.fetching = v === true
    },
    INVALIDATE(state, spaceId) {
      const next = { ...state.cachedAt }
      delete next[spaceId]
      state.cachedAt = next
    },
  },
  actions: {
    async fetchForSpace({ state, commit }, { spaceId, force = false } = {}) {
      if (!spaceId) return []
      const at = state.cachedAt[spaceId]
      if (!force && at && Date.now() - at < TTL) return state.listBySpace[spaceId] || []
      commit('SET_FETCHING', true)
      try {
        const res = await getHistoryAliases(spaceId)
        const list = Array.isArray(res) ? res : []
        commit('SET_LIST', { spaceId, list })
        return list
      } catch (err) {
        if (err?.response?.status === 404) {
          // Backend pas encore déployé / table absente : liste vide, pas d'erreur.
          commit('SET_LIST', { spaceId, list: [] })
          return []
        }
        throw err
      } finally {
        commit('SET_FETCHING', false)
      }
    },
    async createAlias({ commit }, payload) {
      const alias = await createHistoryAlias(payload)
      // MAJ locale (pas de refetch) : la réactivité recalcule immédiatement.
      if (alias && alias.id) commit('UPSERT_ALIAS', { spaceId: payload.spaceId, alias })
      return alias
    },
    async removeAlias({ commit }, { spaceId, id }) {
      await deleteHistoryAlias(id)
      commit('REMOVE_ALIAS', { spaceId, id })
    },
    invalidate({ commit }, spaceId) {
      commit('INVALIDATE', spaceId)
    },
  },
}
