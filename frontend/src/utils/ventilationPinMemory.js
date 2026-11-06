// src/utils/ventilationPinMemory.js
//
// PIN de ventilation gardé sur l'appareil, par lien (slug) : un logisticien qui a
// saisi son PIN une première fois n'a pas à le ressaisir en rechargeant la page
// (demande Bertrand 2026-11-06). Une clé par lien, valeur courte, tout sous try/catch
// (un localStorage plein ou bloqué ne doit jamais casser la connexion).
// La clé est effacée à la déconnexion explicite, et quand le serveur refuse le PIN
// (fenêtre close ou PIN changé).

const PREFIX = 'guestPin.ventilationPin.'

export function readVentilationPin(slug) {
  if (!slug) return null
  try {
    return localStorage.getItem(PREFIX + slug) || null
  } catch {
    return null
  }
}

export function writeVentilationPin(slug, pin) {
  if (!slug || !pin) return
  try {
    localStorage.setItem(PREFIX + slug, String(pin))
  } catch {
    /* stockage indisponible : le PIN sera redemandé */
  }
}

export function clearVentilationPin(slug) {
  if (!slug) return
  try {
    localStorage.removeItem(PREFIX + slug)
  } catch {
    /* rien à effacer */
  }
}
