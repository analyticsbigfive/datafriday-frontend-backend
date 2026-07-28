// src/store/modules/auth.js
// Module Vuex pour l'authentification

import { supabase, getSessionOnce, readPersistedSession } from '@/lib/supabase'
import api from '@/lib/api'
import { setAccessToken, clearAccessToken, isExplicitlyLoggedOut } from '@/api/client'
import { resolveAuthStateChange, AUTH_EVENT_DECISION } from '@/utils/authSessionEvent'

// In-flight promise to deduplicate concurrent checkOnboardingStatus calls
let checkOnboardingStatusPromise = null
// In-flight promise to deduplicate concurrent fetchCurrentUser calls
let fetchCurrentUserPromise = null
// Souscription à onAuthStateChange. Conservée pour pouvoir la libérer : `initialize`
// est dispatché par le beforeEach global ET par AuthCallbackView, et un premier appel
// qui échoue avant SET_INITIALIZED laisserait sinon deux listeners empilés — donc deux
// CLEAR_AUTH sur le même événement.
let authSubscription = null

const state = {
  userId: null,         // ID utilisateur uniquement
  token: null,          // JWT token uniquement
  refreshToken: null,   // Refresh token
  email: null,          // Email de l'utilisateur
  firstName: null,      // Prénom
  lastName: null,       // Nom
  fullName: null,       // Nom complet (si fourni par le backend)
  phone: null,          // Téléphone
  avatar: null,         // URL avatar
  tenantId: null,       // ID organisation uniquement
  tenantName: null,     // Nom de l'organisation (affichage UI)
  userRole: null,       // Nom du rôle affiché (ex. "Manager Salle")
  roleId: null,         // ID du rôle dynamique (RBAC)
  roleSystemKey: null,  // 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER'
  userPermissions: [],  // Codes de permission du rôle courant
  isOwner: false,       // Owner du tenant
  isSuperAdmin: false,  // Super-admin PLATEFORME (cross-tenant)
  loading: false,       // État de chargement
  error: null,          // Dernière erreur
  initialized: false    // App initialisée
}

const getters = {
  isAuthenticated: (state) => !!state.token,
  token: (state) => state.token,
  hasOrganization: (state) => !!state.tenantId,
  userId: (state) => state.userId,
  tenantId: (state) => state.tenantId,
  tenantName: (state) => state.tenantName,
  isLoading: (state) => state.loading,
  authError: (state) => state.error,
  isInitialized: (state) => state.initialized,
  userRole: (state) => state.userRole,
  roleId: (state) => state.roleId,
  roleSystemKey: (state) => state.roleSystemKey,
  userPermissions: (state) => state.userPermissions,
  isOwner: (state) => state.isOwner,
  isSuperAdmin: (state) => state.isSuperAdmin,
  isAdmin: (state) => state.roleSystemKey === 'ADMIN',
  // Gating UI fin, cohérent avec @RequirePermissions côté backend.
  // ADMIN bypass : possède toujours toutes les permissions.
  // `code` falsy (ex. item de menu `permission: null`) => toujours visible
  // (aligné avec le composable usePermissions).
  can: (state) => (code) =>
    !code || state.roleSystemKey === 'ADMIN' || state.userPermissions.includes(code),
  // Alias utilisés par DashboardView / UserMenu (identité réelle de l'utilisateur)
  currentUser: (state) => (state.userId ? {
    id: state.userId,
    email: state.email,
    firstName: state.firstName,
    lastName: state.lastName,
    fullName: state.fullName,
    phone: state.phone,
    avatar: state.avatar,
    role: {
      id: state.roleId,
      name: state.userRole,
      systemKey: state.roleSystemKey,
      permissions: state.userPermissions,
    },
  } : null),
  currentTenant: (state) => (state.tenantId ? { id: state.tenantId, name: state.tenantName } : null)
}

const mutations = {
  SET_AUTH(state, { userId, token, refreshToken }) {
    state.userId = userId
    state.token = token
    state.refreshToken = refreshToken
    setAccessToken(token)
  },
  SET_TENANT(state, { tenantId, role, tenantName, roleId, roleSystemKey, userPermissions, isOwner }) {
    state.tenantId = tenantId
    state.userRole = role
    state.roleId = roleId ?? null
    // Fallback : si le backend ne renvoie pas encore systemKey, on retombe sur le rôle legacy (string)
    state.roleSystemKey = roleSystemKey ?? role
    state.userPermissions = userPermissions ?? []
    state.isOwner = !!isOwner
    if (tenantName !== undefined) state.tenantName = tenantName
  },
  SET_SUPER_ADMIN(state, value) {
    state.isSuperAdmin = !!value
  },
  // Identité de l'utilisateur (affichée dans le menu / le profil). Ne touche
  // qu'aux clés fournies (merge partiel).
  SET_PROFILE(state, { email, firstName, lastName, fullName, phone, avatar }) {
    if (email !== undefined) state.email = email
    if (firstName !== undefined) state.firstName = firstName
    if (lastName !== undefined) state.lastName = lastName
    if (fullName !== undefined) state.fullName = fullName
    if (phone !== undefined) state.phone = phone
    if (avatar !== undefined) state.avatar = avatar
  },
  SET_LOADING(state, loading) {
    state.loading = loading
  },
  SET_ERROR(state, error) {
    state.error = error
  },
  SET_INITIALIZED(state, initialized) {
    state.initialized = initialized
  },
  CLEAR_AUTH(state) {
    state.userId = null
    state.token = null
    state.refreshToken = null
    state.email = null
    state.firstName = null
    state.lastName = null
    state.fullName = null
    state.phone = null
    state.avatar = null
    state.tenantId = null
    state.tenantName = null
    state.userRole = null
    state.roleId = null
    state.roleSystemKey = null
    state.userPermissions = []
    state.isOwner = false
    state.isSuperAdmin = false
    state.error = null
    clearAccessToken()
  }
}

const actions = {
  // 1. Inscription avec email/password
  async signUp({ commit }, { email, password }) {
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
      
      if (error) {
        // Traduire les erreurs en français
        let errorMessage = error.message
        if (error.message.includes('already registered')) {
          errorMessage = 'Cet email est déjà utilisé'
        } else if (error.message.includes('password')) {
          errorMessage = 'Le mot de passe doit contenir au moins 6 caractères'
        } else if (error.message.includes('invalid email')) {
          errorMessage = 'Format d\'email invalide'
        }
        throw new Error(errorMessage)
      }
      
      return { success: true, data }
    } catch (error) {
      const errorMessage = error.message || 'Une erreur est survenue lors de l\'inscription'
      commit('SET_ERROR', errorMessage)
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 2. Connexion avec email/password
  async signIn({ commit, dispatch }, { email, password }) {
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) {
        console.error('❌ [AUTH] Erreur:', error.message)
        // Traduire les erreurs Supabase en français
        let errorMessage = error.message
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Email ou mot de passe incorrect'
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Veuillez confirmer votre email avant de vous connecter'
        } else if (error.message.includes('User not found')) {
          errorMessage = 'Aucun compte trouvé avec cet email'
        }
        throw new Error(errorMessage)
      }
      
      commit('SET_AUTH', {
        userId: data.user.id,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token
      })
      // Email disponible immédiatement (le reste du profil arrive via /me).
      commit('SET_PROFILE', { email: data.user.email })
      // Synchroniser le token dans le client Axios (API Render)
      setAccessToken(data.session.access_token)

      // Vérifier le statut d'onboarding après connexion
      const status = await dispatch('checkOnboardingStatus')

      // Charger le profil complet (rôle + permissions) si l'utilisateur a une orga
      if (status?.hasOrganization) {
        await dispatch('fetchCurrentUser').catch(() => {})
      }

      return { success: true, data }
    } catch (error) {
      const errorMessage = error.message || 'Une erreur est survenue lors de la connexion'
      console.error('❌ [AUTH] Échec de connexion:', errorMessage)
      commit('SET_ERROR', errorMessage)
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 3. Connexion avec Google OAuth
  async signInWithGoogle({ commit }) {
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)
    
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: 'select_account',
          },
        }
      })
      
      if (error) {
        throw new Error('Erreur lors de la connexion avec Google')
      }
      return { success: true, data }
    } catch (error) {
      const errorMessage = error.message || 'Une erreur est survenue avec Google'
      commit('SET_ERROR', errorMessage)
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 4. Déconnexion
  async signOut({ commit }) {
    commit('SET_LOADING', true)
    // Invalider le token axios immédiatement — avant même la réponse Supabase —
    // pour que l'intercepteur ne refetche pas la session après signOut().
    clearAccessToken()
    try {
      await supabase.auth.signOut()
      commit('CLEAR_AUTH')
      return { success: true }
    } catch (error) {
      console.error('Sign out error:', error)
      commit('CLEAR_AUTH')
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 5. Vérifier le statut d'onboarding (utilisateur existant dans DataFriday?)
  async checkOnboardingStatus({ commit, dispatch, getters }) {
    if (!getters.token) {
      return { exists: false, hasOrganization: false }
    }
    // Dédupliquer les appels concurrents : si une requête est déjà en cours, on attend son résultat
    if (checkOnboardingStatusPromise) {
      return checkOnboardingStatusPromise
    }

    checkOnboardingStatusPromise = (async () => {
      try {
        const response = await api.get('/onboarding/status')

        if (response.data.user && response.data.tenant) {
          // Passe les permissions/rôle dès l'onboarding (et pas seulement via le
          // fetchCurrentUser suivant) : sinon userPermissions reste [] et le getter
          // `can` bloque toute la gestion utilisateurs jusqu'au fetch. Gère le rôle
          // sous forme objet { id, name, systemKey, permissions } ou string legacy.
          const u = response.data.user
          const role = u.role
          const isRoleObj = role && typeof role === 'object'
          commit('SET_TENANT', {
            tenantId: response.data.tenant.id,
            tenantName: response.data.tenant.name,
            role: isRoleObj ? role.name : role,
            roleId: isRoleObj ? role.id : undefined,
            roleSystemKey: isRoleObj ? role.systemKey : undefined,
            userPermissions: isRoleObj ? role.permissions : (u.permissions || undefined),
            isOwner: u.isOwner ?? response.data.isOwner,
          })
          // Enrichir avec le rôle dynamique (RBAC) et les permissions — non bloquant
          try {
            await dispatch('fetchCurrentUser')
          } catch (e) {
            console.warn('[checkOnboardingStatus] fetchCurrentUser failed:', e?.message)
          }
        }

        return {
          exists: response.data.exists,
          hasOrganization: response.data.hasOrganization
        }
      } catch (error) {
        // Si 401/404 : l'utilisateur n'existe pas encore dans DataFriday
        // Si timeout / réseau indisponible : silencieux (dev sans backend)
        if (
          error.response?.status === 401 ||
          error.response?.status === 404 ||
          error.code === 'ECONNABORTED' ||
          error.message?.includes('timeout')
        ) {
          return { exists: false, hasOrganization: false }
        }
        // 5xx ou erreurs réseau inattendues : logguer sans crasher l'UI
        // Ne jamais logguer `error` en entier : error.config.headers.Authorization contient le JWT (BUG-150)
        console.error('[checkOnboardingStatus]', error.response?.status ?? error.message)
        return { exists: false, hasOrganization: false }
      } finally {
        checkOnboardingStatusPromise = null
      }
    })()

    return checkOnboardingStatusPromise
  },

  // 6. Créer une organisation (onboarding)
  async createOrganization(
    { commit, dispatch },
    { firstName, lastName, organizationName, organizationType, organizationEmail, organizationPhone },
  ) {
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)
    
    try {
      const response = await api.post('/onboarding', {
        firstName,
        lastName,
        organizationName,
        organizationType,
        organizationEmail,
        organizationPhone,
      })

      console.log('createOrganization response:', response.status)

      {
        const u = response.data.user
        const role = u.role
        const isRoleObj = role && typeof role === 'object'
        commit('SET_TENANT', {
          tenantId: response.data.tenant.id,
          tenantName: response.data.tenant.name,
          role: isRoleObj ? role.name : role,
          roleId: isRoleObj ? role.id : undefined,
          roleSystemKey: isRoleObj ? role.systemKey : undefined,
          userPermissions: isRoleObj ? role.permissions : (u.permissions || undefined),
          isOwner: u.isOwner ?? response.data.isOwner,
        })
      }

      // Forcer le rafraîchissement de la session Supabase pour que le JWT
      // contienne désormais le tenant_id (custom_access_token_hook). Sans ça,
      // l'appel suivant (ex: GET /spaces) repart avec l'ancien token et reçoit 401.
      try {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
        if (!refreshError && refreshed?.session) {
          const newToken = refreshed.session.access_token
          commit('SET_AUTH', {
            userId: refreshed.session.user?.id ?? state.userId,
            token: newToken,
            refreshToken: refreshed.session.refresh_token
          })
          setAccessToken(newToken)
        }
      } catch (refreshErr) {
        console.warn('Refresh session after onboarding failed:', refreshErr)
      }

      // Enrichir avec le rôle dynamique (RBAC) et les permissions — non bloquant
      try {
        await dispatch('fetchCurrentUser')
      } catch (e) {
        console.warn('[createOrganization] fetchCurrentUser failed:', e?.message)
      }

      return { success: true, data: response.data }
    } catch (error) {
      console.log('createOrganization error:', error.response?.status ?? error.message)
      let message = error.response?.data?.message || error.message
      if (error.code === 'ECONNABORTED' || /timeout/i.test(String(error.message))) {
        message = 'Le serveur met trop de temps à répondre. Vérifiez votre connexion et réessayez.'
      }
      commit('SET_ERROR', message)
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 7. Rejoindre une organisation avec code d'invitation
  async joinOrganization({ commit, dispatch }, { invitationCode, firstName, lastName }) {
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)
    
    try {
      const response = await api.post('/onboarding/join-by-code', {
        invitationCode,
        firstName,
        lastName
      })
      
      {
        const u = response.data.user
        const role = u.role
        const isRoleObj = role && typeof role === 'object'
        commit('SET_TENANT', {
          tenantId: response.data.tenant.id,
          tenantName: response.data.tenant.name,
          role: isRoleObj ? role.name : role,
          roleId: isRoleObj ? role.id : undefined,
          roleSystemKey: isRoleObj ? role.systemKey : undefined,
          userPermissions: isRoleObj ? role.permissions : (u.permissions || undefined),
          isOwner: u.isOwner ?? response.data.isOwner,
        })
      }

      // Rafraîchit le JWT pour que tenant_id soit inclus dans le token
      // (même logique que createOrganization — sinon les appels suivants
      // partent avec l'ancien token sans tenant_id et reçoivent 401).
      try {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
        if (!refreshError && refreshed?.session) {
          const newToken = refreshed.session.access_token
          commit('SET_AUTH', {
            userId: refreshed.session.user?.id,
            token: newToken,
            refreshToken: refreshed.session.refresh_token,
          })
          setAccessToken(newToken)
        }
      } catch (refreshErr) {
        console.warn('Refresh session after joinOrganization failed:', refreshErr)
      }

      // Enrichir avec le rôle dynamique (RBAC) et les permissions — non bloquant
      try {
        await dispatch('fetchCurrentUser')
      } catch (e) {
        console.warn('[joinOrganization] fetchCurrentUser failed:', e?.message)
      }

      return { success: true, data: response.data }
    } catch (error) {
      let message = error.response?.data?.message || error.message
      if (error.code === 'ECONNABORTED' || /timeout/i.test(String(error.message))) {
        message = 'Le serveur met trop de temps à répondre. Vérifiez votre connexion et réessayez.'
      }
      commit('SET_ERROR', message)
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 8. Récupérer le profil utilisateur courant (rôle + permissions RBAC)
  async fetchCurrentUser({ commit, getters }) {
    if (!getters.token) return null
    // Dédupliquer les appels concurrents (ex: onAuthStateChange + un appel explicite
    // depuis une vue se chevauchant) : même principe que checkOnboardingStatus.
    if (fetchCurrentUserPromise) {
      return fetchCurrentUserPromise
    }

    fetchCurrentUserPromise = (async () => {
      try {
        const response = await api.get('/me')
        const data = response.data

        // Identité réelle (menu utilisateur / profil) — toujours disponible même
        // sans organisation (surface post-login / pré-onboarding).
        commit('SET_PROFILE', {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          fullName: data.fullName,
          phone: data.phone,
          avatar: data.avatar,
        })

        // /me renvoie `role` sous forme d'objet { id, name, systemKey, permissions }
        // (résolu via JWT-DB côté backend), ou une string legacy.
        if (data.tenant) {
          const role = data.role
          const isRoleObject = role && typeof role === 'object'
          commit('SET_TENANT', {
            tenantId: data.tenant.id,
            tenantName: data.tenant.name,
            role: isRoleObject ? role.name : role,
            roleId: isRoleObject ? role.id : undefined,
            roleSystemKey: isRoleObject ? role.systemKey : undefined,
            userPermissions: isRoleObject ? role.permissions : undefined,
            isOwner: data.isOwner,
          })
        }
        // Super-admin PLATEFORME (cross-tenant) — distinct de isOwner (owner du tenant).
        commit('SET_SUPER_ADMIN', data.isSuperAdmin)

        return data
      } catch (error) {
        console.error('Error fetching current user:', error.response?.status ?? error.message)
        throw error
      } finally {
        fetchCurrentUserPromise = null
      }
    })()

    return fetchCurrentUserPromise
  },

  // 8b. Mettre à jour son propre profil (prénom/nom) — utilisé à l'acceptation d'invitation
  async updateMyProfile({ commit, getters }, { firstName, lastName }) {
    if (!getters.token) return null
    const response = await api.patch('/me', { firstName, lastName })
    return response.data
  },

  // 9. Initialiser l'authentification au démarrage de l'app
  async initialize({ commit, dispatch, state, getters }) {
    commit('SET_LOADING', true)
    
    try {
      // Récupérer la session existante
      const { data: { session } } = await getSessionOnce()
      
      if (session) {
        commit('SET_AUTH', {
          userId: session.user.id,
          token: session.access_token,
          refreshToken: session.refresh_token
        })
        commit('SET_PROFILE', { email: session.user.email })
        // Synchroniser le token dans le client Axios au démarrage
        setAccessToken(session.access_token)

        // Vérifier le statut d'onboarding
        const status = await dispatch('checkOnboardingStatus')
        if (status?.hasOrganization) {
          await dispatch('fetchCurrentUser').catch(() => {})
        }
      }

      // Écouter les changements d'état d'authentification.
      // Libérer une éventuelle souscription précédente avant d'en poser une nouvelle.
      if (authSubscription) {
        authSubscription.unsubscribe()
        authSubscription = null
      }
      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
          const isSameUser = state.userId === session.user.id
          commit('SET_AUTH', {
            userId: session.user.id,
            token: session.access_token,
            refreshToken: session.refresh_token
          })
          // Synchroniser à chaque refresh de session Supabase
          setAccessToken(session.access_token)

          // Un refresh de token (même utilisateur déjà chargé, tenant déjà résolu) ne
          // justifie pas de refaire /onboarding/status + /me à chaque focus d'onglet ou
          // refresh auto Supabase (autoRefreshToken) — ces deux endpoints étaient rappelés
          // à chaque événement, sans rapport avec la page affichée. On ne re-synchronise
          // que sur un vrai changement d'utilisateur, ou tant que le tenant n'est pas
          // encore résolu (onboarding en cours, ou échec précédent à réessayer).
          if (isSameUser && getters.hasOrganization) {
            return
          }

          const status = await dispatch('checkOnboardingStatus')
          if (status?.hasOrganization) {
            await dispatch('fetchCurrentUser').catch(() => {})
          }
          return
        }

        // Événement sans session. Ne PAS purger d'office : Supabase émet aussi
        // SIGNED_OUT dans l'onglet qui perd la course au renouvellement du refresh
        // token (usage unique), alors que la session persistée vient d'être renouvelée
        // et reste valide. Voir docs/bugs/149 et utils/authSessionEvent.js.
        //
        // ⚠️ Lecture SYNCHRONE du stockage, surtout pas `getSessionOnce()` : ce callback
        // est invoqué par signOut() ALORS QU'IL DÉTIENT LE VERROU d'auth et qu'il attend
        // le retour des abonnés. Appeler getSession() ici tenterait de reprendre le même
        // verrou → blocage 10 s, signOut() jamais terminé, session non purgée.
        const storedSession = readPersistedSession()

        const decision = resolveAuthStateChange({
          event,
          session,
          storedSession,
          explicitlyLoggedOut: isExplicitlyLoggedOut(),
        })

        if (decision === AUTH_EVENT_DECISION.IGNORE) {
          // Faux positif : resynchroniser le token sur la session encore valide.
          // `user` peut manquer sur une session partielle — conserver l'id courant
          // plutôt que de lever ici : une exception dans ce handler serait silencieuse.
          commit('SET_AUTH', {
            userId: storedSession.user?.id ?? state.userId,
            token: storedSession.access_token,
            refreshToken: storedSession.refresh_token
          })
          setAccessToken(storedSession.access_token)
          return
        }

        commit('CLEAR_AUTH')
        setAccessToken(null)
      })
      authSubscription = authListener?.subscription ?? null

      commit('SET_INITIALIZED', true)
    } catch (error) {
      commit('SET_ERROR', error.message)
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 10. Mot de passe oublié
  async resetPassword({ commit }, email) {
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      console.log('resetPassword result:', { error })
      
      if (error) throw error
      
      return { success: true }
    } catch (error) {
      commit('SET_ERROR', error.message)
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 11. Mettre à jour le mot de passe
  async updatePassword({ commit }, newPassword) {
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })
      
      if (error) {
        let errorMessage = error.message
        if (error.message.includes('Same password')) {
          errorMessage = 'Le nouveau mot de passe doit être différent de l\'ancien'
        }
        throw new Error(errorMessage)
      }
      
      return { success: true }
    } catch (error) {
      const errorMessage = error.message || 'Impossible de mettre à jour le mot de passe'
      commit('SET_ERROR', errorMessage)
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 12. Vérifier le token d'email
  // Accepte soit une string (compat), soit { tokenHash, type } provenant
  // des paramètres réels du lien Supabase (token_hash=...&type=signup).
  async verifyEmailToken({ commit }, payload) {
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)

    const tokenHash = typeof payload === 'string' ? payload : payload?.tokenHash
    // type possible côté Supabase : 'signup' | 'email' | 'magiclink' | 'invite' | 'recovery' | 'email_change'
    const type = (typeof payload === 'object' && payload?.type) || 'email'

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type
      })
      
      if (error) {
        let errorMessage = error.message
        if (error.message.includes('Token has expired')) {
          errorMessage = 'Le lien de vérification a expiré'
        } else if (error.message.includes('Invalid token')) {
          errorMessage = 'Lien de vérification invalide'
        }
        throw new Error(errorMessage)
      }
      
      if (data.user) {
        commit('SET_AUTH', {
          userId: data.user.id,
          token: data.session?.access_token,
          refreshToken: data.session?.refresh_token
        })
      }
      
      return { success: true, data }
    } catch (error) {
      const errorMessage = error.message || 'Impossible de vérifier l\'email'
      commit('SET_ERROR', errorMessage)
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 13. Renvoyer l'email de vérification
  async resendVerificationEmail({ commit, getters }, emailOverride) {
    commit('SET_LOADING', true)
    commit('SET_ERROR', null)
    
    try {
      const emailFromParam = typeof emailOverride === 'string' ? emailOverride.trim() : ''
      let email = emailFromParam
      
      if (!email) {
        const { data: { user } } = await supabase.auth.getUser()
        email = user?.email || ''
      }
      
      if (!email) {
        throw new Error('Aucun email trouvé')
      }
      
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email
      })
      
      if (error) {
        let errorMessage = error.message
        if (error.message.includes('already confirmed')) {
          errorMessage = 'Votre email est déjà vérifié'
        } else if (error.message.includes('rate limit')) {
          errorMessage = 'Trop de tentatives. Veuillez patienter avant de réessayer'
        }
        throw new Error(errorMessage)
      }
      
      return { success: true }
    } catch (error) {
      const errorMessage = error.message || 'Impossible de renvoyer l\'email'
      commit('SET_ERROR', errorMessage)
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  }
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions
}
