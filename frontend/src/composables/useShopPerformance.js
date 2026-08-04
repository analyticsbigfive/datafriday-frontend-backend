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
 *
 * BUG-287-01 — plage horaire (`filters.selectedTimeRange`) :
 *   `shops` est un computed dérivé de (timeline brute, events, timeRange). Le
 *   fetch reste imperatif (`enrich`), mais le calcul se rejoue à chaque
 *   changement de plage horaire — SANS refetch. Fenêtre active :
 *   transactionRate/operatingMinutes fenêtrés + agrégats de base recalculés
 *   depuis la timeline fenêtrée (shopGranularData n'a pas de minute). first60
 *   et peak restent plein évènement (décisions produit, cf.
 *   utils/shopPerformanceCompute.js et docs/bugs/287_01_*.md).
 */
import { ref, shallowRef, computed } from 'vue'
import { getSpaceEventTimelineBatch } from '@/api/endpoints/space.api'
import { hasActiveRange } from '@/utils/timelineBucketing'
import {
  aggregateBaseShops,
  aggregateShopsFromTimeline,
  computeRatesFromTimeline,
} from '@/utils/shopPerformanceCompute'

export function useShopPerformance({ shopGranularData, spaceId, timeRange = null }) {
  const loading = ref(false)
  const enriched = ref(false)
  // Timeline brute du dernier fetch + snapshot des events correspondants.
  // shallowRef : gros volume (1 ligne / minute / shop / produit), lecture seule.
  const timelineData = shallowRef([])
  const timelineEvents = shallowRef([])
  let lastKey = ''

  // Dérivation pure : se rejoue quand la plage horaire, les records shop-level
  // ou la timeline changent. `lastKey` ne gate plus que le fetch.
  const shops = computed(() => {
    const events = timelineEvents.value
    if (!events.length) return []
    const range = typeof timeRange === 'object' && timeRange !== null && 'value' in timeRange
      ? timeRange.value
      : timeRange
    const windowed = hasActiveRange(range) && enriched.value
    // Fenêtre active : les agrégats de base (CA/transactions/quantité) viennent
    // de la timeline fenêtrée — shopGranularData n'a pas de colonne minute.
    const base = windowed
      ? aggregateShopsFromTimeline(timelineData.value, events, range)
      : aggregateBaseShops(shopGranularData.value || [], events)
    if (!enriched.value) return base // échec fetch : agrégats de base seuls
    return computeRatesFromTimeline(base, events, timelineData.value, {
      timeRange: windowed ? range : null,
    })
  })

  // Somme des transactionRate de tous les shops — utilisée par le KPI
  // "Transaction Rate" du header / FinancialMetricsGrid quand le panel est ouvert.
  const totalTransactionRate = computed(() =>
    shops.value.reduce((s, sh) => s + (sh.transactionRate || 0), 0),
  )

  function reset() {
    timelineData.value = []
    timelineEvents.value = []
    enriched.value = false
    lastKey = ''
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
   * Point d'entrée public. Idempotent par clé d'évènements : si la même
   * sélection d'events est demandée, on ne re-fetch pas (le calcul, lui, est
   * réactif via le computed `shops`).
   */
  async function enrich(events) {
    if (!events || events.length === 0) {
      reset()
      return
    }
    const key = events.map((e) => e.id).sort().join(',')
    if (key === lastKey && enriched.value) {
      // Déjà enrichi pour cette sélection
      return
    }
    lastKey = key
    loading.value = true
    try {
      const timeline = await loadAllTimelines(events)
      timelineData.value = timeline
      timelineEvents.value = events
      enriched.value = true
    } catch (err) {
      // En cas d'échec, on garde au moins les agrégats de base (enriched=false
      // → le computed rend la base seule) et on autorise un retry : sans le
      // reset de lastKey, un échec gelait définitivement la sélection.
      timelineData.value = []
      timelineEvents.value = events
      enriched.value = false
      lastKey = ''
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
