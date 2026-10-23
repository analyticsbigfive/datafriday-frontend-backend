<template>
  <aside class="ct-card ct-summary" :aria-label="t('ctSummaryLabel')">
    <div class="ct-summary__toolbar">
      <CostTrackingSegmented
        small
        :disabled="!canAggregate"
        :disabled-hint="t('ctAggregateDisabledHint')"
        :options="aggregateOptions"
        :model-value="aggregate"
        :aria-label="t('ctAggregateLabel')"
        @update:model-value="$emit('update:aggregate', $event)"
      />
      <CostTrackingSortSwitch v-model="sort" class="ct-summary__sort" />
    </div>
    <div v-if="sinceLabel" class="ct-summary__since">{{ t('ctRankSince').replace('{date}', sinceLabel) }}</div>

    <CostTrackingPerformanceSection
      :title="t(performanceTitleKey(groupBy))"
      :rows="rows"
      :sort="sort"
      @drill="$emit('drill', $event)"
    />

    <CostTrackingPerformanceSection
      v-if="showSuppliers"
      :title="t(performanceTitleKey('supplier'))"
      :rows="supplierRows"
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
import CostTrackingSegmented from './CostTrackingSegmented.vue'
import CostTrackingSortSwitch from './CostTrackingSortSwitch.vue'
import { performanceTitleKey } from '@/utils/costTrackingPerformance'
import { canAggregate as modeCanAggregate } from '@/utils/costTrackingParams'

// Colonne de droite : bascule Moyenne / Total, tri hausses/baisses (valable pour toute la colonne),
// section « Performance des <niveau> » (5 par défaut, « Voir tout » déplie), section « Performance des fournisseurs », derniers changements. Cliquer un classement émet `drill` (descendre d'un niveau en filtrant) ;
// cliquer un changement émet `select` (id d'article, pour son historique).
const props = defineProps({
  // Toutes les lignes du tableau (celles sans variation sont ignorées par la section).
  rows: { type: Array, default: () => [] },
  changes: { type: Array, default: () => [] },
  // Lignes par fournisseur (second appel séries), pour la section « Performance des fournisseurs ».
  supplierRows: { type: Array, default: () => [] },
  // Date de début du suivi (déjà formatée) : explique d'où vient la variation affichée.
  sinceLabel: { type: String, default: '' },
  // Moyenne ou total : proposé quand les lignes sont des types, des catégories ou des fournisseurs.
  groupBy: { type: String, default: 'article' },
  aggregate: { type: String, default: 'avg' },
})
const emit = defineEmits(['select', 'drill', 'update:aggregate'])

const canAggregate = computed(() => modeCanAggregate(props.groupBy))
// La section fournisseurs vient en plus, sauf quand le mode courant est déjà « fournisseur ».
const showSuppliers = computed(() => props.groupBy !== 'supplier')

// 'up' : plus forte hausse en premier ; 'down' : plus forte baisse en premier.
const sort = ref('up')

const { t } = useI18n()
const aggregateOptions = computed(() => [
  { value: 'avg', label: t('ctAggregateAvg') },
  { value: 'sum', label: t('ctAggregateSum') },
])

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
  padding: 10px 2px 4px;
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
</style>
