<template>
  <div class="pos-rest" :class="rest === 0 ? 'pos-rest--ok' : 'pos-rest--due'">
    <span class="pos-rest__label">{{ t('guestPosSplitRest') }}</span>
    <span class="pos-rest__value">{{ label }}</span>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

defineProps({
  rest: { type: Number, default: 0 }, // centimes
  label: { type: String, default: '' },
})

const { t } = useI18n()
</script>

<style scoped>
.pos-rest { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: 12px; }
.pos-rest--ok { background: #F0FDF4; color: var(--pos-ok); border: 1px solid #BBF7D0; }
.pos-rest--due { background: var(--pos-warn-bg); color: var(--pos-warn); border: 1px solid #FDE68A; }
.pos-rest__label { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.pos-rest__value { font-size: var(--fs-xl); font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
</style>
