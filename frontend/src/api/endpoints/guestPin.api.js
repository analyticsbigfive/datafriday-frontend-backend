// API invité PIN — managers de PDV sans compte (cf. store/modules/guestPin.js)
import api from '../client'

/**
 * Résout le PDV depuis le lien scanné (UN SEUL lien par PDV, pas de phase dans
 * l'URL), SANS PIN — nom à afficher et fenêtre active ou non (pré OU post, peu
 * importe laquelle), pour distinguer immédiatement "Accès inactif" de l'écran de
 * saisie plutôt que d'attendre une tentative de PIN.
 */
export async function getGuestContext(slug) {
  const response = await api.get(`/guest-pin/context/${slug}`)
  return response.data
}

/**
 * Tente une connexion invité par PIN pour LE PDV identifié par le lien scanné — la
 * phase (pré/post) se déduit de la fenêtre à laquelle ce PIN appartient, pas de
 * l'URL. Ne lève jamais sur un PIN inconnu/fenêtre inactive — le backend répond
 * 200 avec un `state` discriminant ('ok' | 'inactive' | 'not_found' | 'locked')
 * pour piloter les maquettes. Un PIN valide mais pour un AUTRE PDV répond aussi
 * 'not_found' (jamais de redirection silencieuse vers le bon PDV).
 */
export async function loginWithPin(pin, deviceId, slug) {
  const response = await api.post(
    `/guest-pin/login/${slug}`,
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

/**
 * Catalogue brut du PDV (mêmes données que le staff : menu items + composants +
 * market prices) — l'explosion combo/BOM se fait côté client via
 * `buildConsolidatedInventory` (même fonction que l'écran staff), pas ici.
 */
export async function getGuestCatalog() {
  const response = await api.get('/guest-pin/catalog')
  return response.data
}

/** Comptages déjà sauvegardés pour le PDV de l'invité, keyés par itemId. */
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
