// Tests du module Vuex notifications (store/modules/notifications.js) :
// lu par item, dédup i18n (clés + params), scoping par utilisateur,
// migration read-once de la clé legacy. Le module est invoqué à la main
// (mutations/actions directes) — pas de vrai store Vuex nécessaire.

import notifications from '@/store/modules/notifications'

const LEGACY_KEY = 'datafriday:notifications'

function freshState() {
  return notifications.state()
}

/** Exécute une action du module avec un contexte minimal branché sur `state`. */
function run(action, state, payload) {
  const commit = (type, arg) => notifications.mutations[type](state, arg)
  const dispatch = (type, arg) => run(type, state, arg)
  return notifications.actions[action]({ state, commit, dispatch }, payload)
}

beforeEach(() => {
  localStorage.clear()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
})

describe('markRead', () => {
  it('marque UNIQUEMENT la cible ; no-op si déjà lue', () => {
    const state = freshState()
    state.userId = 'u1'
    run('push', state, { type: 'info', title: 'A' })
    jest.advanceTimersByTime(3100)
    run('push', state, { type: 'info', title: 'B' })
    const [b, a] = state.items
    run('markRead', state, a.id)
    expect(state.items.find((it) => it.id === a.id).read).toBe(true)
    expect(state.items.find((it) => it.id === b.id).read).toBe(false)
    const snapshot = state.items
    run('markRead', state, a.id) // déjà lue → référence inchangée
    expect(state.items).toBe(snapshot)
  })
})

describe('push — dédup i18n', () => {
  it('dédupe sur (type, clés, params) dans la fenêtre', () => {
    const state = freshState()
    state.userId = 'u1'
    const payload = { type: 'inventory', titleKey: 'k', params: { count: 3 } }
    run('push', state, payload)
    run('push', state, payload)
    expect(state.items).toHaveLength(1)
  })

  it('params différents → PAS un doublon', () => {
    const state = freshState()
    state.userId = 'u1'
    run('push', state, { type: 'inventory', titleKey: 'k', params: { count: 3 } })
    run('push', state, { type: 'inventory', titleKey: 'k', params: { count: 4 } })
    expect(state.items).toHaveLength(2)
  })

  it('payload clés-seules accepté ; champs i18n absents des items legacy', () => {
    const state = freshState()
    state.userId = 'u1'
    run('push', state, { type: 'event', titleKey: 'notifEventUpdatedTitle' })
    expect(state.items[0].titleKey).toBe('notifEventUpdatedTitle')
    run('push', state, { type: 'event', title: 'Brut' })
    expect('titleKey' in state.items[0]).toBe(false)
  })

  it('rejette un payload entièrement vide', () => {
    const state = freshState()
    state.userId = 'u1'
    run('push', state, {})
    expect(state.items).toHaveLength(0)
  })
})

describe('scoping utilisateur', () => {
  it('hydrate migre la clé legacy UNE fois puis la supprime', () => {
    const legacyItems = [{ id: 'x', type: 'info', title: 'Old', ts: 1, read: false }]
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyItems))
    const state = freshState()
    run('setUser', state, 'u1')
    expect(state.items).toHaveLength(1)
    expect(state.items[0].title).toBe('Old')
    expect(localStorage.getItem(LEGACY_KEY)).toBe(null)
    expect(localStorage.getItem(`${LEGACY_KEY}:u1`)).not.toBe(null)
  })

  it('setUser(null) purge la mémoire SANS toucher au LS de l\'ex-user', () => {
    const state = freshState()
    run('setUser', state, 'u1')
    run('push', state, { type: 'info', title: 'Mine' })
    jest.advanceTimersByTime(500) // flush persist débouncé
    run('setUser', state, null)
    expect(state.items).toHaveLength(0)
    expect(state.hydrated).toBe(false)
    const stored = JSON.parse(localStorage.getItem(`${LEGACY_KEY}:u1`))
    expect(stored).toHaveLength(1)
  })

  it('switch de user : flush du persist en attente vers l\'ANCIENNE clé, hydrate la nouvelle', () => {
    const state = freshState()
    run('setUser', state, 'u1')
    run('push', state, { type: 'info', title: 'DeU1' })
    // Persist encore débouncé (pas de tick) → setUser doit flusher vers u1.
    run('setUser', state, 'u2')
    const u1 = JSON.parse(localStorage.getItem(`${LEGACY_KEY}:u1`))
    expect(u1).toHaveLength(1)
    expect(u1[0].title).toBe('DeU1')
    expect(state.items).toHaveLength(0) // u2 vierge
    expect(state.userId).toBe('u2')
  })

  it('déconnecté (userId null) : push reste en mémoire, rien en LS', () => {
    const state = freshState()
    run('push', state, { type: 'info', title: 'Ghost' })
    jest.advanceTimersByTime(500)
    expect(state.items).toHaveLength(1)
    expect(localStorage.length).toBe(0)
  })
})
