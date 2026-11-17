import { createCurrentUserFlight, CURRENT_USER_TTL_MS } from '@/utils/currentUserFlight'

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

describe('createCurrentUserFlight', () => {
  it('réutilise une lecture réussie pour le même utilisateur : une seule exécution', async () => {
    const flight = createCurrentUserFlight()
    const task = jest.fn(() => Promise.resolve({ data: 'profil' }))

    const first = await flight.load('u1', task)
    const second = await flight.load('u1', task)

    expect(task).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('fusionne deux lectures concurrentes en une seule requête', async () => {
    const flight = createCurrentUserFlight()
    const d = deferred()
    const task = jest.fn(() => d.promise)

    const a = flight.load('u1', task)
    const b = flight.load('u1', task)
    expect(task).toHaveBeenCalledTimes(1)

    d.resolve('ok')
    await expect(a).resolves.toBe('ok')
    await expect(b).resolves.toBe('ok')
  })

  it('ne partage rien entre deux utilisateurs différents', async () => {
    const flight = createCurrentUserFlight()
    const task = jest.fn((id) => Promise.resolve(id))

    await expect(flight.load('u1', () => task('u1'))).resolves.toBe('u1')
    await expect(flight.load('u2', () => task('u2'))).resolves.toBe('u2')

    expect(task).toHaveBeenCalledTimes(2)
  })

  it('fresh: true force une lecture neuve, que les appels suivants réutilisent', async () => {
    const flight = createCurrentUserFlight()
    let n = 0
    const task = jest.fn(() => Promise.resolve(++n))

    expect(await flight.load('u1', task)).toBe(1)
    expect(await flight.load('u1', task, { fresh: true })).toBe(2)
    expect(await flight.load('u1', task)).toBe(2)

    expect(task).toHaveBeenCalledTimes(2)
  })

  it('ne garde pas un échec : la lecture suivante relance la requête (nouvel essai)', async () => {
    const flight = createCurrentUserFlight()
    const task = jest
      .fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce('ok')

    await expect(flight.load('u1', task)).rejects.toThrow('503')
    await expect(flight.load('u1', task)).resolves.toBe('ok')

    expect(task).toHaveBeenCalledTimes(2)
  })

  it('relit au bout de la durée de vie du résultat', async () => {
    const c = clock()
    const flight = createCurrentUserFlight({ now: c.now })
    let n = 0
    const task = jest.fn(() => Promise.resolve(++n))

    await flight.load('u1', task)
    c.advance(CURRENT_USER_TTL_MS - 1)
    expect(await flight.load('u1', task)).toBe(1)
    c.advance(2)
    expect(await flight.load('u1', task)).toBe(2)
  })

  it('clear() oublie le résultat (déconnexion) : la lecture suivante relance la requête', async () => {
    const flight = createCurrentUserFlight()
    const task = jest.fn(() => Promise.resolve('ok'))

    await flight.load('u1', task)
    flight.clear()
    await flight.load('u1', task)

    expect(task).toHaveBeenCalledTimes(2)
  })

  it('sans identifiant utilisateur, ne partage rien', async () => {
    const flight = createCurrentUserFlight()
    const task = jest.fn(() => Promise.resolve('ok'))

    await flight.load(null, task)
    await flight.load(undefined, task)
    await flight.load('', task)

    expect(task).toHaveBeenCalledTimes(3)
  })

  describe('prefetch', () => {
    it('lance la lecture sans l\'attendre, et un load ultérieur rejoint la lecture en vol', async () => {
      const flight = createCurrentUserFlight()
      const d = deferred()
      const task = jest.fn(() => d.promise)

      expect(flight.prefetch('u1', task)).toBeUndefined()
      expect(task).toHaveBeenCalledTimes(1)

      const joined = flight.load('u1', task)
      expect(task).toHaveBeenCalledTimes(1)

      d.resolve('profil')
      await expect(joined).resolves.toBe('profil')
    })

    it('un load après la fin du prefetch reprend son résultat', async () => {
      const flight = createCurrentUserFlight()
      const task = jest.fn(() => Promise.resolve('profil'))

      flight.prefetch('u1', task)
      await Promise.resolve()
      await Promise.resolve()

      await expect(flight.load('u1', task)).resolves.toBe('profil')
      expect(task).toHaveBeenCalledTimes(1)
    })

    it('avale l\'échec du prefetch (pas de rejet non géré) et le load suivant relance la requête', async () => {
      const flight = createCurrentUserFlight()
      const task = jest
        .fn()
        .mockRejectedValueOnce(new Error('404'))
        .mockResolvedValueOnce('ok')

      flight.prefetch('u1', task)
      await new Promise((r) => setTimeout(r, 0))

      await expect(flight.load('u1', task)).resolves.toBe('ok')
      expect(task).toHaveBeenCalledTimes(2)
    })

    it('un load qui rejoint un prefetch en échec voit l\'échec', async () => {
      const flight = createCurrentUserFlight()
      const d = deferred()
      const task = jest.fn(() => d.promise)

      flight.prefetch('u1', task)
      const joined = flight.load('u1', task)
      d.reject(new Error('503'))

      await expect(joined).rejects.toThrow('503')
      expect(task).toHaveBeenCalledTimes(1)
    })

    it('ne fait rien sans identifiant utilisateur', () => {
      const flight = createCurrentUserFlight()
      const task = jest.fn(() => Promise.resolve('ok'))

      flight.prefetch(null, task)

      expect(task).not.toHaveBeenCalled()
    })
  })
})
