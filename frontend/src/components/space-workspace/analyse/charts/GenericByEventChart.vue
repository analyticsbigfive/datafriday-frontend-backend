<template>
  <v-card flat rounded="lg" class="pa-5 mb-4" :class="{ 'gbe--dark': isDark }">
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
    <EventMetricFooter
      v-if="isRendementMetric"
      :color="rendementColor"
      :show-draft-legend="metric === 'stockValue'"
      :message="rendementMessage"
      :excluded="rendementExcluded"
    />
  </v-card>
</template>

<script setup>
import { Bar } from 'vue-chartjs'
import { computed, ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import '@/lib/chartjs'
import { formatCurrency, formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { itemLevelTotalsByEvent, eventMarginPct } from '@/utils/analyseAggregations'
import { useI18n } from '@/i18n/useI18n'
import EventMetricFooter from './EventMetricFooter.vue'

const { t } = useI18n()

// Chart.js peint sur <canvas> : hors du CSS, donc insensible au thème. On dérive
// grille + ticks de `isDark` (cf. EventTimelineChart). `chartOptions` étant un
// computed, tout changement de thème le recalcule et vue-chartjs re-rend.
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)
// Valeurs claires inchangées : '#EEEEEE' (grille) et undefined (défaut Chart.js).
const gridColor = computed(() => (isDark.value ? 'rgba(255,255,255,0.08)' : '#EEEEEE'))
const tickColor = computed(() => (isDark.value ? '#94a3b8' : undefined))

const props = defineProps({
  records: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  eventAggregates: { type: Array, default: () => [] },
  costMap: { type: Object, default: () => ({}) },
  initialMetric: { type: String, default: 'revenue' },
  // Métriques rendement (useRendementWidgets.chartMetrics) : par métrique
  // { status: 'ready'|'blocked'|'unresolved'|'error'|'loading', rows: Map<eventId, {value, reason, draft}> }.
  extraMetrics: { type: Object, default: () => ({}) },
})

const METRICS = computed(() => [
  { key: 'revenue',        label: t('anMetricCA'),           format: formatCurrency },
  { key: 'cost',           label: t('anMetricCost'),         format: formatCurrency },
  { key: 'transactions',   label: t('anMetricTransactions'), format: formatNumber },
  { key: 'attendees',      label: t('anMetricAttendees'),    format: formatNumber },
  // Panier moyen + per-cap : ratios par ticket/transaction → 2 décimales
  // (parité avec les KPI Analyse, qui passent déjà `digits = 2`).
  { key: 'avgTransaction', label: t('anMetricAvgBasket'),    format: formatCurrencyDetailed },
  { key: 'perCap',         label: t('anMetricPerCap'),       format: formatCurrencyDetailed },
  { key: 'transferRate',   label: t('anMetricTransferRate'), format: (v) => `${v.toFixed(1)}%` },
  { key: 'margin',         label: t('anMetricMargin'),       format: (v) => `${v.toFixed(1)}%` },
  // Rendement : CA / TPE, CA / collaborateur (effectifs saisis par event) et
  // valorisation du stock compté dans la dernière feuille post-event.
  { key: 'revenuePerTpe',          label: t('anMetricRevenuePerTpe'),          format: formatCurrency },
  { key: 'revenuePerCollaborator', label: t('anMetricRevenuePerCollaborator'), format: formatCurrency },
  { key: 'stockValue',             label: t('anMetricStockValue'),             format: formatCurrency },
])

const RENDEMENT_METRICS = ['revenuePerTpe', 'revenuePerCollaborator', 'stockValue']
const isRendementMetric = computed(() => RENDEMENT_METRICS.includes(metric.value))
const rendementState = computed(() => (isRendementMetric.value ? props.extraMetrics?.[metric.value] || null : null))
const rendementRow = (row) => rendementState.value?.rows?.get(String(row.eventId)) || null

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
    subtitle: metric.value === 'stockValue'
      ? t('anRdtStockReportSubtitle')
      : `${eventRows.value.length} ${t('anChartEventCount')} ${t('anChartDisplayLabel')} ${m.label.toLowerCase()}`,
  }
})

// Map eventId -> { name, date } depuis props.events — même repli que
// EventRevenueByShopChart.eventMetaById : les records shop-level peuvent porter
// eventName = eventId brut (BUG-123-01) ou aucun nom → jamais d'id brut à l'écran.
const eventMetaById = computed(() => {
  const m = new Map()
  for (const ev of props.events || []) {
    if (ev?.id == null && ev?.eventId == null) continue
    m.set(String(ev.id ?? ev.eventId), {
      name: ev.name || ev.eventName || '',
      date: ev.date || ev.eventDate || '',
    })
  }
  return m
})

// BUG-123-01 : un « nom » égal à l'id du record est un id brut, pas un libellé.
function safeEventName(name, id) {
  return name && String(name) !== String(id) ? name : ''
}

// BUG-298-01 : `props.records` porte le grain ARTICLE (event-timeline) quand il
// est chargé — seule source d'où un coût peut sortir. Voir
// `itemLevelTotalsByEvent` pour pourquoi les agrégats shop-level n'en ont pas.
const itemTotalsByEvent = computed(() =>
  itemLevelTotalsByEvent(props.records, props.costMap || {})
)

const eventRows = computed(() => {
  if (Array.isArray(props.eventAggregates) && props.eventAggregates.length) {
    // BUG-298-01 : les agrégats viennent du getter store, bâti sur du shop-level
    // → `cost` y est nul pour TOUS les events (barres plates alors que le KPI
    // COÛT affiche un montant). On superpose le coût item-level quand il est
    // disponible ; sinon on ne touche à rien (chargement asynchrone en cours).
    // Seul `cost` est réécrit. La marge par event suit la formule du KPI MARGE
    // (CA de l'event, coût item-level) : `costKnown` dit si ce coût existe, sans
    // quoi la marge reste null (jamais une fausse marge de 100 %).
    const totals = itemTotalsByEvent.value
    return props.eventAggregates.map((row) => {
      const withCost = totals.has(row.eventId)
        ? { ...row, cost: totals.get(row.eventId).cost, costKnown: true }
        : { ...row, costKnown: false }
      return { ...withCost, margin: eventMarginPct(withCost) }
    })
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
      costKnown: false,
    })
  }

  const costMapLoaded = Object.keys(costMap).length > 0
  for (const record of props.records || []) {
    if (!record?.eventId) continue
    if (!byEvent.has(record.eventId)) {
      const meta = eventMetaById.value.get(String(record.eventId))
      byEvent.set(record.eventId, {
        eventId: record.eventId,
        eventName: safeEventName(record.eventName, record.eventId) || meta?.name || '',
        eventDate: record.eventDate || meta?.date || null,
        attendees: 0,
        revenue: 0,
        cost: 0,
        transactions: 0,
        costKnown: false,
      })
    }
    const entry = byEvent.get(record.eventId)
    // Coût connu seulement avec le grain article (menuItemId) et le catalogue chargé.
    if (record.menuItemId && costMapLoaded) entry.costKnown = true
    const quantity = record.quantity || 0
    entry.revenue += record.revenue || 0
    entry.cost += (costMap[record.menuItemId] || 0) * quantity
    entry.transactions += record.transactionCount || 0
    if (!entry.eventName) entry.eventName = safeEventName(record.eventName, record.eventId)
    if (!entry.eventDate && record.eventDate) entry.eventDate = record.eventDate
  }

  return Array.from(byEvent.values()).map((row) => ({
    ...row,
    avgTransaction: row.transactions ? row.revenue / row.transactions : 0,
    perCap: row.attendees ? row.revenue / row.attendees : 0,
    transferRate: row.attendees ? (row.transactions / row.attendees) * 100 : 0,
    margin: eventMarginPct(row),
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
    // null = coût inconnu pour cet event : pas de barre plutôt qu'une fausse marge.
    case 'margin':         return row.margin ?? null
    // Rendement : null = event exclu (effectif ou feuille absente) ; tant que l'état
    // n'est pas 'ready' (chargement, filtre PdV, erreur) aucune barre, jamais de repli.
    case 'revenuePerTpe':
    case 'revenuePerCollaborator':
    case 'stockValue':
      return rendementState.value?.status === 'ready' ? (rendementRow(row)?.value ?? null) : null
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
  margin: { r: 59, g: 130, b: 246 },         // blue (couleur du KPI MARGE)
  revenue: { r: 16, g: 185, b: 129 },        // green
  cost: { r: 239, g: 68, b: 68 },            // red
  transactions: { r: 59, g: 130, b: 246 },   // blue
  attendees: { r: 14, g: 165, b: 233 },      // sky
  avgTransaction: { r: 168, g: 85, b: 247 }, // purple
  perCap: { r: 236, g: 72, b: 153 },         // pink
  transferRate: { r: 20, g: 184, b: 166 },   // teal
  revenuePerTpe: { r: 14, g: 165, b: 233 },          // sky (couleur du widget CA / TPE)
  revenuePerCollaborator: { r: 236, g: 72, b: 153 }, // pink (widget CA / collaborateur)
  stockValue: { r: 16, g: 185, b: 129 },             // emerald (widget Valorisation stock)
}

const rendementColor = computed(() => {
  const c = METRIC_COLORS[metric.value]
  return c ? `rgb(${c.r}, ${c.g}, ${c.b})` : '#10B981'
})

// Message d'état du pied de graphe + events exclus (valeur absente) avec leur raison.
const REASON_KEYS = {
  'no-tpe': 'anRdtReasonNoTpe',
  'no-collaborators': 'anRdtReasonNoCollaborator',
  'no-post-event-sheet': 'anRdtReasonNoSheet',
}
const rendementMessage = computed(() => {
  switch (rendementState.value?.status) {
    case 'blocked': return t('anRdtReportBlockedShop')
    case 'unresolved': return t('anRdtReportUnresolved')
    case 'error': return t('anRdtReportError')
    case 'loading': return t('anRdtReportLoading')
    default: return ''
  }
})
const rendementExcluded = computed(() => {
  if (rendementState.value?.status !== 'ready') return []
  return eventRows.value
    .map((row) => ({ row, info: rendementRow(row) }))
    .filter(({ info }) => info && info.value == null)
    .map(({ row, info }) => ({
      name: safeEventName(row.eventName, row.eventId) || row.name || eventMetaById.value.get(String(row.eventId))?.name || '',
      reason: t(REASON_KEYS[info.reason] || 'anRdtReasonNoSheet'),
    }))
})

const chartData = computed(() => {
  // Valeur null (marge d'un event sans coût connu) : triée en dernier, sans barre.
  const sortValue = (row) => valueForEvent(row) ?? -Infinity
  const sortedEvents = [...eventRows.value].sort((a, b) =>
    sortMode.value === 'value'
      ? sortValue(b) - sortValue(a)
      : rowDateValue(a) - rowDateValue(b)
  )
  const values = sortedEvents.map((e) => valueForEvent(e))
  const known = values.filter((v) => v != null)
  const max = Math.max(0, ...known)
  const min = Math.min(0, ...known)
  const span = max - min || 1
  const c = METRIC_COLORS[metric.value] || { r: 124, g: 77, b: 255 }
  const colors = values.map((v, i) => {
    // Valorisation stock : feuille finale pleine, brouillon nettement plus clair
    // (la légende du pied de graphe l'explique), pas d'opacité liée à l'importance.
    if (metric.value === 'stockValue') {
      const draft = rendementRow(sortedEvents[i])?.draft
      return `rgba(${c.r}, ${c.g}, ${c.b}, ${draft ? 0.4 : 1})`
    }
    // Lot 0.5 — opacité proportionnelle à l'importance (0.25 → 1.0)
    const ratio = ((v ?? min) - min) / span
    const alpha = 0.25 + ratio * 0.75
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha.toFixed(3)})`
  })
  return {
    // BUG-123-01 : plus de repli e.eventId — un id brut n'est jamais un libellé d'axe.
    labels: sortedEvents.map(
      (e) => safeEventName(e.eventName, e.eventId) || e.name || eventMetaById.value.get(String(e.eventId))?.name || ''
    ),
    datasets: [
      {
        label: METRICS.value.find((m) => m.key === metric.value).label,
        data: values,
        backgroundColor: colors,
        // Lu par le tooltip : feuille brouillon de la valorisation stock.
        draftFlags: sortedEvents.map((e) => !!rendementRow(e)?.draft),
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
    // BUG-284 : 1000 ms (défaut Chart.js) → 200 ms — chaque changement de filtre
    // ré-anime tous les charts en concurrence avec les recalculs.
    animation: { duration: 200 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const draft = metric.value === 'stockValue' && ctx.dataset.draftFlags?.[ctx.dataIndex]
            return ` ${m.format(ctx.parsed.y)}${draft ? ` · ${t('anRdtDraftLabel')}` : ''}`
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { maxRotation: 60, minRotation: 30, font: { size: 10 }, color: tickColor.value },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { callback: (v) => m.format(v), color: tickColor.value },
        grid: { color: gridColor.value },
      },
    },
  }
})
</script>

<style scoped>
.section-title {
  font-size: var(--fs-md);
  font-weight: 600;
  color: #212121;
}
.section-subtitle {
  font-size: var(--fs-sm);
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
  font-size: var(--fs-sm);
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

/* ── Dark mode (autonome via isDark) : overrides additifs des couleurs claires
   en dur. Mode clair inchangé. Grille/ticks du canvas pilotés en JS. ── */
.gbe--dark .section-title {
  color: #f9fafb;
}
.gbe--dark .section-subtitle {
  color: #94a3b8;
}
.gbe--dark .sort-toggle {
  border-color: rgba(255, 255, 255, 0.14);
}
.gbe--dark .sort-toggle :deep(.v-btn) {
  color: #94a3b8;
}
.gbe--dark .sort-toggle :deep(.v-btn--active) {
  background: rgba(255, 255, 255, 0.12);
  color: #f9fafb;
}
</style>
