import { ref, shallowRef, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getSpaceEventTimelineBatch } from '@/api/endpoints/space.api'
import { preprocessTimelineRecords } from '@/utils/timelineBucketing'
import { reconcileRecord } from '@/utils/analyseReconciliation'
import { useReconciliationContext } from '@/composables/useReconciliationContext'
import store from '@/store'

const MAX_EVENTS = 50

// Une seule alerte par session, tous composables confondus (AnalyseView monte
// deux instances : courante + comparaison) — même pattern que
// `_warnedPredictionDegraded` (SpaceRestockView, fiche 19).
let _warnedBatchKo = false

/**
 * Source item-level pour les vues « par article » de l'Analyse (Item performance,
 * Menu items by POS). `shop-details` (shopGranularData) est shop-level : aucun
 * article. Seul `event-timeline/:eventId` porte le grain article (libellés bruts
 * Weezevent). Ce composable précharge `event-timeline` pour TOUS les events
 * visibles (`filteredEvents`) et agrège leurs records → permet « Item performance »
 * en VUE GLOBALE (tous events), pas seulement quand un seul event est sélectionné.
 *
 * Cache par eventId : un event déjà chargé n'est jamais rechargé. Le changement de
 * `filteredEvents` (sélection / configuration / filtres) recompose la sortie depuis
 * le cache et ne fetch que les events manquants.
 *
 * @param {import('vue').ComputedRef<Array<{id:string}>>} filteredEvents
 * @param {{ maxEvents?: number }} [options] — cap de fetch (défaut MAX_EVENTS) ;
 *   l'instance comparaison (fenêtres prev∪N-1 jusqu'à 24 mois) passe un cap élevé.
 * @returns {{ itemRecords: import('vue').ComputedRef<Array<object>>, loading: import('vue').Ref<boolean>, loadedEventIds: import('vue').ComputedRef<Set<string>>, fetchError: import('vue').Ref<string|null>, refresh: () => Promise<void> }}
 */
export function useAnalyseItemRecords(filteredEvents, { maxEvents = MAX_EVENTS } = {}) {
  const route = useRoute()
  // Contexte de réconciliation PARTAGÉ (cf. useReconciliationContext) — surtout
  // pas reconstruit ici : la timeline et les records de scénario Predict se
  // réconcilient avec le même, sinon une même ligne peut recevoir deux
  // catégories différentes selon le consommateur.
  const reconciliationCtx = useReconciliationContext()
  // eventId -> records[] (preprocessés, GELÉS). [] = tenté/vide.
  // BUG-284 : shallowRef + Object.freeze — avec un ref() profond, chaque lecture
  // de propriété dans les ~20 agrégations aval traversait un Proxy Vue (surcoût
  // dominant sur les vieux CPU). Les écritures se font déjà exclusivement par
  // réassignation (`cache.value = { ...cache.value, ...patch }`), la réactivité
  // superficielle suffit. Même pattern que analyse.js (Object.freeze) et
  // usePredictiveTimeline.js (shallowRef).
  const cache = shallowRef({})
  // Gel des lignes ET du tableau : reconcileRecord/les consommateurs ne mutent
  // jamais les records (map → objets neufs) — vérifié avant bascule.
  function freezeRows(rows) {
    for (const r of rows) Object.freeze(r)
    return Object.freeze(rows)
  }
  const loading = ref(false)
  const fetchError = ref(null)
  let abortController = null

  async function ensureLoaded(events) {
    const list = (events || []).slice(0, maxEvents)
    const missing = list.filter((e) => e?.id && !(e.id in cache.value))
    if (!missing.length) return

    if (abortController) abortController.abort()
    const controller = new AbortController()
    abortController = controller
    loading.value = true

    const spaceId = route.params.spaceId
    const ids = missing.map((e) => e.id)
    try {
      // Un seul appel batch pour tous les events manquants (le backend résout
      // shopIds/ownership/scope d'intégration une fois pour le space, pas par event).
      const byEventId = await getSpaceEventTimelineBatch(spaceId, ids)
      if (controller.signal.aborted) return
      const patch = {}
      for (const id of ids) {
        const data = byEventId.get(id) || []
        const raw = Array.isArray(data) ? data.map((r) => ({ ...r, eventId: id })) : []
        patch[id] = freezeRows(preprocessTimelineRecords(raw, {
          menuItemCostMap: store.state.analyse.menuItemCostMap || {},
        }))
      }
      // Nouvelle référence pour déclencher la réactivité du computed.
      cache.value = { ...cache.value, ...patch }
    } catch (err) {
      if (controller.signal.aborted) return
      console.warn(`[useAnalyseItemRecords] event-timeline batch KO (${err?.message})`)
      // Sans signalement, l'échec est indistinguable d'un « 0 article pour cette
      // configuration » (fiche 164) — on remonte l'erreur une fois par session.
      if (!_warnedBatchKo) {
        _warnedBatchKo = true
        fetchError.value = err?.message || 'event-timeline batch failed'
      }
      // marque tout comme tenté → pas de refetch en boucle
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
    (evs) => { ensureLoaded(evs) },
    { immediate: true },
  )

  // Module Live (docs/modules/11_LIVE.md) : re-fetch en bypassant le cache session
  // de `getSpaceEventTimelineBatch` pour les events actuellement visibles — un event
  // EN COURS n'est pas immuable comme le suppose ce cache pour un event passé.
  // N'affecte pas `ensureLoaded`/le cache par défaut pour les autres consommateurs.
  async function refresh() {
    const list = (filteredEvents.value || []).filter((e) => e?.id)
    if (!list.length) return

    if (abortController) abortController.abort()
    const controller = new AbortController()
    abortController = controller
    loading.value = true

    const spaceId = route.params.spaceId
    const ids = list.map((e) => e.id)
    try {
      const byEventId = await getSpaceEventTimelineBatch(spaceId, ids, { bypassCache: true })
      if (controller.signal.aborted) return
      const patch = {}
      for (const id of ids) {
        const data = byEventId.get(id) || []
        const raw = Array.isArray(data) ? data.map((r) => ({ ...r, eventId: id })) : []
        patch[id] = freezeRows(preprocessTimelineRecords(raw, {
          menuItemCostMap: store.state.analyse.menuItemCostMap || {},
        }))
      }
      cache.value = { ...cache.value, ...patch }
      _warnedBatchKo = false
    } catch (err) {
      if (controller.signal.aborted) return
      console.warn(`[useAnalyseItemRecords] refresh KO (${err?.message})`)
    } finally {
      if (!controller.signal.aborted) loading.value = false
      if (abortController === controller) abortController = null
    }
  }

  // Records agrégés de tous les events VISIBLES (restreints en amont par
  // sélection / configuration via filteredEvents). Les records event-timeline portent
  // des libellés bruts Weezevent → on les RÉCONCILIE (MÊME util que le getter
  // shop-level) : cascade catalogue DataFriday → champs backend → produit Weezevent
  // (nature/subnature) → sentinelle UNATTACHED_*_KEY.
  const itemRecords = computed(() => {
    const out = []
    for (const e of filteredEvents.value || []) {
      const recs = cache.value[e?.id]
      if (recs && recs.length) out.push(...recs)
    }
    return out.map((r) => reconcileRecord(r, reconciliationCtx.value))
  })

  // Events réellement fetchés (cap inclus, batch KO = [] compté « tenté ») —
  // permet aux consommateurs d'aligner leurs comptages (eventCount) sur les
  // records effectivement disponibles.
  const loadedEventIds = computed(() => new Set(Object.keys(cache.value)))

  /** BUG-285 : purge (changement d'espace in-page — les eventIds de l'ancien espace
      ne seront plus jamais demandés, leurs lignes resteraient en mémoire). */
  function clearCache() {
    cache.value = {}
  }

  return { itemRecords, loading, loadedEventIds, fetchError, refresh, clearCache }
}
