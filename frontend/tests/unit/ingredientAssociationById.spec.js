/**
 * BUG-299-01 — associations ingrédient/recette PAR ID, jamais par nom.
 *
 * Cas de référence du brief : « Beurre doux motte » (motte de 0,5 kg) vs
 * « Beurre » (plaquette de 0,25 kg). La ligne de recette référence l'ingrédient
 * par ID (sourceId/marketPriceId) mais porte un LIBELLÉ stale « Beurre » — le
 * piège exact : tout matching par nom reroute vers l'homonyme et remonte le
 * mauvais conditionnement.
 *
 * Couvre la chaîne complète du manque prédictif (predict) :
 *   expansion recette → besoin par PdV (buildStockRequirements) → résolution
 *   conditionnement (findStockReference / computePackagingForQuantity) →
 *   netting stock (consumeFromPool) → manque en mottes de 0,5 kg.
 */
import { expandMenuItem, buildComponentLookup } from '@/utils/menuItemExpansion'
import {
  buildStockRequirements,
  findStockReference,
  computePackagingForQuantity,
} from '@/utils/stockPlanning'
import { consumeFromPool, preparePool } from '@/utils/stockNetting'

// ── Référentiel ingrédients : l'homonyme piège est placé AVANT dans la liste ──
const beurrePlaquette = {
  id: 'ing-beurre',
  name: 'Beurre',
  packagingType: 'Plaquette',
  packagingUnitNumber: 0.25,
  packagingUnit: 'kg',
  purchaseUnitConversion: 1,
}
const beurreMotte = {
  id: 'ing-beurre-motte',
  marketPriceId: 'mp-beurre-motte',
  name: 'Beurre doux motte',
  packagingType: 'Motte',
  packagingUnitNumber: 0.5,
  packagingUnit: 'kg',
  purchaseUnitConversion: 1,
}
const ingredients = [beurrePlaquette, beurreMotte]

// Ligne de recette : ID correct (ing-beurre-motte), libellé stale « Beurre ».
const ligneBeurre = {
  id: 'l-beurre',
  sourceId: 'ing-beurre-motte',
  marketPriceId: 'mp-beurre-motte',
  itemType: 'Ingredient',
  name: 'Beurre',
  unit: 'kg',
  numberOfUnits: 0.01, // 10 g par crêpe
}

const crepe = {
  id: 'mi-crepe',
  name: 'Crêpe beurre sucre',
  readyForSale: 'No',
  comboItem: 'No',
  numberOfPiecesRecipe: 1,
  components: [ligneBeurre],
}

// Menu item homonyme (un « Beurre » vendu tel quel existe aussi au catalogue).
const beurreMenuItem = {
  id: 'mi-beurre',
  name: 'Beurre',
  readyForSale: 'Yes',
  comboItem: 'No',
  components: [],
}

const menuItems = [beurreMenuItem, crepe]

describe('BUG-299-01 — résolution de ligne de recette par ID, jamais par nom', () => {
  it("un ingrédient référencé par ID n'est pas requalifié en menu item homonyme (combo)", () => {
    const formule = {
      id: 'mi-formule',
      name: 'Formule Crêpe',
      readyForSale: 'No',
      comboItem: 'Yes',
      numberOfPiecesRecipe: 1,
      components: [ligneBeurre],
    }
    const catalogue = [...menuItems, formule]
    const rows = expandMenuItem({
      menuItemId: 'mi-formule',
      quantity: 100,
      rootMenuItemName: 'Formule Crêpe',
      menuItemsById: new Map(catalogue.map((mi) => [mi.id, mi])),
      lookup: buildComponentLookup(catalogue),
    })
    // Avant fix : le nom « Beurre » résolvait le MENU ITEM homonyme → ligne
    // « 100 pcs de Beurre » (article de vente). Attendu : matière, identité
    // catalogue (marketPriceId), 1 kg.
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('mp-beurre-motte')
    expect(rows[0].sourceId).toBe('ing-beurre-motte')
    expect(rows[0].unit).toBe('kg')
    expect(rows[0].totalQuantity).toBeCloseTo(1)
  })

  it('le repli nom reste actif pour une ligne legacy sans sourceId ni itemType', () => {
    const catalogue = [beurreMenuItem]
    const rows = expandMenuItem({
      menuItemId: 'mi-panier',
      quantity: 2,
      rootMenuItemName: 'Panier',
      menuItemsById: new Map([
        ...catalogue.map((mi) => [mi.id, mi]),
        [
          'mi-panier',
          {
            id: 'mi-panier',
            name: 'Panier',
            readyForSale: 'No',
            comboItem: 'Yes',
            numberOfPiecesRecipe: 1,
            components: [{ id: 'l-x', name: 'Beurre', unit: 'pcs', numberOfUnits: 1 }],
          },
        ],
      ]),
      lookup: buildComponentLookup(catalogue),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('mi-beurre')
    expect(rows[0].unit).toBe('pcs')
  })
})

describe('BUG-299-01 — besoin prédit (predict) au grain PdV × ingrédient', () => {
  const configuration = {
    floors: [{ elements: [{ id: 'shop-1', name: 'Bar Crêpes', type: 'shop' }] }],
  }
  const predictedRecords = [
    { shopId: 'shop-1', menuItemId: 'mi-crepe', itemName: 'Crêpe beurre sucre', totalQuantity: 100 },
  ]

  it('100 crêpes prédites → besoin 1 kg de beurre de motte, identité par ID', () => {
    const rows = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords,
      selectedMenuItems: { 'shop-1': ['mi-crepe'] },
    })
    expect(rows).toHaveLength(1)
    const besoin = rows[0]
    expect(besoin.shopId).toBe('shop-1')
    expect(besoin.itemId).toBe('mp-beurre-motte')
    expect(besoin.sourceId).toBe('ing-beurre-motte')
    expect(besoin.unit).toBe('kg')
    expect(besoin.totalQuantity).toBeCloseTo(1)
  })
})

describe('BUG-299-01 — conditionnement résolu par ID (« beurre de motte 0,5 kg »)', () => {
  // Ligne de besoin telle que produite par l'expansion : ids corrects, libellé stale.
  const besoin = {
    itemId: 'mp-beurre-motte',
    sourceId: 'ing-beurre-motte',
    itemName: 'Beurre',
    unit: 'kg',
  }

  it("findStockReference retourne l'ingrédient référencé, pas l'homonyme placé avant", () => {
    expect(findStockReference(besoin, ingredients, [], [])).toBe(beurreMotte)
  })

  it('le repli nom ne joue que si aucun ID ne résout', () => {
    expect(findStockReference({ itemName: 'beurre' }, ingredients, [], [])).toBe(beurrePlaquette)
  })

  it('1 kg de besoin → 2 mottes de 0,5 kg (jamais 4 plaquettes de 0,25)', () => {
    const packaging = computePackagingForQuantity(besoin, 1, ingredients, [], [])
    expect(packaging).not.toBeNull()
    expect(packaging.source).toBe(beurreMotte)
    expect(packaging.packagingType).toBe('Motte')
    expect(packaging.packagingUnitNumber).toBe(0.5)
    expect(packaging.packedCount).toBe(2)
    expect(packaging.looseQty).toBeCloseTo(1)
  })
})

describe('BUG-299-01 — netting : deux articles identifiés homonymes ne se nettent pas', () => {
  it("le stock d'un « Beurre » homonyme ne réduit pas le besoin du beurre de motte", () => {
    const pool = preparePool([
      { itemId: 'ing-beurre', name: 'Beurre', unit: 'kg', qty: 10 },
    ])
    const cut = consumeFromPool(
      { itemId: 'ing-beurre-motte', itemName: 'Beurre', unit: 'kg' },
      pool,
    )
    expect(cut).toBe(0)
    expect(pool[0].matched).toBe(false)
  })

  it('le repli nom reste actif quand une entrée de stock legacy est sans id', () => {
    const pool = preparePool([{ name: 'Beurre doux motte', unit: 'kg', qty: 0.4 }])
    const cut = consumeFromPool(
      { itemId: 'ing-beurre-motte', itemName: 'Beurre doux motte', unit: 'kg' },
      pool,
    )
    expect(cut).toBeCloseTo(0.4)
  })

  it('bout en bout : besoin 1 kg, 0,4 kg en stock → manque 0,6 kg → 2 mottes', () => {
    const pool = preparePool([
      { itemId: 'ing-beurre', name: 'Beurre', unit: 'kg', qty: 10 }, // homonyme, ignoré
      { itemId: 'ing-beurre-motte', name: 'Beurre doux motte', unit: 'kg', qty: 0.4 },
    ])
    const besoin = { itemId: 'mp-beurre-motte', sourceId: 'ing-beurre-motte', itemName: 'Beurre' }
    const enStock = consumeFromPool(besoin, pool)
    expect(enStock).toBeCloseTo(0.4)
    const manque = Math.max(0, 1 - enStock)
    expect(manque).toBeCloseTo(0.6)
    const packaging = computePackagingForQuantity(besoin, manque, ingredients, [], [])
    expect(packaging.source).toBe(beurreMotte)
    expect(packaging.packedCount).toBe(2) // ceil(0,6 / 0,5) — mottes de 0,5 kg
  })
})
