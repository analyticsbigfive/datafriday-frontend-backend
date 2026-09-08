// API back-office directeur — fenêtres d'inventaire et accès PIN invité par PDV
import api from '../client'

export async function createOrReopenWindow({ spaceId, eventId, phase, showExpected }) {
  const response = await api.post('/inventory-windows', { spaceId, eventId, phase, showExpected })
  return response.data
}

export async function getStatusBoard(spaceId, eventId) {
  const response = await api.get(`/inventory-windows/${spaceId}/${eventId}`)
  return response.data
}

export async function setPin(windowId, elementId) {
  const response = await api.post(`/inventory-windows/${windowId}/pins`, { elementId })
  return response.data
}

export async function resetPin(accessId) {
  const response = await api.post(`/inventory-windows/pins/${accessId}/reset`)
  return response.data
}

export async function revokeAccess(accessId) {
  const response = await api.post(`/inventory-windows/pins/${accessId}/revoke`)
  return response.data
}

/** Verrouille l'écriture invité pour ce PDV — seule action qui le fait. */
export async function validateAccess(accessId) {
  const response = await api.post(`/inventory-windows/pins/${accessId}/validate`)
  return response.data
}

/** Réouvre l'écriture (efface "J'ai terminé"), même PIN, pas de régénération. */
export async function requestCorrection(accessId) {
  const response = await api.post(`/inventory-windows/pins/${accessId}/request-correction`)
  return response.data
}

export async function closeWindow(windowId) {
  const response = await api.post(`/inventory-windows/${windowId}/close`)
  return response.data
}
