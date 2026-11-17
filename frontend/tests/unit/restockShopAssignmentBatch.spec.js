import {
  buildAssignmentResultsFromBatch,
  loadRestockAssignmentBatch,
  mergeInFlightAssignmentFetchers,
  restockShopIdOfRow,
} from '@/utils/restockShopAssignmentBatch'
import { createSingleFlight } from '@/utils/singleFlight'

const rows = [
  { id: 'shop-a', name: 'Buvette A' },
  { _id: 'shop-b', shopName: 'Buvette B' },
  { id: 'shop-c', name: 'Buvette C' },
  { name: 'Sans identifiant' },
]

const byShop = {
  'shop-a': {
    shopName: 'Buvette A',
    items: [
      { id: 'mi-1', name: 'Bière', category: 'Boissons', basePrice: 6 },
      { id: 'mi-2', name: 'Hot-dog', category: 'Food', basePrice: null },
    ],
  },
  'shop-b': { shopName: 'Buvette B', items: [{ id: 'mi-1', name: 'Bière', category: 'Boissons', basePrice: 6 }] },
}

const spaceItems = [
  { id: 'mi-1', name: 'Bière', available: true },
  { id: 'mi-2', name: 'Hot-dog', available: false },
  { id: 'mi-3', name: 'Sans champ' },
]

describe('restockShopIdOfRow', () => {
  it('lit id, puis _id, puis shopId, en chaîne', () => {
    expect(restockShopIdOfRow({ id: 12 })).toBe('12')
    expect(restockShopIdOfRow({ _id: 'x' })).toBe('x')
    expect(restockShopIdOfRow({ shopId: 'y' })).toBe('y')
    expect(restockShopIdOfRow({})).toBe('')
  })
})

describe('buildAssignmentResultsFromBatch', () => {
  it('rend une entrée par ligne de PdV, dans le même ordre, avec nom et articles activés', () => {
    const out = buildAssignmentResultsFromBatch(rows, byShop, spaceItems)
    expect(out.map((r) => r.name)).toEqual(['Buvette A', 'Buvette B', 'Buvette C', 'Sans identifiant'])
    expect(out[0].items.map((i) => i.id)).toEqual(['mi-1', 'mi-2'])
    expect(out[0].items.every((i) => i.enabled === true)).toBe(true)
  })

  it('met basePrice null à 0, comme GET /space-menu/shop/:id', () => {
    const out = buildAssignmentResultsFromBatch(rows, byShop, spaceItems)
    expect(out[0].items.find((i) => i.id === 'mi-2').basePrice).toBe(0)
    expect(out[0].items.find((i) => i.id === 'mi-1').basePrice).toBe(6)
  })

  it('un PdV absent du lot n a aucun article (le serveur omet les PdV sans article activé)', () => {
    const out = buildAssignmentResultsFromBatch(rows, byShop, spaceItems)
    expect(out[2].items).toEqual([])
  })

  it('ne marque non produisibles que les articles available === false strict', () => {
    const out = buildAssignmentResultsFromBatch(rows, byShop, spaceItems)
    expect(out[0].unavailable.map((i) => i.id)).toEqual(['mi-2'])
    expect(out[1].unavailable.map((i) => i.id)).toEqual(['mi-2'])
  })

  it('une ligne sans identifiant n a ni article ni exclusion', () => {
    const out = buildAssignmentResultsFromBatch(rows, byShop, spaceItems)
    expect(out[3]).toEqual({ name: 'Sans identifiant', items: [], unavailable: [] })
  })

  it('tolère des listes absentes ou invalides', () => {
    expect(buildAssignmentResultsFromBatch(rows, null, null)[0]).toEqual({ name: 'Buvette A', items: [], unavailable: [] })
    expect(buildAssignmentResultsFromBatch(null, byShop, spaceItems)).toEqual([])
  })
})

describe('loadRestockAssignmentBatch', () => {
  const base = { spaceId: 'sp1', configId: 'cfg1', rows }

  it('fait exactement 2 appels pour toute la configuration', async () => {
    const fetchBatch = jest.fn().mockResolvedValue(byShop)
    const fetchSpaceItems = jest.fn().mockResolvedValue({ items: spaceItems })
    const out = await loadRestockAssignmentBatch({ ...base, fetchBatch, fetchSpaceItems })
    expect(fetchBatch).toHaveBeenCalledTimes(1)
    expect(fetchBatch).toHaveBeenCalledWith('sp1', 'cfg1')
    expect(fetchSpaceItems).toHaveBeenCalledTimes(1)
    expect(fetchSpaceItems).toHaveBeenCalledWith('sp1')
    expect(out).toHaveLength(rows.length)
  })

  it('rend null quand le lot des articles échoue (repli sur la boucle par PdV)', async () => {
    const fetchBatch = jest.fn().mockRejectedValue(new Error('500'))
    const fetchSpaceItems = jest.fn().mockResolvedValue({ items: spaceItems })
    expect(await loadRestockAssignmentBatch({ ...base, fetchBatch, fetchSpaceItems })).toBeNull()
    expect(fetchSpaceItems).not.toHaveBeenCalled()
  })

  it('rend null quand le lot revient vide ou invalide', async () => {
    const fetchSpaceItems = jest.fn().mockResolvedValue({ items: spaceItems })
    for (const answer of [{}, null, undefined, [], 'x']) {
      const fetchBatch = jest.fn().mockResolvedValue(answer)
      expect(await loadRestockAssignmentBatch({ ...base, fetchBatch, fetchSpaceItems })).toBeNull()
    }
  })

  it('n exclut rien quand la disponibilité de l espace échoue, et garde les articles', async () => {
    const fetchBatch = jest.fn().mockResolvedValue(byShop)
    const fetchSpaceItems = jest.fn().mockRejectedValue(new Error('timeout'))
    const out = await loadRestockAssignmentBatch({ ...base, fetchBatch, fetchSpaceItems })
    expect(out[0].items).toHaveLength(2)
    expect(out.every((r) => r.unavailable.length === 0)).toBe(true)
  })

  it('rend null sans espace, sans configuration ou sans PdV, sans appeler le serveur', async () => {
    const fetchBatch = jest.fn()
    const fetchSpaceItems = jest.fn()
    expect(await loadRestockAssignmentBatch({ spaceId: '', configId: 'c', rows, fetchBatch, fetchSpaceItems })).toBeNull()
    expect(await loadRestockAssignmentBatch({ spaceId: 's', configId: '', rows, fetchBatch, fetchSpaceItems })).toBeNull()
    expect(await loadRestockAssignmentBatch({ spaceId: 's', configId: 'c', rows: [], fetchBatch, fetchSpaceItems })).toBeNull()
    expect(fetchBatch).not.toHaveBeenCalled()
  })
})

describe('mergeInFlightAssignmentFetchers', () => {
  const makeFetchers = () => {
    let resolveBatch
    let resolveItems
    return {
      fetchBatch: jest.fn(() => new Promise((res) => { resolveBatch = res })),
      fetchSpaceItems: jest.fn(() => new Promise((res) => { resolveItems = res })),
      resolveBatch: (v) => resolveBatch(v),
      resolveItems: (v) => resolveItems(v),
    }
  }

  it('fusionne deux chargements successifs : un seul GET par lot, même réponse pour les deux', async () => {
    const f = makeFetchers()
    const flight = createSingleFlight()
    const a = mergeInFlightAssignmentFetchers({ flight, fetchBatch: f.fetchBatch, fetchSpaceItems: f.fetchSpaceItems })
    const b = mergeInFlightAssignmentFetchers({ flight, fetchBatch: f.fetchBatch, fetchSpaceItems: f.fetchSpaceItems })

    const p1 = a.fetchBatch('sp', 'cfg')
    const p2 = b.fetchBatch('sp', 'cfg')
    const q1 = a.fetchSpaceItems('sp')
    const q2 = b.fetchSpaceItems('sp')

    expect(f.fetchBatch).toHaveBeenCalledTimes(1)
    expect(f.fetchSpaceItems).toHaveBeenCalledTimes(1)

    f.resolveBatch({ 'shop-a': { items: [] } })
    f.resolveItems({ items: [] })
    expect(await p1).toBe(await p2)
    expect(await q1).toBe(await q2)
  })

  it('clés : espace + configuration pour le lot 1, espace seul pour le lot 2', async () => {
    const f = makeFetchers()
    const flight = createSingleFlight()
    const m = mergeInFlightAssignmentFetchers({ flight, fetchBatch: f.fetchBatch, fetchSpaceItems: f.fetchSpaceItems })

    m.fetchBatch('sp', 'cfg-1')
    m.fetchBatch('sp', 'cfg-2')
    m.fetchSpaceItems('sp')
    m.fetchSpaceItems('sp-autre')

    expect(f.fetchBatch).toHaveBeenCalledTimes(2)
    expect(f.fetchSpaceItems).toHaveBeenCalledTimes(2)
  })

  it('force contourne la fusion et relit le serveur', () => {
    const f = makeFetchers()
    const flight = createSingleFlight()
    const normal = mergeInFlightAssignmentFetchers({ flight, fetchBatch: f.fetchBatch, fetchSpaceItems: f.fetchSpaceItems })
    const forced = mergeInFlightAssignmentFetchers({ flight, fetchBatch: f.fetchBatch, fetchSpaceItems: f.fetchSpaceItems, force: true })

    normal.fetchBatch('sp', 'cfg')
    forced.fetchBatch('sp', 'cfg')
    normal.fetchSpaceItems('sp')
    forced.fetchSpaceItems('sp')

    expect(f.fetchBatch).toHaveBeenCalledTimes(2)
    expect(f.fetchSpaceItems).toHaveBeenCalledTimes(2)
  })

  it('après la fin du premier chargement, le suivant relance les GET (pas de cache)', async () => {
    const flight = createSingleFlight()
    const fetchBatch = jest.fn().mockResolvedValue({ 'shop-a': { items: [] } })
    const fetchSpaceItems = jest.fn().mockResolvedValue({ items: [] })
    const m = mergeInFlightAssignmentFetchers({ flight, fetchBatch, fetchSpaceItems })

    await m.fetchBatch('sp', 'cfg')
    await m.fetchSpaceItems('sp')
    await m.fetchBatch('sp', 'cfg')
    await m.fetchSpaceItems('sp')

    expect(fetchBatch).toHaveBeenCalledTimes(2)
    expect(fetchSpaceItems).toHaveBeenCalledTimes(2)
  })

  it('deux chargements simultanés via loadRestockAssignmentBatch ne tirent chaque GET qu une fois', async () => {
    const flight = createSingleFlight()
    const fetchBatch = jest.fn().mockResolvedValue({ 'shop-a': { items: [{ id: 'mi-1', name: 'Bière', basePrice: 6 }] } })
    const fetchSpaceItems = jest.fn().mockResolvedValue({ items: [{ id: 'mi-1', name: 'Bière', available: true }] })
    const fetchers = mergeInFlightAssignmentFetchers({ flight, fetchBatch, fetchSpaceItems })
    const args = { spaceId: 'sp', configId: 'cfg', rows: [{ id: 'shop-a', name: 'Buvette A' }], ...fetchers }

    const [r1, r2] = await Promise.all([loadRestockAssignmentBatch(args), loadRestockAssignmentBatch(args)])

    expect(fetchBatch).toHaveBeenCalledTimes(1)
    expect(fetchSpaceItems).toHaveBeenCalledTimes(1)
    expect(r1).toEqual(r2)
    expect(r1[0].items.map((i) => i.id)).toEqual(['mi-1'])
  })
})
