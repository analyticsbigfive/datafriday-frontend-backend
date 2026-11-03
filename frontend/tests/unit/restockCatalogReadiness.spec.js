import { computeCatalogReadiness } from '@/components/space-workspace/restock/composables/useRestockCatalogReadiness'

const base = (over = {}) => ({
  analyse: { menuItems: [], recipeCatalogLoaded: false, catalogLoadErrors: {} },
  inventory: { marketPricesCachedAt: null, marketPricesError: null },
  marketPriceTypes: { loadError: null },
  marketPriceCategories: { loadError: null },
  ...over,
})

describe('computeCatalogReadiness', () => {
  it('pas prêt tant que rien n est arrivé', () => {
    expect(computeCatalogReadiness(base()).ready).toBe(false)
  })

  it('prêt quand composants + coûts sont arrivés', () => {
    const r = computeCatalogReadiness(base({
      analyse: { menuItems: [{ id: 1 }], recipeCatalogLoaded: true, catalogLoadErrors: {} },
      inventory: { marketPricesCachedAt: 1, marketPricesError: null },
    }))
    expect(r).toEqual({ ready: true, failures: [] })
  })

  it('un échec composants rend prêt (plus de blocage) et le liste', () => {
    const r = computeCatalogReadiness(base({
      analyse: { menuItems: [{ id: 1 }], recipeCatalogLoaded: false, catalogLoadErrors: { components: { status: 500 }, menuItems: null } },
      inventory: { marketPricesCachedAt: null, marketPricesError: { status: 500 } },
    }))
    expect(r.ready).toBe(true)
    expect(r.failures).toEqual(['components', 'marketPrices'])
  })

  it('catalogue vide mais livré : prêt sans échec', () => {
    const r = computeCatalogReadiness(base({
      analyse: { menuItems: [], recipeCatalogLoaded: true, catalogLoadErrors: {} },
      inventory: { marketPricesCachedAt: 1, marketPricesError: null },
    }))
    expect(r).toEqual({ ready: true, failures: [] })
  })

  it('échec ingrédients seul (composants OK) : prêt, pas d attente de 150 s', () => {
    const r = computeCatalogReadiness(base({
      analyse: { menuItems: [{ id: 1 }], recipeCatalogLoaded: false, catalogLoadErrors: { ingredients: { status: 503 }, components: null } },
      inventory: { marketPricesCachedAt: 1, marketPricesError: null },
    }))
    expect(r).toEqual({ ready: true, failures: ['ingredients'] })
  })
})
