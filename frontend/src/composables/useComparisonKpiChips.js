/**
 * useComparisonKpiChips : les 8 puces du haut du rapport de comparaison (libellés, valeurs
 * formatées, écart vs principal). Partagé par l'en-tête du drawer (ComparisonDrawerHead) et par la
 * copie masquée de la bande dans le rapport (capture d'écran), pour ne pas dupliquer la logique.
 * À appeler dans un setup (i18n et formateurs).
 */
import { computed } from 'vue'
import { formatCurrency, formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { useNumberFormat } from '@/composables/useNumberFormat'
import { useI18n } from '@/i18n/useI18n'
import { buildKpiChips } from '@/utils/comparisonReportView'

/** @param {object} runtime  retour de useComparisonRuntime */
export function useComparisonKpiChips(runtime) {
  const { t } = useI18n()
  const { formatPercentLocale } = useNumberFormat()
  const fmt = {
    currency: (v) => formatCurrency(v),
    currencyDetailed: (v) => formatCurrencyDetailed(v),
    number: (v) => formatNumber(v),
    percent: (v) => formatPercentLocale(v, 1),
  }
  // Squelette tant qu'aucun rapport n'a de valeurs (chargement initial, erreur, vide).
  const hasValues = computed(() => runtime.state.value === 'ready')
  const chips = computed(() => buildKpiChips(
    hasValues.value ? runtime.report.chips.value : null,
    runtime.chipDeltas.value,
    { t, fmt },
  ))
  return { chips, hasValues }
}
