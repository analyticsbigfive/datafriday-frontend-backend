// src/utils/authSessionEvent.js
// Décision pure : que faire d'un événement `onAuthStateChange` de Supabase ?
//
// Contexte (BUG-149) : le handler d'origine ne regardait que `session` truthy/falsy et
// exécutait CLEAR_AUTH dès qu'elle était absente. Or Supabase émet aussi `SIGNED_OUT`
// avec une session nulle dans l'onglet qui PERD la course au renouvellement du refresh
// token (celui-ci est à usage unique) — alors que la session persistée, elle, vient
// d'être renouvelée et reste parfaitement valide. Résultat : déconnexion intempestive
// en pleine édition sur l'onglet perdant.
//
// La correction ne consiste PAS à ignorer les `SIGNED_OUT` relayés : la propagation
// d'une déconnexion volontaire entre onglets est un comportement voulu de Supabase et
// doit être préservée. Il faut distinguer les deux, d'où cette fonction.

/** Verdicts possibles. */
export const AUTH_EVENT_DECISION = {
  /** Une session est fournie : l'appliquer (connexion, refresh réussi, MAJ user). */
  APPLY: 'apply',
  /** Faux positif de rotation : la session persistée est encore valide, ne rien faire. */
  IGNORE: 'ignore',
  /** Vraie fin de session : purger l'état d'authentification. */
  CLEAR: 'clear',
}

/**
 * Une session persistée est-elle exploitable ?
 * Une session fraîchement renouvelée par l'onglet gagnant n'est jamais expirée — c'est
 * précisément ce qui la distingue d'un résidu de session morte.
 *
 * @param {object|null} storedSession - session lue depuis le stockage Supabase
 * @param {number} now - horodatage courant en ms (injectable pour les tests)
 * @returns {boolean}
 */
function isUsableSession(storedSession, now) {
  if (!storedSession?.access_token) return false
  // `expires_at` est en SECONDES epoch côté Supabase, pas en millisecondes.
  if (typeof storedSession.expires_at !== 'number') return true
  return storedSession.expires_at * 1000 > now
}

/**
 * Décide du sort d'un événement `onAuthStateChange`.
 *
 * L'ordre des tests est significatif : le drapeau de déconnexion explicite est évalué
 * AVANT la session persistée, pour couvrir la course entre l'émission de l'événement
 * et la purge effective du stockage par Supabase. Sans cet ordre, une déconnexion
 * volontaire pourrait lire l'ancienne session, la juger valide, et ne jamais déconnecter.
 *
 * @param {object} params
 * @param {string} params.event - type d'événement Supabase (`SIGNED_OUT`, `TOKEN_REFRESHED`…)
 * @param {object|null} params.session - session portée par l'événement
 * @param {object|null} params.storedSession - session relue depuis le stockage
 * @param {boolean} params.explicitlyLoggedOut - l'utilisateur s'est déconnecté depuis CET onglet
 * @param {number} [params.now] - horodatage courant en ms (injectable pour les tests)
 * @returns {'apply'|'ignore'|'clear'}
 */
export function resolveAuthStateChange({
  event,
  session,
  storedSession,
  explicitlyLoggedOut,
  now = Date.now(),
}) {
  // L'événement porte une session : aucune ambiguïté.
  if (session) return AUTH_EVENT_DECISION.APPLY

  // Déconnexion volontaire déclenchée depuis cet onglet. `signOut()` appelle
  // `clearAccessToken()` AVANT `supabase.auth.signOut()`, donc le drapeau est déjà levé
  // quand l'événement arrive. Prioritaire sur toute relecture de stockage.
  if (explicitlyLoggedOut) return AUTH_EVENT_DECISION.CLEAR

  // Seul `SIGNED_OUT` est concerné par l'artefact de rotation. Un autre événement sans
  // session (`INITIAL_SESSION` au démarrage sans session persistée) est un état vide
  // légitime, pas un faux positif.
  if (event !== 'SIGNED_OUT') return AUTH_EVENT_DECISION.CLEAR

  // Pas de déconnexion locale et une session persistée encore valide : c'est l'artefact
  // de rotation. L'appelant resynchronise son token depuis `storedSession`.
  if (isUsableSession(storedSession, now)) return AUTH_EVENT_DECISION.IGNORE

  // Déconnexion relayée d'un autre onglet (stockage vidé), session expirée, ou absence
  // de session au démarrage : dans tous les cas l'état d'auth doit être purgé.
  return AUTH_EVENT_DECISION.CLEAR
}
