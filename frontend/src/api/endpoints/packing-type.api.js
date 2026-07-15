import { api } from '../client'

export async function getPackingTypes() {
  return api.get('/packing-types')
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
