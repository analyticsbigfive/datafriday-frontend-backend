// Tests des calculs purs de performance des PdV (txn/min) — BUG-287-01.
// Couvre l'extraction iso-fonctionnelle depuis useShopPerformance.js (sans
// range) ET le fenêtrage par plage horaire (`filters.selectedTimeRange`).
import {
  aggregateBaseShops,
  aggregateShopsFromTimeline,
  computeRatesFromTimeline,
  sumShopTransactionRates,
} from '@/utils/shopPerformanceCompute'

// ─── Fixtures ────────────────────────────────────────────────────────────────
// 2 events (doorsOpening 20:00 pour ev1 seulement), 2 shops.
const events = [
  { id: 'ev1', sessions: [{ doorsOpening: '20:00' }] },
  { id: 'ev2', sessions: [] },
]

// Timeline Bar A / ev1 : 20:00→20:04 (2 txn/min), 21:00→21:09 (5 txn/min).
// Bar A / ev2 : 20:30→20:39 (1 txn/min).
// Kiosque B / ev1 : records avec shopId SEUL (test alias), 20:10→20:19 (3 txn/min).
function tl(eventId, shop, startHHMM, count, txnPerMin, extra = {}) {
  const [h, m] = startHHMM.split(':').map(Number)
  const rows = []
  for (let i = 0; i < count; i++) {
    const total = h * 60 + m + i
    const hh = String(Math.floor(total / 60)).padStart(2, '0')
    const mm = String(total % 60).padStart(2, '0')
    rows.push({
      eventId,
      minute: `${hh}:${mm}`,
      transactionCount: txnPerMin,
      quantity: txnPerMin,
      revenueHt: txnPerMin * 10,
      ...shop,
      ...extra,
    })
  }
  return rows
}

const timeline = [
  ...tl('ev1', { shopName: 'Bar A', shopId: 'id-a' }, '20:00', 5, 2),
  ...tl('ev1', { shopName: 'Bar A', shopId: 'id-a' }, '21:00', 10, 5),
  ...tl('ev2', { shopName: 'Bar A', shopId: 'id-a' }, '20:30', 10, 1),
  // Kiosque B : shopId seul (pas de shopName) → résolution par alias
  ...tl('ev1', { shopId: 'Kiosque B' }, '20:10', 10, 3),
]

const granular = [
  { eventId: 'ev1', shopName: 'Bar A', revenue: 500, transactionCount: 60, quantity: 80 },
  { eventId: 'ev2', shopName: 'Bar A', revenue: 100, transactionCount: 10, quantity: 12 },
  { eventId: 'ev1', shopName: 'Kiosque B', revenue: 300, transactionCount: 30, quantity: 40 },
  { eventId: 'evX', shopName: 'Hors scope', revenue: 999, transactionCount: 9, quantity: 9 },
]

function shopByName(shops, name) {
  return shops.find((s) => s.elementId === name)
}

// ─── aggregateBaseShops (extraction iso) ────────────────────────────────────
describe('aggregateBaseShops', () => {
  it('filtre par eventIds, agrège et trie par CA décroissant', () => {
    const shops = aggregateBaseShops(granular, events)
    expect(shops.map((s) => s.elementId)).toEqual(['Bar A', 'Kiosque B'])
    const barA = shopByName(shops, 'Bar A')
    expect(barA.totalRevenue).toBe(600)
    expect(barA.totalTransactions).toBe(70)
    expect(barA.totalQuantity).toBe(92)
    expect(barA.eventCount).toBe(2)
    expect(barA.transactionRate).toBe(0) // pas encore enrichi
  })
})

// ─── computeRatesFromTimeline SANS range (régression) ───────────────────────
describe('computeRatesFromTimeline — sans plage horaire', () => {
  const base = aggregateBaseShops(granular, events)
  const shops = computeRatesFromTimeline(base, events, timeline)

  it('rate = txn / (last - first + 1) sommé par event', () => {
    const barA = shopByName(shops, 'Bar A')
    // ev1 : 10+50 txn sur span 20:00→21:09 = 70 min ; ev2 : 10 txn sur 10 min.
    expect(barA.operatingMinutes).toBe(80)
    expect(barA.transactionRate).toBeCloseTo(70 / 80, 10)
    expect(barA.totalTransactionsFromTimeline).toBe(70)
  })

  it('résout les shops indexés par shopId via la table d’alias', () => {
    const kiosque = shopByName(shops, 'Kiosque B')
    expect(kiosque.operatingMinutes).toBe(10)
    expect(kiosque.transactionRate).toBeCloseTo(3, 10)
  })

  it('first60 : txns dans [doors, doors+60) des events avec doorsOpening', () => {
    const barA = shopByName(shops, 'Bar A')
    // ev1 doors 20:00 → 20:00-20:04 (10 txn) dans la 1re heure ; 21:00+ dehors.
    // ev2 sans doors → exclu du dénominateur.
    expect(barA.first60MinTransactions).toBe(10)
    expect(barA.first60MinTransactionRate).toBeCloseTo(10 / 60, 10)
  })

  it('peak 15 min : meilleure fenêtre glissante', () => {
    const barA = shopByName(shops, 'Bar A')
    // Meilleur cas ev1 : 10 minutes à 5 txn (21:00→21:09) = 50 txn / 15 min.
    expect(barA.peakTransactionRate).toBeCloseTo(50 / 15, 10)
    expect(barA.peakWindow.eventId).toBe('ev1')
  })
})

// ─── computeRatesFromTimeline AVEC range ────────────────────────────────────
describe('computeRatesFromTimeline — plage horaire active', () => {
  const base = aggregateBaseShops(granular, events)
  const full = computeRatesFromTimeline(base, events, timeline)
  const range = { start: '21:00', end: '21:04' }
  const windowed = computeRatesFromTimeline(base, events, timeline, { timeRange: range })

  it('rate/minutes ne comptent que [start, end] inclusifs', () => {
    const barA = shopByName(windowed, 'Bar A')
    // Fenêtre 21:00→21:04 : 5 min × 5 txn = 25 txn / 5 min (ev2 hors fenêtre).
    expect(barA.operatingMinutes).toBe(5)
    expect(barA.totalTransactionsFromTimeline).toBe(25)
    expect(barA.transactionRate).toBeCloseTo(5, 10)
  })

  it('first60 et peak restent identiques avec/sans range (plein évènement)', () => {
    const fullA = shopByName(full, 'Bar A')
    const winA = shopByName(windowed, 'Bar A')
    expect(winA.first60MinTransactionRate).toBe(fullA.first60MinTransactionRate)
    expect(winA.first60MinTransactions).toBe(fullA.first60MinTransactions)
    expect(winA.peakTransactionRate).toBe(fullA.peakTransactionRate)
    expect(winA.peakWindow).toEqual(fullA.peakWindow)
  })

  it('borne unique : start seul / end seul', () => {
    const fromStart = computeRatesFromTimeline(base, events, timeline, {
      timeRange: { start: '21:00', end: null },
    })
    const barA = shopByName(fromStart, 'Bar A')
    // ≥ 21:00 : seulement les 10 min à 5 txn d'ev1.
    expect(barA.operatingMinutes).toBe(10)
    expect(barA.transactionRate).toBeCloseTo(5, 10)

    const untilEnd = computeRatesFromTimeline(base, events, timeline, {
      timeRange: { start: null, end: '20:39' },
    })
    const barA2 = shopByName(untilEnd, 'Bar A')
    // ≤ 20:39 : ev1 20:00-20:04 (10 txn / 5 min) + ev2 20:30-20:39 (10 txn / 10 min).
    expect(barA2.operatingMinutes).toBe(15)
    expect(barA2.totalTransactionsFromTimeline).toBe(20)
  })

  it('fenêtre vide pour un shop → rate 0, minutes 0, jamais NaN', () => {
    const out = computeRatesFromTimeline(base, events, timeline, {
      timeRange: { start: '23:00', end: '23:30' },
    })
    for (const s of out) {
      expect(s.transactionRate).toBe(0)
      expect(s.operatingMinutes).toBe(0)
      expect(Number.isNaN(s.transactionRate)).toBe(false)
    }
  })
})

// ─── aggregateShopsFromTimeline ─────────────────────────────────────────────
describe('aggregateShopsFromTimeline', () => {
  it('somme revenueHt/quantity/transactionCount fenêtrés, même forme que la base', () => {
    const range = { start: '21:00', end: '21:04' }
    const shops = aggregateShopsFromTimeline(timeline, events, range)
    expect(shops).toHaveLength(1) // seul Bar A a des records dans la fenêtre
    const barA = shops[0]
    expect(barA.elementId).toBe('Bar A')
    expect(barA.totalRevenue).toBe(250) // 5 min × 5 txn × 10 €
    expect(barA.totalTransactions).toBe(25)
    expect(barA.totalQuantity).toBe(25)
    // Mêmes clés que la sortie d'aggregateBaseShops (consommable à l'identique).
    const baseKeys = Object.keys(aggregateBaseShops(granular, events)[0]).sort()
    expect(Object.keys(barA).sort()).toEqual(baseKeys)
  })

  it('eventCount = events avec ≥ 1 record dans la fenêtre', () => {
    const shops = aggregateShopsFromTimeline(timeline, events, { start: '20:00', end: '20:59' })
    const barA = shopByName(shops, 'Bar A')
    expect(barA.eventCount).toBe(2) // ev1 (20:00-20:04) + ev2 (20:30-20:39)
    const narrower = aggregateShopsFromTimeline(timeline, events, { start: '20:30', end: '20:59' })
    expect(shopByName(narrower, 'Bar A').eventCount).toBe(1) // ev2 seul
  })

  it('fallback revenue quand revenueHt absent', () => {
    const rows = [{ eventId: 'ev1', shopName: 'Bar A', minute: '20:00', revenue: 42, quantity: 1, transactionCount: 1 }]
    const shops = aggregateShopsFromTimeline(rows, events, { start: '20:00', end: '20:00' })
    expect(shops[0].totalRevenue).toBe(42)
  })

  it('conserve un record à 0 transaction mais porteur de CA', () => {
    const rows = [{ eventId: 'ev1', shopName: 'Bar A', minute: '20:00', revenueHt: 15, quantity: 0, transactionCount: 0 }]
    const shops = aggregateShopsFromTimeline(rows, events, { start: '20:00', end: '20:05' })
    expect(shops[0].totalRevenue).toBe(15)
    expect(shops[0].totalTransactions).toBe(0)
  })
})

// ─── sumShopTransactionRates (carte TX/MIN, décision JLH 2026-08-24) ────────
describe('sumShopTransactionRates', () => {
  it('Σ des rates par shop — même sémantique que computeRatesFromTimeline', () => {
    // Bar A : (60 txn ev1 + 10 txn ev2) / (70 min + 10 min) = 70/80 ; Kiosque B : 3.
    expect(sumShopTransactionRates(timeline)).toBeCloseTo(70 / 80 + 3, 10)
  })

  it('parité verrouillée : Σ computeRatesFromTimeline === sumShopTransactionRates', () => {
    const base = aggregateBaseShops(granular, events)
    const shops = computeRatesFromTimeline(base, events, timeline)
    const panelSum = shops.reduce((s, sh) => s + (sh.transactionRate || 0), 0)
    expect(sumShopTransactionRates(timeline)).toBeCloseTo(panelSum, 10)
  })

  it('records pré-filtrés (plage horaire) : span des minutes restantes', () => {
    // Simule filteredBaskets après une plage 21:00-21:04 : Bar A seul, 25 txn / 5 min.
    const windowed = timeline.filter((r) => r.minute >= '21:00' && r.minute <= '21:04')
    expect(sumShopTransactionRates(windowed)).toBeCloseTo(5, 10)
  })

  it('ignore minutes invalides, txn ≤ 0, records sans shop ; vide → 0', () => {
    expect(sumShopTransactionRates([])).toBe(0)
    expect(sumShopTransactionRates(null)).toBe(0)
    const rows = [
      { eventId: 'ev1', shopName: 'Bar A', minute: 'bad', transactionCount: 5 },
      { eventId: 'ev1', shopName: 'Bar A', minute: '20:00', transactionCount: 0 },
      { eventId: 'ev1', minute: '20:00', transactionCount: 5 },
    ]
    expect(sumShopTransactionRates(rows)).toBe(0)
  })

  it('ne mute pas les records gelés (BUG-285)', () => {
    const frozen = timeline.map((r) => Object.freeze({ ...r }))
    expect(() => sumShopTransactionRates(frozen)).not.toThrow()
  })
})
