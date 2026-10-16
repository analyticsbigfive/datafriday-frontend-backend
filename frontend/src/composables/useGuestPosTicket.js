// Ticket en cours : lignes (avec prix barré et ligne négative pour la déconsigne), total TTC,
// TVA contenue, quantités. Écrit uniquement via le store guestPos.

import { computed } from 'vue'
import { useStore } from 'vuex'
import { formatCents } from '@/utils/posMoney'

export function useGuestPosTicket() {
  const store = useStore()

  const ticketNumber = computed(() => store.getters['guestPos/provisionalTicketNumber'])

  const lines = computed(() =>
    store.getters['guestPos/ticketLines'].map((line) => ({
      menuItemId: line.menuItemId,
      name: line.name,
      quantity: line.quantity,
      unitLabel: formatCents(line.unitCents),
      originalUnitLabel: line.originalUnitCents != null && line.originalUnitCents !== line.unitCents ? formatCents(line.originalUnitCents) : '',
      totalLabel: formatCents(line.totalCents),
      // Ligne négative (déconsigne) : prix négatif dans le catalogue, jamais une quantité négative.
      negative: line.totalCents < 0,
    })),
  )

  const totals = computed(() => store.getters['guestPos/ticketTotals'])
  const totalCents = computed(() => totals.value.totalCents)
  const totalLabel = computed(() => formatCents(totals.value.totalCents))
  const vatLabel = computed(() => formatCents(totals.value.vatCents))
  const isEmpty = computed(() => store.getters['guestPos/cartIsEmpty'])

  const increment = (menuItemId) => store.dispatch('guestPos/increment', menuItemId)
  const decrement = (menuItemId) => store.dispatch('guestPos/decrement', menuItemId)
  const clear = () => store.dispatch('guestPos/clearCart')

  return { ticketNumber, lines, totalCents, totalLabel, vatLabel, isEmpty, increment, decrement, clear }
}
