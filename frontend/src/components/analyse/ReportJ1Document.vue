<template>
  <!-- Document hors écran capturé par html2canvas (useReportJ1). Position fixe
       hors viewport et NON display:none : un élément non rendu produit un
       canvas vide. Largeur figée au ratio A4 portrait. -->
  <div id="report-j1-root" class="rj1-offscreen" aria-hidden="true">
    <!-- ─── PAGE 1 : photo + widgets réel / prédictif / différence + totaux ─── -->
    <div class="rj1-page">
      <div class="rj1-hero">
        <img
          v-if="data.space?.image && !imageFailed"
          :src="data.space.image"
          crossorigin="anonymous"
          class="rj1-hero__img"
          alt=""
          @error="imageFailed = true"
        />
        <div class="rj1-hero__overlay">
          <div class="rj1-hero__space">{{ data.space?.name || '—' }}</div>
          <div class="rj1-hero__event">{{ eventName }}</div>
          <div class="rj1-hero__meta">
            <span>{{ eventDateLabel }}</span>
            <span v-if="data.weather" class="rj1-hero__weather">
              {{ data.weather.icon }} {{ data.weather.temperature }}°C
            </span>
          </div>
        </div>
      </div>

      <div class="rj1-section">
        <div class="rj1-section__title">{{ t('rj1Real') }}</div>
        <div class="rj1-widgets">
          <div v-for="w in actualWidgets" :key="w.label" class="rj1-widget" :style="{ borderTopColor: w.color }">
            <div class="rj1-widget__value">{{ w.value }}</div>
            <div class="rj1-widget__label">{{ w.label }}</div>
          </div>
        </div>

        <div class="rj1-section__title">{{ t('rj1Predicted') }}</div>
        <div v-if="data.predicted" class="rj1-widgets">
          <div v-for="w in predictedWidgets" :key="w.label" class="rj1-widget rj1-widget--muted">
            <div class="rj1-widget__value">{{ w.value }}</div>
            <div class="rj1-widget__label">{{ w.label }}</div>
          </div>
        </div>
        <div v-else class="rj1-empty">{{ t('rj1NoPredict') }}</div>

        <template v-if="data.diff">
          <div class="rj1-section__title">{{ t('rj1Diff') }}</div>
          <div class="rj1-widgets">
            <div
              v-for="w in diffWidgets"
              :key="w.label"
              class="rj1-widget rj1-widget--diff"
              :class="{ 'rj1-widget--up': w.raw != null && w.raw >= 0, 'rj1-widget--down': w.raw != null && w.raw < 0 }"
            >
              <div class="rj1-widget__value">{{ w.value }}</div>
              <div class="rj1-widget__label">{{ w.label }}</div>
            </div>
          </div>
        </template>
      </div>

      <div class="rj1-section">
        <div class="rj1-widgets rj1-widgets--3">
          <div class="rj1-widget" :style="{ borderTopColor: BUCKET_COLORS.Beverage }">
            <div class="rj1-widget__value">{{ formatCurrency(data.buckets.caBeverage) }}</div>
            <div class="rj1-widget__label">{{ t('rj1CaBeverage') }}</div>
          </div>
          <div class="rj1-widget" :style="{ borderTopColor: BUCKET_COLORS.Food }">
            <div class="rj1-widget__value">{{ formatCurrency(data.buckets.caFood) }}</div>
            <div class="rj1-widget__label">{{ t('rj1CaFood') }}</div>
          </div>
          <div class="rj1-widget" :style="{ borderTopColor: BUCKET_COLORS.Beer }">
            <div class="rj1-widget__value">{{ formatCurrency(data.buckets.caBeer) }}</div>
            <div class="rj1-widget__label">{{ t('rj1CaBeer') }}</div>
          </div>
        </div>
      </div>

      <div class="rj1-footer">{{ t('rj1GeneratedAt') }} {{ generatedAtLabel }} — DataFriday</div>
    </div>

    <!-- ─── PAGE 2 : camembert + top 5 ─── -->
    <div class="rj1-page">
      <div class="rj1-section">
        <div class="rj1-section__title">{{ t('rj1CategorySplit') }}</div>
        <div class="rj1-pie">
          <canvas ref="pieCanvas" width="320" height="320"></canvas>
          <div class="rj1-pie__legend">
            <div v-for="slice in pieSlices" :key="slice.label" class="rj1-pie__legend-item">
              <span class="rj1-pie__dot" :style="{ background: slice.color }"></span>
              <span>{{ slice.label }}</span>
              <span class="rj1-pie__pct">{{ slice.pct }}%</span>
            </div>
          </div>
        </div>
      </div>

      <div class="rj1-section rj1-tables">
        <div class="rj1-table">
          <div class="rj1-table__title" :style="{ color: BUCKET_COLORS.Beverage }">{{ t('rj1TopBeverage') }}</div>
          <table>
            <thead>
              <tr>
                <th>{{ t('rj1Product') }}</th>
                <th class="num">{{ t('anQuantity') }}</th>
                <th class="num">{{ t('anRevenue') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.buckets.topBeverage" :key="item.name">
                <td>{{ item.name }}</td>
                <td class="num">{{ formatNumber(Math.round(item.quantity)) }}</td>
                <td class="num">{{ formatCurrency(item.revenue) }}</td>
              </tr>
              <tr v-if="!data.buckets.topBeverage.length">
                <td colspan="3" class="rj1-empty">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="rj1-table">
          <div class="rj1-table__title" :style="{ color: BUCKET_COLORS.Food }">{{ t('rj1TopFood') }}</div>
          <table>
            <thead>
              <tr>
                <th>{{ t('rj1Product') }}</th>
                <th class="num">{{ t('anQuantity') }}</th>
                <th class="num">{{ t('anRevenue') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.buckets.topFood" :key="item.name">
                <td>{{ item.name }}</td>
                <td class="num">{{ formatNumber(Math.round(item.quantity)) }}</td>
                <td class="num">{{ formatCurrency(item.revenue) }}</td>
              </tr>
              <tr v-if="!data.buckets.topFood.length">
                <td colspan="3" class="rj1-empty">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="rj1-footer">{{ t('rj1GeneratedAt') }} {{ generatedAtLabel }} — DataFriday</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrency, formatNumber } from '@/composables/useFormatters'
import { formatDateLong, formatTime } from '@/utils/dateFr'

const props = defineProps({
  /** Objet construit par useReportJ1 (space, event, actual, predicted, diff, buckets…). */
  data: { type: Object, required: true },
})

const { t } = useI18n()
const imageFailed = ref(false)
const pieCanvas = ref(null)

// Mêmes couleurs que MenuItemRevenueDistribution (donuts de l'écran Analyse) —
// le PDF doit se lire comme une sortie du même outil.
const BUCKET_COLORS = { Food: '#FF8A65', Beverage: '#5B8DEF', Beer: '#FFB74D', Combo: '#66BB6A' }

const eventName = computed(() => props.data.event?.name || props.data.event?.eventName || '—')

const eventDateLabel = computed(() => {
  const parts = []
  if (props.data.eventDate) parts.push(formatDateLong(props.data.eventDate))
  const show = props.data.event?.showTime
  if (show) parts.push(`@ ${show}`)
  return parts.join(' ')
})

const generatedAtLabel = computed(() =>
  props.data.generatedAt
    ? `${formatDateLong(props.data.generatedAt)} ${formatTime(props.data.generatedAt)}`
    : '',
)

const DASH = '—'
const fmtOr = (value, fmt) => (value == null ? DASH : fmt(value))
const pct1 = (v) => `${v.toFixed(1).replace('.', ',')} %`

function widgetRow(src) {
  return [
    { key: 'revenue', label: t('anHeaderKpiRevenue'), color: '#10B981', value: fmtOr(src.revenue, formatCurrency) },
    { key: 'tickets', label: t('rj1Tickets'), color: '#0EA5E9', value: fmtOr(src.tickets, (v) => formatNumber(Math.round(v))) },
    { key: 'perCapita', label: t('anHeaderKpiPerCap'), color: '#EC4899', value: fmtOr(src.perCapita, (v) => formatCurrency(v, 'EUR', 'fr-FR', 2)) },
    { key: 'transformation', label: t('anHeaderKpiTransformation'), color: '#14B8A6', value: fmtOr(src.transformation, pct1) },
    { key: 'basket', label: t('anHeaderKpiBasket'), color: '#A855F7', value: fmtOr(src.basket, (v) => formatCurrency(v, 'EUR', 'fr-FR', 2)) },
  ]
}

const actualWidgets = computed(() => widgetRow(props.data.actual || {}))
const predictedWidgets = computed(() => widgetRow(props.data.predicted || {}))

const diffWidgets = computed(() => {
  const d = props.data.diff || {}
  return actualWidgets.value.map((w) => {
    const raw = d[w.key]
    return {
      label: w.label,
      raw,
      value: raw == null ? DASH : `${raw >= 0 ? '+' : ''}${raw.toFixed(1).replace('.', ',')} %`,
    }
  })
})

// Camembert type Food / Beverage (+ Combo si présent). « Beverage » inclut la
// bière (même règle que les totaux — cf. useReportJ1.computeBucketData).
const pieSlices = computed(() => {
  const b = props.data.buckets || {}
  const raw = [
    { label: t('rj1CaBeverage'), value: b.caBeverage || 0, color: BUCKET_COLORS.Beverage },
    { label: t('rj1CaFood'), value: b.caFood || 0, color: BUCKET_COLORS.Food },
    { label: 'Combo', value: b.caCombo || 0, color: BUCKET_COLORS.Combo },
  ].filter((s) => s.value > 0)
  const total = raw.reduce((a, s) => a + s.value, 0)
  return raw.map((s) => ({ ...s, pct: total ? ((s.value / total) * 100).toFixed(1).replace('.', ',') : '0' }))
})

// Dessin manuel (arcs 2D) et non Chart.js : rendu synchrone et déterministe —
// html2canvas capture le canvas tel quel, sans dépendre d'une animation ou d'un
// cycle de layout de la lib.
function drawPie() {
  const canvas = pieCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  const r = Math.min(cx, cy) - 8
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const slices = pieSlices.value
  const total = slices.reduce((a, s) => a + Number(String(s.pct).replace(',', '.')), 0) || 1
  let angle = -Math.PI / 2
  for (const slice of slices) {
    const span = (Number(String(slice.pct).replace(',', '.')) / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, angle, angle + span)
    ctx.closePath()
    ctx.fillStyle = slice.color
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    angle += span
  }
}

onMounted(drawPie)
</script>

<style scoped>
.rj1-offscreen {
  position: fixed;
  top: 0;
  left: -2000px;
  width: 794px;
  z-index: -1;
  pointer-events: none;
}

/* Ratio A4 portrait : 794 × 1123 px. Fond blanc plein pour la capture. */
.rj1-page {
  width: 794px;
  min-height: 1123px;
  background: #ffffff;
  color: #1e293b;
  font-family: 'Inter', 'Roboto', sans-serif;
  display: flex;
  flex-direction: column;
  padding: 24px 28px;
  box-sizing: border-box;
}

.rj1-hero {
  position: relative;
  height: 260px;
  border-radius: 16px;
  overflow: hidden;
  background: #ff3131;
  margin-bottom: 20px;
}
.rj1-hero__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rj1-hero__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 20px 24px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.65) 100%);
  color: #ffffff;
}
.rj1-hero__space {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.9;
}
.rj1-hero__event {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
}
.rj1-hero__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  margin-top: 6px;
}
.rj1-hero__weather {
  font-size: 15px;
  font-weight: 600;
}

.rj1-section {
  margin-bottom: 18px;
}
.rj1-section__title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin: 14px 0 8px;
}

.rj1-widgets {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
.rj1-widgets--3 {
  grid-template-columns: repeat(3, 1fr);
}
.rj1-widget {
  border: 1px solid #e2e8f0;
  border-top: 3px solid #94a3b8;
  border-radius: 10px;
  padding: 10px 8px;
  text-align: center;
  background: #ffffff;
}
.rj1-widget--muted {
  background: #f8fafc;
  border-top-color: #cbd5e1;
}
.rj1-widget--diff {
  border-top-color: #94a3b8;
}
.rj1-widget--up {
  border-top-color: #10b981;
}
.rj1-widget--up .rj1-widget__value {
  color: #059669;
}
.rj1-widget--down {
  border-top-color: #ef4444;
}
.rj1-widget--down .rj1-widget__value {
  color: #dc2626;
}
.rj1-widget__value {
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
}
.rj1-widget__label {
  font-size: 10px;
  color: #64748b;
  margin-top: 3px;
}

.rj1-empty {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  padding: 8px 0;
  text-align: center;
}

.rj1-pie {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 36px;
  padding: 10px 0;
}
.rj1-pie__legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.rj1-pie__legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rj1-pie__dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}
.rj1-pie__pct {
  font-weight: 700;
}

.rj1-tables {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.rj1-table__title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}
.rj1-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.rj1-table th {
  text-align: left;
  font-weight: 600;
  color: #64748b;
  border-bottom: 2px solid #e2e8f0;
  padding: 6px 8px;
}
.rj1-table td {
  border-bottom: 1px solid #f1f5f9;
  padding: 6px 8px;
}
.rj1-table .num {
  text-align: right;
  white-space: nowrap;
}

.rj1-footer {
  margin-top: auto;
  font-size: 10px;
  color: #94a3b8;
  text-align: center;
  padding-top: 12px;
}
</style>
