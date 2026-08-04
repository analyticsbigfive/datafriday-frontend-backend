// API Saisons — périodes personnalisées (custom ranges nommés, ex.
// « Saison 2025-2026 ») rattachées à un ou plusieurs espaces.
// Backend : module NestJS features/seasons/. Lecture ouverte à tout utilisateur
// authentifié (le picker de dates d'Analyse en dépend) ; création/édition
// gardées par `menu.config.manage`. Réponses liste : { data: [...] }.
import api from '../client'

export async function getSeasons() {
  try {
    const res = await api.get('/seasons')
    return res.data?.data ?? []
  } catch (error) {
    console.error('[SEASONS API] Error fetching seasons:', error)
    throw error
  }
}

export async function createSeason(payload) {
  try {
    const res = await api.post('/seasons', payload)
    return res.data
  } catch (error) {
    console.error('[SEASONS API] Error creating season:', error)
    throw error
  }
}

export async function updateSeason(id, payload) {
  try {
    const res = await api.patch(`/seasons/${id}`, payload)
    return res.data
  } catch (error) {
    console.error(`[SEASONS API] Error updating season ${id}:`, error)
    throw error
  }
}

export async function deleteSeason(id) {
  try {
    const res = await api.delete(`/seasons/${id}`)
    return res.data
  } catch (error) {
    console.error(`[SEASONS API] Error deleting season ${id}:`, error)
    throw error
  }
}
