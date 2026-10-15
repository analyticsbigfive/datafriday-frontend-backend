<template>
  <v-card flat rounded="lg" class="pa-4 crc">
    <!-- Courbe minute par minute : un seul event (ouverture automatique) ou moyenne de plusieurs
         (bouton « Moyenne »). Elle REMPLACE les barres dans la même carte. -->
    <div v-if="timeline.active.value" class="crc__timeline">
      <EventTimelineChart
        :key="`timeline-${timeline.selected.value?.eventId || 'none'}-${events.length}`"
        embedded
        closable
        :event-id="timeline.selected.value?.eventId || ''"
        :event-name="timeline.headerLabel.value"
        :event-date="timeline.selected.value?.eventDate || ''"
        :timeline-data="timeline.records.value"
        :predicted-timeline-data="[]"
        :menu-items="[]"
        :filter-signature="filterSignature"
        @close="timeline.close()"
      />
      <div v-if="timeline.loading.value" class="crc__loader" role="status" aria-live="polite">
        <v-progress-circular indeterminate color="primary" size="40" />
      </div>
    </div>
    <EventRevenueByShopChart
      v-else
      embedded
      readonly
      :average-as-timeline="!report.isPredict.value"
      :records="report.chartRecords.value"
      :events="events"
      :is-predict-mode="report.isPredict.value"
      :trend="trend"
      @show-average="timeline.open()"
    />
  </v-card>
</template>

<script setup>
// Carte « CA par shop » du rapport de comparaison : barres, ou courbe minute par minute quand un
// seul event est comparé (ou sur « Moyenne » avec plusieurs events). Pendant du bloc timeline XOR
// barres d'AnalyseView, en lecture seule.
import { computed } from 'vue'
import EventRevenueByShopChart from '../charts/EventRevenueByShopChart.vue'
import EventTimelineChart from '@/components/space-workspace/shared/EventTimelineChart.vue'

const props = defineProps({
  // Retour de useComparisonReport (events, chartRecords, isPredict, timeline).
  report: { type: Object, required: true },
  // Tendance du principal (superposée aux barres).
  trend: { type: Array, default: null },
})

const events = computed(() => props.report.events.value)
const timeline = computed(() => props.report.timeline)
// Les filtres du rapport pré-filtrent les lignes : le curseur repart pleine largeur quand ils changent.
const filterSignature = computed(() => JSON.stringify(props.report.filters.value || {}))
</script>

<style scoped>
.crc__timeline { position: relative; }
.crc__loader {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-surface), 0.6);
}
</style>
