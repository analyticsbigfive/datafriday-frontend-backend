import { api } from '../client'

// BUG-169: accepte { page, limit } pour paginer côté serveur (le store boucle sur les
// pages pour reconstituer la liste complète — voir store/modules/factories/flatReferentialModule.js).
export async function getPackingTypes({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
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
