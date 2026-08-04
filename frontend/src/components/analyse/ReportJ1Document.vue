<template>
  <!-- Document hors écran capturé par html2canvas (useReportJ1). Position fixe
       hors viewport et NON display:none : un élément non rendu produit un
       canvas vide. Largeur figée au ratio A4 portrait (794×1123).

       Style : décliné de la charte écran (tokens --fs-*/--fw-*/--font-ui de
       style.css, qui cascadent depuis :root), gris slate d'Analyse, liseré
       coloré à GAUCHE des cartes (pattern KpiCard::before), bandeau photo au
       radius 18px du bandeau rouge. Couleurs en hex uniquement (html2canvas),
       séparateurs #e2e8f0 (les hairlines #f1f5f9 fondent en JPEG). -->
  <div id="report-j1-root" class="rj1-offscreen" aria-hidden="true">
    <!-- ─── PAGE 1 : marque + photo + widgets + familles + camembert ─── -->
    <div class="rj1-page">
      <div class="rj1-brand">
        <img :src="logo" class="rj1-brand__logo" alt="" />
        <span class="rj1-brand__name">DataFriday</span>
        <span class="rj1-brand__space">{{ data.space?.name || '—' }}</span>
      </div>

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
          <div v-for="w in actualWidgets" :key="w.label" class="rj1-widget" :style="{ '--rail': w.color }">
            <div class="rj1-widget__value">{{ w.value }}</div>
            <div class="rj1-widget__label">{{ w.label }}</div>
          </div>
        </div>
      </div>

      <div class="rj1-section">
        <div class="rj1-section__title">{{ t('rj1Predicted') }}</div>
        <template v-if="data.predicted">
          <div class="rj1-widgets">
            <div v-for="w in predictedWidgets" :key="w.label" class="rj1-widget rj1-widget--muted" :style="{ '--rail': '#cbd5e1' }">
              <div class="rj1-widget__value">{{ w.value }}</div>
              <div class="rj1-widget__label">{{ w.label }}</div>
            </div>
          </div>
          <!-- Provenance : un PDF se transfère, la source du prévisionnel doit s'y lire —
               surtout quand le scénario vient d'un AUTRE event (appariement nom/date). -->
          <div v-if="predictedSourceLabel" class="rj1-source">{{ predictedSourceLabel }}</div>
        </template>
        <div v-else class="rj1-empty">{{ t('rj1NoPredict') }}</div>
      </div>

      <div v-if="data.diff" class="rj1-section">
        <div class="rj1-section__title">{{ t('rj1Diff') }}</div>
        <div class="rj1-widgets">
          <div
            v-for="w in diffWidgets"
            :key="w.label"
            class="rj1-widget"
            :class="{ 'rj1-widget--up': w.raw != null && w.raw >= 0, 'rj1-widget--down': w.raw != null && w.raw < 0 }"
            :style="{ '--rail': w.raw == null ? '#cbd5e1' : (w.raw >= 0 ? '#10b981' : '#ef4444') }"
          >
            <div class="rj1-widget__value">{{ w.value }}</div>
            <div class="rj1-widget__label">{{ w.label }}</div>
          </div>
        </div>
      </div>

      <div class="rj1-section">
        <div class="rj1-widgets rj1-widgets--3">
          <div class="rj1-widget" :style="{ '--rail': BUCKET_COLORS.Beverage }">
            <div class="rj1-widget__value">{{ formatCurrency(data.buckets.caBeverage) }}</div>
            <div class="rj1-widget__label">{{ t('rj1CaBeverage') }}</div>
          </div>
          <div class="rj1-widget" :style="{ '--rail': BUCKET_COLORS.Food }">
            <div class="rj1-widget__value">{{ formatCurrency(data.buckets.caFood) }}</div>
            <div class="rj1-widget__label">{{ t('rj1CaFood') }}</div>
          </div>
          <div class="rj1-widget" :style="{ '--rail': BUCKET_COLORS.Beer }">
            <div class="rj1-widget__value">{{ formatCurrency(data.buckets.caBeer) }}</div>
            <div class="rj1-widget__label">{{ t('rj1CaBeer') }}</div>
          </div>
        </div>
      </div>

      <div class="rj1-section rj1-section--grow">
        <div class="rj1-section__title">{{ t('rj1CategorySplit') }}</div>
        <div class="rj1-pie">
          <canvas ref="pieCanvas" width="300" height="300"></canvas>
          <div class="rj1-pie__legend">
            <div v-for="slice in pieSlices" :key="slice.label" class="rj1-pie__legend-item">
              <span class="rj1-pie__dot" :style="{ background: slice.color }"></span>
              <span class="rj1-pie__label">{{ slice.label }}</span>
              <span class="rj1-pie__value">{{ formatCurrency(slice.value) }}</span>
              <span class="rj1-pie__pct">{{ slice.pctLabel }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="rj1-footer">{{ t('rj1GeneratedAt') }} {{ generatedAtLabel }} — DataFriday</div>
    </div>

    <!-- ─── PAGE 2 : top 5 par famille ─── -->
    <div class="rj1-page">
      <div class="rj1-brand">
        <img :src="logo" class="rj1-brand__logo" alt="" />
        <span class="rj1-brand__name">DataFriday</span>
        <span class="rj1-brand__space">{{ eventName }}</span>
      </div>

      <div class="rj1-section rj1-tables">
        <div class="rj1-table">
          <div class="rj1-table__title" :style="{ '--rail': BUCKET_COLORS.Beverage }">
            <span class="rj1-table__dot" :style="{ background: BUCKET_COLORS.Beverage }"></span>
            {{ t('rj1TopBeverage') }}
          </div>
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
                <td class="rj1-table__name">{{ item.name }}</td>
                <td class="num">{{ formatNumber(Math.round(item.quantity)) }}</td>
                <td class="num">{{ formatCurrencyDetailed(item.revenue) }}</td>
              </tr>
              <tr v-if="!data.buckets.topBeverage.length">
                <td colspan="3" class="rj1-empty">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="rj1-table">
          <div class="rj1-table__title">
            <span class="rj1-table__dot" :style="{ background: BUCKET_COLORS.Food }"></span>
            {{ t('rj1TopFood') }}
          </div>
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
                <td class="rj1-table__name">{{ item.name }}</td>
                <td class="num">{{ formatNumber(Math.round(item.quantity)) }}</td>
                <td class="num">{{ formatCurrencyDetailed(item.revenue) }}</td>
              </tr>
              <tr v-if="!data.buckets.topFood.length">
                <td colspan="3" class="rj1-empty">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Contexte de génération : un PDF détaché de l'app doit dire d'où il sort. -->
      <div class="rj1-meta">
        <div><span class="rj1-meta__label">{{ t('anExportFilterSpace') }}</span>{{ data.space?.name || '—' }}</div>
        <div><span class="rj1-meta__label">{{ t('anEvents') }}</span>{{ eventName }} — {{ eventDateLabel }}</div>
      </div>

      <div class="rj1-footer">{{ t('rj1GeneratedAt') }} {{ generatedAtLabel }} — DataFriday</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrency, formatCurrencyDetailed, formatNumber, formatVariation } from '@/composables/useFormatters'
import { useNumberFormat } from '@/composables/useNumberFormat'
import logo from '@/assets/datafriday.png'

const props = defineProps({
  /** Objet construit par useReportJ1 (space, event, actual, predicted, diff, buckets…). */
  data: { type: Object, required: true },
})

const { t } = useI18n()
// Tout le document suit la locale de l'app (règle BUG-240 : jamais de fr-FR en
// dur) — montants, pourcentages ET dates via intlLocale.
const { intlLocale, formatPrice, formatPercentLocale } = useNumberFormat()

const imageFailed = ref(false)
const pieCanvas = ref(null)

// Mêmes couleurs que MenuItemRevenueDistribution (donuts de l'écran Analyse) —
// le PDF doit se lire comme une sortie du même outil.
const BUCKET_COLORS = { Food: '#FF8A65', Beverage: '#5B8DEF', Beer: '#FFB74D', Combo: '#66BB6A' }

const eventName = computed(() => props.data.event?.name || props.data.event?.eventName || '—')

const dateFmt = computed(() =>
  new Intl.DateTimeFormat(intlLocale.value, { day: 'numeric', month: 'long', year: 'numeric' }),
)
const timeFmt = computed(() =>
  new Intl.DateTimeFormat(intlLocale.value, { hour: '2-digit', minute: '2-digit' }),
)

const eventDateLabel = computed(() => {
  const parts = []
  if (props.data.eventDate) parts.push(dateFmt.value.format(props.data.eventDate))
  const show = props.data.event?.showTime
  if (show) parts.push(`@ ${show}`)
  return parts.join(' ')
})

const generatedAtLabel = computed(() =>
  props.data.generatedAt
    ? `${dateFmt.value.format(props.data.generatedAt)} ${timeFmt.value.format(props.data.generatedAt)}`
    : '',
)

const predictedSourceLabel = computed(() => {
  const src = props.data.predictedSource
  if (!src) return ''
  const parts = []
  if (src.scenarioName) parts.push(`${t('rj1Scenario')} « ${src.scenarioName} »`)
  if (src.linkedEventName) parts.push(`(${src.linkedEventName})`)
  return parts.join(' ')
})

const DASH = '—'
const fmtOr = (value, fmt) => (value == null ? DASH : fmt(value))

// Mêmes couleurs d'accent que la bande KPI du bandeau (WorkspaceAppHeader).
function widgetRow(src) {
  return [
    { key: 'revenue', label: t('anHeaderKpiRevenue'), color: '#10B981', value: fmtOr(src.revenue, formatCurrency) },
    { key: 'tickets', label: t('rj1Tickets'), color: '#0EA5E9', value: fmtOr(src.tickets, (v) => formatNumber(Math.round(v))) },
    { key: 'perCapita', label: t('anHeaderKpiPerCap'), color: '#EC4899', value: fmtOr(src.perCapita, (v) => formatPrice(v)) },
    { key: 'transformation', label: t('anHeaderKpiTransformation'), color: '#14B8A6', value: fmtOr(src.transformation, (v) => formatPercentLocale(v, 1)) },
    { key: 'basket', label: t('anHeaderKpiBasket'), color: '#A855F7', value: fmtOr(src.basket, (v) => formatPrice(v)) },
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
      value: raw == null ? DASH : `${formatVariation(raw, 1)}`,
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
  return raw.map((s) => ({
    ...s,
    pct: total ? (s.value / total) * 100 : 0,
    pctLabel: formatPercentLocale(total ? (s.value / total) * 100 : 0, 1),
  }))
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
  const total = slices.reduce((a, s) => a + s.pct, 0) || 1
  let angle = -Math.PI / 2
  for (const slice of slices) {
    const span = (slice.pct / total) * Math.PI * 2
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

/* Ratio A4 portrait : 794 × 1123 px. Fond blanc plein pour la capture.
   Police et échelle typographique = tokens de la charte (style.css :root),
   qui cascadent jusque dans ce sous-arbre monté dans le DOM de l'app. */
.rj1-page {
  width: 794px;
  height: 1123px;
  overflow: hidden;
  background: #ffffff;
  color: #1e293b;
  font-family: var(--font-ui);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px 30px;
  box-sizing: border-box;
}

/* ── Barre de marque (lockup des pages auth, sans le fond rosé) ── */
.rj1-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rj1-brand__logo {
  width: 26px;
  height: 26px;
  object-fit: contain;
}
.rj1-brand__name {
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  color: #0f172a;
}
.rj1-brand__space {
  margin-left: auto;
  font-size: var(--fs-sm);
  color: #64748b;
}

/* ── Bandeau photo — radius 18px du bandeau rouge Analyse ── */
.rj1-hero {
  position: relative;
  height: 230px;
  border-radius: 18px;
  overflow: hidden;
  background: #ff3131;
  flex-shrink: 0;
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
  padding: 18px 22px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 35%, rgba(0, 0, 0, 0.65) 100%);
  color: #ffffff;
}
.rj1-hero__space {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.9;
}
.rj1-hero__event {
  font-size: var(--fs-xxl);
  font-weight: var(--fw-bold);
  line-height: 1.15;
}
.rj1-hero__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--fs-base);
  margin-top: 5px;
}
.rj1-hero__weather {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
}

/* ── Sections — titre uppercase + trait rouge (signature du liseré) ── */
.rj1-section {
  flex-shrink: 0;
}
.rj1-section--grow {
  flex: 1;
  min-height: 0;
}
.rj1-section__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin: 0 0 7px;
}
.rj1-section__title::before {
  content: '';
  width: 20px;
  height: 3px;
  border-radius: 2px;
  background: #ff3131;
}

/* ── Widgets KPI — liseré coloré à GAUCHE (pattern KpiCard::before) ── */
.rj1-widgets {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.rj1-widgets--3 {
  grid-template-columns: repeat(3, 1fr);
}
.rj1-widget {
  position: relative;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 9px 8px 9px 13px;
  background: #ffffff;
}
.rj1-widget::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--rail, #64748b);
}
.rj1-widget--muted {
  background: #f8fafc;
}
.rj1-widget--up .rj1-widget__value {
  color: #059669;
}
.rj1-widget--down .rj1-widget__value {
  color: #dc2626;
}
.rj1-widget__value {
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
  color: #0f172a;
  letter-spacing: -0.2px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rj1-widget__label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #64748b;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rj1-source {
  font-size: var(--fs-xs);
  color: #94a3b8;
  margin-top: 5px;
}

.rj1-empty {
  font-size: var(--fs-sm);
  color: #94a3b8;
  font-style: italic;
  padding: 6px 0;
  text-align: center;
}

/* ── Camembert ── */
.rj1-pie {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 40px;
  padding: 6px 0;
}
.rj1-pie canvas {
  width: 220px;
  height: 220px;
}
.rj1-pie__legend {
  display: flex;
  flex-direction: column;
  gap: 9px;
  font-size: var(--fs-base);
}
.rj1-pie__legend-item {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 8px;
  min-width: 280px;
}
.rj1-pie__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.rj1-pie__label {
  color: #1e293b;
}
.rj1-pie__value {
  color: #64748b;
  font-variant-numeric: tabular-nums;
}
.rj1-pie__pct {
  font-weight: var(--fw-bold);
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

/* ── Tables Top 5 — en-tête bande #F9FAFB (pattern MenuItemsByShopTable) ── */
.rj1-tables {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  align-items: start;
}
.rj1-table__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: #0f172a;
  margin-bottom: 7px;
}
.rj1-table__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.rj1-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}
.rj1-table th {
  text-align: left;
  font-weight: var(--fw-medium);
  color: #6b7280;
  background: #f9fafb;
  padding: 7px 9px;
}
.rj1-table td {
  border-bottom: 1px solid #e2e8f0;
  padding: 7px 9px;
  color: #1e293b;
}
.rj1-table__name {
  font-weight: var(--fw-medium);
}
.rj1-table .num {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* ── Métadonnées + pied ── */
.rj1-meta {
  margin-top: auto;
  border-top: 1px solid #e2e8f0;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-sm);
  color: #1e293b;
}
.rj1-meta__label {
  display: inline-block;
  min-width: 90px;
  color: #64748b;
  font-weight: var(--fw-semibold);
}

.rj1-footer {
  flex-shrink: 0;
  font-size: var(--fs-xs);
  color: #94a3b8;
  text-align: center;
  padding-top: 6px;
}
</style>
