/**
 * useComparisonTimeline : courbe minute par minute du rapport de COMPARAISON.
 *
 * Un seul event : la courbe s'ouvre toute seule (comme dans le principal). Plusieurs events : elle
 * s'ouvre à la demande (bouton « Moyenne ») et montre la moyenne alignée sur le coup d'envoi.
 * Les lignes chargées passent par la même réconciliation et le même prédicat de filtres que le
 * reste du rapport. Rien n'est écrit dans le store du principal.
 */
import { ref, shallowRef, computed, watch, unref, getCurrentScope, onScopeDispose } from 'vue'
import defaultStore from '@/store'
import { getSpaceEventTimelineBatch } from '@/api/endpoints/space.api'
import {
  planTimelineLoad,
  assembleTimelineRecords,
  timelineHeaderLabelOf,
} from '@/utils/timelineLoadPlan'

/**
 * @param {Object} p
 * @param {import('vue').Ref<Array>} p.events  events du rapport
 * @param {import('vue').Ref<boolean>} p.enabled  false : jamais de courbe (Predict, droits)
 * @param {import('vue').Ref<string|null>} p.spaceId
 * @param {(record: object) => object} p.reconcile  réconciliation des lignes (contexte du rapport)
 * @param {import('vue').Ref<(record: object) => boolean>} p.predicate  prédicat de filtres du rapport
 * @param {object} [p.store]
 */
export function useComparisonTimeline({
  events, enabled, spaceId, reconcile, predicate, store = defaultStore,
}) {
  // Courbe affichée à la place des barres.
  const active = ref(false)
  const loading = ref(false)
  const failed = ref(false)
  // shallowRef : tableau minute volumineux, jamais muté en place (même règle que le principal).
  const rawRecords = shallowRef([])
  const selected = ref(null)
  const eventsList = ref([])
  const skippedEvents = ref([])
  let controller = null

  const eventsKey = computed(() => (unref(events) || []).map((e) => e.id).join('|'))
  const headerLabel = computed(() => timelineHeaderLabelOf(eventsList.value, selected.value))

  // Réconciliation (coûteuse, indépendante des filtres) puis filtres : deux computeds, comme le principal.
  const reconciled = computed(() => (rawRecords.value.length ? rawRecords.value.map(reconcile) : []))
  const records = computed(() => reconciled.value.filter(unref(predicate)))

  async function load() {
    const list = unref(events) || []
    if (!unref(enabled) || !list.length) {
      close()
      return
    }
    if (controller) controller.abort()
    const mine = new AbortController()
    controller = mine

    const plan = planTimelineLoad(list)
    selected.value = plan.selected
    eventsList.value = plan.eventsList
    skippedEvents.value = plan.skippedEvents
    active.value = true
    loading.value = true
    failed.value = false
    try {
      const byEventId = await getSpaceEventTimelineBatch(unref(spaceId), plan.idsToFetch, {})
      // Lot 4b : coûts figés des events chargés (ne lève jamais, échec = repli sur le coût actuel).
      await store.dispatch?.('analyse/ensureEventCosts', plan.idsToFetch)
      if (mine.signal.aborted) return
      rawRecords.value = assembleTimelineRecords(plan, byEventId, store.state.analyse?.menuItemCostMap || {}, store.state.analyse?.menuItemCostByEvent)
    } catch (err) {
      if (mine.signal.aborted) return
      console.error('[useComparisonTimeline] erreur chargement', err)
      rawRecords.value = []
      failed.value = true
      // Repli sur les barres : la courbe sans données ne dirait rien.
      active.value = false
    } finally {
      if (!mine.signal.aborted) loading.value = false
      if (controller === mine) controller = null
    }
  }

  /** Ouvre la courbe (bouton « Moyenne », ou ouverture automatique d'un event unique). */
  function open() {
    return load()
  }

  /** Revient aux barres. */
  function close() {
    if (controller) {
      controller.abort()
      controller = null
    }
    active.value = false
    loading.value = false
    rawRecords.value = []
    selected.value = null
    eventsList.value = []
    skippedEvents.value = []
  }

  // Le périmètre change : un event unique rouvre sa courbe, un jeu de plusieurs events recharge la
  // moyenne si elle était ouverte, sinon on revient aux barres.
  watch(eventsKey, () => {
    const n = (unref(events) || []).length
    if (!unref(enabled) || n === 0) {
      close()
    } else if (n === 1 || active.value) {
      load()
    }
  }, { immediate: true })

  watch(() => unref(enabled), (on) => { if (!on && active.value) close() })

  if (getCurrentScope()) onScopeDispose(() => controller?.abort())

  return { active, loading, failed, records, selected, headerLabel, skippedEvents, open, close }
}
