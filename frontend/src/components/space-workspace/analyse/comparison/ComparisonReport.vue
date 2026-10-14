<template>
  <div id="comparison-capture-root" class="cr" :aria-busy="runtime.refreshing.value ? 'true' : undefined">
    <ComparisonBanner
      :label="summaryLabel"
      :event-count="runtime.events.value.length"
      :layout="comparison.layout.value"
      :exporting="exporting"
      :copying="copying"
      :sharing="sharing"
      :export-disabled="runtime.refreshing.value || runtime.pending.value"
      @toggle-expand="comparison.toggleExpandDrawer()"
      @export-csv="emit('export-csv')"
      @copy="emit('copy')"
      @share="emit('share')"
      @edit="comparison.showForm()"
    />

    <!-- Bande des 8 puces pour la CAPTURE seulement : à l'écran elle est dans l'en-tête du drawer
         (hors de cette racine), donc masquée ici ; révélée dans le clone par revealCaptureOnlyBlocks. -->
    <div class="cr__snap" aria-hidden="true">
      <ComparisonKpiStrip wrap :chips="kpiChips" :loading="!hasValues" />
    </div>
    <div class="cr__body">
      <div class="cr__intro">
        <ComparisonFilterList :filters="runtime.appliedFilters.value" />
        <ComparisonNotices
          :excluded-events="runtime.excludedEvents.value"
          :same-as-main="runtime.sameAsMain.value"
          :truncation="runtime.truncation.value"
          :intra-event-range-ignored="runtime.intraEventRangeIgnored.value"
        />
      </div>

      <div class="cr__stack">
        <FinancialMetricsGrid
          v-can="'stats.financial.view'"
          :metrics="report.metrics"
          :source-state="report.kpiSourceState.value"
          :rendement="report.rendementCards.value"
          :deltas="runtime.widgetDeltas.value"
        />

        <v-card v-can="'stats.financial.view'" flat rounded="lg" class="pa-4">
          <EventRevenueByShopChart
            embedded
            readonly
            :records="report.chartRecords.value"
            :events="report.events.value"
            :is-predict-mode="report.isPredict.value"
            :trend="runtime.trend.value"
          />
        </v-card>

        <MenuItemRevenueDistribution
          v-can="'stats.financial.view'"
          readonly
          :records="report.articleRecords.value"
          :dimensions-index="report.dimensionsIndex.value"
          :dimensions-status="report.dimensionsStatus.value"
          :deltas="runtime.deltasVsMain.value"
          @mode-change="(m) => (distributionMode = m)"
        />
        <PromotionSection
          v-can="'stats.financial.view'"
          readonly
          :records="report.articleRecords.value"
          :dimensions-index="report.dimensionsIndex.value"
          :status="report.dimensionsStatus.value"
          :mode="distributionMode"
          :deltas="runtime.deltasVsMain.value"
        />
        <MenuItemsByShopTable
          v-can="'stats.financial.view'"
          readonly
          :records="report.articleRecords.value"
          :deltas="runtime.deltasVsMain.value"
        />
      </div>
    </div>

    <!-- Voile de mise à jour : le rapport reste visible pendant qu'un recalcul charge de nouveaux events. -->
    <div v-if="runtime.refreshing.value" class="cr__veil" role="status" aria-live="polite">
      <span class="cr__veil-chip">
        <v-progress-circular indeterminate size="14" width="2" />
        {{ t('anCmpRefreshing') }}
      </span>
    </div>
  </div>
</template>

<script setup>
// Rapport de comparaison (vue 'ready' du drawer), de haut en bas : bandeau rouge, filtres
// appliqués, notices, 5 widgets, CA par shop (avec tendance du principal), répartition du CA par
// article + Promotion, tableau Article par PdV. La bande des 8 puces est dans l'en-tête du
// drawer (ComparisonDrawerHead). Les composants du principal sont montés en lecture seule.
// Racine #comparison-capture-root : cible de la copie / du partage (useAnalyseCapture).
import { ref, computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { comparisonSummaryLabel } from '@/utils/comparisonReportView'
import { useComparisonKpiChips } from '@/composables/useComparisonKpiChips'
import ComparisonBanner from './ComparisonBanner.vue'
import ComparisonKpiStrip from './ComparisonKpiStrip.vue'
import ComparisonFilterList from './ComparisonFilterList.vue'
import ComparisonNotices from './ComparisonNotices.vue'
import FinancialMetricsGrid from '../panels/FinancialMetricsGrid.vue'
import EventRevenueByShopChart from '../charts/EventRevenueByShopChart.vue'
import MenuItemRevenueDistribution from '../tables/MenuItemRevenueDistribution.vue'
import PromotionSection from '../tables/PromotionSection.vue'
import MenuItemsByShopTable from '../tables/MenuItemsByShopTable.vue'

const props = defineProps({
  // Retour de useComparisonRuntime.
  runtime: { type: Object, required: true },
  // Retour de useComparisonDrawer (disposition, retour au formulaire).
  comparison: { type: Object, required: true },
  // États des actions du bandeau (export CSV, copie, partage), pilotés par AnalyseView.
  exporting: { type: Boolean, default: false },
  copying: { type: Boolean, default: false },
  sharing: { type: Boolean, default: false },
})
const emit = defineEmits(['export-csv', 'copy', 'share'])

const { t } = useI18n()
const report = computed(() => props.runtime.report)
const distributionMode = ref('revenue')
const { chips: kpiChips, hasValues } = useComparisonKpiChips(props.runtime)
const summaryLabel = computed(() => comparisonSummaryLabel(
  props.comparison.applied.value, props.runtime.appliedFilters.value, t,
))
</script>

<style scoped>
.cr { position: relative; display: flex; flex-direction: column; gap: 12px; min-width: 0; padding-bottom: 8px; }
.cr__snap { display: none; }
.cr__body { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.cr__intro { display: flex; flex-direction: column; gap: 10px; }
.cr__stack { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
/* Les composants du principal portent leurs propres marges basses (mb-4) : la gouttière de 14 px est ici. */
.cr__stack > :deep(*) { margin-bottom: 0 !important; }
.cr__veil {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 120px;
  background: rgba(var(--v-theme-surface), 0.55);
  pointer-events: none;
}
.cr__veil-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 99px;
  background: var(--cr-cmp-bg);
  color: var(--cr-cmp);
  font-size: var(--fs-base);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
</style>
