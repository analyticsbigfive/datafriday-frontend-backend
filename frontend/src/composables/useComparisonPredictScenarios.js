/**
 * useComparisonPredictScenarios : scénarios Event Predict des events d'un rapport de
 * comparaison de type Predict. LECTURE SEULE : interroge l'API predict-versions (source
 * autoritaire) et n'écrit ni dans le store du principal ni en localStorage.
 *
 * Choix du scénario d'un event : version active, sinon par défaut, sinon la plus récente
 * (pickScenarioVersion). Repli sur le miroir localStorage d'Event Predict si l'API échoue.
 * Les events sans scénario exploitable sont listés dans `excluded`.
 */
import { computed, ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import { listEventPredictVersions } from '@/api/endpoints/eventPredict.api'
import { runWithConcurrency } from '@/utils/asyncPool'
import { pickScenarioVersion, splitEventsByScenario } from '@/utils/comparisonPredictScenario'

const CONCURRENCY = 5
const LS_NS = 'analyse:'

/** Lecture localStorage tolérante (quota, mode privé, JSON invalide) ; jamais d'écriture. */
function lsRead(key) {
  try {
    const raw = localStorage.getItem(`${LS_NS}${key}`)
    return raw ? JSON.parse(raw) : null
  } catch (_) {
    return null
  }
}

/**
 * @param {Object} p
 * @param {import('vue').Ref<Array>} p.events  events à examiner
 * @param {import('vue').Ref<boolean>} p.enabled  false = aucun appel
 */
export function useComparisonPredictScenarios({ events, enabled }) {
  // eventId -> version retenue (ou null). Une entrée = event déjà examiné, jamais re-demandé.
  const versionByEventId = shallowRef(new Map())
  const status = ref('idle') // 'idle' | 'loading' | 'ready'
  let token = 0

  async function versionsOf(eventId) {
    try {
      const list = await listEventPredictVersions(eventId)
      return Array.isArray(list) ? list : []
    } catch (err) {
      console.warn('[comparaison] predict-versions indisponible, repli localStorage', err?.message || err)
      const local = lsRead(`event-predict-versions:${eventId}`)
      return Array.isArray(local) ? local : []
    }
  }

  async function load(list) {
    const missing = (list || []).filter((e) => e?.id && !versionByEventId.value.has(e.id))
    if (!missing.length) {
      status.value = 'ready'
      return
    }
    const mine = ++token
    status.value = 'loading'
    const found = new Map()
    await runWithConcurrency(missing, CONCURRENCY, async (e) => {
      const versions = await versionsOf(e.id)
      const activeId = lsRead(`event-predict-active-version:${e.id}`)?.activeVersionId || null
      found.set(e.id, pickScenarioVersion(versions, { activeVersionId: activeId }))
    })
    if (mine !== token) return
    versionByEventId.value = new Map([...versionByEventId.value, ...found])
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
  const split = computed(() => splitEventsByScenario(
    (events.value || []).filter((e) => versionByEventId.value.has(e.id)),
    versionByEventId.value,
  ))
  const covered = computed(() => split.value.covered)
  const excluded = computed(() => split.value.excluded)

  return { versionByEventId, status, covered, excluded }
}
