<template>
  <div class="pd" :style="{ width: width + 'px', height: height + 'px' }">
    <div class="pd__total">
      <span class="pd__total-label">{{ t('anTotal') }}</span>
      <span class="pd__total-value">{{ fmt(data.total) }}</span>
    </div>
    <div class="pd__body" :style="{ height: bodyH + 'px' }">
      <canvas ref="canvasRef" class="pd__canvas" :width="size * 2" :height="size * 2" :style="{ width: size + 'px', height: size + 'px' }"></canvas>
      <ul class="pd__legend" :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }">
        <li v-for="e in legend" :key="e.label" class="pd__row" :style="{ height: ROW_H + 'px' }">
          <span class="pd__label"><span class="pd__bullet" :style="{ color: e.color }">●</span>{{ clamp(e.label) }}</span>
          <span class="pd__pct">{{ pct(e.value) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrency, formatNumber } from '@/composables/useFormatters'
import { drawDonut } from '@/utils/reportJ1Draw'
import { donutLegend, clampAtWord } from '@/utils/reportJ1Page2Tables'

const props = defineProps({
  data: { type: Object, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
})
const { t } = useI18n()
const canvasRef = ref(null)

const ROW_H = 20
const TOTAL_H = 28
const GAP = 12
const OTHERS_COLOR = '#B0BEC5'

const MIN_DONUT = 110
const COL_GAP = 16

// Légende sous le donut (retour Bertrand 28/10) : 2 colonnes dès que la largeur le permet,
// autant de lignes que la hauteur en laisse au-dessus d'un donut de MIN_DONUT px.
const bodyH = computed(() => Math.max(0, props.height - TOTAL_H))
const cols = computed(() => (props.width >= 300 ? 2 : 1))
const legendRowsMax = computed(() => Math.max(1, Math.floor((bodyH.value - GAP - MIN_DONUT) / ROW_H)))
const legendRows = computed(() => Math.ceil(legend.value.length / cols.value))
const size = computed(() =>
  Math.max(40, Math.min(Math.floor(props.width * 0.7), bodyH.value - GAP - legendRows.value * ROW_H)),
)
const colW = computed(() => (props.width - COL_GAP * (cols.value - 1)) / cols.value)
const labelChars = computed(() => Math.max(6, Math.floor((colW.value - 50) / 6.2)))

// Entrées complètes : si le total dépasse la somme (top N tronqué), le reste devient une part grise.
const full = computed(() => {
  const entries = (props.data?.entries || []).filter((e) => Number(e.value) > 0)
  const sum = entries.reduce((a, e) => a + e.value, 0)
  const rest = (Number(props.data?.total) || sum) - sum
  if (rest > sum * 0.0005 && rest > 0) {
    return [...entries, { label: t('rj1P2Others'), value: rest, color: OTHERS_COLOR, isOthers: true }]
  }
  return entries
})
const total = computed(() => full.value.reduce((a, e) => a + e.value, 0) || 1)
const legend = computed(() =>
  donutLegend(full.value, legendRowsMax.value * cols.value, { othersLabel: t('rj1P2Others'), othersColor: OTHERS_COLOR }),
)

const fmt = (v) => (props.data?.valueFormat === 'count' ? formatNumber(v) : formatCurrency(v))
const pct = (v) => {
  const p = (v / total.value) * 100
  return `${p < 1 && p > 0 ? '<1' : Math.round(p)}%`
}
const clamp = (s) => clampAtWord(s, labelChars.value)

onMounted(() => {
  drawDonut(canvasRef.value, full.value)
})
</script>

<style scoped>
.pd { box-sizing: border-box; display: flex; flex-direction: column; }
.pd__total { height: 28px; display: flex; align-items: baseline; gap: 8px; }
.pd__total-label { font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; line-height: 1.4; }
.pd__total-value { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.4; }
.pd__body { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.pd__canvas { flex-shrink: 0; display: block; }
.pd__legend { list-style: none; margin: 0; padding: 0; width: 100%; display: grid; column-gap: 16px; font-size: var(--fs-xs); }
.pd__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pd__bullet { margin-right: 4px; font-size: 10px; line-height: 1; }
.pd__label { color: #334155; white-space: nowrap; line-height: 1.3; }
.pd__pct { flex-shrink: 0; font-weight: var(--fw-bold); color: #0f172a; font-variant-numeric: tabular-nums; }
</style>
