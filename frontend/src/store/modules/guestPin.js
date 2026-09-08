// Session invité PIN (managers de PDV sans compte, cf. docs/modules — accès invité).
//
// Modèle d'identité totalement séparé du module `auth` (Supabase) : un manager PDV
// n'a pas de compte, son "authentification" est un PIN à 6 chiffres qui échange un
// JWT invité de courte durée. Les deux ne peuvent pas cohabiter dans le même onglet
// (une seule instance Axios, un seul header Authorization à la fois).
//
// Persistance : sessionStorage (efface à la fermeture de l'onglet/navigateur —
// décision produit, réduit le risque si l'appareil est repris par quelqu'un
// d'autre après l'événement). Le deviceId de binding, lui, doit survivre au-delà
// de l'onglet pour que rouvrir la page ne ressemble pas à un "nouvel appareil" —
// il vit en localStorage, séparément.

import { loginWithPin, getGuestSession, getGuestContext } from '@/api/endpoints/guestPin.api'
import { setAccessToken, clearAccessToken, setGuestSessionActive } from '@/api/client'

const SESSION_STORAGE_KEY = 'datafriday:guestpin:session'
const DEVICE_ID_STORAGE_KEY = 'datafriday:guestpin:deviceId'

function readPersistedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writePersistedSession(payload) {
  try {
    if (payload) sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload))
    else sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    /* sessionStorage indisponible (navigation privée stricte) : session mémoire seule */
  }
}

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, id)
    }
    return id
  } catch {
    return null
  }
}

const state = {
  token: null,
  session: null, // { phase, spaceId, spaceName, elementId, elementName, eventId, showExpected }
  initialized: false,
  loading: false,
}

const getters = {
  isActive: (state) => !!state.token,
  session: (state) => state.session,
  phase: (state) => state.session?.phase ?? null,
}

const mutations = {
  SET_SESSION(state, { token, session }) {
    state.token = token
    state.session = session
  },
  SET_LOADING(state, value) {
    state.loading = value
  },
  SET_INITIALIZED(state, value) {
    state.initialized = value
  },
  CLEAR(state) {
    state.token = null
    state.session = null
  },
}

const actions = {
  /** Réhydrate depuis sessionStorage au boot d'une route invité (ex. après un
   *  refresh de page). Ne fait PAS confiance à la donnée persistée : revalide
   *  toujours contre /guest-pin/session (la fenêtre a pu être clôturée entre-temps). */
  async restore({ commit, state }) {
    if (state.initialized) return
    const persisted = readPersistedSession()
    if (persisted?.token) {
      setAccessToken(persisted.token)
      setGuestSessionActive(true)
      try {
        const session = await getGuestSession()
        commit('SET_SESSION', { token: persisted.token, session })
        writePersistedSession({ token: persisted.token, session })
      } catch {
        // Session révoquée/expirée : purge silencieuse, la vue invité redirigera.
        clearAccessToken()
        setGuestSessionActive(false)
        writePersistedSession(null)
        commit('CLEAR')
      }
    }
    commit('SET_INITIALIZED', true)
  },

  /**
   * @returns {{state:'ok'}|{state:'inactive'}|{state:'not_found', attemptsRemaining:number}|{state:'locked', retryAfter:number}}
   */
  async login({ commit }, { pin, slug, phase }) {
    commit('SET_LOADING', true)
    try {
      const deviceId = getOrCreateDeviceId()
      const result = await loginWithPin(pin, deviceId, slug, phase)
      if (result.state === 'ok') {
        const { token, state: _discriminant, ...session } = result
        setAccessToken(token)
        setGuestSessionActive(true)
        commit('SET_SESSION', { token, session })
        writePersistedSession({ token, session })
      }
      return result
    } finally {
      commit('SET_LOADING', false)
    }
  },

  /** Nom du PDV + fenêtre active ou non, résolus depuis le lien scanné, AVANT tout PIN. */
  async getContext(_ctx, { slug, phase }) {
    return getGuestContext(slug, phase)
  },

  /** Rafraîchit la session courante (ex. après "J'ai terminé", pour refléter submittedAt). */
  async refreshSession({ commit, state }) {
    if (!state.token) return
    const session = await getGuestSession()
    commit('SET_SESSION', { token: state.token, session })
    writePersistedSession({ token: state.token, session })
  },

  clear({ commit }) {
    clearAccessToken()
    setGuestSessionActive(false)
    writePersistedSession(null)
    commit('CLEAR')
  },
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions,
}
