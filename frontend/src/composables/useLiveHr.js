// Onglet RH du Live : charge l'effectif prévu (staffing) et le CA prévu (version Event Predict
// par défaut) de l'event live, puis les combine avec les ventes déjà en mémoire (basketRows et
// timelineRows de useLiveData). Aucun appel supplémentaire pour les ventes : seuls le staffing
// et la version prédictive sont lus, une fois par event, quand l'onglet devient actif.
import { ref, computed, watch } from 'vue'
import { useStore } from 'vuex'
import { listEventPredictVersions } from '@/api/endpoints/eventPredict.api'
import { aggregatePredictedRevenueByElement, predictedNameByShop } from '@/utils/staffingPredictedRevenue'
import { useI18n } from '@/i18n/useI18n'
import { buildHrRows } from '@/utils/liveHrRanking'

/**
 * @param {object} opts
 * @param {import('vue').Ref<string|null>} opts.eventId
 * @param {import('vue').Ref<boolean>} opts.active onglet affiché
 * @param {import('vue').Ref<Array>} opts.basketRows
 * @param {import('vue').Ref<Array>} opts.timelineRows
 * @param {import('vue').Ref<boolean>} opts.isLive
 */
export function useLiveHr({ eventId, active, basketRows, timelineRows, isLive }) {
  const store = useStore()
  const { t } = useI18n()
  const staffLoading = ref(false)
  const staffError = ref(false)
  const predictedByShop = ref({})
  const predictedNames = ref({})
  const predictedLoaded = ref(false)
  const predictedError = ref(false)
  let loadedFor = null

  const staffElements = computed(() =>
    String(store.state.staffing?.eventId) === String(eventId.value) ? store.getters['staffing/elements'] : [],
  )

  async function loadStaffing(evId) {
    staffLoading.value = true
    staffError.value = false
    try {
      await store.dispatch('staffing/fetchStaffing', { eventId: evId })
    } catch (e) {
      staffError.value = true
    } finally {
      staffLoading.value = false
    }
  }

  async function loadPredicted(evId) {
    predictedError.value = false
    predictedLoaded.value = false
    try {
      const versions = await listEventPredictVersions(evId)
      const list = Array.isArray(versions) ? versions : []
      const def = list.find((v) => v.isDefault)
      predictedByShop.value = def ? aggregatePredictedRevenueByElement(def.predictedRecords) : {}
      predictedNames.value = def ? predictedNameByShop(def.predictedRecords) : {}
    } catch (e) {
      predictedByShop.value = {}
      predictedNames.value = {}
      predictedError.value = true
    } finally {
      predictedLoaded.value = true
    }
  }

  async function load() {
    const evId = eventId.value
    if (!evId || loadedFor === evId) return
    loadedFor = evId
    await Promise.all([loadStaffing(evId), loadPredicted(evId)])
  }

  watch([active, eventId], () => { if (active.value) load() }, { immediate: true })

  const ranking = computed(() =>
    buildHrRows({
      basketRows: basketRows.value,
      timelineRows: timelineRows.value,
      staffElements: staffElements.value,
      predictedByShop: predictedByShop.value,
      predictedNames: predictedNames.value,
      fallbackName: t('liveHrUnnamedShop'),
      excludeLatest: !!isLive.value,
      // Sans panier (avant l'événement) : fenêtre « 3 dernières minutes » à 0 tx/min.
      now: new Date(),
    }),
  )

  const hasPredicted = computed(() => Object.keys(predictedByShop.value).length > 0)
  const hasStaff = computed(() => staffElements.value.some((el) => (el.lines || []).some((l) => l.enabled)))

  return {
    rows: computed(() => ranking.value.rows),
    minutes: computed(() => ranking.value.minutes),
    loading: computed(() => staffLoading.value || (active.value && !predictedLoaded.value && !!eventId.value)),
    staffError, predictedError, hasPredicted, hasStaff,
    reload: () => { loadedFor = null; return load() },
  }
}
