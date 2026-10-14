/**
 * useMainReportSnapshot : snapshot normalisé du rapport PRINCIPAL (cf.
 * utils/comparisonReportSnapshot.js), construit à partir des computed qu'AnalyseView
 * possède déjà. Ne lit ni ne modifie le store : tout arrive en paramètres.
 *
 * Utilisation prévue dans AnalyseView (lot 5) :
 *   const mainSnapshot = useMainReportSnapshot({
 *     metrics, rendementRaw, chartRecords, articleRecords, events: filteredEvents,
 *     isPredict: isPredictRecords, dimensionsIndex: articleDimensionsIndex, sourceState: kpiSourceState,
 *   })
 * puis computeReportDeltas(comparisonSnapshot, mainSnapshot.value) pour les écarts du drawer,
 * et computeReportDeltas(mainSnapshot.value, comparisonSnapshot) pour ceux du principal.
 */
import { computed, unref } from 'vue'
import { buildReportSnapshot, chipsFromMetrics, widgetsFromMetrics } from '@/utils/comparisonReportSnapshot'

/**
 * @param {Object} p
 * @param {object} p.metrics  retour de useMetricsCalculator
 * @param {import('vue').Ref<object>} p.rendementRaw  useRendementWidgets(...).raw
 * @param {import('vue').Ref<Array>} p.chartRecords
 * @param {import('vue').Ref<Array>} p.articleRecords
 * @param {import('vue').Ref<Array>} p.events  events filtrés du principal
 * @param {import('vue').Ref<boolean>} [p.isPredict]
 * @param {import('vue').Ref<Map|null>} [p.dimensionsIndex]
 * @param {import('vue').Ref<string>} [p.sourceState]  'loading' | 'ready' | 'empty' : pas de snapshot tant que 'loading'
 * @returns {import('vue').ComputedRef<object|null>} snapshot, ou null tant que le principal charge
 */
export function useMainReportSnapshot({
  metrics, rendementRaw, chartRecords, articleRecords, events,
  isPredict = false, dimensionsIndex = null, sourceState = null,
}) {
  return computed(() => {
    if (sourceState && unref(sourceState) === 'loading') return null
    const predict = !!unref(isPredict)
    return buildReportSnapshot({
      isPredict: predict,
      eventCount: (unref(events) || []).length,
      chips: chipsFromMetrics(metrics, { isPredict: predict }),
      widgets: widgetsFromMetrics(metrics, rendementRaw, { isPredict: predict }),
      chartRecords: unref(chartRecords) || [],
      articleRecords: unref(articleRecords) || [],
      dimensionsIndex: unref(dimensionsIndex) || null,
    })
  })
}
