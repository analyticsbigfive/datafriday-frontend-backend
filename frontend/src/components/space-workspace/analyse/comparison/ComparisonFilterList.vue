<template>
  <div class="cfl">
    <div class="cfl__tags" role="list" :aria-label="t('anCmpFiltersLabel')">
      <span
        v-for="f in filters"
        :key="f.key + f.label"
        role="listitem"
        class="cfl__tag"
        :class="{ 'cfl__tag--own': f.own }"
      >
        <v-icon v-if="!f.own" size="14" class="cfl__link" aria-hidden="true">mdi-link-variant</v-icon>
        {{ f.label }}
      </span>
    </div>
  </div>
</template>

<script setup>
// Filtres appliqués au rapport de comparaison : puces violettes pour ceux propres à la
// comparaison, puces grises avec maillon pour ceux repris du principal.
import { useI18n } from '@/i18n/useI18n'

defineProps({
  // [{ key, label, own }] (useComparisonReport.appliedFilters)
  filters: { type: Array, default: () => [] },
})

const { t } = useI18n()
</script>

<style scoped>
.cfl { display: flex; flex-direction: column; gap: 10px; }
.cfl__tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.cfl__tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 99px;
  background: var(--cr-surface2);
  color: var(--cr-fg);
  font-size: var(--fs-sm);
}
.cfl__tag--own {
  background: var(--cr-cmp-bg);
  border-color: var(--cr-cmp-line);
  color: var(--cr-cmp);
}
.cfl__link { opacity: 0.7; }
</style>
