import { api } from '../client'

// Même contrat pagination/recherche que packing-type.api.js.
export async function getStorageTypes({ page, limit, search } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
  const qs = params.toString()
  return api.get(`/storage-types${qs ? '?' + qs : ''}`)
}

export async function createStorageType(payload) {
  return api.post('/storage-types', payload)
}

export async function updateStorageType(id, payload) {
  return api.patch(`/storage-types/${id}`, payload)
}

export async function deleteStorageType(id) {
  return api.delete(`/storage-types/${id}`)
}
