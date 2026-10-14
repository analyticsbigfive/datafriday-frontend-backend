<template>
  <div class="ce" role="status">
    <v-icon size="36" class="ce__ico" aria-hidden="true">mdi-text-search-variant</v-icon>
    <div class="ce__title">{{ t('anCmpEmptyTitle') }}</div>
    <div class="ce__sub">{{ t('anCmpEmptySub') }}</div>
    <button type="button" class="ce__btn" @click="emit('edit')">
      <v-icon size="16">mdi-pencil-outline</v-icon>
      {{ t('anCmpEditCriteria') }}
    </button>
  </div>
</template>

<script setup>
// Rapport de comparaison vide : aucun event ne correspond aux critères.
import { useI18n } from '@/i18n/useI18n'

const emit = defineEmits(['edit'])
const { t } = useI18n()
</script>

<style scoped>
.ce {
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
.ce__ico { color: var(--cr-muted); opacity: 0.7; }
.ce__title { margin-top: 4px; font-size: var(--fs-lg); font-weight: var(--fw-medium); }
.ce__sub { font-size: var(--fs-sm); color: var(--cr-muted); }
.ce__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  margin-top: 12px;
  padding: 0 14px;
  border: 1px solid var(--cr-line);
  border-radius: 10px;
  background: var(--cr-surface);
  color: inherit;
  font: inherit;
  font-size: var(--fs-base);
  cursor: pointer;
}
.ce__btn:hover { background: var(--cr-surface2); }
.ce__btn:focus-visible { outline: 2px solid var(--cr-cmp); outline-offset: 2px; }
</style>
