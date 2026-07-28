import { resolveAuthStateChange, AUTH_EVENT_DECISION } from '@/utils/authSessionEvent'

const NOW = 1_800_000_000_000 // ms
const future = (secs) => Math.floor(NOW / 1000) + secs
const past = (secs) => Math.floor(NOW / 1000) - secs

const session = (overrides = {}) => ({
  access_token: 'jwt.access',
  refresh_token: 'jwt.refresh',
  expires_at: future(3600),
  user: { id: 'user-1' },
  ...overrides,
})

const resolve = (params) => resolveAuthStateChange({ now: NOW, ...params })

describe('resolveAuthStateChange', () => {
  describe('événement porteur d\'une session', () => {
    it('applique une connexion', () => {
      expect(resolve({
        event: 'SIGNED_IN',
        session: session(),
        storedSession: null,
        explicitlyLoggedOut: false,
      })).toBe(AUTH_EVENT_DECISION.APPLY)
    })

    it('applique un refresh de token', () => {
      expect(resolve({
        event: 'TOKEN_REFRESHED',
        session: session(),
        storedSession: session(),
        explicitlyLoggedOut: false,
      })).toBe(AUTH_EVENT_DECISION.APPLY)
    })
  })

  describe('déconnexion volontaire depuis cet onglet', () => {
    // `signOut()` appelle clearAccessToken() AVANT supabase.auth.signOut() : le drapeau
    // est déjà levé quand l'événement arrive.
    it('purge, même si le stockage n\'a pas encore été vidé par Supabase', () => {
      expect(resolve({
        event: 'SIGNED_OUT',
        session: null,
        storedSession: session(), // course : ancienne session encore présente
        explicitlyLoggedOut: true,
      })).toBe(AUTH_EVENT_DECISION.CLEAR)
    })
  })

  describe('déconnexion relayée depuis un autre onglet', () => {
    // Comportement voulu de Supabase : se déconnecter dans un onglet déconnecte les
    // autres. Le stockage a été vidé par la diffusion, donc plus de session lisible.
    it('purge', () => {
      expect(resolve({
        event: 'SIGNED_OUT',
        session: null,
        storedSession: null,
        explicitlyLoggedOut: false,
      })).toBe(AUTH_EVENT_DECISION.CLEAR)
    })
  })

  describe('artefact de rotation du refresh token (le bug)', () => {
    // L'onglet perdant reçoit SIGNED_OUT alors que l'onglet gagnant vient d'écrire une
    // session neuve dans le stockage.
    it('ignore l\'événement quand la session persistée est encore valide', () => {
      expect(resolve({
        event: 'SIGNED_OUT',
        session: null,
        storedSession: session({ access_token: 'jwt.renouvele' }),
        explicitlyLoggedOut: false,
      })).toBe(AUTH_EVENT_DECISION.IGNORE)
    })

    it('purge si la session persistée est expirée — ce n\'est pas une rotation', () => {
      expect(resolve({
        event: 'SIGNED_OUT',
        session: null,
        storedSession: session({ expires_at: past(60) }),
        explicitlyLoggedOut: false,
      })).toBe(AUTH_EVENT_DECISION.CLEAR)
    })

    it('purge si la session persistée n\'a pas de token', () => {
      expect(resolve({
        event: 'SIGNED_OUT',
        session: null,
        storedSession: { user: { id: 'user-1' } },
        explicitlyLoggedOut: false,
      })).toBe(AUTH_EVENT_DECISION.CLEAR)
    })

    it('tolère une session sans `expires_at`', () => {
      expect(resolve({
        event: 'SIGNED_OUT',
        session: null,
        storedSession: session({ expires_at: undefined }),
        explicitlyLoggedOut: false,
      })).toBe(AUTH_EVENT_DECISION.IGNORE)
    })
  })

  describe('autres événements sans session', () => {
    it('purge sur INITIAL_SESSION sans session, sans considérer le stockage', () => {
      expect(resolve({
        event: 'INITIAL_SESSION',
        session: null,
        storedSession: session(),
        explicitlyLoggedOut: false,
      })).toBe(AUTH_EVENT_DECISION.CLEAR)
    })
  })

  describe('bornes de validité', () => {
    it('considère comme expirée une session dont l\'échéance est dépassée d\'une seconde', () => {
      expect(resolve({
        event: 'SIGNED_OUT',
        session: null,
        storedSession: session({ expires_at: past(1) }),
        explicitlyLoggedOut: false,
      })).toBe(AUTH_EVENT_DECISION.CLEAR)
    })

    it('considère comme valide une session expirant dans une seconde', () => {
      expect(resolve({
        event: 'SIGNED_OUT',
        session: null,
        storedSession: session({ expires_at: future(1) }),
        explicitlyLoggedOut: false,
      })).toBe(AUTH_EVENT_DECISION.IGNORE)
    })
  })
})
