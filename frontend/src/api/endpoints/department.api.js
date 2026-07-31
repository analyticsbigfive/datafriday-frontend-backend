import { api } from '../client'

// GLOBAL — pas de scoping par tenant (cf. backend/src/features/departments). GET ouvert à tout
// utilisateur authentifié ; POST/PATCH/DELETE réservés au super-admin plateforme (403 sinon).
export async function getDepartments({ page, limit, search } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
  const qs = params.toString()
  return api.get(`/departments${qs ? '?' + qs : ''}`)
}

export async function createDepartment(payload) {
  return api.post('/departments', payload)
}

export async function updateDepartment(id, payload) {
  return api.patch(`/departments/${id}`, payload)
}

export async function deleteDepartment(id) {
  return api.delete(`/departments/${id}`)
}

export async function getSubtypes({ departmentId, page, limit, search } = {}) {
  const params = new URLSearchParams()
  if (departmentId) params.set('departmentId', departmentId)
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
  const qs = params.toString()
  return api.get(`/subtypes${qs ? '?' + qs : ''}`)
}

export async function createSubtype(payload) {
  return api.post('/subtypes', payload)
}

export async function updateSubtype(id, payload) {
  return api.patch(`/subtypes/${id}`, payload)
}

export async function deleteSubtype(id) {
  return api.delete(`/subtypes/${id}`)
}
