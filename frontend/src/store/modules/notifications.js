// Notifications légères, persistées en localStorage.
//
// Objectif = « sans ralentir l'app » :
//   - hydratation au boot et à chaque changement d'utilisateur (setUser),
//     idempotente (rappelable sur `storage`)
//   - écritures localStorage DÉBOUNCÉES (coalesce les rafales)
//   - plafond dur (ring-buffer) → payload minuscule
//   - dé-doublonnage court → pas de spam quand un même événement se répète
//   - AUCUN timer récurrent / AUCUN polling / AUCUN réseau
//   - réactivité in-tab = Vuex (instantané) ; cross-onglet = event `storage`
//
// Scoping (harmonisation 14/08) : une clé PAR UTILISATEUR
// (`datafriday:notifications:<userId>`) — l'ancienne clé globale fuyait les
// notifications entre comptes d'un même navigateur. Migration read-once de la
// clé legacy au premier login scoped ; au logout, la mémoire est purgée mais le
// LS de l'ex-utilisateur reste intact pour son prochain login.
//
// La source de vérité runtime est l'état Vuex ; le localStorage n'est qu'un miroir
// de persistance. Si l'écriture échoue (quota, navigation privée), l'app continue.

const LS_LEGACY_KEY = 'datafriday:notifications'
const CAP = 50
const DEDUPE_MS = 3000
const PERSIST_DEBOUNCE_MS = 400

let persistTimer = null
let seq = 0

function makeId() {
  seq += 1
  return `${Date.now().toString(36)}-${seq}`
}

function keyFor(userId) {
  return userId ? `${LS_LEGACY_KEY}:${userId}` : null
}

function readLS(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, CAP) : []
  } catch {
    return []
  }
}

function writeLS(key, items) {
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, CAP)))
  } catch {
    /* quota / mode privé : on ignore, l'état mémoire reste la vérité */
  }
}

// Débounce : n'écrit qu'après PERSIST_DEBOUNCE_MS d'inactivité. `getItems` est
// rappelé au tir pour sérialiser l'état LE PLUS RÉCENT (coalescing des rafales).
function schedulePersist(key, getItems) {
  if (!key) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    writeLS(key, getItems())
  }, PERSIST_DEBOUNCE_MS)
}

export default {
  namespaced: true,

  state: () => ({
    items: [],
    hydrated: false,
    // Utilisateur courant (auth/userId, posé par App.vue via setUser) — porte
    // la clé localStorage scoped. null = déconnecté → rien n'est persisté.
    userId: null,
  }),

  getters: {
    items: (state) => state.items,
    unreadCount: (state) => state.items.reduce((n, it) => (it.read ? n : n + 1), 0),
    // Clé LS courante — App.vue matche l'event `storage` dessus (cross-onglet).
    storageKey: (state) => keyFor(state.userId),
  },

  mutations: {
    SET_ITEMS(state, items) {
      state.items = Array.isArray(items) ? items.slice(0, CAP) : []
    },
    ADD_ITEM(state, item) {
      state.items = [item, ...state.items].slice(0, CAP)
    },
    MARK_ALL_READ(state) {
      if (state.items.some((it) => !it.read)) {
        state.items = state.items.map((it) => (it.read ? it : { ...it, read: true }))
      }
    },
    MARK_READ(state, id) {
      if (state.items.some((it) => it.id === id && !it.read)) {
        state.items = state.items.map((it) => (it.id === id ? { ...it, read: true } : it))
      }
    },
    CLEAR_ALL(state) {
      state.items = []
    },
    SET_HYDRATED(state, v) {
      state.hydrated = v
    },
    SET_USER(state, userId) {
      state.userId = userId
    },
  },

  actions: {
    // Lit le miroir localStorage de l'utilisateur courant. Idempotent → sûr à
    // rappeler quand un autre onglet écrit (App.vue écoute l'event `storage`).
    hydrate({ state, commit }) {
      const key = keyFor(state.userId)
      if (!key) {
        commit('SET_ITEMS', [])
        commit('SET_HYDRATED', true)
        return
      }
      // Migration read-once de la clé legacy globale : uniquement si la clé
      // scoped n'existe pas encore (premier login post-deploy). La pile legacy
      // est absorbée par ce premier utilisateur puis supprimée.
      try {
        if (localStorage.getItem(key) == null) {
          const legacyRaw = localStorage.getItem(LS_LEGACY_KEY)
          if (legacyRaw != null) {
            localStorage.setItem(key, legacyRaw)
            localStorage.removeItem(LS_LEGACY_KEY)
          }
        }
      } catch {
        /* quota / mode privé — la migration retentera au prochain hydrate */
      }
      commit('SET_ITEMS', readLS(key))
      commit('SET_HYDRATED', true)
    },

    // Changement d'utilisateur (login / logout / switch) — App.vue watch
    // auth/userId. Flush le persist débouncé vers l'ANCIENNE clé avant de
    // basculer : jamais d'items d'un compte écrits sous la clé d'un autre.
    setUser({ state, commit, dispatch }, userId) {
      const next = userId || null
      if (next === state.userId) return
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
        writeLS(keyFor(state.userId), state.items)
      }
      commit('SET_USER', next)
      if (!next) {
        // Logout : purge mémoire (badge éteint) — le LS de l'ex-user reste.
        commit('CLEAR_ALL')
        commit('SET_HYDRATED', false)
      } else {
        dispatch('hydrate')
      }
    },

    // titleKey/messageKey/params : variante i18n — la traduction se fait AU
    // RENDU (NotificationPanel), pas au push : un item stocké change de langue
    // avec l'app, et les items legacy (title/message en dur) restent valides.
    push(
      { state, commit },
      { type = 'info', title = '', message = '', titleKey = '', messageKey = '', params = null, meta = null } = {},
    ) {
      if (!title && !message && !titleKey && !messageKey) return
      const now = Date.now()
      // Dé-doublonnage court : même (type, titre, message, params) dans la
      // fenêtre → ignore. `meta` reste exclu (deux notifs identiques à meta
      // près sont un doublon pour l'utilisateur).
      const paramsSig = JSON.stringify(params || null)
      const dupe = state.items.some(
        (it) =>
          it.type === type &&
          (it.titleKey || it.title || '') === (titleKey || title) &&
          (it.messageKey || it.message || '') === (messageKey || message) &&
          JSON.stringify(it.params || null) === paramsSig &&
          now - it.ts < DEDUPE_MS,
      )
      if (dupe) return
      const item = { id: makeId(), type, title, message, meta: meta || null, ts: now, read: false }
      // Champs i18n seulement si présents — payload LS minimal, items legacy intacts.
      if (titleKey) item.titleKey = titleKey
      if (messageKey) item.messageKey = messageKey
      if (params) item.params = params
      commit('ADD_ITEM', item)
      schedulePersist(keyFor(state.userId), () => state.items)
    },

    markAllRead({ state, commit }) {
      commit('MARK_ALL_READ')
      schedulePersist(keyFor(state.userId), () => state.items)
    },

    markRead({ state, commit }, id) {
      commit('MARK_READ', id)
      schedulePersist(keyFor(state.userId), () => state.items)
    },

    clear({ state, commit }) {
      commit('CLEAR_ALL')
      schedulePersist(keyFor(state.userId), () => state.items)
    },
  },
}
