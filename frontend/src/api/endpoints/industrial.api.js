import { api } from '../client'

// BUG-169: accepte { page, limit } pour paginer côté serveur (le store boucle sur les
// pages pour reconstituer la liste complète — voir store/modules/factories/flatReferentialModule.js).
export async function getIndustrials({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/industrials${qs ? '?' + qs : ''}`)
}

export async function createIndustrial(payload) {
  return api.post('/industrials', payload)
}

export async function updateIndustrial(id, payload) {
  return api.patch(`/industrials/${id}`, payload)
}

export async function deleteIndustrial(id) {
  return api.delete(`/industrials/${id}`)
}
