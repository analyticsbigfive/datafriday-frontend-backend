<template>
  <!-- Grille KPI : responsive en desktop, SCROLL HORIZONTAL en mobile (≤600px, cf. CSS). -->
  <div class="lkr-grid">
    <KpiCard
      :config="cards[0]"
      :loading="loading"
      :value="formatCurrency(metrics.displayRevenue.value)"
      :subtext="`${t('anAvgPerEvent')} : ${formatCurrency(metrics.displayAvgRevenue.value)}`"
    />
    <KpiCard
      :config="cards[1]"
      :loading="loading"
      :value="formatCurrencyDetailed(metrics.displayPerCapita.value)"
      :subtext="perCapitaSubtext"
    />
    <KpiCard
      :config="cards[2]"
      :loading="loading"
      :value="marginLabel"
      :subtext="marginSubtext"
    />
    <KpiCard
      :config="cards[3]"
      :loading="loading"
      :value="txPerMinuteLabel"
      :subtext="t('anKpiTxRateScope')"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrency, formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { useNumberFormat } from '@/composables/useNumberFormat'
import { KPI_CARDS } from '@/constants/analyseColors'
import KpiCard from '@/components/space-workspace/shared/KpiCard.vue'

const { t } = useI18n()
const { formatDecimal } = useNumberFormat()

const props = defineProps({
  // `useMetricsCalculator(...)` déjà branché sur les records item-level Live
  // (filtrés), même forme que celle consommée par FinancialMetricsGrid.vue.
  metrics: { type: Object, required: true },
  txPerMinute: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
})

const cards = computed(() => [
  { ...KPI_CARDS.find((c) => c.key === 'revenue') },
  { ...KPI_CARDS.find((c) => c.key === 'perCapita') },
  { ...KPI_CARDS.find((c) => c.key === 'margin') },
  { ...KPI_CARDS.find((c) => c.key === 'transactionRate') },
].map((c) => ({ ...c, label: c.labelKey ? t(c.labelKey) : c.label })))

const NO_VALUE = '—'

const marginLabel = computed(() => {
  const m = props.metrics.displayMargin?.value
  return m == null ? NO_VALUE : `${m.toFixed(1)}%`
})
const marginSubtext = computed(() => {
  if (props.metrics.displayMargin?.value == null) return `${t('anTotal')} : ${NO_VALUE}`
  const net = props.metrics.displayRevenue.value - props.metrics.displayCost.value
  return `${t('anTotal')} : ${formatCurrencyDetailed(net)}`
})
const perCapitaSubtext = computed(() => {
  const attendees = formatNumber(props.metrics.displayAttendees.value)
  return `${t('anHeaderKpiAttendees')} : ${attendees}`
})
const txPerMinuteLabel = computed(() => `${formatDecimal(props.txPerMinute, 2, { pad: true })}/min`)
</script>

<style scoped>
.lkr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
/* Mobile : bande de KPIs en SCROLL HORIZONTAL (maquette Live de Bertrand, parité
   FinancialMetricsGrid d'Analyse) au lieu d'empiler. Chaque carte garde une largeur
   lisible, on défile latéralement. */
@media (max-width: 600px) {
  .lkr-grid {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x proximity;
    gap: 8px;
    padding-bottom: 4px;
  }
  .lkr-grid > * {
    flex: 0 0 auto;
    width: 62%;
    max-width: 200px;
    scroll-snap-align: start;
  }
}
</style>
