import { createDeferredCatalog } from '@/utils/deferredCatalog'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createDeferredCatalog', () => {
  it('catalogue déjà arrivé : appliqué une seule fois, tout de suite, rien de différé', async () => {
    const gate = createDeferredCatalog()
    const handle = gate.start(Promise.resolve(['A']))
    await Promise.resolve() // laisse la source se poser
    const apply = jest.fn()
    const onPending = jest.fn()

    handle.applyInitial(apply, { onPending })
    await gate.whenSettled()

    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(['A'], { late: false })
    expect(onPending.mock.calls).toEqual([[false]]) // jamais en attente
  })

  it('arrivée tardive : [] d abord (repli), puis le catalogue, drapeau pending true puis false', async () => {
    const gate = createDeferredCatalog()
    const d = deferred()
    const handle = gate.start(d.promise)
    const calls = []
    const pending = []

    handle.applyInitial((items, ctx) => calls.push([items, ctx.late]), {
      onPending: (p) => pending.push(p),
    })
    expect(calls).toEqual([[[], false]])
    expect(pending).toEqual([true])

    d.resolve(['A', 'B'])
    await gate.whenSettled()

    expect(calls).toEqual([[[], false], [['A', 'B'], true]])
    expect(pending).toEqual([true, false])
  })

  it('l application tardive ne passe JAMAIS avant l application initiale', async () => {
    const gate = createDeferredCatalog()
    const handle = gate.start(Promise.resolve(['A']))
    const apply = jest.fn()
    await Promise.resolve()
    await Promise.resolve()
    expect(apply).not.toHaveBeenCalled()

    handle.applyInitial(apply)
    await gate.whenSettled()
    expect(apply.mock.calls[0][1]).toEqual({ late: false })
  })

  it('jeton périmé : un start() plus récent annule l application tardive et le drapeau de l ancien', async () => {
    const gate = createDeferredCatalog()
    const d1 = deferred()
    const first = gate.start(d1.promise)
    const apply1 = jest.fn()
    const pending1 = jest.fn()
    first.applyInitial(apply1, { onPending: pending1 })

    const d2 = deferred()
    gate.start(d2.promise)
    d1.resolve(['vieux'])
    await first.settled

    expect(apply1).toHaveBeenCalledTimes(1) // seulement l'initiale
    expect(pending1.mock.calls).toEqual([[true]]) // l'ancien ne touche plus au drapeau
  })

  it('composant détruit (dispose) : rien n est appliqué à l arrivée', async () => {
    const gate = createDeferredCatalog()
    const d = deferred()
    const handle = gate.start(d.promise)
    const apply = jest.fn()
    handle.applyInitial(apply)

    gate.dispose()
    d.resolve(['A'])
    await gate.whenSettled()

    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('source en échec : catalogue vide, whenSettled ne rejette pas', async () => {
    const gate = createDeferredCatalog()
    const d = deferred()
    const handle = gate.start(d.promise)
    const apply = jest.fn()
    handle.applyInitial(apply)

    d.reject(new Error('réseau'))
    await expect(gate.whenSettled()).resolves.toBeUndefined()
    expect(apply).toHaveBeenLastCalledWith([], { late: true })
  })

  it('whenSettled attend l arrivée puis l application (instantané des coûts d un event passé)', async () => {
    const gate = createDeferredCatalog()
    const d = deferred()
    const handle = gate.start(d.promise)
    let costs = 'store'
    handle.applyInitial((items, { late }) => {
      if (late) costs = items[0]
    })

    let released = false
    const waiting = gate.whenSettled().then(() => {
      released = true
    })
    await Promise.resolve()
    expect(released).toBe(false)

    d.resolve(['api'])
    await waiting
    expect(costs).toBe('api')
  })

  it('abandon (chargement interrompu) : libère whenSettled sans rien appliquer', async () => {
    const gate = createDeferredCatalog()
    const handle = gate.start(Promise.resolve(['A']))
    handle.abandon()
    await expect(gate.whenSettled()).resolves.toBeUndefined()
  })

  it('whenSettled sans start : résolu', async () => {
    await expect(createDeferredCatalog().whenSettled()).resolves.toBeUndefined()
  })

  it('une erreur dans l application tardive est avalée (warn) et le drapeau est relâché', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const gate = createDeferredCatalog()
    const d = deferred()
    const handle = gate.start(d.promise)
    const pending = []
    handle.applyInitial(
      (items, { late }) => {
        if (late) throw new Error('boum')
      },
      { onPending: (p) => pending.push(p) },
    )
    d.resolve(['A'])
    await gate.whenSettled()

    expect(pending).toEqual([true, false])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
