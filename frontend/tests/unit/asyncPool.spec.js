import { runWithConcurrency } from '@/utils/asyncPool'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('runWithConcurrency', () => {
  it('respecte la limite de concurrence', async () => {
    let running = 0
    let peak = 0
    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      running += 1
      peak = Math.max(peak, running)
      await tick()
      running -= 1
    })
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1) // parallélisme réel
  })

  it('démarre dans l’ordre de la file', async () => {
    const started = []
    await runWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      started.push(n)
      await tick()
    })
    expect(started).toEqual([1, 2, 3, 4])
  })

  it('traite tous les éléments même avec limit > longueur', async () => {
    const done = []
    await runWithConcurrency([1, 2], 10, async (n) => { done.push(n) })
    expect(done.sort()).toEqual([1, 2])
  })

  it('arrête de consommer la file quand le signal est aborté', async () => {
    const controller = new AbortController()
    const done = []
    await runWithConcurrency([1, 2, 3, 4, 5, 6], 1, async (n) => {
      done.push(n)
      if (n === 2) controller.abort()
      await tick()
    }, controller.signal)
    expect(done).toEqual([1, 2]) // 3..6 abandonnés
  })

  it('liste vide → no-op', async () => {
    await expect(runWithConcurrency([], 3, async () => {})).resolves.toBeUndefined()
  })
})
