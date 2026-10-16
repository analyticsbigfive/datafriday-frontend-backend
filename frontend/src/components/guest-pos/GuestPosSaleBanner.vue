<template>
  <div v-if="view" class="pos-banner" role="status">
    <div class="pos-banner__icon"><Check :size="20" aria-hidden="true" /></div>
    <div class="pos-banner__text">
      <div class="pos-banner__title">{{ t('guestPosBannerTitle').replace('{number}', view.ticketNumber).replace('{total}', view.totalLabel) }}</div>
      <div class="pos-banner__detail">{{ errorKey ? t(errorKey) : view.detail }}</div>
    </div>
    <button v-if="view.canCancel" type="button" class="pos-banner__undo" :disabled="busy" @click="cancel">{{ t('guestPosBannerUndo') }}</button>
    <button type="button" class="pos-banner__close" :aria-label="t('guestPosClose')" @click="dismiss"><X :size="16" aria-hidden="true" /></button>
  </div>
</template>

<script setup>
import { Check, X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { useGuestPosSaleBanner } from '@/composables/useGuestPosSaleBanner'

const { t } = useI18n()
const { view, busy, errorKey, cancel, dismiss } = useGuestPosSaleBanner()
</script>

<style scoped>
.pos-banner {
  position: absolute; left: 16px; right: 16px; bottom: 16px; z-index: 10; display: flex; align-items: center; gap: 14px; padding: 12px 14px;
  border-radius: 14px; background: #14532D; color: #fff; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.25);
}
.pos-banner__icon { width: 36px; height: 36px; flex-shrink: 0; border-radius: 18px; background: var(--pos-ok); display: flex; align-items: center; justify-content: center; }
.pos-banner__text { flex: 1; min-width: 0; }
.pos-banner__title { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.pos-banner__detail { font-size: var(--fs-base); opacity: 0.85; }
.pos-banner__undo {
  min-height: 44px; padding: 0 16px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.6); background: transparent; color: #fff;
  font-size: var(--fs-md); font-weight: var(--fw-bold); cursor: pointer;
}
.pos-banner__undo:disabled { opacity: 0.6; cursor: wait; }
.pos-banner__close { width: 44px; height: 44px; border-radius: 8px; border: 0; background: transparent; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
</style>
