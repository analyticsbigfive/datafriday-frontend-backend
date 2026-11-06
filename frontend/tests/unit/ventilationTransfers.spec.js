import { buildTransfers, ownNeedPacks, summarizeSource, toTaskLines, transferKey } from '@/utils/ventilationTransfers'

const group = (itemKey, rows) => ({
  itemKey, itemName: itemKey, packagingType: 'Fût', unitsPerPack: 30,
  rows: rows.map(([shopId, packs]) => ({ shopId, shopName: shopId, packs, quantity: packs * 30 })),
})

describe('buildTransfers', () => {
  it('répartit les colis entiers et liste le manque', () => {
    const r = buildTransfers({ groups: [group('a', [['L', 3], ['O', 2]])], sourcePacks: () => 4 })
    expect(r.transfers.map((t) => [t.shopId, t.packs])).toEqual([['L', 3], ['O', 1]])
    expect(r.shortages.map((t) => [t.shopId, t.packs])).toEqual([['O', 1]])
  })
  it('garde les colis réservés par la source', () => {
    const r = buildTransfers({ groups: [group('a', [['L', 3]])], sourcePacks: () => 4, reservedPacks: () => 2 })
    expect(r.transfers[0].packs).toBe(2)
    expect(r.shortages[0].packs).toBe(1)
  })
  it('ne fabrique rien quand le stock est inconnu', () => {
    const r = buildTransfers({ groups: [group('a', [['L', 3]])], sourcePacks: () => null })
    expect(r.transfers).toEqual([])
    expect(r.unknown[0].reason).toBe('no-stock')
  })
  it('signale une ligne sans colis', () => {
    const g = { itemKey: 'x', itemName: 'x', rows: [{ shopId: 'L', packs: null, quantity: 5 }] }
    expect(buildTransfers({ groups: [g], sourcePacks: () => 9 }).unknown[0].reason).toBe('no-pack')
  })
})

describe('toTaskLines', () => {
  it('construit le lot', () => {
    const [t] = buildTransfers({ groups: [group('a', [['L', 2]])], sourcePacks: () => 5 }).transfers
    const [line] = toTaskLines([t], { sourceElementId: 'HK', assigneeFor: () => 'u1' })
    expect(line).toEqual({ itemKey: 'a', sourceElementId: 'HK', destinationElementId: 'L', packed: 2, loose: 0, assignedToUserId: 'u1', priority: 'TODO' })
    expect(transferKey(t)).toBe('L::a')
  })
})

describe('ownNeedPacks et summarizeSource', () => {
  it('lit le besoin propre dans la ligne du stockage source, 0 sinon', () => {
    const own = ownNeedPacks([group('a', [['S', 2], ['L', 3]]), group('b', [['L', 1]])], 'S')
    expect(own('a')).toBe(2)
    expect(own('b')).toBe(0)
  })
  it('résume stock, gardé, déposé, restant et à commander', () => {
    const groups = [group('a', [['L', 3], ['O', 2]])]
    const reservedPacks = () => 1
    const result = buildTransfers({ groups, sourcePacks: () => 5, reservedPacks })
    const [s] = summarizeSource({ groups, result, sourcePacks: () => 5, reservedPacks })
    expect(s).toMatchObject({ stock: 5, reserved: 1, available: 4, deposited: 4, left: 0, toOrder: 1 })
  })
  it('ignore un stock inconnu', () => {
    const groups = [group('a', [['L', 3]])]
    expect(summarizeSource({ groups, result: { transfers: [], shortages: [] }, sourcePacks: () => null })).toEqual([])
  })
})
