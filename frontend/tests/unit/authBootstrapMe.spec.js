// Câblage du démarrage d'authentification (store/modules/auth.js) :
//   - /me n'est lu qu'UNE fois au démarrage (la seconde lecture, en série, était un doublon) ;
//   - /me part en même temps que /onboarding/status, mais ses effets sur le store sont appliqués
//     APRÈS ceux du statut (l'identité complète du profil l'emporte, comme avant) ;
//   - la garde de navigation attend toujours le résultat : `initialize` ne rend la main qu'une
//     fois le tenant et les permissions en place ;
//   - `fresh: true` force une vraie relecture, la déconnexion oublie le résultat gardé.
// Ne remplace pas le test navigateur : valide la logique et son branchement.

const mockGetSession = jest.fn()
const mockApiGet = jest.fn()
const mockOnAuthStateChange = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { onAuthStateChange: (...a) => mockOnAuthStateChange(...a) } },
  getSessionOnce: (...a) => mockGetSession(...a),
  readPersistedSession: jest.fn(),
}))
jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: (...a) => mockApiGet(...a), post: jest.fn(), patch: jest.fn() },
}))
jest.mock('@/api/client', () => ({
  setAccessToken: jest.fn(),
  clearAccessToken: jest.fn(),
  isExplicitlyLoggedOut: jest.fn(() => false),
}))

const SESSION = {
  access_token: 'jwt.a',
  refresh_token: 'refresh.a',
  user: { id: 'user-1', email: 'a@b.fr' },
}

const STATUS_ORG = {
  data: {
    exists: true,
    hasOrganization: true,
    user: { role: 'ADMIN', isOwner: true },
    tenant: { id: 'tenant-1', name: 'Club' },
  },
}

const ME_ORG = {
  data: {
    email: 'a@b.fr',
    firstName: 'Ada',
    lastName: 'L',
    fullName: 'Ada L',
    tenant: { id: 'tenant-1', name: 'Club' },
    role: { id: 'r1', name: 'Admin salle', systemKey: 'ADMIN', permissions: ['front.fb.analyse'] },
    isOwner: true,
    isSuperAdmin: false,
  },
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const callsTo = (url) => mockApiGet.mock.calls.filter(([u]) => u === url).length

describe('démarrage auth : lecture de /me', () => {
  let store
  let warnSpy
  let errorSpy

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSession.mockResolvedValue({ data: { session: SESSION } })
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } })

    // eslint-disable-next-line global-require
    const { createStore } = require('vuex')
    // eslint-disable-next-line global-require
    const auth = require('@/store/modules/auth').default
    store = createStore({ modules: { auth } })
  })

  afterEach(() => {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('lit /me une seule fois (plus de doublon en série) et /onboarding/status une fois', async () => {
    mockApiGet.mockImplementation((url) => {
      if (url === '/onboarding/status') return Promise.resolve(STATUS_ORG)
      if (url === '/me') return Promise.resolve(ME_ORG)
      return Promise.reject(new Error(`inattendu : ${url}`))
    })

    await store.dispatch('auth/initialize')

    expect(callsTo('/me')).toBe(1)
    expect(callsTo('/onboarding/status')).toBe(1)
    expect(store.getters['auth/isInitialized']).toBe(true)
    expect(store.getters['auth/hasOrganization']).toBe(true)
    expect(store.getters['auth/can']('front.fb.analyse')).toBe(true)
    expect(store.getters['auth/currentUser'].firstName).toBe('Ada')
  })

  it('/me part avant la réponse de /onboarding/status, mais le profil est appliqué après le statut', async () => {
    const status = deferred()
    mockApiGet.mockImplementation((url) => {
      if (url === '/onboarding/status') return status.promise
      if (url === '/me') return Promise.resolve(ME_ORG)
      return Promise.reject(new Error(`inattendu : ${url}`))
    })

    const done = store.dispatch('auth/initialize')
    // Laisse les microtâches passer : getSession résolu, les deux requêtes sont parties.
    await new Promise((r) => setTimeout(r, 0))

    expect(callsTo('/onboarding/status')).toBe(1)
    expect(callsTo('/me')).toBe(1)
    // /me est revenu, mais rien n'est encore appliqué : l'identité attend le statut.
    expect(store.getters['auth/hasOrganization']).toBe(false)
    expect(store.getters['auth/isInitialized']).toBe(false)

    status.resolve(STATUS_ORG)
    await done

    expect(store.getters['auth/isInitialized']).toBe(true)
    // Le rôle objet de /me (avec permissions) l'emporte sur le rôle legacy du statut.
    expect(store.getters['auth/userRole']).toBe('Admin salle')
    expect(store.getters['auth/userPermissions']).toEqual(['front.fb.analyse'])
    expect(callsTo('/me')).toBe(1)
  })

  it('utilisateur sans organisation : pas de tenant, l\'échec de /me est avalé, initialize termine', async () => {
    mockApiGet.mockImplementation((url) => {
      if (url === '/onboarding/status') {
        return Promise.resolve({ data: { exists: false, hasOrganization: false, user: null, tenant: null } })
      }
      if (url === '/me') return Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }))
      return Promise.reject(new Error(`inattendu : ${url}`))
    })

    await store.dispatch('auth/initialize')

    expect(store.getters['auth/isInitialized']).toBe(true)
    expect(store.getters['auth/isAuthenticated']).toBe(true)
    expect(store.getters['auth/hasOrganization']).toBe(false)
    // Aucune lecture de profil supplémentaire quand le statut dit « pas d'organisation ».
    expect(callsTo('/me')).toBe(1)
  })

  it('si la première lecture de /me échoue, une nouvelle lecture est faite (nouvel essai conservé)', async () => {
    let meCalls = 0
    mockApiGet.mockImplementation((url) => {
      if (url === '/onboarding/status') return Promise.resolve(STATUS_ORG)
      if (url === '/me') {
        meCalls += 1
        return meCalls === 1 ? Promise.reject(new Error('503')) : Promise.resolve(ME_ORG)
      }
      return Promise.reject(new Error(`inattendu : ${url}`))
    })

    await store.dispatch('auth/initialize')

    expect(meCalls).toBeGreaterThanOrEqual(2)
    expect(store.getters['auth/userRole']).toBe('Admin salle')
    expect(store.getters['auth/currentUser'].firstName).toBe('Ada')
  })

  it('fetchCurrentUser réutilise une lecture récente, sauf avec fresh: true', async () => {
    mockApiGet.mockImplementation(() => Promise.resolve(ME_ORG))
    store.commit('auth/SET_AUTH', { userId: 'user-1', token: 'jwt.a', refreshToken: 'r' })

    await store.dispatch('auth/fetchCurrentUser')
    await store.dispatch('auth/fetchCurrentUser')
    expect(callsTo('/me')).toBe(1)

    await store.dispatch('auth/fetchCurrentUser', { fresh: true })
    expect(callsTo('/me')).toBe(2)
  })

  it('la déconnexion (CLEAR_AUTH) oublie la lecture gardée', async () => {
    mockApiGet.mockImplementation(() => Promise.resolve(ME_ORG))
    store.commit('auth/SET_AUTH', { userId: 'user-1', token: 'jwt.a', refreshToken: 'r' })
    await store.dispatch('auth/fetchCurrentUser')

    store.commit('auth/CLEAR_AUTH')
    store.commit('auth/SET_AUTH', { userId: 'user-1', token: 'jwt.b', refreshToken: 'r' })
    await store.dispatch('auth/fetchCurrentUser')

    expect(callsTo('/me')).toBe(2)
  })

  it('sans jeton, ne lit rien', async () => {
    mockApiGet.mockImplementation(() => Promise.resolve(ME_ORG))

    await expect(store.dispatch('auth/fetchCurrentUser')).resolves.toBeNull()
    expect(callsTo('/me')).toBe(0)
  })
})
