import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getSpaceTransactionBasketsBatch } from '@/api/endpoints/space.api'

const MAX_EVENTS = 50

// Une seule alerte par session, tous consommateurs confondus — même pattern que
// `_warnedBatchKo` dans useAnalyseItemRecords.
let _warnedBatchKo = false

/**
 * Combinaisons de catégories/articles PAR TRANSACTION pour les events visibles.
 *
 * Alimente `TransactionCategoryMixChart` (donut « Répartition des catégories de
 * produits par transaction »). Structure identique à `useAnalyseItemRecords` :
 * cache par eventId, un seul appel batch pour les events manquants, `refresh()`
 * qui bypasse le cache session pour le module Live.
 *
 * Pourquoi une source dédiée plutôt que de dériver des records item-level : ces
 * derniers sont agrégés par (minute × PdV × article) et ont PERDU l'identité du
 * panier — impossible de savoir a posteriori quelles lignes ont été achetées
 * ensemble. Seul cet endpoint la préserve.
 *
 * @param {import('vue').ComputedRef<Array<{id:string}>>} filteredEvents
 * @param {{ maxEvents?: number }} [options]
 */
export function useTransactionBaskets(filteredEvents, { maxEvents = MAX_EVENTS } = {}) {
  const route = useRoute()
  const cache = ref({}) // eventId -> BasketComboRecord[]. [] = tenté/vide.
  const loading = ref(false)
  const fetchError = ref(null)
  let abortController = null

  /** Charge les events absents du cache. Les events déjà tentés ne sont jamais refetchés. */
  async function load(events, { bypassCache = false } = {}) {
    const list = (events || []).filter((e) => e?.id).slice(0, maxEvents)
    const targets = bypassCache ? list : list.filter((e) => !(e.id in cache.value))
    if (!targets.length) return

    if (abortController) abortController.abort()
    const controller = new AbortController()
    abortController = controller
    loading.value = true

    const spaceId = route.params.spaceId
    const ids = targets.map((e) => e.id)
    try {
      const byEventId = await getSpaceTransactionBasketsBatch(spaceId, ids, { bypassCache })
      if (controller.signal.aborted) return
      const patch = {}
      for (const id of ids) {
        const data = byEventId.get(id) || []
        patch[id] = Array.isArray(data) ? data.map((r) => ({ ...r, eventId: id })) : []
      }
      // Nouvelle référence pour déclencher la réactivité du computed.
      cache.value = { ...cache.value, ...patch }
      if (bypassCache) _warnedBatchKo = false
    } catch (err) {
      if (controller.signal.aborted) return
      console.warn(`[useTransactionBaskets] transaction-baskets batch KO (${err?.message})`)
      // Sans signalement, un échec réseau est indistinguable d'un « aucune vente sur
      // ce périmètre » — et le donut afficherait un vide silencieux.
      if (!_warnedBatchKo) {
        _warnedBatchKo = true
        fetchError.value = err?.message || 'transaction-baskets batch failed'
      }
      // Marque comme tenté → pas de refetch en boucle.
      const patch = {}
      for (const id of ids) patch[id] = []
      cache.value = { ...cache.value, ...patch }
    } finally {
      if (!controller.signal.aborted) loading.value = false
      if (abortController === controller) abortController = null
    }
  }

  watch(
    filteredEvents,
    (evs) => { load(evs) },
    { immediate: true },
  )

  /**
   * Module Live : re-fetch en bypassant le cache session — un event EN COURS n'est
   * pas immuable, contrairement à l'hypothèse qui justifie ce cache pour un event
   * passé. Branché sur `livePoll` dans AnalyseView ; sans ça le donut se figerait
   * pendant que le reste de la page tique.
   */
  function refresh() {
    return load(filteredEvents.value, { bypassCache: true })
  }

  /** Records de tous les events VISIBLES, recomposés depuis le cache. */
  const basketRecords = computed(() => {
    const out = []
    for (const e of filteredEvents.value || []) {
      const recs = cache.value[e?.id]
      if (recs && recs.length) out.push(...recs)
    }
    return out
  })

  /** Events réellement chargés — permet d'aligner un comptage sur le réel. */
  const loadedEventIds = computed(() => new Set(Object.keys(cache.value)))

  return { basketRecords, loading, fetchError, loadedEventIds, refresh }
}
