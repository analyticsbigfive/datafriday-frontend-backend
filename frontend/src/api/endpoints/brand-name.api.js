import { api } from '../client'

// BUG-169: accepte { page, limit } pour paginer côté serveur (le store boucle sur les
// pages pour reconstituer la liste complète — voir store/modules/factories/flatReferentialModule.js).
export async function getBrandNames({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/brand-names${qs ? '?' + qs : ''}`)
}

export async function createBrandName(payload) {
  return api.post('/brand-names', payload)
}

export async function updateBrandName(id, payload) {
  return api.patch(`/brand-names/${id}`, payload)
}

export async function deleteBrandName(id) {
  return api.delete(`/brand-names/${id}`)
}
