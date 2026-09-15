// KPIs de l'écran Live calculés depuis les DEUX sources backend-driven :
//  - timelineRows (event-timeline, grain minute × PdV × ARTICLE) : CA et quantités, additifs.
//  - basketRows (transaction-baskets, grain minute × PdV × combinaison, UNE ligne par
//    ticket) : la seule source correcte pour COMPTER des transactions.
// BUG-354-01 / BUG-382-02 : sommer `transactionCount` du grain article compte un panier à
// N articles distincts N fois (AJA-Nice 12/09, 18:33-20:20 : 3 721 affichés pour 1 299 tickets
// réels, panier moyen 4,90 € au lieu de 14,03 €). Le grain article ne sert plus jamais à
// compter des tickets.

const num = (v) => Number(v) || 0
const minuteKey = (r) => r.minuteLocal || r.minute

export function sumBasketTransactions(basketRows) {
  let total = 0
  for (const b of basketRows || []) total += num(b.transactionCount)
  return total
}

export function basketTransactionsByShop(basketRows) {
  const byShop = new Map()
  for (const b of basketRows || []) byShop.set(b.shopId, (byShop.get(b.shopId) || 0) + num(b.transactionCount))
  return byShop
}

export function basketTransactionsByMinute(basketRows) {
  const byMinute = new Map()
  for (const b of basketRows || []) {
    const key = minuteKey(b)
    byMinute.set(key, (byMinute.get(key) || 0) + num(b.transactionCount))
  }
  return byMinute
}

/** CA et quantités par PdV depuis le grain article, tickets depuis les paniers. */
export function buildShopTotals(timelineRows, basketRows) {
  const byShop = new Map()
  for (const r of timelineRows || []) {
    if (!byShop.has(r.shopId)) byShop.set(r.shopId, { shopId: r.shopId, shopName: r.shopName, revenue: 0, transactionCount: 0, itemsCount: 0 })
    const s = byShop.get(r.shopId)
    s.revenue += num(r.revenueHt ?? r.revenue)
    s.itemsCount += num(r.quantity)
  }
  for (const [shopId, count] of basketTransactionsByShop(basketRows)) {
    if (!byShop.has(shopId)) {
      const b = (basketRows || []).find((x) => x.shopId === shopId)
      byShop.set(shopId, { shopId, shopName: b?.shopName, revenue: 0, transactionCount: 0, itemsCount: 0 })
    }
    byShop.get(shopId).transactionCount = count
  }
  return [...byShop.values()]
}

/** Rythme actuel : moyenne des tickets sur les 5 dernières minutes connues. */
export function txPerMinuteFromBaskets(basketRows, lastN = 5) {
  const byMinute = basketTransactionsByMinute(basketRows)
  const minutes = [...byMinute.keys()].sort().slice(-lastN)
  if (!minutes.length) return 0
  const total = minutes.reduce((s, m) => s + byMinute.get(m), 0)
  return total / minutes.length
}

/** Timeline par minute : CA du grain article, tickets des paniers. */
export function buildTimelineByMinute(timelineRows, basketRows) {
  const byMinute = new Map()
  const ensure = (key) => {
    if (!byMinute.has(key)) byMinute.set(key, { minute: key, transactions: 0, revenue: 0 })
    return byMinute.get(key)
  }
  for (const r of timelineRows || []) ensure(minuteKey(r)).revenue += num(r.revenueHt)
  for (const [key, count] of basketTransactionsByMinute(basketRows)) ensure(key).transactions = count
  return [...byMinute.values()].sort((a, b) => (a.minute > b.minute ? 1 : -1))
}
