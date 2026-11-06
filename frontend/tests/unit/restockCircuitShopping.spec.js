import { netFinishedItemWithCircuit } from '@/utils/restockCircuitShopping'
import { computeRestockCircuit } from '@/utils/restockCircuitInputs'

const PACK = 30

function shop(shopId, itemKey, target, remaining) {
  return { shopId, shopName: shopId, itemKey, unit: 'L', targetQuantity: target, remainingQuantity: remaining, packSize: PACK }
}

function reserve(key, itemKey, buffer, remaining) {
  return { key, itemKey, elementId: 'e1', name: key, unit: 'L', buffer, remaining, percent: 100, packSize: PACK }
}

// Item de feuille de course tel que le construit la vue : Σ restockQuantity des PDV.
function sheetItem(itemKey, shopRows) {
  const quantity = shopRows.reduce((s, r) => s + Math.max(0, r.targetQuantity - r.remainingQuantity), 0)
  return { itemKey, quantity }
}

describe('restockCircuitShopping : étape 1 = étape 3', () => {
  it('Affligem : 0 fût pour les PDV, 100 fûts pour la réserve', () => {
    const shopRows = [shop('HK', 'aff', 28.4, 240), shop('Loire', 'aff', 75.2, 6), shop('Oceane', 'aff', 25.7, 0)]
    const storageRows = [reserve('r1', 'aff', 3000, 13)]
    const c = computeRestockCircuit({ shopRows, storageRows })
    const net = netFinishedItemWithCircuit(sheetItem('aff', shopRows), c.orderByItem)
    expect(c.orderByItem.aff).toBe(0)
    expect(net.buyQuantity).toBe(c.orderByItem.aff)
    // Réserve : 3000 - 13 = 2987 L, soit 100 fûts de 30 L.
    expect(c.storageFlowByKey.r1.purchase / PACK).toBe(100)
    const total = net.buyQuantity + c.storageFlowByKey.r1.purchase
    expect(total / PACK).toBe(100)
  })

  it('plusieurs articles : chaque buyQuantity = À commander de l\'étape 1', () => {
    const shopRows = [
      shop('A', 'bière', 100, 200),
      shop('B', 'bière', 100, 0),
      shop('A', 'cola', 60, 10),
      shop('B', 'cola', 60, 20),
      shop('A', 'eau', 30, 30),
    ]
    const storageRows = [reserve('r1', 'cola', 120, 60), reserve('r2', 'bière', 90, 0)]
    const c = computeRestockCircuit({ shopRows, storageRows })
    for (const key of ['bière', 'cola', 'eau']) {
      const rows = shopRows.filter((r) => r.itemKey === key)
      const net = netFinishedItemWithCircuit(sheetItem(key, rows), c.orderByItem)
      expect(net.buyQuantity).toBe(c.orderByItem[key])
      expect(net.restockNeed - net.storageOnHand).toBeCloseTo(net.buyQuantity, 9)
    }
  })

  it('article absent du circuit (décoché) : rien à acheter', () => {
    const net = netFinishedItemWithCircuit({ itemKey: 'x', quantity: 12 }, {})
    expect(net.buyQuantity).toBe(0)
    expect(net.storageOnHand).toBe(12)
  })
})
