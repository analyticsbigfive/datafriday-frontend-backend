<template>
  <div ref="wrapRef" class="ct-chart">
    <svg
      class="ct-chart__svg"
      :viewBox="`0 0 ${width} ${height}`"
      :style="{ height: `${height}px` }"
      role="img"
      :aria-label="t('ctChartAria')"
    >
      <g v-for="tick in model.yTicks" :key="`y${tick.value}`">
        <line class="ct-chart__grid" :x1="model.margin.l" :x2="width - model.margin.r" :y1="tick.y" :y2="tick.y" />
        <text class="ct-chart__axis" :x="model.margin.l - 8" :y="tick.y + 4" text-anchor="end">{{ fmt.axisCost(tick.value) }}</text>
      </g>
      <text
        v-for="tick in marginCurves.ticks"
        :key="`m${tick.value}`"
        class="ct-chart__axis"
        :x="width - model.margin.r + 8"
        :y="tick.y + 4"
      >{{ Math.round(tick.value) }} %</text>
      <g v-for="tick in model.xTicks" :key="`x${tick.t}`">
        <line
          class="ct-chart__grid"
          stroke-dasharray="2 4"
          :x1="tick.x" :x2="tick.x"
          :y1="model.margin.t" :y2="axisY"
        />
        <text class="ct-chart__axis" :x="tick.x" :y="axisY + 17" text-anchor="middle">{{ fmt.month(tick.t) }}</text>
      </g>

      <g v-for="ev in model.events" :key="ev.id">
        <line class="ct-chart__event-line" :x1="ev.x" :x2="ev.x" :y1="model.margin.t" :y2="axisY" stroke-dasharray="3 3" />
        <g
          class="ct-chart__event"
          :class="{ 'ct-chart__event--on': hover.activeEventId.value === ev.id }"
          @mouseenter="hover.onEventEnter(ev)"
          @mouseleave="hover.onLeave"
        >
          <rect
            class="ct-chart__diamond"
            :x="ev.x - 4" :y="axisY - 4" width="8" height="8"
            :transform="`rotate(45 ${ev.x} ${axisY})`"
          />
          <text
            v-if="ev.labelVisible"
            class="ct-chart__event-label"
            :x="ev.x + 3" :y="axisY + 34"
            text-anchor="end"
            :transform="`rotate(-40 ${ev.x + 3} ${axisY + 34})`"
          >{{ ev.name }}</text>
          <rect :x="ev.x - 10" :y="axisY - 8" width="20" :height="ev.labelVisible ? 96 : 20" fill="transparent" />
        </g>
      </g>

      <g v-for="(path, i) in model.paths" :key="path.key">
        <path class="ct-chart__line" :d="path.d" :style="{ stroke: colorOf(series[i]) }" />
        <circle
          v-for="(dot, j) in path.dots"
          :key="j"
          class="ct-chart__dot"
          :cx="dot.x" :cy="dot.y" r="3.5"
          :style="{ stroke: colorOf(series[i]) }"
        />
        <path v-if="showPrice && path.priceD" class="ct-chart__price" :d="path.priceD" :style="{ stroke: colorOf(series[i]) }" />
        <circle v-if="path.endDot" :cx="path.endDot.x" :cy="path.endDot.y" r="4" :style="{ fill: colorOf(series[i]) }" />
      </g>
      <path
        v-for="curve in marginCurves.paths"
        :key="`mc${curve.key}`"
        class="ct-chart__margin"
        :d="curve.d"
        :style="{ stroke: colorVar(curve.colorIndex) }"
      />

      <line
        v-if="hover.crosshairX.value !== null"
        class="ct-chart__crosshair"
        :x1="hover.crosshairX.value" :x2="hover.crosshairX.value"
        :y1="model.margin.t" :y2="axisY"
      />
      <rect
        class="ct-chart__hit"
        :x="model.margin.l" :y="model.margin.t"
        :width="model.innerWidth" :height="model.innerHeight"
        fill="transparent"
        @mousemove="onMove"
        @mouseleave="hover.onLeave"
      />
    </svg>

    <CostTrackingChartTooltip
      v-if="hover.active.value && hover.rows.value.length"
      :rows="hover.rows.value"
      :event="hover.active.value.event"
      :when="hover.active.value.when"
      :x="hover.crosshairX.value"
      :top="model.margin.t + 8"
      :container-width="width"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'
import { useCostTrackingChartHover } from '@/composables/useCostTrackingChartHover'
import { buildMarginCurves } from '@/utils/costTrackingMarginCurve'
import CostTrackingChartTooltip from './CostTrackingChartTooltip.vue'

// Graphique SVG en escalier du coût par pièce : paliers, losanges d'events avec étiquettes à
// 40 degrés (supprimées sous 17 px d'écart, l'infobulle reste), crosshair, courbe de marge
// optionnelle. Toute la géométrie vient de `chartModel` (composable) ; ici, uniquement le dessin.
const props = defineProps({
  // ({ width, height, margin }) => modèle du graphique (échelles, ticks, chemins, events).
  chartModel: { type: Function, required: true },
  // Lignes visibles en escalier, avec colorIndex.
  series: { type: Array, default: () => [] },
  // [t0, t1] en ms.
  bounds: { type: Array, required: true },
  showMargin: { type: Boolean, default: false },
  // Courbe du prix hors taxe, sur l'axe de gauche (en euros, comme le coût).
  showPrice: { type: Boolean, default: false },
  // Réserve la place des étiquettes d'events sous l'axe.
  withEvents: { type: Boolean, default: true },
})

const { t } = useI18n()
const fmt = useCostTrackingFormat()

const wrapRef = ref(null)
const width = ref(800)
const height = computed(() => (props.withEvents ? 430 : 360))

const margin = computed(() => ({ r: props.showMargin ? 52 : 16, b: props.withEvents ? 102 : 32 }))
const model = computed(() => props.chartModel({ width: width.value, height: height.value, margin: margin.value }))
const axisY = computed(() => height.value - model.value.margin.b)

const marginCurves = computed(() =>
  props.showMargin
    ? buildMarginCurves(props.series, {
        x: model.value.x,
        margin: model.value.margin,
        innerHeight: model.value.innerHeight,
        t1: props.bounds[1],
      })
    : { ticks: [], paths: [] },
)

const hover = useCostTrackingChartHover({ model, series: toRef(props, 'series'), bounds: toRef(props, 'bounds') })

const colorVar = (index) => `var(--ct-s${(index % 10) + 1})`
const colorOf = (s) => colorVar(s?.colorIndex ?? 0)

function onMove(e) {
  const box = e.currentTarget.ownerSVGElement.getBoundingClientRect()
  hover.onMove(e.clientX - box.left)
}

let observer = null
function measure() {
  const w = wrapRef.value?.clientWidth
  if (w) width.value = w
}
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && wrapRef.value) {
    observer = new ResizeObserver(measure)
    observer.observe(wrapRef.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.ct-chart {
  position: relative;
  margin-top: 10px;
}
.ct-chart__svg {
  display: block;
  width: 100%;
}
.ct-chart__grid {
  stroke: var(--ct-grid);
  stroke-width: 1;
}
.ct-chart__axis {
  font-size: var(--fs-xs);
  fill: var(--ct-muted);
}
.ct-chart__event-line {
  stroke: var(--ct-faint);
  stroke-opacity: 0.35;
}
.ct-chart__event {
  cursor: default;
}
.ct-chart__diamond {
  fill: var(--ct-faint);
}
.ct-chart__event-label {
  font-size: var(--fs-xs);
  fill: var(--ct-muted);
}
.ct-chart__event:hover .ct-chart__event-label,
.ct-chart__event--on .ct-chart__event-label {
  fill: var(--ct-text);
  font-weight: var(--fw-semibold);
}
.ct-chart__line {
  fill: none;
  stroke-width: 2.25;
  stroke-linejoin: round;
}
.ct-chart__dot {
  fill: var(--ct-surface);
  stroke-width: 2;
}
.ct-chart__price {
  fill: none;
  stroke-width: 1.6;
  stroke-dasharray: 7 3 1.5 3;
  opacity: 0.85;
}
.ct-chart__margin {
  fill: none;
  stroke-width: 1.75;
  stroke-dasharray: 5 4;
  stroke-opacity: 0.75;
}
.ct-chart__crosshair {
  stroke: var(--ct-muted);
  stroke-width: 1;
}
</style>
