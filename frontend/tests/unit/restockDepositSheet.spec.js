// Feuille « à déposer » de Logistic (utils/restockDepositSheet.js) : corrections
// manuelles appliquées, lignes cochées « réarmé » retirées, regroupement par article.

import { buildDepositLines, groupDepositLinesByItem, depositPrefill, packSizeLookup } from '@/utils/restockDepositSheet'

const packaging = (packedCount, packagingUnitNumber = 30) => ({
  packedCount,
  packagingType: 'Carton',
  packagingUnitNumber,
  packagingUnit: 'Pc',
  looseQty: packedCount * packagingUnitNumber,
  purchaseUnitConversion: 1,
})

const line = (over) => ({
  rowKey: 'r',
  shopId: 's1',
  shopName: 'Océane 11',
  itemKey: 'bonbons',
  itemName: 'Bonbons',
  unit: 'Pc',
  targetQuantity: 0,
  remainingQuantity: 0,
  restockQuantity: 60,
  packaging: packaging(2),
  ...over,
})

describe('buildDepositLines', () => {
  it('renvoie une liste vide sans feuille', () => {
    expect(buildDepositLines(null)).toEqual([])
  })

  it('retire les lignes à 0 et celles cochées « réarmé »', () => {
    const plan = {
      restockLines: [
        line({ rowKey: 'a' }),
        line({ rowKey: 'b', shopId: 's2', restockQuantity: 0, packaging: packaging(0) }),
        line({ rowKey: 'c', shopId: 's3' }),
      ],
      restockedRows: { c: true },
    }
    expect(buildDepositLines(plan).map((l) => l.rowKey)).toEqual(['a'])
  })

  it('applique les corrections manuelles de la feuille', () => {
    const plan = {
      restockLines: [line({ rowKey: 'a' }), line({ rowKey: 'b', shopId: 's2' })],
      lineOverrides: { a: 90, b: 0 },
    }
    const lines = buildDepositLines(plan)
    expect(lines).toHaveLength(1)
    expect(lines[0].restockQuantity).toBe(90)
    expect(lines[0].packaging.packedCount).toBe(3)
  })
})

describe('buildDepositLines avec dépôts « Ventilation »', () => {
  const plan = { restockLines: [line({ rowKey: 'a', restockQuantity: 90, packaging: packaging(3) })] }

  it('retire une ligne entièrement déposée (packs convertis par unitsPerPack)', () => {
    const deposits = [{ elementId: 's1', itemKey: 'BONBONS ', packed: 3, loose: 0, unitsPerPack: 30 }]
    expect(buildDepositLines(plan, deposits)).toEqual([])
  })

  it('laisse le reste après un dépôt partiel et recalcule les packs', () => {
    const deposits = [{ elementId: 's1', itemKey: 'Bonbons', packed: 1, loose: 5 }]
    const [rest] = buildDepositLines(plan, deposits)
    expect(rest.restockQuantity).toBe(55)
    expect(rest.depositedQuantity).toBe(35)
    expect(rest.packaging.packedCount).toBe(2)
  })

  it("n'impute pas un dépôt d'une autre destination", () => {
    const deposits = [{ elementId: 's2', itemKey: 'Bonbons', packed: 3, loose: 0 }]
    expect(buildDepositLines(plan, deposits)[0].restockQuantity).toBe(90)
  })

  it('reporte le surplus de dépôt sur la ligne suivante du même couple', () => {
    const twoLines = {
      restockLines: [
        line({ rowKey: 'a', restockQuantity: 30, packaging: packaging(1) }),
        line({ rowKey: 'b', restockQuantity: 60, packaging: packaging(2) }),
      ],
    }
    const deposits = [{ elementId: 's1', itemKey: 'Bonbons', packed: 0, loose: 45 }]
    const lines = buildDepositLines(twoLines, deposits)
    expect(lines.map((l) => [l.rowKey, l.restockQuantity])).toEqual([['b', 45]])
  })
})

describe('groupDepositLinesByItem', () => {
  it('regroupe par article, trie et totalise les packs', () => {
    const groups = groupDepositLinesByItem([
      line({ rowKey: 'a', shopId: 's2', shopName: 'Prési 1' }),
      line({ rowKey: 'b', shopId: 's1', shopName: 'Food Court 3', restockQuantity: 30, packaging: packaging(1) }),
      line({ rowKey: 'c', itemKey: 'adel', itemName: 'Adelshoffen 20L', unit: 'L', restockQuantity: 40, packaging: null }),
    ])
    expect(groups.map((g) => g.itemName)).toEqual(['Adelshoffen 20L', 'Bonbons'])
    const bonbons = groups[1]
    expect(bonbons.rows.map((r) => r.shopName)).toEqual(['Food Court 3', 'Prési 1'])
    expect(bonbons.totalQuantity).toBe(90)
    expect(bonbons.totalPacks).toBe(3)
    expect(bonbons.packagingType).toBe('Carton')
    expect(groups[0].totalPacks).toBeNull()
    expect(groups[0].rows[0].packs).toBeNull()
  })

  it("ne totalise pas les packs si une ligne n'a pas de conditionnement", () => {
    const groups = groupDepositLinesByItem([
      line({ rowKey: 'a' }),
      line({ rowKey: 'b', shopId: 's2', packaging: null }),
    ])
    expect(groups[0].totalPacks).toBeNull()
    expect(groups[0].totalQuantity).toBe(120)
  })
})

describe('pré-remplissage du dépôt (même règle Logistique et logisticien)', () => {
  it('convertit le reste avec la taille de pack Logistic quand elle est connue', () => {
    // Feuille en cartons de 24, Logistic en packs de 12 : 48 unités = 4 packs, pas 2.
    expect(depositPrefill({ quantity: 48, packs: 2 }, 12, 24)).toEqual({ packs: 4, unitsPerPack: 12 })
  })

  it('reprend les packs du réarmement sans taille Logistic', () => {
    expect(depositPrefill({ quantity: 48, packs: 2 }, null, 24)).toEqual({ packs: 2, unitsPerPack: 24 })
    expect(depositPrefill({ quantity: 5, packs: null }, null, null)).toEqual({ packs: null, unitsPerPack: null })
  })

  it('retrouve la taille de pack par destination et nom normalisé', () => {
    const lookup = packSizeLookup([{ elementId: 's1', itemName: 'Bière Pression', unitsPerPack: 30 }])
    expect(lookup('s1', ' biere pression')).toBe(30)
    expect(lookup('s2', 'Bière Pression')).toBeNull()
  })
})
