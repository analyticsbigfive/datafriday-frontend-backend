// API Cuisines (Settings > Menu F&B > Cuisines) : même contrat que les fournisseurs.
import api from '../client'

export async function getKitchens({ page, limit } = {}) {
  try {
    const response = await api.get('/kitchens', { params: { page, limit } })
    return response.data
  } catch (error) {
    console.error('[KITCHENS API] Error fetching kitchens:', error)
    throw error
  }
}

export async function createKitchen(kitchen) {
  const response = await api.post('/kitchens', kitchen)
  return response.data
}

export async function updateKitchen(id, kitchen) {
  const response = await api.patch(`/kitchens/${id}`, kitchen)
  return response.data
}

export async function deleteKitchen(id) {
  const response = await api.delete(`/kitchens/${id}`)
  return response.data
}
