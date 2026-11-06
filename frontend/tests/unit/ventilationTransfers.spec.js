import { buildTransfers, ownNeedPacks, summarizeSource, toTaskLines, transferKey, isShopTransfer } from '@/utils/ventilationTransfers'

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

describe('buildTransfers : colis reçus d\'autres PDV', () => {
  const donor = (shopId, packs, remainingFromLogistic = true) => ({ shopId, shopName: `PDV ${shopId}`, packs, quantity: packs * 30, remainingFromLogistic })
  const withReceived = (shopId, packs, receivedFrom) => ({ shopId, shopName: shopId, packs, quantity: packs * 30, receivedFrom })
  const grp = (rows) => ({ itemKey: 'a', itemName: 'a', packagingType: 'Fût', unitsPerPack: 30, rows })

  it('sans receivedFrom : comportement identique, aucun champ de cédant', () => {
    const r = buildTransfers({ groups: [grp([withReceived('L', 2, undefined)])], sourcePacks: () => 5 })
    expect(r.transfers).toHaveLength(1)
    expect(isShopTransfer(r.transfers[0])).toBe(false)
    expect(r.unverified).toEqual([])
  })

  it('receveur avec 2 cédants Logistic : 2 transferts PDV vers PDV, le reste par le stockage', () => {
    const r = buildTransfers({
      groups: [grp([withReceived('L', 5, [donor('A', 1), donor('B', 2)])])],
      sourcePacks: () => 10,
    })
    expect(r.transfers.map((t) => [t.fromShopId || 'SRC', t.shopId, t.packs])).toEqual([
      ['A', 'L', 1],
      ['B', 'L', 2],
      ['SRC', 'L', 2],
    ])
    expect(r.shortages).toEqual([])
    expect(r.unverified).toEqual([])
  })

  it('cédant non Logistic : listé en unverified, le besoin retombe sur le stockage source', () => {
    const r = buildTransfers({
      groups: [grp([withReceived('L', 3, [donor('A', 2, false)])])],
      sourcePacks: () => 10,
    })
    expect(r.unverified.map((u) => [u.fromShopId, u.fromShopName, u.shopId, u.packs])).toEqual([['A', 'PDV A', 'L', 2]])
    expect(r.transfers.map((t) => [t.fromShopId || 'SRC', t.packs])).toEqual([['SRC', 3]])
  })

  it('mélange cédant vérifié et non vérifié', () => {
    const r = buildTransfers({
      groups: [grp([withReceived('L', 3, [donor('A', 1), donor('B', 1, false)])])],
      sourcePacks: () => 10,
    })
    expect(r.transfers.map((t) => [t.fromShopId || 'SRC', t.packs])).toEqual([['A', 1], ['SRC', 2]])
    expect(r.unverified).toHaveLength(1)
  })

  it('ne dépasse jamais le besoin de la ligne (colis entiers, plafonnés)', () => {
    const r = buildTransfers({
      groups: [grp([withReceived('L', 2, [donor('A', 5)])])],
      sourcePacks: () => 10,
    })
    expect(r.transfers.map((t) => [t.fromShopId || 'SRC', t.packs])).toEqual([['A', 2]])
  })

  it('stock source insuffisant pour le reste : manque listé, transferts PDV conservés', () => {
    const r = buildTransfers({
      groups: [grp([withReceived('L', 4, [donor('A', 1)])])],
      sourcePacks: () => 1,
    })
    expect(r.transfers.map((t) => [t.fromShopId || 'SRC', t.packs])).toEqual([['A', 1], ['SRC', 1]])
    expect(r.shortages.map((t) => [t.shopId, t.packs])).toEqual([['L', 2]])
  })

  it('stock source inconnu : les transferts PDV passent quand même, seul le reste est inconnu', () => {
    const r = buildTransfers({
      groups: [grp([withReceived('L', 3, [donor('A', 1)])])],
      sourcePacks: () => null,
    })
    expect(r.transfers.map((t) => t.fromShopId)).toEqual(['A'])
    expect(r.unknown[0].reason).toBe('no-stock')
  })

  it('besoin entièrement couvert par les PDV : pas de lecture du stock source', () => {
    const r = buildTransfers({
      groups: [grp([withReceived('L', 2, [donor('A', 2)])])],
      sourcePacks: () => null,
    })
    expect(r.transfers).toHaveLength(1)
    expect(r.unknown).toEqual([])
  })

  it('le stock source n\'est pas consommé par les colis PDV vers PDV', () => {
    const r = buildTransfers({
      groups: [grp([withReceived('L', 3, [donor('A', 2)]), withReceived('M', 2, undefined)])],
      sourcePacks: () => 3,
    })
    const fromSource = r.transfers.filter((t) => !isShopTransfer(t)).map((t) => [t.shopId, t.packs])
    expect(fromSource).toEqual([['L', 1], ['M', 2]])
    expect(r.shortages).toEqual([])
  })

  it('toTaskLines : source = PDV cédant, clé de transfert distincte', () => {
    const r = buildTransfers({ groups: [grp([withReceived('L', 3, [donor('A', 1)])])], sourcePacks: () => 5 })
    const lines = toTaskLines(r.transfers, { sourceElementId: 'HK', assigneeFor: () => 'u1' })
    expect(lines.map((l) => [l.sourceElementId, l.destinationElementId, l.packed])).toEqual([['A', 'L', 1], ['HK', 'L', 2]])
    expect(new Set(r.transfers.map(transferKey)).size).toBe(2)
  })

  it('summarizeSource ne compte pas les transferts PDV vers PDV comme déposés', () => {
    const groups = [grp([withReceived('L', 3, [donor('A', 1)])])]
    const result = buildTransfers({ groups, sourcePacks: () => 5 })
    const [sum] = summarizeSource({ groups, result, sourcePacks: () => 5 })
    expect(sum.deposited).toBe(2)
  })
})
