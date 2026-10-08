// src/utils/guestDeviceId.js
//
// Identifiant local de l'appareil d'un invité PIN (aléatoire, jamais lié à une
// personne). Envoyé au login (diagnostic « dernière connexion vue ») et à chaque
// appel de la feuille de ventilation : l'accès PIN d'un match est partagé par tous
// les logisticiens, c'est l'appareil qui distingue « mes dépôts » (annulation,
// décision #76).

const DEVICE_ID_STORAGE_KEY = 'datafriday:guestpin:deviceId'

// Repli mémoire : stockage indisponible (navigation privée stricte), l'identifiant
// reste stable le temps de l'onglet.
let memoryId = null

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (!id) {
      id = newId()
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, id)
    }
    return id
  } catch {
    if (!memoryId) memoryId = newId()
    return memoryId
  }
}

/** En-tête à joindre aux appels invités qui identifient l'appareil. */
export function guestDeviceHeaders() {
  const id = getOrCreateDeviceId()
  return id ? { 'X-Guest-Device-Id': id } : {}
}
