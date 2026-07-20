import { api } from '../client'

// BUG-169: accepte { page, limit } pour paginer côté serveur (le store boucle sur les
// pages pour reconstituer la liste complète — voir store/modules/factories/flatReferentialModule.js).
// BUG-171: accepte aussi { search } pour la recherche côté serveur de l'écran Liste
// (FlatReferentialListView) — non utilisé par la boucle du store ci-dessus.
export async function getPackingTypes({ page, limit, search } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
  const qs = params.toString()
  return api.get(`/packing-types${qs ? '?' + qs : ''}`)
}

export async function createPackingType(payload) {
  return api.post('/packing-types', payload)
}

export async function updatePackingType(id, payload) {
  return api.patch(`/packing-types/${id}`, payload)
}

export async function deletePackingType(id) {
  return api.delete(`/packing-types/${id}`)
}
