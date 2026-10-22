<template>
  <aside class="ct-card ct-summary" :aria-label="t('ctSummaryLabel')">
    <CostTrackingAccordion :title="t('ctSumRises')" variant="summary">
      <CostTrackingRankCard
        v-for="(row, i) in rises"
        :key="row.key"
        :row="row"
        :index="i"
        direction="up"
        :max="Math.abs(rises[0].variation.pct)"
        @select="onSelect"
      />
      <div v-if="!rises.length" class="ct-summary__empty">{{ t('ctNoRise') }}</div>
    </CostTrackingAccordion>

    <CostTrackingAccordion :title="t('ctSumFalls')" variant="summary">
      <CostTrackingRankCard
        v-for="(row, i) in falls"
        :key="row.key"
        :row="row"
        :index="i"
        direction="down"
        :max="Math.abs(falls[0].variation.pct)"
        @select="onSelect"
      />
      <div v-if="!falls.length" class="ct-summary__empty">{{ t('ctNoFall') }}</div>
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
import { useI18n } from '@/i18n/useI18n'
import CostTrackingAccordion from './CostTrackingAccordion.vue'
import CostTrackingFeedItem from './CostTrackingFeedItem.vue'
import CostTrackingRankCard from './CostTrackingRankCard.vue'

// Colonne de droite : plus fortes hausses, plus fortes baisses, derniers changements.
// `select` émet l'id d'article à ouvrir dans l'historique.
defineProps({
  rises: { type: Array, default: () => [] },
  falls: { type: Array, default: () => [] },
  changes: { type: Array, default: () => [] },
})
const emit = defineEmits(['select'])

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
.ct-summary__empty {
  padding: 4px 2px;
  color: var(--ct-faint);
  font-size: var(--fs-sm);
}
</style>
