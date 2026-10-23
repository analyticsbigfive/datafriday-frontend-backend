/**
 * useCostTrackingSupplierPerf : second appel séries (groupBy=supplier) qui alimente la section
 * « Performance des fournisseurs » de la colonne de droite, avec les mêmes filtres que le graphique.
 * Inactif (aucun appel) quand le mode courant est déjà « fournisseur ».
 */
import { computed, ref, watch } from 'vue'
import { getCostTrackingSeries } from '@/api/endpoints/cost-tracking.api'
import { buildRows } from '@/utils/costTrackingRows'
import { buildSeriesParams } from '@/utils/costTrackingParams'

/**
 * @param {Object} opts
 * @param {import('vue').Ref<string|null>} opts.spaceId
 * @param {import('vue').Ref<boolean>} opts.active appels autorisés (permission, période valide, mode != supplier)
 * @param {import('vue').Ref<{from: string, to: string}>} opts.range période
 * @param {import('vue').Ref<Object>} opts.filters filtres du graphique (type, catégorie, article, ingrédient, fournisseur, composant)
 * @param {import('vue').Ref<string>} opts.aggregate 'avg' | 'sum'
 * @param {import('vue').Ref<number>} opts.t1 fin exclusive de la période (ms)
 */
export function useCostTrackingSupplierPerf({ spaceId, active, range, filters, aggregate, t1 }) {
  const lines = ref([])
  const loading = ref(false)
  let token = 0

  const supplierParams = computed(() =>
    buildSeriesParams({ range: range.value, filters: filters.value, groupBy: 'supplier', aggregate: aggregate.value }),
  )

  async function load() {
    const mine = ++token
    if (!active.value || !spaceId.value) {
      lines.value = []
      loading.value = false
      return
    }
    loading.value = true
    try {
      const res = await getCostTrackingSeries(spaceId.value, supplierParams.value)
      if (mine !== token) return
      lines.value = res?.lines || []
    } catch (e) {
      if (mine !== token) return
      lines.value = []
    } finally {
      if (mine === token) loading.value = false
    }
  }

  watch(
    () => JSON.stringify([spaceId.value, active.value, supplierParams.value]),
    load,
    { immediate: true },
  )

  const rows = computed(() => buildRows(lines.value, t1.value))
  return { supplierRows: rows, supplierLoading: loading, reloadSuppliers: load }
}
