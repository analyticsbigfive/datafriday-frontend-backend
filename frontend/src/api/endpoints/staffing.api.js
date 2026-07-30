// API Staffing — lignes de staff par événement × PDV (module NestJS
// features/staffing/), gardé par `menu.hr.manage`.
// GET renvoie { eventId, settings, schedule, elements: [{ elementId, lines,
// predictedCost, adjustedCost }], totals, warnings } (§5 : prédit figé /
// ajusté vivant).
import api from '../client'

export async function getEventStaffing(eventId) {
  try {
    const res = await api.get(`/events/${eventId}/staffing`)
    return res.data
  } catch (error) {
    console.error(`[STAFFING API] Error fetching staffing for event ${eventId}:`, error)
    throw error
  }
}

export async function generateEventStaffing(eventId) {
  try {
    const res = await api.post(`/events/${eventId}/staffing/generate`)
    return res.data
  } catch (error) {
    console.error(`[STAFFING API] Error generating staffing for event ${eventId}:`, error)
    throw error
  }
}

export async function patchStaffLine(lineId, payload) {
  try {
    const res = await api.patch(`/staffing/lines/${lineId}`, payload)
    return res.data
  } catch (error) {
    console.error(`[STAFFING API] Error patching staff line ${lineId}:`, error)
    throw error
  }
}

export async function addStaffLine(eventId, payload) {
  try {
    const res = await api.post(`/events/${eventId}/staffing/lines`, payload)
    return res.data
  } catch (error) {
    console.error(`[STAFFING API] Error adding staff line for event ${eventId}:`, error)
    throw error
  }
}

export async function deleteStaffLine(lineId) {
  try {
    const res = await api.delete(`/staffing/lines/${lineId}`)
    return res.data
  } catch (error) {
    console.error(`[STAFFING API] Error deleting staff line ${lineId}:`, error)
    throw error
  }
}
