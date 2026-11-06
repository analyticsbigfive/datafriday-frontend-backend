import { buildRestockCircuit, circuitKey } from '@/utils/restockCircuit'

const KEY = 'affligem'
const shop = (shopId, target, remaining, packSize = 30, itemKey = KEY, unit = 'L') => ({
  shopId, shopName: shopId, itemKey, unit, targetQuantity: target, remainingQuantity: remaining, packSize,
})
const reserve = (over = {}) => ({
  key: 'st1', itemKey: KEY, elementId: 'e1', name: 'Oceanne', unit: 'L',
  buffer: 3000, remaining: 13, percent: 100, packSize: 30, ...over,
})
const item = (res, itemKey = KEY, unit = 'L') => res.byItem[circuitKey(itemKey, unit)]
const line = (res, id, itemKey = KEY) => res.shopLines.find((l) => l.shopId === id && l.itemKey === itemKey)

describe('buildRestockCircuit', () => {
  it('cas Affligem blonde : surplus HK, puis réserve, puis achat', () => {
    const res = buildRestockCircuit({
      shopRows: [shop('HK', 28.4, 240), shop('Loire14', 75.2, 6), shop('Oceane11', 25.7, 0)],
      storageRows: [reserve()],
    })
    const it = item(res)
    expect(it.gapTotal).toBeCloseTo(94.9, 6)
    expect(it.transfers).toEqual([
      { fromShopId: 'HK', toShopId: 'Loire14', quantity: 90, packs: 3 },
      { fromShopId: 'HK', toShopId: 'Oceane11', quantity: 30, packs: 1 },
    ])
    expect(line(res, 'HK').ceded).toBe(120)
    expect(line(res, 'HK').finalStock).toBe(120)
    expect(line(res, 'Loire14').received).toBe(90)
    expect(line(res, 'Oceane11').received).toBe(30)
    expect(it.storageDraws).toEqual([])
    expect(it.purchaseForShops).toBe(0)
    expect(res.storageLines[0].drawn).toBe(0)
    expect(res.storageLines[0].required).toBe(2987)
    expect(res.storageLines[0].purchase).toBe(3000)
    expect(res.storageLines[0].packs).toBe(100)
    expect(it.totalPurchase).toBe(3000)
  })

  it('surplus insuffisant : le reste vient de la réserve puis de l achat', () => {
    // HK cède 1 fût (surplus 40 -> 1 fût). Besoins : 70 et 70 -> 3 fûts chacun.
    const res = buildRestockCircuit({
      shopRows: [shop('A', 10, 50), shop('B', 70, 0), shop('C', 70, 0)],
      storageRows: [reserve({ buffer: 100, remaining: 65 })],
    })
    const it = item(res)
    expect(it.transfers).toEqual([{ fromShopId: 'A', toShopId: 'B', quantity: 30, packs: 1 }])
    // B : reste 40 -> 2 fûts réserve (60 dispo = 2 fûts). C : plus rien en réserve.
    expect(line(res, 'B').fromStorage).toBe(60)
    expect(line(res, 'B').purchase).toBe(0)
    expect(line(res, 'C').fromStorage).toBe(0)
    expect(line(res, 'C').purchase).toBe(90)
    expect(it.storageDraws).toEqual([{ key: 'st1', quantity: 60 }])
    // Réserve : restant 65 - 60 = 5, tampon 100 -> 95 -> 4 fûts = 120.
    expect(res.storageLines[0].required).toBe(95)
    expect(res.storageLines[0].purchase).toBe(120)
    expect(it.totalPurchase).toBe(90 + 120)
  })

  it('sans packSize : aucun transfert, arrondi ceilForUnit', () => {
    const res = buildRestockCircuit({
      shopRows: [shop('A', 10, 100, null), shop('B', 10.34, 0, null)],
      storageRows: [reserve({ packSize: null, buffer: 5, remaining: 1 })],
    })
    const it = item(res)
    expect(it.transfers).toEqual([])
    expect(it.storageDraws).toEqual([])
    expect(line(res, 'B').purchase).toBe(10.4)
    expect(res.storageLines[0].purchase).toBe(4)
    expect(res.storageLines[0].packs).toBeNull()
  })

  it('aucun surplus : total acheté égal à l ancien calcul par PDV', () => {
    const rows = [shop('A', 40, 10), shop('B', 25, 0), shop('C', 10, 10)]
    const res = buildRestockCircuit({
      shopRows: rows,
      storageRows: [reserve({ buffer: 70, remaining: 10 })],
    })
    const oldShops = rows.reduce(
      (s, r) => s + Math.ceil(Math.max(0, r.targetQuantity - r.remainingQuantity) / 30) * 30, 0)
    const oldStorage = Math.ceil((70 - 10) / 30) * 30
    const it = item(res)
    expect(it.transfers).toEqual([])
    expect(it.purchaseForShops).toBe(oldShops)
    expect(it.totalPurchase).toBe(oldShops + oldStorage)
  })

  it('articles indépendants : pas de transfert entre articles ni entre unités', () => {
    const res = buildRestockCircuit({
      shopRows: [
        shop('A', 10, 100, 30, 'biere'),
        shop('B', 40, 0, 30, 'cola'),
        shop('C', 10, 100, 30, 'cola', 'kg'),
        shop('D', 10, 0, 30, 'cola', 'kg'),
      ],
    })
    expect(item(res, 'biere').transfers).toEqual([])
    expect(item(res, 'cola').transfers).toEqual([])
    expect(item(res, 'cola').purchaseForShops).toBe(60)
    expect(item(res, 'cola', 'kg').transfers).toEqual([
      { fromShopId: 'C', toShopId: 'D', quantity: 30, packs: 1 },
    ])
    expect(item(res, 'cola', 'kg').purchaseForShops).toBe(0)
  })

  it('pourcentage de réserve différent de 100', () => {
    const res = buildRestockCircuit({
      shopRows: [],
      storageRows: [reserve({ buffer: 200, remaining: 20, percent: 50 })],
    })
    // (200 - 20) * 0,5 = 90 -> 3 fûts.
    expect(res.storageLines[0].required).toBe(90)
    expect(res.storageLines[0].purchase).toBe(90)
    expect(res.storageLines[0].packs).toBe(3)
    const res2 = buildRestockCircuit({
      shopRows: [],
      storageRows: [reserve({ buffer: 200, remaining: 20, percent: 40 })],
    })
    expect(res2.storageLines[0].required).toBe(72)
    expect(res2.storageLines[0].purchase).toBe(90)
  })

  it('quantités à virgule : fût entier sans erreur flottante', () => {
    const res = buildRestockCircuit({
      shopRows: [shop('A', 0.1, 30.1, 0.5, 'x', 'kg'), shop('B', 0.7, 0.1, 0.5, 'x', 'kg')],
    })
    const it = item(res, 'x', 'kg')
    // A surplus 30 -> 60 paquets cédables ; B manque 0,6 -> 2 paquets de 0,5.
    expect(it.transfers).toEqual([{ fromShopId: 'A', toShopId: 'B', quantity: 1, packs: 2 }])
    expect(it.purchaseForShops).toBe(0)
    expect(line(res, 'A', 'x').finalStock).toBe(29.1)
  })
})
