import { getSpaceIntegrations } from '@/api/endpoints/space.api'

// BUG-369-02 : liste des intégrations d'un espace — change rarement (seulement à l'ajout
// d'une nouvelle intégration sur cet espace), même pattern de cache que spaceShops.js.
const TTL = 15 * 60 * 1000 // 15 minutes

const inflight = new Map() // spaceId → Promise
const cache = new Map() // spaceId → { rows, cachedAt }

export default {
  namespaced: true,
  actions: {
    async fetchForSpace(_, { spaceId, forceRefresh = false } = {}) {
      if (!spaceId) return []
      if (!forceRefresh) {
        const entry = cache.get(spaceId)
        if (entry && Date.now() - entry.cachedAt < TTL) return entry.rows
        if (inflight.has(spaceId)) return inflight.get(spaceId)
      }
      const p = (async () => {
        try {
          const rows = await getSpaceIntegrations(spaceId)
          cache.set(spaceId, { rows, cachedAt: Date.now() })
          return rows
        } catch (err) {
          if (err?.response?.status === 404) return []
          throw err
        } finally {
          inflight.delete(spaceId)
        }
      })()
      inflight.set(spaceId, p)
      return p
    },
    invalidateForSpace(_, spaceId) {
      if (!spaceId) return
      cache.delete(spaceId)
    },
  },
}
