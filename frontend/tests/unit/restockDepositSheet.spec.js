// Feuille « à déposer » de Logistic (utils/restockDepositSheet.js) : corrections
// manuelles appliquées, lignes cochées « réarmé » retirées, regroupement par article.

import { buildDepositLines, groupDepositLinesByItem, pendingDepositGroups, depositPrefill, packSizeLookup } from '@/utils/restockDepositSheet'

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

describe('circuit : receivedFrom conservé jusqu\'au regroupement', () => {
  const from = (shopId, packs, remainingFromLogistic = true) => ({ shopId, shopName: `PDV ${shopId}`, packs, quantity: packs * 30, remainingFromLogistic })

  it('buildDepositLines garde received / receivedFrom / remainingFromLogistic, y compris après correction', () => {
    const plan = {
      restockLines: [line({ rowKey: 'a', received: 60, ceded: 0, fromStorage: 0, receivedFrom: [from('s9', 2)], remainingFromLogistic: true })],
      lineOverrides: { a: 90 },
    }
    const [l] = buildDepositLines(plan)
    expect(l.restockQuantity).toBe(90)
    expect(l.received).toBe(60)
    expect(l.receivedFrom).toEqual([from('s9', 2)])
    expect(l.remainingFromLogistic).toBe(true)
  })

  it('groupDepositLinesByItem porte receivedFrom sur la ligne du PDV receveur', () => {
    const [g] = groupDepositLinesByItem([line({ rowKey: 'a', receivedFrom: [from('s9', 2)] })])
    expect(g.rows[0].receivedFrom).toEqual([from('s9', 2)])
  })

  it('fusionne les cédants quand la même destination est sur 2 feuilles', () => {
    const [g] = groupDepositLinesByItem([
      line({ rowKey: 'a', receivedFrom: [from('s9', 1), from('s8', 1)] }),
      line({ rowKey: 'b', receivedFrom: [from('s9', 2, false)] }),
    ])
    const merged = g.rows[0].receivedFrom
    expect(merged.map((e) => [e.shopId, e.packs, e.remainingFromLogistic])).toEqual([['s9', 3, false], ['s8', 1, true]])
  })

  it('ancien plan sans receivedFrom : aucun champ ajouté', () => {
    const [g] = groupDepositLinesByItem([line({ rowKey: 'a' })])
    expect('receivedFrom' in g.rows[0]).toBe(false)
  })
})

describe('keepCovered (feuille affichée en Ventilation)', () => {
  const plan = { restockLines: [line({ rowKey: 'a', restockQuantity: 12, packaging: packaging(1, 12) })] }
  const deposit = (loose) => [{ elementId: 's1', itemKey: 'Bonbons', packed: 0, loose }]

  it('retire la ligne entièrement déposée par défaut (reste à déposer)', () => {
    expect(buildDepositLines(plan, deposit(12))).toEqual([])
  })

  it('la garde cochée avec sa quantité prévue avec keepCovered', () => {
    const lines = buildDepositLines(plan, deposit(12), { keepCovered: true })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ covered: true, restockQuantity: 12, depositedQuantity: 12 })
  })

  it('une ligne partiellement déposée garde son reste et n\'est pas couverte', () => {
    const [l] = buildDepositLines(plan, deposit(5), { keepCovered: true })
    expect(l.restockQuantity).toBe(7)
    expect(l.covered).toBeUndefined()
  })

  it('la ligne du groupe est couverte et ne compte pas dans les totaux', () => {
    const lines = buildDepositLines({ restockLines: [
      line({ rowKey: 'a', restockQuantity: 12, packaging: packaging(1, 12) }),
      line({ rowKey: 'b', shopId: 's2', shopName: 'Loire 13', restockQuantity: 24, packaging: packaging(2, 12) }),
    ] }, deposit(12), { keepCovered: true })
    const [group] = groupDepositLinesByItem(lines)
    expect(group.rows.find((r) => r.shopId === 's1').covered).toBe(true)
    expect(group.rows.find((r) => r.shopId === 's2').covered).toBe(false)
    expect(group.totalQuantity).toBe(24)
    expect(pendingDepositGroups([group])[0].rows.map((r) => r.shopId)).toEqual(['s2'])
  })

  it('pendingDepositGroups retire un groupe entièrement déposé', () => {
    const [group] = groupDepositLinesByItem(buildDepositLines(plan, deposit(12), { keepCovered: true }))
    expect(pendingDepositGroups([group])).toEqual([])
  })
})
