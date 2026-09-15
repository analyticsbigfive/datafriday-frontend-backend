import {
  buildShopTotals,
  buildTimelineByMinute,
  sumBasketTransactions,
  txPerMinuteFromBaskets,
} from '@/utils/liveKpis'

// Un ticket de 3 articles au PdV "6 A" à 19:47 : 3 lignes au grain article, 1 ligne panier.
const timelineRows = [
  { minute: '2026-09-12T17:47:00Z', minuteLocal: '2026-09-12 19:47', shopId: 's6a', shopName: '6 A', revenueHt: 5, quantity: 1, transactionsCount: 1 },
  { minute: '2026-09-12T17:47:00Z', minuteLocal: '2026-09-12 19:47', shopId: 's6a', shopName: '6 A', revenueHt: 7, quantity: 2, transactionsCount: 1 },
  { minute: '2026-09-12T17:47:00Z', minuteLocal: '2026-09-12 19:47', shopId: 's6a', shopName: '6 A', revenueHt: 2, quantity: 1, transactionsCount: 1 },
  { minute: '2026-09-12T17:48:00Z', minuteLocal: '2026-09-12 19:48', shopId: 's1a', shopName: '1 A', revenueHt: 4, quantity: 1, transactionsCount: 1 },
]
const basketRows = [
  { minute: '2026-09-12T17:47:00Z', minuteLocal: '2026-09-12 19:47', shopId: 's6a', shopName: '6 A', transactionCount: 1, revenueHt: 14 },
  { minute: '2026-09-12T17:48:00Z', minuteLocal: '2026-09-12 19:48', shopId: 's1a', shopName: '1 A', transactionCount: 1, revenueHt: 4 },
]

describe('liveKpis (BUG-382-02 : tickets comptés depuis les paniers, jamais depuis le grain article)', () => {
  it('sumBasketTransactions counts one per ticket, not one per article line', () => {
    expect(sumBasketTransactions(basketRows)).toBe(2)
    expect(timelineRows.reduce((s, r) => s + r.transactionsCount, 0)).toBe(4)
  })

  it('buildShopTotals keeps revenue and units from the article grain but tickets from baskets', () => {
    const totals = buildShopTotals(timelineRows, basketRows)
    expect(totals).toEqual([
      { shopId: 's6a', shopName: '6 A', revenue: 14, transactionCount: 1, itemsCount: 4 },
      { shopId: 's1a', shopName: '1 A', revenue: 4, transactionCount: 1, itemsCount: 1 },
    ])
  })

  it('txPerMinuteFromBaskets averages tickets over the last 5 known minutes', () => {
    expect(txPerMinuteFromBaskets(basketRows)).toBe(1)
    const many = Array.from({ length: 8 }, (_, i) => ({ minuteLocal: `2026-09-12 19:4${i}`, transactionCount: i + 1 }))
    // Minutes 19:43 à 19:47 : tickets 4, 5, 6, 7, 8 → 6 / min
    expect(txPerMinuteFromBaskets(many)).toBe(6)
    expect(txPerMinuteFromBaskets([])).toBe(0)
  })

  it('buildTimelineByMinute uses basket tickets and article revenue per minute', () => {
    expect(buildTimelineByMinute(timelineRows, basketRows)).toEqual([
      { minute: '2026-09-12 19:47', transactions: 1, revenue: 14 },
      { minute: '2026-09-12 19:48', transactions: 1, revenue: 4 },
    ])
  })

  it('average basket derived from these totals is per ticket', () => {
    const revenue = buildShopTotals(timelineRows, basketRows).reduce((s, sh) => s + sh.revenue, 0)
    expect(revenue / sumBasketTransactions(basketRows)).toBe(9)
  })
})
