<template>
  <!-- En-tête du « Résumé Inventaire » : titre + export CSV, puis progression et coût total. -->
  <div class="ish">
    <div class="ish-title-row">
      <h3 class="ish-title">{{ title }}</h3>
      <button
        v-if="exportable"
        type="button"
        class="ish-export"
        :title="t('invSummaryExportCsv')"
        :aria-label="t('invSummaryExportCsv')"
        @click="$emit('export')"
      >
        <Download class="ish-export-icon" aria-hidden="true" />
      </button>
    </div>
    <div class="ish-meta-row">
      <p class="ish-progress">{{ countedItems }} / {{ totalItems }} {{ t('invMetricCounted') }} · {{ percent }} %</p>
      <strong v-if="totalCost != null" class="ish-cost">{{ formatCurrencyDetailed(totalCost) }}</strong>
    </div>
  </div>
</template>

<script setup>
import { Download } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed } from '@/composables/useFormatters'

defineProps({
  title: { type: String, required: true },
  countedItems: { type: Number, default: 0 },
  totalItems: { type: Number, default: 0 },
  percent: { type: Number, default: 0 },
  // Somme des coûts des cartes ; null = aucun coût connu (rien d'affiché).
  totalCost: { type: Number, default: null },
  exportable: { type: Boolean, default: true },
})
defineEmits(['export'])

const { t } = useI18n()
</script>

<style scoped>
.ish-title-row,
.ish-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ish-title {
  margin: 0;
  min-width: 0;
  color: #64748b;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.ish-export {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: transparent;
  color: var(--fb-text, #111827);
  cursor: pointer;
}
.ish-export:hover { background: var(--fb-subtle, #f7f7f8); }
.ish-export:focus-visible {
  outline: 2px solid rgba(255, 49, 49, 0.45);
  outline-offset: 2px;
}
.ish-export-icon { width: 14px; height: 14px; }
.ish-meta-row { margin-top: 4px; }
.ish-progress {
  margin: 0;
  min-width: 0;
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-xs);
}
.ish-cost {
  flex: 0 0 auto;
  color: var(--fb-text, #111827);
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
