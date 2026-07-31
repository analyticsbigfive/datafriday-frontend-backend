<template>
  <div class="d-flex flex-column h-100 pa-3">
    <!-- Main SVG area -->
    <v-card class="flex-fill overflow-hidden position-relative" rounded="lg" elevation="2">
      <!-- Contrôles zoom / rotation : fusionnés au canvas, en overlay flottant
           collé en haut à droite (reste en place pendant le pan/zoom). -->
      <div class="iso-controls d-flex align-center ga-2">
        <v-btn icon variant="outlined" size="small" @click="handleZoomIn">
          <ZoomIn :size="18" />
        </v-btn>
        <v-btn icon variant="outlined" size="small" @click="handleZoomOut">
          <ZoomOut :size="18" />
        </v-btn>
        <v-btn icon variant="outlined" size="small" @click="() => setRotation((rotation + 45) % 360)">
          <RotateCw :size="18" />
        </v-btn>
      </div>
      <svg
        ref="svgRef"
        width="100%"
        height="100%"
        viewBox="0 0 800 600"
        :style="{ background: svgBackground }"
        class="cursor-move"
        @mousedown="handlePanStart"
        @mousemove="handlePanMove"
        @mouseup="handlePanEnd"
        @mouseleave="handlePanEnd"
      >
        <defs>
          <filter id="shadow">
            <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.3" />
          </filter>
        </defs>

        <g :transform="`translate(400, 300)`">
          <g :transform="`scale(${zoom}) translate(${panOffset.x / zoom}, ${panOffset.y / zoom})`">
            <g transform="translate(-400, -300)">
              <!-- Grid on ground -->
              <g opacity="0.3" class="dark:opacity-40">
                <!-- Horizontal grid lines -->
                <line
                  v-for="i in 20"
                  :key="`grid-h-${i - 1}`"
                  :x1="getGridH(i - 1).x1"
                  :y1="getGridH(i - 1).y1"
                  :x2="getGridH(i - 1).x2"
                  :y2="getGridH(i - 1).y2"
                  stroke="#cbd5e1"
                  class="dark:!stroke-gray-600"
                  stroke-width="1"
                />
                <!-- Vertical grid lines -->
                <line
                  v-for="i in 20"
                  :key="`grid-v-${i - 1}`"
                  :x1="getGridV(i - 1).x1"
                  :y1="getGridV(i - 1).y1"
                  :x2="getGridV(i - 1).x2"
                  :y2="getGridV(i - 1).y2"
                  stroke="#cbd5e1"
                  class="dark:!stroke-gray-600"
                  stroke-width="1"
                />
              </g>

              <!-- Forecourt -->
              <g
                v-if="forecourt"
                class="cursor-pointer"
                @click.stop="onSelectForecourt()"
              >
                <!-- Forecourt base -->
                <g>
                  <SvgPaths
                    v-bind="drawRoundedBox(
                      forecourtOffsetX,
                      forecourtOffsetY,
                      groundZForForecourt,
                      forecourt.width,
                      forecourt.length,
                      0.1,
                      forecourt.cornerRadius,
                      forecourtColor,
                      forecourtOpacity,
                      isForecourtSelected ? 2 : 1
                    )"
                  />
                </g>

                <!-- Elements on forecourt -->
                <g
                  v-for="element in visibleForecourtElements"
                  :key="element.id"
                  class="cursor-pointer"
                  @click.stop="handleElementClick(element.id, $event)"
                >
                  <SvgPaths
                    v-bind="(element.rotation || 0) !== 0
                      ? drawRotatedRoundedBox(
                          element.x + forecourtOffsetX,
                          element.y + forecourtOffsetY,
                          groundZForForecourt + 0.1,
                          element.width,
                          element.depth,
                          element.height,
                          element.rotation || 0,
                          element.cornerRadius,
                          getElementBoxColor(element),
                          0.8,
                          2
                        )
                      : drawRoundedBox(
                          element.x + forecourtOffsetX,
                          element.y + forecourtOffsetY,
                          groundZForForecourt + 0.1,
                          element.width,
                          element.depth,
                          element.height,
                          element.cornerRadius,
                          getElementBoxColor(element),
                          0.8,
                          2
                        )"
                  />
                  <!-- Element label -->
                  <text
                    :x="getElementLabelPosForecourt(element).x"
                    :y="getElementLabelPosForecourt(element).y"
                    class="text-xs"
                    :fill="getElementLabelColor(element)"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    pointer-events="none"
                  >
                    {{ element.name }}
                  </text>
                </g>

                <!-- Forecourt label -->
                <text
                  :x="getForecourtLabelPos().x"
                  :y="getForecourtLabelPos().y"
                  class="text-sm"
                  :fill="isForecourtSelected ? '#3b82f6' : '#64748b'"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  pointer-events="none"
                >
                  {{ forecourt.name }}
                </text>
              </g>

              <!-- External merch -->
              <g
                v-if="externalMerch"
                class="cursor-pointer"
                @click.stop="onSelectExternalMerch()"
              >
                <SvgPaths
                  v-bind="drawRoundedBox(
                    externalOffsetX,
                    externalOffsetY,
                    groundZForExternal,
                    externalMerch.width,
                    externalMerch.length,
                    0.1,
                    externalMerch.cornerRadius,
                    externalMerchColor,
                    externalMerchOpacity,
                    isExternalMerchSelected ? 2 : 1
                  )"
                />

                <g
                  v-for="element in visibleExternalMerchElements"
                  :key="element.id"
                  class="cursor-pointer"
                  @click.stop="handleElementClick(element.id, $event)"
                >
                  <SvgPaths
                    v-bind="(element.rotation || 0) !== 0
                      ? drawRotatedRoundedBox(
                          (element.x || 0) + externalOffsetX,
                          (element.y || 0) + externalOffsetY,
                          groundZForExternal + 0.1,
                          element.width || 0,
                          element.depth || 0,
                          element.height || 0,
                          element.rotation || 0,
                          element.cornerRadius,
                          getElementBoxColor(element),
                          0.8,
                          2
                        )
                      : drawRoundedBox(
                          (element.x || 0) + externalOffsetX,
                          (element.y || 0) + externalOffsetY,
                          groundZForExternal + 0.1,
                          element.width || 0,
                          element.depth || 0,
                          element.height || 0,
                          element.cornerRadius,
                          getElementBoxColor(element),
                          0.8,
                          2
                        )"
                  />
                  <text
                    :x="getExternalElementLabelPos(element).x"
                    :y="getExternalElementLabelPos(element).y"
                    class="text-xs"
                    :fill="getElementLabelColor(element)"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    pointer-events="none"
                  >
                    {{ element.name }}
                  </text>
                </g>

                <!-- External merch label -->
                <text
                  :x="getExternalMerchLabelPos().x"
                  :y="getExternalMerchLabelPos().y"
                  class="text-sm"
                  :fill="isExternalMerchSelected ? '#7c3aed' : '#64748b'"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  pointer-events="none"
                >
                  {{ externalMerch.name }}
                </text>
              </g>

              <!-- Floors -->
              <g
                v-for="floor in sortedFloors"
                :key="floor.id"
                class="cursor-pointer"
                :filter="isFloorSelected(floor) ? 'url(#shadow)' : undefined"
                @click.stop="handleFloorClick(floor.id, $event)"
              >
                <!-- Floor slab -->
                <SvgPaths
                  v-bind="floor.hole && floor.hole.enabled
                    ? drawDoughnutFloor(
                        -floor.width / 2,
                        -floor.length / 2,
                        getFloorZ(floor),
                        floor.width,
                        floor.length,
                        0.3,
                        floor.cornerRadius,
                        floor.hole,
                        floorColor,
                        getFloorOpacity(floor),
                        isFloorSelected(floor) ? 2 : 1
                      )
                    : drawRoundedBox(
                        -floor.width / 2,
                        -floor.length / 2,
                        getFloorZ(floor),
                        floor.width,
                        floor.length,
                        0.3,
                        floor.cornerRadius,
                        floorColor,
                        getFloorOpacity(floor),
                        isFloorSelected(floor) ? 2 : 1
                      )"
                />

                <!-- Ceiling -->
                <SvgPaths
                  v-bind="floor.hole && floor.hole.enabled
                    ? drawDoughnutFloor(
                        -floor.width / 2,
                        -floor.length / 2,
                        getFloorZ(floor) + floor.height - 0.2,
                        floor.width,
                        floor.length,
                        0.2,
                        floor.cornerRadius,
                        floor.hole,
                        floorColor,
                        0.05,
                        1
                      )
                    : drawRoundedBox(
                        -floor.width / 2,
                        -floor.length / 2,
                        getFloorZ(floor) + floor.height - 0.2,
                        floor.width,
                        floor.length,
                        0.2,
                        floor.cornerRadius,
                        floorColor,
                        0.05,
                        1
                      )"
                />

                <!-- Elements on this floor -->
                <g
                  v-for="element in (visibleElementsByFloorId[floor.id] || [])"
                  :key="element.id"
                  class="cursor-pointer"
                  @click.stop="handleElementClick(element.id, $event)"
                >
                  <SvgPaths
                    v-bind="(element.rotation || 0) !== 0
                      ? drawRotatedRoundedBox(
                          element.x - floor.width / 2,
                          element.y - floor.length / 2,
                          getFloorZ(floor) + 0.3,
                          element.width,
                          element.depth,
                          element.height,
                          element.rotation || 0,
                          element.cornerRadius,
                          getElementBoxColor(element),
                          0.8,
                          2
                        )
                      : drawRoundedBox(
                          element.x - floor.width / 2,
                          element.y - floor.length / 2,
                          getFloorZ(floor) + 0.3,
                          element.width,
                          element.depth,
                          element.height,
                          element.cornerRadius,
                          getElementBoxColor(element),
                          0.8,
                          2
                        )"
                  />
                  <!-- Element label -->
                  <text
                    :x="getFloorElementLabelPos(element, floor).x"
                    :y="getFloorElementLabelPos(element, floor).y"
                    class="text-xs"
                    :fill="getElementLabelColor(element)"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    pointer-events="none"
                  >
                    {{ element.name }}
                  </text>
                </g>

                <!-- Floor label -->
                <text
                  :x="getFloorLabelPos(floor).x"
                  :y="getFloorLabelPos(floor).y"
                  class="text-sm"
                  :fill="isFloorSelected(floor) ? '#3b82f6' : '#64748b'"
                  dominant-baseline="middle"
                  pointer-events="none"
                >
                  {{ floor.name }}
                </text>
              </g>
            </g>
          </g>
        </g>
      </svg>
    </v-card>
  </div>
</template>

<script setup>
import { h, ref, reactive, computed, inject, watch, onMounted, nextTick, defineComponent } from 'vue'
import { useStore as useVuexStore } from 'vuex'
import { useTheme } from 'vuetify'
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-vue-next'
import { containElementInZone } from '../../composables/useIsoProjection'
import { buildTools, colorOf as colorOfTool, darkerColorOf as darkerColorOfTool } from '../../constants/elementTaxonomy'

// ── SvgPaths : composant inline identique à v1 ────────────────────────────────
const SvgPaths = defineComponent({
  name: 'SvgPaths',
  props: {
    opacity: { type: Number, default: 0.7 },
    paths:   { type: Array,  default: () => [] },
  },
  render() {
    return h('g', { opacity: this.opacity },
      (this.paths || []).map((p) => h('path', {
        d: p.d, fill: p.fill,
        'fill-opacity': p.fillOpacity,
        'fill-rule':    p.fillRule,
        stroke: p.stroke,
        'stroke-width': p.strokeWidth,
      })),
    )
  },
})

const store = inject('builderStore')
const vuexStore = useVuexStore()
onMounted(() => vuexStore.dispatch('departments/fetchDepartments'))
const tools = computed(() => buildTools(vuexStore.getters['departments/departments'] || []))

// ── Thème ─────────────────────────────────────────────────────────────────────
const { global: vuetifyTheme } = useTheme()
const isDark       = computed(() => vuetifyTheme.current.value.dark ?? false)
const svgBackground = computed(() => isDark.value ? 'rgba(30, 41, 59, 0.45)' : '#ffffff')

// ── Constantes de projection (parité v1) ──────────────────────────────────────
const SCALE   = 3
const VIEW_CX = 400
const VIEW_CY = 300

// ── État navigation ───────────────────────────────────────────────────────────
const svgRef    = ref(null)
const rotation  = ref(0)
const zoom = ref(Math.round(1.9000000000000006 * 100) / 100)
const panOffset = reactive({ x: 0, y: 0 })
const isPanning = ref(false)
const panStart  = reactive({ x: 0, y: 0 })
let userAdjusted = false

// ── Projection isométrique (parité v1 : résultat en coords SVG absolues) ──────
function rotatePoint(x, y, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) }
}
function toIsometric(x, y, z, angleDeg) {
  const r = rotatePoint(x, y, angleDeg)
  return {
    x: (r.x - r.y)           * SCALE + VIEW_CX,
    y: ((r.x + r.y) * 0.5 - z) * SCALE + VIEW_CY,
  }
}

// ── Grille ────────────────────────────────────────────────────────────────────
function getGridH(i) {
  const gs = 10
  const s = toIsometric(-50, i * gs - 50, 0, rotation.value)
  const e = toIsometric( 50, i * gs - 50, 0, rotation.value)
  return { x1: s.x, y1: s.y, x2: e.x, y2: e.y }
}
function getGridV(i) {
  const gs = 10
  const s = toIsometric(i * gs - 50, -50, 0, rotation.value)
  const e = toIsometric(i * gs - 50,  50, 0, rotation.value)
  return { x1: s.x, y1: s.y, x2: e.x, y2: e.y }
}

// ── Helpers de normalisation des éléments ────────────────────────────────────
function normalizeElement(el, zone) {
  const c = containElementInZone(el, zone)
  return { ...el, x: c.x, y: c.y, width: c.width, depth: c.depth, height: el.height3d || el.height || 2 }
}
function zoneToFloor(zone) {
  return {
    ...zone,
    hole:         zone.geometry?.hole         || null,
    cornerRadius: zone.geometry?.cornerRadius || null,
    elements:     store.visibleElementsOfZone(zone.id).map((el) => normalizeElement(el, zone)),
  }
}

// ── Données par kind ──────────────────────────────────────────────────────────
const sortedFloors  = computed(() =>
  store.zonesSorted.value.filter((z) => z.kind === 'FLOOR').map(zoneToFloor).sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
)
const forecourt     = computed(() => { const z = store.zonesSorted.value.find((z) => z.kind === 'FORECOURT'); return z ? zoneToFloor(z) : null })
const externalMerch = computed(() => { const z = store.zonesSorted.value.find((z) => z.kind === 'EXTERNAL');  return z ? zoneToFloor(z) : null })

// ── Éléments visibles ─────────────────────────────────────────────────────────
const visibleForecourtElements     = computed(() => forecourt.value?.elements    || [])
const visibleExternalMerchElements = computed(() => externalMerch.value?.elements || [])
const visibleElementsByFloorId     = computed(() => {
  const r = {}
  for (const f of sortedFloors.value) r[f.id] = f.elements || []
  return r
})

// ── Sélection ─────────────────────────────────────────────────────────────────
const activeZone          = computed(() => store.activeZone.value)
const selectedElementId   = computed(() => store.state.selectedElementId)
const selectedTool        = computed(() => store.state.activeTool)
const isForecourtSelected     = computed(() => activeZone.value?.kind === 'FORECOURT')
const isExternalMerchSelected = computed(() => activeZone.value?.kind === 'EXTERNAL')

function isFloorSelected(floor)  { return activeZone.value?.kind === 'FLOOR' && floor.id === activeZone.value?.id }
function getFloorOpacity(floor)  { return isFloorSelected(floor) ? 0.4 : 0.15 }
function handleFloorClick(id, e) { e?.stopPropagation(); store.setActiveZone(id) }
function handleElementClick(id, e) { e?.stopPropagation(); store.selectElement(id) }
function onSelectForecourt()   { const z = store.zonesSorted.value.find((z) => z.kind === 'FORECOURT'); if (z) store.setActiveZone(z.id) }
function onSelectExternalMerch() { const z = store.zonesSorted.value.find((z) => z.kind === 'EXTERNAL');  if (z) store.setActiveZone(z.id) }

// ── Couleurs ──────────────────────────────────────────────────────────────────
const floorColor          = '#93c5fd'
const forecourtColor      = '#93c5fd'
const externalMerchColor  = '#a78bfa'
const forecourtOpacity    = computed(() => isForecourtSelected.value    ? 0.5 : 0.2)
const externalMerchOpacity = computed(() => isExternalMerchSelected.value ? 0.5 : 0.2)

// CFG-2 Étape 5 : dérivées du référentiel global Department (elementTaxonomy.js), plus de map locale.
function getElementColor(type) {
  return colorOfTool(type, tools.value)
}
function getDarkerColor(type) {
  return darkerColorOfTool(type, tools.value)
}
function isElementHighlighted(element) {
  const tool = selectedTool.value
  if (!tool || element.type !== tool) return false
  const subs = store.state.activeSubtypes?.[tool] || []
  if (subs.length === 0) return true
  return (element.subtypes || []).some((s) => subs.includes(s))
}
function getElementBoxColor(element) {
  return (element.id === selectedElementId.value || isElementHighlighted(element))
    ? getDarkerColor(element.type) : getElementColor(element.type)
}
function getElementLabelColor(element) {
  return (element.id === selectedElementId.value || isElementHighlighted(element)) ? '#000000' : '#374151'
}

// ── Offsets de rendu ──────────────────────────────────────────────────────────
const forecourtOffsetX = computed(() => forecourt.value ? -(forecourt.value.width  / 2) : 0)
const forecourtOffsetY = computed(() => forecourt.value ? -(forecourt.value.length / 2) : 0)
const maxWidth  = computed(() => Math.max(sortedFloors.value.length ? Math.max(...sortedFloors.value.map((f) => f.width))  : 0, forecourt.value?.width  || 0))
const maxLength = computed(() => Math.max(sortedFloors.value.length ? Math.max(...sortedFloors.value.map((f) => f.length)) : 0, forecourt.value?.length || 0))
const externalOffsetX = computed(() => maxWidth.value / 2 + 20)
const externalOffsetY = computed(() => -(maxLength.value / 2) - (externalMerch.value?.length || 0) - 20)

const groundZForForecourt = computed(() => { const gf = sortedFloors.value.find((f) => (f.level ?? 0) === 0); return gf ? getFloorZ(gf) : 0 })
const groundZForExternal  = computed(() => { const gf = sortedFloors.value.find((f) => (f.level ?? 0) === 0); return gf ? getFloorZ(gf) : 0 })

function getFloorZ(floor) {
  return sortedFloors.value.filter((f) => (f.level ?? 0) < (floor.level ?? 0)).reduce((s, f) => s + (f.height || 0), 0)
}

// ── Positions de labels ───────────────────────────────────────────────────────
function getElementLabelPosForecourt(el) {
  return toIsometric(el.x + forecourtOffsetX.value + el.width/2, el.y + forecourtOffsetY.value + el.depth/2, groundZForForecourt.value + el.height + 1, rotation.value)
}
function getForecourtLabelPos() {
  return toIsometric(forecourt.value.width/2 + 5, 0, groundZForForecourt.value, rotation.value)
}
function getExternalElementLabelPos(el) {
  return toIsometric((el.x||0)+externalOffsetX.value+(el.width||0)/2, (el.y||0)+externalOffsetY.value+(el.depth||0)/2, groundZForExternal.value+(el.height||0)+1, rotation.value)
}
function getExternalMerchLabelPos() {
  return toIsometric(externalOffsetX.value+externalMerch.value.width/2, externalOffsetY.value+externalMerch.value.length/2, groundZForExternal.value+2, rotation.value)
}
function getFloorElementLabelPos(el, floor) {
  return toIsometric(el.x-floor.width/2+el.width/2, el.y-floor.length/2+el.depth/2, getFloorZ(floor)+el.height+1, rotation.value)
}
function getFloorLabelPos(floor) {
  return toIsometric(floor.width/2+5, 0, getFloorZ(floor)+(floor.height||0)/2, rotation.value)
}

// ── drawBox ───────────────────────────────────────────────────────────────────
function drawBox(x, y, z, w, d, h, color, opacity = 0.7, sw = 1) {
  const c = [
    toIsometric(x,   y,   z,   rotation.value), toIsometric(x+w, y,   z,   rotation.value),
    toIsometric(x+w, y+d, z,   rotation.value), toIsometric(x,   y+d, z,   rotation.value),
    toIsometric(x,   y,   z+h, rotation.value), toIsometric(x+w, y,   z+h, rotation.value),
    toIsometric(x+w, y+d, z+h, rotation.value), toIsometric(x,   y+d, z+h, rotation.value),
  ]
  const P = (a, b, c2, d2, fo) => ({ d: `M${a.x} ${a.y} L${b.x} ${b.y} L${c2.x} ${c2.y} L${d2.x} ${d2.y} Z`, fill: color, fillOpacity: fo, stroke: color, strokeWidth: sw })
  return { opacity, paths: [P(c[0],c[1],c[2],c[3],0.3), P(c[4],c[5],c[6],c[7],0.5), P(c[0],c[1],c[5],c[4],0.4), P(c[1],c[2],c[6],c[5],0.4)] }
}

// ── drawRoundedBox ────────────────────────────────────────────────────────────
function drawRoundedBox(x, y, z, w, d, h, cr, color, opacity = 0.7, sw = 1) {
  if (!cr || (!cr.topLeft && !cr.topRight && !cr.bottomLeft && !cr.bottomRight))
    return drawBox(x, y, z, w, d, h, color, opacity, sw)
  const seg = 8
  const mkPath = (zl) => {
    const tl = Math.min(cr.topLeft||0, w/2, d/2), tr = Math.min(cr.topRight||0, w/2, d/2)
    const br = Math.min(cr.bottomRight||0, w/2, d/2), bl = Math.min(cr.bottomLeft||0, w/2, d/2)
    const pts = []
    const pt = (px, py) => { const p = toIsometric(px, py, zl, rotation.value); return p }
    if (tl > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; pts.push(pt(x+tl-tl*Math.cos(a), y+tl-tl*Math.sin(a))) }
    else pts.push(pt(x, y))
    if (tr > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; pts.push(pt(x+w-tr+tr*Math.sin(a), y+tr-tr*Math.cos(a))) }
    else pts.push(pt(x+w, y))
    if (br > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; pts.push(pt(x+w-br+br*Math.cos(a), y+d-br+br*Math.sin(a))) }
    else pts.push(pt(x+w, y+d))
    if (bl > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; pts.push(pt(x+bl-bl*Math.sin(a), y+d-bl+bl*Math.cos(a))) }
    else pts.push(pt(x, y+d))
    return `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('') + ' Z'
  }
  return { opacity, paths: [{ d: mkPath(z), fill: color, fillOpacity: 0.3, stroke: color, strokeWidth: sw }, { d: mkPath(z+h), fill: color, fillOpacity: 0.5, stroke: color, strokeWidth: sw }] }
}

// ── drawRotatedBox ────────────────────────────────────────────────────────────
function drawRotatedBox(x, y, z, w, d, h, elRot, color, opacity = 0.7, sw = 1) {
  const cx = x + w/2, cy = y + d/2, rad = (elRot * Math.PI) / 180
  const rot = (lx, ly) => ({ x: cx + lx*Math.cos(rad) - ly*Math.sin(rad), y: cy + lx*Math.sin(rad) + ly*Math.cos(rad) })
  const corners = [rot(-w/2,-d/2), rot(w/2,-d/2), rot(w/2,d/2), rot(-w/2,d/2)]
  const btm = corners.map((c) => toIsometric(c.x, c.y, z,   rotation.value))
  const top = corners.map((c) => toIsometric(c.x, c.y, z+h, rotation.value))
  const c = [...btm, ...top]
  const P = (a, b, c2, d2, fo) => ({ d: `M${a.x} ${a.y} L${b.x} ${b.y} L${c2.x} ${c2.y} L${d2.x} ${d2.y} Z`, fill: color, fillOpacity: fo, stroke: color, strokeWidth: sw })
  return { opacity, paths: [P(c[0],c[1],c[2],c[3],0.3),P(c[4],c[5],c[6],c[7],0.5),P(c[0],c[1],c[5],c[4],0.4),P(c[1],c[2],c[6],c[5],0.4),P(c[2],c[3],c[7],c[6],0.4),P(c[3],c[0],c[4],c[7],0.4)] }
}

// ── drawRotatedRoundedBox ─────────────────────────────────────────────────────
function drawRotatedRoundedBox(x, y, z, w, d, h, elRot, cr, color, opacity = 0.7, sw = 1) {
  if (!cr || (!cr.topLeft && !cr.topRight && !cr.bottomLeft && !cr.bottomRight))
    return drawRotatedBox(x, y, z, w, d, h, elRot, color, opacity, sw)
  const cx = x+w/2, cy = y+d/2, rad = (elRot * Math.PI) / 180
  const tl = Math.min(cr.topLeft||0, w/2, d/2), tr = Math.min(cr.topRight||0, w/2, d/2)
  const br = Math.min(cr.bottomRight||0, w/2, d/2), bl = Math.min(cr.bottomLeft||0, w/2, d/2)
  const seg = 8
  const mkPath = (zl) => {
    const pts = []
    const pt = (lx, ly) => {
      const relX = lx-w/2, relY = ly-d/2
      const wx = cx + relX*Math.cos(rad) - relY*Math.sin(rad), wy = cy + relX*Math.sin(rad) + relY*Math.cos(rad)
      return toIsometric(wx, wy, zl, rotation.value)
    }
    if (tl > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; pts.push(pt(tl-tl*Math.cos(a), tl-tl*Math.sin(a))) } else pts.push(pt(0, 0))
    if (tr > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; pts.push(pt(w-tr+tr*Math.sin(a), tr-tr*Math.cos(a))) } else pts.push(pt(w, 0))
    if (br > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; pts.push(pt(w-br+br*Math.cos(a), d-br+br*Math.sin(a))) } else pts.push(pt(w, d))
    if (bl > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; pts.push(pt(bl-bl*Math.sin(a), d-bl+bl*Math.cos(a))) } else pts.push(pt(0, d))
    return `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('') + ' Z'
  }
  return { opacity, paths: [{ d: mkPath(z), fill: color, fillOpacity: 0.3, stroke: color, strokeWidth: sw }, { d: mkPath(z+h), fill: color, fillOpacity: 0.5, stroke: color, strokeWidth: sw }] }
}

// ── drawDoughnutFloor ─────────────────────────────────────────────────────────
function drawDoughnutFloor(x, y, z, w, d, h, cr, hole, color, opacity = 0.7, sw = 1) {
  const hx = x + hole.x * w - hole.width  / 2
  const hy = y + hole.y * d - hole.length / 2
  const seg = 8
  const mkPath = (zl) => {
    const oTL = cr ? Math.min(cr.topLeft||0, w/2, d/2) : 0, oTR = cr ? Math.min(cr.topRight||0, w/2, d/2) : 0
    const oBR = cr ? Math.min(cr.bottomRight||0, w/2, d/2) : 0, oBL = cr ? Math.min(cr.bottomLeft||0, w/2, d/2) : 0
    const iTL = Math.min(hole.cornerRadius?.topLeft||0, hole.width/2, hole.length/2)
    const iTR = Math.min(hole.cornerRadius?.topRight||0, hole.width/2, hole.length/2)
    const iBR = Math.min(hole.cornerRadius?.bottomRight||0, hole.width/2, hole.length/2)
    const iBL = Math.min(hole.cornerRadius?.bottomLeft||0, hole.width/2, hole.length/2)
    const ip = (px, py) => toIsometric(px, py, zl, rotation.value)

    const outer = []
    if (oTL > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; outer.push(ip(x+oTL-oTL*Math.cos(a), y+oTL-oTL*Math.sin(a))) } else outer.push(ip(x, y))
    if (oTR > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; outer.push(ip(x+w-oTR+oTR*Math.sin(a), y+oTR-oTR*Math.cos(a))) } else outer.push(ip(x+w, y))
    if (oBR > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; outer.push(ip(x+w-oBR+oBR*Math.cos(a), y+d-oBR+oBR*Math.sin(a))) } else outer.push(ip(x+w, y+d))
    if (oBL > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; outer.push(ip(x+oBL-oBL*Math.sin(a), y+d-oBL+oBL*Math.cos(a))) } else outer.push(ip(x, y+d))

    const inner = []
    if (iTL > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; inner.push(ip(hx+iTL-iTL*Math.cos(a), hy+iTL-iTL*Math.sin(a))) } else inner.push(ip(hx, hy))
    if (iBL > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; inner.push(ip(hx+iBL-iBL*Math.sin(a), hy+hole.length-iBL+iBL*Math.cos(a))) } else inner.push(ip(hx, hy+hole.length))
    if (iBR > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; inner.push(ip(hx+hole.width-iBR+iBR*Math.cos(a), hy+hole.length-iBR+iBR*Math.sin(a))) } else inner.push(ip(hx+hole.width, hy+hole.length))
    if (iTR > 0) for (let i = 0; i <= seg; i++) { const a = Math.PI/2*i/seg; inner.push(ip(hx+hole.width-iTR+iTR*Math.sin(a), hy+iTR-iTR*Math.cos(a))) } else inner.push(ip(hx+hole.width, hy))

    return `M ${outer[0].x} ${outer[0].y}` + outer.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('') + ' Z'
         + ` M ${inner[0].x} ${inner[0].y}` + inner.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('') + ' Z'
  }
  return { opacity, paths: [{ d: mkPath(z), fill: color, fillOpacity: 0.3, fillRule: 'evenodd', stroke: color, strokeWidth: sw }, { d: mkPath(z+h), fill: color, fillOpacity: 0.5, fillRule: 'evenodd', stroke: color, strokeWidth: sw }] }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function handlePanStart(e) { isPanning.value = true; panStart.x = e.clientX; panStart.y = e.clientY }
function handlePanMove(e) {
  if (!isPanning.value) return
  userAdjusted = true
  panOffset.x += e.clientX - panStart.x; panOffset.y += e.clientY - panStart.y
  panStart.x = e.clientX; panStart.y = e.clientY
}
function handlePanEnd() { isPanning.value = false }
function setRotation(r) { rotation.value = r }
function handleZoomIn()  { 
  zoom.value = Math.min(zoom.value + 0.1, 2) 
}
function handleZoomOut() { zoom.value = Math.max(zoom.value - 0.1, 0.5) }

// ── Fit to scene ──────────────────────────────────────────────────────────────
function fitToScene() {
  const floors = sortedFloors.value
  if (!floors.length) return
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const floor of floors) {
    const z0 = getFloorZ(floor), z1 = z0 + (floor.height || 4)
    for (const [px, py, pz] of [
      [-floor.width/2, -floor.length/2, z0], [ floor.width/2, -floor.length/2, z0],
      [-floor.width/2,  floor.length/2, z0], [ floor.width/2,  floor.length/2, z0],
      [-floor.width/2, -floor.length/2, z1], [ floor.width/2,  floor.length/2, z1],
    ]) {
      const p = toIsometric(px, py, pz, rotation.value)
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
  }
  const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1)
  const newZoom = Math.min(720 / bw, 520 / bh, 2)
  zoom.value = newZoom
  // Centre la scène en (400, 300) : panOffset.x = (VIEW_CX - cx) * newZoom
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  panOffset.x = (VIEW_CX - cx) * newZoom
  panOffset.y = (VIEW_CY - cy) * newZoom
  userAdjusted = false
}

onMounted(() => nextTick(fitToScene))
watch(
  () => store.zonesSorted.value.map((z) => `${z.id}:${z.width}x${z.length}`).join('|'),
  () => { if (!userAdjusted) nextTick(fitToScene) },
)
</script>

<style scoped>
/* Contrôles flottants (zoom / rotation) : overlay collé en haut à droite du
   canvas, au-dessus du SVG (reste en place pendant le pan / zoom). */
.iso-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  padding: 4px;
  border-radius: 12px;
  background: rgba(var(--v-theme-surface), 0.82);
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}

.b2-iso-canvas {
  cursor: move;
  display: block;
  width: 100%;
  height: 100%;
}

.b2-iso-label {
  user-select: none;
  pointer-events: none;
  font-weight: 500;
}

.b2-iso-el-label {
  user-select: none;
  pointer-events: none;
  font-weight: 500;
}
</style>
