import { computed, onBeforeUnmount, ref, unref, watch } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'

export const POS_SALES_PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

/** Déclenche le téléchargement d'un Blob (export CSV). */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Libellé des moyens de paiement d'un ticket, « Carte + Espèces » en cas d'addition partagée. */
export function paymentsLabel(sale) {
  return (sale.payments || []).map((p) => p.name).join(' + ')
}

/**
 * Historique des ventes de l'évènement : filtres (PdV, moyen de paiement, recherche), pagination
 * par curseur, export CSV avec les mêmes filtres.
 * @param {{ spaceId: import('vue').Ref<string>|string, eventId: import('vue').Ref<string>|string }} target
 */
export function usePosSalesHistory(target) {
  const store = useStore()
  const { t } = useI18n()
  const elementId = ref(null)
  const paymentMethodId = ref(null)
  const search = ref('')
  const error = ref('')
  const exporting = ref(false)
  let timer = null

  const rows = computed(() => store.state.pos.sales.rows)
  const totals = computed(() => store.state.pos.sales.totals)
  const hasMore = computed(() => !!store.state.pos.sales.nextCursor)
  const loading = computed(() => store.state.pos.salesFetching)

  const query = () => ({
    elementId: elementId.value || undefined,
    paymentMethodId: paymentMethodId.value || undefined,
    search: search.value.trim() || undefined,
  })
  const scope = () => ({ spaceId: unref(target.spaceId), eventId: unref(target.eventId) })
  const messageOf = (e) => e?.response?.data?.message || e?.message || t('posSalesLoadError')

  async function load() {
    if (!scope().spaceId || !scope().eventId) return
    error.value = ''
    try {
      await store.dispatch('pos/fetchSales', { ...scope(), query: { ...query(), limit: POS_SALES_PAGE_SIZE } })
    } catch (e) {
      error.value = messageOf(e)
    }
  }

  async function loadMore() {
    const cursor = store.state.pos.sales.nextCursor
    if (!cursor || loading.value) return
    try {
      await store.dispatch('pos/fetchSales', {
        ...scope(),
        query: { ...query(), cursor, limit: POS_SALES_PAGE_SIZE },
        append: true,
      })
    } catch (e) {
      error.value = messageOf(e)
    }
  }

  async function exportCsv() {
    exporting.value = true
    try {
      const blob = await store.dispatch('pos/exportSales', { ...scope(), query: query() })
      downloadBlob(blob, `ventes-pos-${scope().eventId}.csv`)
    } catch (e) {
      error.value = e?.response?.data?.message || e?.message || t('posSalesExportError')
    } finally {
      exporting.value = false
    }
  }

  watch([elementId, paymentMethodId], load)
  watch(search, () => {
    clearTimeout(timer)
    timer = setTimeout(load, SEARCH_DEBOUNCE_MS)
  })
  onBeforeUnmount(() => clearTimeout(timer))

  return { elementId, paymentMethodId, search, rows, totals, hasMore, loading, error, exporting, load, loadMore, exportCsv }
}
