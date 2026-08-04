/**
 * BUG-294-01 — la feuille de course charge désormais les recettes via le BATCH
 * POST /menu-items/recipes (un appel) au lieu du fan-out GET /menu-items/:id
 * (une requête par plat → 429 TenantThrottlerGuard → recettes vides cachées →
 * faux « Sans fournisseur (ingrédients manquants) »).
 *
 * `normalizeRecipeFromBatch` doit produire EXACTEMENT le même shape de lignes
 * que `normalizeRecipe` (chemin détail) : même clé d'agrégation, mêmes
 * exclusions, même éclatement composant en aval.
 */
import {
  buildIngredientRequirements,
  normalizeRecipe,
  normalizeRecipeFromBatch,
} from '@/utils/bomPlanning'

// Un élément de `items[]` du batch : components[] déjà aplatis, `id` = id de la
// LIGNE DE JOINTURE (MenuItemIngredient/…), `sourceId` = entité liée.
const batchBurger = {
  id: 'mi-burger',
  name: 'Burger 25/26 (Aux)',
  readyForSale: 'No',
  comboItem: 'No',
  numberOfPiecesRecipe: 1,
  cost: 1.96,
  components: [
    { id: 'line-1', sourceId: 'ing-iceberg', name: 'Salade Iceberg', itemType: 'Ingredient', numberOfUnits: 0.04, unit: 'kg', marketPriceId: 'mp-iceberg', supplierId: 'sup-metro', cost: 0.05 },
    { id: 'line-2', sourceId: 'ing-viande', name: 'Viande Hachée', itemType: 'Ingredient', numberOfUnits: 0.12, unit: 'kg', marketPriceId: 'mp-viande', supplierId: 'sup-metro', cost: 1.09 },
    { id: 'line-3', sourceId: 'cmp-sauce', name: 'Sauce burger 25/26 (Aux)', itemType: 'Component', numberOfUnits: 0.02, unit: 'kg', marketPriceId: null, supplierId: null, cost: 0.07 },
    { id: 'line-4', sourceId: 'pkg-serviette', name: 'Serviettes Papier', itemType: 'Packaging', numberOfUnits: 1, unit: 'pcs', marketPriceId: 'mp-serviette', supplierId: 'sup-aro', cost: 0.01 },
  ],
}

describe('normalizeRecipeFromBatch', () => {
  it("agrège par sourceId (entité), jamais par l'id de ligne de jointure", () => {
    const { lines } = normalizeRecipeFromBatch(batchBurger)
    expect(lines.map((l) => l.key)).toEqual(['ing-iceberg', 'ing-viande', 'cmp-sauce', 'pkg-serviette'])
    expect(lines.map((l) => l.key)).not.toContain('line-1')
  })

  it('préserve itemType, unit, marketPriceId, supplierId et numberOfPiecesRecipe', () => {
    const { numberOfPiecesRecipe, lines } = normalizeRecipeFromBatch(batchBurger)
    expect(numberOfPiecesRecipe).toBe(1)
    expect(lines[0]).toMatchObject({
      sourceId: 'ing-iceberg',
      name: 'Salade Iceberg',
      unit: 'kg',
      numberOfUnits: 0.04,
      marketPriceId: 'mp-iceberg',
      supplierId: 'sup-metro',
      itemType: 'Ingredient',
    })
    expect(lines[2].itemType).toBe('Component')
    expect(lines[3].itemType).toBe('Packaging')
  })

  it('écarte une ligne à quantité nulle ou négative (parité normalizeRecipe)', () => {
    const { lines } = normalizeRecipeFromBatch({
      numberOfPiecesRecipe: 1,
      components: [
        { id: 'l1', sourceId: 'a', name: 'Zéro', itemType: 'Ingredient', numberOfUnits: 0, unit: 'kg' },
        { id: 'l2', sourceId: 'b', name: 'Négatif', itemType: 'Ingredient', numberOfUnits: -1, unit: 'kg' },
        { id: 'l3', sourceId: 'c', name: 'Valide', itemType: 'Ingredient', numberOfUnits: 2, unit: 'kg' },
      ],
    })
    expect(lines.map((l) => l.name)).toEqual(['Valide'])
  })

  it('tolère dto null / sans components / numberOfPiecesRecipe absent', () => {
    expect(normalizeRecipeFromBatch(null)).toEqual({ numberOfPiecesRecipe: 1, lines: [] })
    expect(normalizeRecipeFromBatch({})).toEqual({ numberOfPiecesRecipe: 1, lines: [] })
    expect(normalizeRecipeFromBatch({ components: [null, 'zut'] })).toEqual({ numberOfPiecesRecipe: 1, lines: [] })
  })

  it('dérive costPerRecipeUnit = cost / numberOfUnits (parité de shape, non consommé)', () => {
    const { lines } = normalizeRecipeFromBatch(batchBurger)
    expect(lines[1].costPerRecipeUnit).toBeCloseTo(1.09 / 0.12, 6)
  })

  it('deux plats partageant un ingrédient produisent UNE ligne d’achat agrégée', () => {
    const batchFrites = {
      id: 'mi-frites',
      numberOfPiecesRecipe: 1,
      components: [
        // Même sourceId que le burger, autre ligne de jointure.
        { id: 'line-9', sourceId: 'ing-viande', name: 'Viande Hachée', itemType: 'Ingredient', numberOfUnits: 0.05, unit: 'kg', marketPriceId: 'mp-viande', supplierId: 'sup-metro', cost: 0.45 },
      ],
    }
    const groups = buildIngredientRequirements({
      demand: [
        { shopName: '1 A', menuItemId: 'mi-burger', menuItemName: 'Burger', quantity: 10 },
        { shopName: '1 A', menuItemId: 'mi-frites', menuItemName: 'Frites', quantity: 10 },
      ],
      recipeByMenuItemId: {
        'mi-burger': normalizeRecipeFromBatch(batchBurger),
        'mi-frites': normalizeRecipeFromBatch(batchFrites),
      },
    })
    const viandes = groups.flatMap((g) => g.items).filter((i) => i.itemName === 'Viande Hachée')
    expect(viandes).toHaveLength(1)
    expect(viandes[0].quantity).toBeCloseTo(10 * 0.12 + 10 * 0.05, 6)
  })

  it('parité détail ↔ batch : même recette, mêmes groupes', () => {
    const detail = {
      numberOfPiecesRecipe: 1,
      ingredients: [
        { ingredientId: 'ing-iceberg', numberOfUnits: 0.04, ingredient: { name: 'Salade Iceberg', recipeUnit: 'kg', marketPriceId: 'mp-iceberg', marketPrice: { supplierId: 'sup-metro' } } },
        { ingredientId: 'ing-viande', numberOfUnits: 0.12, ingredient: { name: 'Viande Hachée', recipeUnit: 'kg', marketPriceId: 'mp-viande', marketPrice: { supplierId: 'sup-metro' } } },
      ],
      components: [
        { componentId: 'cmp-sauce', numberOfUnits: 0.02, component: { name: 'Sauce burger 25/26 (Aux)', unit: 'kg' } },
      ],
      packagings: [
        { packagingId: 'pkg-serviette', numberOfUnits: 1, packaging: { name: 'Serviettes Papier', unit: 'pcs', marketPriceId: 'mp-serviette', marketPrice: { supplierId: 'sup-aro' } } },
      ],
    }
    const demand = [{ shopName: '1 A', menuItemId: 'mi-burger', menuItemName: 'Burger', quantity: 100 }]
    const resolveSupplier = (line) => ({
      supplierId: line.supplierId || '__unknown_supplier__',
      supplierName: line.supplierId || '',
    })
    const run = (recipe) =>
      buildIngredientRequirements({ demand, recipeByMenuItemId: { 'mi-burger': recipe }, resolveSupplier })
        .map((g) => ({
          supplierId: g.supplierId,
          items: g.items.map((i) => ({ key: i.key, name: i.itemName, qty: i.quantity, unit: i.unit, marketPriceId: i.marketPriceId })),
        }))

    expect(run(normalizeRecipeFromBatch(batchBurger))).toEqual(run(normalizeRecipe(detail)))
  })
})
