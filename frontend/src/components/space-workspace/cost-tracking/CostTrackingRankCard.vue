<template>
  <div
    class="ct-rank"
    :class="{ 'ct-rank--click': !!row.id }"
    :style="{ '--ct-rank-color': `var(--ct-${direction === 'flat' ? 'faint' : direction === 'up' ? 'up' : 'down'})` }"
    @click="$emit('select', row)"
  >
    <div class="ct-rank__top">
      <span class="ct-rank__n" :class="{ 'ct-rank__n--first': index === 0 }">{{ index + 1 }}</span>
      <span class="ct-rank__name">{{ row.name }}</span>
      <span class="ct-rank__value">
        <span class="ct-rank__amount">{{ fmt.cost(amount) }}</span>
        <span class="ct-rank__pct" :class="fmt.trendClass(direction)">{{ fmt.pct(row.variation.pct) }}</span>
      </span>
    </div>
    <div class="ct-rank__bar"><i :style="{ width: `${width}%` }" /></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'
import { primaryAmount } from '@/utils/costTrackingPerformance'

// Carte de performance : rang, nom, valeur principale puis variation en % dessous (rouge hausse,
// vert baisse, neutre sinon), barre proportionnelle à la plus forte variation de la liste.
// La valeur principale est `row.amount` s'il est fourni, sinon le coût actuel.
const props = defineProps({
  row: { type: Object, required: true },
  index: { type: Number, default: 0 },
  // Plus forte variation absolue (%) de la liste, base de la barre.
  max: { type: Number, default: 1 },
})
defineEmits(['select'])

const fmt = useCostTrackingFormat()
const amount = computed(() => primaryAmount(props.row))
const direction = computed(() => props.row.variation.direction || 'flat')
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
.ct-rank__value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex: none;
}
.ct-rank__amount {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  font-variant-numeric: tabular-nums;
}
.ct-rank__pct {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  font-variant-numeric: tabular-nums;
}
.ct-rank__bar {
  margin-top: 8px;
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
