import { api } from '../client'

// Calqué sur display-name.api.js : GET paginé/recherché (le store boucle sur les pages via
// store/modules/factories/flatReferentialModule.js) + CRUD.
export async function getPromotionTypes({ page, limit, search } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
  const qs = params.toString()
  return api.get(`/promotion-types${qs ? '?' + qs : ''}`)
}

export async function createPromotionType(payload) {
  return api.post('/promotion-types', payload)
}

export async function updatePromotionType(id, payload) {
  return api.patch(`/promotion-types/${id}`, payload)
}

export async function deletePromotionType(id) {
  return api.delete(`/promotion-types/${id}`)
}
