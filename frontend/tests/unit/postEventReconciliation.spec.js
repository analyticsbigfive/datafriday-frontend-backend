import {
  reconciliationKey,
  buildPostEventReconciliationLines,
  computeReconciliationSummary,
} from '@/utils/postEventReconciliation'

const K = reconciliationKey

describe('buildPostEventReconciliationLines', () => {
  it('computes leftFromSales, missingUnits and missingValue for a full line', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'beer')]: 12 },
      preEventUnitsByKey: { [K('el1', 'beer')]: 740 },
      soldUnitsByKey: { [K('el1', 'beer')]: 698 },
      predictedUnitsByKey: { [K('el1', 'beer')]: 746 },
      unitCostByItemId: { beer: 2.5 },
      elementNameById: new Map([['el1', 'Parvis']]),
      itemNameById: { beer: 'Pinte bière 50cl' },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      elementId: 'el1',
      elementName: 'Parvis',
      itemKey: 'beer',
      itemName: 'Pinte bière 50cl',
      soldUnits: 698,
      predictedUnits: 746,
      leftFromSales: 42, // 740 − 698
      countedUnits: 12,
      missingUnits: 30, // 42 − 12
      missingValue: 75, // 30 × 2.5
      unitCost: 2.5,
    })
  })

  it('uses the union of keys — sold-but-never-counted and counted-but-never-sold both appear', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 5 },
      soldUnitsByKey: { [K('el1', 'b')]: 8 },
    })
    const byItem = Object.fromEntries(lines.map((l) => [l.itemKey, l]))
    expect(byItem.a).toMatchObject({ countedUnits: 5, soldUnits: 0 })
    expect(byItem.b).toMatchObject({ countedUnits: 0, soldUnits: 8 })
  })

  it('keeps predictedUnits null without a scenario, 0 when the scenario omits the item', () => {
    const noScenario = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 1 },
      predictedUnitsByKey: null,
    })
    expect(noScenario[0].predictedUnits).toBeNull()

    const withScenario = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 1 },
      predictedUnitsByKey: { [K('el1', 'other')]: 10 },
    })
    expect(withScenario.find((l) => l.itemKey === 'a').predictedUnits).toBe(0)
  })

  it('keeps left/missing/value null without a pre-event inventory', () => {
    const [line] = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 3 },
      soldUnitsByKey: { [K('el1', 'a')]: 7 },
      preEventUnitsByKey: null,
      unitCostByItemId: { a: 9 },
    })
    expect(line.leftFromSales).toBeNull()
    expect(line.missingUnits).toBeNull()
    expect(line.missingValue).toBeNull()
  })

  it('keeps missingValue null without a unit cost, and supports negative missing (surplus)', () => {
    const [line] = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 10 },
      preEventUnitsByKey: { [K('el1', 'a')]: 4 },
      soldUnitsByKey: {},
    })
    expect(line.leftFromSales).toBe(4)
    expect(line.missingUnits).toBe(-6) // surplus compté
    expect(line.missingValue).toBeNull()
  })

  it('drops unaddressable keys (empty elementId or itemId)', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { '|orphan': 1, 'el1|': 2, [K('el1', 'ok')]: 3 },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].itemKey).toBe('ok')
  })

  it('sorts by element name then item name', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: {
        [K('el2', 'b')]: 1,
        [K('el1', 'z')]: 1,
        [K('el1', 'a')]: 1,
      },
      elementNameById: { el1: 'Alpha', el2: 'Beta' },
      itemNameById: { a: 'Aa', z: 'Zz', b: 'Bb' },
    })
    expect(lines.map((l) => `${l.elementName}:${l.itemName}`)).toEqual([
      'Alpha:Aa',
      'Alpha:Zz',
      'Beta:Bb',
    ])
  })
})

describe('computeReconciliationSummary', () => {
  it('computes totals and diffPct', () => {
    const s = computeReconciliationSummary([
      { soldUnits: 698, predictedUnits: 746, missingUnits: 30, missingValue: 75 },
      { soldUnits: 340, predictedUnits: 300, missingUnits: 0, missingValue: 0 },
    ])
    expect(s.totalSold).toBe(1038)
    expect(s.totalPredicted).toBe(1046)
    expect(s.diffPct).toBeCloseTo(-0.76, 1) // (1038−1046)/1046
    expect(s.totalMissingUnits).toBe(30)
    expect(s.totalMissingValue).toBe(75)
  })

  it('ignores negative missing (surplus never refunds a loss)', () => {
    const s = computeReconciliationSummary([
      { soldUnits: 0, predictedUnits: null, missingUnits: 10, missingValue: 20 },
      { soldUnits: 0, predictedUnits: null, missingUnits: -4, missingValue: -8 },
    ])
    expect(s.totalMissingUnits).toBe(10)
    expect(s.totalMissingValue).toBe(20)
  })

  it('returns nulls when sources are absent', () => {
    const s = computeReconciliationSummary([
      { soldUnits: 5, predictedUnits: null, missingUnits: null, missingValue: null },
    ])
    expect(s.totalPredicted).toBeNull()
    expect(s.diffPct).toBeNull()
    expect(s.totalMissingUnits).toBeNull()
    expect(s.totalMissingValue).toBeNull()
  })

  it('diffPct is null when total predicted is 0 (no ±Infinity)', () => {
    const s = computeReconciliationSummary([{ soldUnits: 5, predictedUnits: 0 }])
    expect(s.diffPct).toBeNull()
  })
})
