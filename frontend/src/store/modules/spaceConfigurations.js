import { getSpaceConfigurations } from '@/api/endpoints/space.api'

function unwrap(res) {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.data)) return res.data.data
  return []
}

// Module stateless : pas de state ni de getters. `fetchForSpace` retourne les
// configs sans les stocker — chaque composant consomme le retour et gère son
// propre cache local s'il en a besoin.
export default {
  namespaced: true,
  actions: {
    async fetchForSpace(_, { spaceId } = {}) {
      if (!spaceId) return []
      try {
        const res = await getSpaceConfigurations(spaceId)
        return unwrap(res)
      } catch (err) {
        if (err?.response?.status === 404) return []
        throw err
      }
    },
  },
}
