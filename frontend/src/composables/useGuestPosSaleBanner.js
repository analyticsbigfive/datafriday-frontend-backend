// Bandeau vert « Ticket n° … encaissé » avec « Annuler la vente » (appel cancel), à la place
// d'une fenêtre bloquante. Il disparaît dès que le vendeur commence le ticket suivant.

import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { formatCents } from '@/utils/posMoney'
import { posErrorMessageKey } from '@/utils/posErrors'

export function useGuestPosSaleBanner() {
  const store = useStore()
  const { t } = useI18n()
  const busy = ref(false)
  const errorKey = ref('')

  const sale = computed(() => store.state.guestPos.lastSale)
  const cancelEnabled = computed(() => store.getters['guestPos/cancelEnabled'])

  // Un nouveau ticket commencé = la vente précédente n'est plus annulable depuis le bandeau.
  watch(
    () => store.getters['guestPos/cartIsEmpty'],
    (empty) => {
      if (!empty && store.state.guestPos.lastSale) store.dispatch('guestPos/dismissLastSale')
    },
  )
  watch(sale, () => {
    errorKey.value = ''
  })

  const view = computed(() => {
    const current = sale.value
    if (!current) return null
    const payments = current.paymentNames.length > 1
      ? t('guestPosBannerPayments').replace('{count}', current.paymentNames.length)
      : current.paymentNames[0] || ''
    const parts = [payments]
    if (current.tipCents > 0) parts.push(t('guestPosBannerTip').replace('{amount}', formatCents(current.tipCents)))
    parts.push(current.status === 'queued' ? t('guestPosBannerQueued') : t('guestPosBannerSent'))
    return {
      ticketNumber: current.ticketNumber,
      totalLabel: formatCents(current.totalCents),
      detail: parts.filter(Boolean).join(' · '),
      queued: current.status === 'queued',
      // Une vente en file s'annule toujours (elle n'est pas partie) ; une vente envoyée seulement si le réglage l'autorise.
      canCancel: current.status === 'queued' || cancelEnabled.value,
    }
  })

  async function cancel() {
    if (busy.value || !view.value?.canCancel) return
    busy.value = true
    errorKey.value = ''
    try {
      await store.dispatch('guestPos/cancelLastSale')
    } catch (error) {
      errorKey.value = posErrorMessageKey(error)
    } finally {
      busy.value = false
    }
  }
  const dismiss = () => store.dispatch('guestPos/dismissLastSale')

  return { view, busy, errorKey, cancel, dismiss }
}
