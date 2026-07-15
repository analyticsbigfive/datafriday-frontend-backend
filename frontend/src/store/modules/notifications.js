// Notifications légères, persistées en localStorage.
//
// Objectif = « sans ralentir l'app » :
//   - hydratation UNE fois au boot (App.vue), idempotente (rappelable sur `storage`)
//   - écritures localStorage DÉBOUNCÉES (coalesce les rafales)
//   - plafond dur (ring-buffer) → payload minuscule
//   - dé-doublonnage court → pas de spam quand un même événement se répète
//   - AUCUN timer récurrent / AUCUN polling / AUCUN réseau
//   - réactivité in-tab = Vuex (instantané) ; cross-onglet = event `storage`
//
// La source de vérité runtime est l'état Vuex ; le localStorage n'est qu'un miroir
// de persistance. Si l'écriture échoue (quota, navigation privée), l'app continue.

const LS_KEY = 'datafriday:notifications'
const CAP = 50
const DEDUPE_MS = 3000
const PERSIST_DEBOUNCE_MS = 400

let persistTimer = null
let seq = 0

function makeId() {
  seq += 1
  return `${Date.now().toString(36)}-${seq}`
}

function readLS() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, CAP) : []
  } catch {
    return []
  }
}

function writeLS(items) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, CAP)))
  } catch {
    /* quota / mode privé : on ignore, l'état mémoire reste la vérité */
  }
}

// Débounce : n'écrit qu'après PERSIST_DEBOUNCE_MS d'inactivité. `getItems` est
// rappelé au tir pour sérialiser l'état LE PLUS RÉCENT (coalescing des rafales).
function schedulePersist(getItems) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    writeLS(getItems())
  }, PERSIST_DEBOUNCE_MS)
}

export default {
  namespaced: true,

  state: () => ({
    items: [],
    hydrated: false,
  }),

  getters: {
    items: (state) => state.items,
    unreadCount: (state) => state.items.reduce((n, it) => (it.read ? n : n + 1), 0),
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
    CLEAR_ALL(state) {
      state.items = []
    },
    SET_HYDRATED(state, v) {
      state.hydrated = v
    },
  },

  actions: {
    // Lit le miroir localStorage. Idempotent → sûr à rappeler quand un autre
    // onglet écrit (App.vue écoute l'event `storage`).
    hydrate({ commit }) {
      commit('SET_ITEMS', readLS())
      commit('SET_HYDRATED', true)
    },

    push({ state, commit }, { type = 'info', title = '', message = '', meta = null } = {}) {
      if (!title && !message) return
      const now = Date.now()
      // Dé-doublonnage court : même (type,title,message) dans la fenêtre → ignore.
      const dupe = state.items.some(
        (it) =>
          it.type === type &&
          it.title === title &&
          it.message === message &&
          now - it.ts < DEDUPE_MS,
      )
      if (dupe) return
      commit('ADD_ITEM', { id: makeId(), type, title, message, meta: meta || null, ts: now, read: false })
      schedulePersist(() => state.items)
    },

    markAllRead({ state, commit }) {
      commit('MARK_ALL_READ')
      schedulePersist(() => state.items)
    },

    clear({ state, commit }) {
      commit('CLEAR_ALL')
      schedulePersist(() => state.items)
    },
  },
}
