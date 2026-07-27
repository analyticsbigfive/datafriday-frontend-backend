import {
  buildConsolidatedInventory,
  buildStorageInventory,
} from '@/utils/inventoryUtils'
import { expandMenuItemStock, isPackagingComponent } from '@/utils/stockPlanning'
import { resolveComponentRefs } from '@/utils/menuItemNormalize'
import { aggregateSalesToPredictedRecords } from '@/utils/salesAggregation'
import { buildShoppingList, countedRemaining } from '@/utils/shoppingList'

const names = (rows) => rows.map((r) => r.name).sort()

describe('Règle 2 — expansion inventaire (inventoryUtils)', () => {
  it('un soft drink readyForSale=Yes à 1 ingrédient se consolide sur le Market Price item', () => {
    const coke = {
      id: 'mi-coke',
      name: 'Coca',
      readyForSale: 'Yes',
      comboItem: 'No',
      components: [
        { id: 'ing-1', name: 'Coca Syrup', itemType: 'Ingredient', marketPriceId: 'mp-1' },
      ],
    }
    const marketPrices = [
      { id: 'mp-1', itemName: 'Coca 33cl', inventoryQuantityPackaged: 24, unit: 'pc' },
    ]
    const res = buildConsolidatedInventory([coke], [coke], marketPrices, false, [])
    expect(res).toHaveLength(1)
    expect(res[0].name).toBe('Coca 33cl')
    expect(res[0].marketPriceId).toBe('mp-1')
    expect(res[0].inventoryQuantityPackaged).toBe(24)
    expect(res[0].usedIn.map((u) => u.name)).toContain('Coca')
  })

  it('un combo comboItem=Yes/readyForSale=No apparaît comme ses composants, pas comme le combo', () => {
    const burger = {
      id: 'mi-burger',
      name: 'Burger Combo',
      comboItem: 'Yes',
      readyForSale: 'No',
      components: [
        { id: 'ing-bun', name: 'Bun', itemType: 'Ingredient' },
        { id: 'ing-meat', name: 'Meat', itemType: 'Ingredient' },
      ],
    }
    const res = buildConsolidatedInventory([burger], [burger])
    expect(names(res)).toEqual(['Bun', 'Meat'])
    expect(names(res)).not.toContain('Burger Combo')
  })

  it('BUG-002/Q18 (2026-07-24) : un combo comboItem=Yes/readyForSale=Yes apparaît AUSSI comme ses composants, pas comme le combo', () => {
    const menu = {
      id: 'mi-menu',
      name: 'Menu Burger',
      comboItem: 'Yes',
      readyForSale: 'Yes',
      components: [
        { id: 'ing-bun', name: 'Bun', itemType: 'Ingredient' },
        { id: 'ing-fries', name: 'Frites', itemType: 'Ingredient' },
      ],
    }
    const res = buildConsolidatedInventory([menu], [menu])
    expect(names(res)).toEqual(['Bun', 'Frites'])
    expect(names(res)).not.toContain('Menu Burger')
  })

  it('un readyForSale=Yes multi-ingrédient garde l’item + son packaging direct, sans les ingrédients', () => {
    const meal = {
      id: 'mi-meal',
      name: 'Menu Maxi',
      readyForSale: 'Yes',
      comboItem: 'No',
      components: [
        { id: 'ing-a', name: 'Pain', itemType: 'Ingredient' },
        { id: 'ing-b', name: 'Steak', itemType: 'Ingredient' },
        { id: 'pkg-box', name: 'Boîte', itemType: 'Component', category: 'Packaging' },
      ],
    }
    const res = buildConsolidatedInventory([meal], [meal])
    const got = names(res)
    expect(got).toContain('Menu Maxi')
    expect(got).toContain('Boîte') // packaging direct inclus
    expect(got).not.toContain('Pain') // ingrédients NON comptés pour un ready-for-sale
    expect(got).not.toContain('Steak')
  })

  it('un item non-readyForSale dont les components n’ont aucun nom retombe sur lui-même', () => {
    // Régression Space Inventory 0/0 : le catalogue enrichi fournit des
    // components (relations non résolues, sans nom) → expansion vide → l'item
    // disparaissait de l'inventaire. Il doit rester comptable en son nom propre.
    const combo = {
      id: 'mi-combo',
      name: 'Burger + Frites',
      readyForSale: 'No',
      comboItem: 'No',
      components: [
        { sourceId: 'ref-1', numberOfUnits: 1 },
        { sourceId: 'ref-2', numberOfUnits: 1 },
      ],
    }
    const res = buildConsolidatedInventory([combo], [combo])
    expect(names(res)).toEqual(['Burger + Frites'])
    expect(res[0].usedIn.map((u) => u.name)).toContain('Burger + Frites')
  })

  it('un item sans components est sa propre ligne ET se couvre lui-même (usedIn)', () => {
    const snack = {
      id: 'mi-snack',
      name: 'Barre Chocolatee',
      readyForSale: 'No',
      comboItem: 'No',
      components: [],
    }
    const res = buildConsolidatedInventory([snack], [snack])
    expect(names(res)).toEqual(['Barre Chocolatee'])
    expect(res[0].usedIn.map((u) => u.name)).toContain('Barre Chocolatee')
  })

  it('buildStorageInventory respecte selectedShopIds', () => {
    const drink = {
      id: 'mi-d',
      name: 'Soda',
      readyForSale: 'Yes',
      comboItem: 'No',
      components: [],
      storageType: ['Cold'],
    }
    const fbElements = [
      { id: 'shop-1', name: 'Bar 1', availableMenuItems: [drink] },
      { id: 'shop-2', name: 'Bar 2', availableMenuItems: [drink] },
    ]
    const all = buildStorageInventory([], fbElements, [drink])
    const filtered = buildStorageInventory([], fbElements, [drink], ['shop-1'])
    expect(all.find((i) => i.name === 'Soda').usedIn).toHaveLength(2)
    expect(filtered.find((i) => i.name === 'Soda').usedIn).toHaveLength(1)
    expect(filtered.find((i) => i.name === 'Soda').usedIn[0].fbElementId).toBe('shop-1')
  })
})

describe('Résolution des refs components par catalogue (menuItemNormalize)', () => {
  it('complète name/type d’un component sans nom via le catalogue ingrédients', () => {
    const menuItems = [
      {
        id: 'mi-burger',
        name: 'Burger + Frites',
        readyForSale: 'No',
        components: [
          { id: 'row-1', sourceId: 'ing-bun', numberOfUnits: 1, unit: 'unit' },
          { id: 'row-2', sourceId: 'ing-cheddar', numberOfUnits: 1, unit: 'unit' },
        ],
      },
    ]
    const ingredients = [
      { id: 'ing-bun', name: 'Bun - Burger', category: 'Plats Chauds', recipeUnit: 'pc' },
      { id: 'ing-cheddar', name: 'Cheddar Tranche', category: 'Plats Chauds', recipeUnit: 'kg' },
    ]
    const { menuItems: out, resolved, unresolved } = resolveComponentRefs(menuItems, { ingredients })
    expect(resolved).toBe(2)
    expect(unresolved).toBe(0)
    const comps = out[0].components
    expect(comps.map((c) => c.name)).toEqual(['Bun - Burger', 'Cheddar Tranche'])
    expect(comps[0].itemType).toBe('Ingredient')
    expect(comps[0].unit).toBe('pc')
  })

  it('ne réécrit jamais un component déjà nommé et laisse intact un id introuvable', () => {
    const menuItems = [
      {
        id: 'mi-x',
        name: 'X',
        components: [
          { id: 'row-1', sourceId: 'ing-a', name: 'Déjà Nommé', unit: 'kg' },
          { id: 'row-2', sourceId: 'ing-inconnu', numberOfUnits: 1 },
        ],
      },
    ]
    const ingredients = [{ id: 'ing-a', name: 'Autre Nom' }]
    const { menuItems: out, resolved, unresolved } = resolveComponentRefs(menuItems, { ingredients })
    expect(out[0].components[0].name).toBe('Déjà Nommé')
    expect(out[0].components[1].name).toBeUndefined()
    expect(resolved).toBe(0)
    expect(unresolved).toBe(1)
  })
})

describe('Règle 3 — packaging réarmé comme un ingrédient (stockPlanning)', () => {
  it('expandMenuItemStock réarme le packaging (composant) d’un article readyForSale=No', () => {
    // Design actuel (stockPlanning.js) : un article readyForSale=Yes est livré déjà
    // emballé → réarmé tel quel, packaging NON séparé. Pour réarmer un packaging
    // ajouté sur place, l'article est modélisé readyForSale=No avec le composant dédié
    // → le packaging sort alors en ligne de réarmement (quantité BOM).
    const menuItems = [
      {
        id: 'mi-sandwich',
        name: 'Sandwich',
        readyForSale: 'No',
        numberOfPiecesRecipe: 1,
        components: [
          { id: 'pkg-cup', name: 'Gobelet', category: 'Packaging', numberOfUnits: 1, unit: 'pc' },
        ],
      },
    ]
    const rows = expandMenuItemStock('mi-sandwich', 10, 'Sandwich', menuItems)
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
    // Le plat lui-même n'est pas réarmé (readyForSale=No éclate en composants).
    expect(byName['Sandwich']).toBeUndefined()
    // Le packaging est réarmé : 1 (numberOfUnits) × 10 (plats) / 1 (recette) = 10.
    expect(byName['Gobelet']).toBeTruthy()
    expect(byName['Gobelet'].totalQuantity).toBe(10)
    // isPackagingComponent (helper) reconnaît bien le composant comme packaging.
    expect(isPackagingComponent(menuItems[0].components[0])).toBe(true)
  })

  it('expandMenuItemStock : components tous sans nom → 1 ligne self, jamais de placeholder', () => {
    const menuItems = [
      {
        id: 'mi-combo',
        name: 'Burger + Frites',
        readyForSale: 'No',
        numberOfPiecesRecipe: 1,
        components: [
          { id: 'row-1', sourceId: 'ref-1', numberOfUnits: 1 },
          { id: 'row-2', sourceId: 'ref-2', numberOfUnits: 2 },
        ],
      },
    ]
    const rows = expandMenuItemStock('mi-combo', 5, 'Burger + Frites', menuItems)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('mi-combo')
    expect(rows[0].name).toBe('Burger + Frites')
    expect(rows[0].totalQuantity).toBe(5)
    expect(rows.some((r) => String(r.name).startsWith('Composant de'))).toBe(false)
  })

  it('expandMenuItemStock : mix feuille nommée + anonyme → seule la nommée sort', () => {
    const menuItems = [
      {
        id: 'mi-mix',
        name: 'Menu Mix',
        readyForSale: 'No',
        numberOfPiecesRecipe: 1,
        components: [
          { id: 'row-1', name: 'Frites', numberOfUnits: 1, unit: 'kg' },
          { id: 'row-2', sourceId: 'ref-x', numberOfUnits: 1 },
        ],
      },
    ]
    const rows = expandMenuItemStock('mi-mix', 3, 'Menu Mix', menuItems)
    expect(rows.map((r) => r.name)).toEqual(['Frites'])
  })
})

describe('Règle 3 — agrégation des ventes de référence (salesAggregation)', () => {
  it('agrège par menu item et par PDV via le shop-element-mapping', () => {
    const rows = [
      { menuItemId: 'mi-1', shopName: 'Bar A', quantity: 5 },
      { menuItemId: 'mi-1', shopName: 'Bar A', quantity: 3 },
      { productName: 'Frites', shopName: 'Bar B', quantity: 2 },
    ]
    const mappings = [
      { shopName: 'Bar A', elementId: 'el-1' },
      { shopName: 'Bar B', elementId: 'el-2' },
    ]
    const menuItems = [{ id: 'mi-2', name: 'Frites' }]
    const recs = aggregateSalesToPredictedRecords(rows, { mappings, menuItems })
    const byKey = Object.fromEntries(recs.map((r) => [`${r.menuItemId}|${r.elementId}`, r]))
    expect(byKey['mi-1|el-1'].totalQuantity).toBe(8)
    expect(byKey['mi-2|el-2'].totalQuantity).toBe(2)
  })
})

describe('Règle 3 — liste de courses (shoppingList)', () => {
  it('restant compté = packedUnits * inventoryQuantityPackaged + looseUnits', () => {
    expect(countedRemaining({ packedUnits: 1, looseUnits: 10 }, 24)).toBe(34)
    expect(countedRemaining(null, 24)).toBe(0)
  })

  it('gap = max(0, besoin - restant), packaging inclus, agrégé', () => {
    const stockRows = [
      {
        shopId: 'el-1',
        shopName: 'Bar A',
        itemId: 'bun',
        itemName: 'Pain burger',
        unit: 'pc',
        totalQuantity: 100,
        isPackaging: true,
      },
    ]
    const inventoryCounts = { 'el-1': { bun: { packedUnits: 1, looseUnits: 10 } } }
    const { lines, aggregated } = buildShoppingList({
      stockRows,
      inventoryCounts,
      getQuantityPackaged: () => 24,
    })
    expect(lines[0].counted).toBe(34)
    expect(lines[0].gap).toBe(66)
    expect(aggregated).toHaveLength(1)
    expect(aggregated[0].name).toBe('Pain burger')
    expect(aggregated[0].isPackaging).toBe(true)
    expect(aggregated[0].totalUnits).toBe(66)
  })

  it('un article entièrement en stock a un gap 0 et sort de la liste de courses', () => {
    const stockRows = [
      { shopId: 'el-1', shopName: 'Bar A', itemId: 'x', itemName: 'X', unit: 'pc', totalQuantity: 10 },
    ]
    const inventoryCounts = { 'el-1': { x: { packedUnits: 1, looseUnits: 0 } } }
    const { aggregated } = buildShoppingList({
      stockRows,
      inventoryCounts,
      getQuantityPackaged: () => 24,
    })
    expect(aggregated).toHaveLength(0)
  })
})
