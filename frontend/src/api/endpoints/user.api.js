import { api } from '../client'

// GET /users est paginé côté serveur (20 par défaut, 100 au plus) : sans
// parcourir les pages, la liste s'arrêtait aux 20 utilisateurs les plus récents.
const USERS_PAGE_SIZE = 100

export async function getUsers() {
  const all = []
  let page = 1
  let totalPages = 1
  do {
    const res = await api.get('/users', { params: { page, limit: USERS_PAGE_SIZE } })
    const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []
    all.push(...rows)
    // Réponse non paginée (tableau brut) : une seule page.
    totalPages = Array.isArray(res) ? 1 : Number(res?.meta?.totalPages) || 1
    page += 1
  } while (page <= totalPages)
  return all
}

// Détail d'un utilisateur (inclut ses accès espaces `spaceAccess`).
export async function getUser(id) {
  return api.get(`/users/${id}`)
}

// Changement de rôle (endpoint dédié — protections backend : seul ADMIN peut promouvoir ADMIN, etc.)
export async function changeUserRole(id, payload) {
  return api.patch(`/users/${id}/role`, payload) 
}

export async function createUser(payload) {
  return api.post('/users', payload)
}

export async function createUsersBulk(users) {
  return Promise.all(users.map((u) => api.post('/users', u)))
}

// Invite a user by email (sends a Supabase invitation; the invitee activates
// their account on /accept-invite). Preferred way to add a teammate.
export async function inviteUser(payload) {
  return api.post('/users/invite', payload)
}

export async function inviteUsersBulk(users) {
  return Promise.all(users.map((u) => api.post('/users/invite', u)))
}

// Renvoie l'email d'invitation à un utilisateur "pending" (jamais connecté).
// Rôle et accès aux espaces préservés. 409 si déjà connecté / multi-organisation.
export async function reinviteUser(id) {
  return api.post(`/users/${id}/reinvite`)
}

export async function updateUser(id, payload) {
  return api.patch(`/users/${id}`, payload)
}

export async function deleteUser(id) {
  return api.delete(`/users/${id}`)
}
