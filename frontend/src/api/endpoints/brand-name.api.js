import { api } from '../client'

export async function getBrandNames() {
  return api.get('/brand-names')
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
