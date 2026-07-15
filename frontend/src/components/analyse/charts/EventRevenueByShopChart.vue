<template>
  <v-card flat rounded="lg" :class="embedded ? 'pa-0 mb-0' : 'pa-5 mb-4'">
    <!-- Header : titre + dropdown agrégation (Per Event / Monthly / Quarterly / Yearly) -->
    <div class="d-flex align-center mb-3 flex-wrap ga-2">
      <span class="chart-title">{{ chartTitle }}</span>
      <v-menu offset="4">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            icon
            size="x-small"
            variant="text"
            class="ml-1"
            :aria-label="t('anChartChangeAggLabel')"
          >
            <v-icon size="18">mdi-chevron-down</v-icon>
          </v-btn>
        </template>
        <v-list density="compact" min-width="180">
          <v-list-item
            v-for="opt in aggregationOptions"
            :key="opt.value"
            :active="aggregationMode === opt.value"
            @click="aggregationMode = opt.value"
          >
            <v-list-item-title>{{ opt.label }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
      <v-chip
        v-if="hasPredictions"
        size="x-small"
        color="purple"
        variant="tonal"
        class="ml-2"
      >
        {{ t('anChartPredictionsIncluded') }}
      </v-chip>
      <v-spacer />
      <v-switch
        v-if="cumulativeAvailable"
        v-model="showCumulative"
        color="primary"
        density="compact"
        hide-details
        :label="t('anChartCumulativeRev')"
        class="ml-2 mt-0"
      />
    </div>

    <!-- Controls : tri + viewMode + moyenne -->
    <div class="d-flex align-center justify-end mb-4 flex-wrap ga-2 chart-toolbar">
      <v-btn
        v-if="aggregationMode === 'event'"
        size="small"
        variant="outlined"
        density="comfortable"
        rounded="pill"
        prepend-icon="mdi-swap-vertical"
        @click="toggleSort"
      >
        {{ sortMode === 'date' ? t('anChartSortByDate') : t('anChartSortByRevenue') }}
      </v-btn>

      <v-btn-toggle
        v-model="viewMode"
        mandatory
        density="compact"
        rounded="pill"
        class="chart-view-toggle pill-toggle"
      >
        <v-btn value="shops" size="small">{{ t('anChartViewShops') }}</v-btn>
        <v-btn value="menuTypes" size="small">{{ t('anChartViewMenuTypes') }}</v-btn>
      </v-btn-toggle>

      <v-btn
        size="small"
        variant="outlined"
        density="comfortable"
        rounded="pill"
        @click="onAverageClick"
      >
        {{ t('anChartAverage') }}
      </v-btn>
    </div>

    <!-- Empty state -->
    <div
      v-if="aggregated.length === 0"
      class="d-flex flex-column align-center justify-center py-10 text-medium-emphasis"
    >
      <p class="mb-1">
        {{ viewMode === 'shops' ? t('anChartNoRevenueByShop') : t('anChartNoRevenueByMenuType') }}
        {{ t('anChartAvailableForSelection') }}
      </p>
      <p class="text-caption">
        {{ t('anChartAdjustFiltersHint') }}
      </p>
    </div>

    <!-- Chart -->
    <div v-else style="height: 360px; position: relative">
      <Bar :data="chartData" :options="chartOptions" />
    </div>

    <!-- Legend -->
    <div
      v-if="aggregated.length > 0"
      class="d-flex flex-wrap ga-3 mt-3 justify-center"
    >
      <div
        v-for="(item, idx) in visibleLegend"
        :key="item"
        class="d-flex align-center"
      >
        <span class="legend-dot" :style="{ background: colorFor(idx, item) }" />
        <span class="legend-label">{{ item }}</span>
      </div>
      <a
        v-if="itemsList.length > maxLegend"
        class="legend-link"
        href="#"
        @click.prevent="expandLegend = !expandLegend"
      >
        {{
          expandLegend
            ? t('anChartLegendCollapse')
            : `${t('anChartShowMore')} ${itemsList.length} ${
                viewMode === 'shops' ? t('anChartViewShops').toLowerCase() : t('anChartLegendTypes')
              }`
        }}
      </a>
    </div>
  </v-card>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { Bar } from 'vue-chartjs'
import { registerChartJs } from '@/lib/chartjs'
import { SHOP_COLORS } from '@/constants/analyseColors'
import { parseEventDate } from '@/utils/dateFr'
import { UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'
import { useI18n } from '@/i18n/useI18n'

registerChartJs()

const { t } = useI18n()

// Part « Non rattachés » (articles sans correspondance catalogue) — gris neutre.
const UNATTACHED_COLOR = '#9CA3AF'

const props = defineProps({
  records: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  isPredictMode: { type: Boolean, default: false },
  // Aplatit la <v-card> racine pour s'intégrer dans une carte parente
  // (fusion timeline + barres dans AnalyseView).
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['show-average', 'event-click', 'period-drilldown'])

const viewMode = ref('shops') // 'shops' | 'menuTypes'
const sortMode = ref('date') // 'date' | 'revenue'
const aggregationMode = ref('event') // 'event' | 'monthly' | 'quarterly' | 'yearly'
const aggregationOptions = computed(() => [
  { value: 'event', label: t('anChartAggPerEvent') },
  { value: 'monthly', label: t('anChartAggMonthly') },
  { value: 'quarterly', label: t('anChartAggQuarterly') },
  { value: 'yearly', label: t('anChartAggYearly') },
])
const showCumulative = ref(false) // courbe CA cumulé cachée par défaut
const expandLegend = ref(false)
const maxLegend = 7

const cumulativeAvailable = computed(
  () => aggregationMode.value !== 'event' || sortMode.value === 'date',
)

const chartSubtitle = computed(() => {
  if (aggregationMode.value === 'monthly') return t('anChartSubtitleMonthly')
  if (aggregationMode.value === 'quarterly') return t('anChartSubtitleQuarterly')
  if (aggregationMode.value === 'yearly') return t('anChartSubtitleYearly')
  return t('anChartSubtitleEvent')
})

const chartTitle = computed(() => {
  const dim = viewMode.value === 'shops' ? t('anChartShopDim') : t('anChartMenuTypeDim')
  return `${chartSubtitle.value} ${t('anChartTitleBy')} ${dim} ${t('anChartTitleExTax')}`
})

function parseDate(s) {
  return parseEventDate(s)?.getTime() || 0
}

function bucketKeyFor(date, mode) {
  if (!date) return null
  const y = date.getFullYear()
  if (mode === 'yearly') return { key: `${y}`, label: `${y}`, sortKey: y * 100 }
  if (mode === 'quarterly') {
    const q = Math.floor(date.getMonth() / 3) + 1
    return { key: `${y}-Q${q}`, label: `T${q} ${y}`, sortKey: y * 10 + q }
  }
  // monthly
  const m = date.getMonth() + 1
  const monthLabel = new Intl.DateTimeFormat('fr-FR', {
    month: 'short',
    year: '2-digit',
  }).format(date)
  return { key: `${y}-${String(m).padStart(2, '0')}`, label: monthLabel, sortKey: y * 100 + m }
}

// Map eventId -> { name, date } depuis props.events. Les records item-level
// (event-timeline) ne portent QUE `eventId` (cf. useAnalyseItemRecords:50), PAS
// `eventName`/`eventDate` → sans ce repli, les libellés de l'axe X (e.eventName) sont
// vides : le nom de l'event manque sous chaque barre.
const eventMetaById = computed(() => {
  const m = new Map()
  for (const ev of props.events || []) {
    if (ev?.id == null) continue
    m.set(String(ev.id), {
      name: ev.eventName || ev.name || '',
      date: ev.eventDate || ev.date || '',
    })
  }
  return m
})

// Valeur de la dimension de stacking (shop OU type) pour un record — data-driven :
// tout record compte ; la sentinelle « Non rattachés » (type d'un article sans
// correspondance catalogue) garde son libellé + sa couleur grise.
function dimValueFor(r, dimKey) {
  const v = r[dimKey]
  if (dimKey === 'menuItemType' && v === UNATTACHED_ITEM_KEY) return t('anUnmatchedItems')
  return v || '—'
}

const aggregated = computed(() => {
  const dimKey = viewMode.value === 'shops' ? 'shopName' : 'menuItemType'
  const mode = aggregationMode.value
  const metaById = eventMetaById.value

  if (mode !== 'event') {
    // Bucket records by period.
    const byBucket = new Map()
    for (const r of props.records || []) {
      if (!r) continue
      const dim = dimValueFor(r, dimKey)
      if (dim === null) continue
      const date = parseEventDate(r.eventDate || metaById.get(String(r.eventId))?.date)
      if (!date) continue
      const bucket = bucketKeyFor(date, mode)
      if (!bucket) continue
      if (!byBucket.has(bucket.key)) {
        byBucket.set(bucket.key, {
          id: bucket.key,
          eventName: bucket.label,
          eventDate: bucket.label,
          sortKey: bucket.sortKey,
          items: {},
          total: 0,
          isPredictive: false,
          confidenceScore: 0,
          isLowConfidence: false,
          eventCount: new Set(),
        })
      }
      const entry = byBucket.get(bucket.key)
      const itemName = dim
      entry.items[itemName] = (entry.items[itemName] || 0) + (r.revenue || 0)
      entry.total += r.revenue || 0
      if (r.eventId) entry.eventCount.add(r.eventId)
      if (r.isPredictive) {
        entry.isPredictive = true
        // Global confidence rate: revenue-weighted instead of per-item max,
        // so the tooltip surfaces ONE consolidated number per event rather
        // than the max-confidence article (cf. user request).
        if (Number.isFinite(r.confidenceScore)) {
          entry._confSum = (entry._confSum || 0) + r.confidenceScore * (r.revenue || 0)
          entry._confW = (entry._confW || 0) + (r.revenue || 0)
        }
        if (r.isLowConfidence) entry.isLowConfidence = true
      }
    }
    const list = Array.from(byBucket.values()).sort(
      (a, b) => a.sortKey - b.sortKey,
    )
    let running = 0
    for (const e of list) {
      running += e.total
      e.cumulative = running
      e.eventCount = e.eventCount.size
      if (e._confW) e.confidenceScore = Math.round(e._confSum / e._confW)
      delete e._confSum
      delete e._confW
    }
    return list
  }

  // Per-event aggregation
  const byEvent = new Map()

  for (const r of props.records || []) {
    if (!r || !r.eventId) continue
    const dim = dimValueFor(r, dimKey)
    if (dim === null) continue
    if (!byEvent.has(r.eventId)) {
      const meta = metaById.get(String(r.eventId))
      byEvent.set(r.eventId, {
        id: r.eventId,
        eventName: r.eventName || meta?.name || '',
        eventDate: r.eventDate || meta?.date || '',
        items: {},
        total: 0,
        isPredictive: false,
        confidenceScore: 0,
        isLowConfidence: false,
      })
    }
    const entry = byEvent.get(r.eventId)
    const itemName = dim
    entry.items[itemName] = (entry.items[itemName] || 0) + (r.revenue || 0)
    entry.total += r.revenue || 0
    if (r.isPredictive) {
      entry.isPredictive = true
      // Global confidence rate per event (revenue-weighted).
      if (Number.isFinite(r.confidenceScore)) {
        entry._confSum = (entry._confSum || 0) + r.confidenceScore * (r.revenue || 0)
        entry._confW = (entry._confW || 0) + (r.revenue || 0)
      }
      if (r.isLowConfidence) entry.isLowConfidence = true
    }
  }

  let list = Array.from(byEvent.values())
  for (const e of list) {
    if (e._confW) e.confidenceScore = Math.round(e._confSum / e._confW)
    delete e._confSum
    delete e._confW
  }

  if (sortMode.value === 'date') {
    list.sort((a, b) => parseDate(a.eventDate) - parseDate(b.eventDate))
    let running = 0
    for (const e of list) {
      running += e.total
      e.cumulative = running
    }
  } else {
    list.sort((a, b) => b.total - a.total)
  }

  return list
})

const hasPredictions = computed(() => aggregated.value.some((e) => e.isPredictive))

const itemsList = computed(() => {
  const totals = new Map()
  for (const e of aggregated.value) {
    for (const [name, rev] of Object.entries(e.items)) {
      totals.set(name, (totals.get(name) || 0) + rev)
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)
})

const visibleLegend = computed(() =>
  expandLegend.value ? itemsList.value : itemsList.value.slice(0, maxLegend)
)

const chartData = computed(() => {
  const list = aggregated.value
  const items = itemsList.value
  const datasets = items.map((item, idx) => {
    const perBarColors = list.map((e) => barColorFor(e, idx, item))
    // Bordure violette sur les barres dont le CA est prédit/modifié → "badge"
    // visuel (en plus du chip header + tooltip PRÉDIT).
    const perBarBorderColor = list.map((e, i) => (e.isPredictive ? '#7c3aed' : perBarColors[i]))
    const perBarBorderWidth = list.map((e) => (e.isPredictive ? 2 : 0))
    return {
      label: item,
      data: list.map((e) => e.items[item] || 0),
      backgroundColor: perBarColors,
      borderColor: perBarBorderColor,
      borderWidth: perBarBorderWidth,
      borderRadius: 2,
      stack: 'total',
      yAxisID: 'y',
      order: 1,
    }
  })
  if (cumulativeAvailable.value && showCumulative.value) {
    datasets.push({
      type: 'line',
      label: t('anChartCumulativeRev'),
      data: list.map((e) => e.cumulative || 0),
      borderColor: '#FF6347',
      backgroundColor: '#FF6347',
      borderWidth: 1.5,
      pointRadius: 1.2,
      pointHoverRadius: 3,
      tension: 0.15,
      fill: false,
      yAxisID: 'y1',
      order: 0,
    })
  }
  return {
    labels: list.map((e) => e.eventName || ''),
    datasets,
  }
})

function colorFor(idx, key) {
  if (key !== undefined && key === t('anUnmatchedItems')) return UNATTACHED_COLOR
  return SHOP_COLORS[idx % SHOP_COLORS.length]
}

function hexToRgba(hex, alpha) {
  const m = String(hex || '').match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return hex
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`
}

// Event PASSÉ (date < aujourd'hui) — sert à atténuer les anciens events en mode predict.
function isPastEvent(eventEntry) {
  const d = parseEventDate(eventEntry?.eventDate)
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime()
}

function barColorFor(eventEntry, idx, key) {
  const base = colorFor(idx, key)
  if (eventEntry?.isPredictive && eventEntry?.isLowConfidence) {
    return '#ff3131'
  }
  // Mode PREDICT : on ATTÉNUE (opacité réduite) les events PASSÉS pour faire ressortir
  // les events À VENIR. Deux critères, l'un OU l'autre :
  //  - event passé par DATE (même sans prédiction générée) en mode predict ;
  //  - present d'events prédictifs dans la vue et cet event n'est pas prédictif
  //    (filet historique : prédictions EventPredict sans bascule predict explicite).
  // Les events à venir / prédits gardent couleur pleine + bordure violette.
  const dimPast =
    (props.isPredictMode && !eventEntry?.isPredictive && isPastEvent(eventEntry)) ||
    (hasPredictions.value && !eventEntry?.isPredictive)
  if (dimPast) {
    // 0.50 = spec React (§13.8.8) — audit cohérence 2026-07-03.
    return hexToRgba(base, 0.5)
  }
  return base
}

function formatEuro(v) {
  return (
    '€' +
    Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v || 0)
  )
}

function formatShare(value, total) {
  const n = Number(value) || 0
  const t = Number(total) || 0
  if (!t) return '0%'
  return Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n / t)
}

const globalVisibleTotal = computed(() =>
  aggregated.value.reduce((sum, e) => sum + (e.total || 0), 0),
)

// ---- Tooltip HTML externe -------------------------------------------------
// Le tooltip canvas natif de Chart.js est confiné au canvas et peut être
// tronqué par les overflow:hidden des cards. On le remplace par un nœud
// HTML rattaché au <body>, large (320 px), avec z-index élevé (10000)
// pour passer au-dessus de tous les conteneurs.
function getOrCreateTooltipEl() {
  let el = document.getElementById('df-chart-tooltip')
  if (!el) {
    el = document.createElement('div')
    el.id = 'df-chart-tooltip'
    el.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 10000',
      'background: rgba(33, 33, 33, 0.95)',
      'color: #fff',
      'padding: 10px 12px',
      'border-radius: 8px',
      'font-size: 12px',
      'line-height: 1.4',
      'min-width: 240px',
      'max-width: 360px',
      'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25)',
      'opacity: 0',
      'transform: translate(-50%, -100%)',
      'transition: opacity 0.12s ease',
    ].join(';')
    document.body.appendChild(el)
  }
  return el
}

function externalTooltipHandler(ctx) {
  const { chart, tooltip } = ctx
  const el = getOrCreateTooltipEl()
  if (tooltip.opacity === 0) {
    el.style.opacity = '0'
    return
  }
  const titleLines = tooltip.title || []
  const beforeBody = (tooltip.beforeBody || []).filter(Boolean)
  const bodyLines = (tooltip.body || []).flatMap((b) => b.lines || [])
  const footerLines = tooltip.footer || []
  const colors = (tooltip.labelColors || []).map((c) => c.backgroundColor)

  let html = ''
  if (titleLines.length) {
    // Chaque ligne de titre peut être "nom\u0001badge" → on rend le badge
    // (taux de confiance / PREDICTED) en pastille violette après le nom.
    const renderTitleLine = (line) => {
      const [name, badge] = String(line).split('\u0001')
      const namePart = name ? `<span>${name}</span>` : ''
      const badgePart = badge
        ? `<span style="display:inline-block;background:#a855f7;color:#fff;font-size:10px;font-weight:700;line-height:1.2;padding:2px 8px;border-radius:999px;margin-left:6px;vertical-align:middle;letter-spacing:0.02em;white-space:nowrap;">${badge}</span>`
        : ''
      return namePart + badgePart
    }
    html += `<div style="font-weight:600;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:4px;">${titleLines.map(renderTitleLine).join('<br/>')}</div>`
  }
  if (beforeBody.length) {
    html += `<div style="font-size:11px;opacity:0.85;margin-bottom:6px;">${beforeBody.join('<br/>')}</div>`
  }
  bodyLines.forEach((line, i) => {
    const c = colors[i] || 'transparent'
    html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};flex:0 0 auto;"></span>
      <span style="flex:1;white-space:normal;word-break:break-word;">${line}</span>
    </div>`
  })
  if (footerLines.length) {
    html += `<div style="font-weight:600;margin-top:6px;border-top:1px solid rgba(255,255,255,0.15);padding-top:4px;">${footerLines.join('<br/>')}</div>`
  }
  el.innerHTML = html

  const rect = chart.canvas.getBoundingClientRect()
  el.style.opacity = '1'
  el.style.left = `${rect.left + tooltip.caretX}px`
  el.style.top = `${rect.top + tooltip.caretY - 8}px`
}

onBeforeUnmount(() => {
  // Toujours retirer le tooltip flottant : le composant peut être démonté
  // pendant qu'un tooltip est encore ouvert (clic barre → bascule timeline),
  // auquel cas il resterait orphelin au-dessus de la nouvelle vue.
  const el = document.getElementById('df-chart-tooltip')
  if (el) el.remove()
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  onClick: (_e, elements) => {
    if (!elements || !elements.length) return
    const idx = elements[0].index
    const item = aggregated.value[idx]
    if (!item) return
    if (aggregationMode.value === 'event') {
      emit('event-click', item.id)
    } else {
      emit('period-drilldown', {
        mode: aggregationMode.value,
        key: item.id,
        label: item.eventName,
      })
    }
  },
  onHover: (event, elements) => {
    if (!event?.native?.target) return
    event.native.target.style.cursor = elements?.length ? 'pointer' : 'default'
  },
  plugins: {
    legend: { display: false },
    title: {
      display: true,
      text: chartSubtitle.value,
      align: 'start',
      color: '#757575',
      font: { size: 12, weight: '400' },
    },
    tooltip: {
      enabled: false,
      external: externalTooltipHandler,
      mode: 'index',
      intersect: false,
      callbacks: {
        title: (ctx) => {
          if (!ctx?.length) return ''
          const i = ctx[0].dataIndex
          const e = aggregated.value[i]
          if (!e) return ''
          // Nom de l'event prédit (fallback sur la date si le nom est absent),
          // puis le taux de confiance en badge. Le sentinel \u0001 sépare le nom
          // du badge pour un rendu en pastille dans le tooltip HTML.
          const name = e.eventName || e.eventDate || ''
          let badge = ''
          if (e.isPredictive && e.isLowConfidence) {
            badge = t('anChartTooltipLowConf')
          } else if (e.isPredictive) {
            badge = e.confidenceScore
              ? `${t('anChartTooltipPredictedPrefix')} ${e.confidenceScore}%`
              : t('anChartTooltipPredictedPrefix')
          }
          return badge ? `${name}\u0001${badge}` : name
        },
        beforeBody: (ctx) => {
          if (!ctx?.length) return ''
          const i = ctx[0].dataIndex
          const e = aggregated.value[i]
          if (!e) return ''
          if (aggregationMode.value !== 'event') {
            const n = e.eventCount || 0
            return `${t('anChartTooltipPeriod')} ${e.eventName} — ${n} ${t('anChartTooltipEventSuffix')}`
          }
          return e.eventDate ? `${t('anChartTooltipDate')} ${e.eventDate}` : ''
        },
        label: (item) => {
          if (item.dataset?.type === 'line') {
            return `${t('anChartTooltipCumulRev')} ${formatEuro(item.parsed.y)}`
          }
          return `${item.dataset.label} : ${formatEuro(item.parsed.y)}`
        },
        footer: (ctx) => {
          if (!ctx?.length) return ''
          const i = ctx[0].dataIndex
          const e = aggregated.value[i]
          if (!e) return ''
          const globalShare = formatShare(e.total, globalVisibleTotal.value)
          return `${t('anChartTooltipTotal')} ${formatEuro(e.total)} ${t('anChartTooltipGlobalShare')} ${globalShare}`
        },
      },
    },
  },
  scales: {
    x: {
      stacked: true,
      ticks: {
        maxRotation: 45,
        minRotation: 0,
        font: { size: 10 },
        autoSkip: true,
      },
      grid: { display: false },
    },
    y: {
      stacked: true,
      ticks: {
        callback: (v) =>
          '€' + Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v),
        font: { size: 11 },
      },
      grid: { color: '#EEEEEE' },
      min: 0,
    },
    y1: {
      type: 'linear',
      display: cumulativeAvailable.value && showCumulative.value,
      position: 'right',
      ticks: {
        callback: (v) =>
          '€' + Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v),
        font: { size: 11 },
      },
      grid: { display: false },
      min: 0,
    },
  },
}))

function toggleSort() {
  sortMode.value = sortMode.value === 'date' ? 'revenue' : 'date'
}

function onAverageClick() {
  emit('show-average')
}
</script>

<style scoped>
.chart-title {
  font-size: 16px;
  font-weight: 600;
  color: #212121;
}
.chart-subtitle {
  font-size: 12px;
  color: #9e9e9e;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 6px;
}
.legend-label {
  font-size: 12px;
  color: #424242;
}
.legend-link {
  font-size: 12px;
  color: #5b8def;
  text-decoration: none;
}
.legend-link:hover {
  text-decoration: underline;
}

/* Lot 0.5 — Pills toolbar (mise en forme capture d'écran) :
   boutons blancs arrondis, bordure gris clair, ombre subtile.
   Le toggle « Shops | Menu Types » fusionne les deux boutons en un seul groupe. */
.chart-toolbar :deep(.v-btn) {
  background-color: #ffffff !important;
  border: 1px solid #E5E7EB !important;
  color: #111827 !important;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  text-transform: none;
  font-weight: 500;
  letter-spacing: 0;
  min-height: 34px;
}
.chart-toolbar :deep(.v-btn:hover) {
  background-color: #F9FAFB !important;
  border-color: #D1D5DB !important;
}
.chart-toolbar :deep(.v-btn-toggle) {
  border-radius: 9999px;
  background-color: #ffffff;
  border: 1px solid #E5E7EB;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}
.chart-toolbar :deep(.v-btn-toggle .v-btn) {
  border: none !important;
  box-shadow: none !important;
  background-color: transparent !important;
  border-radius: 0 !important;
}
.chart-toolbar :deep(.v-btn-toggle .v-btn--active) {
  background-color: #F3F4F6 !important;
  color: #111827 !important;
  font-weight: 600;
}
</style>
