// Paiement en un geste : un bouton par moyen de paiement renvoyé par le catalogue. Le
// comportement dépend du `kind` du moyen (présentation), jamais de son nom.

import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { paymentPresentation } from '@/utils/posPaymentKinds'
import { posErrorMessageKey } from '@/utils/posErrors'

export function useGuestPosCheckout() {
  const store = useStore()

  const submitting = computed(() => store.state.guestPos.submitting)
  const isEmpty = computed(() => store.getters['guestPos/cartIsEmpty'])
  const errorKey = ref('')

  const methods = computed(() =>
    store.getters['guestPos/paymentMethods'].map((method) => ({
      id: method.id,
      name: method.name,
      kind: method.kind,
      ...paymentPresentation(method.kind),
    })),
  )

  // Un message d'erreur de paiement ne survit pas à une modification du ticket.
  watch(
    () => store.state.guestPos.cart,
    () => {
      errorKey.value = ''
    },
  )

  /** Encaisse la totalité du ticket avec un seul moyen de paiement. */
  async function payWith(paymentMethodId) {
    if (submitting.value || isEmpty.value) return null
    errorKey.value = ''
    try {
      const { totalCents } = store.getters['guestPos/ticketTotals']
      return await store.dispatch('guestPos/checkout', { payments: [{ paymentMethodId, amountCents: totalCents }] })
    } catch (error) {
      errorKey.value = posErrorMessageKey(error)
      return null
    }
  }

  /** Encaisse un ticket partagé (voir useGuestPosSplit). `payments` : `[{ paymentMethodId, amountCents }]`. */
  async function payShared(payments) {
    if (submitting.value || isEmpty.value) return false
    errorKey.value = ''
    try {
      await store.dispatch('guestPos/checkout', { payments })
      return true
    } catch (error) {
      errorKey.value = posErrorMessageKey(error)
      return false
    }
  }

  return { methods, submitting, isEmpty, errorKey, payWith, payShared }
}
