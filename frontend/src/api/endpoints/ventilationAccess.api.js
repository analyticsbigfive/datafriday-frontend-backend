// Accès PIN « Ventilation » des logisticiens, piloté depuis l'écran Logistique
// (backend VentilationAdminController, droit front.fb.logistic).
import api from '../client'

/** `{ slug, window: { id, eventId, status, pin, pinSetAt, openedAt, closedAt } | null }` */
export async function getVentilationAccess(spaceId, eventId) {
  const response = await api.get(`/ventilation-access/spaces/${spaceId}`, { params: { eventId } })
  return response.data
}

export async function startVentilationAccess(spaceId, eventId) {
  const response = await api.post('/ventilation-access/start', { spaceId, eventId })
  return response.data
}

export async function stopVentilationAccess(spaceId, eventId) {
  const response = await api.post('/ventilation-access/stop', { spaceId, eventId })
  return response.data
}

export async function resetVentilationPin(spaceId, eventId) {
  const response = await api.post('/ventilation-access/reset-pin', { spaceId, eventId })
  return response.data
}
