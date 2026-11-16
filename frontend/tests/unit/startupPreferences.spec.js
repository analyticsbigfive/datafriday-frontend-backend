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
