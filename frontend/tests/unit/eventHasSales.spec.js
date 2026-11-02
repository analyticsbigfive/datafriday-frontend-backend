import { eventHasSales, keepEventsWithSales } from '@/utils/eventHasSales'
import { rollupByEvent, computeEventRollupTotals } from '@/utils/analyseRollupTotals'

describe('eventHasSales (règle Bertrand : pas de vente = event non joué)', () => {
  it('exclut CA 0 et 0 transaction', () => {
    expect(eventHasSales({ revenue: 0, transactionCount: 0 })).toBe(false)
    expect(eventHasSales({ revenue: '0.00', transactionCount: 0 })).toBe(false)
  })
  it('garde un event avec du CA ou des transactions', () => {
    expect(eventHasSales({ revenue: 120.5, transactionCount: 0 })).toBe(true)
    expect(eventHasSales({ revenue: 0, transactionCount: 3 })).toBe(true)
  })
  it('garde un event dont le rollup est absent (inconnu)', () => {
    expect(eventHasSales({ id: 'a' })).toBe(true)
    expect(eventHasSales({ revenue: null, transactionCount: null })).toBe(true)
  })
  it('keepEventsWithSales filtre la liste', () => {
    const evs = [{ id: 1, revenue: 0, transactionCount: 0 }, { id: 2, revenue: 10, transactionCount: 1 }]
    expect(keepEventsWithSales(evs).map((e) => e.id)).toEqual([2])
    expect(keepEventsWithSales(null)).toEqual([])
  })
  it('per cap : un match sans vente ne dilue plus', () => {
    const evs = keepEventsWithSales([
      { id: 1, revenue: 0, transactionCount: 0, ticketsScanned: 10000 },
      { id: 2, revenue: 50000, transactionCount: 4000, ticketsScanned: 10000 },
    ])
    const tickets = evs.reduce((s, e) => s + e.ticketsScanned, 0)
    const t = computeEventRollupTotals(evs, {}, false)
    expect(t.revenue / tickets).toBe(5)
    expect(t.eventsWithRevenueCount).toBe(1)
  })
})

describe('rollupByEvent (graphique par événement = bande KPI)', () => {
  const events = [{ id: 'e1', revenue: '133122.33', transactionCount: 9223 }]
  it('renvoie le rollup Event, pas la somme des records shop-level', () => {
    const m = rollupByEvent(events, {}, false)
    expect(m.get('e1')).toEqual({ revenue: 133122.33, transactions: 9223 })
  })
  it('null en predict, avec filtre intra-event, ou rollup absent', () => {
    expect(rollupByEvent(events, {}, true)).toBeNull()
    expect(rollupByEvent(events, { selectedShopIds: ['s1'] }, false)).toBeNull()
    expect(rollupByEvent([{ id: 'e2' }], {}, false)).toBeNull()
    expect(rollupByEvent([], {}, false)).toBeNull()
  })
})
