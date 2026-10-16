// Panneau « Partager l'addition » : N parts égales (2 à 10, centimes restants sur la dernière)
// ou montant par montant avec reste à payer. « Encaisser » n'est actif qu'à 0 de reste.

import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import {
  POS_SPLIT_MIN_PARTS,
  POS_SPLIT_MAX_PARTS,
  POS_AMOUNT_PRESETS_CENTS,
  clampSplitCount,
  equalParts,
  remainingToPay,
  clampToRemaining,
  canAddPayment,
  canConfirmSplit,
} from '@/utils/posSplit'
import { formatCents, parseAmountInput } from '@/utils/posMoney'

export function useGuestPosSplit() {
  const store = useStore()

  const mode = ref('equal') // 'equal' | 'amount'
  const count = ref(POS_SPLIT_MIN_PARTS)
  const partMethodIds = ref({}) // index de part -> moyen
  const amountMethodId = ref('')
  const amountLines = ref([]) // [{ paymentMethodId, amountCents }]
  const customText = ref('')

  const methods = computed(() => store.getters['guestPos/paymentMethods'])
  const defaultMethodId = computed(() => methods.value[0]?.id ?? '')
  const totalCents = computed(() => store.getters['guestPos/ticketTotals'].totalCents)

  const parts = computed(() =>
    equalParts(totalCents.value, count.value).map((amountCents, index) => ({
      index,
      number: index + 1,
      amountCents,
      amountLabel: formatCents(amountCents),
      methodId: partMethodIds.value[index] || defaultMethodId.value,
    })),
  )

  const lines = computed(() =>
    amountLines.value.map((line, index) => ({
      index,
      paymentMethodId: line.paymentMethodId,
      methodName: store.getters['guestPos/paymentMethodsById'][line.paymentMethodId]?.name || '',
      amountCents: line.amountCents,
      amountLabel: formatCents(line.amountCents),
    })),
  )

  const restCents = computed(() => (mode.value === 'equal' ? 0 : remainingToPay(totalCents.value, amountLines.value)))
  const restLabel = computed(() => formatCents(restCents.value))
  const canConfirm = computed(() => canConfirmSplit({ mode: mode.value, totalCents: totalCents.value, lines: amountLines.value }))
  const canAdd = computed(() => restCents.value > 0 && canAddPayment(amountLines.value))
  const selectedAmountMethodId = computed(() => amountMethodId.value || defaultMethodId.value)

  /** À l'ouverture du panneau : repart d'un partage vide. */
  function reset() {
    mode.value = 'equal'
    count.value = POS_SPLIT_MIN_PARTS
    partMethodIds.value = {}
    amountMethodId.value = ''
    amountLines.value = []
    customText.value = ''
  }

  const setMode = (next) => {
    mode.value = next
  }
  const setCount = (next) => {
    count.value = clampSplitCount(next)
  }
  const stepCount = (delta) => setCount(count.value + delta)
  const setPartMethod = (index, methodId) => {
    partMethodIds.value = { ...partMethodIds.value, [index]: methodId }
  }
  const setAmountMethod = (methodId) => {
    amountMethodId.value = methodId
  }

  function addAmount(cents) {
    if (!canAdd.value) return
    const amountCents = clampToRemaining(cents, restCents.value)
    if (amountCents <= 0) return
    amountLines.value = [...amountLines.value, { paymentMethodId: selectedAmountMethodId.value, amountCents }]
  }
  const addRest = () => addAmount(restCents.value)
  const addPreset = (cents) => addAmount(cents)
  function addCustom() {
    const cents = parseAmountInput(customText.value)
    if (cents == null || cents <= 0) return
    addAmount(cents)
    customText.value = ''
  }
  const removeLine = (index) => {
    amountLines.value = amountLines.value.filter((_, position) => position !== index)
  }

  /** Paiements à envoyer au store : `[{ paymentMethodId, amountCents }]`. */
  function buildPayments() {
    if (mode.value === 'equal') return parts.value.map((part) => ({ paymentMethodId: part.methodId, amountCents: part.amountCents }))
    return amountLines.value.map((line) => ({ ...line }))
  }

  return {
    mode, count, methods, parts, lines, totalCents, restCents, restLabel, canConfirm, canAdd, customText,
    selectedAmountMethodId, presets: POS_AMOUNT_PRESETS_CENTS, minParts: POS_SPLIT_MIN_PARTS, maxParts: POS_SPLIT_MAX_PARTS,
    reset, setMode, stepCount, setPartMethod, setAmountMethod, addPreset, addRest, addCustom, removeLine, buildPayments,
  }
}
