import { createSingleFlight } from '@/utils/singleFlight'

/** Promesse résolue ou rejetée à la demande. */
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createSingleFlight', () => {
  it('fusionne les appels de même clé en vol : une seule exécution, même promesse', async () => {
    const flight = createSingleFlight()
    const d = deferred()
    const task = jest.fn(() => d.promise)

    const first = flight.run('a', task)
    const second = flight.run('a', task)

    expect(task).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    expect(flight.has('a')).toBe(true)

    d.resolve('ok')
    await expect(first).resolves.toBe('ok')
    await expect(second).resolves.toBe('ok')
  })

  it('libère la clé après un succès : l appel suivant relance la tâche', async () => {
    const flight = createSingleFlight()
    const task = jest.fn().mockResolvedValueOnce('un').mockResolvedValueOnce('deux')

    await expect(flight.run('a', task)).resolves.toBe('un')
    expect(flight.has('a')).toBe(false)
    expect(flight.size()).toBe(0)

    await expect(flight.run('a', task)).resolves.toBe('deux')
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('libère la clé après un échec, et tous les appelants fusionnés reçoivent l erreur', async () => {
    const flight = createSingleFlight()
    const d = deferred()
    const task = jest.fn(() => d.promise)

    const first = flight.run('a', task)
    const second = flight.run('a', task)
    d.reject(new Error('boom'))

    await expect(first).rejects.toThrow('boom')
    await expect(second).rejects.toThrow('boom')
    expect(flight.has('a')).toBe(false)

    const retry = jest.fn().mockResolvedValue('repris')
    await expect(flight.run('a', retry)).resolves.toBe('repris')
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('libère la clé quand la tâche lève de façon synchrone', async () => {
    const flight = createSingleFlight()
    await expect(flight.run('a', () => { throw new Error('sync') })).rejects.toThrow('sync')
    expect(flight.has('a')).toBe(false)
  })

  it('deux clés différentes tournent en parallèle sans se fusionner', async () => {
    const flight = createSingleFlight()
    const da = deferred()
    const db = deferred()
    const taskA = jest.fn(() => da.promise)
    const taskB = jest.fn(() => db.promise)

    const pa = flight.run('a', taskA)
    const pb = flight.run('b', taskB)

    expect(taskA).toHaveBeenCalledTimes(1)
    expect(taskB).toHaveBeenCalledTimes(1)
    expect(pa).not.toBe(pb)
    expect(flight.size()).toBe(2)

    db.resolve('B')
    da.resolve('A')
    await expect(pa).resolves.toBe('A')
    await expect(pb).resolves.toBe('B')
    expect(flight.size()).toBe(0)
  })

  it('un appel après la fin d une exécution est une nouvelle exécution (pas de cache)', async () => {
    const flight = createSingleFlight()
    let n = 0
    const task = jest.fn(async () => ++n)

    const first = await flight.run('a', task)
    const second = await flight.run('a', task)

    expect(first).toBe(1)
    expect(second).toBe(2)
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('force contourne la fusion, et les appels suivants rejoignent l exécution neuve', async () => {
    const flight = createSingleFlight()
    const dOld = deferred()
    const dNew = deferred()
    const oldTask = jest.fn(() => dOld.promise)
    const newTask = jest.fn(() => dNew.promise)
    const joinTask = jest.fn()

    const old = flight.run('a', oldTask)
    const forced = flight.run('a', newTask, { force: true })
    const joined = flight.run('a', joinTask)

    expect(newTask).toHaveBeenCalledTimes(1)
    expect(forced).not.toBe(old)
    expect(joined).toBe(forced)
    expect(joinTask).not.toHaveBeenCalled()

    // La fin de l ancienne exécution ne doit pas libérer la clé de la neuve.
    dOld.resolve('vieux')
    await old
    expect(flight.has('a')).toBe(true)

    dNew.resolve('neuf')
    await expect(joined).resolves.toBe('neuf')
    expect(flight.has('a')).toBe(false)
  })

  it('accepte une tâche qui rend une valeur non promesse', async () => {
    const flight = createSingleFlight()
    await expect(flight.run('a', () => 42)).resolves.toBe(42)
  })
})
