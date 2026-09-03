<template>
  <v-row class="mb-4" dense>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[0]"
        :loading="loading"
        :value="formatCurrency(metrics.displayRevenue.value)"
        :subtext="`${t('anAvgPerEvent')} : ${formatCurrency(metrics.displayAvgRevenue.value)}`"
      />
    </v-col>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[1]"
        :loading="loading"
        :value="formatCurrencyDetailed(metrics.displayPerCapita.value)"
        :subtext="perCapitaSubtext"
      />
    </v-col>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[2]"
        :loading="loading"
        :value="marginLabel"
        :subtext="marginSubtext"
      />
    </v-col>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[3]"
        :loading="loading"
        :value="txPerMinuteLabel"
        :subtext="t('anKpiTxRateScope')"
      />
    </v-col>
  </v-row>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrency, formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { useNumberFormat } from '@/composables/useNumberFormat'
import { KPI_CARDS } from '@/constants/analyseColors'
import KpiCard from '@/components/analyse/panels/KpiCard.vue'

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
