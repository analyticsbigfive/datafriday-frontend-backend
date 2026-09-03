/**
 * BUG-188/BUG-002 (décision Bertrand 2026-07-24, Question #18) : un menu item
 * comboItem='Yes' doit TOUJOURS être explosé en ses menu items constitutifs,
 * indépendamment de son propre readyForSale — chaque constituant suit ensuite
 * les règles standard d'explosion (readyForSale / recette).
 *
 * `expandMenuItem` est une méthode Options API (pas d'export nommé) : on
 * l'invoque directement via `EventPredictStockUpSection.methods.expandMenuItem`
 * avec un `this` minimal (seul `this.expandMenuItem` est utilisé en interne,
 * pour la récursion) — pas besoin de monter le composant complet.
 */
import EventPredictStockUpSection from '@/components/space-workspace/event-predict/sections/EventPredictStockUpSection.vue'

const { expandMenuItem, miUnitCost } = EventPredictStockUpSection.methods
// `recipeCatalogLoaded` simule l'état APRÈS la vague 2b de useSpaceData (catalogues
// recette arrivés) — état nominal pour toutes les assertions d'expansion.
// `miUnitCost` est la VRAIE méthode (pas un stub) : l'expansion valorise chaque
// ligne, et on veut que ce chemin soit exercé (BUG-291-01).
const ctx = { expandMenuItem, miUnitCost, menuItemCostMap: {}, recipeCatalogLoaded: true }

const buildLookup = (menuItems) => {
  const byName = new Map()
  const idxById = new Map()
  menuItems.forEach((mi, idx) => {
    idxById.set(mi.id, idx)
    if (mi.name != null && !byName.has(mi.name)) byName.set(mi.name, { item: mi, idx })
  })
  return { byName, idxById }
}

describe('EventPredictStockUpSection.expandMenuItem — BUG-188/BUG-002 (comboItem always explodes)', () => {
  it('explodes a comboItem=Yes/readyForSale=Yes menu item into its constituents instead of counting it as 1 pcs', () => {
    const combo = {
      id: 'mi-combo', name: 'Menu Burger', comboItem: 'Yes', readyForSale: 'Yes',
      numberOfPiecesRecipe: 1,
      components: [
        { name: 'Bun', id: 'ing-bun', numberOfUnits: 1, unit: 'pc' },
        { name: 'Frites', id: 'ing-fries', numberOfUnits: 1, unit: 'kg' },
      ],
    }
    const menuItemsById = new Map([[combo.id, combo]])
    const componentLookup = buildLookup([combo])

    const result = expandMenuItem.call(ctx, 'mi-combo', 2, 'Menu Burger', 0, menuItemsById, componentLookup)

    expect(result.map((r) => r.name).sort()).toEqual(['Bun', 'Frites'])
    expect(result.every((r) => r.name !== 'Menu Burger')).toBe(true)
    const bun = result.find((r) => r.name === 'Bun')
    expect(bun.totalQuantity).toBe(2) // 1 unit * qty 2 / 1 piece
  })

  it('recurses into a nested constituent that is itself comboItem=Yes/readyForSale=Yes', () => {
    const innerCombo = {
      id: 'mi-inner', name: 'Boisson + Frites', comboItem: 'Yes', readyForSale: 'Yes',
      numberOfPiecesRecipe: 1,
      components: [{ name: 'Frites', id: 'ing-fries', numberOfUnits: 1, unit: 'kg' }],
    }
    const outerCombo = {
      id: 'mi-outer', name: 'Menu Maxi', comboItem: 'Yes', readyForSale: 'No',
      numberOfPiecesRecipe: 1,
      components: [{ name: 'Boisson + Frites', id: 'mi-inner', numberOfUnits: 1, unit: 'pcs' }],
    }
    const menuItemsById = new Map([[outerCombo.id, outerCombo], [innerCombo.id, innerCombo]])
    const componentLookup = buildLookup([outerCombo, innerCombo])

    const result = expandMenuItem.call(ctx, 'mi-outer', 3, 'Menu Maxi', 0, menuItemsById, componentLookup)

    expect(result.map((r) => r.name)).toEqual(['Frites'])
    expect(result[0].totalQuantity).toBe(3)
  })

  it('still treats a non-combo readyForSale=Yes menu item as a single piece (unchanged behavior)', () => {
    const coke = { id: 'mi-coke', name: 'Coca', comboItem: 'No', readyForSale: 'Yes' }
    const menuItemsById = new Map([[coke.id, coke]])
    const componentLookup = buildLookup([coke])

    const result = expandMenuItem.call(ctx, 'mi-coke', 5, 'Coca', 0, menuItemsById, componentLookup)

    // BUG-292-01 : la ligne vient désormais du module partagé, dont la shape est le
    // SURENSEMBLE des quatre écrans — d'où `sourceId`, `itemType` et
    // `sources[].menuItemId` en plus. Le réarmement lisait déjà ces trois champs.
    expect(result).toEqual([
      {
        name: 'Coca',
        id: 'mi-coke',
        sourceId: 'mi-coke',
        itemType: 'MenuItem',
        totalQuantity: 5,
        unit: 'pcs',
        // BUG-291-01 : chaque ligne porte désormais sa valorisation.
        unitCost: 0,
        isExpanded: false,
        sources: [
          { menuItemId: 'mi-coke', menuItemName: 'Coca', menuItemQuantity: 5, componentQuantity: 5, unit: 'pcs' },
        ],
      },
    ])
  })

  it('still explodes a non-combo readyForSale=No menu item via its components (unchanged behavior)', () => {
    const dish = {
      id: 'mi-dish', name: 'Burger Seul', comboItem: 'No', readyForSale: 'No',
      numberOfPiecesRecipe: 1,
      components: [{ name: 'Bun', id: 'ing-bun', numberOfUnits: 2, unit: 'pc' }],
    }
    const menuItemsById = new Map([[dish.id, dish]])
    const componentLookup = buildLookup([dish])

    const result = expandMenuItem.call(ctx, 'mi-dish', 1, 'Burger Seul', 0, menuItemsById, componentLookup)

    expect(result.map((r) => r.name)).toEqual(['Bun'])
    expect(result[0].totalQuantity).toBe(2)
  })

  it('falls back to 1 pcs for a comboItem=Yes item with no components (degenerate data)', () => {
    const emptyCombo = { id: 'mi-empty-combo', name: 'Empty Combo', comboItem: 'Yes', readyForSale: 'Yes', components: [] }
    const menuItemsById = new Map([[emptyCombo.id, emptyCombo]])
    const componentLookup = buildLookup([emptyCombo])

    const result = expandMenuItem.call(ctx, 'mi-empty-combo', 4, 'Empty Combo', 0, menuItemsById, componentLookup)

    expect(result).toEqual([
      {
        name: 'Empty Combo',
        id: 'mi-empty-combo',
        sourceId: 'mi-empty-combo',
        itemType: 'MenuItem',
        totalQuantity: 4,
        unit: 'pcs',
        unitCost: 0,
        isExpanded: false,
        sources: [
          { menuItemId: 'mi-empty-combo', menuItemName: 'Empty Combo', menuItemQuantity: 4, componentQuantity: 4, unit: 'pcs' },
        ],
      },
    ])
  })
})

/**
 * BUG-290-01 — décision Bertrand 2026-08-04, qui PRÉCISE la Question #18 :
 * « pour un combo item, on prend chaque menu item qui le compose et on les traite
 *   de la même façon que les menu items normaux : readyForSale=Yes → on stocke
 *   sans rien décomposer ; readyForSale=No → on stocke tous les éléments qui les
 *   composent — on n'éclate toujours pas les composants ! »
 *
 * Conséquence : la récursion dépend de la nature du PARENT (combo = panier qu'on
 * ouvre), pas du readyForSale de l'enfant. Un composant d'un menu item
 * readyForSale='No' reste UNE LIGNE même s'il résout vers un menu item.
 */
describe('EventPredictStockUpSection.expandMenuItem — BUG-290-01 (un seul niveau hors combo)', () => {
  it('explodes a combo constituent that is readyForSale=No into ITS components, and stops there', () => {
    // Sauce burger : composant préparé en cuisine centrale, modélisé en menu item
    // readyForSale='No'. Sous un combo, on doit voir SES composants — mais jamais
    // les sous-éléments de ceux-ci.
    const burger = {
      id: 'mi-burger', name: 'Burger', comboItem: 'No', readyForSale: 'No',
      numberOfPiecesRecipe: 1,
      components: [
        { name: 'Bun', id: 'ing-bun', numberOfUnits: 1, unit: 'pc' },
        { name: 'Sauce burger', id: 'ing-sauce', numberOfUnits: 0.02, unit: 'kg' },
      ],
    }
    // La sauce existe AUSSI au catalogue en menu item readyForSale='No' : avant
    // le fix, `expandMenuItem` redescendait dedans et sortait son ail.
    const sauce = {
      id: 'mi-sauce', name: 'Sauce burger', comboItem: 'No', readyForSale: 'No',
      numberOfPiecesRecipe: 1,
      components: [{ name: 'Ail', id: 'ing-ail', numberOfUnits: 0.001, unit: 'kg' }],
    }
    const combo = {
      id: 'mi-combo', name: 'Menu Burger', comboItem: 'Yes', readyForSale: 'No',
      numberOfPiecesRecipe: 1,
      components: [
        { name: 'Burger', id: 'mi-burger', sourceId: 'mi-burger', numberOfUnits: 1, unit: 'pcs' },
        { name: 'Coca', id: 'mi-coke', sourceId: 'mi-coke', numberOfUnits: 1, unit: 'pcs' },
      ],
    }
    const coke = { id: 'mi-coke', name: 'Coca', comboItem: 'No', readyForSale: 'Yes' }

    const all = [combo, burger, sauce, coke]
    const menuItemsById = new Map(all.map((mi) => [mi.id, mi]))
    const componentLookup = buildLookup(all)

    const result = expandMenuItem.call(ctx, 'mi-combo', 60, 'Menu Burger', 0, menuItemsById, componentLookup)
    const names = result.map((r) => r.name).sort()

    // Le panier est ouvert : le Coca (readyForSale=Yes) sort tel quel, le Burger
    // (readyForSale=No) sort en ses composants.
    expect(names).toEqual(['Bun', 'Coca', 'Sauce burger'])
    // …et la sauce N'EST PAS décomposée, alors qu'elle a une recette au catalogue.
    expect(names).not.toContain('Ail')

    expect(result.find((r) => r.name === 'Coca').totalQuantity).toBe(60)
    expect(result.find((r) => r.name === 'Bun').totalQuantity).toBe(60)
    expect(result.find((r) => r.name === 'Sauce burger').totalQuantity).toBeCloseTo(1.2, 5)
  })

  it('does NOT recurse into a readyForSale=No component when the parent is not a combo', () => {
    const sauce = {
      id: 'mi-sauce', name: 'Sauce burger', comboItem: 'No', readyForSale: 'No',
      numberOfPiecesRecipe: 1,
      components: [{ name: 'Ail', id: 'ing-ail', numberOfUnits: 0.001, unit: 'kg' }],
    }
    const burger = {
      id: 'mi-burger', name: 'Burger', comboItem: 'No', readyForSale: 'No',
      numberOfPiecesRecipe: 1,
      components: [
        { name: 'Sauce burger', id: 'ing-sauce', sourceId: 'mi-sauce', numberOfUnits: 0.02, unit: 'kg' },
      ],
    }
    const all = [burger, sauce]
    const menuItemsById = new Map(all.map((mi) => [mi.id, mi]))
    const componentLookup = buildLookup(all)

    const result = expandMenuItem.call(ctx, 'mi-burger', 60, 'Burger', 0, menuItemsById, componentLookup)

    expect(result.map((r) => r.name)).toEqual(['Sauce burger'])
    expect(result[0].totalQuantity).toBeCloseTo(1.2, 5)
  })
})

/**
 * BUG-290-01 (S4) — « la liste passe de Bun Burger… à Burger seul après un hard
 * refresh ». `useSpaceData` livre les menu items en vague 2a et les catalogues
 * recette en vague 2b : entre les deux, un article composé n'a pas de recette
 * exploitable et tombait dans le repli « 1 pcs de l'article lui-même ».
 */
describe('EventPredictStockUpSection.expandMenuItem — BUG-290-01 S4 (hydratation recette)', () => {
  const burgerSansRecette = {
    id: 'mi-burger', name: 'Burger', comboItem: 'No', readyForSale: 'No',
    numberOfPiecesRecipe: 1,
    components: [],
  }
  const menuItemsById = new Map([[burgerSansRecette.id, burgerSansRecette]])
  const componentLookup = buildLookup([burgerSansRecette])

  it('n\'émet AUCUNE ligne pour un article composé tant que le catalogue recette n\'est pas chargé', () => {
    const ctxLoading = { expandMenuItem, miUnitCost, menuItemCostMap: {}, recipeCatalogLoaded: false }

    const result = expandMenuItem.call(ctxLoading, 'mi-burger', 60, 'Burger', 0, menuItemsById, componentLookup)

    // Avant le fix : [{ name: 'Burger', totalQuantity: 60, unit: 'pcs' }] —
    // l'article fini s'affichait à la place de ses 7 éléments.
    expect(result).toEqual([])
  })

  it('garde le repli 1 pcs une fois le catalogue chargé (donnée dégradée : recette vide en base)', () => {
    const result = expandMenuItem.call(ctx, 'mi-burger', 60, 'Burger', 0, menuItemsById, componentLookup)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Burger')
    expect(result[0].totalQuantity).toBe(60)
  })

  it('laisse passer un article SANS recette (Cookie, readyForSale=Yes) quel que soit l\'état du catalogue', () => {
    const cookie = { id: 'mi-cookie', name: 'Cookie', comboItem: 'No', readyForSale: 'Yes' }
    const byId = new Map([[cookie.id, cookie]])
    const lookup = buildLookup([cookie])
    const ctxLoading = { expandMenuItem, miUnitCost, menuItemCostMap: {}, recipeCatalogLoaded: false }

    const result = expandMenuItem.call(ctxLoading, 'mi-cookie', 12, 'Cookie', 0, byId, lookup)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Cookie')
    expect(result[0].totalQuantity).toBe(12)
  })
})
