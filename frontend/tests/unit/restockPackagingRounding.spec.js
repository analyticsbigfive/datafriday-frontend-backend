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
  findStockReference,
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

/**
 * Réunion Bertrand 2026-08-19 — deux corrections de résolution :
 *  - E1 (viande tranchée) : purchaseUnitConversion du MarketPrice NICHÉ d'un
 *    ingrédient appliquée au calcul (405 pièces × 0,02 kg/pièce → 9 packs de
 *    1 kg, plus jamais « 405 packs de 1 kg ») ;
 *  - E2 (Coca 33cl) : quand la référence résolue ne porte AUCUN conditionnement
 *    exploitable, on continue sur les autres candidats (id puis nom) — le menu
 *    item homonyme porte la carte « Inventory Information ».
 */
describe('réunion 2026-08-19 — conversion nichée et continuation de porteur', () => {
  it('E1 : conversion du MarketPrice niché appliquée (405 pièces → 9 packs de 1 kg)', () => {
    const ingredients = [
      {
        id: 'ing-viande',
        name: 'Viande tranchée',
        recipeUnit: 'pc',
        marketPrice: {
          id: 'mp-viande',
          itemName: 'Viande tranchée',
          unit: 'kg',
          inventoryPackaging: 'Pack',
          packedUnits: 1, // pack de 1 kg
          purchaseUnitConversion: 0.02, // 0,02 kg par pièce
        },
      },
    ]
    const row = { itemId: 'ing-viande', itemName: 'Viande tranchée', unit: 'pc' }
    const packaging = computePackagingForQuantity(row, 405, ingredients)
    expect(packaging).not.toBeNull()
    // ceil((405 / 1) × 0,02) = ceil(8,1) = 9 packs de 1 kg.
    expect(packaging.packedCount).toBe(9)
    // L'inverse retombe dans l'unité de la ligne : 9 ÷ 0,02 = 450 pièces couvertes.
    expect(coveredQuantityForPackaging(packaging)).toBe(450)
  })

  it('E2 : ingrédient sans conditionnement → colisage emprunté au menu item homonyme', () => {
    const ingredients = [
      // Résolu par id : AUCUN champ de conditionnement exploitable.
      { id: 'ing-coca', name: 'Coca-Cola Sherry Can 33cl', unit: 'pc' },
    ]
    const menuItems = [
      // Carte « Inventory Information » du menu item homonyme : pack de 24.
      {
        id: 'mi-coca',
        name: 'Coca-Cola Sherry Can 33cl',
        unit: 'pc',
        inventoryPackaging: 'Pack',
        inventoryNumberOfUnits: 24,
      },
    ]
    const row = { itemId: 'ing-coca', itemName: 'Coca-Cola Sherry Can 33cl', unit: 'pc' }
    const packaging = computePackagingForQuantity(row, 74, ingredients, [], menuItems)
    expect(packaging).not.toBeNull()
    // La RÉFÉRENCE reste l'ingrédient (identité/fournisseur, BUG-299-01)…
    expect(packaging.source.id).toBe('ing-coca')
    // …mais le colisage vient du porteur : ceil(74 / 24) = 4 packs de 24.
    expect(packaging.packagingUnitNumber).toBe(24)
    expect(packaging.packedCount).toBe(4)
  })

  it('E2 non-régression BUG-299-01 : un homonyme placé plus tôt ne vole pas le colisage d’une référence qui en a', () => {
    const ingredients = [
      // Homonyme par NOM placé en tête de pool, conditionnement différent.
      { id: 'ing-beurre', name: 'Beurre', unit: 'kg', packagingType: 'Motte', packagingUnitNumber: 5, packagingUnit: 'kg' },
      // Référence réellement pointée par id, conditionnement présent.
      { id: 'ing-beurre-doux', name: 'Beurre doux motte', unit: 'kg', packagingType: 'Plaque', packagingUnitNumber: 2, packagingUnit: 'kg' },
    ]
    const row = { itemId: 'ing-beurre-doux', itemName: 'Beurre', unit: 'kg' }
    const packaging = computePackagingForQuantity(row, 3, ingredients)
    expect(packaging.source.id).toBe('ing-beurre-doux')
    expect(packaging.packagingType).toBe('Plaque')
    expect(packaging.packedCount).toBe(2)
  })

  it('E2 : conditionnement porté par la seule ligne Market Price (4e pool)', () => {
    // « Saucisse de Francfort » : ni l'ingrédient ni le menu item ne portent de
    // colisage — seule la ligne d'achat (Market Price) le connaît.
    const ingredients = [{ id: 'ing-sauc', name: 'Saucisse de Francfort', unit: 'pc' }]
    const marketPrices = [
      {
        id: 'mp-sauc',
        itemName: 'Saucisse de Francfort',
        unit: 'pc',
        inventoryPackaging: 'Carton',
        packedUnits: 28,
      },
    ]
    const row = { itemId: 'ing-sauc', itemName: 'Saucisse de Francfort', unit: 'pc' }
    const packaging = computePackagingForQuantity(row, 81, ingredients, [], [], marketPrices)
    expect(packaging).not.toBeNull()
    expect(packaging.packagingUnitNumber).toBe(28)
    // ceil(81 / 28) = 3 cartons.
    expect(packaging.packedCount).toBe(3)
  })

  it('référence d’achat : une ligne libre ne résout que si le pool marketPrices est passé (BUG-344-01)', () => {
    // « Coca-Cola Cherry - CAN 33CL » : réserve saisie dans le Builder, aucun
    // équivalent recette — seul le catalogue d'achat la connaît. C'est le
    // discriminant du fix marketPriceRefFor : 5 arguments résolvent, 4 non.
    const marketPrices = [
      { id: 'mp-coca-cherry', itemName: 'Coca-Cola Cherry - CAN 33CL', supplierItem: 'CCC_33CL_X24' },
    ]
    const row = { itemName: 'Coca-Cola Cherry - CAN 33CL', unit: 'pc' }
    expect(findStockReference(row, [], [], [])).toBeNull()
    const src = findStockReference(row, [], [], [], marketPrices)
    expect(src).not.toBeNull()
    expect(src.supplierItem).toBe('CCC_33CL_X24')
  })
})
