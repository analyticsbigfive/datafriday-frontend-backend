import { buildLiveInventoryChild, buildLiveInventoryRows, countByStatus, countCritical, countGlobalByStatus } from '@/utils/liveInventoryRows'

describe('buildLiveInventoryChild', () => {
  it("statut 'uninitialized' (gris, '—') quand aucun stock n'a jamais été fixé (totalLoose = 0)", () => {
    const child = buildLiveInventoryChild({ packedUnits: 0, looseUnits: 0, consumedLoose: 0 }, 'Badiane', 'k1')
    expect(child.gaugeStatus).toBe('uninitialized')
    expect(child.gaugeLabel).toBe('—')
    expect(child.gaugeLabelInside).toBe(false)
  })

  it("statut 'critical' (rupture réelle) quand le stock est fixé mais épuisé par les ventes", () => {
    const child = buildLiveInventoryChild({ packedUnits: 0, looseUnits: 10, consumedLoose: 10 }, 'Coca', 'k2')
    expect(child.totalLoose).toBe(10)
    expect(child.remainingLoose).toBe(0)
    expect(child.gaugeStatus).toBe('critical')
    expect(child.gaugeLabel).toBe('0%')
  })

  it("statut 'warning' (stock bas, pas encore une rupture) entre 20% et 50%", () => {
    const child = buildLiveInventoryChild({ packedUnits: 0, looseUnits: 10, consumedLoose: 7 }, 'Chips', 'k5')
    expect(child.gaugePercent).toBe(30)
    expect(child.gaugeStatus).toBe('warning')
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

describe('countByStatus / countCritical', () => {
  const children = [
    buildLiveInventoryChild({ packedUnits: 0, looseUnits: 10, consumedLoose: 10 }, 'A', 'a'), // critical
    buildLiveInventoryChild({ packedUnits: 0, looseUnits: 10, consumedLoose: 7 }, 'B', 'b'), // warning
    buildLiveInventoryChild({ packedUnits: 0, looseUnits: 0, consumedLoose: 0 }, 'C', 'c'), // uninitialized
    buildLiveInventoryChild({ packedUnits: 0, looseUnits: 10, consumedLoose: 0 }, 'D', 'd'), // good
  ]

  it("countByStatus('critical') et countByStatus('warning') sont DISTINCTS — jamais confondus", () => {
    expect(countByStatus(children, 'critical')).toBe(1)
    expect(countByStatus(children, 'warning')).toBe(1)
  })

  it('countCritical (alias) ne compte que critical', () => {
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
          { itemKey: 'Coca-Cola', packedUnits: 0, looseUnits: 10, consumedLoose: 10 }, // critical (0%)
          { itemKey: 'Chips', packedUnits: 0, looseUnits: 10, consumedLoose: 7 }, // warning (30%)
          { itemKey: 'Badiane', packedUnits: 0, looseUnits: 0, consumedLoose: 0 }, // uninitialized
          { itemKey: 'Eau', packedUnits: 0, looseUnits: 10, consumedLoose: 1 }, // good (90%)
        ],
      },
      {
        shopId: 'shop-2',
        shopName: 'Bar Sud',
        items: [
          { itemKey: 'Eau', packedUnits: 0, looseUnits: 10, consumedLoose: 0 }, // good (100%)
        ],
      },
    ],
    items: [],
  }

  it('trie les enfants par criticité : critical > warning > uninitialized > good', () => {
    const rows = buildLiveInventoryRows(inv, 'shop', '')
    expect(rows[0].children.map((c) => c.label)).toEqual(['Coca-Cola', 'Chips', 'Badiane', 'Eau'])
  })

  it('filtre par recherche texte, insensible à la casse', () => {
    const rows = buildLiveInventoryRows(inv, 'shop', 'coca')
    expect(rows[0].children.map((c) => c.label)).toEqual(['Coca-Cola'])
  })

  it('retire un groupe dont aucun enfant ne matche la recherche', () => {
    const rows = buildLiveInventoryRows(inv, 'shop', 'inexistant')
    expect(rows).toEqual([])
  })

  it('sans recherche ni filtre statut, garde les groupes même à enfants vides', () => {
    const rows = buildLiveInventoryRows({ shops: [{ shopId: 's', shopName: 'Vide', items: [] }], items: [] }, 'shop', '')
    expect(rows).toEqual([{ key: 'shop:s', label: 'Vide', children: [] }])
  })

  it('retourne un tableau vide sans données', () => {
    expect(buildLiveInventoryRows(null, 'shop', '')).toEqual([])
  })

  it("statusFilters=['critical'] ne garde QUE les ruptures réelles — pas les stocks bas (warning)", () => {
    const rows = buildLiveInventoryRows(inv, 'shop', '', ['critical'])
    expect(rows[0].children.map((c) => c.label)).toEqual(['Coca-Cola'])
  })

  it("statusFilters=['warning'] ne garde QUE les stocks bas — pas les ruptures (critical)", () => {
    const rows = buildLiveInventoryRows(inv, 'shop', '', ['warning'])
    expect(rows[0].children.map((c) => c.label)).toEqual(['Chips'])
  })

  it("statusFilters=['warning','critical'] combine les deux (les 2 toggles activés ensemble)", () => {
    const rows = buildLiveInventoryRows(inv, 'shop', '', ['warning', 'critical'])
    expect(rows.map((g) => g.label)).toEqual(['Bar Nord']) // Bar Sud (100% good) disparaît entièrement
    expect(rows[0].children.map((c) => c.label)).toEqual(['Coca-Cola', 'Chips'])
  })

  it('combine recherche ET filtre statut (ET logique, pas OU)', () => {
    const rows = buildLiveInventoryRows(inv, 'shop', 'chips', ['warning', 'critical'])
    expect(rows[0].children.map((c) => c.label)).toEqual(['Chips'])
  })

  it("filtre statut actif sans aucun article correspondant → tableau vide (message rassurant côté écran)", () => {
    const calm = { shops: [{ shopId: 's', shopName: 'Calme', items: [{ itemKey: 'Eau', looseUnits: 10, consumedLoose: 0 }] }], items: [] }
    expect(buildLiveInventoryRows(calm, 'shop', '', ['critical'])).toEqual([])
  })
})

describe('countGlobalByStatus', () => {
  const inv = {
    shops: [
      { shopId: 's1', shopName: 'A', items: [
        { itemKey: 'X', looseUnits: 10, consumedLoose: 10 }, // critical
        { itemKey: 'Y', looseUnits: 10, consumedLoose: 7 }, // warning
        { itemKey: 'Z', looseUnits: 10, consumedLoose: 0 }, // good
      ] },
      { shopId: 's2', shopName: 'B', items: [
        { itemKey: 'X', looseUnits: 0, consumedLoose: 0 }, // uninitialized
      ] },
    ],
  }

  it("compte les ruptures ('critical') et les stocks bas ('warning') SÉPARÉMENT sur tout l'espace", () => {
    expect(countGlobalByStatus(inv, 'critical')).toBe(1)
    expect(countGlobalByStatus(inv, 'warning')).toBe(1)
  })

  it('retourne 0 sans données', () => {
    expect(countGlobalByStatus(null, 'critical')).toBe(0)
  })
})
