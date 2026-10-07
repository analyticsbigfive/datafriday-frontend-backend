// État d'accès par PIN d'une fenêtre d'inventaire et de ses PDV, tel que renvoyé par
// le tableau de statut (GET /inventory-windows/:spaceId/:eventId). Pur.
//
// Règle serveur (document Bertrand « Pre et Post event Inventory cycle », 2026-10-06) :
// la ligne d'accès d'un PDV fait foi quand elle existe ; sans ligne, le PDV suit la
// fenêtre (ouverte en masse ou arrêtée). Toute clôture de fenêtre révoque les lignes.

/** Le PDV est-il joignable par son QR code + PIN pour cette fenêtre ? */
export function isElementAccessOpen(window, elementId) {
  if (!window) return false
  const access = (window.accesses || []).find((a) => a.elementId === elementId)
  if (access) return access.status === 'active'
  return window.status === 'open'
}

/** Au moins un PDV est-il joignable (fenêtre ouverte ou PDV rouvert seul) ? */
export function isAnyAccessOpen(window) {
  if (!window) return false
  if (window.status === 'open') return true
  return (window.accesses || []).some((a) => a.status === 'active')
}

/** Tous les PDV sont-ils joignables (fenêtre ouverte, aucun PDV arrêté) ? */
export function isFullyOpen(window) {
  if (!window || window.status !== 'open') return false
  return (window.accesses || []).every((a) => a.status === 'active')
}

/**
 * Heure d'arrêt automatique d'un PDV à sa première vente (pre-event, Bertrand 2026-10-07),
 * ou null s'il est ouvert ou a été arrêté autrement (directeur, fin de phase).
 * @returns {Date|null}
 */
export function elementStoppedBySaleAt(window, elementId) {
  if (!window) return null
  const access = (window.accesses || []).find((a) => a.elementId === elementId)
  if (!access || access.status === 'active' || access.stopReason !== 'sale' || !access.revokedAt) return null
  const at = new Date(access.revokedAt)
  return Number.isNaN(at.getTime()) ? null : at
}
