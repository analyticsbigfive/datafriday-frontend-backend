// API invité PIN — managers de PDV sans compte (cf. store/modules/guestPin.js)
import api from '../client'

/**
 * Résout le PDV depuis le lien scanné (slug + phase), SANS PIN — nom à afficher et
 * fenêtre active ou non, pour distinguer immédiatement "Accès inactif" de l'écran
 * de saisie plutôt que d'attendre une tentative de PIN.
 */
export async function getGuestContext(slug, phase) {
  const response = await api.get(`/guest-pin/context/${slug}/${phase}`)
  return response.data
}

/**
 * Tente une connexion invité par PIN pour LE PDV+phase identifiés par le lien
 * scanné. Ne lève jamais sur un PIN inconnu/fenêtre inactive — le backend répond
 * 200 avec un `state` discriminant ('ok' | 'inactive' | 'not_found' | 'locked')
 * pour piloter les maquettes. Un PIN valide mais pour un AUTRE PDV répond aussi
 * 'not_found' (jamais de redirection silencieuse vers le bon PDV).
 */
export async function loginWithPin(pin, deviceId, slug, phase) {
  const response = await api.post(
    `/guest-pin/login/${slug}/${phase}`,
    { pin },
    { headers: deviceId ? { 'X-Guest-Device-Id': deviceId } : {} },
  )
  return response.data
}

export async function getGuestSession() {
  const response = await api.get('/guest-pin/session')
  return response.data
}

/** "J'ai terminé" : gèle ce PDV (lecture seule), sans clôturer la fenêtre. */
export async function submitGuestCount() {
  const response = await api.post('/guest-pin/submit')
  return response.data
}

export async function getGuestInventory() {
  const response = await api.get('/guest-pin/inventory')
  return response.data
}

export async function getGuestBaseline() {
  const response = await api.get('/guest-pin/inventory/baseline')
  return response.data
}

export async function saveGuestCount(payload) {
  const response = await api.post('/guest-pin/inventory/counts', payload)
  return response.data
}
