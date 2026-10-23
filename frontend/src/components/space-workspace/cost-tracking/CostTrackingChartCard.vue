<template>
  <section class="ct-card ct-chart-card" aria-labelledby="ct-chart-title">
    <div class="ct-chart-card__head">
      <div class="ct-chart-card__text">
        <div id="ct-chart-title" class="ct-card__title">{{ t('ctChartTitle') }}</div>
        <div class="ct-card__sub">{{ subtitle }}</div>
      </div>
      <CostTrackingGroupSwitch
        :model-value="groupBy"
        @update:model-value="$emit('set-group-by', $event)" />
    </div>

    <CostTrackingStateMessage v-if="state !== 'ready'" :kind="state" :group-by="groupBy" @retry="$emit('retry')" />
    <template v-else>
      <CostTrackingChart
        :chart-model="chartModel"
        :series="series"
        :bounds="bounds"
        :show-margin="showMargin"
        :show-price="showPrice"
        :with-events="withEvents"
      />
      <CostTrackingLegend :rows="legendRows" @toggle="$emit('toggle-line', $event)" />
      <CostTrackingChartKey :with-events="withEvents" :with-margin="showMargin" :with-price="showPrice" />
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'
import { countText } from '@/utils/costTrackingCopy'
import CostTrackingChart from './CostTrackingChart.vue'
import CostTrackingChartKey from './CostTrackingChartKey.vue'
import CostTrackingGroupSwitch from './CostTrackingGroupSwitch.vue'
import CostTrackingLegend from './CostTrackingLegend.vue'
import CostTrackingStateMessage from './CostTrackingStateMessage.vue'

// Carte du graphique : titre, sous-titre, bascule « Afficher par », graphique, légende, pied.
// Pure présentation : toutes les données arrivent en props.
const props = defineProps({
  groupBy: { type: String, default: 'article' },
  // 'ready' | 'loading' | 'error' | 'empty' | 'noScope' | 'notStarted'
  state: { type: String, default: 'ready' },
  chartModel: { type: Function, required: true },
  series: { type: Array, default: () => [] },
  legendRows: { type: Array, default: () => [] },
  bounds: { type: Array, required: true },
  showMargin: { type: Boolean, default: false },
  showPrice: { type: Boolean, default: false },
  withEvents: { type: Boolean, default: true },
  truncated: { type: Boolean, default: false },
  rankedByRevenue: { type: Boolean, default: false },
})
defineEmits(['set-group-by', 'toggle-line', 'retry'])

const { t, locale } = useI18n()
const fmt = useCostTrackingFormat()

const subtitle = computed(() => {
  if (props.state === 'loading') return ''
  let noun = countText(props.legendRows.length, props.groupBy, t, locale.value)
  if (props.truncated && props.groupBy === 'article') {
    noun += t(props.rankedByRevenue ? 'ctTruncatedByRevenue' : 'ctTruncatedAlpha')
  }
  return t('ctChartSub')
    .replace('{lines}', noun)
    .replace('{from}', fmt.dayYear(props.bounds[0]))
    // bounds[1] est la fin exclusive (minuit du lendemain) : on affiche le dernier jour inclus.
    .replace('{to}', fmt.dayYear(props.bounds[1] - 1))
})
</script>

<style scoped>
.ct-chart-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.ct-chart-card__text {
  flex: 1 1 280px;
  min-width: 0;
}
/* La bascule garde sa largeur naturelle sur une ligne ; si la carte est trop étroite elle passe
   sous le titre et défile horizontalement plutôt que de couper ses libellés. */
.ct-chart-card__head :deep(.ct-seg) {
  flex: 0 1 auto;
}
</style>
