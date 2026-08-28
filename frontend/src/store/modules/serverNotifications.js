// Notifications persistées côté serveur (décision Bertrand 08/2026 : in-app d'abord,
// WhatsApp en option plus tard, cf. backend/src/features/notifications). Module
// SÉPARÉ de `notifications` (local/localStorage, volontairement sans réseau ni
// polling, cf. son propre en-tête). NotificationPanel fusionne les deux listes à
// l'affichage. Poll léger (pas de websocket) piloté par App.vue sur auth/userId,
// même pattern que `notifications/setUser`.

import { toast } from 'vue-sonner'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/api/endpoints/notifications.api'
import router from '@/router'

const POLL_MS = 30000
const TOAST_TITLE_BY_TYPE = {
  logistic_task_assigned: 'info',
  logistic_batch_completed: 'success',
  logistic_task_failed: 'error',
}
// Flood-guard : un lot crée plusieurs notifications d'un coup (une par staff assigné),
// au-delà de ce nombre de nouveautés en un seul poll, un résumé unique remplace le
// déluge de toasts individuels.
const MAX_INDIVIDUAL_TOASTS = 3

let pollTimer = null

function showToast(item) {
  const kind = TOAST_TITLE_BY_TYPE[item.type] || 'message'
  const fn = typeof toast[kind] === 'function' ? toast[kind] : toast.message
  fn(item.title, {
    description: item.message,
    ...(item.link ? { onClick: () => router.push(item.link).catch(() => {}) } : {}),
  })
}

function notifyNew(fresh) {
  if (!fresh.length) return
  if (fresh.length > MAX_INDIVIDUAL_TOASTS) {
    toast.info('Nouvelles notifications', { description: `${fresh.length} nouvelles notifications à consulter.` })
    return
  }
  fresh.forEach(showToast)
}

export default {
  namespaced: true,

  state: () => ({
    items: [],
    loading: false,
    hasFetchedOnce: false, // le tout premier fetch rattrape le passé, ne toast rien
  }),

  getters: {
    items: (state) => state.items,
    unreadCount: (state) => state.items.reduce((n, it) => (it.read ? n : n + 1), 0),
  },

  mutations: {
    SET_ITEMS(state, items) {
      state.items = Array.isArray(items) ? items : []
    },
    MARK_READ(state, id) {
      state.items = state.items.map((it) => (it.id === id ? { ...it, read: true } : it))
    },
    MARK_ALL_READ(state) {
      state.items = state.items.map((it) => (it.read ? it : { ...it, read: true }))
    },
    SET_LOADING(state, v) {
      state.loading = v
    },
    SET_FETCHED_ONCE(state, v) {
      state.hasFetchedOnce = v
    },
  },

  actions: {
    async fetch({ commit, state }) {
      if (state.loading) return // un poll en vol suffit, pas la peine d'empiler
      commit('SET_LOADING', true)
      try {
        const rows = (await getNotifications()) || []
        const knownIds = new Set(state.items.map((it) => it.id))
        const items = rows.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          message: r.message,
          meta: r.meta || null,
          link: r.link || null,
          ts: new Date(r.createdAt).getTime(),
          read: !!r.read,
          source: 'server',
        }))
        // Nouveautés = pas déjà connues ET non lues (créées ailleurs déjà lues, ex.
        // multi-onglets, n'ont pas besoin d'un toast). Jamais au tout premier fetch
        // (login) : rattraper 10 notifications passées d'un coup n'est pas "nouveau".
        if (state.hasFetchedOnce) {
          const fresh = items.filter((it) => !it.read && !knownIds.has(it.id))
          notifyNew(fresh)
        }
        commit('SET_ITEMS', items)
        commit('SET_FETCHED_ONCE', true)
      } catch {
        // Silencieux : la cloche garde son dernier état connu, un poll raté n'est
        // pas une erreur à interrompre l'utilisateur pour.
      } finally {
        commit('SET_LOADING', false)
      }
    },

    async markRead({ commit, dispatch }, id) {
      commit('MARK_READ', id) // optimiste, cf. notifications/markRead
      try {
        await markNotificationRead(id)
      } catch {
        dispatch('fetch') // désynchro possible : un fetch normal corrigera
      }
    },

    async markAllRead({ commit, dispatch }) {
      commit('MARK_ALL_READ')
      try {
        await markAllNotificationsRead()
      } catch {
        dispatch('fetch')
      }
    },

    /** Login (ou boot déjà authentifié) : fetch immédiat + poll régulier. */
    startPolling({ dispatch }) {
      dispatch('fetch')
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = setInterval(() => dispatch('fetch'), POLL_MS)
    },

    /** Logout : plus rien à afficher pour le prochain utilisateur du poste, et son
     *  premier fetch à LUI ne doit pas non plus toaster tout son historique. */
    stopPolling({ commit }) {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      commit('SET_ITEMS', [])
      commit('SET_FETCHED_ONCE', false)
    },
  },
}
