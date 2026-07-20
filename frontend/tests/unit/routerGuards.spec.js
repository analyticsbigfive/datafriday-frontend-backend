// Garde-fou sur `requireOrganization` : le bypass démo (`?demo=1` /
// `localStorage.analyse_demo`) accordait un accès non authentifié en production
// (BUG-027). Il a été retiré. Ces tests existent pour qu'une réintroduction
// « pour dépanner » casse la suite au lieu de passer inaperçue.

const mockGetters = {}
const mockDispatch = jest.fn()

jest.mock('@/store', () => ({
  __esModule: true,
  default: {
    get getters() { return mockGetters },
    dispatch: (...a) => mockDispatch(...a),
  },
}))

import { requireOrganization } from '@/router/guards'

const route = (fullPath = '/dashboard', query = {}) => ({ fullPath, query })

function setAuth({ initialized = true, authenticated = false, hasOrg = false } = {}) {
  mockGetters['auth/isInitialized'] = initialized
  mockGetters['auth/isAuthenticated'] = authenticated
  mockGetters['auth/hasOrganization'] = hasOrg
}

describe('requireOrganization — bypass démo retiré (BUG-027)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    try { window.localStorage.removeItem('analyse_demo') } catch (_) { /* noop */ }
  })

  it('redirige vers /login malgré ?demo=1 dans la query', async () => {
    setAuth({ authenticated: false })
    const next = jest.fn()

    await requireOrganization(route('/dashboard?demo=1', { demo: '1' }), null, next)

    expect(next).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/dashboard?demo=1' },
    })
  })

  it('redirige vers /login malgré le flag persistant analyse_demo', async () => {
    setAuth({ authenticated: false })
    window.localStorage.setItem('analyse_demo', '1')
    const next = jest.fn()

    await requireOrganization(route(), null, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ path: '/login' }))
  })

  it('redirige vers /onboarding si authentifié sans organisation, même avec ?demo=1', async () => {
    setAuth({ authenticated: true, hasOrg: false })
    const next = jest.fn()

    await requireOrganization(route('/dashboard?demo=1', { demo: '1' }), null, next)

    expect(next).toHaveBeenCalledWith('/onboarding')
  })

  it('laisse passer un utilisateur authentifié avec organisation', async () => {
    setAuth({ authenticated: true, hasOrg: true })
    const next = jest.fn()

    await requireOrganization(route(), null, next)

    expect(next).toHaveBeenCalledWith()
  })

  it('initialise l\'auth si elle ne l\'est pas encore', async () => {
    setAuth({ initialized: false, authenticated: true, hasOrg: true })
    const next = jest.fn()

    await requireOrganization(route(), null, next)

    expect(mockDispatch).toHaveBeenCalledWith('auth/initialize')
    expect(next).toHaveBeenCalledWith()
  })
})
