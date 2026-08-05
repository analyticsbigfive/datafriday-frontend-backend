import { buildLiveInventoryChild, buildLiveInventoryRows, countCritical } from '@/utils/liveInventoryRows'

describe('buildLiveInventoryChild', () => {
  it("statut 'uninitialized' (gris, '—') quand aucun stock n'a jamais été fixé (totalLoose = 0)", () => {
    const child = buildLiveInventoryChild({ packedUnits: 0, looseUnits: 0, consumedLoose: 0 }, 'Badiane', 'k1')
    expect(child.gaugeStatus).toBe('uninitialized')
    expect(child.gaugeLabel).toBe('—')
    expect(child.gaugeLabelInside).toBe(false)
  })

  it("statut 'critical' (vrai signal) quand le stock est fixé mais épuisé par les ventes", () => {
    const child = buildLiveInventoryChild({ packedUnits: 0, looseUnits: 10, consumedLoose: 10 }, 'Coca', 'k2')
    expect(child.totalLoose).toBe(10)
    expect(child.remainingLoose).toBe(0)
    expect(child.gaugeStatus).toBe('critical')
    expect(child.gaugeLabel).toBe('0%')
  })

  it('applique la casse de pack (packedUnits × unitsPerPack + looseUnits)', () => {
    const child = buildLiveInventoryChild({ packedUnits: 2, looseUnits: 3, unitsPerPack: 24, consumedLoose: 5 }, 'Heineken', 'k3')
    expect(child.totalLoose).toBe(51)
    expect(child.remainingLoose).toBe(46)
  })

  it('affiche l\'unité passée par le référentiel', () => {
    const child = buildLiveInventoryChild({ packedUnits: 1, looseUnits: 0, unit: 'kg' }, 'Concombre', 'k4')
    expect(child.unit).toBe('kg')
  })
})

describe('countCritical', () => {
  it("ne compte que 'critical', pas 'uninitialized' (pas un vrai signal)", () => {
    const children = [
      buildLiveInventoryChild({ packedUnits: 0, looseUnits: 10, consumedLoose: 10 }, 'A', 'a'), // critical
      buildLiveInventoryChild({ packedUnits: 0, looseUnits: 0, consumedLoose: 0 }, 'B', 'b'), // uninitialized
      buildLiveInventoryChild({ packedUnits: 0, looseUnits: 10, consumedLoose: 0 }, 'C', 'c'), // good
    ]
    expect(countCritical(children)).toBe(1)
  })
})

describe('buildLiveInventoryRows', () => {
  const inv = {
    shops: [
      {
        shopId: 'shop-1',
        shopName: 'Bar Nord',
        items: [
          { itemKey: 'Coca-Cola', packedUnits: 0, looseUnits: 10, consumedLoose: 10 }, // critical
          { itemKey: 'Badiane', packedUnits: 0, looseUnits: 0, consumedLoose: 0 }, // uninitialized
          { itemKey: 'Eau', packedUnits: 0, looseUnits: 10, consumedLoose: 1 }, // good
        ],
      },
    ],
    items: [],
  }

  it('trie les enfants par criticité : critical > warning > uninitialized > good', () => {
    const rows = buildLiveInventoryRows(inv, 'shop', '')
    expect(rows[0].children.map((c) => c.label)).toEqual(['Coca-Cola', 'Badiane', 'Eau'])
  })

  it('filtre par recherche texte, insensible à la casse', () => {
    const rows = buildLiveInventoryRows(inv, 'shop', 'coca')
    expect(rows[0].children.map((c) => c.label)).toEqual(['Coca-Cola'])
  })

  it('retire un groupe dont aucun enfant ne matche la recherche', () => {
    const rows = buildLiveInventoryRows(inv, 'shop', 'inexistant')
    expect(rows).toEqual([])
  })

  it('sans recherche, garde les groupes même à enfants vides', () => {
    const rows = buildLiveInventoryRows({ shops: [{ shopId: 's', shopName: 'Vide', items: [] }], items: [] }, 'shop', '')
    expect(rows).toEqual([{ key: 'shop:s', label: 'Vide', children: [] }])
  })

  it('retourne un tableau vide sans données', () => {
    expect(buildLiveInventoryRows(null, 'shop', '')).toEqual([])
  })
})
