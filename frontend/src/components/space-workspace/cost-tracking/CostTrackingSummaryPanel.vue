<template>
  <aside class="ct-card ct-summary" :aria-label="t('ctSummaryLabel')">
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
    <div v-if="sinceLabel" class="ct-summary__since">{{ t('ctRankSince').replace('{date}', sinceLabel) }}</div>

    <CostTrackingAccordion :title="t('ctSumRises')" variant="summary">
      <CostTrackingRankCard
        v-for="(row, i) in shownRises"
        :key="row.key"
        :row="row"
        :index="i"
        direction="up"
        :max="Math.abs(rises[0].variation.pct)"
        @select="$emit('drill', $event)"
      />
      <div v-if="!rises.length" class="ct-summary__empty">{{ t('ctNoRise') }}</div>
      <button v-if="rises.length > TOP" type="button" class="ct-summary__more" @click="showAllRises = !showAllRises">
        {{ showAllRises ? t('ctCollapse') : t('ctSeeAll').replace('{count}', String(rises.length)) }}
      </button>
    </CostTrackingAccordion>

    <CostTrackingAccordion :title="t('ctSumFalls')" variant="summary">
      <CostTrackingRankCard
        v-for="(row, i) in shownFalls"
        :key="row.key"
        :row="row"
        :index="i"
        direction="down"
        :max="Math.abs(falls[0].variation.pct)"
        @select="$emit('drill', $event)"
      />
      <div v-if="!falls.length" class="ct-summary__empty">{{ t('ctNoFall') }}</div>
      <button v-if="falls.length > TOP" type="button" class="ct-summary__more" @click="showAllFalls = !showAllFalls">
        {{ showAllFalls ? t('ctCollapse') : t('ctSeeAll').replace('{count}', String(falls.length)) }}
      </button>
    </CostTrackingAccordion>

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
import CostTrackingRankCard from './CostTrackingRankCard.vue'

// Colonne de droite : plus fortes hausses, plus fortes baisses (5 par défaut, « Voir tout » déplie),
// derniers changements. Cliquer un classement émet `drill` (descendre d'un niveau en filtrant) ;
// cliquer un changement émet `select` (id d'article, pour son historique).
const props = defineProps({
  rises: { type: Array, default: () => [] },
  falls: { type: Array, default: () => [] },
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

const TOP = 5
const showAllRises = ref(false)
const showAllFalls = ref(false)
const shownRises = computed(() => (showAllRises.value ? props.rises : props.rises.slice(0, TOP)))
const shownFalls = computed(() => (showAllFalls.value ? props.falls : props.falls.slice(0, TOP)))

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
.ct-summary__more {
  align-self: flex-start;
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: var(--ct-brand);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.ct-summary__empty {
  padding: 4px 2px;
  color: var(--ct-faint);
  font-size: var(--fs-sm);
}
.ct-summary__aggregate {
  display: inline-flex;
  margin-bottom: 10px;
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
