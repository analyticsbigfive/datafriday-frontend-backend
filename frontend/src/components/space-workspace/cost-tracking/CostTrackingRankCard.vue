<template>
  <div
    class="ct-rank"
    :class="{ 'ct-rank--click': !!row.id && row.kind === 'article' }"
    :style="{ '--ct-rank-color': direction === 'up' ? 'var(--ct-up)' : 'var(--ct-down)' }"
    @click="$emit('select', row)"
  >
    <div class="ct-rank__top">
      <span class="ct-rank__n" :class="{ 'ct-rank__n--first': index === 0 }">{{ index + 1 }}</span>
      <span class="ct-rank__name">{{ row.name }}</span>
      <span class="ct-rank__pct" :class="fmt.trendClass(direction)">{{ fmt.pct(row.variation.pct) }}</span>
    </div>
    <div class="ct-rank__sub">{{ fmt.cost(row.startCost) }} &rarr; {{ fmt.cost(row.currentCost) }}</div>
    <div class="ct-rank__bar"><i :style="{ width: `${width}%` }" /></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'

// Carte de classement (plus forte hausse ou baisse) : rang, nom, variation, coût début vers fin,
// barre proportionnelle à la plus forte variation du classement.
const props = defineProps({
  row: { type: Object, required: true },
  index: { type: Number, default: 0 },
  // 'up' | 'down'
  direction: { type: String, default: 'up' },
  // Plus forte variation absolue (%) du classement, base de la barre.
  max: { type: Number, default: 1 },
})
defineEmits(['select'])

const fmt = useCostTrackingFormat()
const width = computed(() => Math.max(4, (Math.abs(props.row.variation.pct) / (props.max || 1)) * 100))
</script>

<style scoped>
.ct-rank {
  padding: 12px 14px 12px 16px;
  border: 1px solid var(--ct-border-strong);
  border-left: 3px solid var(--ct-rank-color);
  border-radius: 12px;
  background: var(--ct-surface);
  box-shadow: var(--ct-shadow);
}
.ct-rank--click {
  cursor: pointer;
}
.ct-rank--click:hover {
  background: var(--ct-subtle);
}
.ct-rank__top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ct-rank__n {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #9ca3af;
  color: #ffffff;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
}
.ct-rank__n--first {
  background: #fcd34d;
  color: #1f2937;
}
.ct-rank__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-md);
  font-weight: var(--fw-medium);
}
.ct-rank__pct {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  font-variant-numeric: tabular-nums;
}
.ct-rank__sub {
  margin: 6px 0 8px;
  text-align: right;
  color: var(--ct-faint);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
}
.ct-rank__bar {
  height: 6px;
  border-radius: 99px;
  background: var(--ct-border);
  overflow: hidden;
}
.ct-rank__bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--ct-rank-color);
}
</style>
