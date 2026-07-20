import { api } from '../client'

// BUG-169: accepte { page, limit } pour paginer côté serveur (le store boucle sur les
// pages pour reconstituer la liste complète — voir store/modules/factories/flatReferentialModule.js).
// BUG-171: accepte aussi { search } pour la recherche côté serveur de l'écran Liste
// (FlatReferentialListView) — non utilisé par la boucle du store ci-dessus.
export async function getDisplayNames({ page, limit, search } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
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
