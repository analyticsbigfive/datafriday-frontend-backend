import { computeIngredientCircuit, buildIngredientCircuitInputs } from '@/utils/restockCircuitIngredients'

function ingredient(name, quantity, extra = {}) {
  return { itemKey: `${name}|||${extra.unit || 'unit'}`, itemName: name, unit: 'kg', quantity, marketPriceId: `mp-${name}`, ...extra }
}

function reserveRow(key, name, buffer, remaining, extra = {}) {
  return { key, name, unit: 'kg', marketPriceId: `mp-${name}`, buffer, remaining, percent: 100, ...extra }
}

function stock(name, qty, extra = {}) {
  return { itemId: null, sourceId: null, marketPriceId: `mp-${name}`, name, unit: 'kg', qty, ...extra }
}

function run({ items, shopEntries = [], storageEntries = [], rows = [], pack = 100 }) {
  return computeIngredientCircuit({
    items,
    shopEntries,
    storageEntries,
    storageGroups: [{ elementId: 'e1', rows }],
    shopPackSizeFor: () => pack,
    storagePackSizeFor: () => pack,
  })
}

describe('restockCircuitIngredients', () => {
  it('sucre sans ligne PDV : achat 0, remplissage 500, la réserve revient à 600', () => {
    const items = [ingredient('Sucre', 400)]
    const r = run({
      items,
      storageEntries: [stock('Sucre', 500)],
      rows: [reserveRow('r1', 'Sucre', 600, 500)],
    })
    expect(r.purchaseByItem[items[0].itemKey]).toBe(0)
    expect(r.storageFlowByKey.r1.drawn).toBe(400)
    expect(r.storageFlowByKey.r1.required).toBe(500)
    expect(r.storageFlowByKey.r1.purchase).toBe(500)
    // 500 restant - 400 prélevé + 500 acheté = 600
    expect(500 - 400 + r.storageFlowByKey.r1.purchase).toBe(600)
  })

  it('Affligem : demande 129,3, stock PDV 246, réserve 13, tampon 3000 : achat 0, 100 fûts', () => {
    const items = [ingredient('Affligem', 129.3, { unit: 'L' })]
    const r = run({
      items,
      shopEntries: [stock('Affligem', 246, { unit: 'L' })],
      storageEntries: [stock('Affligem', 13, { unit: 'L' })],
      rows: [reserveRow('r1', 'Affligem', 3000, 13, { unit: 'L' })],
      pack: 30,
    })
    expect(r.shopOnHandByItem[items[0].itemKey]).toBe(246)
    expect(r.purchaseByItem[items[0].itemKey]).toBe(0)
    expect(r.storageFlowByKey.r1.drawn).toBe(0)
    expect(r.storageFlowByKey.r1.purchase / 30).toBe(100)
  })

  it('réserve sans ligne de tampon : prélevable, remplissage 0', () => {
    const items = [ingredient('Sel', 250)]
    const r = run({ items, storageEntries: [stock('Sel', 300)] })
    expect(r.purchaseByItem[items[0].itemKey]).toBe(0)
    const flow = r.storageFlowByKey['ingredient-stock:' + items[0].itemKey]
    expect(flow.drawn).toBe(300)
    expect(flow.required).toBe(0)
    expect(flow.purchase).toBe(0)
  })

  it('stock PDV insuffisant : réserve d abord, puis achat du reste', () => {
    const items = [ingredient('Farine', 1000)]
    const r = run({
      items,
      shopEntries: [stock('Farine', 100)],
      storageEntries: [stock('Farine', 300)],
      rows: [reserveRow('r1', 'Farine', 300, 300)],
    })
    // Écart 900 : 300 prélevés en réserve, 600 achetés ; réserve rachetée à 300.
    expect(r.storageFlowByKey.r1.drawn).toBe(300)
    expect(r.purchaseByItem[items[0].itemKey]).toBe(600)
    expect(r.storageFlowByKey.r1.required).toBe(300)
  })

  it('sans taille de colis : aucun prélèvement, achat arrondi ceilForUnit', () => {
    const items = [ingredient('Sucre', 400.2)]
    const r = run({
      items,
      storageEntries: [stock('Sucre', 500)],
      rows: [reserveRow('r1', 'Sucre', 600, 500)],
      pack: null,
    })
    expect(r.storageFlowByKey.r1.drawn).toBe(0)
    expect(r.purchaseByItem[items[0].itemKey]).toBeGreaterThanOrEqual(400.2)
    expect(r.storageFlowByKey.r1.required).toBe(100)
  })

  it('plusieurs réserves : prélèvement dans l ordre, chacune rachète son prélevé', () => {
    const items = [ingredient('Sucre', 300)]
    const r = run({
      items,
      storageEntries: [stock('Sucre', 400)],
      rows: [reserveRow('r1', 'Sucre', 200, 200), reserveRow('r2', 'Sucre', 300, 200)],
    })
    expect(r.storageFlowByKey.r1.drawn).toBe(200)
    expect(r.storageFlowByKey.r2.drawn).toBe(100)
    expect(r.purchaseByItem[items[0].itemKey]).toBe(0)
    // Remplissage = tampon - (restant - prélevé) : 200 et 200.
    expect(r.storageFlowByKey.r1.required).toBe(200)
    expect(r.storageFlowByKey.r2.required).toBe(200)
  })

  it('réserve sans ingrédient demandé : garde son remplissage brut', () => {
    const r = run({ items: [], rows: [reserveRow('r1', 'Poivre', 50, 20)] })
    expect(r.storageFlowByKey.r1.drawn).toBe(0)
    expect(r.storageFlowByKey.r1.required).toBe(30)
  })

  it('ne modifie pas les entrées des pools de l appelant', () => {
    const shopEntries = [stock('Sucre', 10)]
    buildIngredientCircuitInputs({ items: [ingredient('Sucre', 5)], shopEntries, storageEntries: [] })
    expect(shopEntries[0]).toEqual(stock('Sucre', 10))
  })
})
