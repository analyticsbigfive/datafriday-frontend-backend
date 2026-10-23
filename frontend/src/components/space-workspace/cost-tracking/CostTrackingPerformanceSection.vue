<template>
  <CostTrackingAccordion :title="title" variant="summary">
    <input
      v-if="searchable"
      v-model="query"
      type="search"
      class="ct-perf__search"
      :placeholder="t('ctPerfSearchPlaceholder')"
      :aria-label="t('ctPerfSearch')"
    >
    <CostTrackingRankCard
      v-for="(row, i) in shown"
      :key="row.key"
      :row="row"
      :index="i"
      :max="max"
      @select="$emit('drill', $event)"
    />
    <div v-if="!list.length" class="ct-perf__empty">{{ t(query.trim() ? 'ctPerfNoMatch' : 'ctPerfEmpty') }}</div>
    <button v-if="list.length > TOP" type="button" class="ct-perf__more" @click="showAll = !showAll">
      {{ showAll ? t('ctCollapse') : t('ctSeeAll').replace('{count}', String(list.length)) }}
    </button>
  </CostTrackingAccordion>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { maxAbsPct, performanceRows } from '@/utils/costTrackingPerformance'
import CostTrackingAccordion from './CostTrackingAccordion.vue'
import CostTrackingRankCard from './CostTrackingRankCard.vue'

// Section générique « Performance des ... » : lignes triées par variation (%), recherche par nom,
// 5 cartes puis « Voir tout (N) ». Cliquer une carte émet `drill`. Réutilisable (niveaux, fournisseurs).
const props = defineProps({
  title: { type: String, required: true },
  rows: { type: Array, default: () => [] },
  // 'up' (hausses d'abord) | 'down' (baisses d'abord)
  sort: { type: String, default: 'up' },
  searchable: { type: Boolean, default: true },
})
defineEmits(['drill'])

const TOP = 5
const { t } = useI18n()
const query = ref('')
const showAll = ref(false)

const list = computed(() => performanceRows(props.rows, props.sort, query.value))
const shown = computed(() => (showAll.value ? list.value : list.value.slice(0, TOP)))
// Base des barres : plus forte variation de toutes les lignes, pour qu'une recherche ne les étire pas.
const max = computed(() => maxAbsPct(props.rows))
</script>

<style scoped>
.ct-perf__search {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--ct-border-strong);
  border-radius: 10px;
  background: var(--ct-surface);
  color: inherit;
  font-size: var(--fs-sm);
}
.ct-perf__more {
  align-self: flex-start;
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: var(--ct-brand);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.ct-perf__empty {
  padding: 4px 2px;
  color: var(--ct-faint);
  font-size: var(--fs-sm);
}
</style>
