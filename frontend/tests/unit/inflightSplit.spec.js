import { splitCachedInflightMissing, awaitInflightInto } from '@/utils/inflightSplit'

const keyOf = (id) => `s:${id}`

function makeSources({ cache = {}, inflight = {} } = {}) {
  const getCached = jest.fn((key) => cache[key])
  const getInflight = jest.fn((key) => inflight[key])
  return { getCached, getInflight }
}

describe('splitCachedInflightMissing', () => {
  it('range un hit de cache dans cached, avec sa valeur', () => {
    const { getCached, getInflight } = makeSources({ cache: { 's:a': [1, 2] } })
    const out = splitCachedInflightMissing(['a'], { keyOf, getCached, getInflight })
    expect([...out.cached.entries()]).toEqual([['a', [1, 2]]])
    expect(out.inflight).toEqual([])
    expect(out.missing).toEqual([])
    // Un hit de cache n'interroge pas le registre en vol.
    expect(getInflight).not.toHaveBeenCalled()
  })

  it('appelle getCached pour chaque hit (récence LRU rafraîchie par l appelant)', () => {
    const { getCached, getInflight } = makeSources({ cache: { 's:a': [1], 's:b': [2] } })
    splitCachedInflightMissing(['a', 'b', 'c'], { keyOf, getCached, getInflight })
    expect(getCached.mock.calls.map((c) => c[0])).toEqual(['s:a', 's:b', 's:c'])
  })

  it('range une promesse en vol dans inflight', () => {
    const p = Promise.resolve([9])
    const { getCached, getInflight } = makeSources({ inflight: { 's:a': p } })
    const out = splitCachedInflightMissing(['a'], { keyOf, getCached, getInflight })
    expect(out.cached.size).toBe(0)
    expect(out.inflight).toEqual([{ eventId: 'a', promise: p }])
    expect(out.missing).toEqual([])
  })

  it('range un id inconnu dans missing', () => {
    const { getCached, getInflight } = makeSources()
    const out = splitCachedInflightMissing(['a'], { keyOf, getCached, getInflight })
    expect(out.cached.size).toBe(0)
    expect(out.inflight).toEqual([])
    expect(out.missing).toEqual(['a'])
  })

  it('un cache a valeur vide ([]) reste un hit : seul undefined est un manque', () => {
    const { getCached, getInflight } = makeSources({ cache: { 's:a': [] } })
    const out = splitCachedInflightMissing(['a'], { keyOf, getCached, getInflight })
    expect(out.cached.get('a')).toEqual([])
    expect(out.missing).toEqual([])
  })

  it('bypassCache : tout va dans missing, sans lire cache ni registre en vol', () => {
    const { getCached, getInflight } = makeSources({
      cache: { 's:a': [1] },
      inflight: { 's:b': Promise.resolve([2]) },
    })
    const out = splitCachedInflightMissing(['a', 'b', 'c'], {
      keyOf, getCached, getInflight, bypassCache: true,
    })
    expect(out.missing).toEqual(['a', 'b', 'c'])
    expect(out.cached.size).toBe(0)
    expect(out.inflight).toEqual([])
    expect(getCached).not.toHaveBeenCalled()
    expect(getInflight).not.toHaveBeenCalled()
  })

  it('mélange cache, en vol et manquants en préservant l ordre des ids dans chaque groupe', () => {
    const pb = Promise.resolve('B')
    const pd = Promise.resolve('D')
    const { getCached, getInflight } = makeSources({
      cache: { 's:a': 'A', 's:e': 'E' },
      inflight: { 's:b': pb, 's:d': pd },
    })
    const out = splitCachedInflightMissing(['a', 'b', 'c', 'd', 'e', 'f'], { keyOf, getCached, getInflight })
    expect([...out.cached.keys()]).toEqual(['a', 'e'])
    expect(out.inflight.map((i) => i.eventId)).toEqual(['b', 'd'])
    expect(out.missing).toEqual(['c', 'f'])
  })

  it('est synchrone : renvoie un objet (pas une promesse) même avec une promesse en vol non résolue', () => {
    const pending = new Promise(() => {})
    const { getCached, getInflight } = makeSources({ inflight: { 's:a': pending } })
    const out = splitCachedInflightMissing(['a', 'b'], { keyOf, getCached, getInflight })
    // Aucun await : le résultat est disponible tout de suite, les ids neufs ne sont pas
    // retardés par la promesse en vol qui ne se résout jamais.
    expect(typeof out.then).toBe('undefined')
    expect(out.missing).toEqual(['b'])
    expect(out.inflight).toHaveLength(1)
  })
})

describe('awaitInflightInto', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0))

  it('attend les promesses en parallèle et range chaque valeur sous son eventId', async () => {
    let resolveA
    let resolveB
    const pa = new Promise((r) => { resolveA = r })
    const pb = new Promise((r) => { resolveB = r })
    const result = new Map([['z', 'Z']])
    const done = awaitInflightInto(result, [
      { eventId: 'a', promise: pa },
      { eventId: 'b', promise: pb },
    ])
    // Résolution dans le désordre : B d'abord, rien n'est écrit avant que A ne soit tenue.
    resolveB('B')
    await tick()
    expect(result.has('b')).toBe(false)
    resolveA('A')
    const out = await done
    expect(out).toBe(result)
    expect(result.get('a')).toBe('A')
    expect(result.get('b')).toBe('B')
    expect(result.get('z')).toBe('Z')
  })

  it('une liste vide renvoie result tel quel', async () => {
    const result = new Map([['z', 1]])
    await expect(awaitInflightInto(result, [])).resolves.toBe(result)
    expect([...result.keys()]).toEqual(['z'])
  })

  it('un rejet rejette l ensemble, sans rien écrire dans result', async () => {
    const result = new Map()
    await expect(
      awaitInflightInto(result, [
        { eventId: 'a', promise: Promise.resolve('A') },
        { eventId: 'b', promise: Promise.reject(new Error('boom')) },
      ]),
    ).rejects.toThrow('boom')
    expect(result.size).toBe(0)
  })
})
