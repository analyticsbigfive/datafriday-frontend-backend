<template>
  <div class="lcb-card" :class="{ 'lcb-card--dark': isDark }">
    <p class="lcb-title">{{ t('liveCategoryTitle') }}</p>
    <div class="lcb-body">
      <div class="lcb-canvas-wrap">
        <Doughnut v-if="items.length" :data="chartData" :options="chartOptions" />
        <p v-else class="lcb-empty">{{ t('liveEmptyNoBaskets') }}</p>
      </div>
      <ul v-if="items.length" class="lcb-legend">
        <li v-for="item in items" :key="item.category" class="lcb-legend__row">
          <span class="lcb-legend__dot" :style="{ background: colorFor(item.category) }"></span>
          <span class="lcb-legend__label">{{ item.category }}</span>
          <span class="lcb-legend__value">{{ item.count }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { useI18n } from '@/i18n/useI18n'
import { registerChartJs } from '@/lib/chartjs'
import { SHOP_COLORS } from '@/constants/analyseColors'

registerChartJs()
const { t } = useI18n()

const props = defineProps({
  items: { type: Array, default: () => [] }, // [{ category, count }]
  isDark: { type: Boolean, default: false },
})

// Couleur assignée par hash stable du nom de catégorie (pas par rang dans la liste
// triée) : une catégorie garde la même couleur d'un poll au suivant même si son rang
// change — skill dataviz, "color follows the entity, never its rank".
function colorFor(category) {
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0
  return SHOP_COLORS[hash % SHOP_COLORS.length]
}

const chartData = computed(() => ({
  labels: props.items.map((i) => i.category),
  datasets: [{
    data: props.items.map((i) => i.count),
    backgroundColor: props.items.map((i) => colorFor(i.category)),
    borderColor: props.isDark ? '#1e293b' : '#ffffff',
    borderWidth: 2,
  }],
}))

// Légende propre (liste à droite, valeurs directement labellisées) plutôt que la
// légende Chart.js par défaut — cohérent avec le check 6 du skill dataviz (>=4
// entrées direct-labeled).
const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: { legend: { display: false }, tooltip: { enabled: true } },
}))
</script>

<style scoped>
.lcb-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 14px;
  margin-bottom: 14px;
}
.lcb-card--dark { background: #1e293b; border-color: rgba(255, 255, 255, 0.1); }
.lcb-title { font-size: var(--fs-md); font-weight: var(--fw-bold); color: #111827; margin: 0 0 10px; }
.lcb-card--dark .lcb-title { color: #f9fafb; }
.lcb-body { display: flex; align-items: center; gap: 16px; }
.lcb-canvas-wrap { width: 140px; height: 140px; flex-shrink: 0; position: relative; }
.lcb-empty { color: #9ca3af; font-size: var(--fs-md); }
.lcb-legend { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 0; }
.lcb-legend__row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: var(--fs-base); }
.lcb-legend__dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.lcb-legend__label { color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.lcb-card--dark .lcb-legend__label { color: #d1d5db; }
.lcb-legend__value { font-weight: var(--fw-bold); color: #111827; font-variant-numeric: tabular-nums; }
.lcb-card--dark .lcb-legend__value { color: #f9fafb; }
</style>
