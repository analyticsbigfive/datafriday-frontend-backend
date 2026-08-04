/**
 * BUG-292-01 — la feuille de course est le SEUL écran qui éclate un composant.
 *
 * Règle métier : on n'achète pas « de la sauce pickle » à un fournisseur, on
 * achète du vinaigre et de l'ail. Partout ailleurs (stock-up, inventaires,
 * réarmement) le composant est une ligne — il arrive prêt de la cuisine centrale.
 *
 * `bomPlanning.js` n'avait AUCUN test avant ce lot, alors qu'il porte le mode par
 * défaut de la feuille de course.
 */
import { buildIngredientRequirements, normalizeRecipe } from '@/utils/bomPlanning'
import {
  buildSubComponentsFromDetail,
  mergeSubComponentsFromCatalog,
  indexComponentCatalog,
} from '@/utils/componentCatalog'

// ── Catalogue ComponentDefinition, recettes hydratées ────────────────────────
// Sauce burger : rendement 5 L. Pickles : rendement 2 kg.
const catalogue = [
  {
    id: 'cmp-sauce',
    name: 'Sauce burger 25/26 (Aux)',
    numberOfUnitsRecipe: 5,
    subComponents: [
      { itemType: 'Ingredient', id: 'mp-mayo', marketPriceId: 'mp-mayo', name: 'Mayonnaise', unit: 'L', numberOfUnits: 3 },
      { itemType: 'Ingredient', id: 'mp-ketchup', marketPriceId: 'mp-ketchup', name: 'Ketchup', unit: 'L', numberOfUnits: 1.5 },
      { itemType: 'Ingredient', id: 'mp-epices', marketPriceId: 'mp-epices', name: 'Épices', unit: 'kg', numberOfUnits: 0.5 },
    ],
  },
  {
    id: 'cmp-pickles',
    name: 'Pickles 25/26 (Aux)',
    numberOfUnitsRecipe: 2,
    subComponents: [
      { itemType: 'Ingredient', id: 'mp-cornichons', marketPriceId: 'mp-cornichons', name: 'Cornichons', unit: 'kg', numberOfUnits: 1.8 },
      { itemType: 'Ingredient', id: 'mp-vinaigre', marketPriceId: 'mp-vinaigre', name: 'Vinaigre', unit: 'L', numberOfUnits: 0.5 },
      { itemType: 'Ingredient', id: 'mp-ail', marketPriceId: 'mp-ail', name: 'Ail', unit: 'kg', numberOfUnits: 0.05 },
    ],
  },
]

// Recette du Burger, déjà normalisée (7 lignes), pour 100 ventes.
const recipeBurger = {
  numberOfPiecesRecipe: 1,
  lines: [
    { key: 'ing-iceberg', sourceId: 'ing-iceberg', name: 'Salade Iceberg', unit: 'kg', numberOfUnits: 0.02, itemType: 'Ingredient' },
    { key: 'ing-viande', sourceId: 'ing-viande', name: 'Viande Hachée', unit: 'kg', numberOfUnits: 0.15, itemType: 'Ingredient' },
    { key: 'ing-bun', sourceId: 'ing-bun', name: 'Bun - Burger', unit: 'pcs', numberOfUnits: 1, itemType: 'Ingredient' },
    { key: 'ing-cheddar', sourceId: 'ing-cheddar', name: 'Cheddar Tranche', unit: 'kg', numberOfUnits: 0.02, itemType: 'Ingredient' },
    { key: 'cmp-pickles', sourceId: 'cmp-pickles', name: 'Pickles 25/26 (Aux)', unit: 'kg', numberOfUnits: 0.01, itemType: 'Component' },
    { key: 'cmp-sauce', sourceId: 'cmp-sauce', name: 'Sauce burger 25/26 (Aux)', unit: 'L', numberOfUnits: 0.03, itemType: 'Component' },
    { key: 'pkg-serviette', sourceId: 'pkg-serviette', name: 'Serviettes Papier', unit: 'pcs', numberOfUnits: 1, itemType: 'Packaging' },
  ],
}

const demand = [{ shopId: '1a', shopName: '1 A', menuItemId: 'mi-burger', menuItemName: 'Burger 25/26 (Aux)', quantity: 100 }]

/** Aplati les groupes fournisseur en { nom → quantité }. */
function flat(groups) {
  return groups
    .flatMap((g) => g.items)
    .reduce((acc, it) => ({ ...acc, [it.itemName]: it.quantity }), {})
}

describe('BUG-292-01 — éclatement composant → ingrédients', () => {
  it('remplace les 2 composants du Burger par leurs ingrédients, aux quantités du brief', () => {
    const groups = buildIngredientRequirements({
      demand,
      recipeByMenuItemId: { 'mi-burger': recipeBurger },
      components: catalogue,
    })
    const q = flat(groups)

    // Les 5 lignes directes passent telles quelles.
    expect(q['Salade Iceberg']).toBeCloseTo(2, 6)
    expect(q['Viande Hachée']).toBeCloseTo(15, 6)
    expect(q['Bun - Burger']).toBeCloseTo(100, 6)
    expect(q['Cheddar Tranche']).toBeCloseTo(2, 6)
    expect(q['Serviettes Papier']).toBeCloseTo(100, 6)

    // Sauce : 3 L de besoin, rendement 5 L → facteur 0,6 / 0,3 / 0,1.
    expect(q['Mayonnaise']).toBeCloseTo(1.8, 6)
    expect(q['Ketchup']).toBeCloseTo(0.9, 6)
    expect(q['Épices']).toBeCloseTo(0.3, 6)

    // Pickles : 1 kg de besoin, rendement 2 kg.
    expect(q['Cornichons']).toBeCloseTo(0.9, 6)
    expect(q['Vinaigre']).toBeCloseTo(0.25, 6)
    expect(q['Ail']).toBeCloseTo(0.025, 6)
  })

  it("n'achète JAMAIS un composant : aucune ligne « sauce » ni « pickles »", () => {
    const groups = buildIngredientRequirements({
      demand,
      recipeByMenuItemId: { 'mi-burger': recipeBurger },
      components: catalogue,
    })
    const noms = Object.keys(flat(groups))
    expect(noms).not.toContain('Sauce burger 25/26 (Aux)')
    expect(noms).not.toContain('Pickles 25/26 (Aux)')
    expect(noms).toHaveLength(11) // 5 directes + 3 + 3
  })

  it('sans catalogue, le composant reste une ligne — comportement historique préservé', () => {
    const groups = buildIngredientRequirements({
      demand,
      recipeByMenuItemId: { 'mi-burger': recipeBurger },
    })
    const q = flat(groups)
    expect(q['Sauce burger 25/26 (Aux)']).toBeCloseTo(3, 6)
    expect(q['Mayonnaise']).toBeUndefined()
  })

  it("une def sans recette n'escamote pas la ligne : le composant reste visible", () => {
    const vide = [{ id: 'cmp-sauce', name: 'Sauce burger 25/26 (Aux)', subComponents: [] }]
    const q = flat(
      buildIngredientRequirements({
        demand,
        recipeByMenuItemId: { 'mi-burger': recipeBurger },
        components: vide,
      }),
    )
    expect(q['Sauce burger 25/26 (Aux)']).toBeCloseTo(3, 6)
  })

  it('agrège un ingrédient partagé par deux composants en une seule ligne', () => {
    // Le vinaigre sert aux pickles ET à une 2e sauce → un seul achat.
    const avecVinaigre = [
      ...catalogue,
      {
        id: 'cmp-vinaigrette', name: 'Vinaigrette', numberOfUnitsRecipe: 1,
        subComponents: [{ itemType: 'Ingredient', id: 'mp-vinaigre', marketPriceId: 'mp-vinaigre', name: 'Vinaigre', unit: 'L', numberOfUnits: 1 }],
      },
    ]
    const recette = {
      numberOfPiecesRecipe: 1,
      lines: [
        ...recipeBurger.lines,
        { key: 'cmp-vinaigrette', sourceId: 'cmp-vinaigrette', name: 'Vinaigrette', unit: 'L', numberOfUnits: 0.1, itemType: 'Component' },
      ],
    }
    const q = flat(
      buildIngredientRequirements({
        demand,
        recipeByMenuItemId: { 'mi-burger': recette },
        components: avecVinaigre,
      }),
    )
    // 0,25 L (pickles) + 10 L (vinaigrette) sur la MÊME clé mp-vinaigre|||L.
    expect(q['Vinaigre']).toBeCloseTo(10.25, 6)
  })

  it('éclate un composant de composant (récursion de flattenComponentDef)', () => {
    const imbrique = [
      {
        id: 'cmp-parent', name: 'Parent', numberOfUnitsRecipe: 1,
        subComponents: [{ itemType: 'Component', id: 'cmp-enfant', sourceId: 'cmp-enfant', name: 'Enfant', unit: 'kg', numberOfUnits: 2 }],
      },
      {
        id: 'cmp-enfant', name: 'Enfant', numberOfUnitsRecipe: 1,
        subComponents: [{ itemType: 'Ingredient', id: 'mp-sel', marketPriceId: 'mp-sel', name: 'Sel', unit: 'kg', numberOfUnits: 3 }],
      },
    ]
    const recette = {
      numberOfPiecesRecipe: 1,
      lines: [{ key: 'cmp-parent', sourceId: 'cmp-parent', name: 'Parent', unit: 'kg', numberOfUnits: 1, itemType: 'Component' }],
    }
    const q = flat(
      buildIngredientRequirements({
        demand: [{ shopName: '1 A', menuItemId: 'm', menuItemName: 'M', quantity: 1 }],
        recipeByMenuItemId: { m: recette },
        components: imbrique,
      }),
    )
    expect(q['Sel']).toBeCloseTo(6, 6)
    expect(q['Enfant']).toBeUndefined()
    expect(q['Parent']).toBeUndefined()
  })

  it('groupe par fournisseur et remonte le marketPriceId des feuilles', () => {
    const groups = buildIngredientRequirements({
      demand,
      recipeByMenuItemId: { 'mi-burger': recipeBurger },
      components: catalogue,
      resolveSupplier: (line) =>
        line.marketPriceId === 'mp-mayo'
          ? { supplierId: 'sup-1', supplierName: 'Metro' }
          : { supplierId: '__unknown_supplier__', supplierName: '' },
    })
    const metro = groups.find((g) => g.supplierId === 'sup-1')
    expect(metro).toBeDefined()
    expect(metro.items.map((i) => i.itemName)).toEqual(['Mayonnaise'])
    expect(metro.items[0].marketPriceId).toBe('mp-mayo')
  })

  it('conserve « utilisé dans » = le PLAT vendu, pas le composant intermédiaire', () => {
    const groups = buildIngredientRequirements({
      demand,
      recipeByMenuItemId: { 'mi-burger': recipeBurger },
      components: catalogue,
    })
    const mayo = groups.flatMap((g) => g.items).find((i) => i.itemName === 'Mayonnaise')
    expect(mayo.usedIn).toEqual(['Burger 25/26 (Aux)'])
    expect(mayo.shopNames).toEqual(['1 A'])
  })

  it('la récursion combo (refMenuItemId) reste intacte', () => {
    const recettes = {
      'mi-menu': {
        numberOfPiecesRecipe: 1,
        lines: [{ key: 'k', name: 'Burger', unit: 'pcs', numberOfUnits: 1, refMenuItemId: 'mi-burger' }],
      },
      'mi-burger': recipeBurger,
    }
    const q = flat(
      buildIngredientRequirements({
        demand: [{ shopName: '1 A', menuItemId: 'mi-menu', menuItemName: 'Menu', quantity: 100 }],
        recipeByMenuItemId: recettes,
        components: catalogue,
      }),
    )
    expect(q['Bun - Burger']).toBeCloseTo(100, 6)
    expect(q['Mayonnaise']).toBeCloseTo(1.8, 6)
  })
})

describe('normalizeRecipe', () => {
  it('aplatit les 3 relations nichées et pose itemType', () => {
    const { numberOfPiecesRecipe, lines } = normalizeRecipe({
      numberOfPiecesRecipe: 2,
      ingredients: [{ ingredientId: 'i1', numberOfUnits: 4, ingredient: { name: 'Farine', recipeUnit: 'kg' } }],
      components: [{ componentId: 'c1', numberOfUnits: 1, component: { name: 'Sauce', unit: 'L' } }],
      packagings: [{ packagingId: 'p1', numberOfUnits: 1, packaging: { name: 'Boîte', unit: 'pcs' } }],
    })
    expect(numberOfPiecesRecipe).toBe(2)
    expect(lines.map((l) => [l.name, l.itemType, l.unit])).toEqual([
      ['Farine', 'Ingredient', 'kg'],
      ['Sauce', 'Component', 'L'],
      ['Boîte', 'Packaging', 'pcs'],
    ])
  })

  it('écarte une ligne à quantité nulle (elle n’entre pas dans le besoin)', () => {
    const { lines } = normalizeRecipe({
      ingredients: [{ ingredientId: 'i1', numberOfUnits: 0, ingredient: { name: 'Rien' } }],
    })
    expect(lines).toEqual([])
  })
})

describe('componentCatalog', () => {
  it('buildSubComponentsFromDetail fusionne ingredients[] et children[]', () => {
    const subs = buildSubComponentsFromDetail(
      {
        numberOfUnitsRecipe: 5,
        ingredients: [{ ingredientId: 'mp-mayo', quantity: 3, unit: 'L' }],
        children: [{ componentId: 'cmp-x', itemName: 'Base', numberOfUnits: 1, unit: 'kg' }],
      },
      new Map([['mp-mayo', { id: 'mp-mayo', name: 'Mayonnaise', unit: 'L' }]]),
    )
    expect(subs).toEqual([
      { itemType: 'Ingredient', id: 'mp-mayo', marketPriceId: 'mp-mayo', name: 'Mayonnaise', numberOfUnits: 3, unit: 'L' },
      { itemType: 'Component', id: 'cmp-x', sourceId: 'cmp-x', name: 'Base', numberOfUnits: 1, unit: 'kg' },
    ])
  })

  it('buildSubComponentsFromDetail écarte les lignes sans nom résolvable', () => {
    const subs = buildSubComponentsFromDetail({ ingredients: [{ ingredientId: 'inconnu', quantity: 1 }] }, new Map())
    expect(subs).toEqual([])
  })

  it('mergeSubComponentsFromCatalog complète par id puis par nom, sans écraser', () => {
    const base = [
      { id: 'a', name: 'A' },
      { id: 'zzz', name: 'Sauce burger 25/26 (Aux)' }, // id différent, nom identique
      { id: 'c', name: 'C', subComponents: [{ name: 'déjà là' }], numberOfUnitsRecipe: 9 },
    ]
    const out = mergeSubComponentsFromCatalog(base, catalogue)
    expect(out[0].subComponents).toBeUndefined()
    expect(out[1].subComponents).toHaveLength(3) // résolu par NOM
    expect(out[1].numberOfUnitsRecipe).toBe(5)
    expect(out[2].subComponents).toEqual([{ name: 'déjà là' }]) // non écrasé
    expect(out[2].numberOfUnitsRecipe).toBe(9)
  })

  it('indexComponentCatalog garde la 1re occurrence sur chaque clé', () => {
    const idx = indexComponentCatalog([{ id: 'x', name: 'Dup' }, { id: 'y', name: 'Dup' }])
    expect(idx.get('nm:dup').id).toBe('x')
    expect(idx.get('id:y').id).toBe('y')
  })
})
