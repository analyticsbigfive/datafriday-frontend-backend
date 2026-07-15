<template>
  <v-card variant="outlined" class="pa-3 donut-card" style="height: 100%">
    <div class="d-flex align-center mb-1">
      <v-icon size="14" color="#5B8DEF" class="mr-1">mdi-circle</v-icon>
      <span class="donut-title">{{ title }}</span>
    </div>
    <div class="donut-subtitle mb-2">{{ subtitle }}</div>

    <div class="donut-wrapper">
      <div class="donut-canvas">
        <Doughnut :data="chartData" :options="chartOptions" />
      </div>
    </div>

    <v-list density="compact" class="py-0">
      <v-list-item
        v-for="(label, idx) in visibleLabels"
        :key="itemKeyAt(idx)"
        min-height="28"
        :class="['px-2 py-0', { 'legend-item--clickable': clickable, 'legend-item--selected': selectedLabels.includes(itemKeyAt(idx)) }]"
        @click="clickable ? emit('slice-click', itemKeyAt(idx)) : null"
      >
        <template #prepend>
          <span class="legend-dot" :style="{ background: colors[idx] }" />
        </template>
        <v-list-item-title class="legend-text">{{ label }}</v-list-item-title>
        <template #append>
          <span class="legend-value">{{ formatValue(values[idx]) }}</span>
        </template>
      </v-list-item>
    </v-list>

    <a
      v-if="labels.length > maxLegend"
      href="#"
      class="show-all"
      @click.prevent="expanded = !expanded"
    >
      {{ expanded ? t('anDonutCollapse') : `${t('anDonutShowAll')} (${labels.length})` }}
    </a>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { registerChartJs } from '@/lib/chartjs'
import { formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { useI18n } from '@/i18n/useI18n'

registerChartJs()

const { t } = useI18n()

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  labels: { type: Array, required: true },
  values: { type: Array, required: true },
  colors: { type: Array, required: true },
  mode: { type: String, default: 'revenue' },
  maxLegend: { type: Number, default: 5 },
  clickable: { type: Boolean, default: false },
  selectedLabels: { type: Array, default: () => [] },
  itemKeys: { type: Array, default: () => [] },
})

const emit = defineEmits(['slice-click'])

const expanded = ref(false)

const visibleLabels = computed(() =>
  expanded.value ? props.labels : props.labels.slice(0, props.maxLegend)
)

function formatValue(v) {
  if (props.mode === 'quantity') return formatNumber(v) + ' u'
  return formatCurrencyDetailed(v)
}

function itemKeyAt(index) {
  return props.itemKeys[index] ?? props.labels[index]
}

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [
    {
      data: props.values,
      backgroundColor: props.colors,
      borderColor: '#fff',
      borderWidth: 2,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  onClick: props.clickable
    ? (_e, elements) => {
        if (!elements || !elements.length) return
        const idx = elements[0].index
        const key = itemKeyAt(idx)
        if (key != null) emit('slice-click', key)
      }
    : undefined,
  onHover: props.clickable
    ? (event, elements) => {
        if (!event?.native?.target) return
        event.native.target.style.cursor = elements?.length ? 'pointer' : 'default'
      }
    : undefined,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.label}: ${formatValue(ctx.parsed)}`,
      },
    },
  },
}))
</script>

<style scoped>
.donut-card {
  border-color: #EEEEEE !important;
}
.donut-title {
  font-size: 13px;
  font-weight: 600;
  color: #212121;
}
.donut-subtitle {
  font-size: 11px;
  color: #757575;
}
.donut-wrapper {
  display: flex;
  justify-content: center;
  margin: 8px 0;
}
.donut-canvas {
  width: 180px;
  height: 180px;
  position: relative;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
  display: inline-block;
}
.legend-text {
  font-size: 11px !important;
  color: #424242;
}
.legend-value {
  font-size: 11px;
  color: #212121;
  font-weight: 600;
}
.show-all {
  display: block;
  text-align: center;
  font-size: 11px;
  color: #5B8DEF;
  margin-top: 4px;
  text-decoration: none;
}
.show-all:hover {
  text-decoration: underline;
}
.legend-item--clickable {
  cursor: pointer;
  transition: background-color 120ms ease;
}
.legend-item--clickable:hover {
  background-color: rgba(124, 77, 255, 0.06);
}
.legend-item--selected {
  background-color: rgba(124, 77, 255, 0.12);
}
</style>
