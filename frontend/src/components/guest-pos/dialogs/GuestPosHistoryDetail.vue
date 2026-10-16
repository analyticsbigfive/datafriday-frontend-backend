<template>
  <div class="pos-hdetail">
    <div v-if="!detail" class="pos-hdetail__none">{{ t('guestPosHistorySelect') }}</div>
    <template v-else>
      <div class="pos-hdetail__head">
        <div>
          <div class="pos-hdetail__title">{{ t('guestPosHistoryTicket').replace('{number}', detail.ticketNumber) }}</div>
          <div class="pos-hdetail__meta">{{ detail.time }} · {{ t('guestPosHistoryVendor').replace('{name}', detail.vendorName) }}</div>
        </div>
        <span class="pos-hdetail__status" :class="`pos-hdetail__status--${statusKind}`">{{ statusLabel }}</span>
      </div>

      <div class="pos-hdetail__body">
        <div v-for="(line, index) in detail.lines" :key="index" class="pos-hdetail__line">
          <span class="pos-hdetail__qty">{{ line.quantity }} ×</span>
          <span class="pos-hdetail__name">{{ line.name }}</span>
          <span class="pos-hdetail__amount">{{ line.totalLabel }}</span>
        </div>
        <div class="pos-hdetail__payments">
          <div class="pos-hdetail__payments-title">{{ t('guestPosHistoryPayments') }}</div>
          <div v-for="(payment, index) in detail.payments" :key="index" class="pos-hdetail__payment">
            <span>{{ payment.name }}</span>
            <span class="pos-hdetail__amount">{{ payment.amountLabel }}<template v-if="payment.tipLabel"> · {{ t('guestPosHistoryTip').replace('{amount}', payment.tipLabel) }}</template></span>
          </div>
        </div>
      </div>

      <div class="pos-hdetail__foot">
        <div class="pos-hdetail__totals">
          <div class="pos-hdetail__vat">{{ t('guestPosVat').replace('{amount}', detail.vatLabel) }}</div>
          <div class="pos-hdetail__total">{{ detail.totalLabel }}</div>
        </div>
        <p v-if="errorKey" class="pos-hdetail__error" role="alert">{{ t(errorKey) }}</p>
        <button v-if="detail.canToggleCancel" type="button" class="pos-hdetail__toggle" :disabled="busy" @click="$emit('toggle-cancel')">
          {{ detail.cancelled ? t('guestPosHistoryRestore') : t('guestPosHistoryCancel') }}
        </button>
        <button v-if="detail.rejected" type="button" class="pos-hdetail__toggle" @click="$emit('dismiss')">{{ t('guestPosHistoryDismiss') }}</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  // Voir useGuestPosHistory : { ticketNumber, time, vendorName, lines, payments, totalLabel, vatLabel, cancelled, pending, rejected, canToggleCancel }
  detail: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  errorKey: { type: String, default: '' },
})
defineEmits(['toggle-cancel', 'dismiss'])

const { t } = useI18n()
const statusKind = computed(() => (props.detail?.cancelled || props.detail?.rejected ? 'bad' : props.detail?.pending ? 'pending' : 'ok'))
const statusLabel = computed(() => {
  if (props.detail?.cancelled) return t('guestPosStatusCancelled')
  if (props.detail?.rejected) return t('guestPosStatusRejected')
  if (props.detail?.pending) return t('guestPosStatusPending')
  return t('guestPosStatusSynced')
})
</script>

<style scoped>
.pos-hdetail { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.pos-hdetail__none { flex: 1; display: flex; align-items: center; justify-content: center; color: #9CA3AF; font-size: var(--fs-md); }
.pos-hdetail__head { padding: 18px 24px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.pos-hdetail__title { font-size: var(--fs-xl); font-weight: var(--fw-bold); }
.pos-hdetail__meta { font-size: var(--fs-base); color: var(--pos-muted); margin-top: 4px; }
.pos-hdetail__status { padding: 4px 12px; border-radius: 999px; font-size: var(--fs-base); font-weight: var(--fw-bold); }
.pos-hdetail__status--ok { background: #F0FDF4; color: var(--pos-ok); }
.pos-hdetail__status--pending { background: var(--pos-warn-bg); color: var(--pos-warn); }
.pos-hdetail__status--bad { background: #FEF2F2; color: var(--pos-danger); }
.pos-hdetail__body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 24px; }
.pos-hdetail__line { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid #F0F1F3; font-size: var(--fs-md); }
.pos-hdetail__qty { min-width: 32px; font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
.pos-hdetail__name { flex: 1; min-width: 0; font-weight: var(--fw-medium); }
.pos-hdetail__amount { font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
.pos-hdetail__payments { margin-top: 12px; padding: 12px 0; border-top: 1px solid var(--pos-border); }
.pos-hdetail__payments-title { font-size: var(--fs-sm); font-weight: var(--fw-bold); color: var(--pos-muted); margin-bottom: 6px; }
.pos-hdetail__payment { display: flex; justify-content: space-between; padding: 4px 0; font-size: var(--fs-md); }
.pos-hdetail__foot { padding: 16px 24px 20px; border-top: 1px solid var(--pos-border); background: #FAFAFA; display: flex; flex-direction: column; gap: 14px; }
.pos-hdetail__totals { display: flex; justify-content: space-between; align-items: baseline; }
.pos-hdetail__vat { font-size: var(--fs-md); color: var(--pos-muted); }
.pos-hdetail__total { font-size: var(--fs-xxl); font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
.pos-hdetail__error { margin: 0; font-size: var(--fs-base); color: var(--pos-danger); font-weight: var(--fw-semibold); }
.pos-hdetail__toggle { min-height: 52px; border-radius: 10px; font-size: var(--fs-md); font-weight: var(--fw-bold); border: 1px solid #FCA5A5; background: var(--pos-surface); color: var(--pos-danger); cursor: pointer; }
.pos-hdetail__toggle:disabled { opacity: 0.5; cursor: wait; }
</style>
