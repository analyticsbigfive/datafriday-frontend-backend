/**
 * F6 — Éclatement ComponentDefinition → ingrédients feuilles (inventaire + restock).
 * « On ne commande pas un composant » : un ComponentDefinition (ex. Pickles Auxerre)
 * doit disparaître des lignes comptables/réarmables, remplacé par ses ingrédients.
 * Vérifie : helpers partagés (identité + BOM factor + anti-cycle), expansion côté
 * inventaire (présence), expansion côté restock (quantités BOM), identité identique
 * des deux côtés (jointure netting).
 */
import {
  componentIngredientId,
  resolveComponentDef,
  flattenComponentDef,
  buildConsolidatedInventory,
} from '@/utils/inventoryUtils'
import { expandMenuItemStock } from '@/utils/stockPlanning'

// ComponentDefinition « Pickles Auxerre » = 2 ingrédients (recette de 1 unité).
const pickleDef = {
  id: 'cmp-pickles',
  name: 'Pickles Auxerre',
  numberOfUnitsRecipe: 1,
  subComponents: [
    { id: 'sc-1', itemType: 'Ingredient', name: 'Badiane', unit: 'kg', numberOfUnits: 0.5, marketPriceId: 'mp-badiane' },
    { id: 'sc-2', itemType: 'Ingredient', name: 'Canelle', unit: 'kg', numberOfUnits: 0.25, marketPriceId: 'mp-canelle' },
  ],
}

// Menu item vendu (readyForSale='No') qui utilise 2 unités de Pickles Auxerre par plat.
const dish = {
  id: 'mi-burger',
  name: 'Burger Auxerre',
  readyForSale: 'No',
  comboItem: 'No',
  numberOfPiecesRecipe: 1,
  components: [
    { id: 'c-pickles', itemType: 'Component', name: 'Pickles Auxerre', sourceId: 'cmp-pickles', unit: 'unit', numberOfUnits: 2 },
  ],
}

describe('componentIngredientId', () => {
  it('priorise marketPriceId puis sourceId puis id', () => {
    expect(componentIngredientId({ marketPriceId: 'mp', sourceId: 's', id: 'i' })).toBe('mp')
    expect(componentIngredientId({ sourceId: 's', id: 'i' })).toBe('s')
    expect(componentIngredientId({ id: 'i' })).toBe('i')
    expect(componentIngredientId({})).toBeNull()
  })
})

describe('resolveComponentDef', () => {
  it('résout par sourceId', () => {
    expect(resolveComponentDef({ sourceId: 'cmp-pickles' }, [pickleDef])).toBe(pickleDef)
  })
  it('résout par nom (sous-composant sans id de réf)', () => {
    expect(resolveComponentDef({ name: 'pickles auxerre' }, [pickleDef])).toBe(pickleDef)
  })
  it('renvoie null si aucun match', () => {
    expect(resolveComponentDef({ name: 'inconnu' }, [pickleDef])).toBeNull()
  })
})

describe('flattenComponentDef', () => {
  it('aplatit en ingrédients feuilles avec qtyFactor = numberOfUnits/numberOfUnitsRecipe', () => {
    const leaves = flattenComponentDef(pickleDef, [pickleDef])
    expect(leaves.map((l) => l.name)).toEqual(['Badiane', 'Canelle'])
    expect(leaves[0]).toMatchObject({ id: 'mp-badiane', name: 'Badiane', unit: 'kg', qtyFactor: 0.5 })
    expect(leaves[1].qtyFactor).toBe(0.25)
  })

  it('multiplie les facteurs sur un sous-composant imbriqué', () => {
    const parent = {
      id: 'cmp-parent',
      name: 'Sauce mère',
      numberOfUnitsRecipe: 1,
      subComponents: [
        { id: 'sc-p', itemType: 'Component', name: 'Pickles Auxerre', numberOfUnits: 4 },
      ],
    }
    const leaves = flattenComponentDef(parent, [parent, pickleDef])
    // Badiane : 4 (parent) × 0.5 (pickles) = 2
    expect(leaves.find((l) => l.name === 'Badiane').qtyFactor).toBe(2)
  })

  it('ne boucle pas sur un cycle (A → A par nom)', () => {
    const selfRef = {
      id: 'cmp-self',
      name: 'Boucle',
      numberOfUnitsRecipe: 1,
      subComponents: [{ itemType: 'Component', name: 'Boucle', numberOfUnits: 1 }],
    }
    expect(() => flattenComponentDef(selfRef, [selfRef])).not.toThrow()
    // Le sous-composant self-référent est coupé (visited) → aucune feuille émise.
    expect(flattenComponentDef(selfRef, [selfRef])).toEqual([])
  })

  it('émet le sous-composant en feuille si aucune def catalogue', () => {
    const leaves = flattenComponentDef(
      { id: 'x', name: 'X', numberOfUnitsRecipe: 1, subComponents: [
        { id: 'orphan', itemType: 'Component', name: 'Orphelin', unit: 'l', numberOfUnits: 3 },
      ] },
      [], // pas de catalogue
    )
    expect(leaves).toEqual([{ id: 'orphan', sourceId: null, name: 'Orphelin', unit: 'l', qtyFactor: 3 }])
  })
})

describe('buildConsolidatedInventory — inventaire éclate le composant', () => {
  it('remplace « Pickles Auxerre » par ses ingrédients', () => {
    const result = buildConsolidatedInventory([dish], [dish], [], true, [pickleDef])
    const names = result.map((r) => r.name)
    expect(names).toContain('Badiane')
    expect(names).toContain('Canelle')
    expect(names).not.toContain('Pickles Auxerre')
  })

  it('émet une identité ingrédient joignable (marketPriceId)', () => {
    const result = buildConsolidatedInventory([dish], [dish], [], true, [pickleDef])
    const badiane = result.find((r) => r.name === 'Badiane')
    expect(badiane.id).toBe('mp-badiane')
  })
})

describe('expandMenuItemStock — restock éclate avec quantités BOM', () => {
  it('émet les ingrédients avec quantité = calculatedQuantity × qtyFactor', () => {
    // 10 plats × 2 unités pickles / 1 pièce recette = 20 unités pickles.
    // Badiane : 20 × 0.5 = 10 ; Canelle : 20 × 0.25 = 5.
    const rows = expandMenuItemStock('mi-burger', 10, 'Burger Auxerre', [dish], [pickleDef])
    const names = rows.map((r) => r.name)
    expect(names).toContain('Badiane')
    expect(names).toContain('Canelle')
    expect(names).not.toContain('Pickles Auxerre')
    expect(rows.find((r) => r.name === 'Badiane').totalQuantity).toBe(10)
    expect(rows.find((r) => r.name === 'Canelle').totalQuantity).toBe(5)
  })

  it('identité ingrédient identique à l’inventaire (jointure netting)', () => {
    const rows = expandMenuItemStock('mi-burger', 10, 'Burger Auxerre', [dish], [pickleDef])
    expect(rows.find((r) => r.name === 'Badiane').id).toBe('mp-badiane')
  })

  it('composant sans def catalogue → ligne composant inchangée (fallback)', () => {
    const rows = expandMenuItemStock('mi-burger', 10, 'Burger Auxerre', [dish], [])
    expect(rows.map((r) => r.name)).toContain('Pickles Auxerre')
  })
})
