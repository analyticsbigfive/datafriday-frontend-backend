// src/lib/supabase.js
// Client Supabase pour l'authentification

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VUE_APP_SUPABASE_URL
const supabaseAnonKey = process.env.VUE_APP_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
})

// Dédup in-flight de supabase.auth.getSession() : plusieurs sites d'appel non
// coordonnés (intercepteur axios, auth/initialize, ensureAuthAndLoad) peuvent
// se déclencher en concurrence avant que la session ne soit hydratée (ex. les 4
// requêtes de la phase 1 d'Analyse parties en Promise.all) → chacun voyait
// accessToken===null et relançait indépendamment getSession(), doublant /me et
// le refresh de token. Une seule requête en vol est désormais partagée.
let _sessionPromise = null
export function getSessionOnce() {
  if (!_sessionPromise) {
    _sessionPromise = supabase.auth.getSession().finally(() => { _sessionPromise = null })
  }
  return _sessionPromise
}

/**
 * Lecture DIRECTE et synchrone de la session persistée dans le stockage.
 *
 * ⚠️ À utiliser à la place de `getSessionOnce()` dans tout code appelé depuis un
 * callback `onAuthStateChange`. Raison (régression constatée le 2026-07-18) :
 * `supabase.auth.signOut()` détient un verrou (`_acquireLock`, timeout 10 s) pendant
 * qu'il notifie ses abonnés, et il **attend** leurs callbacks (`await Promise.all`).
 * Un callback qui appelle `getSession()` tente d'acquérir le même verrou → il bloque
 * jusqu'au timeout, et bloque `signOut()` avec lui. Symptômes observés : déconnexion
 * qui ne redirige pas, écran figé ~10-30 s, session non purgée du stockage donc
 * toujours active dans les autres onglets.
 *
 * Cette lecture-ci ne prend aucun verrou et ne déclenche aucun refresh : c'est un
 * simple `localStorage.getItem` + `JSON.parse`.
 *
 * @returns {object|null} la session persistée, ou `null` si absente/illisible
 */
export function readPersistedSession() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    // `storageKey` est posée par GoTrueClient (`sb-<ref>-auth-token` par défaut).
    // On la lit sur l'instance plutôt que de la reconstruire, pour rester juste si
    // supabase-js change sa convention de nommage.
    const key = supabase.auth?.storageKey
      || Object.keys(window.localStorage).find((k) => /^sb-.*-auth-token$/.test(k))
    if (!key) return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // v2 sérialise la session à plat ; `currentSession` est la forme v1, tolérée.
    return parsed?.access_token ? parsed : (parsed?.currentSession ?? null)
  } catch (_) {
    return null
  }
}

export default supabase
