// BUG-389-02 : menu des outils inerte après un redéploiement (chunks obsolètes).
// Couvre la détection des erreurs de chunk, le verrou de rechargement unique,
// le onError des composants asynchrones et la navigation sans rejet silencieux.

import { createRouter, createMemoryHistory } from 'vue-router'
import {
  CHUNK_RELOAD_FLAG,
  isChunkLoadError,
  reloadOnceForChunkError,
  clearChunkReloadFlag,
  handleAsyncComponentError,
  asyncComponentWithChunkReload,
  safePush,
} from '@/utils/chunkReload'

const originalLocation = window.location

function mockLocation(overrides = {}) {
  delete window.location
  window.location = {
    href: '',
    pathname: '/spaces/abc',
    search: '?toolbox=event-predict',
    hash: '',
    reload: jest.fn(),
    ...overrides,
  }
}

afterEach(() => {
  window.location = originalLocation
  window.sessionStorage.clear()
  jest.restoreAllMocks()
})

describe('isChunkLoadError', () => {
  it('reconnaît la ChunkLoadError JS de webpack', () => {
    const err = new Error('Loading chunk 183 failed.\n(error: https://app/js/183.abc.js)')
    err.name = 'ChunkLoadError'
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('reconnaît l\'erreur CSS de mini-css-extract-plugin', () => {
    const err = new Error('Loading CSS chunk 12 failed.\n(error: https://app/css/12.abc.css)')
    err.name = 'ChunkLoadError'
    err.code = 'CSS_CHUNK_LOAD_FAILED'
    err.type = 'error'
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('reconnaît le code CSS seul et les messages seuls', () => {
    expect(isChunkLoadError({ code: 'CSS_CHUNK_LOAD_FAILED' })).toBe(true)
    expect(isChunkLoadError(new Error('Loading chunk 7 failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Loading CSS chunk 7 failed.'))).toBe(true)
  })

  it('reconnaît les messages d\'import dynamique natifs', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://app/x.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
  })

  it('rejette une erreur quelconque et les valeurs vides', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError({})).toBe(false)
  })
})

describe('reloadOnceForChunkError', () => {
  it('pose le verrou et navigue vers la cible une seule fois', () => {
    mockLocation()
    expect(reloadOnceForChunkError('/spaces/abc/logistic')).toBe(true)
    expect(window.location.href).toBe('/spaces/abc/logistic')
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)).toBe('1')

    window.location.href = ''
    expect(reloadOnceForChunkError('/spaces/abc/logistic')).toBe(false)
    expect(window.location.href).toBe('')
  })

  it('recharge la page courante sans cible', () => {
    mockLocation()
    expect(reloadOnceForChunkError()).toBe(true)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
    expect(reloadOnceForChunkError()).toBe(false)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('clearChunkReloadFlag réarme le rechargement', () => {
    mockLocation()
    reloadOnceForChunkError()
    clearChunkReloadFlag()
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)).toBeNull()
    expect(reloadOnceForChunkError()).toBe(true)
    expect(window.location.reload).toHaveBeenCalledTimes(2)
  })

  it('ne recharge pas si le sessionStorage est inaccessible', () => {
    mockLocation()
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => null)
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
    expect(reloadOnceForChunkError()).toBe(false)
    expect(window.location.reload).not.toHaveBeenCalled()
  })
})

describe('onError des composants asynchrones', () => {
  it('appelle fail pour une erreur qui n\'est pas un chunk', () => {
    mockLocation()
    const fail = jest.fn()
    const retry = jest.fn()
    handleAsyncComponentError(new Error('boom'), retry, fail)
    expect(fail).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })

  it('recharge vers l\'URL courante pour un chunk obsolète, puis remonte l\'erreur', () => {
    mockLocation()
    const err = new Error('Loading chunk 183 failed.')
    err.name = 'ChunkLoadError'
    const fail = jest.fn()
    handleAsyncComponentError(err, jest.fn(), fail)
    expect(window.location.href).toBe('/spaces/abc?toolbox=event-predict')
    expect(fail).not.toHaveBeenCalled()

    // Deuxième échec (verrou posé) : pas de boucle, l'erreur remonte.
    handleAsyncComponentError(err, jest.fn(), fail)
    expect(fail).toHaveBeenCalledTimes(1)
  })

  it('asyncComponentWithChunkReload branche le onError', () => {
    const loader = () => Promise.resolve({})
    const comp = asyncComponentWithChunkReload(loader)
    expect(comp.__asyncLoader).toEqual(expect.any(Function))
    expect(comp.name).toBe('AsyncComponentWrapper')
  })
})

describe('safePush', () => {
  it('ignore les échecs de navigation (annulée, dupliquée)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const Stub = { render: () => null }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: Stub },
        { path: '/blocked', component: Stub, beforeEnter: () => false },
        { path: '/broken', component: Stub, beforeEnter: () => { throw new Error('guard boom') } },
      ],
    })
    await router.push('/')
    await safePush(router, '/')
    await safePush(router, '/blocked')
    expect(consoleSpy).not.toHaveBeenCalled()

    // Vue Router journalise aussi l'erreur de garde : on vérifie notre propre trace.
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    await safePush(router, '/broken')
    expect(consoleSpy).toHaveBeenCalledWith('[navigation] échec de navigation', expect.any(Error))
  })

  it('ignore les erreurs de chunk (déjà gérées par router.onError)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('Loading chunk 9 failed.')
    err.name = 'ChunkLoadError'
    await safePush({ push: () => Promise.reject(err) }, '/x')
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('journalise les autres erreurs sans rejeter', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(safePush({ push: () => Promise.reject(new Error('guard boom')) }, '/x')).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('utilise replace quand demandé', async () => {
    const router = { push: jest.fn(), replace: jest.fn(() => Promise.resolve()) }
    await safePush(router, '/x', 'replace')
    expect(router.replace).toHaveBeenCalledWith('/x')
    expect(router.push).not.toHaveBeenCalled()
  })
})
