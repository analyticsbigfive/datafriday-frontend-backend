<template>
  <!-- 5 widgets sur une ligne en desktop (scroll horizontal si la place manque) :
       CA / TPE, CA / collaborateur, Marge, TX/MIN, Valorisation stock. CA et Percap
       restent dans la bande KPI du header. -->
  <v-row class="mb-4 fmg-row" dense>
    <v-col cols="12" sm="6" class="fmg-col">
      <KpiCard
        :config="cardByKey.revenuePerTpe"
        :loading="rendement.revenuePerTpe.loading"
        :value="rendement.revenuePerTpe.value"
        :warning="rendement.revenuePerTpe.warning || ''"
        :delta="deltas?.tpe || null"
        @click="$emit('open-chart', 'revenue-per-tpe')"
      />
    </v-col>
    <v-col cols="12" sm="6" class="fmg-col">
      <KpiCard
        :config="cardByKey.revenuePerCollaborator"
        :loading="rendement.revenuePerCollaborator.loading"
        :value="rendement.revenuePerCollaborator.value"
        :warning="rendement.revenuePerCollaborator.warning || ''"
        :delta="deltas?.collaborator || null"
        @click="$emit('open-chart', 'revenue-per-collaborator')"
      />
    </v-col>
    <v-col cols="12" sm="6" class="fmg-col">
      <KpiCard
        :config="cardByKey.margin"
        :loading="isLoading"
        :value="marginLabel"
        :subtext="marginSubtext"
        :variation="v('margin')"
        :delta="deltas?.margin || null"
        @click="$emit('open-chart', 'margin')"
      />
    </v-col>
    <v-col cols="12" sm="6" class="fmg-col">
      <KpiCard
        :config="cardByKey.transactionRate"
        :loading="isLoading"
        :value="transactionRateLabel"
        :subtext="transactionRateSubtext"
        :variation="v('transferRate')"
        :delta="deltas?.transactionRate || null"
        @click="$emit('open-chart', 'transaction-rate')"
      />
    </v-col>
    <v-col cols="12" sm="6" class="fmg-col">
      <KpiCard
        :config="cardByKey.stockValue"
        :loading="rendement.stockValue.loading"
        :value="rendement.stockValue.value"
        :warning="rendement.stockValue.warning || ''"
        :delta="deltas?.stock || null"
        @click="$emit('open-chart', 'stock-value')"
      />
    </v-col>
  </v-row>
</template>

<script setup>
import { computed } from 'vue'
import KpiCard from '@/components/space-workspace/shared/KpiCard.vue'
import { KPI_CARDS } from '@/constants/analyseColors'
import { formatCurrencyDetailed } from '@/composables/useFormatters'
import { useNumberFormat } from '@/composables/useNumberFormat'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  metrics: { type: Object, required: true },
  summary: { type: Object, default: null },
  // BUG-350-01 — état de la source canonique : 'loading' | 'ready' | 'empty'.
  // 'empty' N'EST PAS 'loading' : un batch en échec ou un périmètre réellement
  // sans vente doit afficher ses zéros, pas un squelette qui tourne à l'infini.
  sourceState: { type: String, default: 'ready' },
  // View-models des widgets rendement (useRendementWidgets.cards) : CA / TPE,
  // CA / collaborateur, Valorisation stock. Chacun : { loading, value, subtext, warning }.
  rendement: { type: Object, required: true },
  // Écarts du rapport Comparaison, par widget : { tpe, collaborator, margin, transactionRate,
  // stock } (objets { text, tone, kind }). Prioritaires sur les variations Précédent / N-1
  // (décision 4) ; absent ou clé manquante = comportement historique.
  deltas: { type: Object, default: null },
})
defineEmits(['open-chart'])

const isLoading = computed(() => props.sourceState === 'loading')

const { t } = useI18n()
const { formatDecimal } = useNumberFormat()

// Labels KPI traduits (KPI_CARDS.label = fallback FR codé en dur ; labelKey = i18n).
const cardByKey = computed(() =>
  Object.fromEntries(
    KPI_CARDS.map((c) => [c.key, { ...c, label: c.labelKey ? t(c.labelKey) : c.label }]),
  ),
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
  return m == null ? NO_VALUE : `${formatDecimal(m, 1, { pad: true })}%`
})

const marginSubtext = computed(() => {
  if (props.metrics.displayMargin?.value == null) return `${t('anTotal')} : ${NO_VALUE}`
  const net = props.metrics.displayRevenue.value - props.metrics.displayCost.value
  return `${t('anTotal')} : ${formatCurrencyDetailed(net)}`
})

// Décision JLH 2026-08-24 — TX/MIN = Σ des taux moyens par PdV, en permanence
// (plus de « Cliquer » ni de bascule de formule à l'ouverture du panneau).
// 0,00/min est TERMINAL (périmètre chargé sans ticket), pas provisoire ; `null`
// (predict sans minutes) rend « — ».
const transactionRateLabel = computed(() => {
  const rate = props.metrics.displayTransactionRate?.value
  if (rate == null) return NO_VALUE
  return `${formatDecimal(rate, 2, { pad: true })}/min`
})

// Le sous-texte dit la FORMULE (Σ par PdV) — l'ancien « Moy./Évén. » décrivait
// les transactions, pas le taux, et laissait croire à un rythme global.
const transactionRateSubtext = computed(() => t('anKpiTxRateScope'))
</script>

<style scoped>
/* >= 600 px : les 5 widgets sur UNE ligne, même largeur et même hauteur (retour
   Bertrand 2026-10-14 : alignement). Si la place manque (filtres + résumé ouverts),
   la ligne défile horizontalement au lieu de passer à la ligne. */
@media (min-width: 601px) {
  .fmg-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .fmg-row > :deep(.fmg-col) {
    flex: 1 1 0;
    min-width: 150px;
    max-width: none;
    width: auto;
    display: flex;
  }
  .fmg-row > :deep(.fmg-col > .kpi-card) {
    flex: 1 1 auto;
    min-width: 0;
  }
}

/* Téléphone : KPIs en scroll horizontal (maquette Live de Bertrand) au lieu d'empiler en
   cartes pleine largeur. Chaque KPI garde une largeur lisible, on défile latéralement. */
@media (max-width: 600px) {
  .fmg-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x proximity;
    /* fine barre / marge de respiration */
    padding-bottom: 4px;
  }
  .fmg-row > :deep(.v-col) {
    flex: 0 0 auto;
    width: 62%;
    max-width: 210px;
    scroll-snap-align: start;
  }
}
</style>
