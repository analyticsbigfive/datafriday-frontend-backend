import {
  componentIngredientDemands,
  componentOrderCost,
  buildComponentOrdersPanel,
} from '@/utils/restockComponentOrders'

const sub = (name, units, extra = {}) => ({ name, unit: 'kg', numberOfUnits: units, itemType: 'Ingredient', marketPriceId: `mp-${name}`, ...extra })
const chimi = {
  id: 'c1',
  name: 'Chimichurri',
  numberOfUnitsRecipe: 2,
  unitCost: '3.5',
  kitchenType: 'Local',
  subComponents: [sub('Ail', 1), sub('Persil', 4), sub('Ail', 1, { unit: 'g' })],
}
const order = (def, quantity, extra = {}) => ({
  itemKey: `${def.id}|||L`,
  itemName: def.name,
  unit: 'L',
  quantity,
  kitchen: { kind: 'local', id: null, name: '' },
  def,
  source: {},
  ...extra,
})

describe('componentIngredientDemands', () => {
  it('quantité du composant x qtyFactor, clé = ligne directe (id|||unité)', () => {
    const d = componentIngredientDemands([order(chimi, 10)], [chimi])
    const ail = d.find((x) => x.itemKey === 'mp-Ail|||kg')
    expect(ail.quantity).toBe(5)
    expect(ail.marketPriceId).toBe('mp-Ail')
    expect(d.find((x) => x.itemKey === 'mp-Persil|||kg').quantity).toBe(20)
  })
  it('unité différente = clé séparée, sans conversion', () => {
    const d = componentIngredientDemands([order(chimi, 10)], [chimi])
    expect(d.find((x) => x.itemKey === 'mp-Ail|||g').quantity).toBe(5)
  })
  it('deux composants avec le même ingrédient : additionnés', () => {
    const other = { id: 'c2', name: 'Aioli', numberOfUnitsRecipe: 1, subComponents: [sub('Ail', 3)] }
    const d = componentIngredientDemands([order(chimi, 10), order(other, 2, { itemKey: 'c2|||L' })], [chimi, other])
    expect(d.find((x) => x.itemKey === 'mp-Ail|||kg').quantity).toBe(5 + 6)
  })
  it('quantité nulle ou composant sans définition : rien', () => {
    expect(componentIngredientDemands([order(chimi, 0), { itemKey: 'z', quantity: 3 }], [chimi])).toEqual([])
  })
})

describe('componentOrderCost', () => {
  it('unitCost x quantité', () => {
    expect(componentOrderCost(chimi, 10)).toBe(35)
  })
  it('unitCost absent ou nul : null, jamais 0', () => {
    expect(componentOrderCost({ unitCost: null }, 10)).toBeNull()
    expect(componentOrderCost({}, 10)).toBeNull()
    expect(componentOrderCost({ unitCost: 0 }, 10)).toBeNull()
    expect(componentOrderCost(null, 10)).toBeNull()
  })
})

describe('buildComponentOrdersPanel', () => {
  const labels = { local: 'Cuisine locale', undefined: 'Cuisine non définie' }
  it('nom, cuisine, libellé de quantité, coût, total, tri par nom', () => {
    const central = { id: 'c3', name: 'Aioli', unitCost: 2 }
    const p = buildComponentOrdersPanel(
      [
        order(chimi, 10),
        order(central, 4, { itemKey: 'c3|||L', kitchen: { kind: 'central', id: 'k1', name: 'Cuisine Nord' } }),
      ],
      { quantityLabel: (o) => `${o.quantity} L`, labels },
    )
    expect(p.lines.map((l) => l.name)).toEqual(['Aioli', 'Chimichurri'])
    expect(p.lines[0]).toMatchObject({ kitchenLabel: 'Cuisine Nord', quantityLabel: '4 L', amount: 8 })
    expect(p.lines[1]).toMatchObject({ kitchenLabel: 'Cuisine locale', amount: 35 })
    expect(p.total).toBe(43)
    expect(p.hasUnknownCost).toBe(false)
  })
  it('coût inconnu : amount null, total sans cette ligne, drapeau levé', () => {
    const p = buildComponentOrdersPanel([order(chimi, 10), order({ id: 'c9', name: 'Zeta' }, 2, { itemKey: 'c9|||L' })], { labels })
    expect(p.lines[1].amount).toBeNull()
    expect(p.total).toBe(35)
    expect(p.hasUnknownCost).toBe(true)
  })
  it('aucun composant : aucune ligne', () => {
    expect(buildComponentOrdersPanel([], { labels }).lines).toEqual([])
  })
})
