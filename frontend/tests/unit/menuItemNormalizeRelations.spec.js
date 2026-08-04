/**
 * BUG-291-01 — `buildComponents` chaînait les trois relations en ALTERNATIVES
 * (`if (!comps.length)`) au lieu d'en faire l'union : dès qu'un article portait un
 * seul composant, ses ingrédients ET son packaging étaient jetés.
 *
 * Cas réel (relevé 2026-08-04, « Burger 25/26 (Aux) ») : `/menu-items?spaceId=…`
 * renvoie components:2 + ingredients:4 + packagings:1 — 2 lignes sur 7 seulement
 * atteignaient l'écran.
 */
import { normalizeMenuItem, normalizeComponent } from '@/utils/menuItemNormalize'

// Payload calqué sur la shape RÉELLE du endpoint liste : chaque relation niche son
// entité (`ingredient` / `component` / `packaging`) et ne porte PAS d'`itemType`.
const burgerFromListEndpoint = {
  id: 'cms87onoz00k11d79i9xk1ecx',
  name: 'Burger 25/26 (Aux)',
  readyForSale: 'No',
  comboItem: 'Yes',
  numberOfPiecesRecipe: 1,
  ingredients: [
    { id: 'r1', ingredientId: 'i-salade', numberOfUnits: 0.04, unitCost: 1.2,
      ingredient: { id: 'i-salade', name: 'Salade Iceberg', recipeUnit: 'Kg' } },
    { id: 'r2', ingredientId: 'i-viande', numberOfUnits: 0.12, unitCost: 9.08,
      ingredient: { id: 'i-viande', name: 'Viande Hachée -  Vrac', recipeUnit: 'Kg' } },
    { id: 'r3', ingredientId: 'i-bun', numberOfUnits: 1, unitCost: 0.55,
      ingredient: { id: 'i-bun', name: 'Bun - Burger', recipeUnit: 'Pc' } },
    { id: 'r4', ingredientId: 'i-cheddar', numberOfUnits: 1, unitCost: 0.1746,
      ingredient: { id: 'i-cheddar', name: 'Cheddar Tranche', recipeUnit: 'Pc' } },
  ],
  components: [
    { id: 'r5', componentId: 'c-sauce', numberOfUnits: 0.02, unitCost: 3.71,
      component: { id: 'c-sauce', name: 'Sauce burger 25/26 (Aux)', recipeUnit: 'kg' } },
    { id: 'r6', componentId: 'c-pickles', numberOfUnits: 0.01, unitCost: 2.04,
      component: { id: 'c-pickles', name: 'Pickles 25/26 (Aux)', recipeUnit: 'kg' } },
  ],
  packagings: [
    { id: 'r7', packagingId: 'p-serviette', numberOfUnits: 1, unitCost: 0.0054,
      packaging: { id: 'p-serviette', name: 'Serviettes Papier', unit: 'Pc' } },
  ],
}

describe('normalizeMenuItem — BUG-291-01 (union des 3 relations)', () => {
  it('conserve les 7 lignes : ingrédients + composants + packaging', () => {
    const mi = normalizeMenuItem(burgerFromListEndpoint)

    // Avant le fix : 2 (les composants seuls), sans nom.
    expect(mi.components).toHaveLength(7)
    expect(mi.components.map((c) => c.name).sort()).toEqual([
      'Bun - Burger',
      'Cheddar Tranche',
      'Pickles 25/26 (Aux)',
      'Salade Iceberg',
      'Sauce burger 25/26 (Aux)',
      'Serviettes Papier',
      'Viande Hachée -  Vrac',
    ])
  })

  it('résout le nom et l\'unité depuis l\'entité nichée de CHAQUE relation', () => {
    const mi = normalizeMenuItem(burgerFromListEndpoint)
    const byName = Object.fromEntries(mi.components.map((c) => [c.name, c]))

    expect(byName['Salade Iceberg'].unit).toBe('Kg')
    // L'unité d'un composant vient de `component.recipeUnit` — sans ce repli la
    // sauce ressortait en 'unit' générique.
    expect(byName['Sauce burger 25/26 (Aux)'].unit).toBe('kg')
    expect(byName['Serviettes Papier'].unit).toBe('Pc')
    expect(mi.components.every((c) => c.name)).toBe(true)
  })

  it('pose `itemType` d\'après la relation d\'origine (absent du payload liste)', () => {
    const mi = normalizeMenuItem(burgerFromListEndpoint)
    const typeOf = (n) => mi.components.find((c) => c.name === n).itemType

    // La règle « on n'éclate jamais un Component » en dépend.
    expect(typeOf('Salade Iceberg')).toBe('Ingredient')
    expect(typeOf('Sauce burger 25/26 (Aux)')).toBe('Component')
    expect(typeOf('Pickles 25/26 (Aux)')).toBe('Component')
    expect(typeOf('Serviettes Papier')).toBe('Packaging')
  })

  it('tague le packaging en `material` pour isPackagingComponent', () => {
    const mi = normalizeMenuItem(burgerFromListEndpoint)
    const serviette = mi.components.find((c) => c.name === 'Serviettes Papier')
    expect(serviette.storageType).toBe('material')
  })

  it('donne les bonnes quantités × 105 (cas mesuré sur le 6 A)', () => {
    const mi = normalizeMenuItem(burgerFromListEndpoint)
    const qty = (n) =>
      +(mi.components.find((c) => c.name === n).numberOfUnits * 105 / mi.numberOfPiecesRecipe)
        .toFixed(3)

    expect(qty('Salade Iceberg')).toBeCloseTo(4.2, 3)
    expect(qty('Viande Hachée -  Vrac')).toBeCloseTo(12.6, 3)
    expect(qty('Bun - Burger')).toBe(105)
    expect(qty('Serviettes Papier')).toBe(105)
    expect(qty('Sauce burger 25/26 (Aux)')).toBeCloseTo(2.1, 3)
    expect(qty('Pickles 25/26 (Aux)')).toBeCloseTo(1.05, 3)
  })

  it('n\'ajoute PAS componentsData quand des relations existent (anti double comptage)', () => {
    const mi = normalizeMenuItem({
      ...burgerFromListEndpoint,
      // Même contenu, forme dénormalisée : ne doit pas s'additionner aux relations.
      componentsData: [
        { name: 'Salade Iceberg', numberOfUnits: 0.04, unit: 'Kg' },
        { name: 'Bun - Burger', numberOfUnits: 1, unit: 'Pc' },
      ],
    })
    expect(mi.components).toHaveLength(7)
  })

  it('retombe sur componentsData quand aucune relation n\'est présente', () => {
    const mi = normalizeMenuItem({
      id: 'mi-x', name: 'Article legacy', readyForSale: 'No', numberOfPiecesRecipe: 1,
      componentsData: [{ name: 'Gobelet 50cl', numberOfUnits: 1, unit: 'Pc' }],
    })
    expect(mi.components).toHaveLength(1)
    expect(mi.components[0].name).toBe('Gobelet 50cl')
  })

  it('reste idempotent : un article déjà normalisé ne perd pas ses lignes', () => {
    const once = normalizeMenuItem(burgerFromListEndpoint)
    const twice = normalizeMenuItem(once)
    expect(twice.components).toHaveLength(7)
    expect(twice.components.map((c) => c.name).sort()).toEqual(
      once.components.map((c) => c.name).sort(),
    )
  })

  it('un article sans aucune recette reste sans composants', () => {
    const cookie = normalizeMenuItem({ id: 'mi-cookie', name: 'Cookie', readyForSale: 'Yes' })
    expect(cookie.components).toEqual([])
  })
})

describe('normalizeComponent — unité des entités nichées', () => {
  it('préfère l\'unité portée par la ligne à celle de l\'entité', () => {
    const c = normalizeComponent({
      componentId: 'c1', numberOfUnits: 2, unit: 'L',
      component: { id: 'c1', name: 'Sirop', recipeUnit: 'kg' },
    })
    expect(c.unit).toBe('L')
    expect(c.name).toBe('Sirop')
  })

  it('retombe sur \'unit\' quand rien n\'est résolvable', () => {
    expect(normalizeComponent({ numberOfUnits: 1 }).unit).toBe('unit')
  })
})
