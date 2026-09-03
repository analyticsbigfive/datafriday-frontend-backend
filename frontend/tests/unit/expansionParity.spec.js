/**
 * BUG-292-01 — GARDE-FOU anti-divergence.
 *
 * Ce fichier n'existe pas pour tester une fonction : il existe pour empêcher la
 * réapparition du bug de fond. Cinq écrans portaient chacun leur copie de la règle
 * de décomposition, et les copies avaient dérivé — critères de récursion
 * différents, identités de ligne différentes. Résultat : le nombre d'articles que
 * le stock-up dit de charger, celui que l'inventaire demande de compter et celui
 * que le réarmement redemande ne se joignaient pas.
 *
 * Si vous écrivez une sixième expansion de recette, ce test doit échouer.
 *
 * ── CONTRAT DE PARITÉ (précis, sinon le test se fait affaiblir jusqu'à ne plus
 *    rien prouver) ───────────────────────────────────────────────────────────
 *   Comparé : l'ensemble des IDENTITÉS de ligne (`componentIngredientId`).
 *             C'est la propriété critique : c'est sur elle que le comptage
 *             d'inventaire joint le réarmement.
 *   Racines : menu items `readyForSale='No'` uniquement.
 *   Exclus  : la branche packaging des `readyForSale='Yes'` côté inventaire
 *             (`inventoryUtils.js`, décision owner 2026-08-04 — l'inventaire
 *             compte en plus ce packaging) ; couverte par un test séparé.
 *   Ignorés : quantités, `sources[]`, `usedIn`, `picture`, `isExpanded`, `unitCost`
 *             — présentation, légitimement différente d'un écran à l'autre.
 *
 * ── DIVERGENCE ASSUMÉE, testée telle quelle plus bas ──────────────────────────
 *   Recette entièrement anonyme : le stock-up n'émet RIEN (BUG-291-01, la ligne
 *   fantôme « 64,05 unit »), le réarmement retombe sur l'article. Explicite via
 *   `fallbackWhenEmpty`, pas subie.
 */
import { expandMenuItemStock } from '@/utils/stockPlanning'
import { buildConsolidatedInventory } from '@/utils/inventoryUtils'
import EventPredictStockUpSection from '@/components/space-workspace/event-predict/sections/EventPredictStockUpSection.vue'

const { expandMenuItem, miUnitCost } = EventPredictStockUpSection.methods
const stockUpCtx = { expandMenuItem, miUnitCost, menuItemCostMap: {}, recipeCatalogLoaded: true }

const lookupFor = (menuItems) => {
  const byName = new Map()
  const idxById = new Map()
  menuItems.forEach((mi, idx) => {
    idxById.set(mi.id, idx)
    if (mi.name != null && !byName.has(mi.name)) byName.set(mi.name, { item: mi, idx })
  })
  return { byName, idxById }
}

/** Les 3 chaînes, ramenées à leur ensemble d'identités de ligne. */
const idsFromStockUp = (menuItems, rootId, qty) =>
  new Set(
    expandMenuItem
      .call(stockUpCtx, rootId, qty, 'root', 0, new Map(menuItems.map((mi) => [mi.id, mi])), lookupFor(menuItems))
      .map((r) => r.id),
  )

const idsFromRestock = (menuItems, components, rootId, qty) =>
  new Set(expandMenuItemStock(rootId, qty, 'root', menuItems, components).map((r) => r.id))

const idsFromInventory = (menuItems, components) =>
  new Set(buildConsolidatedInventory(menuItems, menuItems, [], true, components).map((r) => r.id))

// ── Le Burger du brief : 2 composants préparés + 4 ingrédients + 1 packaging ──
const pickleDef = {
  id: 'cmp-pickles',
  name: 'Pickles',
  numberOfUnitsRecipe: 2,
  subComponents: [
    { id: 'mp-ail', marketPriceId: 'mp-ail', itemType: 'Ingredient', name: 'Ail', unit: 'kg', numberOfUnits: 0.05 },
  ],
}

const burger = {
  id: 'mi-burger',
  name: 'Burger',
  readyForSale: 'No',
  comboItem: 'No',
  numberOfPiecesRecipe: 1,
  components: [
    { id: 'l-1', sourceId: 'ing-bun', itemType: 'Ingredient', name: 'Bun', unit: 'pcs', numberOfUnits: 1 },
    { id: 'l-2', sourceId: 'ing-viande', itemType: 'Ingredient', name: 'Viande', unit: 'kg', numberOfUnits: 0.15 },
    { id: 'l-3', sourceId: 'cmp-pickles', itemType: 'Component', name: 'Pickles', unit: 'kg', numberOfUnits: 0.01 },
    { id: 'l-4', sourceId: 'pkg-serviette', itemType: 'Packaging', name: 'Serviette', unit: 'pcs', numberOfUnits: 1 },
  ],
}

describe('BUG-292-01 — parité des 3 chaînes gouvernées par la règle', () => {
  it('stock-up, réarmement et inventaire désignent EXACTEMENT les mêmes articles', () => {
    const menuItems = [burger]
    const components = [pickleDef]

    const stockUp = idsFromStockUp(menuItems, 'mi-burger', 100)
    const restock = idsFromRestock(menuItems, components, 'mi-burger', 100)
    const inventory = idsFromInventory(menuItems, components)

    expect([...restock].sort()).toEqual([...stockUp].sort())
    expect([...inventory].sort()).toEqual([...stockUp].sort())
  })

  it('aucune des trois ne descend dans un composant', () => {
    const menuItems = [burger]
    const components = [pickleDef]
    for (const ids of [
      idsFromStockUp(menuItems, 'mi-burger', 100),
      idsFromRestock(menuItems, components, 'mi-burger', 100),
      idsFromInventory(menuItems, components),
    ]) {
      expect(ids.has('cmp-pickles')).toBe(true) // le composant, entier
      expect(ids.has('mp-ail')).toBe(false) // jamais son ail
    }
  })

  it("aucune des trois ne redescend dans un composant qui résout vers un menu item readyForSale='No'", () => {
    // Le piège de BUG-290-01 : la sauce existe aussi comme menu item composé.
    const picklesAsMenuItem = {
      id: 'cmp-pickles',
      name: 'Pickles',
      readyForSale: 'No',
      comboItem: 'No',
      numberOfPiecesRecipe: 1,
      components: [
        { id: 'p-1', sourceId: 'ing-ail', itemType: 'Ingredient', name: 'Ail', unit: 'kg', numberOfUnits: 0.05 },
      ],
    }
    const menuItems = [burger, picklesAsMenuItem]
    const stockUp = idsFromStockUp(menuItems, 'mi-burger', 100)
    const restock = idsFromRestock(menuItems, [], 'mi-burger', 100)

    for (const ids of [stockUp, restock]) {
      expect(ids.has('cmp-pickles')).toBe(true)
      expect(ids.has('ing-ail')).toBe(false)
    }
    expect([...restock].sort()).toEqual([...stockUp].sort())
  })

  it('un combo est ouvert de la même façon par le stock-up et le réarmement', () => {
    const coca = { id: 'mi-coca', name: 'Coca', readyForSale: 'Yes', comboItem: 'No' }
    const menu = {
      id: 'mi-menu',
      name: 'Menu',
      readyForSale: 'Yes',
      comboItem: 'Yes',
      numberOfPiecesRecipe: 1,
      components: [
        { id: 'm-1', sourceId: 'mi-burger', itemType: 'Component', name: 'Burger', unit: 'pcs', numberOfUnits: 1 },
        { id: 'm-2', sourceId: 'mi-coca', itemType: 'Component', name: 'Coca', unit: 'pcs', numberOfUnits: 1 },
      ],
    }
    const menuItems = [menu, burger, coca]
    const stockUp = idsFromStockUp(menuItems, 'mi-menu', 10)
    const restock = idsFromRestock(menuItems, [], 'mi-menu', 10)

    expect([...restock].sort()).toEqual([...stockUp].sort())
    expect(stockUp.has('mi-menu')).toBe(false) // le panier n'est pas un article
    expect(stockUp.has('mi-coca')).toBe(true)
    expect(stockUp.has('ing-bun')).toBe(true)
  })

  it("le réarmement ne dépend plus de l'état d'hydratation du catalogue composants", () => {
    // Propriété obtenue en retirant l'éclatement : la sortie est identique que les
    // `subComponents` soient arrivés ou non. Avant, deux listes selon le moment.
    const menuItems = [burger]
    expect([...idsFromRestock(menuItems, [pickleDef], 'mi-burger', 100)].sort()).toEqual(
      [...idsFromRestock(menuItems, [], 'mi-burger', 100)].sort(),
    )
  })
})

describe('BUG-292-01 — divergences ASSUMÉES (décisions, pas dérives)', () => {
  it("inventaire : compte EN PLUS le packaging d'un readyForSale='Yes' (décision owner)", () => {
    const coca = {
      id: 'mi-coca',
      name: 'Coca',
      readyForSale: 'Yes',
      comboItem: 'No',
      components: [
        { id: 'c-1', sourceId: 'pkg-cup', storageType: 'material', itemType: 'Packaging', name: 'Cup 50CL', unit: 'pcs', numberOfUnits: 1 },
      ],
    }
    const inventory = idsFromInventory([coca], [])
    const stockUp = idsFromStockUp([coca], 'mi-coca', 40)

    expect(stockUp.has('pkg-cup')).toBe(false) // le chargement ne sépare pas le packaging
    expect(inventory.has('pkg-cup')).toBe(true) // le comptage, si (exception assumée)
    expect(inventory.has('mi-coca')).toBe(true)
  })

  it('recette entièrement anonyme : rien côté stock-up, article côté réarmement', () => {
    const anonyme = {
      id: 'mi-anon',
      name: 'Anonyme',
      readyForSale: 'No',
      comboItem: 'No',
      numberOfPiecesRecipe: 1,
      components: [{ id: 'a-1', numberOfUnits: 1, unit: 'kg' }],
    }
    expect(idsFromStockUp([anonyme], 'mi-anon', 10).size).toBe(0)
    expect([...idsFromRestock([anonyme], [], 'mi-anon', 10)]).toEqual(['mi-anon'])
  })
})
