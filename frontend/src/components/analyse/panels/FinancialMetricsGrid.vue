<template>
  <v-row class="mb-4" dense>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[0]"
        :value="formatCurrency(metrics.displayRevenue.value)"
        :subtext="`${t('anAvgPerEvent')} : ${formatCurrency(metrics.displayAvgRevenue.value)}`"
        :variation="v('revenue')"
        @click="$emit('open-chart', 'revenue')"
      />
    </v-col>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[1]"
        :value="formatCurrency(metrics.displayPerCapita.value, 'EUR', 'fr-FR', 2)"
        :subtext="`${t('anHeaderKpiAttendees')} : ${formatNumber(metrics.displayAttendees.value)}`"
        :variation="v('perCapita')"
        @click="$emit('open-chart', 'percap')"
      />
    </v-col>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[2]"
        :value="`${metrics.displayMargin.value.toFixed(1)}%`"
        :subtext="`${t('anTotal')} : ${formatCurrency(metrics.displayRevenue.value - metrics.displayCost.value)}`"
        :variation="v('margin')"
        @click="$emit('open-chart', 'margin')"
      />
    </v-col>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[3]"
        :value="transactionRateLabel"
        :subtext="transactionRateSubtext"
        :variation="v('transferRate')"
        @click="$emit('open-chart', 'transaction-rate')"
      />
    </v-col>
  </v-row>
</template>

<script setup>
import { computed } from 'vue'
import KpiCard from './KpiCard.vue'
import { KPI_CARDS } from '@/constants/analyseColors'
import { formatCurrency, formatNumber } from '@/composables/useFormatters'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  metrics: { type: Object, required: true },
  summary: { type: Object, default: null },
})
defineEmits(['open-chart'])

const { t } = useI18n()

// Labels KPI traduits (KPI_CARDS.label = fallback FR codé en dur ; labelKey = i18n).
const cards = computed(() =>
  KPI_CARDS.map((c) => ({ ...c, label: c.labelKey ? t(c.labelKey) : c.label }))
)

// Mode de comparaison unifié : lu depuis `summary.comparisonMode` (alimenté par
// le toggle « Cette année / Année préc. » du bandeau FilterSummary, persisté
// dans le store). Plus de toggle local → une seule source de vérité.
const v = (key) => {
  if (props.metrics?.isSingleEventMode?.value) return null
  // Pas de fallback : mode null = comparaison OFF → aucune variation affichée.
  const mode = props.summary?.comparisonMode
  if (!mode) return null
  const raw = mode === 'year_over_year'
    ? (props.summary?.variationsYoY?.[key] ?? props.summary?.variations?.[key])
    : props.summary?.variations?.[key]
  return raw == null || !Number.isFinite(raw) ? null : raw
}

// Taux de transaction = transactions / minute (parité React 'Transaction Rate Widget')
const transactionRateLabel = computed(() => {
  const rate = props.metrics.displayTransactionRate?.value ?? 0
  if (!rate) return t('anClick')
  return `${rate.toFixed(2).replace('.', ',')}/min`
})

const transactionRateSubtext = computed(() => {
  const trans = props.metrics.displayTransactions.value
  const evts = props.metrics.validEventsCount.value
  if (!evts) return ''
  return `${t('anAvgPerEvent')} : ${(trans / evts).toFixed(0)}`
})
</script>
