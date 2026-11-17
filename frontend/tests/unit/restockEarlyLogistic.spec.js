import { createRecentFlight } from '@/utils/recentFlight'
import {
  logisticReadKey,
  rememberLogisticConfigIds,
  recallLogisticConfigIds,
  startEarlyLogisticRead,
} from '@/utils/restockEarlyLogistic'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Stockage factice minimal (même interface que localStorage). */
function fakeStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: jest.fn((k) => (k in data ? data[k] : null)),
    setItem: jest.fn((k, v) => {
      data[k] = String(v)
    }),
  }
}

const KEY = 'restock:logistic-config-ids:sp-1'

describe('logisticReadKey', () => {
  it('ne dépend ni de l ordre ni du type des ids, ni du conteneur (Set ou tableau)', () => {
    const a = logisticReadKey('sp-1', new Set(['cfg-b', 'cfg-a']))
    expect(a).toBe('logistic:sp-1:cfg-a,cfg-b')
    expect(logisticReadKey('sp-1', ['cfg-a', 'cfg-b'])).toBe(a)
    expect(logisticReadKey('sp-1', [2, 1])).toBe('logistic:sp-1:1,2')
  })

  it('garde le format historique de la vue (espace + ids triés)', () => {
    const ids = Array.from(new Set(['c2', 'c1']))
    expect(logisticReadKey('sp', ids)).toBe(`logistic:sp:${[...ids].map(String).sort().join(',')}`)
  })

  it('change avec l espace ou les configs', () => {
    expect(logisticReadKey('sp-1', ['a'])).not.toBe(logisticReadKey('sp-2', ['a']))
    expect(logisticReadKey('sp-1', ['a'])).not.toBe(logisticReadKey('sp-1', ['a', 'b']))
  })
})

describe('rememberLogisticConfigIds / recallLogisticConfigIds', () => {
  it('rejoue les ids mémorisés, une clé par espace', () => {
    const storage = fakeStorage()
    expect(rememberLogisticConfigIds(storage, 'sp-1', ['synthetic-restock'])).toBe(true)
    expect(rememberLogisticConfigIds(storage, 'sp-2', ['cfg-x', 'cfg-y'])).toBe(true)
    expect(storage.data[KEY]).toBe('["synthetic-restock"]')
    expect(recallLogisticConfigIds(storage, 'sp-1')).toEqual(['synthetic-restock'])
    expect(recallLogisticConfigIds(storage, 'sp-2')).toEqual(['cfg-x', 'cfg-y'])
  })

  it('accepte un Set et des ids numériques, sans doublon', () => {
    const storage = fakeStorage()
    rememberLogisticConfigIds(storage, 'sp-1', new Set([1, '1', 'a']))
    expect(recallLogisticConfigIds(storage, 'sp-1')).toEqual(['1', 'a'])
  })

  it('n écrit rien quand la liste est vide ou sans id exploitable', () => {
    const storage = fakeStorage()
    expect(rememberLogisticConfigIds(storage, 'sp-1', [])).toBe(false)
    expect(rememberLogisticConfigIds(storage, 'sp-1', new Set())).toBe(false)
    expect(rememberLogisticConfigIds(storage, 'sp-1', [null, '', undefined])).toBe(false)
    expect(rememberLogisticConfigIds(storage, 'sp-1', undefined)).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('une liste vide ne remplace pas une mémoire existante', () => {
    const storage = fakeStorage({ [KEY]: '["cfg-a"]' })
    rememberLogisticConfigIds(storage, 'sp-1', [])
    expect(recallLogisticConfigIds(storage, 'sp-1')).toEqual(['cfg-a'])
  })

  it('plafonne à 20 ids', () => {
    const storage = fakeStorage()
    const many = Array.from({ length: 35 }, (_, i) => `cfg-${i}`)
    rememberLogisticConfigIds(storage, 'sp-1', many)
    expect(JSON.parse(storage.data[KEY])).toHaveLength(20)
    expect(recallLogisticConfigIds(storage, 'sp-1')).toEqual(many.slice(0, 20))
  })

  it('ne lève pas quand le stockage est plein (setItem lève)', () => {
    const storage = {
      setItem: jest.fn(() => {
        throw new Error('QuotaExceededError')
      }),
    }
    expect(() => rememberLogisticConfigIds(storage, 'sp-1', ['cfg-a'])).not.toThrow()
    expect(rememberLogisticConfigIds(storage, 'sp-1', ['cfg-a'])).toBe(false)
  })

  it('ne lève pas quand le stockage est indisponible (null, undefined, getItem lève)', () => {
    expect(rememberLogisticConfigIds(null, 'sp-1', ['a'])).toBe(false)
    expect(rememberLogisticConfigIds(undefined, 'sp-1', ['a'])).toBe(false)
    expect(recallLogisticConfigIds(null, 'sp-1')).toEqual([])
    expect(recallLogisticConfigIds(undefined, 'sp-1')).toEqual([])
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(recallLogisticConfigIds(throwing, 'sp-1')).toEqual([])
  })

  it('rend [] sans espace', () => {
    const storage = fakeStorage()
    expect(rememberLogisticConfigIds(storage, '', ['a'])).toBe(false)
    expect(recallLogisticConfigIds(storage, '')).toEqual([])
    expect(recallLogisticConfigIds(storage, undefined)).toEqual([])
  })

  it('rend [] quand la mémoire est absente', () => {
    expect(recallLogisticConfigIds(fakeStorage(), 'sp-1')).toEqual([])
  })

  it('rend [] quand la mémoire est invalide (JSON cassé, mauvaise forme)', () => {
    expect(recallLogisticConfigIds(fakeStorage({ [KEY]: '{pas du json' }), 'sp-1')).toEqual([])
    expect(recallLogisticConfigIds(fakeStorage({ [KEY]: '"cfg-a"' }), 'sp-1')).toEqual([])
    expect(recallLogisticConfigIds(fakeStorage({ [KEY]: '{"a":1}' }), 'sp-1')).toEqual([])
    expect(recallLogisticConfigIds(fakeStorage({ [KEY]: '[1,2]' }), 'sp-1')).toEqual([])
    expect(recallLogisticConfigIds(fakeStorage({ [KEY]: '["a",null]' }), 'sp-1')).toEqual([])
    expect(recallLogisticConfigIds(fakeStorage({ [KEY]: '[""]' }), 'sp-1')).toEqual([])
    expect(recallLogisticConfigIds(fakeStorage({ [KEY]: '' }), 'sp-1')).toEqual([])
  })

  it('plafonne aussi à la relecture si la valeur stockée est démesurée', () => {
    const many = Array.from({ length: 50 }, (_, i) => `cfg-${i}`)
    const storage = fakeStorage({ [KEY]: JSON.stringify(many) })
    expect(recallLogisticConfigIds(storage, 'sp-1')).toHaveLength(20)
  })
})

describe('startEarlyLogisticRead', () => {
  it('ne fait rien sans espace, sans ids, sans partage ou sans fonction de lecture', () => {
    const recentReads = createRecentFlight({ ttlMs: 1000 })
    const loadIndex = jest.fn().mockResolvedValue({ index: {} })
    const base = { spaceId: 'sp-1', configIds: ['cfg-a'], validConfigIds: ['cfg-a'], recentReads, loadIndex }

    expect(startEarlyLogisticRead({ ...base, spaceId: '' })).toBeNull()
    expect(startEarlyLogisticRead({ ...base, spaceId: undefined })).toBeNull()
    expect(startEarlyLogisticRead({ ...base, configIds: [] })).toBeNull()
    expect(startEarlyLogisticRead({ ...base, configIds: undefined })).toBeNull()
    expect(startEarlyLogisticRead({ ...base, recentReads: undefined })).toBeNull()
    expect(startEarlyLogisticRead({ ...base, loadIndex: undefined })).toBeNull()
    expect(startEarlyLogisticRead()).toBeNull()
    expect(loadIndex).not.toHaveBeenCalled()
  })

  it('lance la lecture pour des configs existantes', async () => {
    const recentReads = createRecentFlight({ ttlMs: 1000 })
    const loadIndex = jest.fn().mockResolvedValue({ index: {} })
    const started = startEarlyLogisticRead({
      spaceId: 'sp-1',
      configIds: ['cfg-b', 'cfg-a'],
      validConfigIds: ['cfg-a', 'cfg-b', 'cfg-c'],
      recentReads,
      loadIndex,
    })
    expect(started).not.toBeNull()
    expect(loadIndex).toHaveBeenCalledTimes(1)
    expect(loadIndex).toHaveBeenCalledWith({ spaceId: 'sp-1', configIds: ['cfg-b', 'cfg-a'] })
    await started
  })

  it('accepte synthetic-restock même absent des configs existantes', () => {
    const recentReads = createRecentFlight({ ttlMs: 1000 })
    const loadIndex = jest.fn().mockResolvedValue({ index: {} })
    const started = startEarlyLogisticRead({
      spaceId: 'sp-1',
      configIds: ['synthetic-restock'],
      validConfigIds: [],
      recentReads,
      loadIndex,
    })
    expect(started).not.toBeNull()
    expect(loadIndex).toHaveBeenCalledWith({ spaceId: 'sp-1', configIds: ['synthetic-restock'] })
  })

  it('ignore la mémoire dès qu un id est inconnu (config supprimée depuis), sans validConfigIds non plus', () => {
    const recentReads = createRecentFlight({ ttlMs: 1000 })
    const loadIndex = jest.fn().mockResolvedValue({ index: {} })
    expect(
      startEarlyLogisticRead({
        spaceId: 'sp-1',
        configIds: ['cfg-a', 'cfg-supprimee'],
        validConfigIds: ['cfg-a'],
        recentReads,
        loadIndex,
      }),
    ).toBeNull()
    expect(
      startEarlyLogisticRead({ spaceId: 'sp-1', configIds: ['cfg-a'], recentReads, loadIndex }),
    ).toBeNull()
    expect(loadIndex).not.toHaveBeenCalled()
  })

  it('compare les ids valides en texte (id numérique côté config)', () => {
    const recentReads = createRecentFlight({ ttlMs: 1000 })
    const loadIndex = jest.fn().mockResolvedValue({ index: {} })
    const started = startEarlyLogisticRead({
      spaceId: 'sp-1',
      configIds: ['12'],
      validConfigIds: [12],
      recentReads,
      loadIndex,
    })
    expect(started).not.toBeNull()
  })

  it('partage la lecture avec le flux normal : un seul appel réseau (en vol puis récent)', async () => {
    const recentReads = createRecentFlight({ ttlMs: 15000 })
    const d = deferred()
    const loadIndex = jest.fn(() => d.promise)
    const configIds = ['synthetic-restock']

    const early = startEarlyLogisticRead({
      spaceId: 'sp-1',
      configIds,
      validConfigIds: [],
      recentReads,
      loadIndex,
    })

    // Flux normal de la vue (loadLogisticRemaining) : même clé, lecture en vol réutilisée.
    const normalInFlight = recentReads.run(logisticReadKey('sp-1', new Set(configIds)), () =>
      loadIndex({ spaceId: 'sp-1', configIds }),
    )
    d.resolve({ index: { x: 1 } })
    await early
    expect(await normalInFlight).toEqual({ index: { x: 1 } })
    expect(loadIndex).toHaveBeenCalledTimes(1)

    // Appel normal plus tardif : résultat récent, toujours un seul appel.
    const later = await recentReads.run(logisticReadKey('sp-1', configIds), () =>
      loadIndex({ spaceId: 'sp-1', configIds }),
    )
    expect(later).toEqual({ index: { x: 1 } })
    expect(loadIndex).toHaveBeenCalledTimes(1)
  })

  it('mémoire fausse : le flux normal relance son propre appel, résultat intact', async () => {
    const recentReads = createRecentFlight({ ttlMs: 15000 })
    const loadIndex = jest
      .fn()
      .mockResolvedValueOnce({ index: { devine: true } })
      .mockResolvedValueOnce({ index: { reel: true } })

    await startEarlyLogisticRead({
      spaceId: 'sp-1',
      configIds: ['cfg-a'],
      validConfigIds: ['cfg-a', 'cfg-b'],
      recentReads,
      loadIndex,
    })
    const real = await recentReads.run(logisticReadKey('sp-1', ['cfg-b']), () =>
      loadIndex({ spaceId: 'sp-1', configIds: ['cfg-b'] }),
    )
    expect(real).toEqual({ index: { reel: true } })
    expect(loadIndex).toHaveBeenCalledTimes(2)
  })

  it('un appel normal fresh ignore la lecture anticipée et relance', async () => {
    const recentReads = createRecentFlight({ ttlMs: 15000 })
    const loadIndex = jest.fn().mockResolvedValue({ index: {} })
    const configIds = ['cfg-a']
    await startEarlyLogisticRead({ spaceId: 'sp-1', configIds, validConfigIds: configIds, recentReads, loadIndex })
    await recentReads.run(logisticReadKey('sp-1', configIds), () => loadIndex({ spaceId: 'sp-1', configIds }), {
      fresh: true,
    })
    expect(loadIndex).toHaveBeenCalledTimes(2)
  })

  it('avale le rejet, sans rejet non géré, et laisse le flux normal réessayer', async () => {
    const recentReads = createRecentFlight({ ttlMs: 15000 })
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    const loadIndex = jest
      .fn()
      .mockRejectedValueOnce(new Error('réseau'))
      .mockResolvedValueOnce({ index: { ok: true } })
    const configIds = ['cfg-a']

    const early = startEarlyLogisticRead({
      spaceId: 'sp-1',
      configIds,
      validConfigIds: configIds,
      recentReads,
      loadIndex,
    })
    await expect(early).resolves.toBeUndefined()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(unhandled).not.toHaveBeenCalled()
    process.removeListener('unhandledRejection', unhandled)

    // Un échec n'est jamais gardé : l'appel normal relance la lecture.
    const normal = await recentReads.run(logisticReadKey('sp-1', configIds), () =>
      loadIndex({ spaceId: 'sp-1', configIds }),
    )
    expect(normal).toEqual({ index: { ok: true } })
    expect(loadIndex).toHaveBeenCalledTimes(2)
  })

  it('ne lève pas si la lecture lève de façon synchrone', async () => {
    const recentReads = createRecentFlight({ ttlMs: 15000 })
    const loadIndex = jest.fn(() => {
      throw new Error('boum')
    })
    let started
    expect(() => {
      started = startEarlyLogisticRead({
        spaceId: 'sp-1',
        configIds: ['cfg-a'],
        validConfigIds: ['cfg-a'],
        recentReads,
        loadIndex,
      })
    }).not.toThrow()
    await expect(started).resolves.toBeUndefined()
  })

  it('n écrit rien d autre : retourne une promesse vide, jamais l index', async () => {
    const recentReads = createRecentFlight({ ttlMs: 15000 })
    const loadIndex = jest.fn().mockResolvedValue({ index: { secret: 1 } })
    const result = await startEarlyLogisticRead({
      spaceId: 'sp-1',
      configIds: ['cfg-a'],
      validConfigIds: ['cfg-a'],
      recentReads,
      loadIndex,
    })
    expect(result).toBeUndefined()
  })
})
