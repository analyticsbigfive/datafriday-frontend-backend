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
    <div class="cfl__legend">
      <span><i class="cfl__sq"></i>{{ t('anCmpLegendOwn') }}</span>
      <span class="cfl__shared"><v-icon size="14" aria-hidden="true">mdi-link-variant</v-icon>{{ t('anCmpLegendShared') }}</span>
    </div>
  </div>
</template>

<script setup>
// Filtres appliqués au rapport de comparaison : puces violettes pour ceux propres à la
// comparaison, puces grises avec maillon pour ceux repris du principal, puis la légende.
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
.cfl__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: var(--fs-xs);
  color: var(--cr-muted);
}
.cfl__sq {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 4px;
  border-radius: 3px;
  background: var(--cr-cmp);
  vertical-align: -1px;
}
.cfl__shared { display: inline-flex; align-items: center; gap: 3px; }
</style>
