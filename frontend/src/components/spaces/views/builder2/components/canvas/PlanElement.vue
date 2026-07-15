<template>
  <!-- Un élément sur le plan 2D : rectangle (coins arrondis), label, poignées de resize. -->
  <g
    class="b2-plan-el"
    :transform="rotationTransform"
    :style="element.pending ? 'cursor: progress;' : 'cursor: pointer;'"
    :opacity="element.pending ? 0.55 : 1"
    @pointerdown="(e) => onElementPointerDown(e, element)"
  >
    <path
      :d="bodyPath"
      :fill="color"
      :fill-opacity="(selected || highlighted) ? 0.8 : 0.5"
      :stroke="(selected || highlighted) ? '#ff3131' : color"
      :stroke-width="(selected || highlighted) ? 3 : 2"
      :stroke-dasharray="element.pending ? '4 3' : undefined"
    />
    <text
      :x="px(element.x + element.width / 2)"
      :y="px(element.y + element.depth / 2)"
      text-anchor="middle"
      dominant-baseline="central"
      :font-size="11"
      fill="#fff"
      style="pointer-events: none; user-select: none; font-weight: 600;"
    >{{ element.name }}</text>

    <!-- Badges d'usage (doc WF-01 point 8) : ⚡ mappé Weezevent · 🍔 n menu items -->
    <text
      v-if="usage.weezeventMapped || usage.menuItemsCount > 0"
      :x="px(element.x) + 4"
      :y="px(element.y) + 12"
      :font-size="10"
      style="pointer-events: none; user-select: none;"
    >{{ usage.weezeventMapped ? '⚡' : '' }}{{ usage.menuItemsCount > 0 ? `🍔${usage.menuItemsCount}` : '' }}</text>

    <!-- Poignées de resize (élément sélectionné, hors outil actif) -->
    <template v-if="selected && !toolActive">
      <rect
        v-for="handle in handles"
        :key="handle.name"
        :x="handle.x - 4"
        :y="handle.y - 4"
        width="8"
        height="8"
        fill="#ff3131"
        stroke="#fff"
        stroke-width="1"
        :style="{ cursor: handle.cursor }"
        @pointerdown.stop="(e) => onHandlePointerDown(e, element, handle.name)"
      />
    </template>
  </g>
</template>

<script setup>
import { computed } from 'vue'
import { roundedRectPath, radiusToPx } from '../../composables/svgShapes'

const props = defineProps({
  element: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  highlighted: { type: Boolean, default: false },
  color: { type: String, required: true },
  usage: { type: Object, default: () => ({ weezeventMapped: false, menuItemsCount: 0 }) },
  pxPerMeter: { type: Number, required: true },
  toolActive: { type: Boolean, default: false },
  onElementPointerDown: { type: Function, required: true },
  onHandlePointerDown: { type: Function, required: true },
})

function px(meters) {
  return meters * props.pxPerMeter
}

const rotationTransform = computed(() => {
  const rotation = props.element.rotation || 0
  if (!rotation) return undefined
  const cx = px(props.element.x + props.element.width / 2)
  const cy = px(props.element.y + props.element.depth / 2)
  return `rotate(${rotation} ${cx} ${cy})`
})

// Rectangle à coins arrondis par coin — helper partagé (svgShapes, source unique).
const bodyPath = computed(() =>
  roundedRectPath(
    px(props.element.x),
    px(props.element.y),
    px(props.element.width),
    px(props.element.depth),
    radiusToPx(props.element.cornerRadius, props.pxPerMeter),
  ),
)

const handles = computed(() => {
  const x = px(props.element.x)
  const y = px(props.element.y)
  const w = px(props.element.width)
  const h = px(props.element.depth)
  return [
    { name: 'nw', x, y, cursor: 'nwse-resize' },
    { name: 'ne', x: x + w, y, cursor: 'nesw-resize' },
    { name: 'sw', x, y: y + h, cursor: 'nesw-resize' },
    { name: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' },
  ]
})
</script>

<style scoped>
/* Parité v1 : transition douce sur la sélection et le survol. */
.b2-plan-el path {
  transition: fill-opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              stroke-width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Hover léger (opacité réduite) quand l'élément n'est pas en cours d'édition. */
.b2-plan-el:hover path:first-child {
  fill-opacity: 0.8 !important;
}
</style>
