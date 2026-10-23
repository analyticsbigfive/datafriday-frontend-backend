<template>
  <div class="ct-sort" role="group" :aria-label="t('ctSortLabel')">
    <button
      type="button"
      class="ct-sort__btn ct-sort__btn--up"
      :disabled="modelValue === 'up'"
      :aria-pressed="modelValue === 'up'"
      :aria-label="t('ctSortRisesFirst')"
      :title="t('ctSortRisesFirst')"
      @click="$emit('update:modelValue', 'up')"
    ><ArrowUp :size="16" /></button>
    <button
      type="button"
      class="ct-sort__btn ct-sort__btn--down"
      :disabled="modelValue === 'down'"
      :aria-pressed="modelValue === 'down'"
      :aria-label="t('ctSortFallsFirst')"
      :title="t('ctSortFallsFirst')"
      @click="$emit('update:modelValue', 'down')"
    ><ArrowDown :size="16" /></button>
  </div>
</template>

<script setup>
import { ArrowDown, ArrowUp } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'

// Deux boutons de tri : flèche rouge (hausses d'abord) et flèche verte (baisses d'abord).
// Le bouton actif est grisé et désactivé.
defineProps({
  // 'up' | 'down'
  modelValue: { type: String, default: 'up' },
})
defineEmits(['update:modelValue'])

const { t } = useI18n()
</script>

<style scoped>
.ct-sort {
  display: inline-flex;
  gap: 6px;
}
.ct-sort__btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--ct-border-strong);
  border-radius: 50%;
  background: var(--ct-surface);
  cursor: pointer;
}
.ct-sort__btn--up {
  color: var(--ct-up);
}
.ct-sort__btn--down {
  color: var(--ct-down);
}
.ct-sort__btn:disabled {
  border-color: var(--ct-border);
  background: var(--ct-subtle);
  color: var(--ct-faint);
  cursor: default;
}
</style>
