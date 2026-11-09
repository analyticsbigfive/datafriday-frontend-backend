<template>
  <!-- Total d'une carte d'article : unités + libellé sur UNE ligne, coût dessous. -->
  <span class="ist">
    <span class="ist-line">
      <strong class="ist-units">{{ formatUnits(units) }}</strong>
      <small class="ist-label">{{ label }}</small>
    </span>
    <small class="ist-cost">{{ cost > 0 ? formatCurrencyDetailed(cost) : '—' }}</small>
    <!-- Valeur de vente HT et marge, sous le coût ; tiret simple si pas de prix (jamais 0 inventé). -->
    <small v-if="showSale" class="ist-sale">
      <template v-if="saleHt > 0">
        {{ t('invSaleItemHt').replace('{value}', formatCurrencyDetailed(saleHt)) }}<template v-if="saleMargin != null"> · {{ t('invSaleItemMargin').replace('{value}', formatPercent(saleMargin, 0)) }}</template>
      </template>
      <template v-else>-</template>
    </small>
  </span>
</template>

<script setup>
import { formatUnits, formatCurrencyDetailed, formatPercent } from '@/composables/useFormatters'
import { useI18n } from '@/i18n/useI18n'

defineProps({
  units: { type: Number, default: 0 },
  label: { type: String, default: '' },
  // Coût de la carte ; null ou 0 = « — » (jamais un 0 € inventé).
  cost: { type: Number, default: null },
  // Ligne HT / marge : affichée seulement si showSale (prix de vente chargés).
  showSale: { type: Boolean, default: false },
  saleHt: { type: Number, default: null },
  saleMargin: { type: Number, default: null },
})
const { t } = useI18n()
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
.ist-cost,
.ist-sale {
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-xs);
  white-space: nowrap;
}
</style>
