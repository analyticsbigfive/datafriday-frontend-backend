import { buildPreviousInventoryKey, readPreviousInventorySources } from '@/utils/restockPreviousInventory'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const baseKey = {
  spaceId: 'sp-1',
  configIds: new Set(['cfg-b', 'cfg-a']),
  countsEventId: 'ev-2',
  sourceInventoryEventId: null,
  objectiveSource: 'forecast',
  selectedEventIds: ['ev-2', 'ev-3'],
  previousEventId: 'ev-1',
}

describe('buildPreviousInventoryKey', () => {
  it('est stable pour les mêmes entrées, quel que soit l ordre des configurations', () => {
    const a = buildPreviousInventoryKey(baseKey)
    const b = buildPreviousInventoryKey({ ...baseKey, configIds: ['cfg-a', 'cfg-b'] })
    expect(a).toBe(b)
    expect(buildPreviousInventoryKey({ ...baseKey })).toBe(a)
  })

  it.each([
    ['spaceId', { spaceId: 'sp-2' }],
    ['configIds', { configIds: ['cfg-a'] }],
    ['countsEventId', { countsEventId: 'ev-9' }],
    ['sourceInventoryEventId', { sourceInventoryEventId: 'ev-5' }],
    ['objectiveSource', { objectiveSource: 'sales' }],
    ['selectedEventIds', { selectedEventIds: ['ev-2'] }],
    ['previousEventId', { previousEventId: 'ev-0' }],
  ])('change quand %s change', (_name, override) => {
    expect(buildPreviousInventoryKey({ ...baseKey, ...override })).not.toBe(buildPreviousInventoryKey(baseKey))
  })

  it('distingue absent (null) et présent, et ne confond pas deux listes aux éléments collés', () => {
    expect(buildPreviousInventoryKey({ ...baseKey, previousEventId: null }))
      .not.toBe(buildPreviousInventoryKey({ ...baseKey, previousEventId: 'null' }))
    expect(buildPreviousInventoryKey({ ...baseKey, configIds: ['ab', 'c'] }))
      .not.toBe(buildPreviousInventoryKey({ ...baseKey, configIds: ['a', 'bc'] }))
  })

  it('accepte des entrées vides', () => {
    expect(() => buildPreviousInventoryKey()).not.toThrow()
    expect(buildPreviousInventoryKey({ spaceId: 'sp-1' })).toBe(buildPreviousInventoryKey({ spaceId: 'sp-1', configIds: null, selectedEventIds: undefined }))
  })
})

/** Dépendances par défaut : tout répond tout de suite. */
function makeDeps(over = {}) {
  return {
    readLogistic: jest.fn().mockResolvedValue(undefined),
    readStoreCounts: jest.fn().mockResolvedValue(undefined),
    skipPrevious: false,
    previousEvent: { id: 'ev-1' },
    useLocalOnly: false,
    fetchPrevious: jest.fn().mockResolvedValue({ inventoryCounts: { shopA: { i1: { n: 1 } } } }),
    fetchLatest: jest.fn().mockResolvedValue({ eventId: 'ev-0', inventoryCounts: { shopB: { i2: { n: 2 } } } }),
    readLocal: jest.fn().mockReturnValue({}),
    extractCounts: (payload) => payload?.inventoryCounts || {},
    findEventById: jest.fn((id) => ({ id })),
    setLoading: jest.fn(),
    ...over,
  }
}

describe('readPreviousInventorySources', () => {
  it('lance les trois lectures avant d en attendre aucune (parallèle)', async () => {
    const logistic = deferred()
    const store = deferred()
    const previous = deferred()
    const deps = makeDeps({
      readLogistic: jest.fn(() => logistic.promise),
      readStoreCounts: jest.fn(() => store.promise),
      fetchPrevious: jest.fn(() => previous.promise),
    })

    const pending = readPreviousInventorySources(deps)

    // Rien n est résolu, et pourtant les trois sont déjà parties.
    expect(deps.readLogistic).toHaveBeenCalledTimes(1)
    expect(deps.readStoreCounts).toHaveBeenCalledTimes(1)
    expect(deps.fetchPrevious).toHaveBeenCalledTimes(1)
    expect(deps.fetchPrevious).toHaveBeenCalledWith('ev-1')

    previous.resolve({ inventoryCounts: { shopA: { i1: {} } } })
    store.resolve()
    logistic.resolve()
    const res = await pending
    expect(res.counts).toEqual({ shopA: { i1: {} } })
    expect(res.sourceEvent).toEqual({ id: 'ev-1' })
    expect(res.skipped).toBe(false)
  })

  it('ne lit pas le repli latest quand les comptages de l événement précédent ne sont pas vides', async () => {
    const deps = makeDeps()
    await readPreviousInventorySources(deps)
    expect(deps.fetchLatest).not.toHaveBeenCalled()
  })

  it('lit le repli latest seulement quand les comptages sont vides, et adopte son événement', async () => {
    const deps = makeDeps({ fetchPrevious: jest.fn().mockResolvedValue({ inventoryCounts: {} }) })
    const res = await readPreviousInventorySources(deps)
    expect(deps.fetchLatest).toHaveBeenCalledTimes(1)
    expect(res.counts).toEqual({ shopB: { i2: { n: 2 } } })
    expect(res.sourceEvent).toEqual({ id: 'ev-0' })
  })

  it('le repli latest part sans attendre la fin du stock Logistique', async () => {
    let finishLogistic
    const logisticDone = new Promise((resolve) => { finishLogistic = resolve })
    const deps = makeDeps({
      readLogistic: jest.fn(() => logisticDone),
      fetchPrevious: jest.fn().mockResolvedValue({ inventoryCounts: {} }),
    })
    const pending = readPreviousInventorySources(deps)
    // Le stock Logistique n'a pas fini : le repli doit déjà avoir été demandé.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(deps.fetchLatest).toHaveBeenCalledTimes(1)
    finishLogistic()
    const res = await pending
    expect(res.counts).toEqual({ shopB: { i2: { n: 2 } } })
    expect(res.sourceEvent).toEqual({ id: 'ev-0' })
  })

  it('le stockage local évite le repli latest quand l API est vide mais le local rempli', async () => {
    const deps = makeDeps({
      fetchPrevious: jest.fn().mockResolvedValue({ inventoryCounts: {} }),
      readLocal: jest.fn().mockReturnValue({ shopL: { i3: {} } }),
    })
    const res = await readPreviousInventorySources(deps)
    expect(res.counts).toEqual({ shopL: { i3: {} } })
    expect(deps.fetchLatest).not.toHaveBeenCalled()
  })

  it('sans événement précédent : pas d appel de l inventaire précédent, repli latest direct', async () => {
    const deps = makeDeps({ previousEvent: null })
    const res = await readPreviousInventorySources(deps)
    expect(deps.fetchPrevious).not.toHaveBeenCalled()
    expect(deps.fetchLatest).toHaveBeenCalledTimes(1)
    expect(res.sourceEvent).toEqual({ id: 'ev-0' })
  })

  it('une erreur de l API précédente retombe sur le local, sans empêcher logistique ni store', async () => {
    const deps = makeDeps({
      fetchPrevious: jest.fn().mockRejectedValue(new Error('500')),
      readLocal: jest.fn().mockReturnValue({ shopL: { i3: {} } }),
    })
    const res = await readPreviousInventorySources(deps)
    expect(deps.readLogistic).toHaveBeenCalledTimes(1)
    expect(deps.readStoreCounts).toHaveBeenCalledTimes(1)
    expect(res.counts).toEqual({ shopL: { i3: {} } })
  })

  it('une erreur du store est avalée : les autres lectures aboutissent', async () => {
    const deps = makeDeps({ readStoreCounts: jest.fn().mockRejectedValue(new Error('store')) })
    const res = await readPreviousInventorySources(deps)
    expect(deps.readLogistic).toHaveBeenCalledTimes(1)
    expect(res.counts).toEqual({ shopA: { i1: { n: 1 } } })
  })

  it('une erreur du repli latest donne des comptages vides sans lever', async () => {
    const deps = makeDeps({
      fetchPrevious: jest.fn().mockResolvedValue({ inventoryCounts: {} }),
      fetchLatest: jest.fn().mockRejectedValue(new Error('404')),
    })
    const res = await readPreviousInventorySources(deps)
    expect(res.counts).toEqual({})
    expect(res.sourceEvent).toEqual({ id: 'ev-1' })
  })

  it('une erreur logistique est relancée, mais seulement après la fin des autres lectures', async () => {
    const previous = deferred()
    const deps = makeDeps({
      readLogistic: jest.fn().mockRejectedValue(new Error('logistique')),
      fetchPrevious: jest.fn(() => previous.promise),
    })
    let settled = false
    const pending = readPreviousInventorySources(deps).catch((e) => {
      settled = true
      return e
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    previous.resolve({ inventoryCounts: {} })
    const err = await pending
    expect(err.message).toBe('logistique')
    expect(deps.readStoreCounts).toHaveBeenCalledTimes(1)
    expect(deps.setLoading).toHaveBeenLastCalledWith(false)
  })

  it('mode local seul : jamais d appel réseau pour l inventaire, ni de repli latest', async () => {
    const deps = makeDeps({
      useLocalOnly: true,
      readLocal: jest.fn().mockReturnValue({}),
    })
    const res = await readPreviousInventorySources(deps)
    expect(deps.fetchPrevious).not.toHaveBeenCalled()
    expect(deps.fetchLatest).not.toHaveBeenCalled()
    expect(res.counts).toEqual({})
  })

  it('skipPrevious : seules logistique et store sont lus, résultat vide, indicateur de chargement intact', async () => {
    const deps = makeDeps({ skipPrevious: true })
    const res = await readPreviousInventorySources(deps)
    expect(deps.readLogistic).toHaveBeenCalledTimes(1)
    expect(deps.readStoreCounts).toHaveBeenCalledTimes(1)
    expect(deps.fetchPrevious).not.toHaveBeenCalled()
    expect(deps.fetchLatest).not.toHaveBeenCalled()
    expect(deps.setLoading).not.toHaveBeenCalled()
    expect(res).toEqual({ skipped: true, counts: {}, sourceEvent: null })
  })

  it('allume puis éteint l indicateur de chargement, aussi après une erreur', async () => {
    const ok = makeDeps()
    await readPreviousInventorySources(ok)
    expect(ok.setLoading.mock.calls).toEqual([[true], [false]])

    const ko = makeDeps({ readLogistic: jest.fn().mockRejectedValue(new Error('x')) })
    await expect(readPreviousInventorySources(ko)).rejects.toThrow('x')
    expect(ko.setLoading.mock.calls).toEqual([[true], [false]])
  })
})
