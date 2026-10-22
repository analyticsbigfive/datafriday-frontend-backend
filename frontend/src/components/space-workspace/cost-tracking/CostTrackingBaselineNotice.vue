<template>
  <div v-if="!dismissed" class="ct-notice" role="note">
    <button type="button" class="ct-notice__close" :aria-label="t('ctNoticeClose')" @click="dismiss">
      <X :size="18" />
    </button>
    <History :size="28" class="ct-notice__icon" />
    <div class="ct-notice__body">
      <h3 class="ct-notice__title">{{ t('ctNoticeTitle').replace('{date}', fmt.dayYear(startedAt)) }}</h3>
      <p class="ct-notice__text">{{ t('ctNoticeBody') }}</p>
      <small v-if="firstEvent" class="ct-notice__first">
        {{ t('ctNoticeFirstEvent').replace('{name}', firstEvent.name).replace('{date}', fmt.dayYear(firstEvent.t)) }}
      </small>
      <router-link :to="{ name: 'menu-items' }" class="ct-notice__action">
        <Package :size="16" />{{ t('ctNoticeOpenMenuItem') }}
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { History, Package, X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'
import { useDismissedNotice } from '@/composables/useDismissedNotice'

// Notice ambre « Suivi des coûts actif depuis le... ». Fermable par une croix, la fermeture est
// mémorisée par utilisateur (localStorage, lecture et écriture protégées).
defineProps({
  // Instant (ms) du premier snapshot du périmètre.
  startedAt: { type: Number, required: true },
  // Premier match couvert par le suivi : { name, t } ou null.
  firstEvent: { type: Object, default: null },
})

const STORAGE_KEY = 'costTracking.baselineNoticeDismissed'

const { t } = useI18n()
const fmt = useCostTrackingFormat()
const { dismissed, dismiss } = useDismissedNotice(STORAGE_KEY)
</script>

<style scoped>
.ct-notice {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 12px;
  background: var(--ct-warn-bg);
}
.ct-notice__icon {
  flex: none;
  margin-top: 2px;
  color: var(--ct-warn-fg);
}
.ct-notice__body {
  padding-right: 36px;
}
.ct-notice__title {
  margin: 0 0 6px;
  color: var(--ct-warn-fg);
  font-size: var(--fs-xl);
  font-weight: var(--fw-semibold);
}
.ct-notice__text {
  margin: 0 0 6px;
  color: var(--ct-warn-fg);
  font-size: var(--fs-md);
  line-height: 1.5;
}
.ct-notice__first {
  display: block;
  margin-bottom: 10px;
  color: var(--ct-warn-fg-2);
  font-size: var(--fs-base);
}
.ct-notice__close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ct-warn-fg);
  cursor: pointer;
}
.ct-notice__close:hover {
  background: rgba(232, 150, 12, 0.18);
}
.ct-notice__action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border-radius: 6px;
  background: rgba(232, 150, 12, 0.14);
  color: var(--ct-warn-fg);
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  text-decoration: none;
}
</style>
