// src/api/client.js
// Client API centralisé avec Axios

import axios from 'axios'
import router from '@/router'

// Configuration de base
const API_BASE_URL = process.env.VUE_APP_API_URL

// Créer l'instance Axios
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // 60s : les requêtes catalogue lourdes (getAllMenuItems ~500 items + joins) sur le
  // backend onrender dépassaient parfois 30s → catalogue vide → page Analyse cassée.
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// ============================================
// GESTION DES TOKENS
// ============================================

let accessToken = null
let _explicitlyLoggedOut = false

/**
 * Définir le token d'accès
 * @param {string|null} token
 */
export function setAccessToken(token) {
  accessToken = token
  if (token) _explicitlyLoggedOut = false
}

/**
 * Récupérer le token d'accès
 * @returns {string|null}
 */
export function getAccessToken() {
  return accessToken
}

/**
 * Effacer le token d'accès et marquer la déconnexion explicite pour empêcher
 * l'intercepteur de refetcher automatiquement la session Supabase.
 */
export function clearAccessToken() {
  accessToken = null
  _explicitlyLoggedOut = true
}

// ============================================
// INTERCEPTEURS
// ============================================

// Intercepteur Request - Ajouter le token JWT
// Si le token en mémoire est absent (deep link, reload, callback OAuth),
// on tente une récupération synchrone depuis la session Supabase persistante
// avant d'envoyer la requête — évite les 401 au premier appel après reload.
apiClient.interceptors.request.use(
  async (config) => {
    // Auto-récupération de session uniquement si token absent ET pas de déconnexion explicite.
    // Évite de refetcher une session périmée juste après signOut().
    if (!accessToken && !_explicitlyLoggedOut) {
      try {
        const { getSessionOnce } = await import('@/lib/supabase')
        const { data } = await getSessionOnce()
        if (data?.session?.access_token) {
          accessToken = data.session.access_token
        }
      } catch (_) {
        // Session absente ou Supabase indisponible — on laisse passer sans token
      }
    }

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }

    if (process.env.NODE_ENV === 'development') {
      const hasAuth = !!config.headers.Authorization
      console.log(`🌐 API ${config.method?.toUpperCase()} ${config.url} ${hasAuth ? '🔑' : '⚠️ NO TOKEN'}`)
    }

    return config
  },
  (error) => Promise.reject(error)
)

// Intercepteur Response - Gérer les erreurs
apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  async (error) => {
    const status = error.response?.status
    const originalRequest = error.config
    const suppressGlobalError = !!originalRequest?.suppressGlobalError
    
    // 401 - Non autorisé
    if (status === 401) {
      // Already retried — don't loop
      if (originalRequest._retry) {
        return Promise.reject(error)
      }

      originalRequest._retry = true
      
      // Try to get a fresh session (non-destructive)
      try {
        const { getSessionOnce } = await import('@/lib/supabase')
        const { data } = await getSessionOnce()

        if (data.session) {
          setAccessToken(data.session.access_token)
          originalRequest.headers.Authorization = `Bearer ${data.session.access_token}`
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError)
      }
      
      // No valid session at all — sign out and redirect
      clearAccessToken()
      router.push('/login')
      // If store says authenticated but backend rejects: JWT_SECRET mismatch
      // Don't redirect — just reject so views show their error state
      return Promise.reject(error)
    }
    
    // 429 - Rate limit : un seul retry auto basé sur le header Retry-After (posé par
    // TenantThrottlerGuard). Utile pour les fan-out (1 requête par shop/event) qui
    // sinon perdent silencieusement l'item en échec. Bornage à 5s : au-delà, l'appel
    // a probablement tapé le palier "medium/long" (minutes/heure) — inutile de faire
    // attendre l'UI, on laisse l'erreur remonter normalement.
    if (status === 429 && !originalRequest._retryCount) {
      const retryAfterSec = Number(error.response.headers?.['retry-after'])
      const MAX_RETRY_WAIT_MS = 5000
      if (Number.isFinite(retryAfterSec) && retryAfterSec > 0 && retryAfterSec * 1000 <= MAX_RETRY_WAIT_MS) {
        originalRequest._retryCount = 1
        await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000))
        return apiClient(originalRequest)
      }
    }

    // NB : pas de retry auto sur timeout — re-tenter une requête déjà lente (>60s)
    // double juste l'attente (constaté : getAllMenuItems = 2×60s). Le vrai souci est
    // la latence backend de l'endpoint (DB), à régler côté serveur.

    // Build user-friendly error message
    let userMessage = 'Une erreur est survenue'
    
    // 403 - Accès interdit
    if (status === 403) {
      userMessage = 'Accès interdit — vous n\'avez pas les droits nécessaires'
      console.error('🚫 Accès interdit')
    }
    
    // 404 - Non trouvé
    if (status === 404) {
      userMessage = 'Ressource non trouvée'
      console.warn('⚠️ Ressource non trouvée:', originalRequest.url)
    }
    
    // 422 - Validation
    if (status === 422 || status === 400) {
      const detail = error.response?.data?.message
      userMessage = Array.isArray(detail) ? detail.join(', ') : (detail || 'Données invalides')
    }
    
    // 429 - Rate limit
    if (status === 429) {
      userMessage = 'Trop de requêtes — veuillez patienter'
    }
    
    // 500+ - Erreur serveur
    if (status >= 500) {
      userMessage = 'Erreur serveur — veuillez réessayer'
      if (!suppressGlobalError) {
        console.error('💥 Erreur serveur:', error.response?.data)
      }
    }
    
    // Timeout
    if (error.code === 'ECONNABORTED') {
      userMessage = 'La requête a expiré — vérifiez votre connexion'
      console.error('⏱️ Timeout de la requête')
    }
    
    // Erreur réseau
    if (!error.response) {
      userMessage = 'Serveur inaccessible — vérifiez votre connexion'
      console.error('📡 Erreur réseau - Serveur inaccessible')
    }
    
    // Emit global error event for UI notification
    if (!suppressGlobalError) {
      window.dispatchEvent(new CustomEvent('api-error', {
        detail: { status, message: userMessage, url: originalRequest?.url },
      }))
    }
    
    // Attach user-friendly message to error
    error.userMessage = userMessage
    
    return Promise.reject(error)
  }
)

// ============================================
// MÉTHODES UTILITAIRES
// ============================================

/**
 * Extraire les données de la réponse
 * NestJS retourne directement l'objet, pas un wrapper { data: ... }
 * @param {object} response - Réponse Axios
 * @returns {any} - Données
 */
function extractData(response) {
  // NestJS retourne directement l'objet dans response.data
  // Ne pas confondre un champ "data" dans l'objet avec un wrapper
  return response.data
}

/**
 * Wrapper pour les requêtes avec gestion d'erreur uniforme
 */
export const api = {
  /**
   * GET request
   * @param {string} url 
   * @param {object} config 
   * @returns {Promise<any>}
   */
  async get(url, config = {}) {
    const response = await apiClient.get(url, config)
    return extractData(response)
  },
  
  /**
   * POST request
   * @param {string} url 
   * @param {object} data 
   * @param {object} config 
   * @returns {Promise<any>}
   */
  async post(url, data = {}, config = {}) {
    const response = await apiClient.post(url, data, config)
    return extractData(response)
  },
  
  /**
   * PUT request
   * @param {string} url 
   * @param {object} data 
   * @param {object} config 
   * @returns {Promise<any>}
   */
  async put(url, data = {}, config = {}) {
    const response = await apiClient.put(url, data, config)
    return extractData(response)
  },
  
  /**
   * PATCH request
   * @param {string} url 
   * @param {object} data 
   * @param {object} config 
   * @returns {Promise<any>}
   */
  async patch(url, data = {}, config = {}) {
    const response = await apiClient.patch(url, data, config)
    return extractData(response)
  },
  
  /**
   * DELETE request
   * @param {string} url 
   * @param {object} config 
   * @returns {Promise<any>}
   */
  async delete(url, config = {}) {
    const response = await apiClient.delete(url, config)
    return extractData(response)
  }
}

// Export par défaut
export default apiClient