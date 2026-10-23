<template>
  <aside class="ct-card ct-summary" :aria-label="t('ctSummaryLabel')">
    <div class="ct-summary__toolbar">
      <div v-if="canAggregate" class="ct-summary__aggregate" role="group" :aria-label="t('ctAggregateLabel')">
        <button
          v-for="opt in AGGREGATES"
          :key="opt"
          type="button"
          class="ct-summary__agg"
          :class="{ 'ct-summary__agg--on': aggregate === opt }"
          :aria-pressed="aggregate === opt"
          @click="$emit('update:aggregate', opt)"
        >{{ t(opt === 'avg' ? 'ctAggregateAvg' : 'ctAggregateSum') }}</button>
      </div>
      <CostTrackingSortSwitch v-model="sort" class="ct-summary__sort" />
    </div>
    <div v-if="sinceLabel" class="ct-summary__since">{{ t('ctRankSince').replace('{date}', sinceLabel) }}</div>

    <CostTrackingPerformanceSection
      :title="t(performanceTitleKey(groupBy))"
      :rows="rows"
      :sort="sort"
      @drill="$emit('drill', $event)"
    />

    <CostTrackingAccordion :title="t('ctSumFeed')" variant="summary">
      <CostTrackingFeedItem
        v-for="change in changes"
        :key="change.key"
        :change="change"
        @select="onSelect"
      />
      <div v-if="!changes.length" class="ct-summary__empty">{{ t('ctNoChange') }}</div>
    </CostTrackingAccordion>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import CostTrackingAccordion from './CostTrackingAccordion.vue'
import CostTrackingFeedItem from './CostTrackingFeedItem.vue'
import CostTrackingPerformanceSection from './CostTrackingPerformanceSection.vue'
import CostTrackingSortSwitch from './CostTrackingSortSwitch.vue'
import { performanceTitleKey } from '@/utils/costTrackingPerformance'

// Colonne de droite : bascule Moyenne / Total, tri hausses/baisses (valable pour toute la colonne),
// section « Performance des <niveau> » (5 par défaut, « Voir tout » déplie), derniers changements. Cliquer un classement émet `drill` (descendre d'un niveau en filtrant) ;
// cliquer un changement émet `select` (id d'article, pour son historique).
const props = defineProps({
  // Toutes les lignes du tableau (celles sans variation sont ignorées par la section).
  rows: { type: Array, default: () => [] },
  changes: { type: Array, default: () => [] },
  // Date de début du suivi (déjà formatée) : explique d'où vient la variation affichée.
  sinceLabel: { type: String, default: '' },
  // Moyenne ou total : proposé quand les lignes sont des types ou des catégories.
  groupBy: { type: String, default: 'article' },
  aggregate: { type: String, default: 'avg' },
})
const emit = defineEmits(['select', 'drill', 'update:aggregate'])

const AGGREGATES = ['avg', 'sum']
const canAggregate = computed(() => props.groupBy === 'category' || props.groupBy === 'type')

// 'up' : plus forte hausse en premier ; 'down' : plus forte baisse en premier.
const sort = ref('up')

const { t } = useI18n()

// Seuls les articles ont un historique : catégories et types ne s'ouvrent pas.
function onSelect(item) {
  if (item?.kind === 'article' && item.id) emit('select', item.id)
}
</script>

<style scoped>
.ct-summary {
  padding: 6px 18px 14px;
  border-radius: 16px;
}
.ct-summary__since {
  padding: 10px 2px 2px;
  color: var(--ct-faint);
  font-size: var(--fs-xs);
  line-height: 1.5;
}
.ct-summary__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
}
.ct-summary__sort {
  margin-left: auto;
}
.ct-summary__empty {
  padding: 4px 2px;
  color: var(--ct-faint);
  font-size: var(--fs-sm);
}
.ct-summary__aggregate {
  display: inline-flex;
  border: 1px solid var(--ct-line, #e5e7eb);
  border-radius: 999px;
  overflow: hidden;
}
.ct-summary__agg {
  padding: 4px 14px;
  font-size: var(--fs-xs);
  background: transparent;
  cursor: pointer;
}
.ct-summary__agg--on {
  background: var(--ct-chip-bg, #eef2ff);
  font-weight: 600;
}
</style>
