<template>
  <div class="ps-state" :style="{ width: width + 'px', height: height + 'px' }">
    <span class="ps-state__msg">{{ status === 'error' ? t('rj1P2Error') : t('rj1P2Empty') }}</span>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

defineProps({
  status: { type: String, default: 'empty' },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
})
const { t } = useI18n()
</script>

<style scoped>
.ps-state { display: flex; align-items: center; justify-content: center; text-align: center; box-sizing: border-box; padding: 0 16px; }
.ps-state__msg { font-size: var(--fs-sm); color: #94a3b8; line-height: 1.4; }
</style>
