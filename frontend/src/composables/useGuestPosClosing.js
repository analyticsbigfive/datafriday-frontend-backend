// Clôture de caisse : récapitulatif par moyen de paiement, TVA collectée, total TTC et
// pourboires (hors CA) par vendeur, depuis GET guest-pin/pos/closing.

import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { toCents, formatCents } from '@/utils/posMoney'
import { posErrorMessageKey } from '@/utils/posErrors'

export function useGuestPosClosing() {
  const store = useStore()
  const errorKey = ref('')
  const loading = ref(false)

  const closing = computed(() => store.state.guestPos.closing)
  const pendingCount = computed(() => store.getters['guestPos/pendingCount'])

  const view = computed(() => {
    const data = closing.value
    if (!data) return null
    const money = (euros) => formatCents(toCents(euros))
    return {
      tickets: data.tickets,
      cancelled: data.cancelled,
      byPaymentMethod: (data.byPaymentMethod || []).map((method) => ({
        id: method.paymentMethodId,
        name: method.name,
        amountLabel: money(method.amountTtc),
        tipLabel: method.tipTtc > 0 ? money(method.tipTtc) : '',
      })),
      vatLabel: money(data.vatTotal),
      revenueLabel: money(data.revenueTtc),
      tipsTotalLabel: money(data.tips?.totalTtc ?? 0),
      hasTips: (data.tips?.totalTtc ?? 0) > 0,
      tipsByVendor: (data.tips?.byVendor || []).map((vendor) => ({ vendorName: vendor.vendorName, tipLabel: money(vendor.tipTtc), tickets: vendor.tickets })),
    }
  })

  async function load() {
    loading.value = true
    errorKey.value = ''
    try {
      await store.dispatch('guestPos/loadClosing')
    } catch (error) {
      errorKey.value = posErrorMessageKey(error)
    } finally {
      loading.value = false
    }
  }

  return { view, loading, errorKey, pendingCount, load }
}
