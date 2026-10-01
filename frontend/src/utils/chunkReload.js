import { defineAsyncComponent } from 'vue'
import { isNavigationFailure } from 'vue-router'

/**
 * Rattrapage des chunks obsolètes après un redéploiement (BUG-389-02).
 *
 * Après un déploiement, les noms hachés des chunks changent. Un onglet ouvert
 * avant le déploiement demande les anciens fichiers ; Vercel répond 200 +
 * index.html, et webpack rejette l'import avec une `ChunkLoadError`. On recharge
 * alors la page une seule fois pour récupérer le nouveau build.
 *
 * Le verrou `sessionStorage` est partagé entre `router.onError` et les composants
 * asynchrones (overlay Event Predict), pour éviter toute boucle de rechargement.
 */

export const CHUNK_RELOAD_FLAG = 'chunk_reload_attempted'

const CHUNK_MESSAGE_PATTERNS = [
  /Loading (CSS )?chunk .* failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
]

/**
 * Vrai si l'erreur vient d'un chunk JS ou CSS introuvable.
 * Couvre webpack (`ChunkLoadError`), mini-css-extract-plugin
 * (`CSS_CHUNK_LOAD_FAILED`) et les messages d'import dynamique natifs.
 */
export function isChunkLoadError(err) {
  if (!err) return false
  if (err.name === 'ChunkLoadError') return true
  if (err.code === 'CSS_CHUNK_LOAD_FAILED') return true
  const message = typeof err.message === 'string' ? err.message : ''
  return CHUNK_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
}

function readFlag() {
  try {
    return window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)
  } catch (_) {
    return null
  }
}

function writeFlag() {
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
    return true
  } catch (_) {
    return false
  }
}

/**
 * Recharge la page une seule fois par verrou. Sans `targetUrl`, recharge l'URL
 * courante. Retourne `true` si un rechargement a été déclenché.
 * Si le `sessionStorage` est inaccessible, on ne recharge pas : sans verrou,
 * le risque de boucle l'emporte.
 */
export function reloadOnceForChunkError(targetUrl) {
  if (readFlag()) return false
  if (!writeFlag()) return false
  if (targetUrl) {
    window.location.href = targetUrl
  } else {
    window.location.reload()
  }
  return true
}

/** Lève le verrou (après une navigation réussie). */
export function clearChunkReloadFlag() {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
  } catch (_) {
    /* sessionStorage indisponible : rien à lever */
  }
}

/**
 * Gestionnaire `onError` de `defineAsyncComponent` : sur un chunk obsolète,
 * rechargement unique vers l'URL courante (qui porte déjà `?toolbox=...`).
 * Sinon, ou si le rechargement a déjà été tenté, l'erreur est remontée.
 */
export function handleAsyncComponentError(err, retry, fail) {
  if (isChunkLoadError(err)) {
    const current = window.location.pathname + window.location.search + window.location.hash
    if (reloadOnceForChunkError(current || undefined)) return
  }
  fail()
}

/**
 * `defineAsyncComponent` avec rattrapage des chunks obsolètes.
 * Usage : `const View = asyncComponentWithChunkReload(() => import('./View.vue'))`.
 */
export function asyncComponentWithChunkReload(loader) {
  return defineAsyncComponent({ loader, onError: handleAsyncComponentError })
}

/**
 * Navigation sans promesse rejetée silencieuse. Les échecs de navigation
 * (redirigée, annulée, dupliquée) sont ignorés ; les chunks obsolètes des routes
 * sont déjà rattrapés par `router.onError`. Le reste est journalisé.
 * `method` : 'push' (défaut) ou 'replace'.
 */
export function safePush(router, location, method = 'push') {
  if (!router || typeof router[method] !== 'function') return Promise.resolve()
  let result
  try {
    result = router[method](location)
  } catch (err) {
    console.error('[navigation] échec de navigation', err)
    return Promise.resolve()
  }
  return Promise.resolve(result).catch((err) => {
    if (isNavigationFailure(err) || isChunkLoadError(err)) return
    console.error('[navigation] échec de navigation', err)
  })
}
