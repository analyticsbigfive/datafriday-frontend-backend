// Feuille post-event régénérée en brouillon quand un PDV se complète (demande Bertrand
// 2026-09-29) : rythme de régénération et détection des PDV nouvellement complets.
import { newlyCompletedElements, usePostEventDraftScheduler } from '@/composables/usePostEventDraftScheduler'

describe('newlyCompletedElements', () => {
  it('premier chargement : rien de nouveau', () => {
    expect(newlyCompletedElements(null, 'a,b')).toEqual([])
  })

  it('un PDV de plus complet', () => {
    expect(newlyCompletedElements('a', 'a,b')).toEqual(['b'])
    expect(newlyCompletedElements('', 'a')).toEqual(['a'])
  })

  it('un PDV remis à compter (Recompter) : rien de nouveau', () => {
    expect(newlyCompletedElements('a,b', 'a')).toEqual([])
  })
})

describe('usePostEventDraftScheduler', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('plusieurs PDV complétés en rafale : une seule régénération après le délai', async () => {
    const run = jest.fn().mockResolvedValue()
    const s = usePostEventDraftScheduler(run, { delayMs: 1000 })
    s.schedule()
    s.schedule()
    s.schedule()
    expect(run).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('demande pendant un calcul : rejouée une fois à la fin, jamais en parallèle', async () => {
    let release
    const run = jest.fn(() => new Promise((r) => { release = r }))
    const s = usePostEventDraftScheduler(run, { delayMs: 10 })
    s.schedule()
    jest.advanceTimersByTime(10)
    expect(run).toHaveBeenCalledTimes(1)
    s.schedule()
    jest.advanceTimersByTime(10)
    expect(run).toHaveBeenCalledTimes(1)
    release()
    await Promise.resolve()
    await Promise.resolve()
    jest.advanceTimersByTime(10)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('un échec ne remonte pas (brouillon best-effort)', async () => {
    jest.useRealTimers()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const s = usePostEventDraftScheduler(jest.fn().mockRejectedValue(new Error('réseau')), { delayMs: 0 })
    s.schedule()
    await new Promise((r) => setTimeout(r, 20))
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
