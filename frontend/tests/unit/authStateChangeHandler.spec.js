// Teste le CÂBLAGE du handler onAuthStateChange, pas la décision elle-même
// (celle-ci est couverte par authSessionEvent.spec.js).
//
// Ce que ce fichier vérifie et que la fonction pure ne peut pas vérifier :
//   - le handler applique bien le verdict rendu (resync vs purge)
//   - le handler n'appelle JAMAIS getSession() (interblocage avec signOut, cf. plus bas)
//   - la souscription précédente est libérée avant d'en poser une nouvelle
//
// Ne remplace PAS le test navigateur : il valide la logique et son branchement,
// pas l'émission réelle des événements par Supabase. Voir docs/bugs/149.

const mockGetSession = jest.fn()
const mockReadPersistedSession = jest.fn()
const mockOnAuthStateChange = jest.fn()
const mockSetAccessToken = jest.fn()
const mockClearAccessToken = jest.fn()
const mockIsExplicitlyLoggedOut = jest.fn()

// Mocké avant l'import du store : évite aussi de tirer axios (transformation ESM
// non configurée sous Jest — cf. les 3 suites en échec pré-existant).
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { onAuthStateChange: (...a) => mockOnAuthStateChange(...a) } },
  getSessionOnce: (...a) => mockGetSession(...a),
  readPersistedSession: (...a) => mockReadPersistedSession(...a),
}))
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }))
jest.mock('@/api/client', () => ({
  setAccessToken: (...a) => mockSetAccessToken(...a),
  clearAccessToken: (...a) => mockClearAccessToken(...a),
  isExplicitlyLoggedOut: (...a) => mockIsExplicitlyLoggedOut(...a),
}))

const NOW_SECS = Math.floor(Date.now() / 1000)
const validSession = (over = {}) => ({
  access_token: 'jwt.renouvele',
  refresh_token: 'refresh.neuf',
  expires_at: NOW_SECS + 3600,
  user: { id: 'user-1' },
  ...over,
})

/**
 * Lance `initialize` sans session de départ et retourne le callback enregistré.
 */
async function bootHandler(auth, { commit = jest.fn(), dispatch = jest.fn() } = {}) {
  mockGetSession.mockResolvedValue({ data: { session: null } })
  mockReadPersistedSession.mockReturnValue(null)
  const unsubscribe = jest.fn()
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } })

  await auth.actions.initialize({
    commit,
    dispatch,
    state: { userId: 'user-1' },
    getters: { hasOrganization: true },
  })

  const handler = mockOnAuthStateChange.mock.calls.at(-1)[0]
  return { handler, commit, dispatch, unsubscribe }
}

describe('onAuthStateChange — câblage du handler', () => {
  let auth

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    mockIsExplicitlyLoggedOut.mockReturnValue(false)
    // eslint-disable-next-line global-require
    auth = require('@/store/modules/auth').default
  })

  it('resynchronise le token au lieu de purger sur un artefact de rotation', async () => {
    const { handler, commit } = await bootHandler(auth)
    const renouvelee = validSession()
    mockReadPersistedSession.mockReturnValue(renouvelee)
    mockSetAccessToken.mockClear()

    await handler('SIGNED_OUT', null)

    expect(commit).not.toHaveBeenCalledWith('CLEAR_AUTH')
    expect(commit).toHaveBeenCalledWith('SET_AUTH', {
      userId: 'user-1',
      token: 'jwt.renouvele',
      refreshToken: 'refresh.neuf',
    })
    expect(mockSetAccessToken).toHaveBeenCalledWith('jwt.renouvele')
  })

  it('purge sur une déconnexion volontaire depuis cet onglet', async () => {
    const { handler, commit } = await bootHandler(auth)
    // Course : le stockage n'a pas encore été vidé par Supabase.
    mockReadPersistedSession.mockReturnValue(validSession())
    mockIsExplicitlyLoggedOut.mockReturnValue(true)

    await handler('SIGNED_OUT', null)

    expect(commit).toHaveBeenCalledWith('CLEAR_AUTH')
    expect(mockSetAccessToken).toHaveBeenCalledWith(null)
  })

  it('purge sur une déconnexion relayée depuis un autre onglet', async () => {
    const { handler, commit } = await bootHandler(auth)
    mockReadPersistedSession.mockReturnValue(null)

    await handler('SIGNED_OUT', null)

    expect(commit).toHaveBeenCalledWith('CLEAR_AUTH')
  })

  it('purge si la relecture de session échoue', async () => {
    const { handler, commit } = await bootHandler(auth)
    mockReadPersistedSession.mockReturnValue(null)

    await handler('SIGNED_OUT', null)

    expect(commit).toHaveBeenCalledWith('CLEAR_AUTH')
  })

  it('conserve l\'id courant si la session persistée n\'a pas d\'objet user', async () => {
    const { handler, commit } = await bootHandler(auth)
    mockReadPersistedSession.mockReturnValue(validSession({ user: undefined }))

    await handler('SIGNED_OUT', null)

    expect(commit).toHaveBeenCalledWith('SET_AUTH', expect.objectContaining({ userId: 'user-1' }))
  })

  // RÉGRESSION 2026-07-18 : le handler appelait `getSessionOnce()`. Or signOut()
  // détient le verrou d'auth pendant qu'il notifie ses abonnés ET attend leur retour
  // (`await Promise.all`). getSession() y reprend le même verrou → blocage 10 s,
  // signOut() jamais terminé, stockage non purgé, autres onglets toujours connectés.
  it('n\'appelle JAMAIS getSession() depuis le handler (interblocage avec signOut)', async () => {
    const { handler } = await bootHandler(auth)
    mockGetSession.mockClear()
    mockReadPersistedSession.mockReturnValue(null)

    await handler('SIGNED_OUT', null)
    await handler('SIGNED_IN', validSession())

    expect(mockGetSession).not.toHaveBeenCalled()
    expect(mockReadPersistedSession).toHaveBeenCalled()
  })

  it('libère la souscription précédente avant d\'en poser une nouvelle', async () => {
    const { unsubscribe } = await bootHandler(auth)
    expect(unsubscribe).not.toHaveBeenCalled()

    await bootHandler(auth)

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(2)
  })

  it('applique normalement un événement porteur de session', async () => {
    const { handler, commit } = await bootHandler(auth)
    mockReadPersistedSession.mockClear()

    await handler('TOKEN_REFRESHED', validSession({ access_token: 'jwt.frais' }))

    expect(commit).toHaveBeenCalledWith('SET_AUTH', expect.objectContaining({ token: 'jwt.frais' }))
    expect(commit).not.toHaveBeenCalledWith('CLEAR_AUTH')
    // Chemin nominal : aucune relecture de stockage nécessaire.
    expect(mockReadPersistedSession).not.toHaveBeenCalled()
  })
})
