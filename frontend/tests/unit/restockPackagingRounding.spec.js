/**
 * BUG-295-01 — le réarmement doit suggérer des unités d'inventaire ENTIÈRES,
 * jamais une quantité fractionnée (0,7 kg alors que l'article est conditionné
 * en paquets de 500 g → l'outil doit proposer 2 paquets, soit 1 kg).
 *
 * La règle vit dans deux utils purs de stockPlanning :
 *  - computePackagingForQuantity : packedCount = ceil((qty / pun) × puc),
 *    appliqué sur le MANQUE (gap), pas sur la cible ;
 *  - coveredQuantityForPackaging : quantité couverte par ces colis entiers,
 *    reconvertie dans l'unité de la ligne (packedCount × pun ÷ puc).
 */
import {
  computePackagingForQuantity,
  coveredQuantityForPackaging,
} from '@/utils/stockPlanning'

// Ingrédient conditionné en paquets de 0,5 kg (carte « Inventory Information »).
const ingredients = [
  {
    id: 'ing-farine',
    name: 'Farine T55',
    unit: 'kg',
    packagingType: 'Paquet',
    packagingUnitNumber: 0.5,
    packagingUnit: 'kg',
  },
]

const row = { itemId: 'ing-farine', itemName: 'Farine T55', unit: 'kg' }

describe('BUG-295-01 — réarmement en unités d’inventaire complètes', () => {
  it('0,7 kg en paquets de 0,5 kg → 2 paquets couvrant 1 kg', () => {
    const packaging = computePackagingForQuantity(row, 0.7, ingredients)
    expect(packaging.packedCount).toBe(2)
    expect(coveredQuantityForPackaging(packaging)).toBe(1)
  })

  it('gap nul → 0 colis, 0 couvert (la ligne sort de la liste)', () => {
    const packaging = computePackagingForQuantity(row, 0, ingredients)
    expect(packaging.packedCount).toBe(0)
    expect(coveredQuantityForPackaging(packaging)).toBe(0)
  })

  it('gap multiple exact du colis → pas de sur-arrondi', () => {
    const packaging = computePackagingForQuantity(row, 1.5, ingredients)
    expect(packaging.packedCount).toBe(3)
    expect(coveredQuantityForPackaging(packaging)).toBe(1.5)
  })

  it('purchaseUnitConversion ≠ 1 : couverture reconvertie dans l’unité de ligne', () => {
    // Ligne en litres, colis exprimé en bouteilles : 2 bouteilles par litre.
    const bottled = [
      {
        id: 'ing-sirop',
        name: 'Sirop',
        unit: 'L',
        packagingType: 'Carton',
        packagingUnitNumber: 6, // 6 bouteilles par carton
        packagingUnit: 'bouteille',
        purchaseUnitConversion: 2, // 1 L = 2 bouteilles
      },
    ]
    const sirop = { itemId: 'ing-sirop', itemName: 'Sirop', unit: 'L' }
    // Besoin 4 L = 8 bouteilles → 2 cartons (12 bouteilles) → 6 L couverts.
    const packaging = computePackagingForQuantity(sirop, 4, bottled)
    expect(packaging.packedCount).toBe(2)
    expect(coveredQuantityForPackaging(packaging)).toBe(6)
  })

  it('packaging figé (snapshot, conversion à plat, sans source) accepté', () => {
    const frozen = {
      packedCount: 2,
      packagingUnitNumber: 0.5,
      packagingUnit: 'kg',
      packagingType: 'Paquet',
      looseQty: 1,
      purchaseUnitConversion: 1,
    }
    expect(coveredQuantityForPackaging(frozen)).toBe(1)
  })

  it('sans packaging ou sans taille de colis → null (repli arrondi historique)', () => {
    expect(coveredQuantityForPackaging(null)).toBeNull()
    expect(coveredQuantityForPackaging({ packedCount: 2 })).toBeNull()
  })

  it('ingrédient réel (/ingredients) : conditionnement lu dans le MarketPrice niché', () => {
    // Shape backend : aucun champ conditionnement à plat sur l'ingrédient —
    // inventoryPackaging + packedUnits (qté/paquet du drawer) vivent dans
    // `marketPrice`. Avant le fix, packaging = null → réarmement fractionné.
    const realIngredients = [
      {
        id: 'ing-real',
        name: 'Sucre',
        recipeUnit: 'kg',
        purchaseUnit: 'kg',
        marketPrice: {
          id: 'mp-sucre',
          itemName: 'Sucre',
          unit: 'kg',
          inventoryPackaging: 'Paquet',
          packedUnits: 0.5,
          numberOfUnits: 20,
        },
      },
    ]
    const sucre = { itemId: 'ing-real', itemName: 'Sucre', unit: 'kg' }
    const packaging = computePackagingForQuantity(sucre, 0.7, realIngredients)
    expect(packaging).not.toBeNull()
    expect(packaging.packagingType).toBe('Paquet')
    expect(packaging.packagingUnitNumber).toBe(0.5)
    expect(packaging.packedCount).toBe(2)
    expect(coveredQuantityForPackaging(packaging)).toBe(1)
  })

  it('composant : libellé de stockage à plat (inventoryPackaging) + packedUnits', () => {
    const components = [
      {
        id: 'comp-sauce',
        name: 'Sauce pickle',
        unit: 'L',
        inventoryPackaging: 'Bag',
        packedUnits: 2,
      },
    ]
    const sauce = { itemId: 'comp-sauce', itemName: 'Sauce pickle', unit: 'L' }
    const packaging = computePackagingForQuantity(sauce, 3, [], components)
    expect(packaging.packagingType).toBe('Bag')
    expect(packaging.packedCount).toBe(2)
    expect(coveredQuantityForPackaging(packaging)).toBe(4)
  })
})
