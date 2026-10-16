import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/i18n/useI18n'

/** Relecture silencieuse du détail (KPI, ventes par PdV) tant que l'évènement est en cours. */
export const POS_REFRESH_MS = 30000

/**
 * Évènement à afficher : celui demandé par l'URL s'il est proposé, sinon le premier en cours,
 * sinon le prochain (la liste est ordonnée par le serveur).
 */
export function pickPosEventId(events, requestedId) {
  if (!events?.length) return null
  if (requestedId && events.some((e) => e.id === requestedId)) return requestedId
  return (events.find((e) => e.status === 'live') || events[0]).id
}

/**
 * Orchestration de la page POS : liste des évènements, évènement sélectionné (synchronisé avec
 * `?event=`), détail, relecture périodique. Aucun appel réseau direct : tout passe par le store.
 * @param {import('vue').Ref<string>|string} spaceIdSource
 */
export function usePosPage(spaceIdSource) {
  const store = useStore()
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()

  const spaceId = computed(() => unref(spaceIdSource))
  const selectedEventId = ref(null)
  const loading = ref(false)
  const error = ref('')
  let timer = null

  const events = computed(() => store.getters['pos/events'])
  const event = computed(() => store.getters['pos/event'])
  const pdvs = computed(() => store.getters['pos/pdvs'])
  const settings = computed(() => store.getters['pos/settings'])
  const kpis = computed(() => store.getters['pos/kpis'])
  const detailLoading = computed(() => store.state.pos.detailFetching)
  const selectedEvent = computed(() => events.value.find((e) => e.id === selectedEventId.value) || null)
  const isLive = computed(() => selectedEvent.value?.status === 'live')
  const space = computed(() => (store.getters['spaces/spaces'] || []).find((s) => s.id === spaceId.value) || null)
  const spaceName = computed(() => space.value?.name || '')
  const canManage = computed(() => {
    const can = store.getters['auth/can']
    return typeof can === 'function' ? !!can('front.fb.posManage') : false
  })

  const errorMessage = (e) => e?.response?.data?.message || e?.message || t('posLoadError')

  async function loadDetail({ silent = false } = {}) {
    if (!spaceId.value || !selectedEventId.value) return
    try {
      await store.dispatch('pos/fetchDetail', { spaceId: spaceId.value, eventId: selectedEventId.value, silent })
      if (!silent) error.value = ''
    } catch (e) {
      if (!silent) error.value = errorMessage(e)
    }
  }

  async function init() {
    if (!spaceId.value) return
    loading.value = true
    error.value = ''
    try {
      store.dispatch('spaces/fetchSpaces').catch(() => {})
      await store.dispatch('pos/fetchList', { spaceId: spaceId.value, force: true })
      selectedEventId.value = pickPosEventId(events.value, route.query?.event || null)
      if (selectedEventId.value) await loadDetail()
    } catch (e) {
      error.value = errorMessage(e)
    } finally {
      loading.value = false
    }
  }

  function selectEvent(eventId) {
    if (!eventId || eventId === selectedEventId.value) return
    selectedEventId.value = eventId
    router.replace({ query: { ...route.query, event: eventId } }).catch(() => {})
  }

  function startRefresh() {
    stopRefresh()
    timer = setInterval(() => {
      if (isLive.value && typeof document !== 'undefined' && !document.hidden) loadDetail({ silent: true })
    }, POS_REFRESH_MS)
  }
  function stopRefresh() {
    if (timer) clearInterval(timer)
    timer = null
  }

  watch(selectedEventId, (id, previous) => {
    // Pendant l'initialisation, init() charge déjà le détail : pas de second appel.
    if (id && !loading.value && id !== previous) loadDetail()
  })
  watch(spaceId, (id, previous) => {
    if (id && previous && id !== previous) {
      store.dispatch('pos/reset')
      selectedEventId.value = null
      init()
    }
  })

  onMounted(() => {
    init()
    startRefresh()
  })
  onBeforeUnmount(stopRefresh)

  return {
    spaceId,
    spaceName,
    events,
    event,
    selectedEvent,
    selectedEventId,
    isLive,
    pdvs,
    settings,
    kpis,
    canManage,
    loading,
    detailLoading,
    error,
    selectEvent,
    reload: loadDetail,
    init,
  }
}
