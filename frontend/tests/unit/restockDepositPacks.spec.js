/**
 * « À déposer » en NOMBRE DE PAQUETS (réarmement, étape 2).
 *
 * Le calcul reste en unités de recette partout (netting, feuille de course) :
 * seule la couche d'affichage — et l'édition d'un plan chargé — travaille en
 * colis. Les deux utils testés ici portent cette conversion :
 *  - packSizeForPackaging : taille d'UN colis dans l'unité de la ligne, donc
 *    avec la conversion d'unité d'achat (purchaseUnitConversion) ;
 *  - packCountForQuantity : nombre de colis entiers couvrant une quantité.
 */
import {
  computePackagingForQuantity,
  coveredQuantityForPackaging,
  packSizeForPackaging,
  packCountForQuantity,
  pluralizePackLabel,
  isMeasureSymbol,
} from '@/utils/stockPlanning'

// Ingrédient conditionné en paquets de 0,5 kg (même shape que BUG-295-01).
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

describe('packSizeForPackaging', () => {
  it('taille d’un colis = quantité couverte par un seul colis', () => {
    const packaging = computePackagingForQuantity(row, 1.4, ingredients)
    expect(packSizeForPackaging(packaging)).toBeCloseTo(0.5)
  })

  it('purchaseUnitConversion ≠ 1 : taille reconvertie dans l’unité de ligne', () => {
    // 1 carton = 6 bouteilles, 1 L = 2 bouteilles → 1 carton = 3 L.
    const frozen = {
      packedCount: 2,
      packagingUnitNumber: 6,
      packagingUnit: 'bouteille',
      packagingType: 'Carton',
      purchaseUnitConversion: 2,
    }
    expect(packSizeForPackaging(frozen)).toBeCloseTo(3)
  })

  it('sans packaging ou sans taille de colis → null (affichage en unités)', () => {
    expect(packSizeForPackaging(null)).toBeNull()
    expect(packSizeForPackaging({ packedCount: 2 })).toBeNull()
    expect(packSizeForPackaging({ packedCount: 2, packagingUnitNumber: 0 })).toBeNull()
  })
})

describe('packCountForQuantity — « à déposer » en colis', () => {
  it('cas fiche : 1,5 kg déposés en paquets de 0,5 kg → 3 paquets', () => {
    const packaging = computePackagingForQuantity(row, 1.4, ingredients)
    const deposited = coveredQuantityForPackaging(packaging) // 1,5 kg
    expect(packCountForQuantity(deposited, packaging)).toBe(3)
  })

  it('le bruit flottant ne fait pas monter d’un colis de trop', () => {
    // 1,5 / 0,5 vaut 2,9999999999999996 en flottant : sans epsilon → 4 paquets.
    const packaging = { packedCount: 3, packagingUnitNumber: 0.5, purchaseUnitConversion: 1 }
    expect(packCountForQuantity(1.5, packaging)).toBe(3)
    expect(packCountForQuantity(0.7, packaging)).toBe(2)
  })

  it('quantité nulle ou non numérique → 0 paquet', () => {
    const packaging = { packedCount: 1, packagingUnitNumber: 0.5, purchaseUnitConversion: 1 }
    expect(packCountForQuantity(0, packaging)).toBe(0)
    expect(packCountForQuantity(null, packaging)).toBe(0)
    expect(packCountForQuantity('abc', packaging)).toBe(0)
    // Plancher 0 explicite : Math.ceil(0 − epsilon) vaut -0, qui s'afficherait
    // « -0 paquet ». Object.is distingue les deux, pas toBeCloseTo.
    expect(Object.is(packCountForQuantity(0, packaging), -0)).toBe(false)
  })

  it('sans conditionnement → null : la cellule reste en unités de recette', () => {
    expect(packCountForQuantity(1.5, null)).toBeNull()
    expect(packCountForQuantity(1.5, { packedCount: 3 })).toBeNull()
  })

  it('aller-retour paquets → unités : la saisie corrigée reste sur des colis', () => {
    // Correction terrain « 4 paquets » sur un plan chargé : l'override stocké
    // vaut 4 × 0,5 kg = 2 kg, et se relit bien comme 4 paquets.
    const packaging = { packedCount: 3, packagingUnitNumber: 0.5, purchaseUnitConversion: 1 }
    const packSize = packSizeForPackaging(packaging)
    const storedUnits = 4 * packSize
    expect(storedUnits).toBeCloseTo(2)
    expect(packCountForQuantity(storedUnits, packaging)).toBe(4)
  })
})

describe('pluralizePackLabel — accord du conditionnement', () => {
  it('accorde le type de colis à partir de 2', () => {
    expect(pluralizePackLabel('Carton', 3)).toBe('Cartons')
    expect(pluralizePackLabel('Sac', 2)).toBe('Sacs')
    expect(pluralizePackLabel('bouteille', 6)).toBe('bouteilles')
  })

  it('reste au singulier en dessous de 2 (0 et 1 compris)', () => {
    expect(pluralizePackLabel('Carton', 1)).toBe('Carton')
    expect(pluralizePackLabel('Carton', 0)).toBe('Carton')
    expect(pluralizePackLabel('Carton', null)).toBe('Carton')
  })

  it('libellé déjà au pluriel ou invariable : pas de double -s', () => {
    expect(pluralizePackLabel('Cartons', 3)).toBe('Cartons')
    expect(pluralizePackLabel('Colis', 4)).toBe('Colis')
    expect(pluralizePackLabel('Choix', 2)).toBe('Choix')
  })

  it('pluriels irréguliers du français laissés tels quels', () => {
    // « Bocal » → « Bocaux », pas « Bocals » : on ne fabrique pas le pluriel.
    expect(pluralizePackLabel('Bocal', 3)).toBe('Bocal')
    expect(pluralizePackLabel('Bail', 2)).toBe('Bail')
  })

  it('symboles de mesure invariables (« 6 kg », jamais « 6 kgs »)', () => {
    expect(pluralizePackLabel('kg', 6)).toBe('kg')
    expect(pluralizePackLabel('L', 3)).toBe('L')
    expect(pluralizePackLabel('cl', 50)).toBe('cl')
  })

  it('libellé vide ou absent → chaîne vide, pas « undefineds »', () => {
    expect(pluralizePackLabel(null, 3)).toBe('')
    expect(pluralizePackLabel('', 3)).toBe('')
    expect(pluralizePackLabel('   ', 3)).toBe('')
  })
})

describe('isMeasureSymbol', () => {
  it('distingue symbole de mesure et contenant nommé', () => {
    expect(isMeasureSymbol('kg')).toBe(true)
    expect(isMeasureSymbol('L')).toBe(true)
    expect(isMeasureSymbol('pcs')).toBe(true)
    expect(isMeasureSymbol('bouteille')).toBe(false)
    expect(isMeasureSymbol('Carton')).toBe(false)
  })

  it('unité absente traitée comme invariable (rien à accorder)', () => {
    expect(isMeasureSymbol('')).toBe(true)
    expect(isMeasureSymbol(null)).toBe(true)
  })
})

/**
 * Total de paquets d'un GROUPE article (réunion Bertrand 2026-08-19 :
 * « Blumberger 50 + 27 → 77 packs »). La règle est une somme des arrondis PAR
 * LIGNE — on dépose des colis entiers par PdV — jamais l'arrondi de la somme.
 * `groupPackTotal` (SpaceRestockView) n'est que cette somme sur
 * packCountForQuantity ; c'est la propriété qu'on fige ici.
 */
describe('total de paquets par groupe (somme des arrondis par ligne)', () => {
  const packaging = {
    packagingType: 'Pack',
    packagingUnitNumber: 4,
    packagingUnit: 'pc',
  }

  it('50 + 27 packs sur deux PdV → 77', () => {
    const rows = [200, 108] // unités : 200/4 = 50 packs, 108/4 = 27 packs
    const total = rows.reduce((sum, qty) => sum + packCountForQuantity(qty, packaging), 0)
    expect(total).toBe(77)
  })

  it('somme des arrondis, pas arrondi de la somme (2×1,5 colis → 4, pas 3)', () => {
    const rows = [6, 6] // 6/4 = 1,5 → 2 colis par PdV
    const perRow = rows.map((qty) => packCountForQuantity(qty, packaging))
    expect(perRow).toEqual([2, 2])
    const total = perRow.reduce((a, b) => a + b, 0)
    const ceilOfSum = Math.ceil((6 + 6) / 4)
    expect(total).toBe(4)
    expect(ceilOfSum).toBe(3) // le piège qu'on refuse
  })

  it('override de plan chargé : le total suit la quantité éditée, pas la calculée', () => {
    // effectiveRestockQuantity (SpaceRestockView) : lineOverrides[rowKey] ?? restockQuantity.
    // L'utilisateur corrige le PdV A de 200 unités (50 packs) à 120 (30 packs) :
    // le total de groupe doit lire l'override, sinon il contredit le champ édité.
    const rows = [
      { rowKey: 'pdv-a', restockQuantity: 200 },
      { rowKey: 'pdv-b', restockQuantity: 108 },
    ]
    const lineOverrides = { 'pdv-a': 120 }
    const effective = (row) => lineOverrides[row.rowKey] ?? row.restockQuantity
    const total = rows.reduce(
      (sum, row) => sum + packCountForQuantity(effective(row), packaging),
      0
    )
    expect(total).toBe(30 + 27) // 57, plus 77
  })
})
