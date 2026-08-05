/**
 * BUG-292-01 — Règle unique de décomposition (stock-up / inventaire / réarmement).
 *
 * Le cas de référence est le Burger du brief : readyForSale='No', 7 lignes de
 * recette dont DEUX composants préparés en cuisine centrale (sauce, pickles). La
 * règle métier tient en une phrase : on découpe d'un seul cran, jamais deux — la
 * sauce arrive prête, on ne va pas chercher son ail. Seul un combo (un panier)
 * justifie de redescendre, et c'est la nature du PARENT qui décide, pas le
 * readyForSale de l'enfant (décision Bertrand 2026-08-04, Question #18).
 */
import { expandMenuItem, buildComponentLookup } from '@/utils/menuItemExpansion'

/** Monte les deux index attendus par expandMenuItem depuis un catalogue à plat. */
function ctx(menuItems) {
  return {
    menuItemsById: new Map(menuItems.map((mi) => [mi.id, mi])),
    lookup: buildComponentLookup(menuItems),
  }
}

/** Raccourci : { name → totalQuantity }, pour comparer une liste d'un coup d'œil. */
function byName(rows) {
  return rows.reduce((acc, r) => ({ ...acc, [r.name]: r.totalQuantity }), {})
}

// ── Le Burger du brief ───────────────────────────────────────────────────────
// numberOfPiecesRecipe = 1 → les quantités sont recette × nombre de ventes.
const burger = {
  id: 'mi-burger',
  name: 'Burger 25/26 (Aux)',
  readyForSale: 'No',
  comboItem: 'No',
  numberOfPiecesRecipe: 1,
  components: [
    { id: 'l-1', sourceId: 'ing-iceberg', itemType: 'Ingredient', name: 'Salade Iceberg', unit: 'kg', numberOfUnits: 0.02 },
    { id: 'l-2', sourceId: 'ing-viande', itemType: 'Ingredient', name: 'Viande Hachée', unit: 'kg', numberOfUnits: 0.15 },
    { id: 'l-3', sourceId: 'ing-bun', itemType: 'Ingredient', name: 'Bun - Burger', unit: 'pcs', numberOfUnits: 1 },
    { id: 'l-4', sourceId: 'ing-cheddar', itemType: 'Ingredient', name: 'Cheddar Tranche', unit: 'kg', numberOfUnits: 0.02 },
    { id: 'l-5', sourceId: 'cmp-pickles', itemType: 'Component', name: 'Pickles 25/26 (Aux)', unit: 'kg', numberOfUnits: 0.01 },
    { id: 'l-6', sourceId: 'cmp-sauce', itemType: 'Component', name: 'Sauce burger 25/26 (Aux)', unit: 'L', numberOfUnits: 0.03 },
    { id: 'l-7', sourceId: 'pkg-serviette', itemType: 'Packaging', name: 'Serviettes Papier', unit: 'pcs', numberOfUnits: 1 },
  ],
}

// La sauce existe AUSSI comme menu item composé (cuisine centrale). C'est le piège
// de BUG-290-01 : l'ancienne règle redescendait dedans à cause de son readyForSale.
const sauceAsMenuItem = {
  id: 'cmp-sauce',
  name: 'Sauce burger 25/26 (Aux)',
  readyForSale: 'No',
  comboItem: 'No',
  numberOfPiecesRecipe: 1,
  components: [
    { id: 's-1', sourceId: 'ing-mayo', itemType: 'Ingredient', name: 'Mayonnaise', unit: 'L', numberOfUnits: 0.6 },
    { id: 's-2', sourceId: 'ing-ail', itemType: 'Ingredient', name: 'Ail', unit: 'kg', numberOfUnits: 0.01 },
  ],
}

const coca = {
  id: 'mi-coca',
  name: 'Coca 33cl',
  readyForSale: 'Yes',
  comboItem: 'No',
  components: [
    { id: 'c-1', sourceId: 'pkg-cup', itemType: 'Packaging', name: 'Cup 50CL', unit: 'pcs', numberOfUnits: 1 },
  ],
}

describe('BUG-292-01 — règle 2 : readyForSale=Yes', () => {
  it("émet l'article lui-même en pcs, sans séparer son packaging", () => {
    const rows = expandMenuItem({
      menuItemId: 'mi-coca',
      quantity: 40,
      rootMenuItemName: 'Coca 33cl',
      ...ctx([coca]),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'mi-coca', name: 'Coca 33cl', totalQuantity: 40, unit: 'pcs' })
    // Le gobelet n'est PAS une ligne : l'article arrive emballé au PDV.
    expect(byName(rows)['Cup 50CL']).toBeUndefined()
  })
})

describe('BUG-292-01 — règle 3 : readyForSale=No, un seul cran', () => {
  it('émet les 7 lignes du Burger avec les quantités du brief (100 ventes)', () => {
    const rows = expandMenuItem({
      menuItemId: 'mi-burger',
      quantity: 100,
      rootMenuItemName: 'Burger 25/26 (Aux)',
      ...ctx([burger]),
    })
    expect(rows).toHaveLength(7)
    expect(byName(rows)).toEqual({
      'Salade Iceberg': 2,
      'Viande Hachée': 15,
      'Bun - Burger': 100,
      'Cheddar Tranche': 2,
      'Pickles 25/26 (Aux)': 1,
      'Sauce burger 25/26 (Aux)': 3,
      'Serviettes Papier': 100,
    })
  })

  it("ne redescend PAS dans un composant qui résout vers un menu item readyForSale='No'", () => {
    // Le catalogue contient la sauce EN TANT QUE menu item composé : l'ancienne
    // règle (`enfant.readyForSale === 'No'`) la dissolvait en mayonnaise + ail.
    const rows = expandMenuItem({
      menuItemId: 'mi-burger',
      quantity: 100,
      rootMenuItemName: 'Burger 25/26 (Aux)',
      ...ctx([burger, sauceAsMenuItem]),
    })
    expect(rows).toHaveLength(7)
    expect(byName(rows)['Sauce burger 25/26 (Aux)']).toBe(3)
    expect(byName(rows)['Mayonnaise']).toBeUndefined()
    expect(byName(rows)['Ail']).toBeUndefined()
  })

  it('divise par numberOfPiecesRecipe (recette qui rend plusieurs pièces)', () => {
    const parBatch = { ...burger, id: 'mi-batch', numberOfPiecesRecipe: 4 }
    const rows = expandMenuItem({
      menuItemId: 'mi-batch',
      quantity: 100,
      rootMenuItemName: 'Batch',
      ...ctx([parBatch]),
    })
    expect(byName(rows)['Bun - Burger']).toBe(25)
  })
})

describe('BUG-292-01 — règle 1 : le combo est un panier qu’on ouvre', () => {
  const menuSimple = {
    id: 'mi-menu',
    name: 'Menu Burger',
    readyForSale: 'Yes', // ← un combo s’ouvre MÊME marqué prêt à vendre
    comboItem: 'Yes',
    numberOfPiecesRecipe: 1,
    components: [
      { id: 'm-1', sourceId: 'mi-burger', itemType: 'Component', name: 'Burger 25/26 (Aux)', unit: 'pcs', numberOfUnits: 1 },
      { id: 'm-2', sourceId: 'mi-coca', itemType: 'Component', name: 'Coca 33cl', unit: 'pcs', numberOfUnits: 1 },
    ],
  }

  it('ouvre le panier et retraite chaque constituant selon son propre readyForSale', () => {
    const rows = expandMenuItem({
      menuItemId: 'mi-menu',
      quantity: 10,
      rootMenuItemName: 'Menu Burger',
      ...ctx([menuSimple, burger, coca]),
    })
    // Burger (No) → ses 7 lignes ; Coca (Yes) → 1 ligne. Jamais « Menu Burger ».
    expect(rows).toHaveLength(8)
    expect(byName(rows)['Coca 33cl']).toBe(10)
    expect(byName(rows)['Bun - Burger']).toBe(10)
    expect(byName(rows)['Menu Burger']).toBeUndefined()
  })

  it("n'ouvre qu'un cran de plus : la sauce du burger reste entière dans le combo", () => {
    const rows = expandMenuItem({
      menuItemId: 'mi-menu',
      quantity: 10,
      rootMenuItemName: 'Menu Burger',
      ...ctx([menuSimple, burger, coca, sauceAsMenuItem]),
    })
    expect(byName(rows)['Sauce burger 25/26 (Aux)']).toBe(0.3)
    expect(byName(rows)['Mayonnaise']).toBeUndefined()
  })

  it('conserve le PLAT racine dans sources[] à travers la récursion', () => {
    const rows = expandMenuItem({
      menuItemId: 'mi-menu',
      quantity: 10,
      rootMenuItemName: 'Menu Burger',
      ...ctx([menuSimple, burger, coca]),
    })
    for (const r of rows) {
      expect(r.sources[0].menuItemName).toBe('Menu Burger')
    }
  })

  it('ouvre aussi un combo imbriqué sous un parent non-combo', () => {
    const comboEnfant = { ...menuSimple, id: 'mi-combo-enfant', name: 'Combo Enfant' }
    const plat = {
      id: 'mi-plateau',
      name: 'Plateau',
      readyForSale: 'No',
      comboItem: 'No',
      numberOfPiecesRecipe: 1,
      components: [
        { id: 'p-1', sourceId: 'mi-combo-enfant', itemType: 'Component', name: 'Combo Enfant', unit: 'pcs', numberOfUnits: 1 },
      ],
    }
    const rows = expandMenuItem({
      menuItemId: 'mi-plateau',
      quantity: 5,
      rootMenuItemName: 'Plateau',
      ...ctx([plat, comboEnfant, burger, coca]),
    })
    expect(byName(rows)['Combo Enfant']).toBeUndefined()
    expect(byName(rows)['Coca 33cl']).toBe(5)
  })

  it('ne boucle pas sur un combo qui se référence lui-même', () => {
    const boucle = {
      id: 'mi-boucle',
      name: 'Boucle',
      readyForSale: 'No',
      comboItem: 'Yes',
      numberOfPiecesRecipe: 1,
      components: [
        { id: 'b-1', sourceId: 'mi-boucle', itemType: 'Component', name: 'Boucle', unit: 'pcs', numberOfUnits: 1 },
      ],
    }
    const rows = expandMenuItem({
      menuItemId: 'mi-boucle',
      quantity: 1,
      rootMenuItemName: 'Boucle',
      ...ctx([boucle]),
    })
    // MAX_DEPTH borne la descente : la sortie est finie, c'est tout ce qu'on exige.
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeLessThanOrEqual(1)
  })
})

describe('BUG-292-01 — règles 4 et 5 : « pas encore chargé » ≠ « rien à charger »', () => {
  it("règle 4 — un composé sans catalogue recette n'émet AUCUNE ligne (garde S4)", () => {
    const nu = { id: 'mi-nu', name: 'Burger', readyForSale: 'No', comboItem: 'No', components: [] }
    const rows = expandMenuItem({
      menuItemId: 'mi-nu',
      quantity: 100,
      rootMenuItemName: 'Burger',
      recipeCatalogLoaded: false,
      ...ctx([nu]),
    })
    // Surtout PAS une ligne « Burger » en pcs : cet article fini n'existe pas.
    expect(rows).toEqual([])
  })

  it("règle 5 — le même article, catalogue chargé, retombe sur lui-même (recette vide en base)", () => {
    const nu = { id: 'mi-nu', name: 'Burger', readyForSale: 'No', comboItem: 'No', components: [] }
    const rows = expandMenuItem({
      menuItemId: 'mi-nu',
      quantity: 100,
      rootMenuItemName: 'Burger',
      recipeCatalogLoaded: true,
      ...ctx([nu]),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'mi-nu', name: 'Burger', totalQuantity: 100, unit: 'pcs' })
  })

  it('la garde S4 ne concerne pas un readyForSale=Yes', () => {
    const rows = expandMenuItem({
      menuItemId: 'mi-coca',
      quantity: 40,
      rootMenuItemName: 'Coca 33cl',
      recipeCatalogLoaded: false,
      ...ctx([coca]),
    })
    expect(rows).toHaveLength(1)
  })

  it('recette entièrement anonyme → filet de sécurité, désactivable', () => {
    const anonyme = {
      id: 'mi-anon',
      name: 'Anonyme',
      readyForSale: 'No',
      comboItem: 'No',
      numberOfPiecesRecipe: 1,
      components: [{ id: 'a-1', numberOfUnits: 1, unit: 'kg' }], // ni name ni sourceId résolu
    }
    const base = { menuItemId: 'mi-anon', quantity: 10, rootMenuItemName: 'Anonyme', ...ctx([anonyme]) }
    expect(expandMenuItem({ ...base })).toMatchObject([{ id: 'mi-anon', totalQuantity: 10 }])
    expect(expandMenuItem({ ...base, fallbackWhenEmpty: false })).toEqual([])
  })

  it('un menu item absent du catalogue ne produit rien', () => {
    expect(
      expandMenuItem({ menuItemId: 'inconnu', quantity: 10, rootMenuItemName: 'x', ...ctx([burger]) }),
    ).toEqual([])
  })
})

describe('BUG-292-01 — identité de ligne (BUG-288-01, propagée)', () => {
  it('émet l’identité CATALOGUE, pas la PK de la ligne de recette', () => {
    const rows = expandMenuItem({
      menuItemId: 'mi-burger',
      quantity: 100,
      rootMenuItemName: 'Burger 25/26 (Aux)',
      ...ctx([burger]),
    })
    const bun = rows.find((r) => r.name === 'Bun - Burger')
    expect(bun.id).toBe('ing-bun') // sourceId, pas 'l-3'
  })

  it('priorise marketPriceId — matière achetée = vraie identité', () => {
    const avecMp = {
      ...burger,
      id: 'mi-mp',
      components: [
        { id: 'l-9', sourceId: 'ing-bun', marketPriceId: 'mp-bun', itemType: 'Ingredient', name: 'Bun - Burger', unit: 'pcs', numberOfUnits: 1 },
      ],
    }
    const rows = expandMenuItem({ menuItemId: 'mi-mp', quantity: 1, rootMenuItemName: 'x', ...ctx([avecMp]) })
    expect(rows[0].id).toBe('mp-bun')
  })

  it('un gobelet partagé par deux recettes porte la MÊME identité dans les deux', () => {
    // C'est la condition pour que l'agrégation aval le fusionne en une seule ligne
    // (un seul arrondi carton, une seule déduction du restant — BUG-288-01).
    const boissonA = { id: 'mi-a', name: 'A', readyForSale: 'No', comboItem: 'No', numberOfPiecesRecipe: 1,
      components: [{ id: 'ligne-a', sourceId: 'pkg-cup50', itemType: 'Packaging', name: 'Cup 50CL', unit: 'pcs', numberOfUnits: 1 }] }
    const boissonB = { id: 'mi-b', name: 'B', readyForSale: 'No', comboItem: 'No', numberOfPiecesRecipe: 1,
      components: [{ id: 'ligne-b', sourceId: 'pkg-cup50', itemType: 'Packaging', name: 'Cup 50CL', unit: 'pcs', numberOfUnits: 1 }] }
    const c = ctx([boissonA, boissonB])
    const a = expandMenuItem({ menuItemId: 'mi-a', quantity: 60, rootMenuItemName: 'A', ...c })
    const b = expandMenuItem({ menuItemId: 'mi-b', quantity: 305, rootMenuItemName: 'B', ...c })
    expect(a[0].id).toBe(b[0].id)
    expect(a[0].id).toBe('pkg-cup50')
  })

  it('reporte itemType et unitCost de la ligne de relation', () => {
    const rows = expandMenuItem({
      menuItemId: 'mi-burger',
      quantity: 100,
      rootMenuItemName: 'x',
      ...ctx([{ ...burger, components: [{ ...burger.components[4], unitCost: 2.04 }] }]),
    })
    expect(rows[0]).toMatchObject({ itemType: 'Component', unitCost: 2.04 })
    // Coût de la ligne = unitCost × totalQuantity, jamais × le nombre de plats.
    expect(rows[0].unitCost * rows[0].totalQuantity).toBeCloseTo(2.04, 5)
  })

  it("valorise l'article entier via resolveMenuItemUnitCost sur les branches article", () => {
    const rows = expandMenuItem({
      menuItemId: 'mi-coca',
      quantity: 40,
      rootMenuItemName: 'Coca 33cl',
      resolveMenuItemUnitCost: (mi) => (mi.id === 'mi-coca' ? 0.42 : 0),
      ...ctx([coca]),
    })
    expect(rows[0].unitCost).toBe(0.42)
  })
})

describe('buildComponentLookup', () => {
  it('résout par nom et par sourceId', () => {
    const l = buildComponentLookup([burger, coca])
    expect(l.byId.get('mi-coca')).toBe(coca)
    expect(l.byName.get('Coca 33cl').item).toBe(coca)
  })

  it('garde la 1re occurrence d’un nom dupliqué', () => {
    const a = { id: 'x1', name: 'Doublon' }
    const b = { id: 'x2', name: 'Doublon' }
    expect(buildComponentLookup([a, b]).byName.get('Doublon').item).toBe(a)
  })

  it("BUG-299-01 — le sourceId PRIME sur le nom quand les deux résolvent des items différents", () => {
    // Sémantique historique supprimée : « le premier élément du tableau qui matche
    // l'un OU l'autre » faisait gagner un homonyme par NOM contre l'article
    // réellement référencé par ID. Désormais l'ID gagne toujours.
    const parNom = { id: 'aaa', name: 'Ambigu', readyForSale: 'Yes', comboItem: 'No' }
    const parId = { id: 'bbb', name: 'Autre', readyForSale: 'Yes', comboItem: 'No' }
    const parent = {
      id: 'mi-p', name: 'P', readyForSale: 'No', comboItem: 'Yes', numberOfPiecesRecipe: 1,
      components: [{ id: 'l', name: 'Ambigu', sourceId: 'bbb', unit: 'pcs', numberOfUnits: 1 }],
    }
    const rows = expandMenuItem({
      menuItemId: 'mi-p', quantity: 1, rootMenuItemName: 'P', ...ctx([parent, parNom, parId]),
    })
    expect(rows[0].name).toBe('Autre')
    expect(rows[0].id).toBe('bbb')
  })
})
