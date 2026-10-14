import { computeItemTotals, buildVariations } from '@/utils/analyseVariations'

const events = [
  { id: 'e1', ticketsScanned: 100 },
  { id: 'e2', attendees: 50 },
  { id: 'e3', ticketsSold: 10 },
]
const records = [
  { eventId: 'e1', menuItemId: 'm1', revenue: 1000, quantity: 100, transactionCount: 40 },
  { eventId: 'e1', menuItemId: 'm2', revenue: 500, quantity: 50, transactionCount: 10 },
  { eventId: 'e2', menuItemId: 'm1', revenue: 500, quantity: 50, transactionCount: 20 },
  { eventId: 'e3', menuItemId: 'm1', revenue: 0, quantity: 0, transactionCount: 0 },
  { eventId: 'hors', menuItemId: 'm1', revenue: 9999, quantity: 1, transactionCount: 1 },
]
const costMap = { m1: 4, m2: 6 }

describe('computeItemTotals', () => {
  const t = computeItemTotals(records, events, new Set(['e1', 'e2', 'e3']), costMap)
  it('cumule CA, coût, transactions, affluence', () => {
    expect(t.revenue).toBe(2000)
    expect(t.cost).toBe(100 * 4 + 50 * 6 + 50 * 4) // 900
    expect(t.transactions).toBe(70)
    expect(t.attendees).toBe(160) // 100 + 50 + 10
    expect(t.eventCount).toBe(3)
  })
  it('les moyennes par event ignorent les events sans CA', () => {
    expect(t.validEventCount).toBe(2)
    expect(t.avgRevenuePerEvent).toBe(1000)
    expect(t.avgCost).toBe(450)
  })
  it('ratios : panier, par tête, marge en %, taux de transfo', () => {
    expect(t.avgPerTransaction).toBeCloseTo(2000 / 70)
    expect(t.perCapita).toBeCloseTo(12.5)
    expect(t.margin).toBeCloseTo(55) // (2000-900)/2000
    expect(t.transferRate).toBeCloseTo(43.75) // 70/160
  })
  it('ignore les lignes hors idSet et tolère une costMap absente', () => {
    const only = computeItemTotals(records, events, new Set(['e2']))
    expect(only.revenue).toBe(500)
    expect(only.cost).toBe(0)
  })
  it('jeu vide : tout à 0 sans division par zéro', () => {
    const z = computeItemTotals([], [], new Set(), costMap)
    expect(z.margin).toBe(0)
    expect(z.perCapita).toBe(0)
    expect(z.avgRevenuePerEvent).toBe(0)
  })
})

describe('buildVariations', () => {
  const prev = { eventCount: 2, revenue: 1000, cost: 500, transactions: 50, attendees: 100,
    avgRevenuePerEvent: 500, avgCost: 250, avgPerTransaction: 20, perCapita: 10, margin: 50, transferRate: 50 }
  const curr = { eventCount: 2, revenue: 1200, cost: 450, transactions: 60, attendees: 100,
    avgRevenuePerEvent: 600, avgCost: 225, avgPerTransaction: 20, perCapita: 12, margin: 62.5, transferRate: 60 }
  const v = buildVariations(curr, prev)
  it('pourcentages classiques', () => {
    expect(v.revenue).toBeCloseTo(20)
    expect(v.cost).toBeCloseTo(-10)
    expect(v.attendees).toBeCloseTo(0)
    expect(v.avgTransaction).toBe(v.avgPerTransaction)
  })
  it('marge en POINTS, transfo en % de différence des taux', () => {
    expect(v.margin).toBeCloseTo(12.5)
    expect(v.transferRate).toBeCloseTo(20)
  })
  it('référence nulle : null (pas de division par zéro)', () => {
    const w = buildVariations(curr, { ...prev, revenue: 0, transactions: 0 })
    expect(w.revenue).toBeNull()
    expect(w.transactions).toBeNull()
    expect(w.cost).toBeCloseTo(-10)
  })
  it('référence sans event : objet vide', () => {
    expect(buildVariations(curr, { ...prev, eventCount: 0 })).toEqual({})
    expect(buildVariations(curr, null)).toEqual({})
  })
})
