import {
  startDefaultRangePreference,
  waitForPreferencesReady,
  PREFERENCES_READY_TIMEOUT_MS,
} from '@/utils/startupPreferences'

const VALID = ['all', 'last12months', 'month', 'quarter']

// Vide la file de microtâches (les promesses se résolvent sans avancer les faux timers).
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

// Promesse résolue/rejetée à la main, pour simuler une lecture lente.
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('startDefaultRangePreference', () => {
  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  it('lance la lecture immédiatement (avant tout await)', () => {
    const fetchPreferences = jest.fn(() => new Promise(() => {}))
    startDefaultRangePreference({ fetchPreferences, applyPreset: jest.fn(), validPresets: VALID })
    expect(fetchPreferences).toHaveBeenCalledTimes(1)
  })

  it('applique une préférence valide AVANT la résolution de ready', async () => {
    const order = []
    const applyPreset = jest.fn((preset) => order.push(`apply:${preset}`))
    const ready = startDefaultRangePreference({
      fetchPreferences: () => Promise.resolve({ defaultDateRangePreset: 'month' }),
      applyPreset,
      validPresets: VALID,
    })
    ready.then((outcome) => order.push(`ready:${outcome}`))
    await expect(ready).resolves.toBe('applied')
    await flush()
    expect(applyPreset).toHaveBeenCalledWith('month')
    expect(order).toEqual(['apply:month', 'ready:applied'])
  })

  it("préférence invalide ou vide : 'unchanged' sans applyPreset", async () => {
    const cases = [
      { defaultDateRangePreset: 'periode-inconnue' },
      { defaultDateRangePreset: '' },
      {},
      null,
      undefined,
    ]
    for (const prefs of cases) {
      const applyPreset = jest.fn()
      const ready = startDefaultRangePreference({
        fetchPreferences: () => Promise.resolve(prefs),
        applyPreset,
        validPresets: VALID,
      })
      await expect(ready).resolves.toBe('unchanged')
      expect(applyPreset).not.toHaveBeenCalled()
    }
  })

  it("rejet de la lecture : 'failed', warn appelé, ready ne rejette pas", async () => {
    const warn = jest.fn()
    const applyPreset = jest.fn()
    const ready = startDefaultRangePreference({
      fetchPreferences: () => Promise.reject(new Error('503 indisponible')),
      applyPreset,
      validPresets: VALID,
      warn,
    })
    await expect(ready).resolves.toBe('failed')
    expect(applyPreset).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('503 indisponible')
  })

  it("lecture qui lève en synchrone : 'failed' sans exception", async () => {
    const warn = jest.fn()
    const ready = startDefaultRangePreference({
      fetchPreferences: () => { throw new Error('boom') },
      applyPreset: jest.fn(),
      validPresets: VALID,
      warn,
    })
    await expect(ready).resolves.toBe('failed')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("applyPreset qui lève : 'failed', ready ne rejette pas", async () => {
    const warn = jest.fn()
    const ready = startDefaultRangePreference({
      fetchPreferences: () => Promise.resolve({ defaultDateRangePreset: 'month' }),
      applyPreset: () => { throw new Error('commit refusé') },
      validPresets: VALID,
      warn,
    })
    await expect(ready).resolves.toBe('failed')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("lenteur au-delà du plafond : 'timeout', puis application tardive à l'arrivée", async () => {
    const read = deferred()
    const applyPreset = jest.fn()
    let outcome = null
    const ready = startDefaultRangePreference({
      fetchPreferences: () => read.promise,
      applyPreset,
      validPresets: VALID,
      timeoutMs: 1500,
    })
    ready.then((o) => { outcome = o })

    jest.advanceTimersByTime(1499)
    await flush()
    expect(outcome).toBeNull()

    jest.advanceTimersByTime(1)
    await expect(ready).resolves.toBe('timeout')
    expect(applyPreset).not.toHaveBeenCalled()

    // La lecture aboutit après le plafond : la préférence est appliquée quand même.
    read.resolve({ defaultDateRangePreset: 'quarter' })
    await flush()
    expect(applyPreset).toHaveBeenCalledTimes(1)
    expect(applyPreset).toHaveBeenCalledWith('quarter')
    expect(outcome).toBe('timeout')
  })

  it("échec après le plafond : warn appelé, 'timeout' conservé, aucune exception", async () => {
    const read = deferred()
    const warn = jest.fn()
    const ready = startDefaultRangePreference({
      fetchPreferences: () => read.promise,
      applyPreset: jest.fn(),
      validPresets: VALID,
      timeoutMs: 1500,
      warn,
    })
    jest.advanceTimersByTime(1500)
    await expect(ready).resolves.toBe('timeout')
    read.reject(new Error('trop tard'))
    await flush()
    expect(warn).toHaveBeenCalledTimes(1)
    await expect(ready).resolves.toBe('timeout')
  })

  it('plafond non déclenché (timer nettoyé) si la lecture finit avant', async () => {
    const applyPreset = jest.fn()
    const ready = startDefaultRangePreference({
      fetchPreferences: () => Promise.resolve({ defaultDateRangePreset: 'all' }),
      applyPreset,
      validPresets: VALID,
      timeoutMs: 1500,
    })
    await expect(ready).resolves.toBe('applied')
    expect(jest.getTimerCount()).toBe(0)
    jest.advanceTimersByTime(5000)
    expect(applyPreset).toHaveBeenCalledTimes(1)
    await expect(ready).resolves.toBe('applied')
  })

  it("timer nettoyé aussi sur échec et sur préférence absente", async () => {
    await startDefaultRangePreference({
      fetchPreferences: () => Promise.reject(new Error('x')),
      applyPreset: jest.fn(),
      validPresets: VALID,
    })
    expect(jest.getTimerCount()).toBe(0)
    await startDefaultRangePreference({
      fetchPreferences: () => Promise.resolve({}),
      applyPreset: jest.fn(),
      validPresets: VALID,
    })
    expect(jest.getTimerCount()).toBe(0)
  })

  it('plafond par défaut de 1500 ms', async () => {
    expect(PREFERENCES_READY_TIMEOUT_MS).toBe(1500)
    let outcome = null
    const ready = startDefaultRangePreference({
      fetchPreferences: () => new Promise(() => {}),
      applyPreset: jest.fn(),
      validPresets: VALID,
    })
    ready.then((o) => { outcome = o })
    jest.advanceTimersByTime(1499)
    await flush()
    expect(outcome).toBeNull()
    jest.advanceTimersByTime(1)
    await expect(ready).resolves.toBe('timeout')
  })
})

describe('waitForPreferencesReady', () => {
  it('ne lève pas pour undefined ni null', async () => {
    await expect(waitForPreferencesReady(undefined)).resolves.toBeUndefined()
    await expect(waitForPreferencesReady(null)).resolves.toBeUndefined()
  })

  it('ne lève pas pour une promesse rejetée', async () => {
    await expect(waitForPreferencesReady(Promise.reject(new Error('KO')))).resolves.toBeUndefined()
  })

  it("attend la promesse et renvoie sa valeur ('applied', 'timeout'...)", async () => {
    await expect(waitForPreferencesReady(Promise.resolve('applied'))).resolves.toBe('applied')
  })
})

describe('startDefaultRangePreference avec cache (stale-while-revalidate)', () => {
  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  // Montage commun : lecture distante pilotée à la main, cache et store simulés.
  const setup = ({ cached, timeoutMs = 1500, ...overrides } = {}) => {
    const read = deferred()
    const applyPreset = jest.fn()
    const readCached = jest.fn(() => cached)
    const writeCached = jest.fn()
    const warn = jest.fn()
    const state = { outcome: null }
    const ready = startDefaultRangePreference({
      fetchPreferences: () => read.promise,
      applyPreset,
      validPresets: VALID,
      timeoutMs,
      warn,
      readCached,
      writeCached,
      ...overrides,
    })
    ready.then((o) => { state.outcome = o })
    return { read, applyPreset, readCached, writeCached, warn, ready, state }
  }

  it("cache valide : appliqué avant la réponse distante, ready = 'cached' sans l'attendre", async () => {
    const { applyPreset, ready, state } = setup({ cached: 'month' })
    expect(applyPreset).toHaveBeenCalledTimes(1)
    expect(applyPreset).toHaveBeenCalledWith('month')
    // La lecture distante n'a toujours pas répondu (promesse jamais résolue ici).
    await expect(ready).resolves.toBe('cached')
    expect(state.outcome).toBe('cached')
    expect(jest.getTimerCount()).toBe(0)
  })

  it('la lecture distante part toujours immédiatement, avant la lecture du cache', () => {
    const order = []
    startDefaultRangePreference({
      fetchPreferences: () => { order.push('fetch'); return new Promise(() => {}) },
      applyPreset: jest.fn(),
      validPresets: VALID,
      readCached: () => { order.push('readCached'); return 'month' },
      writeCached: jest.fn(),
    })
    expect(order).toEqual(['fetch', 'readCached'])
  })

  it('cache invalide ou absent : comportement actuel (ready attend la lecture distante)', async () => {
    for (const cached of ['periode-inconnue', '', null, undefined]) {
      const { read, applyPreset, ready, state } = setup({ cached })
      await flush()
      expect(applyPreset).not.toHaveBeenCalled()
      expect(state.outcome).toBeNull()
      read.resolve({ defaultDateRangePreset: 'quarter' })
      await expect(ready).resolves.toBe('applied')
      expect(applyPreset).toHaveBeenCalledTimes(1)
      expect(applyPreset).toHaveBeenCalledWith('quarter')
    }
  })

  it('cache invalide ou absent : le plafond reste en place', async () => {
    const { ready, applyPreset } = setup({ cached: 'periode-inconnue', timeoutMs: 1500 })
    jest.advanceTimersByTime(1500)
    await expect(ready).resolves.toBe('timeout')
    expect(applyPreset).not.toHaveBeenCalled()
  })

  it('réponse distante identique au cache : pas de second applyPreset, cache réécrit', async () => {
    const { read, applyPreset, writeCached, state } = setup({ cached: 'month' })
    read.resolve({ defaultDateRangePreset: 'month' })
    await flush()
    expect(applyPreset).toHaveBeenCalledTimes(1)
    expect(writeCached).toHaveBeenCalledWith('month')
    expect(state.outcome).toBe('cached')
  })

  it('réponse distante différente : applyPreset tardif et writeCached, ready reste cached', async () => {
    const { read, applyPreset, writeCached, state } = setup({ cached: 'month' })
    read.resolve({ defaultDateRangePreset: 'quarter' })
    await flush()
    expect(applyPreset.mock.calls).toEqual([['month'], ['quarter']])
    expect(writeCached).toHaveBeenCalledTimes(1)
    expect(writeCached).toHaveBeenCalledWith('quarter')
    expect(state.outcome).toBe('cached')
  })

  it('cache absent et réponse valide : appliquée et mémorisée', async () => {
    const { read, applyPreset, writeCached, ready } = setup({ cached: null })
    read.resolve({ defaultDateRangePreset: 'all' })
    await expect(ready).resolves.toBe('applied')
    expect(applyPreset).toHaveBeenCalledWith('all')
    expect(writeCached).toHaveBeenCalledWith('all')
  })

  it('compte sans préférence et cache appliqué : applyPreset(null) et writeCached(null)', async () => {
    const { read, applyPreset, writeCached, state } = setup({ cached: 'month' })
    read.resolve({})
    await flush()
    expect(applyPreset.mock.calls).toEqual([['month'], [null]])
    expect(writeCached).toHaveBeenCalledTimes(1)
    expect(writeCached).toHaveBeenCalledWith(null)
    expect(state.outcome).toBe('cached')
  })

  it("réponse distante invalide ou nulle avec cache : même retour au défaut", async () => {
    for (const prefs of [{ defaultDateRangePreset: 'periode-inconnue' }, null, undefined]) {
      const { read, applyPreset, writeCached } = setup({ cached: 'quarter' })
      read.resolve(prefs)
      await flush()
      expect(applyPreset.mock.calls).toEqual([['quarter'], [null]])
      expect(writeCached).toHaveBeenCalledWith(null)
    }
  })

  it("compte sans préférence et sans cache : 'unchanged', writeCached(null), aucun applyPreset", async () => {
    const { read, applyPreset, writeCached, ready } = setup({ cached: null })
    read.resolve({})
    await expect(ready).resolves.toBe('unchanged')
    expect(applyPreset).not.toHaveBeenCalled()
    expect(writeCached).toHaveBeenCalledWith(null)
  })

  it('échec distant : cache conservé, aucun writeCached ni nouvel applyPreset, warn appelé', async () => {
    const { read, applyPreset, writeCached, warn, state } = setup({ cached: 'month' })
    read.reject(new Error('503 indisponible'))
    await flush()
    expect(applyPreset).toHaveBeenCalledTimes(1)
    expect(applyPreset).toHaveBeenCalledWith('month')
    expect(writeCached).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('503 indisponible')
    expect(state.outcome).toBe('cached')
  })

  it("échec distant sans cache : 'failed' comme avant, aucun writeCached", async () => {
    const { read, writeCached, ready } = setup({ cached: null })
    read.reject(new Error('KO'))
    await expect(ready).resolves.toBe('failed')
    expect(writeCached).not.toHaveBeenCalled()
  })

  it('lecture distante qui lève en synchrone avec cache : cache appliqué, warn, pas d exception', async () => {
    const warn = jest.fn()
    const applyPreset = jest.fn()
    const writeCached = jest.fn()
    const ready = startDefaultRangePreference({
      fetchPreferences: () => { throw new Error('boom') },
      applyPreset,
      validPresets: VALID,
      warn,
      readCached: () => 'month',
      writeCached,
    })
    await expect(ready).resolves.toBe('cached')
    await flush()
    expect(applyPreset).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(writeCached).not.toHaveBeenCalled()
  })

  it('exception de readCached ignorée : comme sans cache', async () => {
    const { read, applyPreset, ready, state } = setup({
      readCached: () => { throw new Error('storage bloqué') },
    })
    await flush()
    expect(applyPreset).not.toHaveBeenCalled()
    expect(state.outcome).toBeNull()
    read.resolve({ defaultDateRangePreset: 'quarter' })
    await expect(ready).resolves.toBe('applied')
    expect(applyPreset).toHaveBeenCalledWith('quarter')
  })

  it('exception de writeCached ignorée : la préférence est quand même appliquée', async () => {
    const { read, applyPreset, warn, ready } = setup({
      cached: null,
      writeCached: () => { throw new Error('quota dépassé') },
    })
    read.resolve({ defaultDateRangePreset: 'quarter' })
    await expect(ready).resolves.toBe('applied')
    expect(applyPreset).toHaveBeenCalledWith('quarter')
    expect(warn).not.toHaveBeenCalled()
  })

  it('exception de writeCached ignorée aussi pour le retour au défaut', async () => {
    const { read, applyPreset, warn, state } = setup({
      cached: 'month',
      writeCached: () => { throw new Error('quota dépassé') },
    })
    read.resolve({})
    await flush()
    expect(applyPreset.mock.calls).toEqual([['month'], [null]])
    expect(warn).not.toHaveBeenCalled()
    expect(state.outcome).toBe('cached')
  })

  it('réponse distante après le plafond sans cache : application tardive et writeCached', async () => {
    const { read, applyPreset, writeCached, ready } = setup({ cached: null, timeoutMs: 1500 })
    jest.advanceTimersByTime(1500)
    await expect(ready).resolves.toBe('timeout')
    expect(applyPreset).not.toHaveBeenCalled()
    read.resolve({ defaultDateRangePreset: 'quarter' })
    await flush()
    expect(applyPreset).toHaveBeenCalledTimes(1)
    expect(applyPreset).toHaveBeenCalledWith('quarter')
    expect(writeCached).toHaveBeenCalledWith('quarter')
    await expect(ready).resolves.toBe('timeout')
  })

  it('réponse distante différente après la résolution de ready ET le délai du plafond', async () => {
    const { read, applyPreset, writeCached, state } = setup({ cached: 'month', timeoutMs: 1500 })
    jest.advanceTimersByTime(10000)
    read.resolve({ defaultDateRangePreset: 'all' })
    await flush()
    expect(applyPreset.mock.calls).toEqual([['month'], ['all']])
    expect(writeCached).toHaveBeenCalledWith('all')
    expect(state.outcome).toBe('cached')
  })

  it("applyPreset qui lève pendant l'étape cache : 'failed', puis la réponse distante s'applique", async () => {
    const read = deferred()
    const warn = jest.fn()
    const applyPreset = jest.fn()
      .mockImplementationOnce(() => { throw new Error('commit refusé') })
    const ready = startDefaultRangePreference({
      fetchPreferences: () => read.promise,
      applyPreset,
      validPresets: VALID,
      warn,
      readCached: () => 'month',
      writeCached: jest.fn(),
    })
    await expect(ready).resolves.toBe('failed')
    expect(warn).toHaveBeenCalledTimes(1)
    read.resolve({ defaultDateRangePreset: 'month' })
    await flush()
    // Le cache n'ayant pas été appliqué, la valeur distante l'est, même identique.
    expect(applyPreset.mock.calls).toEqual([['month'], ['month']])
  })

  it('applyPreset(null) qui lève lors du retour au défaut : warn, aucune exception', async () => {
    const read = deferred()
    const warn = jest.fn()
    const applyPreset = jest.fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => { throw new Error('commit refusé') })
    const ready = startDefaultRangePreference({
      fetchPreferences: () => read.promise,
      applyPreset,
      validPresets: VALID,
      warn,
      readCached: () => 'month',
      writeCached: jest.fn(),
    })
    read.resolve({})
    await flush()
    expect(warn).toHaveBeenCalledTimes(1)
    await expect(ready).resolves.toBe('cached')
  })

  it('readCached présent sans writeCached : le cache est appliqué, rien n est écrit', async () => {
    const { read, applyPreset, ready } = setup({ cached: 'month', writeCached: undefined })
    await expect(ready).resolves.toBe('cached')
    read.resolve({ defaultDateRangePreset: 'quarter' })
    await flush()
    expect(applyPreset.mock.calls).toEqual([['month'], ['quarter']])
  })

  it('readCached absent : comportement strictement inchangé, writeCached seul inutilisé en lecture', async () => {
    const read = deferred()
    const applyPreset = jest.fn()
    const writeCached = jest.fn()
    let outcome = null
    const ready = startDefaultRangePreference({
      fetchPreferences: () => read.promise,
      applyPreset,
      validPresets: VALID,
      writeCached,
    })
    ready.then((o) => { outcome = o })
    await flush()
    expect(applyPreset).not.toHaveBeenCalled()
    expect(outcome).toBeNull()
    read.resolve({ defaultDateRangePreset: 'month' })
    await expect(ready).resolves.toBe('applied')
    expect(applyPreset.mock.calls).toEqual([['month']])
  })
})
