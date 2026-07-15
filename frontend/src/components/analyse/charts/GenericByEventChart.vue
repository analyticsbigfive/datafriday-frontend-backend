<template>
  <v-card flat rounded="lg" class="pa-5 mb-4">
    <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-3">
      <div>
        <div class="section-title">{{ config.title }}</div>
        <div class="section-subtitle">{{ config.subtitle }}</div>
      </div>
      <v-btn-toggle
        v-model="sortMode"
        mandatory
        density="compact"
        divided
        rounded="pill"
        variant="text"
        class="sort-toggle"
      >
        <v-btn value="date" size="small" class="text-none">{{ t('anSortDate') }}</v-btn>
        <v-btn value="value" size="small" class="text-none">{{ metricLabel }}</v-btn>
      </v-btn-toggle>
    </div>

    <div style="position: relative; height: 320px">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </v-card>
</template>

<script setup>
import { Bar } from 'vue-chartjs'
import { computed, ref, watch } from 'vue'
import '@/lib/chartjs'
import { formatCurrency, formatNumber } from '@/composables/useFormatters'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  records: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  eventAggregates: { type: Array, default: () => [] },
  costMap: { type: Object, default: () => ({}) },
  initialMetric: { type: String, default: 'revenue' },
})

const METRICS = computed(() => [
  { key: 'revenue',        label: t('anMetricCA'),           format: formatCurrency },
  { key: 'cost',           label: t('anMetricCost'),         format: formatCurrency },
  { key: 'transactions',   label: t('anMetricTransactions'), format: formatNumber },
  { key: 'attendees',      label: t('anMetricAttendees'),    format: formatNumber },
  { key: 'avgTransaction', label: t('anMetricAvgBasket'),    format: formatCurrency },
  { key: 'perCap',         label: t('anMetricPerCap'),       format: formatCurrency },
  { key: 'transferRate',   label: t('anMetricTransferRate'), format: (v) => `${v.toFixed(1)}%` },
])

const metric = ref(props.initialMetric)
// Tri : 'date' (chronologique) ou 'value' (rang décroissant selon la métrique).
const sortMode = ref('date')

watch(
  () => props.initialMetric,
  (next) => {
    if (next) metric.value = next
  },
)

const metricLabel = computed(
  () => (METRICS.value.find((m) => m.key === metric.value) || METRICS.value[0]).label
)

const config = computed(() => {
  const m = METRICS.value.find((x) => x.key === metric.value) || METRICS.value[0]
  return {
    title: `${m.label} ${t('anChartPerEvent')}`,
    subtitle: `${eventRows.value.length} ${t('anChartEventCount')} ${t('anChartDisplayLabel')} ${m.label.toLowerCase()}`,
  }
})

const eventRows = computed(() => {
  if (Array.isArray(props.eventAggregates) && props.eventAggregates.length) {
    return props.eventAggregates
  }

  const byEvent = new Map()
  const costMap = props.costMap || {}

  for (const event of props.events || []) {
    const id = event.id || event.eventId
    if (!id) continue
    byEvent.set(id, {
      eventId: id,
      eventName: event.name || event.eventName || id,
      eventDate: event.date || event.eventDate || null,
      attendees: event.ticketsScanned ?? event.attendees ?? event.ticketsSold ?? 0,
      revenue: 0,
      cost: 0,
      transactions: 0,
    })
  }

  for (const record of props.records || []) {
    if (!record?.eventId) continue
    if (!byEvent.has(record.eventId)) {
      byEvent.set(record.eventId, {
        eventId: record.eventId,
        eventName: record.eventName || record.eventId,
        eventDate: record.eventDate || null,
        attendees: 0,
        revenue: 0,
        cost: 0,
        transactions: 0,
      })
    }
    const entry = byEvent.get(record.eventId)
    const quantity = record.quantity || 0
    entry.revenue += record.revenue || 0
    entry.cost += (costMap[record.menuItemId] || 0) * quantity
    entry.transactions += record.transactionCount || 0
    if (!entry.eventName && record.eventName) entry.eventName = record.eventName
    if (!entry.eventDate && record.eventDate) entry.eventDate = record.eventDate
  }

  return Array.from(byEvent.values()).map((row) => ({
    ...row,
    avgTransaction: row.transactions ? row.revenue / row.transactions : 0,
    perCap: row.attendees ? row.revenue / row.attendees : 0,
    transferRate: row.attendees ? (row.transactions / row.attendees) * 100 : 0,
  }))
})

/** Valeur par event selon la métrique sélectionnée */
function valueForEvent(row) {
  switch (metric.value) {
    case 'revenue':        return row.revenue || 0
    case 'cost':           return row.cost || 0
    case 'transactions':   return row.transactions || 0
    case 'attendees':      return row.attendees || 0
    case 'avgTransaction': return row.avgTransaction || 0
    case 'perCap':         return row.perCap || 0
    case 'transferRate':   return row.transferRate || 0
    default:               return 0
  }
}

function rowDateValue(row) {
  const raw = row.eventDate || row.date
  if (!raw) return 0
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(raw))
  if (fr) return new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1])).getTime()
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d.getTime() : 0
}

const METRIC_COLORS = {
  revenue: { r: 16, g: 185, b: 129 },        // green
  cost: { r: 239, g: 68, b: 68 },            // red
  transactions: { r: 59, g: 130, b: 246 },   // blue
  attendees: { r: 14, g: 165, b: 233 },      // sky
  avgTransaction: { r: 168, g: 85, b: 247 }, // purple
  perCap: { r: 236, g: 72, b: 153 },         // pink
  transferRate: { r: 20, g: 184, b: 166 },   // teal
}

const chartData = computed(() => {
  const sortedEvents = [...eventRows.value].sort((a, b) =>
    sortMode.value === 'value'
      ? valueForEvent(b) - valueForEvent(a)
      : rowDateValue(a) - rowDateValue(b)
  )
  const values = sortedEvents.map((e) => valueForEvent(e))
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const c = METRIC_COLORS[metric.value] || { r: 124, g: 77, b: 255 }
  const colors = values.map((v) => {
    // Lot 0.5 — opacité proportionnelle à l'importance (0.25 → 1.0)
    const ratio = (v - min) / span
    const alpha = 0.25 + ratio * 0.75
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha.toFixed(3)})`
  })
  return {
    labels: sortedEvents.map((e) => e.eventName || e.name || e.eventId || ''),
    datasets: [
      {
        label: METRICS.value.find((m) => m.key === metric.value).label,
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        barThickness: 'flex',
        maxBarThickness: 28,
      },
    ],
  }
})

const chartOptions = computed(() => {
  const m = METRICS.value.find((x) => x.key === metric.value)
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${m.format(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { maxRotation: 60, minRotation: 30, font: { size: 10 } },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { callback: (v) => m.format(v) },
        grid: { color: '#EEEEEE' },
      },
    },
  }
})
</script>

<style scoped>
.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #212121;
}
.section-subtitle {
  font-size: 12px;
  color: #757575;
  margin-top: 2px;
}
/* Toggle tri (Date | métrique) — pill bordé, segment actif grisé (cf. maquette). */
.sort-toggle {
  border: 1px solid #e0e0e0;
  border-radius: 999px;
  overflow: hidden;
  height: 32px;
}
.sort-toggle :deep(.v-btn) {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  color: #6b7280;
  padding: 0 14px;
  height: 32px;
}
.sort-toggle :deep(.v-btn--active) {
  background: #e9eaec;
  color: #1f2937;
}
</style>
