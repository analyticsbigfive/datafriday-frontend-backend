import { api } from '../client'

// BUG-169: accepte { page, limit } pour paginer côté serveur (le store boucle sur les
// pages pour reconstituer la liste complète — voir store/modules/factories/flatReferentialModule.js).
export async function getDisplayNames({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/display-names${qs ? '?' + qs : ''}`)
}

export async function createDisplayName(payload) {
  return api.post('/display-names', payload)
}

export async function updateDisplayName(id, payload) {
  return api.patch(`/display-names/${id}`, payload)
}

export async function deleteDisplayName(id) {
  return api.delete(`/display-names/${id}`)
}
