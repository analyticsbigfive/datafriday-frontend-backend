import { resolveItemName, NO_DISPLAY_NAME_KEY } from '@/utils/analyseDimensions'

// Libellé de repli historique de l'écran (tiret cadratin, en échappement Unicode).
const FALLBACK_NAME = '—'

/** Top PdV (SummaryPanel). mode 'avg' trie sur la moyenne par event. */
export function computeTopShops(records, shopRates, mode = 'total') {
  const map = new Map()
  for (const r of records || []) {
    const key = r.shopName || FALLBACK_NAME
    if (!map.has(key)) {
      map.set(key, { name: key, revenue: 0, units: 0, eventIds: new Set() })
    }
    const e = map.get(key)
    e.revenue += r.revenue || 0
    e.units += r.quantity || 0
    if (r.eventId) e.eventIds.add(r.eventId)
  }
  // Lookup transactionRate par nom de shop (fourni par useShopPerformance.enrich).
  const rateByName = new Map()
  for (const sh of shopRates || []) {
    if (sh?.shopName && Number.isFinite(sh.transactionRate)) {
      rateByName.set(sh.shopName, sh.transactionRate)
    }
  }
  const list = [...map.values()].map((e) => {
    const n = e.eventIds.size || 1
    return {
      name: e.name,
      revenue: e.revenue,
      units: e.units,
      eventCount: e.eventIds.size,
      avgRevenue: e.revenue / n,
      avgUnits: e.units / n,
      transactionRate: rateByName.get(e.name) ?? null,
    }
  })
  const key = mode === 'avg' ? 'avgRevenue' : 'revenue'
  return list.sort((a, b) => b[key] - a[key])
}

/** Top events par CA. */
export function computeTopEvents(records, events) {
  const totals = new Map()
  for (const r of records || []) {
    if (!r.eventId) continue
    const cur = totals.get(r.eventId) || { revenue: 0, units: 0 }
    cur.revenue += r.revenue || 0
    cur.units += r.quantity || 0
    totals.set(r.eventId, cur)
  }
  const list = (events || []).map((ev) => {
    const t = totals.get(ev.id) || { revenue: 0, units: 0 }
    return {
      id: ev.id,
      name: ev.name || ev.title || FALLBACK_NAME,
      date: ev.date || ev.eventDate || null,
      revenue: t.revenue,
      units: t.units,
    }
  })
  return list.sort((a, b) => b.revenue - a.revenue)
}

/**
 * Top articles. `groupKeyOf(record)` fournit la clé de regroupement (article ou DisplayName),
 * `byDisplayName` active le libellé « sans DisplayName » (`noDisplayNameLabel`).
 */
export function computeTopItems(records, {
  groupKeyOf, byDisplayName = false, noDisplayNameLabel = '', mode = 'total',
} = {}) {
  const keyOf = groupKeyOf || ((r) => resolveItemName(r))
  const map = new Map()
  for (const r of records || []) {
    const key = keyOf(r) || FALLBACK_NAME
    if (!map.has(key)) {
      map.set(key, { name: key, revenue: 0, units: 0, eventIds: new Set(), itemNames: new Set() })
    }
    const e = map.get(key)
    e.revenue += r.revenue || 0
    e.units += r.quantity || 0
    if (r.eventId) e.eventIds.add(r.eventId)
    // Noms d'articles réellement présents : ce sont eux que le filtre article reçoit au clic.
    const itemName = resolveItemName(r)
    if (itemName) e.itemNames.add(itemName)
  }
  const list = [...map.values()].map((e) => {
    const n = e.eventIds.size || 1
    const isNoDisplayName = byDisplayName && e.name === NO_DISPLAY_NAME_KEY
    return {
      name: isNoDisplayName ? noDisplayNameLabel : e.name,
      key: e.name,
      memberNames: [...e.itemNames],
      itemCount: e.itemNames.size,
      revenue: e.revenue,
      units: e.units,
      eventCount: e.eventIds.size,
      avgRevenue: e.revenue / n,
      avgUnits: e.units / n,
    }
  })
  const key = mode === 'avg' ? 'avgRevenue' : 'revenue'
  return list.sort((a, b) => b[key] - a[key])
}
