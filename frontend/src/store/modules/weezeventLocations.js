import { getWeezeventLocations } from '@/api/endpoints/aggregation.api'

// Catalogue de lieux Weezevent d'une intégration — même pattern que spaceShops.js/
// spaceIntegrations.js, TTL plus court (les lieux peuvent être ajoutés côté Weezevent
// pendant que l'utilisateur configure son mapping, contrairement aux espaces/configs
// DataFriday qui changent rarement).
const TTL = 5 * 60 * 1000 // 5 minutes

const inflight = new Map() // integrationId → Promise
const cache = new Map() // integrationId → { result, cachedAt }

export default {
  namespaced: true,
  actions: {
    async fetchForIntegration(_, { integrationId, forceRefresh = false } = {}) {
      if (!integrationId) return { data: [], meta: {} }
      if (!forceRefresh) {
        const entry = cache.get(integrationId)
        if (entry && Date.now() - entry.cachedAt < TTL) return entry.result
        if (inflight.has(integrationId)) return inflight.get(integrationId)
      }
      const p = (async () => {
        try {
          const result = await getWeezeventLocations(integrationId)
          cache.set(integrationId, { result, cachedAt: Date.now() })
          return result
        } finally {
          inflight.delete(integrationId)
        }
      })()
      inflight.set(integrationId, p)
      return p
    },
    invalidateForIntegration(_, integrationId) {
      if (!integrationId) return
      cache.delete(integrationId)
    },
  },
}
