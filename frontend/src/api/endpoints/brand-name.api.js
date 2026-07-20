import { api } from '../client'

// BUG-169: accepte { page, limit } pour paginer côté serveur (le store boucle sur les
// pages pour reconstituer la liste complète — voir store/modules/factories/flatReferentialModule.js).
// BUG-171: accepte aussi { search } pour la recherche côté serveur de l'écran Liste
// (FlatReferentialListView) — non utilisé par la boucle du store ci-dessus.
export async function getBrandNames({ page, limit, search } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
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
