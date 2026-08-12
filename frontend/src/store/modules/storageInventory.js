import { getBuilderState } from '@/api/endpoints/builder-v2.api'

const TTL = 15 * 60 * 1000 // 15 minutes

// Single-flight registry HORS du state Vuex (même pattern que shopMenuItems.js) :
// deux fetchForSpace(spaceId) concurrents attendent la MÊME Promise.
const inflight = new Map() // spaceId → Promise

// Projection LÉGÈRE du builder state : on ne garde par élément que ce dont le
// réarmement a besoin (stock tampon + seuils saisis dans la section Inventaire
// du 3D Builder). Le state complet (géométrie, memberships, usage…) reste
// volumineux — on ne le stocke pas.
function projectElements(state) {
  // Adhésions par élément (configs v2) : sert au scoping config côté Restock.
  // Élément ABSENT de la liste memberships → configIds: null (inconnu ≠ vide).
  const membershipByElement = new Map()
  for (const m of state?.memberships || []) {
    if (m?.elementId != null) {
      membershipByElement.set(String(m.elementId), (m.configIds || []).map(String))
    }
  }
  const out = []
  for (const zone of state?.zones || []) {
    for (const el of zone.elements || []) {
      if (!el || el.id == null) continue
      const id = String(el.id)
      out.push({
        id,
        name: el.name || '',
        type: el.type || '',
        configIds: membershipByElement.has(id) ? membershipByElement.get(id) : null,
        // { [configId]: [{ name, quantity, unit, minStock, maxStock, isCustom, menuItemId }] }
        // — clé '' = lignes non scopées à une config (repli, cf. StorageInventorySection).
        inventoryByConfig: el.inventoryByConfig || {},
      })
    }
  }
  return out
}

export default {
  namespaced: true,

  state: () => ({
    bySpace: {}, // { [spaceId]: { elements: [...projection], cachedAt: number } }
    fetching: {}, // { [spaceId]: boolean }
  }),

  getters: {
    forSpace: (state) => (spaceId) => state.bySpace[String(spaceId)]?.elements || [],
    isCacheValidForSpace: (state) => (spaceId) => {
      const entry = state.bySpace[String(spaceId)]
      return !!entry && Date.now() - entry.cachedAt < TTL
    },
    isFetching: (state) => (spaceId) => !!state.fetching[String(spaceId)],
  },

  mutations: {
    SET_FOR_SPACE(state, { spaceId, elements }) {
      state.bySpace = {
        ...state.bySpace,
        [String(spaceId)]: { elements, cachedAt: Date.now() },
      }
    },
    SET_FETCHING(state, { spaceId, val }) {
      state.fetching = { ...state.fetching, [String(spaceId)]: val }
    },
    INVALIDATE(state, spaceId) {
      if (spaceId === undefined) {
        state.bySpace = {}
        return
      }
      const next = { ...state.bySpace }
      delete next[String(spaceId)]
      state.bySpace = next
    },
  },

  actions: {
    async fetchForSpace({ commit, getters }, { spaceId, force = false } = {}) {
      if (!spaceId) return
      if (!force && getters.isCacheValidForSpace(spaceId)) return
      const key = String(spaceId)
      if (inflight.has(key)) return inflight.get(key)
      commit('SET_FETCHING', { spaceId, val: true })
      const p = (async () => {
        try {
          const state = await getBuilderState(spaceId)
          commit('SET_FOR_SPACE', { spaceId, elements: projectElements(state) })
        } finally {
          commit('SET_FETCHING', { spaceId, val: false })
          inflight.delete(key)
        }
      })()
      inflight.set(key, p)
      return p
    },
    invalidate({ commit }, spaceId) {
      commit('INVALIDATE', spaceId)
    },
  },
}
