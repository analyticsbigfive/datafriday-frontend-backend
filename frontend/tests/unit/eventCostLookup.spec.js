import { normalizeEventCosts, costFor, makeCostFor } from '@/utils/eventCostLookup'
import { loadEventCostsInBatches } from '@/utils/eventCostsLoader'
import { preprocessTimelineRecords } from '@/utils/timelineBucketing'
import { itemLevelTotalsByEvent } from '@/utils/analyseAggregations'
import { computeItemTotals } from '@/utils/analyseVariations'

const costMap = { A: 2, B: 5 }
const byEvent = { E1: { A: 3 }, E2: {} }
const rows = [
  { eventId: 'E1', menuItemId: 'A', minute: '2026-03-01T20:00:00Z', quantity: 10, revenue: 100 },
  { eventId: 'E2', menuItemId: 'A', minute: '2026-03-02T20:00:00Z', quantity: 10, revenue: 100 },
  { eventId: 'E1', menuItemId: 'B', minute: '2026-03-01T20:00:00Z', quantity: 1, revenue: 10 },
]

describe('normalizeEventCosts', () => {
  it('ignore la source current et garde les events connus sans coût figé', () => {
    const out = normalizeEventCosts({
      events: {
        E1: { A: { totalCost: 3, source: 'snapshot' }, B: { totalCost: 9, source: 'current' } },
        E2: { A: { totalCost: 2, source: 'current' } },
      },
    })
    expect(out).toEqual({ E1: { A: 3 }, E2: {} })
  })
  it('réponse vide ou invalide : carte vide', () => {
    expect(normalizeEventCosts(null)).toEqual({})
    expect(normalizeEventCosts({})).toEqual({})
  })
})

describe('costFor / makeCostFor', () => {
  it('utilise le coût par event quand présent', () => {
    expect(costFor(costMap, byEvent, 'E1', 'A')).toBe(3)
    expect(makeCostFor(costMap, byEvent)('E1', 'A')).toBe(3)
  })
  it('repli sur la carte actuelle : event inconnu, article absent, carte vide', () => {
    expect(costFor(costMap, byEvent, 'E1', 'B')).toBe(5)
    expect(costFor(costMap, byEvent, 'E2', 'A')).toBe(2)
    expect(costFor(costMap, byEvent, 'E9', 'A')).toBe(2)
    expect(costFor(costMap, {}, 'E1', 'A')).toBe(2)
    expect(costFor(costMap, null, 'E1', 'A')).toBe(2)
    expect(makeCostFor(costMap, null)('E1', 'Z')).toBe(0)
  })
  it('un coût figé à 0 est respecté', () => {
    expect(costFor(costMap, { E1: { A: 0 } }, 'E1', 'A')).toBe(0)
  })
})

describe('loadEventCostsInBatches', () => {
  it('découpe par lots de 100 et ignore un lot en échec', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `E${i}`)
    const calls = []
    const fetcher = jest.fn(async (_s, chunk) => {
      calls.push(chunk.length)
      if (calls.length === 2) throw new Error('boom')
      return { events: { [chunk[0]]: { A: { totalCost: 1, source: 'snapshot' } } } }
    })
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await loadEventCostsInBatches('S', ids, fetcher)
    expect(calls).toEqual([100, 100, 50])
    expect(Object.keys(out)).toEqual(['E0', 'E200'])
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('branchement des agrégats', () => {
  it('itemLevelTotalsByEvent : repli identique quand la carte par event est vide', () => {
    const legacy = itemLevelTotalsByEvent(rows, costMap)
    expect(itemLevelTotalsByEvent(rows, costMap, {})).toEqual(legacy)
    expect(itemLevelTotalsByEvent(rows, costMap, null)).toEqual(legacy)
    expect(legacy.get('E1').cost).toBe(25)
  })
  it('itemLevelTotalsByEvent : coût par event quand présent', () => {
    const t = itemLevelTotalsByEvent(rows, costMap, byEvent)
    expect(t.get('E1').cost).toBe(35) // 10*3 + 1*5 (B en repli)
    expect(t.get('E2').cost).toBe(20) // E2 sans coût figé : repli
  })
  it('computeItemTotals : repli puis coût par event', () => {
    const ids = new Set(['E1', 'E2'])
    const legacy = computeItemTotals(rows, [], ids, costMap)
    expect(computeItemTotals(rows, [], ids, costMap, {})).toEqual(legacy)
    expect(legacy.cost).toBe(45)
    expect(computeItemTotals(rows, [], ids, costMap, byEvent).cost).toBe(55)
  })
  it('preprocessTimelineRecords : repli identique puis coût par event', () => {
    const legacy = preprocessTimelineRecords(rows, { menuItemCostMap: costMap })
    expect(preprocessTimelineRecords(rows, { menuItemCostMap: costMap, menuItemCostByEvent: {} })).toEqual(legacy)
    const sum = (l) => l.reduce((s, r) => s + r.totalCost, 0)
    expect(sum(legacy)).toBe(45)
    expect(sum(preprocessTimelineRecords(rows, { menuItemCostMap: costMap, menuItemCostByEvent: byEvent }))).toBe(55)
  })
})
