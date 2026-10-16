<template>
  <section class="pos-ticket" :aria-label="t('guestPosTicketTitle').replace('{number}', ticketNumber)">
    <div class="pos-ticket__head">
      <div class="pos-ticket__title">{{ t('guestPosTicketTitle').replace('{number}', ticketNumber) }}</div>
      <button type="button" class="pos-ticket__clear" :disabled="isEmpty" @click="clear">{{ t('guestPosTicketClear') }}</button>
    </div>

    <div class="pos-ticket__lines">
      <div v-if="isEmpty" class="pos-ticket__empty">
        <Receipt :size="40" aria-hidden="true" />
        <div>{{ t('guestPosTicketEmpty') }}</div>
      </div>
      <GuestPosTicketLine v-for="line in lines" :key="line.menuItemId" :line="line" @increment="increment" @decrement="decrement" />
    </div>

    <div class="pos-ticket__foot">
      <div class="pos-ticket__total-row">
        <div class="pos-ticket__total-label">{{ t('guestPosTotal') }}</div>
        <div class="pos-ticket__total">{{ totalLabel }}</div>
      </div>
      <div class="pos-ticket__vat">{{ t('guestPosVat').replace('{amount}', vatLabel) }}</div>

      <GuestPosTipPicker />

      <GuestPosPayButtons :methods="methods" :disabled="isEmpty || submitting" @pay="payWith" />
      <p v-if="methods.length === 0" class="pos-ticket__error" role="alert">{{ t('guestPosNoPaymentMethod') }}</p>

      <button type="button" class="pos-ticket__split" :disabled="!canSplit" @click="$emit('open-split')">
        <Users :size="18" aria-hidden="true" />
        {{ t('guestPosSplit') }}
      </button>
      <p v-if="errorKey" class="pos-ticket__error" role="alert">{{ t(errorKey) }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { Receipt, Users } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { useGuestPosTicket } from '@/composables/useGuestPosTicket'
import { useGuestPosCheckout } from '@/composables/useGuestPosCheckout'
import GuestPosTicketLine from './GuestPosTicketLine.vue'
import GuestPosTipPicker from './GuestPosTipPicker.vue'
import GuestPosPayButtons from './GuestPosPayButtons.vue'

defineEmits(['open-split'])

const { t } = useI18n()
const { ticketNumber, lines, totalCents, totalLabel, vatLabel, isEmpty, increment, decrement, clear } = useGuestPosTicket()
const { methods, submitting, errorKey, payWith } = useGuestPosCheckout()

// Le partage n'a de sens que sur un ticket positif, avec au moins un moyen de paiement.
const canSplit = computed(() => !isEmpty.value && totalCents.value > 0 && methods.value.length > 0 && !submitting.value)
</script>

<style scoped>
.pos-ticket {
  width: 400px; flex-shrink: 0; box-sizing: border-box; margin: 16px 16px 16px 0; background: var(--pos-surface); border: 1px solid var(--pos-border);
  border-radius: 16px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05); display: flex; flex-direction: column; overflow: hidden;
}
.pos-ticket__head { padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #F0F1F3; }
.pos-ticket__title { font-size: var(--fs-lg); font-weight: var(--fw-bold); }
.pos-ticket__clear { min-height: 44px; padding: 0 12px; border-radius: 8px; border: 0; background: transparent; color: var(--pos-muted); font-size: var(--fs-md); font-weight: var(--fw-bold); cursor: pointer; }
.pos-ticket__clear:disabled { opacity: 0.4; cursor: default; }
.pos-ticket__lines { flex: 1; min-height: 0; overflow-y: auto; padding: 0 18px; display: flex; flex-direction: column; }
.pos-ticket__empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #9CA3AF; text-align: center; font-size: var(--fs-md); line-height: 1.4; }
.pos-ticket__foot { padding: 14px 18px 18px; border-top: 1px solid var(--pos-border); background: #FAFAFA; display: flex; flex-direction: column; gap: 12px; }
.pos-ticket__total-row { display: flex; justify-content: space-between; align-items: baseline; }
.pos-ticket__total-label { font-size: var(--fs-md); color: var(--pos-muted); font-weight: var(--fw-semibold); }
.pos-ticket__total { font-size: var(--fs-xxl); font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; line-height: 1; }
.pos-ticket__vat { text-align: right; font-size: var(--fs-sm); color: #9CA3AF; font-variant-numeric: tabular-nums; margin-top: -6px; }
.pos-ticket__split {
  min-height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: var(--fs-md); font-weight: var(--fw-bold);
  border: 1px solid var(--pos-border-strong); background: var(--pos-surface); color: var(--pos-text); cursor: pointer;
}
.pos-ticket__split:disabled { border-color: var(--pos-border); background: var(--pos-bg); color: #9CA3AF; cursor: not-allowed; }
.pos-ticket__error { margin: 0; text-align: center; font-size: var(--fs-base); color: var(--pos-danger); font-weight: var(--fw-semibold); }
@media (max-width: 900px) {
  .pos-ticket { width: 320px; }
}
</style>
