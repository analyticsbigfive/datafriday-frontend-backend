// API Settings HR — Goals (CA par TPE) & Staff par Responsable de zone.
// Persistance backend (module NestJS features/hr-settings/), gardé par
// `menu.hr.manage`. Contrairement à hrApi.js (Suppliers/Positions = localStorage),
// c'est de la vraie BDD. Réponses liste : { data: [...] }.
import api from '../client'

// ── Goals (CA par TPE) ────────────────────────────────────────────────────────

export async function getHrGoals() {
  try {
    const res = await api.get('/hr-settings/goals')
    return res.data?.data ?? []
  } catch (error) {
    console.error('[HR-SETTINGS API] Error fetching goals:', error)
    throw error
  }
}

export async function createHrGoal(payload) {
  try {
    const res = await api.post('/hr-settings/goals', payload)
    return res.data
  } catch (error) {
    console.error('[HR-SETTINGS API] Error creating goal:', error)
    throw error
  }
}

export async function updateHrGoal(id, payload) {
  try {
    const res = await api.patch(`/hr-settings/goals/${id}`, payload)
    return res.data
  } catch (error) {
    console.error(`[HR-SETTINGS API] Error updating goal ${id}:`, error)
    throw error
  }
}

export async function deleteHrGoal(id) {
  try {
    const res = await api.delete(`/hr-settings/goals/${id}`)
    return res.data
  } catch (error) {
    console.error(`[HR-SETTINGS API] Error deleting goal ${id}:`, error)
    throw error
  }
}

// ── Staff par Responsable de zone ─────────────────────────────────────────────

export async function getHrStaffRatios() {
  try {
    const res = await api.get('/hr-settings/staff-ratios')
    return res.data?.data ?? []
  } catch (error) {
    console.error('[HR-SETTINGS API] Error fetching staff ratios:', error)
    throw error
  }
}

export async function createHrStaffRatio(payload) {
  try {
    const res = await api.post('/hr-settings/staff-ratios', payload)
    return res.data
  } catch (error) {
    console.error('[HR-SETTINGS API] Error creating staff ratio:', error)
    throw error
  }
}

export async function updateHrStaffRatio(id, payload) {
  try {
    const res = await api.patch(`/hr-settings/staff-ratios/${id}`, payload)
    return res.data
  } catch (error) {
    console.error(`[HR-SETTINGS API] Error updating staff ratio ${id}:`, error)
    throw error
  }
}

export async function deleteHrStaffRatio(id) {
  try {
    const res = await api.delete(`/hr-settings/staff-ratios/${id}`)
    return res.data
  } catch (error) {
    console.error(`[HR-SETTINGS API] Error deleting staff ratio ${id}:`, error)
    throw error
  }
}
