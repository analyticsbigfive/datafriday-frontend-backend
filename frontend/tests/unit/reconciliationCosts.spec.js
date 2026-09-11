import { buildUnitCostByItemId } from '@/utils/reconciliationCosts'

describe('buildUnitCostByItemId (Q40, coût par kind)', () => {
  const marketPrices = [
    { id: 'mp-fut', pricePerUnit: 2.4 },
    { id: 'mp-zero', pricePerUnit: 0 },
  ]
  const components = [{ id: 'c-sauce', unitCost: 0.35 }]
  const menuItemCostMap = { 'mi-coca': 0.6, 'mp-fut': 99 }

  it('market price pour un article compté sous son marketPriceId (id compté = id market price)', () => {
    const costs = buildUnitCostByItemId({ countedItems: [{ id: 'mp-fut' }], menuItemCostMap, marketPrices, components })
    expect(costs).toEqual({ 'mp-fut': 2.4 }) // la market price prime sur une collision menuItemCostMap
  })

  it('market price via marketPriceId explicite quand le comptage garde l’id ingrédient', () => {
    const costs = buildUnitCostByItemId({
      countedItems: [{ id: 'ing-fut', marketPriceId: 'mp-fut' }],
      marketPrices,
    })
    expect(costs).toEqual({ 'ing-fut': 2.4 })
  })

  it('unitCost pour un composant, menuItemCostMap pour un article compté tel quel', () => {
    const costs = buildUnitCostByItemId({
      countedItems: [{ id: 'c-sauce', isComponent: true }, { id: 'mi-coca' }],
      menuItemCostMap,
      marketPrices,
      components,
    })
    expect(costs).toEqual({ 'c-sauce': 0.35, 'mi-coca': 0.6 })
  })

  it('jamais un 0 € fabriqué : coût nul, absent ou non numérique → article hors index', () => {
    const costs = buildUnitCostByItemId({
      countedItems: [{ id: 'mp-zero' }, { id: 'inconnu' }, { id: 'mi-nan' }, { id: null }],
      menuItemCostMap: { 'mi-nan': 'abc' },
      marketPrices,
      components,
    })
    expect(costs).toEqual({})
  })
})
