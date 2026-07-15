import { api } from '../client'

export async function getRoles() {
  return api.get('/roles')
}

export async function createRole(payload) {
  return api.post('/roles', payload)
}

export async function updateRole(id, payload) {
  return api.patch(`/roles/${id}`, payload)
}

export async function deleteRole(id) {
  return api.delete(`/roles/${id}`)
}
