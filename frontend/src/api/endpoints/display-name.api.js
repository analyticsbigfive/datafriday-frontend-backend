import { api } from '../client'

export async function getDisplayNames() {
  return api.get('/display-names')
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
