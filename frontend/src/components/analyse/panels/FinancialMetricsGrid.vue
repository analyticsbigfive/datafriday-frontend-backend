<template>
  <v-row class="mb-4" dense>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[0]"
        :loading="isLoading"
        :value="formatCurrency(metrics.displayRevenue.value)"
        :subtext="`${t('anAvgPerEvent')} : ${formatCurrency(metrics.displayAvgRevenue.value)}`"
        :variation="v('revenue')"
        @click="$emit('open-chart', 'revenue')"
      />
    </v-col>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[1]"
        :loading="isLoading"
        :value="formatCurrencyDetailed(metrics.displayPerCapita.value)"
        :subtext="perCapitaSubtext"
        :variation="v('perCapita')"
        @click="$emit('open-chart', 'percap')"
      />
    </v-col>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[2]"
        :loading="isLoading"
        :value="marginLabel"
        :subtext="marginSubtext"
        :variation="v('margin')"
        @click="$emit('open-chart', 'margin')"
      />
    </v-col>
    <v-col cols="12" sm="6" lg="3">
      <KpiCard
        :config="cards[3]"
        :loading="isLoading"
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
import { formatCurrency, formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { useNumberFormat } from '@/composables/useNumberFormat'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  metrics: { type: Object, required: true },
  summary: { type: Object, default: null },
  // BUG-350-01 — état de la source canonique : 'loading' | 'ready' | 'empty'.
  // 'empty' N'EST PAS 'loading' : un batch en échec ou un périmètre réellement
  // sans vente doit afficher ses zéros, pas un squelette qui tourne à l'infini.
  sourceState: { type: String, default: 'ready' },
})
defineEmits(['open-chart'])

const isLoading = computed(() => props.sourceState === 'loading')

const { t } = useI18n()
const { formatDecimal } = useNumberFormat()

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

// BUG-350-01 — la marge vaut `null` quand aucun coût n'est résolvable (records
// sans `menuItemId`, ou costMap vide). On affiche « — » : 100,0 % serait faux,
// pas provisoire. Idem pour le sous-texte « Total », qui vaudrait le CA entier.
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

// BUG-350-01 — le périmètre du per-capita est affiché : ici les spectateurs des
// SEULS events filtrés, alors que la carte d'espace (`SpaceItem.vue`) rapporte le
// CA aux billets de TOUS les events de l'espace. Deux chiffres légitimes, deux
// périmètres — sans cette mention ils se lisent comme une contradiction.
const perCapitaSubtext = computed(() => {
  const attendees = formatNumber(props.metrics.displayAttendees.value)
  const evts = props.metrics.validEventsCount?.value || 0
  const scope = evts ? ` · ${t('anPerCapScopeFiltered').replace('{n}', evts)}` : ''
  return `${t('anHeaderKpiAttendees')} : ${attendees}${scope}`
})

// Taux de transaction = transactions / minute (parité React 'Transaction Rate Widget')
const transactionRateLabel = computed(() => {
  const rate = props.metrics.displayTransactionRate?.value ?? 0
  if (!rate) return t('anClick')
  return `${formatDecimal(rate, 2, { pad: true })}/min`
})

const transactionRateSubtext = computed(() => {
  const trans = props.metrics.displayTransactions.value
  const evts = props.metrics.validEventsCount.value
  if (!evts) return ''
  return `${t('anAvgPerEvent')} : ${(trans / evts).toFixed(0)}`
})
</script>
