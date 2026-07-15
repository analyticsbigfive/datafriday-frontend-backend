/**
 * useShopPerformance — port simplifié du calcul React `enrichShopDataWithTransactionRate`.
 *
 * Charge à la demande la timeline (minute par minute) des évènements filtrés et
 * calcule par shop :
 *   - transactionRate          (txn/min, total transactions / minutes opérationnelles)
 *   - first60MinTransactionRate (txn/min sur la première heure après doors opening)
 *   - peakTransactionRate      (txn/min — pic glissant sur 15 minutes, cf. modifs.yaml 4.1)
 *   - operatingMinutes         (somme des fenêtres last-first par event)
 *   - totalTransactions, totalRevenue, eventCount
 *
 * Le calcul est cohérent avec la version React (operating minutes = window
 * shop-spécifique par event, pas la durée du show).
 */
import { ref, computed } from 'vue'
import { getSpaceEventTimelineBatch } from '@/api/endpoints/space.api'

function parseHHMM(t) {
  if (!t || typeof t !== 'string') return null
  const [h, m] = t.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

export function useShopPerformance({ shopGranularData, spaceId }) {
  const shops = ref([])
  const loading = ref(false)
  const enriched = ref(false)
  let lastKey = ''

  // Somme des transactionRate de tous les shops — utilisée par le KPI
  // "Transaction Rate" du header / FinancialMetricsGrid quand le panel est ouvert.
  const totalTransactionRate = computed(() =>
    shops.value.reduce((s, sh) => s + (sh.transactionRate || 0), 0),
  )

  function reset() {
    shops.value = []
    enriched.value = false
    lastKey = ''
  }

  /**
   * Calcule les agrégats par shop à partir des records granulaires (revenue,
   * transactions, eventCount). Le `transactionRate` n'est pas calculé ici — il
   * sera ajouté par `enrich()` après chargement de la timeline.
   */
  function aggregateBaseShops(events) {
    const eventIds = new Set(events.map((e) => e.id))
    const byShop = new Map()
    for (const r of shopGranularData.value || []) {
      if (!eventIds.has(r.eventId)) continue
      const id = r.shopName || '—'
      let s = byShop.get(id)
      if (!s) {
        s = {
          elementId: id,
          elementName: id,
          shopName: id,
          totalRevenue: 0,
          totalTransactions: 0,
          totalQuantity: 0,
          eventCount: 0,
          _eventIds: new Set(),
          // métriques timeline (remplies par enrich)
          transactionRate: 0,
          operatingMinutes: 0,
          first60MinTransactionRate: 0,
          first60MinTransactions: 0,
          peakTransactionRate: 0,
          peakWindow: null,
        }
        byShop.set(id, s)
      }
      s.totalRevenue += r.revenue || 0
      s.totalTransactions += r.transactionCount || 0
      s.totalQuantity += r.quantity || 0
      s._eventIds.add(r.eventId)
    }
    for (const s of byShop.values()) {
      s.eventCount = s._eventIds.size
      delete s._eventIds
    }
    return [...byShop.values()].sort((a, b) => b.totalRevenue - a.totalRevenue)
  }

  /**
   * Charge la timeline pour une liste d'évènements en utilisant l'API réelle uniquement.
   */
  async function loadAllTimelines(events) {
    const sid = typeof spaceId === 'object' ? spaceId.value : spaceId
    if (!sid) return []
    try {
      const byEventId = await getSpaceEventTimelineBatch(sid, events.map((ev) => ev.id))
      return events.flatMap((ev) => {
        const data = byEventId.get(ev.id) || []
        return Array.isArray(data) && data.length ? data.map((r) => ({ ...r, eventId: ev.id })) : []
      })
    } catch (err) {
      console.error('[useShopPerformance] API error loading batched timeline:', err?.message)
      return []
    }
  }

  /**
   * Pour chaque shop, calcule les rates à partir de la timeline.
   * Records timeline attendus : { eventId, shopId|shopName, minute (HH:MM),
   * totalQuantity, totalRevenue }. Le transactionCount est dérivé de
   * `totalQuantity` (1 ligne ≈ 1 ticket d'achat) si non fourni.
   */
  function computeRatesFromTimeline(baseShops, events, allTimelineData) {
    // Map eventId → doorsOpening en minutes
    const doorsMap = new Map()
    for (const ev of events) {
      const t = ev?.sessions?.[0]?.doorsOpening
      const m = parseHHMM(t)
      if (m != null) doorsMap.set(ev.id, m)
    }

    // shop → event → { txns, firstMinute, lastMinute, first60Txns, perMinute Map }
    //
    // BUG FIX : les records timeline portent à la fois `shopName` et `shopId`
    // (deux champs distincts — cf. STATISTIQUES_REFERENCE.md §6.3), alors que
    // les shops de base sont indexés par `shopName` (`elementId = shopName`).
    // L'ancienne clé `r.shopId || r.shopName` indexait donc la timeline par
    // `shopId` (un identifiant ≠ du nom), si bien que `stats.get(shop.elementId)`
    // ne trouvait jamais rien → `operatingMinutes = 0` et `transactionRate = 0`
    // pour TOUS les shops. On indexe désormais par `shopName` et on conserve une
    // table d'alias shopId/shopName → clé primaire pour rester robuste quelle que
    // soit la convention de clé renvoyée par le backend.
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
        }
        shopMap.set(eventId, evStats)
      }
      evStats.totalTransactions += txn
      if (minutes < evStats.firstMinute) evStats.firstMinute = minutes
      if (minutes > evStats.lastMinute) evStats.lastMinute = minutes
      evStats.perMinute.set(minutes, (evStats.perMinute.get(minutes) || 0) + txn)

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
        totalTxn += ev.totalTransactions
        const dur = ev.lastMinute - ev.firstMinute + 1
        totalMinutes += Math.max(dur, 1)
        first60Txn += ev.first60
        if (doorsMap.has(eventId)) evWithDoors += 1

        // Peak 15 min : balaye chaque minute, somme txn dans [m, m+14]
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

  /**
   * Point d'entrée public. Idempotent par clé d'évènements : si la même
   * sélection d'events est demandée, on ne re-fetch pas.
   */
  async function enrich(events) {
    if (!events || events.length === 0) {
      reset()
      return
    }
    const key = events.map((e) => e.id).sort().join(',')
    const base = aggregateBaseShops(events)
    if (key === lastKey && enriched.value) {
      // Déjà enrichi pour cette sélection
      return
    }
    lastKey = key
    loading.value = true
    try {
      const timeline = await loadAllTimelines(events)
      shops.value = computeRatesFromTimeline(base, events, timeline)
      enriched.value = true
    } catch (err) {
      // En cas d'échec, on garde au moins les agrégats de base
      shops.value = base
      enriched.value = false
    } finally {
      loading.value = false
    }
  }

  return {
    shops,
    loading,
    enriched,
    totalTransactionRate,
    enrich,
    reset,
  }
}
