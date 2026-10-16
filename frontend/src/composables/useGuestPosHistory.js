// Historique des ventes du PdV : liste filtrable (moyen de paiement, annulés, n° de ticket ou
// vendeur) et détail avec paiements et pourboires. Les ventes encore en file d'envoi apparaissent
// en tête avec le statut « en attente d'envoi ». Le filtrage se fait sur les lignes chargées.

import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { toCents, formatCents } from '@/utils/posMoney'
import { posErrorMessageKey } from '@/utils/posErrors'

const FILTER_ALL = 'all'
const FILTER_CANCELLED = 'cancelled'

const timeLabel = (iso) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function useGuestPosHistory() {
  const store = useStore()
  const { t } = useI18n()

  const filter = ref(FILTER_ALL)
  const search = ref('')
  const selectedKey = ref(null)
  const busy = ref(false)
  const errorKey = ref('')

  const sales = computed(() => store.state.guestPos.sales)
  const cancelEnabled = computed(() => store.getters['guestPos/cancelEnabled'])
  const methods = computed(() => store.getters['guestPos/paymentMethods'])

  // Lignes d'affichage : ventes en file (aperçus) puis ventes du serveur.
  const allRows = computed(() => {
    const queued = store.state.guestPos.outboxEntries
      .filter((entry) => entry.preview)
      .map((entry) => ({ key: `local:${entry.clientTicketId}`, state: entry.status === 'rejected' ? 'rejected' : 'pending', sale: entry.preview }))
    const synced = sales.value.rows.map((sale) => ({ key: sale.id, state: sale.cancelled ? 'cancelled' : 'synced', sale }))
    return [...queued, ...synced]
  })

  const paymentSummary = (sale) => {
    const payments = sale.payments || []
    if (payments.length > 1) return t('guestPosPaymentShared')
    return payments[0]?.name || ''
  }

  const matchers = {
    [FILTER_ALL]: () => true,
    [FILTER_CANCELLED]: (row) => row.state === 'cancelled',
  }
  const matcherFor = (id) => matchers[id] || ((row) => row.state !== 'cancelled' && (row.sale.payments || []).some((payment) => payment.paymentMethodId === id))

  const chips = computed(() => [
    { id: FILTER_ALL, label: t('guestPosHistoryAll') },
    ...methods.value.map((method) => ({ id: method.id, label: method.name })),
    { id: FILTER_CANCELLED, label: t('guestPosHistoryCancelled') },
  ].map((chip) => ({ ...chip, count: allRows.value.filter(matcherFor(chip.id)).length })))

  const rows = computed(() => {
    const query = search.value.trim().toLowerCase()
    return allRows.value
      .filter(matcherFor(filter.value))
      .filter((row) => !query || String(row.sale.ticketNumber).includes(query) || (row.sale.vendorName || '').toLowerCase().includes(query))
      .map((row) => ({
        key: row.key,
        state: row.state,
        ticketNumber: row.sale.ticketNumber,
        time: timeLabel(row.sale.createdAt),
        paymentLabel: paymentSummary(row.sale),
        totalLabel: formatCents(toCents(row.sale.totalTtc)),
        cancelled: row.state === 'cancelled',
      }))
  })

  const current = computed(() => {
    const visible = rows.value
    const found = visible.find((row) => row.key === selectedKey.value) || visible[0] || null
    return found ? allRows.value.find((row) => row.key === found.key) : null
  })
  const selectedRowKey = computed(() => current.value?.key ?? null)

  const detail = computed(() => {
    const row = current.value
    if (!row) return null
    const sale = row.sale
    return {
      key: row.key,
      saleId: sale.id,
      clientTicketId: sale.clientTicketId ?? null,
      state: row.state,
      ticketNumber: sale.ticketNumber,
      time: timeLabel(sale.createdAt),
      vendorName: sale.vendorName,
      cancelled: row.state === 'cancelled',
      pending: row.state === 'pending',
      rejected: row.state === 'rejected',
      lines: (sale.lines || []).map((line) => ({ name: line.name, quantity: line.quantity, totalLabel: formatCents(toCents(line.totalTtc)) })),
      payments: (sale.payments || []).map((payment) => ({
        name: payment.name,
        amountLabel: formatCents(toCents(payment.amountTtc)),
        tipLabel: payment.tipTtc > 0 ? formatCents(toCents(payment.tipTtc)) : '',
      })),
      totalLabel: formatCents(toCents(sale.totalTtc)),
      vatLabel: formatCents(toCents(sale.vatTotal)),
      canToggleCancel: cancelEnabled.value && row.state !== 'pending' && row.state !== 'rejected' && !!sale.id,
    }
  })

  const summary = computed(() => {
    const live = allRows.value.filter((row) => row.state !== 'cancelled' && row.state !== 'rejected')
    const cancelled = allRows.value.filter((row) => row.state === 'cancelled').length
    const revenue = live.reduce((sum, row) => sum + toCents(row.sale.totalTtc), 0)
    return t('guestPosHistorySummary').replace('{tickets}', live.length).replace('{total}', formatCents(revenue)).replace('{cancelled}', cancelled)
  })

  const hasMore = computed(() => !!sales.value.nextCursor)
  const loading = computed(() => sales.value.loading)

  async function load() {
    errorKey.value = ''
    try {
      await store.dispatch('guestPos/loadSales')
    } catch (error) {
      errorKey.value = posErrorMessageKey(error)
    }
  }
  async function loadMore() {
    try {
      await store.dispatch('guestPos/loadSales', { append: true })
    } catch (error) {
      errorKey.value = posErrorMessageKey(error)
    }
  }

  /** Annule ou rétablit le ticket affiché. */
  async function toggleCancel() {
    const view = detail.value
    if (!view || !view.canToggleCancel || busy.value) return
    busy.value = true
    errorKey.value = ''
    try {
      await store.dispatch('guestPos/setSaleCancelled', { saleId: view.saleId, cancelled: !view.cancelled })
    } catch (error) {
      errorKey.value = posErrorMessageKey(error)
    } finally {
      busy.value = false
    }
  }

  /** Écarte une vente refusée par le serveur une fois qu'elle a été vue. */
  const dismissRejected = () => {
    const view = detail.value
    if (view?.rejected && view.clientTicketId) store.dispatch('guestPos/dismissRejected', view.clientTicketId)
  }

  return { dismissRejected, filter, search, chips, rows, detail, summary, selectedRowKey, loading, hasMore, busy, errorKey, load, loadMore, toggleCancel, select: (key) => { selectedKey.value = key } }
}
