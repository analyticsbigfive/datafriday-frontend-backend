import { getKitchens } from '@/api/endpoints/kitchens.api'

const TTL = 15 * 60 * 1000 // 15 minutes

// Chargement en cours, partagé par les appels simultanés.
let inflight = null

// Cuisines (Settings > Menu F&B > Cuisines) : même modèle que le module suppliers.
export default {
  namespaced: true,

  state: () => ({
    list: [],
    cachedAt: null,
    fetching: false,
  }),

  getters: {
    kitchens: (state) => state.list,
    isCacheValid: (state) =>
      state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
  },

  mutations: {
    SET_KITCHENS(state, kitchens) {
      state.list = kitchens
      state.cachedAt = Date.now()
    },
    SET_FETCHING(state, val) {
      state.fetching = val
    },
    INVALIDATE(state) {
      state.cachedAt = null
    },
    ADD_KITCHEN(state, kitchen) {
      state.list = [...state.list, kitchen].sort((a, b) => String(a.name).localeCompare(String(b.name)))
    },
    UPDATE_KITCHEN(state, updated) {
      state.list = state.list.map((k) => (k.id === updated.id ? updated : k))
    },
    REMOVE_KITCHEN(state, id) {
      state.list = state.list.filter((k) => k.id !== id)
    },
  },

  actions: {
    // Un appel pendant un chargement en cours attend ce chargement (au lieu de rendre la
    // main tout de suite) : l'export / import CSV lit la liste juste après.
    fetchKitchens({ commit, getters }, { forceRefresh = false } = {}) {
      if (inflight) return inflight
      if (!forceRefresh && getters.isCacheValid) return Promise.resolve()
      commit('SET_FETCHING', true)
      inflight = (async () => {
        const limit = 100
        let page = 1
        let list = []
        // Pages de `limit` jusqu'à `meta.total` (même boucle que suppliers, BUG-052).
        while (true) {
          const result = await getKitchens({ page, limit })
          const pageList = Array.isArray(result?.data) ? result.data : []
          list = list.concat(pageList)
          const total = result?.meta?.total
          if (!total || pageList.length < limit || list.length >= total) break
          page += 1
        }
        commit('SET_KITCHENS', list)
      })().finally(() => {
        inflight = null
        commit('SET_FETCHING', false)
      })
      return inflight
    },

    invalidate({ commit }) {
      commit('INVALIDATE')
    },

    addKitchen({ commit }, kitchen) {
      commit('ADD_KITCHEN', kitchen)
    },

    updateKitchen({ commit }, kitchen) {
      commit('UPDATE_KITCHEN', kitchen)
    },

    removeKitchen({ commit }, id) {
      commit('REMOVE_KITCHEN', id)
    },
  },
}
