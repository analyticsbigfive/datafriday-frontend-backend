<template>
  <div class="cer" role="alert">
    <v-icon size="36" class="cer__ico" aria-hidden="true">mdi-alert-circle-outline</v-icon>
    <div class="cer__title">{{ t('anCmpErrorTitle') }}</div>
    <div v-if="message" class="cer__sub">{{ message }}</div>
    <div class="cer__actions">
      <button type="button" class="cer__btn cer__btn--primary" @click="emit('retry')">
        <v-icon size="16">mdi-refresh</v-icon>
        {{ t('anCmpRetry') }}
      </button>
      <button type="button" class="cer__btn" @click="emit('edit')">{{ t('anCmpEditCriteria') }}</button>
    </div>
  </div>
</template>

<script setup>
// Erreur de chargement du rapport de comparaison : message et bouton Réessayer.
import { useI18n } from '@/i18n/useI18n'

defineProps({
  message: { type: String, default: '' },
})
const emit = defineEmits(['retry', 'edit'])
const { t } = useI18n()
</script>

<style scoped>
.cer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 36px 20px;
  border: 1px solid var(--cr-line);
  border-radius: 16px;
  background: var(--cr-surface);
  text-align: center;
}
.cer__ico { color: #ef2b2b; }
.cer__title { margin-top: 4px; font-size: var(--fs-lg); font-weight: var(--fw-medium); }
.cer__sub { font-size: var(--fs-sm); color: var(--cr-muted); }
.cer__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 12px; }
.cer__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--cr-line);
  border-radius: 10px;
  background: var(--cr-surface);
  color: inherit;
  font: inherit;
  font-size: var(--fs-base);
  cursor: pointer;
}
.cer__btn:hover { background: var(--cr-surface2); }
.cer__btn--primary { border-color: transparent; background: var(--cr-band); color: #fff; font-weight: var(--fw-bold); }
.cer__btn--primary:hover { background: var(--cr-band); filter: brightness(0.94); }
.cer__btn:focus-visible { outline: 2px solid var(--cr-cmp); outline-offset: 2px; }
</style>
