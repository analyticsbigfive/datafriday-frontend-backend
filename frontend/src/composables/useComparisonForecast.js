/**
 * useComparisonForecast : jeux de records du COMPARÉ en mode Forecast.
 *
 * Le comparé n'est pas chargé : ce sont les records du principal (source) passés par le moteur
 * pur de modifications what-if. Un seul calcul (applyForecastModifications) alimente
 * chartRecords, articleRecords et stats. Liste vide = mêmes références que la source.
 *
 * Inactif (saisie qui n'est pas un modèle Forecast) : le composable reste inerte et rend les
 * records de la source tels quels.
 */
import { computed, unref } from 'vue'
import { formatCurrencyDetailed } from '@/composables/useFormatters'
import { isForecastModel } from '@/utils/comparisonForecastModel'
import { forecastFilterLines } from '@/utils/comparisonForecastContext'
import { applyForecastModifications } from '@/utils/forecastApplyModifications'
import { forecastTargetOptions } from '@/utils/forecastTargetOptions'

/**
 * @param {Object} p
 * @param {import('vue').Ref<object|null>} p.input  saisie de comparaison ({ kind: 'forecast', modifications })
 * @param {Object} p.source  jeux du principal (refs ou computed)
 * @param {import('vue').Ref<Array>} p.source.chartRecords  records au grain PdV
 * @param {import('vue').Ref<Array>} p.source.articleRecords  records au grain article
 * @param {import('vue').Ref<Map|null>} [p.source.catalogById]  menuItemId (chaîne) vers Menu Item
 * @param {import('vue').Ref<boolean>} [p.source.isPredict]  masque Predict du principal (repris tel quel)
 * @param {import('vue').Ref<boolean>} [p.source.loading]  records du principal en cours de chargement
 * @param {import('vue').Ref<string|null>|string|null} [p.spaceId]
 * @param {(key: string) => string} p.translate
 * @param {(n: number) => string} [p.formatCurrency]  défaut : formatCurrencyDetailed
 */
export function useComparisonForecast({
  input, source, spaceId = null, translate, formatCurrency = null,
}) {
  const active = computed(() => isForecastModel(input.value))

  const result = computed(() => applyForecastModifications({
    chartRecords: unref(source.chartRecords) || [],
    articleRecords: unref(source.articleRecords) || [],
    modifications: active.value ? input.value.modifications || [] : [],
    catalogById: unref(source.catalogById) || null,
    spaceId: unref(spaceId) || null,
  }))

  const chartRecords = computed(() => result.value.chartRecords)
  const articleRecords = computed(() => result.value.articleRecords)
  const stats = computed(() => result.value.stats)

  /** Le masque Predict est celui du principal : le comparé Forecast en hérite. */
  const isPredict = computed(() => !!unref(source.isPredict))

  /** 'loading' | 'ready' | 'empty' : même vocabulaire que kpiSourceState des records. */
  const sourceState = computed(() => {
    if (unref(source.loading)) return 'loading'
    return chartRecords.value.length ? 'ready' : 'empty'
  })

  const options = computed(() => forecastTargetOptions({
    articleRecords: unref(source.articleRecords) || [],
    catalogById: unref(source.catalogById) || null,
    spaceId: unref(spaceId) || null,
  }))

  const lines = computed(() => {
    if (!active.value) return []
    return forecastFilterLines(input.value.modifications, {
      t: translate,
      options: options.value,
      formatCurrency: formatCurrency || ((n) => formatCurrencyDetailed(n)),
    })
  })

  return { active, chartRecords, articleRecords, stats, isPredict, sourceState, lines }
}
