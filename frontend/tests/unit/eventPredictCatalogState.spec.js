import { buildCatalogState, recipeDepth } from '@/utils/eventPredictCatalogState'

const enriched = (id, extra = {}) => ({ id, components: [{ ingredientId: 'i1' }], ...extra })

describe('buildCatalogState', () => {
  it('coût = unitCost puis cost, seulement si > 0', () => {
    const { costMap } = buildCatalogState(
      [
        { id: 'a', unitCost: 2.5, cost: 9 },
        { id: 'b', cost: 1.2 },
        { id: 'c', unitCost: 0, cost: 0 },
        { id: 'd' },
        { cost: 4 },
      ],
      { menuItemCostMap: { z: 7 } },
    )
    expect(costMap).toEqual({ a: 2.5, b: 1.2 })
  })

  it('aucun coût > 0 dans le catalogue : repli sur la costMap du store (copie)', () => {
    const storeMap = { x: 3, y: 4 }
    const { costMap } = buildCatalogState([{ id: 'a', cost: 0 }], { menuItemCostMap: storeMap })
    expect(costMap).toEqual({ x: 3, y: 4 })
    expect(costMap).not.toBe(storeMap)
  })

  it('catalogue absent ou vide : repli store pour les coûts ET les articles', () => {
    const storeMis = [enriched('s1')]
    const state = { menuItemCostMap: { s1: 5 }, menuItems: storeMis }
    for (const empty of [[], null, undefined]) {
      const out = buildCatalogState(empty, state)
      expect(out.costMap).toEqual({ s1: 5 })
      expect(out.menuItems).toBe(storeMis)
    }
  })

  it('catalogue enrichi (au moins un article avec components) : on garde les articles API', () => {
    const api = [{ id: 'a', unitCost: 1 }, enriched('b')]
    const out = buildCatalogState(api, { menuItems: [enriched('s1')], menuItemCostMap: {} })
    expect(out.menuItems).toBe(api)
  })

  it('catalogue non enrichi : articles du store s il y en a, sinon articles API', () => {
    const api = [{ id: 'a', unitCost: 1, components: [] }]
    const storeMis = [enriched('s1')]
    expect(buildCatalogState(api, { menuItems: storeMis }).menuItems).toBe(storeMis)
    expect(buildCatalogState(api, { menuItems: [] }).menuItems).toBe(api)
    expect(buildCatalogState(api, null).menuItems).toBe(api)
  })

  it('store absent et catalogue vide : état vide, jamais d erreur', () => {
    expect(buildCatalogState([], null)).toEqual({ costMap: {}, menuItems: [] })
    expect(buildCatalogState(undefined, undefined)).toEqual({ costMap: {}, menuItems: [] })
  })
})

describe('recipeDepth', () => {
  it('somme les lignes de recette, ignore les entrées sans components', () => {
    expect(recipeDepth([{ components: [1, 2] }, { components: [3] }, {}, null])).toBe(3)
    expect(recipeDepth(null)).toBe(0)
    expect(recipeDepth([])).toBe(0)
  })
})
