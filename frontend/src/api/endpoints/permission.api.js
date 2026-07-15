import { api } from '../client'

export async function getPermissions() {
  return api.get('/permissions')
}

export async function createPermission(payload) {
  return api.post('/permissions', payload)
}

export async function updatePermission(id, payload) {
  return api.patch(`/permissions/${id}`, payload)
}

export async function deletePermission(id) {
  return api.delete(`/permissions/${id}`)
}
