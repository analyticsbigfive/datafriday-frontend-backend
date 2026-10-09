import { createThrottledRunner } from '@/utils/throttledRunner'

// Jest 27 : pas d'advanceTimersByTimeAsync ; les minuteurs « modern » simulent aussi Date.now.
const tick = async (ms) => {
  jest.advanceTimersByTime(ms)
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('createThrottledRunner', () => {
  beforeEach(() => jest.useFakeTimers('modern'))
  afterEach(() => jest.useRealTimers())

  it('fusionne une rafale de demandes en une exécution, puis respecte l\'intervalle', async () => {
    const run = jest.fn().mockResolvedValue(undefined)
    const r = createThrottledRunner(run, 30000)
    r.request(); r.request(); r.request()
    await tick(0)
    expect(run).toHaveBeenCalledTimes(1)
    r.request(); r.request()
    await tick(29000)
    expect(run).toHaveBeenCalledTimes(1)
    await tick(1000)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('une demande reçue pendant une exécution n\'est pas perdue', async () => {
    let finish
    const run = jest.fn(() => new Promise((res) => { finish = res }))
    const r = createThrottledRunner(run, 1000)
    r.request()
    await tick(0)
    r.request()
    finish()
    await tick(0) // fin de la première exécution : la demande en attente est reprogrammée
    await tick(1000)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('cancel annule la prochaine exécution', async () => {
    const run = jest.fn().mockResolvedValue(undefined)
    const r = createThrottledRunner(run, 1000)
    r.request()
    r.cancel()
    await tick(5000)
    expect(run).not.toHaveBeenCalled()
  })
})
