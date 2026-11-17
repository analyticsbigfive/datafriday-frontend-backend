import { createRecentFlight } from '@/utils/recentFlight'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Horloge manuelle pour ne pas dépendre du temps réel. */
function clock(start = 1000) {
  let t = start
  return { now: () => t, advance: (ms) => { t += ms } }
}

describe('createRecentFlight', () => {
  it('fusionne les appels de même clé en vol : une seule exécution, même résultat', async () => {
    const flight = createRecentFlight()
    const d = deferred()
    const task = jest.fn(() => d.promise)

    const first = flight.run('a', task)
    const second = flight.run('a', task)
    expect(task).toHaveBeenCalledTimes(1)

    d.resolve('ok')
    await expect(first).resolves.toBe('ok')
    await expect(second).resolves.toBe('ok')
  })

  it('rend le résultat terminé sans relancer la tâche tant que le délai n est pas écoulé', async () => {
    const c = clock()
    const flight = createRecentFlight({ ttlMs: 15000, now: c.now })
    const task = jest.fn().mockResolvedValue('v1')

    await flight.run('a', task)
    c.advance(14999)
    await expect(flight.run('a', task)).resolves.toBe('v1')
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('relance la tâche une fois le délai écoulé', async () => {
    const c = clock()
    const flight = createRecentFlight({ ttlMs: 15000, now: c.now })
    const task = jest.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')

    await flight.run('a', task)
    c.advance(15000)
    await expect(flight.run('a', task)).resolves.toBe('v2')
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('des clés différentes ne se partagent rien', async () => {
    const flight = createRecentFlight()
    const task = jest.fn((k) => Promise.resolve(k))
    await expect(flight.run('a', () => task('a'))).resolves.toBe('a')
    await expect(flight.run('b', () => task('b'))).resolves.toBe('b')
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('ne garde jamais un échec : l appel suivant relance la tâche', async () => {
    const flight = createRecentFlight()
    const task = jest.fn().mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce('ok')

    await expect(flight.run('a', task)).rejects.toThrow('500')
    await expect(flight.run('a', task)).resolves.toBe('ok')
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('une tâche qui lève de façon synchrone devient un rejet, sans rien garder', async () => {
    const flight = createRecentFlight()
    const boom = () => { throw new Error('sync') }
    await expect(flight.run('a', boom)).rejects.toThrow('sync')
    await expect(flight.run('a', () => 'ok')).resolves.toBe('ok')
  })

  it('fresh ignore le résultat gardé et lance une lecture neuve, que les suivants réutilisent', async () => {
    const flight = createRecentFlight()
    const task = jest.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')

    await flight.run('a', task)
    await expect(flight.run('a', task, { fresh: true })).resolves.toBe('v2')
    await expect(flight.run('a', task)).resolves.toBe('v2')
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('fresh ignore aussi l exécution en vol', async () => {
    const flight = createRecentFlight()
    const slow = deferred()
    const fast = deferred()
    const task = jest.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)

    const old = flight.run('a', task)
    const neu = flight.run('a', task, { fresh: true })
    expect(task).toHaveBeenCalledTimes(2)

    fast.resolve('neuf')
    slow.resolve('ancien')
    await expect(neu).resolves.toBe('neuf')
    await expect(old).resolves.toBe('ancien')
  })

  it('une exécution plus ancienne qui finit en dernier n écrase pas le résultat plus récent', async () => {
    const flight = createRecentFlight()
    const slow = deferred()
    const fast = deferred()
    const task = jest.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)

    const old = flight.run('a', task)
    const neu = flight.run('a', task, { fresh: true })
    fast.resolve('neuf')
    await neu
    slow.resolve('ancien')
    await old

    const after = jest.fn()
    await expect(flight.run('a', after)).resolves.toBe('neuf')
    expect(after).not.toHaveBeenCalled()
  })

  it('un résultat falsy (null, 0, objet vide) est bien gardé', async () => {
    const flight = createRecentFlight()
    const task = jest.fn().mockResolvedValue(null)
    await flight.run('a', task)
    await expect(flight.run('a', task)).resolves.toBeNull()
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('clear(key) oublie une clé, clear() oublie tout', async () => {
    const flight = createRecentFlight()
    const task = jest.fn().mockResolvedValue('v')
    await flight.run('a', task)
    await flight.run('b', task)
    expect(flight.size()).toBe(2)

    flight.clear('a')
    expect(flight.size()).toBe(1)
    await flight.run('a', task)
    expect(task).toHaveBeenCalledTimes(3)

    flight.clear()
    expect(flight.size()).toBe(0)
  })
})
