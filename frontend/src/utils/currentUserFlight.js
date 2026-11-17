/**
 * Partage de la lecture `/me` (profil + rôle + permissions) entre les appelants proches dans
 * le temps.
 *
 * Pourquoi : au démarrage, `checkOnboardingStatus` lit déjà `/me` quand l'utilisateur a une
 * organisation, puis `initialize` (ou `signIn`, ou le handler onAuthStateChange) relisait
 * `/me` une seconde fois, en série, quelques millisecondes plus tard. En production chaque
 * aller-retour coûte 0,15 à 0,3 s : la seconde lecture ne renvoyait rien de nouveau.
 *
 * Règles de sûreté (voir `recentFlight.js`, qui porte la mécanique) :
 *  - un résultat n'est réutilisé que pendant `ttlMs` (5 s) et pour LE MÊME utilisateur
 *    (la clé contient l'identifiant). Sans identifiant connu, rien n'est partagé ;
 *  - un échec n'est jamais gardé : l'appel suivant relance la lecture (c'est le « nouvel
 *    essai » que faisait la seconde lecture quand la première avait échoué) ;
 *  - `fresh: true` force une lecture neuve. À utiliser dès que le contexte vient de changer
 *    (organisation créée ou rejointe, profil modifié) : les données précédentes sont périmées ;
 *  - `clear()` oublie tout (déconnexion).
 *
 * `prefetch` fait partir la lecture plus tôt (en même temps que `/onboarding/status`, dont elle
 * ne dépend pas pour la requête) ; les commits dans le store restent faits par l'appelant qui
 * rejoint la lecture, donc dans le même ordre qu'avant (statut d'abord, profil ensuite).
 *
 * La fabrique ne connaît ni l'API ni le store : l'appelant lui passe la tâche réseau.
 *
 * @param {{ttlMs?: number, now?: () => number}} [options]
 */
import { createRecentFlight } from '@/utils/recentFlight'

export const CURRENT_USER_TTL_MS = 5000

export function createCurrentUserFlight({ ttlMs = CURRENT_USER_TTL_MS, now } = {}) {
  const flight = createRecentFlight({ ttlMs, ...(now ? { now } : {}) })

  /**
   * @template T
   * @param {string|null|undefined} userId identifiant de l'utilisateur courant
   * @param {() => Promise<T>|T} task lecture réseau, lancée seulement si rien n'est réutilisable
   * @param {{fresh?: boolean}} [opts]
   * @returns {Promise<T>}
   */
  function load(userId, task, { fresh = false } = {}) {
    // Identité inconnue : on ne devine pas, on lit directement sans rien partager.
    if (!userId) return Promise.resolve().then(task)
    return flight.run(`me:${userId}`, task, { fresh })
  }

  /**
   * Lance la lecture sans l'attendre : un `load` ultérieur (même utilisateur, moins de 5 s)
   * rejoint la lecture en vol ou reprend son résultat. Un échec est avalé ici (personne ne
   * l'attend) ; il sera vu, tel quel, par l'appelant qui rejoint la même promesse.
   * @param {string|null|undefined} userId
   * @param {() => Promise<any>|any} task
   */
  function prefetch(userId, task) {
    if (!userId) return
    load(userId, task).catch(() => {})
  }

  return {
    load,
    prefetch,
    clear: () => flight.clear(),
  }
}
