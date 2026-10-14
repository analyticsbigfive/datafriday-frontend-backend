import { pickScenarioVersion, hasScenarioRecords, splitEventsByScenario } from '@/utils/comparisonPredictScenario'
import { hasIntraEventFilters, computeEventRollupTotals } from '@/utils/analyseRollupTotals'
import { buildEventRevenueSeries } from '@/utils/comparisonEventSeries'
import { buildReportBreakdowns } from '@/utils/comparisonBreakdowns'

describe('pickScenarioVersion', () => {
  const v1 = { id: 'v1', timestamp: '2026-01-01T00:00:00Z', predictedRecords: [{}] }
  const v2 = { id: 'v2', timestamp: '2026-03-01T00:00:00Z', predictedRecords: [{}] }
  const v3 = { id: 'v3', timestamp: '2026-02-01T00:00:00Z', isDefault: true, predictedRecords: [{}] }
  it('aucune version = null', () => {
    expect(pickScenarioVersion([])).toBeNull()
    expect(pickScenarioVersion(null)).toBeNull()
  })
  it('active > défaut > plus récente', () => {
    expect(pickScenarioVersion([v1, v2, v3], { activeVersionId: 'v1' }).id).toBe('v1')
    expect(pickScenarioVersion([v1, v2, v3]).id).toBe('v3')
    expect(pickScenarioVersion([v1, v2]).id).toBe('v2')
  })
  it('version active disparue : retombe sur le défaut', () => {
    expect(pickScenarioVersion([v1, v3], { activeVersionId: 'gone' }).id).toBe('v3')
  })
  it('utilise updatedAt/createdAt de l\'API', () => {
    const a = { id: 'a', updatedAt: '2026-05-01T00:00:00Z' }
    const b = { id: 'b', createdAt: '2026-06-01T00:00:00Z' }
    expect(pickScenarioVersion([a, b]).id).toBe('b')
  })
})

describe('splitEventsByScenario', () => {
  it('sépare couverts et exclus avec la raison', () => {
    const events = [
      { id: 'a', name: 'A', date: '2026-01-01' },
      { id: 'b', eventName: 'B' },
      { id: 'c', name: 'C' },
    ]
    const map = new Map([
      ['a', { id: 'v', predictedRecords: [{ x: 1 }] }],
      ['b', null],
      ['c', { id: 'v2', predictedRecords: [] }],
    ])
    const { covered, excluded } = splitEventsByScenario(events, map)
    expect(covered.map((e) => e.id)).toEqual(['a'])
    expect(excluded).toEqual([
      { id: 'b', name: 'B', date: '', reason: 'no-scenario' },
      { id: 'c', name: 'C', date: '', reason: 'empty-scenario' },
    ])
    expect(hasScenarioRecords({ predictedRecords: [] })).toBe(false)
  })
})

describe('analyseRollupTotals', () => {
  const evs = [{ id: 1, revenue: 100, transactionCount: 10 }, { id: 2, revenue: 0, transactionCount: 0 }]
  it('rollup quand aucun filtre intra-event', () => {
    expect(computeEventRollupTotals(evs, {})).toEqual({ revenue: 100, transactions: 10, eventsWithRevenueCount: 1 })
  })
  it('null en Predict, avec filtre PdV ou plage horaire, sans event, ou rollup manquant', () => {
    expect(computeEventRollupTotals(evs, {}, true)).toBeNull()
    expect(computeEventRollupTotals(evs, { selectedShopIds: ['Bar'] })).toBeNull()
    expect(computeEventRollupTotals(evs, { selectedTimeRange: { start: 'x' } })).toBeNull()
    expect(computeEventRollupTotals([], {})).toBeNull()
    expect(computeEventRollupTotals([{ id: 1 }], {})).toBeNull()
  })
  it('hasIntraEventFilters : filtre article et dimensions article', () => {
    expect(hasIntraEventFilters({ selectedMenuItemTypes: ['Food'] })).toBe(true)
    expect(hasIntraEventFilters({ selectedBrands: ['K'] })).toBe(true)
    expect(hasIntraEventFilters(null)).toBe(false)
  })
})

describe('buildEventRevenueSeries', () => {
  it('CA par event trié par date', () => {
    const events = [
      { id: 'b', name: 'Match B', date: '2026-02-10' },
      { id: 'a', name: 'Match A', date: '2026-01-05' },
    ]
    const records = [
      { eventId: 'b', revenue: 30 }, { eventId: 'a', revenue: 10 }, { eventId: 'a', revenue: 5 }, { revenue: 99 },
    ]
    expect(buildEventRevenueSeries(records, events)).toEqual([
      { eventId: 'a', name: 'Match A', date: '2026-01-05', revenue: 15 },
      { eventId: 'b', name: 'Match B', date: '2026-02-10', revenue: 30 },
    ])
  })
})

describe('buildReportBreakdowns', () => {
  it('sans index : dimensions article nulles, types à 0 retirés des cartes', () => {
    const b = buildReportBreakdowns([
      { menuItemName: 'A', menuItemType: 'Food', menuItemCategory: 'Fries', revenue: 10, quantity: 1 },
      { menuItemName: 'B', menuItemType: 'Combo', menuItemCategory: 'Menu', revenue: 0, quantity: 2 },
    ])
    expect(b.revenue.brand).toBeNull()
    expect(b.categories).toEqual([{ key: 'Food', value: 10 }])
    expect(b.quantity.type.find((e) => e.key === 'Combo').value).toBe(2)
  })
})
