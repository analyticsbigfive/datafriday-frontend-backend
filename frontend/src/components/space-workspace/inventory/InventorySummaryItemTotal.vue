<template>
  <!-- Total d'une carte d'article : unités + libellé sur UNE ligne, coût dessous. -->
  <span class="ist">
    <span class="ist-line">
      <strong class="ist-units">{{ formatUnits(units) }}</strong>
      <small class="ist-label">{{ label }}</small>
    </span>
    <small class="ist-cost">{{ cost > 0 ? formatCurrencyDetailed(cost) : '—' }}</small>
  </span>
</template>

<script setup>
import { formatUnits, formatCurrencyDetailed } from '@/composables/useFormatters'

defineProps({
  units: { type: Number, default: 0 },
  label: { type: String, default: '' },
  // Coût de la carte ; null ou 0 = « — » (jamais un 0 € inventé).
  cost: { type: Number, default: null },
})
</script>

<style scoped>
.ist {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.ist-line { display: inline-flex; align-items: baseline; gap: 4px; white-space: nowrap; }
.ist-units {
  color: var(--fb-text, #111827);
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
}
.ist-label,
.ist-cost {
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-xs);
  white-space: nowrap;
}
</style>
