<template>
  <div class="ltc-card" :class="{ 'ltc-card--dark': isDark }">
    <p class="ltc-title">{{ t('liveTimelineTitle') }}</p>
    <div class="ltc-canvas-wrap">
      <Line v-if="rows.length" :data="chartData" :options="chartOptions" />
      <p v-else class="ltc-empty">{{ t('liveEmptyNoBaskets') }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import { useI18n } from '@/i18n/useI18n'
import { registerChartJs } from '@/lib/chartjs'

registerChartJs()
const { t } = useI18n()

const props = defineProps({
  rows: { type: Array, default: () => [] }, // [{ minute, transactions, revenue }]
  isDark: { type: Boolean, default: false },
})

// Une seule série (transactions/minute) : pas de légende nécessaire, le titre suffit
// à nommer l'entité (skill dataviz, check 6). Trait fin 2px, pas de dual-axis — le CA
// par minute n'est volontairement pas superposé (échelle différente).
const chartData = computed(() => ({
  labels: props.rows.map((r) => r.minute?.slice(-5) || ''),
  datasets: [{
    data: props.rows.map((r) => r.transactions),
    borderColor: '#5B8DEF',
    backgroundColor: 'rgba(91, 141, 239, 0.12)',
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.25,
    fill: true,
  }],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false }, ticks: { color: props.isDark ? '#9ca3af' : '#6b7280', maxTicksLimit: 8 } },
    y: { beginAtZero: true, grid: { color: props.isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }, ticks: { color: props.isDark ? '#9ca3af' : '#6b7280' } },
  },
}))
</script>

<style scoped>
.ltc-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 14px;
  margin-bottom: 14px;
}
.ltc-card--dark { background: #1e293b; border-color: rgba(255, 255, 255, 0.1); }
.ltc-title { font-size: var(--fs-md); font-weight: var(--fw-bold); color: #111827; margin: 0 0 10px; }
.ltc-card--dark .ltc-title { color: #f9fafb; }
.ltc-canvas-wrap { height: 220px; position: relative; }
.ltc-empty { color: #9ca3af; font-size: var(--fs-md); text-align: center; padding-top: 80px; }
</style>
