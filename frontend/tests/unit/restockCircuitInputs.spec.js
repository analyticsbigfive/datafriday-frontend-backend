import {
  buildCircuitShopRows,
  buildCircuitStorageRows,
  computeRestockCircuit,
  applyCircuitToStorageGroups,
} from '@/utils/restockCircuitInputs'

const KEY = 'aff|||L'
const shopRow = (shopId, target, remaining, over = {}) => ({
  shopId, shopName: shopId, itemKey: KEY, unit: 'L', targetQuantity: target, remainingQuantity: remaining, ...over,
})
const item = { itemKey: KEY, itemId: 'aff', itemName: 'Affligem blonde', unit: 'L', marketPriceId: 'mp1' }
const storeRow = (over = {}) => ({
  key: 'storage:e1:affligem', elementId: 'e1', name: 'Affligem', unit: 'L', menuItemId: null,
  marketPriceId: 'mp1', buffer: 3000, remaining: 13, percent: 100, required: 2987, ...over,
})
const groups = (rows) => [{ elementId: 'e1', elementName: 'Oceanne', rows }]

describe('buildCircuitShopRows', () => {
  it('exclut les articles décochés et met packSize à null sans conditionnement', () => {
    const rows = [shopRow('A', 10, 0), shopRow('B', 5, 0, { itemKey: 'x|||L' })]
    const out = buildCircuitShopRows(rows, { 'x|||L': true }, () => null)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ shopId: 'A', itemKey: KEY, packSize: null, targetQuantity: 10 })
  })
})

describe('buildCircuitStorageRows', () => {
  it('relie la réserve à l article PDV par Market Price', () => {
    const [r] = buildCircuitStorageRows(groups([storeRow()]), [item], () => 30)
    expect(r).toMatchObject({ itemKey: KEY, unit: 'L', buffer: 3000, remaining: 13, percent: 100, packSize: 30 })
  })
  it('relie par id article puis par nom', () => {
    const byId = buildCircuitStorageRows(groups([storeRow({ marketPriceId: null, menuItemId: 'aff' })]), [item], () => null)
    expect(byId[0].itemKey).toBe(KEY)
    expect(byId[0].packSize).toBeNull()
    const byName = buildCircuitStorageRows(groups([storeRow({ marketPriceId: null, name: 'affligem BLONDE' })]), [item], () => null)
    expect(byName[0].itemKey).toBe(KEY)
  })
  it('sans article PDV correspondant, garde sa propre clé', () => {
    const [r] = buildCircuitStorageRows(groups([storeRow({ marketPriceId: 'zz', name: 'Autre' })]), [item], () => 30)
    expect(r.itemKey).not.toBe(KEY)
    expect(r.unit).toBe('L')
  })
})

describe('computeRestockCircuit, cas Affligem', () => {
  const shopRows = buildCircuitShopRows(
    [shopRow('HK', 28.4, 240), shopRow('Loire14', 75.2, 6), shopRow('Oceane11', 25.7, 0)],
    {},
    () => 30,
  )
  const storageRows = buildCircuitStorageRows(groups([storeRow()]), [item], () => 30)

  it('0 fût à commander pour les PDV, 100 fûts pour la réserve', () => {
    const c = computeRestockCircuit({ shopRows, storageRows })
    expect(c.orderByItem[KEY]).toBe(0)
    expect(c.flowByShopRow[`HK|||${KEY}`]).toMatchObject({ ceded: 120, finalStock: 120 })
    expect(c.flowByShopRow[`Loire14|||${KEY}`].received).toBe(90)
    expect(c.flowByShopRow[`Oceane11|||${KEY}`].received).toBe(30)
    expect(c.transfersByItem[KEY]).toHaveLength(2)
    expect(c.storageFlowByKey['storage:e1:affligem']).toMatchObject({ drawn: 0, required: 2987, purchase: 3000 })
  })

  it('l article décoché ne cède ni ne reçoit', () => {
    const rows = buildCircuitShopRows(
      [shopRow('HK', 28.4, 240), shopRow('Loire14', 75.2, 6)],
      { [KEY]: true },
      () => 30,
    )
    const c = computeRestockCircuit({ shopRows: rows, storageRows })
    expect(c.orderByItem[KEY]).toBeUndefined()
    expect(c.transfersByItem[KEY]).toBeUndefined()
  })

  it('applyCircuitToStorageGroups remplace required par la valeur après prélèvement', () => {
    const g = groups([storeRow({ remaining: 300 })])
    const rows = buildCircuitStorageRows(g, [item], () => 30)
    const c = computeRestockCircuit({ shopRows, storageRows: rows })
    const out = applyCircuitToStorageGroups(g, c.storageFlowByKey)
    // Pas de manque PDV après surplus : aucun prélèvement, 3000 - 300.
    expect(out[0].rows[0].required).toBe(2700)
    expect(g[0].rows[0].required).toBe(2987)
  })
})
