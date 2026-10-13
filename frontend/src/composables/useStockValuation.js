/**
 * useStockValuation : valorisation du stock Logistique ACTUEL (endpoint B) pour le
 * widget « Valorisation stock ».
 *
 * Recalculée quand ses filtres changent (PdV / type / zone, industriel, fournisseur).
 * Les autres filtres (date, event, marque, promo, article) ne s'appliquent pas à un stock
 * du jour : leurs clés sont exposées dans `ignoredKeys` pour que le widget le dise.
 * Jamais de valeur provisoire : `status` vaut 'loading' tant que la réponse du jeu de
 * filtres COURANT n'est pas arrivée (une réponse périmée est ignorée).
 */
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { getStockValuation } from '@/api/endpoints/analyse-rendement.api'
import { buildStockParams } from '@/utils/stockValuationFilters'

const DEBOUNCE_MS = 300

/**
 * @param {Object} p
 * @param {import('vue').Ref<string|null>} p.spaceId
 * @param {import('vue').Ref<boolean>} p.enabled permission + page prête
 * @param {import('vue').Ref<Object>} p.filters filtres du store analyse
 * @param {import('vue').Ref<Array>} p.floorElements PdV de la config (id, name, shopType, floorName)
 * @param {import('vue').Ref<Map|null>} p.dimensionsIndex index endpoint A
 * @param {import('vue').Ref<string>} p.dimensionsStatus statut endpoint A
 */
export function useStockValuation({ spaceId, enabled, filters, floorElements, dimensionsIndex, dimensionsStatus }) {
  const status = ref('idle') // 'idle' | 'loading' | 'ready' | 'error' | 'unresolved'
  const data = ref(null)

  const built = computed(() => buildStockParams(filters.value, floorElements.value, dimensionsIndex.value))
  // Les filtres industriel / fournisseur ont besoin des ids de l'endpoint A.
  const waitingForDimensions = computed(() => {
    const f = filters.value || {}
    const needs = (f.selectedIndustrials || []).length || (f.selectedSuppliers || []).length
    return !!needs && dimensionsStatus.value === 'loading'
  })
  const signature = computed(() => JSON.stringify([spaceId.value, built.value.params, built.value.unresolved]))

  let timer = null
  let requestId = 0

  async function run() {
    const id = ++requestId
    if (built.value.unresolved.length) {
      data.value = null
      status.value = 'unresolved'
      return
    }
    status.value = 'loading'
    try {
      const res = await getStockValuation(spaceId.value, built.value.params)
      if (id !== requestId) return
      data.value = res
      status.value = 'ready'
    } catch (err) {
      if (id !== requestId) return
      console.warn('[analyse] stock-valuation indisponible', err?.message || err)
      data.value = null
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
    // La valeur précédente ne doit jamais rester affichée pendant un recalcul.
    status.value = 'loading'
    if (waitingForDimensions.value) return
    timer = setTimeout(run, DEBOUNCE_MS)
  }

  watch([signature, enabled, waitingForDimensions], schedule, { immediate: true })
  onBeforeUnmount(() => {
    clearTimeout(timer)
    requestId += 1
  })

  return {
    status,
    data,
    unresolved: computed(() => built.value.unresolved),
    ignoredKeys: computed(() => built.value.ignoredKeys),
  }
}
