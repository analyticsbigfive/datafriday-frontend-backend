/**
 * useEventValuations : valorisation par event (endpoint C), dernière feuille
 * post-event de chaque event. Chargée seulement quand le rapport « Valorisation
 * stock » est ouvert (`enabled`), puis recalculée quand les events ou les PdV filtrés
 * changent. Réponse périmée ignorée, jamais de valeur provisoire (`status`).
 */
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { getEventValuations } from '@/api/endpoints/analyse-rendement.api'
import { resolveShopNames } from '@/utils/stockValuationFilters'

const DEBOUNCE_MS = 300

/**
 * @param {Object} p
 * @param {import('vue').Ref<string|null>} p.spaceId
 * @param {import('vue').Ref<boolean>} p.enabled rapport ouvert + permission
 * @param {import('vue').Ref<Array>} p.events events du périmètre filtré
 * @param {import('vue').Ref<Object>} p.filters filtres du store analyse
 * @param {import('vue').Ref<Array>} p.floorElements PdV de la config
 */
export function useEventValuations({ spaceId, enabled, events, filters, floorElements }) {
  const status = ref('idle') // 'idle' | 'loading' | 'ready' | 'error' | 'unresolved'
  const rows = ref([])

  const eventIds = computed(() => (events.value || []).map((e) => e?.id).filter(Boolean).map(String))
  const shop = computed(() => resolveShopNames(filters.value, floorElements.value))
  const signature = computed(() => JSON.stringify([spaceId.value, eventIds.value, shop.value.names, shop.value.unresolved]))

  let timer = null
  let requestId = 0

  async function run() {
    const id = ++requestId
    if (shop.value.unresolved) {
      rows.value = []
      status.value = 'unresolved'
      return
    }
    if (!eventIds.value.length) {
      rows.value = []
      status.value = 'ready'
      return
    }
    status.value = 'loading'
    try {
      const res = await getEventValuations(spaceId.value, eventIds.value, { shopNames: shop.value.names })
      if (id !== requestId) return
      rows.value = Array.isArray(res) ? res : []
      status.value = 'ready'
    } catch (err) {
      if (id !== requestId) return
      console.warn('[analyse] event-valuation indisponible', err?.message || err)
      rows.value = []
      status.value = 'error'
    }
  }

  function schedule() {
    clearTimeout(timer)
    if (!enabled.value || !spaceId.value) {
      requestId += 1
      status.value = 'idle'
      return
    }
    status.value = 'loading'
    timer = setTimeout(run, DEBOUNCE_MS)
  }

  watch([signature, enabled], schedule, { immediate: true })
  onBeforeUnmount(() => {
    clearTimeout(timer)
    requestId += 1
  })

  return { status, rows }
}
