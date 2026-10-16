<template>
  <GuestPosModalShell :title="t('guestPosSplitTitle')" width="560px" @close="$emit('close')">
    <div class="pos-split">
      <div class="pos-split__head">
        <div class="pos-split__title">{{ t('guestPosSplitTitle') }}</div>
        <div class="pos-split__total">{{ totalLabel }}</div>
      </div>

      <div class="pos-split__modes" role="tablist">
        <button type="button" role="tab" :aria-selected="split.mode.value === 'equal'" class="pos-split__mode" :class="{ 'pos-split__mode--on': split.mode.value === 'equal' }" @click="split.setMode('equal')">{{ t('guestPosSplitEqual') }}</button>
        <button type="button" role="tab" :aria-selected="split.mode.value === 'amount'" class="pos-split__mode" :class="{ 'pos-split__mode--on': split.mode.value === 'amount' }" @click="split.setMode('amount')">{{ t('guestPosSplitByAmount') }}</button>
      </div>

      <GuestPosSplitEqual
        v-if="split.mode.value === 'equal'"
        :count="split.count.value"
        :min-parts="split.minParts"
        :max-parts="split.maxParts"
        :parts="split.parts.value"
        :methods="split.methods.value"
        @step="split.stepCount"
        @method="({ index, methodId }) => split.setPartMethod(index, methodId)"
      />
      <GuestPosSplitByAmount
        v-else
        v-model:custom-text="split.customText.value"
        :methods="split.methods.value"
        :selected-method-id="split.selectedAmountMethodId.value"
        :presets="split.presets"
        :can-add="split.canAdd.value"
        :lines="split.lines.value"
        @method="split.setAmountMethod"
        @preset="split.addPreset"
        @rest="split.addRest"
        @custom="split.addCustom"
        @remove="split.removeLine"
      />

      <GuestPosSplitRest :rest="split.restCents.value" :label="split.restLabel.value" />
      <p v-if="errorKey" class="pos-split__error" role="alert">{{ t(errorKey) }}</p>

      <div class="pos-split__actions">
        <button type="button" class="pos-split__back" @click="$emit('close')">{{ t('guestPosBack') }}</button>
        <button type="button" class="pos-split__confirm" :disabled="!split.canConfirm.value || submitting" @click="confirm">{{ t('guestPosSplitConfirm') }}</button>
      </div>
    </div>
  </GuestPosModalShell>
</template>

<script setup>
import { onMounted } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useGuestPosSplit } from '@/composables/useGuestPosSplit'
import { useGuestPosCheckout } from '@/composables/useGuestPosCheckout'
import { useGuestPosTicket } from '@/composables/useGuestPosTicket'
import GuestPosModalShell from './GuestPosModalShell.vue'
import GuestPosSplitEqual from './GuestPosSplitEqual.vue'
import GuestPosSplitByAmount from './GuestPosSplitByAmount.vue'
import GuestPosSplitRest from './GuestPosSplitRest.vue'

const emit = defineEmits(['close'])

const { t } = useI18n()
const split = useGuestPosSplit()
const { totalLabel } = useGuestPosTicket()
const { submitting, errorKey, payShared } = useGuestPosCheckout()

onMounted(() => split.reset())

async function confirm() {
  if (!split.canConfirm.value) return
  const done = await payShared(split.buildPayments())
  if (done) emit('close')
}
</script>

<style scoped>
.pos-split { padding: 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.pos-split__head { display: flex; justify-content: space-between; align-items: baseline; }
.pos-split__title { font-size: var(--fs-xl); font-weight: var(--fw-bold); }
.pos-split__total { font-size: var(--fs-xxl); font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
.pos-split__modes { display: flex; border: 1px solid var(--pos-border-strong); border-radius: 10px; overflow: hidden; }
.pos-split__mode { flex: 1; min-height: 44px; border: 0; font-size: var(--fs-md); font-weight: var(--fw-bold); background: var(--pos-surface); color: #374151; cursor: pointer; }
.pos-split__mode--on { background: var(--pos-accent); color: #fff; }
.pos-split__error { margin: 0; text-align: center; font-size: var(--fs-base); color: var(--pos-danger); font-weight: var(--fw-semibold); }
.pos-split__actions { display: flex; gap: 10px; }
.pos-split__back { flex: 1; min-height: 56px; border-radius: 12px; border: 1px solid var(--pos-border-strong); background: var(--pos-surface); color: var(--pos-text); font-size: var(--fs-md); font-weight: var(--fw-bold); cursor: pointer; }
.pos-split__confirm { flex: 1; min-height: 56px; border-radius: 12px; border: 0; font-size: var(--fs-lg); font-weight: var(--fw-bold); background: var(--pos-accent); color: #fff; cursor: pointer; }
.pos-split__confirm:disabled { background: var(--pos-border); color: #9CA3AF; cursor: not-allowed; }
</style>
