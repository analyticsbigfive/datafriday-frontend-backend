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
import EventPredictStockUpSection from '@/components/EventPredictStockUpSection.vue'

const { expandMenuItem } = EventPredictStockUpSection.methods
const ctx = { expandMenuItem }

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

    expect(result).toEqual([
      {
        name: 'Coca',
        id: 'mi-coke',
        totalQuantity: 5,
        unit: 'pcs',
        isExpanded: false,
        sources: [{ menuItemName: 'Coca', menuItemQuantity: 5, componentQuantity: 5, unit: 'pcs' }],
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
        totalQuantity: 4,
        unit: 'pcs',
        isExpanded: false,
        sources: [{ menuItemName: 'Empty Combo', menuItemQuantity: 4, componentQuantity: 4, unit: 'pcs' }],
      },
    ])
  })
})
