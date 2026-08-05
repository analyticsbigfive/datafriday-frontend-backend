<template>
  <v-card :class="embedded ? 'pa-0 mb-0 embedded' : 'pa-4 mb-4'" rounded="lg" :flat="embedded" :elevation="embedded ? 0 : 1">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-3">
      <div>
        <div class="text-h6 font-weight-bold">
          {{ t('anTimelineTitlePrefix') }} {{ eventName || t('anTimelineDefaultEvent') }}
        </div>
        <div class="text-caption text-medium-emphasis">
          <span v-if="eventDate">{{ formatDateShort(eventDate) }}</span>
          <span v-if="isShowingPredictedData" class="ml-2">
            <span class="badge rounded-pill etc-badge-warning">
              {{ t('anTimelinePredictiveData') }}
            </span>
          </span>
        </div>
      </div>

      <div class="d-flex align-center ga-2 flex-wrap">
        <!-- Vue : CA / Quantité -->
        <div class="btn-group btn-group-sm etc-toggle" role="group">
          <button type="button" class="btn" :class="{ active: viewMode === 'revenue' }" @click="viewMode = 'revenue'">{{ t('anRevenue') }}</button>
          <button type="button" class="btn" :class="{ active: viewMode === 'quantity' }" @click="viewMode = 'quantity'">{{ t('anQuantity') }}</button>
        </div>

        <!-- Ventilation : article / PdV -->
        <div class="btn-group btn-group-sm etc-toggle" role="group">
          <button type="button" class="btn" :class="{ active: breakdownMode === 'menuItem' }" @click="breakdownMode = 'menuItem'">{{ t('anTimelineBreakdownMenu') }}</button>
          <button type="button" class="btn" :class="{ active: breakdownMode === 'shop' }" @click="breakdownMode = 'shop'">{{ t('anTimelineBreakdownShop') }}</button>
        </div>

        <button type="button" class="btn btn-sm etc-btn-ghost d-inline-flex align-items-center gap-1" @click="resetRange">
          <RotateCcw :size="14" /> {{ t('anTimelineReset') }}
        </button>

        <button v-if="closable" type="button" class="btn btn-sm etc-btn-ghost etc-btn-icon" @click="$emit('close')">
          <X :size="16" />
        </button>
      </div>
    </div>

    <!-- Time-range pickers + slider -->
    <div class="time-range-row mb-3">
      <v-menu v-model="startMenuOpen" :close-on-content-click="false">
        <template #activator="{ props: act }">
          <div class="etc-timefield input-group input-group-sm" v-bind="act" role="button">
            <span class="input-group-text"><Clock :size="14" /></span>
            <input type="text" class="form-control" :value="startTimeLabel" :placeholder="t('anTimelineStart')" readonly />
          </div>
        </template>
        <div class="etc-timepop card border-0 shadow p-3">
          <div class="d-flex gap-2 align-items-center">
            <select v-model="tempStartHour" class="form-select form-select-sm etc-hm">
              <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}</option>
            </select>
            <span class="fw-bold">:</span>
            <select v-model="tempStartMinute" class="form-select form-select-sm etc-hm">
              <option v-for="m in minuteOptions" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-sm btn-light" @click="startMenuOpen = false">{{ t('cancel') }}</button>
            <button type="button" class="btn btn-sm etc-btn-primary" @click="applyStartTime">OK</button>
          </div>
        </div>
      </v-menu>

      <v-range-slider
        v-model="rangePct"
        :min="0"
        :max="100"
        :step="1"
        :strict="true"
        thumb-label
        hide-details
        density="compact"
        color="primary"
        class="mx-3 flex-grow-1"
        @update:model-value="onRangeChange"
      />

      <v-menu v-model="endMenuOpen" :close-on-content-click="false">
        <template #activator="{ props: act }">
          <div class="etc-timefield input-group input-group-sm" v-bind="act" role="button">
            <span class="input-group-text"><Clock :size="14" /></span>
            <input type="text" class="form-control" :value="endTimeLabel" :placeholder="t('anTimelineEnd')" readonly />
          </div>
        </template>
        <div class="etc-timepop card border-0 shadow p-3">
          <div class="d-flex gap-2 align-items-center">
            <select v-model="tempEndHour" class="form-select form-select-sm etc-hm">
              <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}</option>
            </select>
            <span class="fw-bold">:</span>
            <select v-model="tempEndMinute" class="form-select form-select-sm etc-hm">
              <option v-for="m in minuteOptions" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-sm btn-light" @click="endMenuOpen = false">{{ t('cancel') }}</button>
            <button type="button" class="btn btn-sm etc-btn-primary" @click="applyEndTime">OK</button>
          </div>
        </div>
      </v-menu>
    </div>

    <!-- Chart -->
    <div v-if="hasData" class="chart-wrap">
      <Line :data="chartData" :options="chartOptions" />
    </div>
    <div
      v-else
      class="d-flex align-center justify-center text-medium-emphasis"
      style="height: 320px"
    >
      <div class="text-center">
        <LineChart :size="48" class="mb-2 text-secondary opacity-50" />
        <div>{{ t('anTimelineNoData') }}</div>
      </div>
    </div>
  </v-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Line } from 'vue-chartjs'
import { useTheme } from 'vuetify'
import { registerChartJs } from '@/lib/chartjs'
import { useI18n } from '@/i18n/useI18n'
import { currentIntlLocale } from '@/composables/useNumberFormat'
import { Clock, LineChart, RotateCcw, X } from 'lucide-vue-next'
import { formatDateShort } from '@/utils/dateFr'

registerChartJs()

const { t } = useI18n()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)
// Chart.js peint sur <canvas> : hors du CSS, donc insensible au thème. On dérive
// grille + ticks de `isDark` (la palette des séries reste lisible sur les 2 fonds).
const gridColor = computed(() => (isDark.value ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'))
const tickColor = computed(() => (isDark.value ? '#94a3b8' : '#64748b'))

const MENU_COLORS = [
  '#3b82f6', '#ff3131', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
  '#f43f5e', '#84cc16', '#6366f1', '#eab308', '#0ea5e9',
  '#d946ef', '#22c55e', '#fb923c', '#a78bfa', '#f472b6',
]
const OTHERS_COLOR = '#9ca3af' // eslint-disable-line no-unused-vars

const props = defineProps({
  eventId: { type: String, default: '' },
  eventName: { type: String, default: '' },
  eventDate: { type: String, default: '' },
  timelineData: { type: Array, default: () => [] },
  predictedTimelineData: { type: Array, default: () => [] },
  menuItems: { type: Array, default: () => [] },
  selectedShops: { type: Array, default: () => [] },
  selectedMenuItems: { type: Array, default: () => [] },
  selectedShopTypes: { type: Array, default: () => [] },
  selectedShopAreas: { type: Array, default: () => [] },
  selectedTypes: { type: Array, default: () => [] },
  selectedCategories: { type: Array, default: () => [] },
  shopIdToNameMap: { type: Object, default: () => null }, // Map or null
  elementIdToNameMap: { type: Object, default: () => null },
  elementIdToTypesMap: { type: Object, default: () => null },
  elementIdToAreaMap: { type: Object, default: () => null },
  elementIdToShopNameMap: { type: Object, default: () => null },
  itemNameToMenuItemIdMap: { type: Object, default: () => null },
  closable: { type: Boolean, default: false },
  // Aplatit la <v-card> racine (pa-0/mb-0, flat, elevation 0) pour s'intégrer
  // dans une carte parente (fusion timeline + barres dans AnalyseView).
  embedded: { type: Boolean, default: false },
  // Fenêtre horaire restaurée par le parent (version/brouillon) : { startPct, endPct }.
  // Permet de ré-hydrater le curseur au retour sur la page.
  initialRange: { type: Object, default: () => null },
  // Empreinte des filtres du parent quand celui-ci PRÉ-FILTRE `timelineData`
  // (cas AnalyseView). `rangePct` étant local à ce composant, un changement de
  // filtre modifie `series.labels` sans que les pourcentages du curseur bougent :
  // les mêmes bornes désigneraient alors d'autres heures, sans réémission → le
  // `selectedTimeRange` du store diverge silencieusement de ce qu'affiche le
  // curseur. On remet donc la fenêtre à pleine largeur à chaque changement.
  // Défaut '' : les appelants qui ne pré-filtrent pas (EventPredictView) ne
  // voient jamais ce watcher se déclencher.
  filterSignature: { type: String, default: '' },
})

const emit = defineEmits(['close', 'time-range-change'])

// ----- View state -----
const viewMode = ref('revenue')
const breakdownMode = ref('menuItem')
const rangePct = ref([0, 100])

const startMenuOpen = ref(false)
const endMenuOpen = ref(false)
const tempStartHour = ref('00')
const tempStartMinute = ref('00')
const tempEndHour = ref('23')
const tempEndMinute = ref('59')

import {
  TIMELINE_BUCKET_STRATEGIES,
  bucketMinute as sharedBucketMinute,
  preprocessTimelineRecords,
} from '@/utils/timelineBucketing'

const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
// Granularité native : 1 point par minute. L'axe Chart.js peut autoskip les
// labels, mais les données consommées par les filtres/KPI restent minute-level.
const TIMELINE_BUCKET_MINUTES = TIMELINE_BUCKET_STRATEGIES.MINUTE_1
const minuteOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

// ----- Data selection -----
const effectiveTimelineData = computed(() => {
  if (props.timelineData && props.timelineData.length > 0) return props.timelineData
  if (props.predictedTimelineData && props.predictedTimelineData.length > 0) {
    return props.predictedTimelineData
  }
  return []
})

// BUG-285 : ne PAS ré-agréger des données déjà agrégées. Le chemin Analyse passe
// `filteredTimelineData`, déjà sorti de preprocessTimelineRecords (useAnalyseTimeline)
// — la ré-agrégation était idempotente mais matérialisait une copie complète du
// dataset minute-level (+ pic 2× pendant l'agrégation) pour un résultat identique.
// Discriminant : les lignes agrégées portent des champs dérivés (`avgBasket`,
// `totalRevenue`) que les records bruts API n'ont jamais — robuste au .filter()/.map()
// amont, contrairement à un marqueur posé sur le tableau.
const preprocessedTimelineData = computed(() => {
  const d = effectiveTimelineData.value
  if (!d.length) return d
  const first = d[0]
  const alreadyAggregated = first && first.avgBasket !== undefined && first.totalRevenue !== undefined
  return alreadyAggregated ? d : preprocessTimelineRecords(d)
})

const isShowingPredictedData = computed(
  () =>
    (!props.timelineData || props.timelineData.length === 0) &&
    props.predictedTimelineData &&
    props.predictedTimelineData.length > 0,
)

const menuItemMap = computed(() => {
  const m = new Map()
  for (const it of props.menuItems || []) {
    if (it && it.id) m.set(it.id, it)
  }
  return m
})

function mapGet(map, key) {
  if (!map) return undefined
  if (map instanceof Map) return map.get(key)
  return map[key]
}

// ----- Filtering -----
function passesFilters(record) {
  // Shop filters. `selectedShops` peut contenir des shopId (contexte
  // EventPredict) OU des shopName (contexte Analyse : le filtre global
  // `selectedShopIds` stocke en réalité des noms — cf. store analyse
  // `selectedShopIds.includes(r.shopName)`). On matche donc les deux, sinon
  // la timeline d'un PdV sélectionné via le panneau de droite reste vide.
  if (props.selectedShops && props.selectedShops.length > 0) {
    if (
      !props.selectedShops.includes(record.shopId) &&
      !props.selectedShops.includes(record.shopName)
    ) {
      return false
    }
  }
  if (
    props.selectedShopTypes &&
    props.selectedShopTypes.length > 0 &&
    props.elementIdToTypesMap
  ) {
    const types = mapGet(props.elementIdToTypesMap, record.shopId) || []
    if (!types.some((t) => props.selectedShopTypes.includes(t))) return false
  }
  if (
    props.selectedShopAreas &&
    props.selectedShopAreas.length > 0 &&
    props.elementIdToAreaMap
  ) {
    const area = mapGet(props.elementIdToAreaMap, record.shopId)
    if (!area || !props.selectedShopAreas.includes(area)) return false
  }

  // Menu item id resolution
  let menuItemId = record.mappedMenuItemId || record.menuItemId
  if (!menuItemId && props.itemNameToMenuItemIdMap && record.itemName) {
    menuItemId = mapGet(props.itemNameToMenuItemIdMap, record.itemName)
  }

  if (props.selectedMenuItems && props.selectedMenuItems.length > 0) {
    if (!menuItemId || !props.selectedMenuItems.includes(menuItemId)) return false
  }

  if (
    (props.selectedTypes && props.selectedTypes.length > 0) ||
    (props.selectedCategories && props.selectedCategories.length > 0)
  ) {
    if (!menuItemId) return false
    const mi = menuItemMap.value.get(menuItemId)
    if (!mi) return false
    if (
      props.selectedTypes &&
      props.selectedTypes.length > 0 &&
      !props.selectedTypes.includes(mi.type)
    ) {
      return false
    }
    if (
      props.selectedCategories &&
      props.selectedCategories.length > 0 &&
      !props.selectedCategories.includes(mi.category)
    ) {
      return false
    }
  }

  return true
}

function bucketTimelineMinute(minute) {
  // Délègue à l'utilitaire partagé pour garantir une seule logique à travers
  // Analyse / Predict / EventPredict. La stratégie courante reste 1 minute.
  return sharedBucketMinute(minute, TIMELINE_BUCKET_MINUTES)
}

// ----- Series construction (group by minute, then by series key) -----
const series = computed(() => {
  const data = preprocessedTimelineData.value
  if (!data || data.length === 0) {
    return { labels: [], datasets: [], totalsBySeries: new Map() }
  }

  const filtered = data.filter(passesFilters)
  if (filtered.length === 0) {
    return { labels: [], datasets: [], totalsBySeries: new Map() }
  }

  const isMenu = breakdownMode.value === 'menuItem'
  const valueField = viewMode.value === 'revenue' ? 'totalRevenue' : 'totalQuantity'

  // displayName resolver
  const idToName = new Map()
  function resolveSeriesKey(record) {
    if (isMenu) {
      let id = record.mappedMenuItemId || record.menuItemId
      if (!id && props.itemNameToMenuItemIdMap && record.itemName) {
        id = mapGet(props.itemNameToMenuItemIdMap, record.itemName)
      }
      if (!id) return null
      if (!idToName.has(id)) {
        const mi = menuItemMap.value.get(id)
        idToName.set(
          id,
          mi?.name || record.mappedMenuItemName || record.itemName || 'Unknown',
        )
      }
      return id
    } else {
      const id = record.shopId
      if (!id) return null
      if (!idToName.has(id)) {
        // Plusieurs maps de résolution sont supportées :
        //  - `shopIdToNameMap`         : rawShopName backend → name (cf. Analyse)
        //  - `elementIdToShopNameMap`  : registry elementId → rawShopName
        //    (cf. EventPredictView.buildShopMappings)
        //  - `elementIdToNameMap`      : registry elementId → element.name
        // `record.shopName` est utilisé en dernier recours avant l'id brut.
        const fromShopId = mapGet(props.shopIdToNameMap, id)
        const fromShopElem = mapGet(props.elementIdToShopNameMap, id)
        const fromElem = mapGet(props.elementIdToNameMap, id)
        idToName.set(
          id,
          fromShopId || fromShopElem || record.shopName || fromElem || id || 'Unknown Shop',
        )
      }
      return id
    }
  }

  const minuteSet = new Set()
  const totalsBySeries = new Map() // key id -> total
  // perMinute: Map<minute, Map<seriesKey, value>>
  const perMinute = new Map()

  for (const r of filtered) {
    const key = resolveSeriesKey(r)
    if (!key) continue
    const minute = bucketTimelineMinute(r.minute)
    if (!minute) continue
    minuteSet.add(minute)
    if (!perMinute.has(minute)) perMinute.set(minute, new Map())
    const slot = perMinute.get(minute)
    slot.set(key, (slot.get(key) || 0) + (Number(r[valueField]) || 0))
    totalsBySeries.set(key, (totalsBySeries.get(key) || 0) + (Number(r[valueField]) || 0))
  }

  const sortedMinutes = [...minuteSet].sort()
  const sortedKeysAll = [...totalsBySeries.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)

  // Cap au TOP_N — au-delà, on regroupe en une série "Autres" pour ne pas
  // exploser la légende quand il y a 20+ shops ou 50+ menu items.
  const TOP_N = 10
  const topKeys = sortedKeysAll.slice(0, TOP_N)
  const otherKeys = sortedKeysAll.slice(TOP_N)

  const datasets = topKeys.map((key, idx) => {
    const color = MENU_COLORS[idx % MENU_COLORS.length]
    const name = idToName.get(key) || key
    const data = sortedMinutes.map((m) => {
      const slot = perMinute.get(m)
      return slot ? Number(slot.get(key) || 0) : 0
    })
    return {
      label: name,
      data,
      backgroundColor: hexToRgba(color, 0.55),
      borderColor: color,
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.25,
      fill: idx === 0 ? 'origin' : '-1',
      stack: 'tl',
    }
  })

  // Série "Autres" : somme par minute des séries au-delà du TOP_N.
  if (otherKeys.length > 0) {
    const data = sortedMinutes.map((m) => {
      const slot = perMinute.get(m)
      if (!slot) return 0
      let s = 0
      for (const k of otherKeys) s += Number(slot.get(k) || 0)
      return s
    })
    datasets.push({
      label: `${t('anTimelineOthers')} (${otherKeys.length})`,
      data,
      backgroundColor: hexToRgba(OTHERS_COLOR, 0.55),
      borderColor: OTHERS_COLOR,
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.25,
      fill: '-1',
      stack: 'tl',
    })
  }

  return {
    labels: sortedMinutes,
    datasets,
    totalsBySeries,
  }
})

function hexToRgba(hex, alpha = 1) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ----- Time range filtering on the labels axis -----
const filteredChart = computed(() => {
  const { labels, datasets } = series.value
  if (labels.length === 0) return { labels: [], datasets: [] }
  const total = labels.length
  const startIdx = Math.max(0, Math.floor((rangePct.value[0] / 100) * total))
  const endIdx = Math.min(total, Math.ceil((rangePct.value[1] / 100) * total))
  const slicedLabels = labels.slice(startIdx, endIdx)
  const slicedDatasets = datasets.map((ds) => ({
    ...ds,
    data: ds.data.slice(startIdx, endIdx),
  }))
  return { labels: slicedLabels, datasets: slicedDatasets }
})

const hasData = computed(
  () => filteredChart.value.labels.length > 0 && filteredChart.value.datasets.length > 0,
)

const chartData = computed(() => ({
  labels: filteredChart.value.labels,
  datasets: filteredChart.value.datasets,
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  // BUG-284 : 1000 ms → 200 ms (cf. GenericByEventChart).
  animation: { duration: 200 },
  interaction: { mode: 'index', intersect: false },
  // Clic sur une barre / un point → on resserre la plage horaire autour de
  // l'heure cliquée (fenêtre de 1 h) puis on émet `time-range-change` pour
  // que le parent (AnalyseView / EventPredictView) filtre la page.
  onClick: (_e, elements, chart) => {
    if (!elements?.length) return
    const idx = elements[0].index
    const allLabels = series.value.labels
    if (!allLabels || allLabels.length === 0) return
    // Index dans la liste complète (filteredChart est un slice → on retrouve
    // l'offset via rangePct).
    const offset = Math.max(0, Math.floor((rangePct.value[0] / 100) * allLabels.length))
    const globalIdx = offset + idx
    const clickedTime = allLabels[globalIdx]
    if (!clickedTime) return
    const target = parseHHMM(clickedTime)
    if (target == null) return
    // Fenêtre ±30 min autour de l'heure cliquée
    const startMin = Math.max(0, target - 30)
    const endMin = target + 30
    const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    const newStart = pctForTime(fmt(startMin))
    const newEnd = pctForTime(fmt(endMin))
    rangePct.value = [Math.min(newStart, newEnd - 1), Math.max(newEnd, newStart + 1)]
    emitRange()
  },
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      align: 'start',
      maxHeight: 90,
      labels: {
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        padding: 8,
        font: { size: 11 },
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx) => {
          const v = ctx.parsed.y
          const formatted =
            viewMode.value === 'revenue'
              ? new Intl.NumberFormat(currentIntlLocale(), {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                }).format(v)
              : new Intl.NumberFormat(currentIntlLocale()).format(v)
          return `${ctx.dataset.label}: ${formatted}`
        },
      },
    },
  },
  scales: {
    x: {
      stacked: true,
      ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, color: tickColor.value },
      grid: { display: false },
    },
    y: {
      stacked: true,
      beginAtZero: true,
      ticks: {
        color: tickColor.value,
        callback: (v) =>
          viewMode.value === 'revenue'
            ? new Intl.NumberFormat(currentIntlLocale(), {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(v) + ' €'
            : new Intl.NumberFormat(currentIntlLocale()).format(v),
      },
      grid: { color: gridColor.value },
    },
  },
}))

// ----- Time range labels & emit -----
const startTimeLabel = computed(() => labelAtPct(rangePct.value[0]))
const endTimeLabel = computed(() => labelAtPct(rangePct.value[1]))

function labelAtPct(p) {
  const labels = series.value.labels
  if (!labels || labels.length === 0) return '--:--'
  const total = labels.length
  const idx = Math.min(total - 1, Math.max(0, Math.round((p / 100) * (total - 1))))
  return labels[idx] || '--:--'
}

function parseHHMM(s) {
  const m = /^(\d{2}):(\d{2})$/.exec(s || '')
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function pctForTime(hhmm) {
  const labels = series.value.labels
  if (!labels.length) return 0
  const target = parseHHMM(hhmm)
  if (target == null) return 0
  let bestIdx = 0
  let bestDiff = Infinity
  labels.forEach((l, i) => {
    const t = parseHHMM(l)
    if (t == null) return
    const d = Math.abs(t - target)
    if (d < bestDiff) {
      bestDiff = d
      bestIdx = i
    }
  })
  return Math.round((bestIdx / Math.max(1, labels.length - 1)) * 100)
}

function applyStartTime() {
  const newPct = pctForTime(`${tempStartHour.value}:${tempStartMinute.value}`)
  // enforce min 15-min gap roughly via 1 step minimum
  const endPct = rangePct.value[1]
  rangePct.value = [Math.min(newPct, Math.max(0, endPct - 1)), endPct]
  startMenuOpen.value = false
  emitRange()
}
function applyEndTime() {
  const newPct = pctForTime(`${tempEndHour.value}:${tempEndMinute.value}`)
  const startPct = rangePct.value[0]
  rangePct.value = [startPct, Math.max(newPct, Math.min(100, startPct + 1))]
  endMenuOpen.value = false
  emitRange()
}
function resetRange() {
  rangePct.value = [0, 100]
  emitRange()
}
function onRangeChange() {
  emitRange()
}
function emitRange() {
  emit('time-range-change', {
    start: rangePct.value[0] === 0 ? null : startTimeLabel.value,
    end: rangePct.value[1] === 100 ? null : endTimeLabel.value,
    startPct: rangePct.value[0],
    endPct: rangePct.value[1],
  })
}

// Les données pré-filtrées par le parent ont changé de périmètre → la fenêtre
// horaire courante ne désigne plus les mêmes heures. Reset explicite (et non
// simple recalcul silencieux) : c'est déterministe et ça réémet, donc le store
// reste aligné sur ce que montre le curseur. Cf. la prop `filterSignature`.
watch(
  () => props.filterSignature,
  (sig, prev) => {
    if (sig === prev) return
    resetRange()
  },
)

// Sync popover temp values when label changes externally
watch(startTimeLabel, (l) => {
  const m = /^(\d{2}):(\d{2})$/.exec(l)
  if (m) {
    tempStartHour.value = m[1]
    tempStartMinute.value = m[2]
  }
})
watch(endTimeLabel, (l) => {
  const m = /^(\d{2}):(\d{2})$/.exec(l)
  if (m) {
    tempEndHour.value = m[1]
    tempEndMinute.value = m[2]
  }
})

// Ré-hydrate le curseur depuis la fenêtre restaurée par le parent (version /
// brouillon). Affectation programmatique de rangePct → ne ré-émet pas
// (`@update:model-value` ne se déclenche qu'à l'interaction utilisateur), donc
// pas de boucle. Garde l'égalité pour éviter tout travail inutile.
watch(
  () => props.initialRange,
  (r) => {
    const sp = Number.isFinite(r?.startPct) ? r.startPct : 0
    const ep = Number.isFinite(r?.endPct) ? r.endPct : 100
    if (rangePct.value[0] === sp && rangePct.value[1] === ep) return
    rangePct.value = [sp, ep]
  },
  { immediate: true, deep: true },
)
</script>

<style scoped>
.chart-wrap {
  position: relative;
  min-height: 80vh;
  height: 80vh;
  width: 100%;
}
/* En mode embarqué (carte fusionnée Analyse), aligne la hauteur du canvas
   timeline sur celle des barres (360px) pour une bascule visuellement stable. */
.embedded .chart-wrap {
  min-height: 360px;
  height: 360px;
}
.time-range-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: nowrap;
}

/* ── Champs heure (Bootstrap input-group) ── */
.etc-timefield {
  max-width: 140px;
  flex: 0 0 140px;
  cursor: pointer;
}
.etc-timefield .input-group-text {
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-color: var(--fb-border, #e5e7eb);
  color: var(--fb-faint, #9ca3af);
}
.etc-timefield .form-control {
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-color: var(--fb-border, #e5e7eb);
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  font-weight: 600;
  font-size: var(--fs-base);
}
.etc-timefield:hover .form-control,
.etc-timefield:hover .input-group-text { border-color: var(--fb-border-strong, #d1d5db); }
.etc-timefield .form-control:focus { box-shadow: none; }

/* ── Popup HH:mm ── */
.etc-timepop {
  min-width: 210px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
.etc-hm { width: 84px; }
.etc-hm:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}

/* ── Toggles segmentés (btn-group Bootstrap + accent rouge) ── */
.etc-toggle .btn {
  border: 1px solid var(--fb-border, #e5e7eb);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: var(--fs-sm);
  font-weight: 600;
  padding: 4px 12px;
}
.etc-toggle .btn:hover { background: rgba(var(--v-theme-on-surface), 0.05); }
.etc-toggle .btn.active {
  background: #ff3131;
  border-color: #ff3131;
  color: #fff;
  box-shadow: none;
}

/* ── Boutons ghost / primary ── */
.etc-btn-ghost {
  border: 0;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: var(--fs-sm);
  font-weight: 600;
}
.etc-btn-ghost:hover { background: rgba(255, 49, 49, 0.08); color: #ff3131; }
.etc-btn-icon { padding: 4px 6px; }
.etc-btn-primary {
  background: #ff3131;
  border: 1px solid #ff3131;
  color: #fff;
  font-weight: 600;
}
.etc-btn-primary:hover { background: #d61f1f; border-color: #d61f1f; color: #fff; }

/* ── Badge prédictif ── */
.etc-badge-warning {
  background: rgba(245, 158, 11, 0.15);
  color: #b45309;
  font-weight: 600;
}

@media (max-width: 600px) {
  .time-range-row {
    flex-wrap: wrap;
  }
  .etc-timefield {
    flex: 1 1 45%;
    max-width: none;
  }
}

/* ===================== DARK MODE =====================
   Le chart vit dans l'overlay .event-predict-overlay (non téléporté) : bordures/
   textes suivent les `--fb-*` hérités ou `--v-theme-on-surface` (déjà theme-aware).
   Grille et ticks du <canvas> sont pilotés en JS (isDark). Ne reste que le texte
   ambre du badge d'avertissement (calibré pour fond clair). */
.dark .etc-badge-warning {
  color: #fcd34d;
}
</style>
