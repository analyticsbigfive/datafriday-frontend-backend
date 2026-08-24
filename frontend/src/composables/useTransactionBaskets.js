import { ref, shallowRef, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getSpaceTransactionBasketsBatch } from '@/api/endpoints/space.api'
import { ITEM_LEVEL_EVENT_CAP } from '@/composables/useAnalyseItemRecords'

// BUG-354-01 : MÊME cap que l'item-level. Depuis que les paniers alimentent le KPI
// transactions (et le txn/min), deux caps différents (50 ici, 100 là) publieraient un
// CA calculé sur 100 events et des transactions calculées sur 50 — un sous-comptage
// silencieux, et un panier moyen faux, exactement ce qu'interdit BUG-350-01.
const MAX_EVENTS = ITEM_LEVEL_EVENT_CAP

/** Cap exposé pour l'affichage du message de troncature (cf. ITEM_LEVEL_EVENT_CAP). */
export const BASKET_EVENT_CAP = MAX_EVENTS

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
  // eventId -> BasketComboRecord[] (GELÉS). [] = tenté/vide.
  // BUG-285 : shallowRef + Object.freeze, même traitement que useAnalyseItemRecords
  // (BUG-284) — écritures exclusivement par réassignation, les consommateurs ne
  // mutent jamais les lignes (reconcileRecord → objets neufs).
  const cache = shallowRef({})
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
        const rows = Array.isArray(data) ? data.map((r) => Object.freeze({ ...r, eventId: id })) : []
        patch[id] = Object.freeze(rows)
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

  // BUG-354-01 — events du périmètre écartés par le cap, remontés comme le fait déjà
  // `useAnalyseItemRecords` : un total tronqué doit le dire.
  const truncatedEventCount = computed(() =>
    Math.max(0, (filteredEvents.value || []).length - maxEvents),
  )

  // BUG-354-01 — état de la source paniers, MÊME contrat à 3 valeurs que l'item-level
  // (`useAnalyseItemRecords.sourceState`). Depuis que les paniers sont la source des
  // transactions, la bande KPI doit pouvoir afficher son squelette pendant leur
  // chargement : sans ça, elle publierait la somme item-level — le nombre surcompté
  // que ce lot retire — puis le remplacerait. C'est la valeur provisoire interdite par
  // BUG-350-01. `[]` (chargé, aucun panier) est TERMINAL et ne doit pas figer l'écran.
  // Décision JLH 2026-08-24 (carte TX/MIN) : 'ready' n'est publié que lorsque TOUS
  // les events scopés ont été tentés. L'ancien ordre (`if (basketRecords.length)
  // return 'ready'`) publiait 'ready' dès le premier record en cache alors que
  // d'autres events étaient encore en vol (sélection élargie, cache partiel d'un
  // autre consommateur) → les KPI dérivés (Σ des taux par PdV, transactions,
  // panier moyen) affichaient une somme PARTIELLE destinée à bouger — la valeur
  // provisoire interdite par BUG-350-01. `[]` posé sur un event en échec compte
  // comme « tenté » → pas de squelette éternel sur batch KO.
  const sourceState = computed(() => {
    const scoped = (filteredEvents.value || []).slice(0, maxEvents).filter((e) => e?.id)
    if (!scoped.length) return 'empty'
    if (loading.value) return 'loading'
    const attempted = loadedEventIds.value
    if (!scoped.every((e) => attempted.has(e.id))) return 'loading'
    return basketRecords.value.length ? 'ready' : 'empty'
  })

  /** BUG-285 : purge (changement d'espace in-page — les eventIds de l'ancien espace
      ne seront plus jamais demandés, leurs lignes resteraient en mémoire). */
  function clearCache() {
    cache.value = {}
  }

  return {
    basketRecords,
    loading,
    fetchError,
    loadedEventIds,
    truncatedEventCount,
    sourceState,
    refresh,
    clearCache,
  }
}
