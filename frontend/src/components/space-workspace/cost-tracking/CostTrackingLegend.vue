<template>
  <div class="ct-legend">
    <button
      v-for="row in rows"
      :key="row.key"
      type="button"
      class="ct-legend__item"
      :aria-pressed="!row.hidden"
      :title="t('ctLegendToggle').replace('{name}', row.name)"
      @click="$emit('toggle', row.key)"
    >
      <i class="ct-legend__dot" :style="{ background: `var(--ct-s${(row.colorIndex % 10) + 1})` }" />
      <span class="ct-legend__name">{{ row.name }}</span>
      <b class="ct-legend__cost">{{ fmt.cost(row.currentCost) }}</b>
      <span class="ct-legend__delta" :class="fmt.trendClass(row.variation && row.variation.direction)">
        {{ row.variation && row.variation.pct !== null ? fmt.pct(row.variation.pct) : '' }}
      </span>
    </button>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'

// Légende cliquable : une pastille par courbe (coût actuel, variation), clic = masquer / afficher.
// rows : { key, name, colorIndex, hidden, currentCost, variation }.
defineProps({
  rows: { type: Array, default: () => [] },
})
defineEmits(['toggle'])

const { t } = useI18n()
const fmt = useCostTrackingFormat()
</script>

<style scoped>
.ct-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.ct-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border-radius: 99px;
  border: 1px solid var(--ct-border-strong);
  background: var(--ct-surface);
  color: var(--ct-text);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.ct-legend__item[aria-pressed='false'] {
  opacity: 0.45;
}
.ct-legend__item[aria-pressed='false'] .ct-legend__name {
  text-decoration: line-through;
}
.ct-legend__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.ct-legend__cost {
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
}
.ct-legend__delta {
  font-weight: var(--fw-semibold);
  font-variant-numeric: tabular-nums;
}
</style>
