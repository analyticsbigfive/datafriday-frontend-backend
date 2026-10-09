// Accès PIN « Ventilation » des logisticiens, piloté depuis l'écran Logistique
// (backend VentilationAdminController, droit front.fb.logistic) : un accès par
// combinaison de matchs ; arrêter / reprendre / nouveau PIN visent l'accès (windowId).
import api from '../client'

export async function startVentilationAccess(spaceId, windowId) {
  const response = await api.post('/ventilation-access/start', { spaceId, windowId })
  return response.data
}

export async function stopVentilationAccess(spaceId, windowId) {
  const response = await api.post('/ventilation-access/stop', { spaceId, windowId })
  return response.data
}

export async function resetVentilationPin(spaceId, windowId) {
  const response = await api.post('/ventilation-access/reset-pin', { spaceId, windowId })
  return response.data
}

/**
 * PIN de la combinaison de matchs : crée et ouvre son accès si besoin (PIN
 * prédéfini). La même combinaison retrouve toujours le même accès et le même PIN.
 * @returns `{ slug, window: { id, eventId, linkedEventIds, status, pin, pinSetAt, openedAt, closedAt } | null }`
 */
export async function ensureVentilationAccess(spaceId, eventIds) {
  const response = await api.post('/ventilation-access/ensure', { spaceId, eventIds })
  return response.data
}
