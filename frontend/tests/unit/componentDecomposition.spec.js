/**
 * F6 — Éclatement ComponentDefinition → ingrédients feuilles (restock uniquement).
 * Décision 2026-07-18 : côté SPACE INVENTORY un composant (ex. Pickles Auxerre)
 * n'est PLUS éclaté — il reste une ligne comptable telle quelle. Le restock
 * (expandMenuItemStock) conserve l'éclatement BOM (« on ne commande pas un
 * composant »). ⚠️ Identités asymétriques inventaire⇄restock sur ces lignes
 * (netting — question posée dans QUESTIONS_A_BERTRAND).
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
    // BUG-292-01 : la feuille porte en plus `marketPriceId`/`supplierId`/
    // `supplierName` — sans eux, un ingrédient éclaté perd son fournisseur en
    // route et la feuille de course le range en « fournisseur inconnu ».
    expect(leaves).toEqual([
      {
        id: 'orphan',
        sourceId: null,
        name: 'Orphelin',
        unit: 'l',
        qtyFactor: 3,
        marketPriceId: null,
        supplierId: null,
        supplierName: null,
      },
    ])
  })

  it('BUG-292-01 — remonte marketPriceId et fournisseur de la matière achetée', () => {
    const leaves = flattenComponentDef(
      { id: 'x', name: 'X', numberOfUnitsRecipe: 2, subComponents: [
        { id: 'mp-ail', marketPriceId: 'mp-ail', supplierId: 'sup-1', supplierName: 'Metro',
          itemType: 'Ingredient', name: 'Ail', unit: 'kg', numberOfUnits: 1 },
      ] },
      [],
    )
    expect(leaves[0]).toMatchObject({
      id: 'mp-ail',
      marketPriceId: 'mp-ail',
      supplierId: 'sup-1',
      supplierName: 'Metro',
      qtyFactor: 0.5,
    })
  })
})

describe('buildConsolidatedInventory — inventaire garde le composant tel quel', () => {
  it('garde « Pickles Auxerre » en ligne comptable, sans ses ingrédients', () => {
    const result = buildConsolidatedInventory([dish], [dish], [], true, [pickleDef])
    const names = result.map((r) => r.name)
    expect(names).toContain('Pickles Auxerre')
    expect(names).not.toContain('Badiane')
    expect(names).not.toContain('Canelle')
  })

  it('BUG-292-01 — émet l’identité CATALOGUE, plus la PK de la ligne de recette', () => {
    // Avant : `c-pickles`, l'id de la ligne MenuItemComponent (unique par couple
    // menu item × article). Le réarmement, lui, émettait déjà `cmp-pickles` : les
    // deux écrans désignaient le même objet physique par deux clés différentes,
    // donc le netting comptage ⇄ réarmement ne joignait pas sur ces lignes.
    const result = buildConsolidatedInventory([dish], [dish], [], true, [pickleDef])
    const pickles = result.find((r) => r.name === 'Pickles Auxerre')
    expect(pickles.id).toBe('cmp-pickles')
  })

  it('BUG-292-01 — inventaire et réarmement désignent le composant par la MÊME clé', () => {
    // Le test qui garde la propriété, plutôt que sa valeur : c'est cette égalité
    // qui fait joindre le comptage et le réarmement.
    const inv = buildConsolidatedInventory([dish], [dish], [], true, [pickleDef])
    const restock = expandMenuItemStock('mi-burger', 10, 'Burger Auxerre', [dish], [pickleDef])
    const invId = inv.find((r) => r.name === 'Pickles Auxerre').id
    const restockId = restock.find((r) => r.name === 'Pickles Auxerre').id
    expect(invId).toBe(restockId)
  })
})

describe('expandMenuItemStock — le réarmement NE décompose PLUS un composant (BUG-292-01)', () => {
  // Renversement assumé de la règle. Jusqu'au 2026-08-04, le réarmement éclatait
  // « Pickles Auxerre » en Badiane + Canelle (« on ne commande pas un composant »),
  // pendant que l'inventaire le gardait entier : les deux ne joignaient plus.
  // Décision owner : c'est l'INVENTAIRE qui a raison — un composant arrive prêt de
  // la cuisine centrale, on le stocke, on le compte et on le réarme tel quel.
  // L'éclatement n'a pas disparu, il a été déplacé dans la FEUILLE DE COURSE
  // (bomPlanning), seul écran où l'on achète — cf. bomPlanningComponentExplosion.spec.js.

  it('garde « Pickles Auxerre » entier, sans jamais émettre son Badiane', () => {
    // 10 plats × 2 unités pickles / 1 pièce recette = 20 unités de pickles.
    const rows = expandMenuItemStock('mi-burger', 10, 'Burger Auxerre', [dish], [pickleDef])
    const names = rows.map((r) => r.name)
    expect(names).toContain('Pickles Auxerre')
    expect(names).not.toContain('Badiane')
    expect(names).not.toContain('Canelle')
    expect(rows.find((r) => r.name === 'Pickles Auxerre').totalQuantity).toBe(20)
  })

  it('émet l’identité CATALOGUE du composant — la même que l’inventaire', () => {
    // C'est la condition du netting comptage ⇄ réarmement : les deux écrans
    // doivent désigner le même objet physique par la même clé.
    const rows = expandMenuItemStock('mi-burger', 10, 'Burger Auxerre', [dish], [pickleDef])
    expect(rows.find((r) => r.name === 'Pickles Auxerre').id).toBe('cmp-pickles')
  })

  it('résultat identique avec ou sans catalogue de composants', () => {
    // Le catalogue ne sert plus à cette expansion : la sortie ne peut plus
    // dépendre de l'état d'hydratation des `subComponents`.
    const avec = expandMenuItemStock('mi-burger', 10, 'Burger Auxerre', [dish], [pickleDef])
    const sans = expandMenuItemStock('mi-burger', 10, 'Burger Auxerre', [dish], [])
    expect(sans).toEqual(avec)
    expect(sans.map((r) => r.name)).toContain('Pickles Auxerre')
  })
})
