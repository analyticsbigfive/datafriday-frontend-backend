/**
 * useComparisonExport : export CSV du rapport de comparaison (drawer).
 *
 * Réutilise useAnalyseDataset (mode `standalone` : jamais publié dans le store, qui appartient
 * au rapport principal et à l'assistant) alimenté par les refs du moteur de comparaison, puis
 * useAnalyseExport (CSV `;` + BOM, nom de fichier propre). Ajoute la table « Écarts vs principal »
 * et adapte l'en-tête (libellé de la comparaison) et le tableau KPI (les colonnes « vs précédent /
 * vs N-1 » du principal n'ont pas de sens ici : les écarts sont dans la table dédiée).
 *
 * À appeler dans le setup d'un composant (le dataset utilise le store et l'i18n).
 */
import { computed, ref, unref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useAnalyseDataset } from '@/composables/useAnalyseDataset'
import { useAnalyseExport } from '@/composables/useAnalyseExport'
import { comparisonSummaryLabel } from '@/utils/comparisonReportView'
import { buildDeltaTable, buildEventAggregates, comparisonFileBase } from '@/utils/comparisonExportTables'

/**
 * @param {object} p
 * @param {object} p.comparison  retour de useComparisonDrawer (applied)
 * @param {object} p.runtime  retour de useComparisonRuntime
 * @param {import('vue').Ref|import('vue').ComputedRef<object|null>} p.mainSnapshot  snapshot du principal
 * @param {import('vue').ComputedRef<string>} p.spaceName
 * @param {(text: string, color?: string) => void} p.notify  snackbar de la page
 */
export function useComparisonExport({ comparison, runtime, mainSnapshot, spaceName, notify }) {
  const { t } = useI18n()
  const report = runtime.report
  const empty = computed(() => [])

  const label = computed(() => comparisonSummaryLabel(
    comparison.applied.value, runtime.appliedFilters.value, t, runtime.events?.value,
  ))

  const dataset = useAnalyseDataset(
    {
      spaceName,
      filters: report.filters || computed(() => ({})),
      activeFilterChips: runtime.appliedFilters,
      filteredEvents: runtime.events,
      filteredRecords: report.chartRecords,
      chartRecords: report.chartRecords,
      articleRecords: report.articleRecords,
      itemLevelRecords: report.itemLevelRecords || report.articleRecords,
      filteredBaskets: report.filteredBaskets || empty,
      filteredEventAggregates: computed(() => buildEventAggregates(runtime.events.value, report.chartRecords.value)),
      filteredTimelineData: empty,
      timelineHeaderLabel: ref(''),
      metrics: report.metrics,
      itemSummary: ref({}),
      shopPerformance: null,
      isPredictMode: runtime.isPredict,
      busy: ref(false),
    },
    { standalone: true },
  )

  /** Dataset de la comparaison : tables du principal adaptées + table des écarts. */
  function ensureComparisonDataset() {
    const base = dataset.ensureDataset()
    const tables = []
    for (const table of base.tables) {
      if (table.key === 'filters') {
        // Libellé de la comparaison en tête des paramètres (après d'éventuels avertissements).
        const rows = table.rows.filter((r) => r.parameter !== t('anExportFilterComparison'))
        const firstReal = rows.findIndex((r) => r.parameter !== '⚠')
        rows.splice(firstReal < 0 ? rows.length : firstReal, 0, {
          parameter: t('anCmpExportFilterComparison'),
          value: label.value || '—',
        })
        tables.push({ ...table, rows })
      } else if (table.key === 'kpi') {
        const keep = table.columns.filter((c) => c.key !== 'deltaPrev' && c.key !== 'deltaYoy')
        tables.push({ ...table, columns: keep })
        const deltaTable = buildDeltaTable({
          snapshot: report.snapshot?.value || null,
          mainSnapshot: unref(mainSnapshot),
          deltas: runtime.deltasVsMain.value,
          t,
        })
        if (deltaTable && deltaTable.rows.length) tables.push(deltaTable)
      } else {
        tables.push(table)
      }
    }
    return { ...base, tables }
  }

  const fileBase = () => comparisonFileBase({
    spaceName: spaceName.value,
    label: label.value,
    predict: runtime.isPredict.value,
  })

  const { exporting, onExportCsv } = useAnalyseExport({
    ensureDataset: ensureComparisonDataset,
    spaceName,
    isPredictMode: runtime.isPredict,
    notify,
    fileBase,
  })

  /** false pendant le chargement, la mise à jour ou un export en cours. */
  const canExport = computed(() => (
    runtime.state.value === 'ready' && !runtime.refreshing.value && !runtime.pending.value && !exporting.value
  ))

  /** Export CSV ; sans effet (aucun fichier partiel) tant que le rapport n'est pas prêt. */
  function exportCsv() {
    if (!canExport.value) return
    onExportCsv()
  }

  return { exporting, canExport, exportCsv, ensureComparisonDataset, label, fileBase }
}
