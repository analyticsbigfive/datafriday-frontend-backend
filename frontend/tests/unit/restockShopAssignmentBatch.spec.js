import {
  buildAssignmentResultsFromBatch,
  loadRestockAssignmentBatch,
  restockShopIdOfRow,
} from '@/utils/restockShopAssignmentBatch'

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
