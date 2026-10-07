// src/utils/guestPinLanding.js
//
// Page d'atterrissage d'un responsable PDV dont l'accès PIN est coupé (inventaire
// arrêté, changement de phase, session expirée). Retour Bertrand 2026-10-07 : il
// était renvoyé sur la connexion staff, car `/login/pin` sans slug ne correspond à
// aucune route (catch-all → /dashboard → /login). Le slug du dernier QR scanné est
// gardé en localStorage, séparément de la session (purgée à la révocation), pour
// revenir sur la page de CE PDV, qui attend la reprise.

const LAST_SLUG_KEY = 'guestPin.lastSlug'

export function rememberGuestSlug(slug) {
  if (!slug) return
  try {
    localStorage.setItem(LAST_SLUG_KEY, String(slug))
  } catch {
    /* stockage indisponible : la page d'attente proposera de rescanner */
  }
}

export function lastGuestSlug() {
  try {
    return localStorage.getItem(LAST_SLUG_KEY) || null
  } catch {
    return null
  }
}

/** Route de la page d'attente : celle du dernier PDV scanné, sinon la page générique. */
export function guestPinLandingRoute(slug = lastGuestSlug()) {
  return slug ? { name: 'login-pin', params: { slug } } : { name: 'login-pin' }
}

/**
 * Slug d'un lien de connexion invité scanné (`https://…/login/pin/<slug>`), ou null si
 * le QR code n'en est pas un. Seul le chemin compte : le QR peut pointer vers un autre
 * domaine de l'appli (preview, staging) sans changer de PDV.
 */
export function slugFromGuestPinUrl(text) {
  if (!text) return null
  let path
  try {
    path = new URL(String(text).trim()).pathname
  } catch {
    return null
  }
  const match = path.match(/\/login\/pin\/([^/?#]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : null
}
