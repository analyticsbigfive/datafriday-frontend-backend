// API invité PIN — managers de PDV sans compte (cf. store/modules/guestPin.js)
import api from '../client'

/**
 * Tente une connexion invité par PIN. Ne lève jamais sur un PIN inconnu/fenêtre
 * inactive/appareil verrouillé — le backend répond 200 avec un `state` discriminant
 * ('ok' | 'inactive' | 'device_bound' | 'locked') pour piloter les maquettes.
 */
export async function loginWithPin(pin, deviceId) {
  const response = await api.post(
    '/guest-pin/login',
    { pin },
    { headers: deviceId ? { 'X-Guest-Device-Id': deviceId } : {} },
  )
  return response.data
}

export async function getGuestSession() {
  const response = await api.get('/guest-pin/session')
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
