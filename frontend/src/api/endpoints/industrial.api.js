import { api } from '../client'

export async function getIndustrials() {
  return api.get('/industrials')
}

export async function createIndustrial(payload) {
  return api.post('/industrials', payload)
}

export async function updateIndustrial(id, payload) {
  return api.patch(`/industrials/${id}`, payload)
}

export async function deleteIndustrial(id) {
  return api.delete(`/industrials/${id}`)
}
