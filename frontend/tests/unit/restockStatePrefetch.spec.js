import { startRestockStatePrefetch, readRestockState } from '@/utils/restockStatePrefetch'

const io = (over = {}) => ({
  isDemo: () => false,
  isApiDown: () => false,
  fetchState: jest.fn().mockResolvedValue({ currentStep: 2 }),
  onError: jest.fn(),
  ...over,
})

describe('startRestockStatePrefetch', () => {
  it('lance la lecture tout de suite pour un espace réel', async () => {
    const deps = io()
    const prefetch = startRestockStatePrefetch('sp-1', deps)
    expect(deps.fetchState).toHaveBeenCalledTimes(1)
    expect(deps.fetchState).toHaveBeenCalledWith('sp-1')
    expect(prefetch.spaceId).toBe('sp-1')
    await expect(prefetch.settled).resolves.toEqual({ error: null, value: { currentStep: 2 } })
  })

  it('ne lance rien sans espace, en mode démo ou si l API est tombée', () => {
    const noSpace = io()
    expect(startRestockStatePrefetch(undefined, noSpace)).toBeNull()
    const demo = io({ isDemo: () => true })
    expect(startRestockStatePrefetch('sp-1', demo)).toBeNull()
    const down = io({ isApiDown: () => true })
    expect(startRestockStatePrefetch('sp-1', down)).toBeNull()
    expect(noSpace.fetchState).not.toHaveBeenCalled()
    expect(demo.fetchState).not.toHaveBeenCalled()
    expect(down.fetchState).not.toHaveBeenCalled()
  })

  it('ne rejette jamais : l erreur est gardée dans le résultat', async () => {
    const err = new Error('réseau')
    const deps = io({ fetchState: jest.fn().mockRejectedValue(err) })
    const prefetch = startRestockStatePrefetch('sp-1', deps)
    await expect(prefetch.settled).resolves.toEqual({ error: err, value: null })
  })
})

describe('readRestockState', () => {
  it('réutilise la lecture préchargée du même espace, sans second appel', async () => {
    const deps = io()
    const prefetch = startRestockStatePrefetch('sp-1', deps)
    const saved = await readRestockState({ spaceId: 'sp-1', prefetch, ...deps })
    expect(saved).toEqual({ currentStep: 2 })
    expect(deps.fetchState).toHaveBeenCalledTimes(1)
  })

  it('retombe sur l appel direct sans préchargement', async () => {
    const deps = io()
    const saved = await readRestockState({ spaceId: 'sp-1', prefetch: null, ...deps })
    expect(saved).toEqual({ currentStep: 2 })
    expect(deps.fetchState).toHaveBeenCalledTimes(1)
  })

  it('retombe sur l appel direct si le préchargement concerne un autre espace', async () => {
    const deps = io()
    const prefetch = startRestockStatePrefetch('sp-1', deps)
    await readRestockState({ spaceId: 'sp-2', prefetch, ...deps })
    expect(deps.fetchState).toHaveBeenCalledTimes(2)
    expect(deps.fetchState).toHaveBeenLastCalledWith('sp-2')
  })

  it('une erreur du préchargement passe par onError et rend null (repli localStorage côté appelant)', async () => {
    const err = new Error('500')
    const deps = io({ fetchState: jest.fn().mockRejectedValue(err) })
    const prefetch = startRestockStatePrefetch('sp-1', deps)
    const saved = await readRestockState({ spaceId: 'sp-1', prefetch, ...deps })
    expect(saved).toBeNull()
    expect(deps.onError).toHaveBeenCalledTimes(1)
    expect(deps.onError).toHaveBeenCalledWith(err)
  })

  it('une erreur de l appel direct passe aussi par onError', async () => {
    const err = new Error('500')
    const deps = io({ fetchState: jest.fn().mockRejectedValue(err) })
    expect(await readRestockState({ spaceId: 'sp-1', ...deps })).toBeNull()
    expect(deps.onError).toHaveBeenCalledWith(err)
  })

  it('un état absent en BDD (null) rend null sans erreur', async () => {
    const deps = io({ fetchState: jest.fn().mockResolvedValue(null) })
    expect(await readRestockState({ spaceId: 'sp-1', ...deps })).toBeNull()
    expect(deps.onError).not.toHaveBeenCalled()
  })

  it('réévalue les conditions au moment de la lecture : API tombée ou démo => on ignore le préchargement', async () => {
    const deps = io()
    const prefetch = startRestockStatePrefetch('sp-1', deps)
    expect(await readRestockState({ spaceId: 'sp-1', prefetch, ...deps, isApiDown: () => true })).toBeNull()
    expect(await readRestockState({ spaceId: 'sp-1', prefetch, ...deps, isDemo: () => true })).toBeNull()
    expect(await readRestockState({ spaceId: undefined, prefetch, ...deps })).toBeNull()
    expect(deps.onError).not.toHaveBeenCalled()
  })
})
