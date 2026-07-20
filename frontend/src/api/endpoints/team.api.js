// API functions for teams (équipes) — API NestJS.
//
// `TeamsController` (GET/POST/PATCH/DELETE `/teams`) est déployé et
// fonctionnel côté backend depuis la migration hors make-server. `getTeams`
// dégrade en `[]` sur 404 par prudence (repli inoffensif), pas parce que
// l'endpoint serait absent.
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
