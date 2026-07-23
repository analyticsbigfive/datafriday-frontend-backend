// src/router/guards.js
// Navigation guards pour la protection des routes

import store from '@/store'

/**
 * Guard pour les routes nécessitant une organisation
 */
export async function requireOrganization(to, from, next) {
  // NB : le bypass `?demo=1` / `localStorage.analyse_demo` qui court-circuitait
  // l'authentification ici a été retiré (BUG-027). Le mode démo est débranché depuis
  // que `utils/demoMode.js::isDemoMode()` retourne `false` en dur : le flag ne servait
  // donc plus aucune donnée mock, il n'accordait plus qu'un accès non authentifié à des
  // écrans qui, sans token, se faisaient de toute façon rejeter en 401 par l'API.
  // Ne pas le réintroduire sans rebrancher d'abord le mode démo lui-même.

  // Attendre que l'auth soit initialisée
  if (!store.getters['auth/isInitialized']) {
    await store.dispatch('auth/initialize')
  }
  
  const isAuthenticated = store.getters['auth/isAuthenticated']
  const hasOrganization = store.getters['auth/hasOrganization']
  
  if (!isAuthenticated) {
    return next({
      path: '/login',
      query: { redirect: to.fullPath }
    })
  }
  
  if (!hasOrganization) {
    return next('/onboarding')
  }
  
  next()
}

/**
 * Guard de la page d'onboarding (« Créer votre organisation »).
 *
 * Seul un utilisateur AUTHENTIFIÉ SANS organisation doit la voir (création du
 * 1er compte / owner). Un compte INVITÉ appartient déjà à une organisation : il
 * ne doit jamais voir cet écran → on le renvoie au dashboard. On revérifie au
 * besoin côté backend pour couvrir un état de store transitoirement vide
 * (échec réseau au login / à l'acceptation d'invitation).
 */
export async function onboardingGuard(to, from, next) {
  if (!store.getters['auth/isInitialized']) {
    await store.dispatch('auth/initialize')
  }

  if (!store.getters['auth/isAuthenticated']) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }

  // Chemin rapide : le store sait déjà qu'il a une organisation.
  if (store.getters['auth/hasOrganization']) {
    return next('/dashboard')
  }

  // Sinon, on confirme auprès du backend (source de vérité) avant d'afficher
  // l'onboarding — un invité a forcément une organisation.
  try {
    const status = await store.dispatch('auth/checkOnboardingStatus')
    if (status?.hasOrganization || store.getters['auth/hasOrganization']) {
      return next('/dashboard')
    }
  } catch (_) {
    // Statut indéterminable → on laisse l'onboarding (l'utilisateur n'a, à notre
    // connaissance, pas d'organisation).
  }

  next()
}

/**
 * Guard pour les routes publiques (login, signup)
 * Redirige vers dashboard si déjà connecté
 */
export async function guestOnly(to, from, next) {

  // Attendre que l'auth soit initialisée
  if (!store.getters['auth/isInitialized']) {
    await store.dispatch('auth/initialize')
  }
  
  const isAuthenticated = store.getters['auth/isAuthenticated']
  const hasOrganization = store.getters['auth/hasOrganization']
  
  if (isAuthenticated) {
    if (hasOrganization) {
      return next('/dashboard')
    } else {
      return next('/onboarding')
    }
  }
  
  next()
}

/**
 * Écrans front d'un espace, par ordre de préférence d'atterrissage.
 * Le 1er écran que le rôle de l'utilisateur autorise devient sa page d'accueil
 * quand il ouvre un espace (évite de bloquer un rôle qui n'a pas l'Analyse).
 * `code` peut être un tableau → l'écran est accessible si AU MOINS un code est accordé.
 */
export const SPACE_SCREENS = [
  { code: 'front.fb.analyse', name: 'space-analyse' },
  { code: 'front.fb.eventPredict', name: 'space-predict' },
  { code: 'front.fb.spaceInventory', name: 'space-inventory' },
  // Pre-event Inventory : même permission que le post-event, placé APRÈS lui
  // pour ne pas changer l'écran d'atterrissage des rôles existants.
  { code: 'front.fb.spaceInventory', name: 'space-pre-inventory' },
  { code: 'front.fb.logistic', name: 'space-logistic' },
  { code: ['front.fb.restock', 'front.fb.restockBoard'], name: 'space-restock' },
]

/**
 * Guard d'entrée d'un espace (`/spaces/:spaceId` = vue Analyse par défaut).
 * - Si l'utilisateur a accès à l'Analyse → rend la vue.
 * - Sinon → redirige vers le 1er écran de l'espace autorisé par son rôle.
 * - Si aucun écran d'espace n'est autorisé → retour à la liste des espaces.
 */
export async function spaceEntryGuard(to, from, next) {
  if (!store.getters['auth/isInitialized']) {
    await store.dispatch('auth/initialize')
  }
  if (!store.getters['auth/isAuthenticated']) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }

  const can = store.getters['auth/can']
  const allows = (code) => (Array.isArray(code) ? code.some(can) : can(code))

  if (allows('front.fb.analyse')) return next()

  const first = SPACE_SCREENS.find((s) => allows(s.code))
  if (first) {
    return next({ name: first.name, params: { spaceId: to.params.spaceId }, query: to.query })
  }
  return next('/spaces')
}
