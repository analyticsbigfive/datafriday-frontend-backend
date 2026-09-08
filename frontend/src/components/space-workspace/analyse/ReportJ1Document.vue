<template>
  <!-- Document hors écran capturé par html2canvas (useReportJ1). Position fixe
       hors viewport et NON display:none : un élément non rendu produit un canvas
       vide. Largeur figée au ratio A4 portrait (794×1123).

       Refonte template Bertrand (2026-09) : 6 KPIs réels, deux camemberts
       (par type / par catégorie), top 5 en cartes classées. Couleurs en hex
       (html2canvas ne lit pas oklch), séparateurs #e2e8f0. -->
  <div id="report-j1-root" class="rj1-offscreen" aria-hidden="true">
    <div class="rj1-page">
      <!-- ── Marque ── -->
      <div class="rj1-brand">
        <img :src="logo" class="rj1-brand__logo" alt="" />
        <span class="rj1-brand__name">DataFriday</span>
        <span class="rj1-brand__space">{{ spaceLabel }}</span>
      </div>

      <!-- ── Hero photo ── -->
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
          <div class="rj1-hero__event">{{ eventName }}</div>
          <div class="rj1-hero__meta">
            <span>{{ eventDateLabel }}</span>
            <span v-if="weatherLabel" class="rj1-hero__weather">{{ weatherLabel }}</span>
          </div>
        </div>
      </div>

      <!-- ── 6 KPIs réels ── -->
      <div class="rj1-kpis">
        <div v-for="k in kpiWidgets" :key="k.label" class="rj1-kpi" :style="{ '--rail': k.color }">
          <div class="rj1-kpi__label">{{ k.label }}</div>
          <div class="rj1-kpi__value">{{ k.value }}</div>
        </div>
      </div>

      <!-- ── Catégories de vente : 2 camemberts ── -->
      <div class="rj1-card rj1-cats">
        <div class="rj1-card__title">{{ t('rj1SalesCategories') }}</div>
        <div class="rj1-cats__grid">
          <div class="rj1-cats__col">
            <div class="rj1-cats__sub">{{ t('rj1ByType') }}</div>
            <div class="rj1-mini-cards">
              <div v-for="c in typeCards" :key="c.label" class="rj1-mini" :style="{ '--rail': c.color }">
                <div class="rj1-mini__label">{{ truncate(c.label, 14) }}</div>
                <div class="rj1-mini__value">{{ formatCurrency(c.value) }}</div>
              </div>
            </div>
            <div class="rj1-donut">
              <canvas ref="typeCanvas" width="300" height="300"></canvas>
              <ul class="rj1-legend">
                <li v-for="s in typeSlices" :key="s.label" class="rj1-legend__item">
                  <span class="rj1-legend__label"><span class="rj1-legend__bullet" :style="{ color: s.color }">●</span>{{ truncate(s.label, 12) }}</span>
                  <span class="rj1-legend__pct">{{ s.pctLabel }}</span>
                </li>
              </ul>
            </div>
          </div>

          <div class="rj1-cats__col">
            <div class="rj1-cats__sub">{{ t('rj1ByCategory') }}</div>
            <div class="rj1-mini-cards">
              <div v-for="c in categoryCards" :key="c.label" class="rj1-mini" :style="{ '--rail': c.color }">
                <div class="rj1-mini__label">{{ truncate(c.label, 14) }}</div>
                <div class="rj1-mini__value">{{ formatCurrency(c.value) }}</div>
              </div>
            </div>
            <div class="rj1-donut">
              <canvas ref="categoryCanvas" width="300" height="300"></canvas>
              <ul class="rj1-legend">
                <li v-for="s in categorySlices" :key="s.label" class="rj1-legend__item">
                  <span class="rj1-legend__label"><span class="rj1-legend__bullet" :style="{ color: s.color }">●</span>{{ truncate(s.label, 14) }}</span>
                  <span class="rj1-legend__pct">{{ s.pctLabel }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Top 5 en cartes classées ── -->
      <div class="rj1-tops">
        <div class="rj1-top">
          <div class="rj1-top__title">{{ t('rj1TopBeverage') }}</div>
          <div v-for="(item, idx) in data.buckets.topBeverage" :key="item.name" class="rj1-rank">
            <img class="rj1-rank__num" :src="rankBadge(idx)" width="20" height="20" alt="" />
            <div class="rj1-rank__body">
              <div class="rj1-rank__row">
                <span class="rj1-rank__name">{{ truncate(item.name, 24) }}</span>
                <span class="rj1-rank__val">{{ formatCurrencyDetailed(item.revenue) }}</span>
              </div>
              <div class="rj1-rank__units">{{ formatNumber(Math.round(item.quantity)) }} {{ t('anUnits') }}</div>
              <div class="rj1-rank__bar"><i :style="{ width: barWidth(item.revenue, maxBeverage) }"></i></div>
            </div>
          </div>
          <div v-if="!data.buckets.topBeverage.length" class="rj1-empty">—</div>
        </div>

        <div class="rj1-top">
          <div class="rj1-top__title">{{ t('rj1TopFood') }}</div>
          <div v-for="(item, idx) in data.buckets.topFood" :key="item.name" class="rj1-rank">
            <img class="rj1-rank__num" :src="rankBadge(idx)" width="20" height="20" alt="" />
            <div class="rj1-rank__body">
              <div class="rj1-rank__row">
                <span class="rj1-rank__name">{{ truncate(item.name, 24) }}</span>
                <span class="rj1-rank__val">{{ formatCurrencyDetailed(item.revenue) }}</span>
              </div>
              <div class="rj1-rank__units">{{ formatNumber(Math.round(item.quantity)) }} {{ t('anUnits') }}</div>
              <div class="rj1-rank__bar"><i :style="{ width: barWidth(item.revenue, maxFood) }"></i></div>
            </div>
          </div>
          <div v-if="!data.buckets.topFood.length" class="rj1-empty">—</div>
        </div>
      </div>

      <div class="rj1-footer">{{ t('rj1GeneratedAt') }} {{ generatedAtLabel }} — DataFriday</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrency, formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { useNumberFormat } from '@/composables/useNumberFormat'
import { weatherLabelKey } from '@/utils/eventWeather'
import logo from '@/assets/datafriday.png'

const props = defineProps({
  /** Objet construit par useReportJ1 (space, event, actual, buckets…). */
  data: { type: Object, required: true },
})

const { t } = useI18n()
// Locale de l'app (règle BUG-240 : jamais de fr-FR en dur) — montants, % ET dates.
const { intlLocale, formatPrice, formatPercentLocale } = useNumberFormat()

const imageFailed = ref(false)
const typeCanvas = ref(null)
const categoryCanvas = ref(null)

// Palette de tranches — hex uniquement (html2canvas). Couleurs fixes pour les
// familles connues, cycle déterministe pour le reste (index de tri stable).
const KNOWN_COLORS = {
  BEVERAGE: '#5B8DEF', BEVERAGES: '#5B8DEF',
  NOURRITURE: '#FF8A65', FOOD: '#FF8A65',
  PACKAGING: '#66BB6A', COMBO: '#66BB6A',
  BEER: '#FFB74D', SOFT: '#0EA5E9',
}
const PALETTE = [
  '#5B8DEF', '#FF8A65', '#66BB6A', '#FFB74D', '#A855F7',
  '#0EA5E9', '#EC4899', '#14B8A6', '#F59E0B', '#EF4444',
  '#8B5CF6', '#10B981', '#6366F1', '#F97316', '#06B6D4',
  '#D946EF', '#84CC16', '#F43F5E', '#3B82F6', '#22C55E',
]
function colorFor(label, i) {
  return KNOWN_COLORS[String(label || '').toUpperCase()] || PALETTE[i % PALETTE.length]
}

const spaceLabel = computed(() => (props.data.space?.name || '—').toUpperCase())
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

// Météo : icône + libellé texte (table code WMO → i18n) + température.
const weatherLabel = computed(() => {
  const w = props.data.weather
  if (!w) return ''
  const key = weatherLabelKey(w.code)
  const desc = key ? t(key) : ''
  return `${w.icon || ''} ${desc} · ${w.temperature}°`.replace(/\s+/g, ' ').trim()
})

const DASH = '—'
const fmtOr = (value, fmt) => (value == null ? DASH : fmt(value))

// Troncature CÔTÉ JS (ajout « … ») plutôt que CSS text-overflow:ellipsis :
// html2canvas rogne le haut des glyphes de tout élément `overflow:hidden`, quel
// que soit le padding. On coupe donc la chaîne en amont et on supprime tout
// overflow:hidden du rendu — le bug ne peut plus se produire.
function truncate(str, max) {
  const s = String(str ?? '')
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

// 6 KPIs réels — ordre et libellés de la maquette Bertrand.
const kpiWidgets = computed(() => {
  const a = props.data.actual || {}
  return [
    { label: t('anHeaderKpiRevenue'), color: '#10B981', value: fmtOr(a.revenue, formatCurrency) },
    { label: t('anHeaderKpiTransactions'), color: '#3B82F6', value: fmtOr(a.transactions, (v) => formatNumber(Math.round(v))) },
    { label: t('anHeaderKpiBasket'), color: '#A855F7', value: fmtOr(a.basket, (v) => formatPrice(v)) },
    { label: t('anHeaderKpiAttendees'), color: '#0EA5E9', value: fmtOr(a.tickets, (v) => formatNumber(Math.round(v))) },
    { label: t('anHeaderKpiTransformation'), color: '#14B8A6', value: fmtOr(a.transformation, (v) => formatPercentLocale(v, 1)) },
    { label: t('anHeaderKpiPerCap'), color: '#EC4899', value: fmtOr(a.perCapita, (v) => formatPrice(v)) },
  ]
})

// Tranches (déjà triées desc par le composable) + couleur + %.
const UNATTACHED_COLOR = '#B0BEC5' // gris « Non rattaché » (parité écran Analyse).
function toSlices(rows) {
  const list = rows || []
  const total = list.reduce((a, s) => a + (s.value || 0), 0) || 1
  return list.map((s, i) => ({
    // « Non rattaché » relibellé + gris (sentinelle des ventes non mappées).
    label: s.unattached ? t('rj1Unattached') : s.label,
    unattached: !!s.unattached,
    value: s.value,
    color: s.unattached ? UNATTACHED_COLOR : colorFor(s.label, i),
    pctLabel: formatPercentLocale((s.value / total) * 100, 1),
  }))
}
const typeSlices = computed(() => toSlices(props.data.buckets?.byType))
const categorySlices = computed(() => toSlices(props.data.buckets?.byCategory))
// 3 cartes CA au-dessus de chaque camembert (les plus gros postes).
const typeCards = computed(() => typeSlices.value.slice(0, 3))
const categoryCards = computed(() => categorySlices.value.slice(0, 3))

// Barres des tops : part relative au 1er (= plus gros CA de la famille).
const maxBeverage = computed(() =>
  (props.data.buckets?.topBeverage || []).reduce((m, s) => Math.max(m, s.revenue || 0), 0) || 1,
)
const maxFood = computed(() =>
  (props.data.buckets?.topFood || []).reduce((m, s) => Math.max(m, s.revenue || 0), 0) || 1,
)
function barWidth(value, max) {
  return `${Math.max(3, Math.min(100, ((Number(value) || 0) / max) * 100))}%`
}

// Rang 1 doré, 2/3 argentés, reste gris (parité leaderboard écran).
function rankColor(idx) {
  if (idx === 0) return '#F5C518'
  if (idx === 1 || idx === 2) return '#94A3B8'
  return '#CBD5E1'
}

// Badge de rang en SVG (rasterisé par html2canvas → numéro PARFAITEMENT centré,
// contrairement au centrage CSS d'un texte que html2canvas décale).
function rankBadge(idx) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">`
    + `<circle cx="10" cy="10" r="10" fill="${rankColor(idx)}"/>`
    + `<text x="10" y="10" text-anchor="middle" dominant-baseline="central" `
    + `font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" fill="#ffffff">${idx + 1}</text>`
    + `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Texte lisible sur une part : sombre sur couleur claire, blanc sinon (luminance).
function textColorOn(hex) {
  const h = String(hex || '').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return '#0f172a'
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? '#0f172a' : '#ffffff'
}

// Donut : dessin manuel (arcs 2D), rendu synchrone → html2canvas capture net.
// showLabels → % écrits sur les parts (donut « fin » sans légende texte).
function drawDonut(canvas, slices, showLabels = false) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  const r = Math.min(cx, cy) - 6
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const total = slices.reduce((a, s) => a + (s.value || 0), 0) || 1
  let angle = -Math.PI / 2
  for (const slice of slices) {
    const span = ((slice.value || 0) / total) * Math.PI * 2
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
  // Trou central → anneau (donut).
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // % sur les parts assez grandes (≥ 4 %) pour rester lisible.
  if (showLabels) {
    const labelR = r * 0.79
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 22px sans-serif'
    let a = -Math.PI / 2
    for (const slice of slices) {
      const span = ((slice.value || 0) / total) * Math.PI * 2
      const pct = ((slice.value || 0) / total) * 100
      if (pct >= 4) {
        const mid = a + span / 2
        ctx.fillStyle = textColorOn(slice.color)
        ctx.fillText(slice.pctLabel, cx + Math.cos(mid) * labelR, cy + Math.sin(mid) * labelR)
      }
      a += span
    }
  }
}

onMounted(() => {
  drawDonut(typeCanvas.value, typeSlices.value)
  drawDonut(categoryCanvas.value, categorySlices.value)
})
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
.rj1-page {
  width: 794px;
  height: 1123px;
  overflow: hidden;
  background: #ffffff;
  color: #1e293b;
  font-family: var(--font-ui);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px 26px;
  box-sizing: border-box;
  /* html2canvas rogne le haut des glyphes sur du texte `overflow:hidden` au
     line-height serré : on aère la base (1.4) — la page a de la marge en bas. */
  line-height: 1.4;
}

/* ── Marque ── */
.rj1-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rj1-brand__logo { width: 24px; height: 24px; object-fit: contain; }
.rj1-brand__name { font-size: var(--fs-md); font-weight: var(--fw-bold); color: #0f172a; }
.rj1-brand__space { margin-left: auto; font-size: var(--fs-sm); font-weight: var(--fw-semibold); letter-spacing: 0.06em; color: #64748b; }

/* ── Hero ── */
.rj1-hero {
  position: relative;
  height: 150px;
  border-radius: 16px;
  overflow: hidden;
  background: #1e293b;
  flex-shrink: 0;
}
.rj1-hero__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rj1-hero__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 14px 22px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.55) 100%);
  color: #ffffff;
}
.rj1-hero__event { font-size: var(--fs-xxl); font-weight: var(--fw-bold); line-height: 1.15; }
/* Date puis météo EN DESSOUS (colonne), pas côte à côte. */
.rj1-hero__meta { display: flex; flex-direction: column; justify-content: center; gap: 4px; align-items: center; font-size: var(--fs-base); margin-top: 6px; }
.rj1-hero__weather { font-weight: var(--fw-semibold); }

/* ── KPIs ── */
.rj1-kpis {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.rj1-kpi {
  position: relative;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 9px 10px 9px 12px;
  background: #ffffff;
}
.rj1-kpi::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--rail, #64748b); }
/* AUCUN overflow:hidden ici (html2canvas rognerait le haut des glyphes) : la
   troncature est faite en JS via truncate(). white-space:nowrap suffit. */
.rj1-kpi__label { font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; white-space: nowrap; line-height: 1.3; }
.rj1-kpi__value { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #0f172a; letter-spacing: -0.2px; font-variant-numeric: tabular-nums; white-space: nowrap; margin-top: 2px; }

/* ── Carte générique ── */
.rj1-card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; }
.rj1-card__title { text-align: center; font-size: var(--fs-sm); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-bottom: 12px; }

/* ── Catégories : 2 colonnes ── */
.rj1-cats__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.rj1-cats__col { display: flex; flex-direction: column; gap: 8px; }
.rj1-cats__sub { text-align: center; font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; }
.rj1-mini-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.rj1-mini { position: relative; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 9px; padding: 6px 7px; background: #ffffff; }
.rj1-mini::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--rail, #64748b); }
.rj1-mini__label { font-size: 8px; font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; white-space: nowrap; line-height: 1.3; }
.rj1-mini__value { font-size: var(--fs-sm); font-weight: var(--fw-bold); color: #0f172a; font-variant-numeric: tabular-nums; margin-top: 1px; }

.rj1-donut { display: flex; align-items: center; gap: 14px; }
.rj1-donut canvas { width: 132px; height: 132px; flex-shrink: 0; }
.rj1-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; font-size: var(--fs-xs); }
/* nom | %  (le dot est un glyphe « ● » DANS le nom, plus une colonne). */
.rj1-legend__item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; }
/* Puce « ● » : un GLYPHE (pas une boîte) dans le flux du nom → même baseline que le
   texte, donc aligné par construction sous html2canvas. */
.rj1-legend__bullet { margin-right: 4px; font-size: 10px; line-height: 1; }
.rj1-legend__label { color: #334155; white-space: nowrap; line-height: 1.3; }
.rj1-legend__pct { font-weight: var(--fw-bold); color: #0f172a; font-variant-numeric: tabular-nums; }

/* ── Tops en cartes classées ── */
.rj1-tops { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; flex: 1; min-height: 0; }
.rj1-top { display: flex; flex-direction: column; gap: 7px; }
.rj1-top__title { text-align: center; font-size: var(--fs-sm); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; }
.rj1-rank { display: flex; align-items: flex-start; gap: 9px; border: 1px solid #e2e8f0; border-radius: 11px; padding: 8px 10px; }
/* Badge = <img> SVG (cercle + numéro centrés dans le SVG) : html2canvas le
   rasterise → centrage parfait, sans dépendre de son rendu de texte. */
.rj1-rank__num { flex-shrink: 0; width: 20px; height: 20px; display: block; }
.rj1-rank__body { flex: 1; min-width: 0; }
.rj1-rank__row { display: flex; align-items: center; gap: 8px; }
.rj1-rank__name { flex: 1; min-width: 0; font-size: var(--fs-base); font-weight: var(--fw-semibold); color: #1e293b; white-space: nowrap; line-height: 1.3; }
.rj1-rank__val { flex-shrink: 0; font-size: var(--fs-base); font-weight: var(--fw-bold); color: #0f172a; font-variant-numeric: tabular-nums; }
.rj1-rank__units { font-size: var(--fs-xs); color: #94a3b8; margin: 1px 0 5px; }
.rj1-rank__bar { height: 5px; border-radius: 4px; background: #eef2f7; overflow: hidden; }
.rj1-rank__bar > i { display: block; height: 100%; min-width: 3px; border-radius: 4px; background: #F59E0B; }

.rj1-empty { font-size: var(--fs-sm); color: #94a3b8; font-style: italic; text-align: center; padding: 6px 0; }

.rj1-footer { flex-shrink: 0; font-size: var(--fs-xs); color: #94a3b8; text-align: center; padding-top: 4px; }
</style>
