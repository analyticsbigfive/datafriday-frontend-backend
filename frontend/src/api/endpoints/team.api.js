// API functions for teams (équipes) — API NestJS (projet alsgd).
//
// Spéc backend attendue : docs/BACKEND_TEAMS_EVENTS.md.
// IMPORTANT : tant que le backend n'expose pas encore `/teams`, `getTeams`
// renvoie `[]` SILENCIEUSEMENT sur 404 (alsgd est vivant → 404 rapide ~0.4s,
// PAS le 500/522 de l'ancienne make-server uvxx morte). Dès que le contrôleur
// NestJS `/teams` est déployé, le catalogue se peuple automatiquement, sans
// changement frontend.
import api from '../client'

/**
 * Liste des équipes du tenant. Filtrage optionnel par compétition
 * (getFilteredTeams côté UI) via query params.
 * @param {{ eventCategoryId?: string, eventSubcategoryId?: string }} [params]
 * @returns {Promise<Array>} tableau d'équipes (jamais throw : [] en repli)
 */
export async function getTeams(params = {}) {
  try {
    const response = await api.get('/teams', { params })
    const data = response.data
    return Array.isArray(data) ? data : (data?.data ?? [])
  } catch (error) {
    // 404 = endpoint pas encore déployé → dégrade en [] sans bruit. Toute
    // autre erreur (500, timeout, 403…) est re-levée : les deux appelants
    // (EventFormDrawer.loadTeams, EventPredictView) l'attrapent déjà eux-mêmes
    // et retombent sur [] — mais un vrai échec ne doit pas se déguiser en
    // "aucune équipe" (BUG-140).
    if (error?.response?.status === 404) return []
    throw error
  }
}

/**
 * Crée une équipe (scopée à une compétition si fournie).
 * @param {{ name: string, eventCategoryId?: string, eventSubcategoryId?: string }} team
 */
export async function createTeam(team) {
  const response = await api.post('/teams', team)
  return response.data ?? response
}

export async function updateTeam(id, patch) {
  const response = await api.patch(`/teams/${id}`, patch)
  return response.data ?? response
}

export async function deleteTeam(id) {
  const response = await api.delete(`/teams/${id}`)
  return response.data ?? response
}
