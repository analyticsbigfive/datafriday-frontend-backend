<template>
  <v-card variant="outlined" class="pa-3 donut-card" :class="{ 'donut-card--dark': isDark }" style="height: 100%">
    <!-- BUG-285 : voile pendant le recalcul des filtres — SAUF sur le donut qui
         vient d'être cliqué (pendingKey posé) : lui garde son feedback optimiste. -->
    <AnalyseSkeletonVeil :active="filtersRecomputing && pendingKey == null" />
    <div class="d-flex align-center mb-1">
      <v-icon size="14" color="#5B8DEF" class="mr-1">mdi-circle</v-icon>
      <span class="donut-title">{{ title }}</span>
    </div>
    <div class="donut-subtitle mb-2">{{ loading ? t('anDonutLoading') : subtitle }}</div>

    <!-- Skeleton : la dimension n'est pas encore résolue (ex. zone = FloorElements
         du contexte config, chargé en différé). Sans lui, le donut s'affiche VIDE
         alors que la donnée est encore en route. -->
    <template v-if="loading">
      <div class="donut-wrapper">
        <div class="donut-canvas donut-skeleton-ring" :aria-label="t('anDonutLoading')" role="img" />
      </div>
      <div class="donut-skeleton-legend">
        <span v-for="n in 3" :key="`sk-${n}`" class="donut-skeleton-line" />
      </div>
    </template>

    <!-- Vide APRÈS résolution : message explicite plutôt qu'un donut blanc. -->
    <div v-else-if="!labels.length" class="donut-empty">
      {{ t('anDonutEmpty') }}
    </div>

    <template v-else>
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
          @click="clickable ? onLegendClick(idx) : null"
        >
          <template #prepend>
            <span class="legend-dot" :style="{ background: colors[idx] }" />
          </template>
          <v-list-item-title class="legend-text" :title="label">{{ label }}</v-list-item-title>
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
    </template>
  </v-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { useTheme } from 'vuetify'
import { registerChartJs } from '@/lib/chartjs'
import { formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { useI18n } from '@/i18n/useI18n'
import { useFilters } from '@/composables/useFilters'
import AnalyseSkeletonVeil from '@/components/analyse/AnalyseSkeletonVeil.vue'

registerChartJs()

const { t } = useI18n()
const { filtersRecomputing } = useFilters()

// Dark mode autonome : suit le thème global Vuetify (cf. EventTimelineChart).
// Le séparateur inter-tranches du donut (#fff) est peint sur <canvas> → dérivé
// en JS ; `chartData` est un computed, le changement de thème re-rend le chart.
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)
const sliceBorderColor = computed(() => (isDark.value ? '#1f2937' : '#fff'))

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
  // true tant que la dimension du donut n'est pas résolue → skeleton au lieu d'un
  // donut vide (défaut false : les usages déjà data-driven ne changent pas).
  loading: { type: Boolean, default: false },
  // Suffixe d'unité en `mode="count"` (ex. « tx »). Vide = aucun suffixe.
  unitLabel: { type: String, default: '' },
  // Ajoute la part en % du total à côté de la valeur. Utile quand la LECTURE du
  // donut est le pourcentage lui-même (répartition des paniers) et non le montant.
  showPercent: { type: Boolean, default: false },
})

const emit = defineEmits(['slice-click'])

const expanded = ref(false)

// BUG-285 (fluidité, maquette « A+B ») : feedback OPTIMISTE — la part cliquée se
// détache immédiatement (offset), sans attendre le round-trip clic → filtre
// coalescé 150 ms → recalculs. Purement visuel, zéro calcul. La ref se
// resynchronise quand la sélection réelle (props) revient du store.
const pendingKey = ref(null)
watch(() => props.selectedLabels, () => { pendingKey.value = null })
watch(() => props.values, () => { pendingKey.value = null })
const highlightedOffsets = computed(() =>
  (props.values || []).map((_, i) => {
    const k = itemKeyAt(i)
    if (pendingKey.value != null && k === pendingKey.value) return 14
    return props.selectedLabels.includes(k) ? 14 : 0
  }),
)

const visibleLabels = computed(() =>
  expanded.value ? props.labels : props.labels.slice(0, props.maxLegend)
)

const valuesTotal = computed(() =>
  (props.values || []).reduce((sum, v) => sum + (Number(v) || 0), 0),
)

function formatValue(v) {
  const base =
    props.mode === 'quantity'
      ? formatNumber(v) + ' u'
      : props.mode === 'count'
        ? formatNumber(v) + (props.unitLabel ? ` ${props.unitLabel}` : '')
        : formatCurrencyDetailed(v)
  if (!props.showPercent) return base
  const total = valuesTotal.value
  if (!total) return base
  return `${base} · ${((Number(v) || 0) / total * 100).toFixed(1).replace('.', ',')} %`
}

function itemKeyAt(index) {
  return props.itemKeys[index] ?? props.labels[index]
}

function onLegendClick(index) {
  const key = itemKeyAt(index)
  if (key == null) return
  pendingKey.value = key
  emit('slice-click', key)
}

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [
    {
      data: props.values,
      backgroundColor: props.colors,
      borderColor: sliceBorderColor.value,
      borderWidth: 2,
      // BUG-285 : part sélectionnée (ou en attente de sélection) détachée.
      offset: highlightedOffsets.value,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  // BUG-284 : 1000 ms → 200 ms (cf. GenericByEventChart).
  animation: { duration: 200 },
  cutout: '65%',
  onClick: props.clickable
    ? (_e, elements) => {
        if (!elements || !elements.length) return
        const idx = elements[0].index
        const key = itemKeyAt(idx)
        if (key != null) {
          pendingKey.value = key
          emit('slice-click', key)
        }
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
/* En sombre, ce #EEEEEE dessinait un liseré blanc autour des 6 donuts
   (Répartition des PdV par CA + Répartition du CA par article) : posé ici en
   !important et injecté après App.vue à specificité égale, il l'emportait sur la
   règle globale `.v-theme--dataFridayDark .donut-card`. Bordure retirée en dark,
   le fond de la carte suffit à la détacher — mode clair inchangé. */
.v-theme--dataFridayDark .donut-card {
  border-color: transparent !important;
}
.donut-title {
  font-size: var(--fs-base);
  font-weight: 600;
  color: #212121;
}
.donut-subtitle {
  font-size: var(--fs-xs);
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
/* Skeleton : anneau + 3 lignes de légende, même rendu shimmer que SpacePredictView.
   Lighthouse 24/08 (BUG-363-01) : l'ancienne animation de `background-position`
   n'est PAS compositable — 21 éléments repeints à chaque frame pendant tout le
   chargement. Désormais : fond uni + voile en pseudo-élément animé en
   `transform: translateX` (composité GPU, zéro repaint). */
.donut-skeleton-ring {
  border-radius: 50%;
  position: relative;
  overflow: hidden;
  background: #EEEEEE;
  /* Trou central : reproduit le cutout 65% du Doughnut. */
  mask: radial-gradient(circle at 50% 50%, transparent 0 32%, #000 33%);
  -webkit-mask: radial-gradient(circle at 50% 50%, transparent 0 32%, #000 33%);
}
.donut-skeleton-legend {
  display: grid;
  /* CLS 0.102 (Lighthouse 24/08) : rangées calées sur les 28px des v-list-item
     de la légende réelle — la carte garde la même hauteur quand les données
     remplacent le skeleton, plus de layout shift. */
  grid-auto-rows: 28px;
  align-items: center;
  padding: 0 8px;
}
.donut-skeleton-line {
  height: 10px;
  border-radius: 999px;
  position: relative;
  overflow: hidden;
  background: #EEEEEE;
}
.donut-skeleton-line:nth-child(2) { width: 78%; }
.donut-skeleton-line:nth-child(3) { width: 56%; }

.donut-skeleton-ring::after,
.donut-skeleton-line::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, #F7F7F7 50%, transparent 100%);
  transform: translateX(-100%);
  animation: donut-shimmer 1.3s ease-in-out infinite;
}

@keyframes donut-shimmer {
  to { transform: translateX(100%); }
}

.donut-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  padding: 0 12px;
  text-align: center;
  font-size: var(--fs-xs);
  color: #9E9E9E;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
  display: inline-block;
}
.legend-text {
  font-size: var(--fs-xs)!important;
  color: #424242;
  /* Les libellés de COMBINAISON (« Boissons Soft, Salé Chaud, Sides ») dépassent
     largement la largeur de la légende : on tronque proprement plutôt que de
     laisser le texte pousser la valeur hors de la carte. Le libellé complet reste
     lisible au survol via l'attribut title. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legend-value {
  font-size: var(--fs-xs);
  color: #212121;
  font-weight: 600;
}
.show-all {
  display: block;
  text-align: center;
  font-size: var(--fs-xs);
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

/* ── Dark mode (autonome via isDark) : overrides additifs des couleurs claires
   en dur. Mode clair inchangé. Le liseré inter-tranches est piloté en JS. ── */
.donut-card--dark .donut-title {
  color: #f9fafb;
}
.donut-card--dark .donut-subtitle {
  color: #94a3b8;
}
.donut-card--dark .donut-empty {
  color: #94a3b8;
}
.donut-card--dark .legend-text {
  color: #d1d5db;
}
.donut-card--dark .legend-value {
  color: #f9fafb;
}
/* Skeleton : shimmer clair (#EEEEEE/#F7F7F7) invisible ou éblouissant sur fond
   sombre → même animation, couleurs recalées sur la famille de surfaces sombres. */
.donut-card--dark .donut-skeleton-ring,
.donut-card--dark .donut-skeleton-line {
  background: #1f2937;
}
.donut-card--dark .donut-skeleton-ring::after,
.donut-card--dark .donut-skeleton-line::after {
  background: linear-gradient(90deg, transparent 0%, #374151 50%, transparent 100%);
}
</style>
