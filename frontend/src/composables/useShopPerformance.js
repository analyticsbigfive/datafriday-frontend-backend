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
import { ref, shallowRef, computed, unref } from 'vue'
import { getSpaceEventTimelineBatch, getSpaceTransactionBasketsBatch } from '@/api/endpoints/space.api'
import { hasActiveRange } from '@/utils/timelineBucketing'
import {
  aggregateBaseShops,
  aggregateShopsFromTimeline,
  computeRatesFromTimeline,
} from '@/utils/shopPerformanceCompute'

/**
 * BUG-364-01 — mode « sources partagées » : quand l'appelant possède DÉJÀ la timeline et
 * les paniers (AnalyseView via useAnalyseItemRecords/useTransactionBaskets), les passer en
 * `sharedTimelineRecords`/`sharedBasketRecords` (+ `sharedReady`) supprime le re-fetch ET
 * le re-stockage : ce composable était le 5ᵉ point de rétention mémoire de la page
 * (~164 Mo re-téléchargés puis re-gardés en double). Sans ces params, l'ancien mode
 * autonome (fetch batch idempotent par sélection) reste intact pour les autres appelants.
 */
export function useShopPerformance({
  shopGranularData,
  spaceId,
  timeRange = null,
  sharedTimelineRecords = null,
  sharedBasketRecords = null,
  sharedReady = null,
}) {
  const usingShared = !!(sharedTimelineRecords && sharedBasketRecords)
  const loading = ref(false)
  const enriched = ref(false)
  // Timeline brute du dernier fetch + snapshot des events correspondants.
  // shallowRef : gros volume (1 ligne / minute / shop / produit), lecture seule.
  const timelineData = shallowRef([])
  // BUG-354-01 — source TICKET du txn/min : une ligne par panier, alors que la
  // timeline est au grain article (un ticket de 3 articles distincts y comptait 3).
  const basketData = shallowRef([])
  const timelineEvents = shallowRef([])
  let lastKey = ''

  // Dérivation pure : se rejoue quand la plage horaire, les records shop-level
  // ou la timeline changent. `lastKey` ne gate plus que le fetch.
  // BUG-364-01 — sources effectives : refs partagées (aucune copie) ou stockage local
  // du mode autonome. `ready` = sources terminales (partagé : l'appelant le dit ;
  // autonome : le fetch a abouti).
  const _timeline = () => (usingShared ? unref(sharedTimelineRecords) || [] : timelineData.value)
  const _baskets = () => (usingShared ? unref(sharedBasketRecords) || [] : basketData.value)
  const _ready = () => (usingShared ? !!unref(sharedReady) : enriched.value)

  const shops = computed(() => {
    const events = timelineEvents.value
    if (!events.length) return []
    const range = typeof timeRange === 'object' && timeRange !== null && 'value' in timeRange
      ? timeRange.value
      : timeRange
    const ready = _ready()
    const windowed = hasActiveRange(range) && ready
    // Fenêtre active : les agrégats de base (CA/transactions/quantité) viennent
    // de la timeline fenêtrée — shopGranularData n'a pas de colonne minute.
    // BUG-350-01 — plus de repli sur les agrégats de base tant que la timeline
    // n'a pas répondu. L'ancien `if (!enriched) return base` publiait des chiffres
    // shop-level (autre moteur de calcul, cf. fiche 350-01) sous les libellés du
    // panneau, puis les remplaçait : c'était la même valeur provisoire que celle
    // retirée de la bande KPI, au même moment, avec un écart du même ordre.
    // Vide + `loading` du composable → le panneau montre son état de chargement.
    if (!ready) return []
    const base = windowed
      ? aggregateShopsFromTimeline(_timeline(), events, range)
      : aggregateBaseShops(shopGranularData.value || [], events)
    // BUG-354-01 — CA/quantités depuis la timeline, TRANSACTIONS et txn/min depuis les
    // paniers : `computeRatesFromTimeline` pose lui-même `totalTransactions` à partir de
    // la source qu'on lui donne, en réutilisant sa résolution d'alias shopName/shopId.
    return computeRatesFromTimeline(base, events, _baskets(), {
      timeRange: windowed ? range : null,
    })
  })

  function reset() {
    timelineData.value = []
    basketData.value = []
    timelineEvents.value = []
    enriched.value = false
    lastKey = ''
  }

  /**
   * Charge la timeline pour une liste d'évènements en utilisant l'API réelle uniquement.
   */
  async function loadAllTimelines(events) {
    const sid = typeof spaceId === 'object' ? spaceId.value : spaceId
    if (!sid) return { timeline: [], baskets: [] }
    const ids = events.map((ev) => ev.id)
    const flatten = (byEventId) =>
      events.flatMap((ev) => {
        const data = byEventId?.get(ev.id) || []
        return Array.isArray(data) && data.length ? data.map((r) => ({ ...r, eventId: ev.id })) : []
      })
    // BUG-354-01 — deux sources : la timeline (CA, quantités) et les paniers
    // (tickets). `allSettled` : une source KO ne doit pas emporter l'autre.
    const [tl, bk] = await Promise.allSettled([
      getSpaceEventTimelineBatch(sid, ids),
      getSpaceTransactionBasketsBatch(sid, ids),
    ])
    if (tl.status === 'rejected') {
      console.error('[useShopPerformance] API error loading batched timeline:', tl.reason?.message)
    }
    if (bk.status === 'rejected') {
      console.error('[useShopPerformance] API error loading batched baskets:', bk.reason?.message)
    }
    return {
      timeline: tl.status === 'fulfilled' ? flatten(tl.value) : [],
      baskets: bk.status === 'fulfilled' ? flatten(bk.value) : [],
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
    // BUG-364-01 — mode partagé : rien à télécharger, on mémorise juste la sélection
    // d'events ; les données vivent dans les composables sources et `shops` est réactif.
    if (usingShared) {
      timelineEvents.value = events
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
      const { timeline, baskets } = await loadAllTimelines(events)
      timelineData.value = timeline
      basketData.value = baskets
      timelineEvents.value = events
      enriched.value = true
    } catch (err) {
      // En cas d'échec, on garde au moins les agrégats de base (enriched=false
      // → le computed rend la base seule) et on autorise un retry : sans le
      // reset de lastKey, un échec gelait définitivement la sélection.
      timelineData.value = []
      basketData.value = []
      timelineEvents.value = events
      enriched.value = false
      lastKey = ''
    } finally {
      loading.value = false
    }
  }

  return {
    shops,
    // Mode partagé : l'état de chargement est celui des sources (l'appelant sait quand
    // elles sont terminales) — pas celui d'un fetch local qui n'existe plus.
    loading: usingShared
      ? computed(() => timelineEvents.value.length > 0 && !_ready())
      : loading,
    enriched: usingShared ? computed(() => _ready()) : enriched,
    enrich,
    reset,
  }
}
