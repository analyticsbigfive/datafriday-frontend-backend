// Choix du pourboire (si settings.tipsEnabled) : aucun, 5 %, 10 % ou montant libre.
// Hors chiffre d'affaires et hors TVA, porté par le dernier paiement du ticket.

import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { POS_TIP_NONE, POS_TIP_PERCENT_PRESETS, tipPercent, tipAmount, isSameTipChoice } from '@/utils/posTip'
import { formatCents, parseAmountInput } from '@/utils/posMoney'

export function useGuestPosTip() {
  const store = useStore()

  const enabled = computed(() => store.getters['guestPos/tipsEnabled'])
  const choice = computed(() => store.state.guestPos.tip)
  const tipCents = computed(() => store.getters['guestPos/tipCents'])
  const tipLabel = computed(() => formatCents(tipCents.value))

  const customOpen = ref(false)
  const customText = ref('')
  const customInvalid = ref(false)

  const percentPresets = POS_TIP_PERCENT_PRESETS
  const isNone = computed(() => choice.value.kind === 'none')
  const isPercent = (value) => isSameTipChoice(choice.value, tipPercent(value))
  const isCustom = computed(() => choice.value.kind === 'amount' || customOpen.value)

  const set = (next) => store.dispatch('guestPos/setTip', next)

  const pickNone = () => {
    customOpen.value = false
    customText.value = ''
    customInvalid.value = false
    set(POS_TIP_NONE)
  }
  const pickPercent = (value) => {
    customOpen.value = false
    customInvalid.value = false
    set(tipPercent(value))
  }
  const openCustom = () => {
    customOpen.value = true
  }
  /** Montant saisi en euros : appliqué dès qu'il est valide, signalé sinon. */
  const onCustomInput = (text) => {
    customText.value = text
    if (!text.trim()) {
      customInvalid.value = false
      set(POS_TIP_NONE)
      return
    }
    const cents = parseAmountInput(text)
    customInvalid.value = cents == null
    set(cents == null ? POS_TIP_NONE : tipAmount(cents))
  }

  return { enabled, tipCents, tipLabel, percentPresets, isNone, isPercent, isCustom, customOpen, customText, customInvalid, pickNone, pickPercent, openCustom, onCustomInput }
}
