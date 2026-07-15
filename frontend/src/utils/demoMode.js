/**
 * Mode démo DÉSACTIVÉ (débranché).
 *
 * Les sections Analyse / EventPredict / Restock tournent désormais
 * exclusivement sur l'API réelle (lecture + écriture). Plus aucune donnée mock
 * n'est servie et il n'y a plus de fallback silencieux : une erreur d'API
 * remonte en vrai état d'erreur côté UI (loading / error / empty).
 *
 * `isDemoMode()` renvoie donc toujours `false` — toutes les branches mock qui
 * en dépendent sont neutralisées d'un coup. Les fichiers de données mock sont
 * conservés sur disque (non importés) mais ne sont plus jamais affichés.
 * `?demo=1` / `localStorage.analyse_demo` ne réactivent plus rien.
 */
export function isDemoMode() {
  return false
}

/** Active le mode démo et recharge la page avec ?demo=1. */
export function enableDemoMode() {
  try { localStorage.setItem('analyse_demo', '1') } catch (_) { /* noop */ }
  const url = new URL(window.location.href)
  url.searchParams.set('demo', '1')
  window.location.href = url.toString()
}

/** Désactive le mode démo et recharge sans le flag. */
export function disableDemoMode() {
  try { localStorage.removeItem('analyse_demo') } catch (_) { /* noop */ }
  const url = new URL(window.location.href)
  url.searchParams.set('demo', '0')
  window.location.href = url.toString()
}

/**
 * Désactive le mode démo SANS recharger la page (contrairement à
 * `disableDemoMode`). Utilisé quand l'utilisateur choisit explicitement un
 * VRAI espace (clic depuis la liste backend ou via le sélecteur d'espaces) :
 * un flag `analyse_demo` resté collé en localStorage forcerait sinon
 * `fetchSpaceData` à servir le mock (Adidas Arena) pour TOUT espace — l'URL
 * pointe vers le bon espace mais les données affichées sont les mauvaises.
 * On retire le flag uniquement s'il n'est pas explicitement demandé via `?demo=1`.
 * @returns {boolean} true si un flag persistant a été retiré.
 */
export function clearDemoMode() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === '1') return false // session démo explicite : on respecte
    if (window.localStorage?.getItem('analyse_demo') === '1') {
      window.localStorage.removeItem('analyse_demo')
      return true
    }
  } catch (_) {
    /* noop */
  }
  return false
}
