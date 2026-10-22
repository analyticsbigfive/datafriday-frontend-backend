<template>
  <div class="ct-chips" :aria-label="t('ctActiveFilters')">
    <span class="ct-chipx ct-chipx--filter">{{ t('ctChipPeriod').replace('{value}', periodLabel) }}</span>
    <span v-for="chip in chips" :key="chip.key" class="ct-chipx ct-chipx--filter">
      {{ chip.label }}
      <button type="button" :aria-label="t('ctRemoveFilter').replace('{value}', chip.label)" @click="$emit('remove', chip.key)">
        <X :size="13" />
      </button>
    </span>
    <span class="ct-chipx ct-chipx--plain">{{ countLabel }}</span>
  </div>
</template>

<script setup>
import { X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'

// Pastilles des filtres actifs sous le bandeau : période, type, catégorie, article, ingrédient, effectif.
// chips : [{ key: 'type'|'category'|'article'|'ingredient', label }]
defineProps({
  periodLabel: { type: String, default: '' },
  chips: { type: Array, default: () => [] },
  // Effectif du niveau affiché, déjà formaté (« 28 catégories »).
  countLabel: { type: String, default: '' },
})
defineEmits(['remove'])

const { t } = useI18n()
</script>

<style scoped>
.ct-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
}
.ct-chipx {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
}
.ct-chipx--plain {
  background: var(--ct-chip-plain-bg);
  color: var(--ct-chip-plain-fg);
}
.ct-chipx--filter {
  background: var(--ct-chip-filter-bg);
  color: var(--ct-chip-filter-fg);
}
.ct-chipx button {
  display: inline-grid;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
}
.ct-chipx button:hover {
  opacity: 1;
}
</style>
