// Calculs purs de la performance des PdV (txn/min) — extraits de
// `useShopPerformance.js` (BUG-287-01) pour deux raisons :
//   1. testabilité : Jest importe des fonctions pures sans monter le composable ;
//   2. fenêtrage horaire : le composable dérive désormais `shops` d'un computed
//      qui recombine (base, timeline, plage horaire) à chaque changement de
//      `filters.selectedTimeRange` — le calcul devait sortir de `enrich()`.
//
// Sémantique du fenêtrage (décisions produit BUG-287-01, tranchées par JLH) :
//   - fenêtrés   : transactionRate, operatingMinutes, et les agrégats de base
//                  (totalRevenue/totalTransactions/totalQuantity/eventCount)
//                  via `aggregateShopsFromTimeline` ;
//   - PAS fenêtrés : first60MinTransactionRate (1re heure après doors opening)
//                  et peakTransactionRate (pic glissant 15 min) — un pic de
//                  15 min dans une fenêtre de 20 min n'a pas de sens, et la
//                  1re heure sort le plus souvent de la fenêtre.
import { isMinuteInRange, hasActiveRange } from '@/utils/timelineBucketing'

function parseHHMM(t) {
  if (!t || typeof t !== 'string') return null
  const [h, m] = t.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

/** Squelette commun d'un shop agrégé — même forme quelle que soit la source. */
function makeShopEntry(id) {
  return {
    elementId: id,
    elementName: id,
    shopName: id,
    totalRevenue: 0,
    totalTransactions: 0,
    totalQuantity: 0,
    eventCount: 0,
    _eventIds: new Set(),
    // métriques timeline (remplies par computeRatesFromTimeline)
    transactionRate: 0,
    operatingMinutes: 0,
    first60MinTransactionRate: 0,
    first60MinTransactions: 0,
    peakTransactionRate: 0,
    peakWindow: null,
  }
}

function finalizeShops(byShop) {
  for (const s of byShop.values()) {
    s.eventCount = s._eventIds.size
    delete s._eventIds
  }
  return [...byShop.values()].sort((a, b) => b.totalRevenue - a.totalRevenue)
}

/**
 * Agrégats par shop depuis les records granulaires shop-level (revenue,
 * transactions, quantité, eventCount). Le `transactionRate` n'est pas calculé
 * ici — il sera ajouté par `computeRatesFromTimeline`.
 *
 * @param {Array} records  shopGranularData (shop-level, sans minute)
 * @param {Array} events   events filtrés (scope)
 */
export function aggregateBaseShops(records, events) {
  const eventIds = new Set(events.map((e) => e.id))
  const byShop = new Map()
  for (const r of records || []) {
    if (!eventIds.has(r.eventId)) continue
    const id = r.shopName || '—'
    let s = byShop.get(id)
    if (!s) {
      s = makeShopEntry(id)
      byShop.set(id, s)
    }
    s.totalRevenue += r.revenue || 0
    s.totalTransactions += r.transactionCount || 0
    s.totalQuantity += r.quantity || 0
    s._eventIds.add(r.eventId)
  }
  return finalizeShops(byShop)
}

/**
 * Agrégats par shop depuis la TIMELINE minute par minute, restreints à la
 * plage horaire. Utilisée à la place d'`aggregateBaseShops` quand une fenêtre
 * est active : shopGranularData n'a pas de colonne minute, le filtre horaire y
 * est un no-op — seule la timeline permet un CA/transactions fenêtrés.
 *
 * Même forme de sortie qu'`aggregateBaseShops` (tri CA desc inclus).
 * `eventCount` = events du shop avec ≥ 1 record DANS la fenêtre — sinon le
 * « CA moyen / event » des cartes diviserait un CA fenêtré par des events
 * inactifs dans la fenêtre.
 *
 * Pas de skip `txn <= 0` ici : un record peut porter du CA sans transaction.
 *
 * @param {Array} allTimelineData  records {eventId, shopName|shopId, minute,
 *   revenueHt|revenue, quantity, transactionCount}
 * @param {Array} events
 * @param {{start:any,end:any}|null} timeRange
 */
export function aggregateShopsFromTimeline(allTimelineData, events, timeRange) {
  const eventIds = new Set(events.map((e) => e.id))
  const byShop = new Map()
  for (const r of allTimelineData || []) {
    if (!r || !eventIds.has(r.eventId)) continue
    // Même convention de clé que computeRatesFromTimeline (shopName prioritaire).
    const id = r.shopName || r.shopId || '—'
    if (!isMinuteInRange(r.minute, timeRange)) continue
    let s = byShop.get(id)
    if (!s) {
      s = makeShopEntry(id)
      byShop.set(id, s)
    }
    s.totalRevenue += Number(r.revenueHt ?? r.totalRevenue ?? r.revenue ?? 0)
    s.totalTransactions += Number(r.transactionCount ?? r.quantity ?? 0)
    s.totalQuantity += Number(r.quantity ?? 0)
    s._eventIds.add(r.eventId)
  }
  return finalizeShops(byShop)
}

/**
 * Pour chaque shop, calcule les rates à partir de la timeline.
 * Records timeline attendus : { eventId, shopId|shopName, minute (HH:MM),
 * quantity, transactionCount }.
 *
 * Avec `timeRange` actif : `transactionRate` et `operatingMinutes` ne comptent
 * que les minutes/transactions DANS [start, end] (inclusifs) ; `first60…` et
 * `peak…` restent calculés sur l'évènement entier (cf. en-tête de fichier).
 *
 * @param {Array} baseShops  sortie d'aggregateBaseShops/aggregateShopsFromTimeline
 * @param {Array} events     pour la map doorsOpening
 * @param {Array} allTimelineData
 * @param {{ timeRange?: {start:any,end:any}|null }} [opts]
 */
export function computeRatesFromTimeline(baseShops, events, allTimelineData, { timeRange = null } = {}) {
  const windowed = hasActiveRange(timeRange)

  // Map eventId → doorsOpening en minutes
  const doorsMap = new Map()
  for (const ev of events) {
    const t = ev?.sessions?.[0]?.doorsOpening
    const m = parseHHMM(t)
    if (m != null) doorsMap.set(ev.id, m)
  }

  // shop → event → { txns plein event + fenêtrés, bornes, first60, perMinute }
  //
  // BUG FIX (historique) : les records timeline portent à la fois `shopName` et
  // `shopId` (deux champs distincts — cf. STATISTIQUES_REFERENCE.md §6.3), alors
  // que les shops de base sont indexés par `shopName` (`elementId = shopName`).
  // L'ancienne clé `r.shopId || r.shopName` indexait la timeline par `shopId`
  // → `stats.get(shop.elementId)` ne trouvait jamais rien → rate 0 partout.
  // On indexe par `shopName` et on conserve une table d'alias shopId/shopName
  // → clé primaire pour rester robuste quelle que soit la convention backend.
  const stats = new Map()
  const aliasToPrimary = new Map()
  for (const r of allTimelineData) {
    const shopName = r.shopName
    const shopId = r.shopId
    const key = shopName || shopId
    const eventId = r.eventId
    if (!key || !eventId || !r.minute) continue
    const minutes = parseHHMM(r.minute)
    if (minutes == null) continue
    // La timeline expose `transactionCount` et `quantity` (jamais `totalQuantity`).
    const txn = Number(r.transactionCount ?? r.quantity ?? r.totalQuantity ?? 0)
    if (txn <= 0) continue

    if (shopName) aliasToPrimary.set(shopName, key)
    if (shopId) aliasToPrimary.set(shopId, key)

    let shopMap = stats.get(key)
    if (!shopMap) {
      shopMap = new Map()
      stats.set(key, shopMap)
    }
    let evStats = shopMap.get(eventId)
    if (!evStats) {
      evStats = {
        totalTransactions: 0,
        firstMinute: minutes,
        lastMinute: minutes,
        first60: 0,
        perMinute: new Map(),
        // Accumulateurs fenêtrés (BUG-287-01) — remplis seulement si la minute
        // tombe dans la plage horaire active.
        windowTxns: 0,
        windowFirst: null,
        windowLast: null,
      }
      shopMap.set(eventId, evStats)
    }
    evStats.totalTransactions += txn
    if (minutes < evStats.firstMinute) evStats.firstMinute = minutes
    if (minutes > evStats.lastMinute) evStats.lastMinute = minutes
    evStats.perMinute.set(minutes, (evStats.perMinute.get(minutes) || 0) + txn)

    if (windowed && isMinuteInRange(r.minute, timeRange)) {
      evStats.windowTxns += txn
      if (evStats.windowFirst == null || minutes < evStats.windowFirst) evStats.windowFirst = minutes
      if (evStats.windowLast == null || minutes > evStats.windowLast) evStats.windowLast = minutes
    }

    const doors = doorsMap.get(eventId)
    if (doors != null) {
      const delta = minutes - doors
      if (delta >= 0 && delta < 60) evStats.first60 += txn
    }
  }

  return baseShops.map((shop) => {
    // `shop.elementId === shop.shopName` ; on résout via la table d'alias pour
    // matcher la clé primaire de la timeline (shopName en priorité, shopId en
    // repli), puis on retombe sur l'elementId si aucun alias n'existe.
    const primary =
      aliasToPrimary.get(shop.elementId) ??
      aliasToPrimary.get(shop.shopName) ??
      shop.elementId
    const shopMap = stats.get(primary)
    if (!shopMap) return shop

    let totalTxn = 0
    let totalMinutes = 0
    let first60Txn = 0
    let evWithDoors = 0
    // Peak rate (Lot 4.1) — fenêtre glissante de 15 minutes max parmi tous les events
    let peakRate = 0
    let peakWindow = null

    for (const [eventId, ev] of shopMap) {
      if (windowed) {
        // Fenêtre horaire active : ne compte que l'activité observée DANS la
        // plage — span windowFirst..windowLast, même sémantique que last-first+1.
        totalTxn += ev.windowTxns
        if (ev.windowFirst != null) {
          totalMinutes += Math.max(ev.windowLast - ev.windowFirst + 1, 1)
        }
      } else {
        totalTxn += ev.totalTransactions
        const dur = ev.lastMinute - ev.firstMinute + 1
        totalMinutes += Math.max(dur, 1)
      }
      first60Txn += ev.first60
      if (doorsMap.has(eventId)) evWithDoors += 1

      // Peak 15 min : balaye chaque minute, somme txn dans [m, m+14].
      // Toujours PLEIN évènement, fenêtre ou pas (décision produit BUG-287-01).
      const sortedMinutes = [...ev.perMinute.keys()].sort((a, b) => a - b)
      for (const m of sortedMinutes) {
        let sum = 0
        for (let k = 0; k < 15; k++) {
          sum += ev.perMinute.get(m + k) || 0
        }
        const rate = sum / 15
        if (rate > peakRate) {
          peakRate = rate
          peakWindow = { eventId, startMinute: m, endMinute: m + 14, transactions: sum }
        }
      }
    }

    const transactionRate = totalMinutes > 0 ? totalTxn / totalMinutes : 0
    const first60Minutes = 60 * evWithDoors
    const first60MinTransactionRate = first60Minutes > 0 ? first60Txn / first60Minutes : 0

    return {
      ...shop,
      transactionRate,
      operatingMinutes: totalMinutes,
      totalTransactionsFromTimeline: totalTxn,
      first60MinTransactionRate,
      first60MinTransactions: first60Txn,
      peakTransactionRate: peakRate,
      peakWindow,
    }
  })
}
