import { getSpaceShopList } from '@/api/endpoints/space.api'

const TTL = 15 * 60 * 1000 // 15 minutes — même durée que shopMenuItems.js

// Single-flight registry HORS du state Vuex (même pattern que shopMenuItems.js) :
// deux fetchForSpace(spaceId) concurrents (ex. le fan-out « All Configurations »,
// une fois par config, avec le même spaceId) attendent la MÊME Promise au lieu de
// déclencher N requêtes /spaces/:id/shops identiques.
const inflight = new Map() // cacheKey → Promise
const cache = new Map() // cacheKey → { rows, cachedAt }

// configId fait partie de la clé : le backend (`getSpaceShops`) filtre réellement
// par config quand il est fourni (cf. spaces.service.ts) — sans configId → clé
// `spaceId::` (comportement historique « toutes configs »).
function cacheKey(spaceId, configId) {
  return `${spaceId}::${configId || ''}`
}

function unwrap(res) {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.shops)) return res.shops
  if (Array.isArray(res?.data?.data)) return res.data.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.shops)) return res.data.shops
  return []
}

export default {
  namespaced: true,
  actions: {
    async fetchForSpace(_, { spaceId, configId = null, forceRefresh = false } = {}) {
      if (!spaceId) return []
      const key = cacheKey(spaceId, configId)
      if (!forceRefresh) {
        const entry = cache.get(key)
        if (entry && Date.now() - entry.cachedAt < TTL) return entry.rows
        if (inflight.has(key)) return inflight.get(key)
      }
      const p = (async () => {
        try {
          const res = await getSpaceShopList(spaceId, configId)
          const rows = unwrap(res)
          cache.set(key, { rows, cachedAt: Date.now() })
          return rows
        } catch (err) {
          if (err?.response?.status === 404) return []
          throw err
        } finally {
          inflight.delete(key)
        }
      })()
      inflight.set(key, p)
      return p
    },
    invalidateForSpace(_, payload = {}) {
      let spaceId, configId = null
      if (typeof payload === 'string') {
        const parts = payload.split(':')
        spaceId = parts[0]
        configId = parts[1] || null
      } else {
        ;({ spaceId, configId = null } = payload)
      }
      if (!spaceId) return
      if (configId !== null) {
        cache.delete(cacheKey(spaceId, configId))
      } else {
        // Sans configId précis : purge toutes les entrées de ce space (tous configs).
        for (const k of cache.keys()) {
          if (k.startsWith(`${spaceId}::`)) cache.delete(k)
        }
      }
    },
  },
}
