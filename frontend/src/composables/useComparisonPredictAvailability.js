/**
 * useComparisonPredictAvailability : disponibilité de l'option Predict du formulaire de
 * comparaison. Une seule requête groupée et légère (GET /predict-versions/summary) pour savoir
 * quels events ont au moins un scénario sauvegardé, sans charger les scénarios eux-mêmes
 * (ceux-ci sont chargés par useComparisonPredictScenarios pour les events du rapport).
 * Repli sur le miroir localStorage d'Event Predict UNIQUEMENT si la requête échoue.
 * Cache : un event déjà examiné n'est jamais re-demandé.
 */
import { computed, ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import { getEventIdsWithPredictVersions } from '@/api/endpoints/eventPredict.api'

const LS_NS = 'analyse:'

/** Lecture localStorage tolérante (quota, mode privé, JSON invalide) ; jamais d'écriture. */
function hasLocalVersions(eventId) {
  try {
    const raw = localStorage.getItem(`${LS_NS}event-predict-versions:${eventId}`)
    const list = raw ? JSON.parse(raw) : null
    return Array.isArray(list) && list.length > 0
  } catch (_) {
    return false
  }
}

/**
 * @param {Object} p
 * @param {import('vue').Ref<Array>} p.events  events à examiner
 * @param {import('vue').Ref<boolean>} p.enabled  false = aucun appel
 */
export function useComparisonPredictAvailability({ events, enabled }) {
  // eventId -> true/false (a au moins une version). Une entrée = event déjà examiné.
  const hasVersionByEventId = shallowRef(new Map())
  const status = ref('idle') // 'idle' | 'loading' | 'ready'
  let token = 0

  async function load(list) {
    const missing = [...new Set((list || []).map((e) => e?.id).filter((id) => id && !hasVersionByEventId.value.has(id)))]
    if (!missing.length) {
      status.value = 'ready'
      return
    }
    const mine = ++token
    status.value = 'loading'
    const found = new Map()
    try {
      const withVersions = new Set(await getEventIdsWithPredictVersions(missing))
      for (const id of missing) found.set(id, withVersions.has(id))
    } catch (err) {
      console.warn('[comparaison] predict-versions/summary indisponible, repli localStorage', err?.message || err)
      for (const id of missing) found.set(id, hasLocalVersions(id))
    }
    if (mine !== token) return
    hasVersionByEventId.value = new Map([...hasVersionByEventId.value, ...found])
    status.value = 'ready'
  }

  watch(
    [events, enabled],
    ([list, on]) => {
      if (!on) {
        token += 1
        status.value = 'idle'
        return
      }
      load(list)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => { token += 1 })

  // Tant que le chargement tourne, `covered` ne contient que les events déjà examinés.
  const covered = computed(() => (events.value || []).filter((e) => hasVersionByEventId.value.get(e?.id) === true))

  return { hasVersionByEventId, status, covered }
}
