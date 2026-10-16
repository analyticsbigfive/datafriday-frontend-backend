<template>
  <GuestPosModalShell :title="t('guestPosClosingTitle')" width="480px" @close="$emit('close')">
    <div class="pos-closing">
      <div>
        <div class="pos-closing__title">{{ t('guestPosClosingTitle') }}</div>
        <div class="pos-closing__sub">{{ t('guestPosClosingSubtitle') }}</div>
      </div>

      <p v-if="errorKey" class="pos-closing__error" role="alert">{{ t(errorKey) }}</p>
      <div v-else-if="loading && !view" class="pos-closing__loading">{{ t('guestPosLoading') }}</div>

      <div v-else-if="view" class="pos-closing__rows">
        <div class="pos-closing__row"><span>{{ t('guestPosClosingTickets') }}</span><strong>{{ view.tickets }}</strong></div>
        <div v-for="method in view.byPaymentMethod" :key="method.id" class="pos-closing__row">
          <span>{{ method.name }}</span><strong>{{ method.amountLabel }}</strong>
        </div>
        <div class="pos-closing__row"><span>{{ t('guestPosClosingVat') }}</span><strong>{{ view.vatLabel }}</strong></div>
        <div class="pos-closing__row pos-closing__row--total"><span>{{ t('guestPosClosingRevenue') }}</span><strong>{{ view.revenueLabel }}</strong></div>
        <template v-if="view.hasTips">
          <div class="pos-closing__row"><span>{{ t('guestPosClosingTips') }}</span><strong>{{ view.tipsTotalLabel }}</strong></div>
          <div v-for="vendor in view.tipsByVendor" :key="vendor.vendorName" class="pos-closing__row pos-closing__row--sub">
            <span>{{ t('guestPosClosingTipsOf').replace('{name}', vendor.vendorName) }}</span><span>{{ vendor.tipLabel }}</span>
          </div>
        </template>
        <div v-if="view.cancelled > 0" class="pos-closing__row pos-closing__row--sub">
          <span>{{ t('guestPosClosingCancelled') }}</span><span>{{ view.cancelled }}</span>
        </div>
      </div>

      <p class="pos-closing__note">{{ pendingCount > 0 ? t('guestPosClosingPending').replace('{count}', pendingCount) : t('guestPosClosingAllSynced') }}</p>

      <div class="pos-closing__actions">
        <button type="button" class="pos-closing__back" @click="$emit('close')">{{ t('guestPosBack') }}</button>
        <button type="button" class="pos-closing__leave" :disabled="pendingCount > 0" @click="$emit('leave')">{{ t('guestPosClosingLeave') }}</button>
      </div>
    </div>
  </GuestPosModalShell>
</template>

<script setup>
import { onMounted } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useGuestPosClosing } from '@/composables/useGuestPosClosing'
import GuestPosModalShell from './GuestPosModalShell.vue'

defineEmits(['close', 'leave'])

const { t } = useI18n()
const { view, loading, errorKey, pendingCount, load } = useGuestPosClosing()
onMounted(load)
</script>

<style scoped>
.pos-closing { padding: 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.pos-closing__title { font-size: var(--fs-xl); font-weight: var(--fw-bold); }
.pos-closing__sub { font-size: var(--fs-base); color: var(--pos-muted); margin-top: 4px; }
.pos-closing__rows { display: flex; flex-direction: column; }
.pos-closing__row { display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid #F0F1F3; font-size: var(--fs-md); color: #374151; font-variant-numeric: tabular-nums; }
.pos-closing__row strong { font-weight: var(--fw-bold); color: var(--pos-text); }
.pos-closing__row--total span, .pos-closing__row--total strong { font-weight: var(--fw-bold); color: var(--pos-text); }
.pos-closing__row--sub { padding-left: 16px; color: var(--pos-muted); }
.pos-closing__note { margin: 0; font-size: var(--fs-base); color: var(--pos-muted); line-height: 1.5; }
.pos-closing__error { margin: 0; font-size: var(--fs-md); color: var(--pos-danger); font-weight: var(--fw-semibold); }
.pos-closing__loading { color: var(--pos-muted); font-size: var(--fs-md); }
.pos-closing__actions { display: flex; gap: 10px; }
.pos-closing__back { flex: 1; min-height: 52px; border-radius: 10px; border: 1px solid var(--pos-border-strong); background: var(--pos-surface); color: var(--pos-text); font-size: var(--fs-md); font-weight: var(--fw-bold); cursor: pointer; }
.pos-closing__leave { flex: 1; min-height: 52px; border-radius: 10px; border: 0; background: var(--pos-accent); color: #fff; font-size: var(--fs-md); font-weight: var(--fw-bold); cursor: pointer; }
.pos-closing__leave:disabled { background: var(--pos-border); color: #9CA3AF; cursor: not-allowed; }
</style>
