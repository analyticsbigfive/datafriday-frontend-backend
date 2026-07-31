<template>
  <div class="d-flex flex-column h-100">
    <div v-if="!floor" class="d-flex align-center justify-center h-100 text-medium-emphasis text-body-2">
      {{ t('b2SelectZoneToShowPlan') }}
    </div>

    <template v-else>
    <div class="d-flex align-items-center mb-3 gap-2 px-3 pt-3">

      <!-- Col 1 : Nom du floor -->
      <div class="flex-shrink-0" style="min-width: 0;">
        <h2 class="h5 mb-0 text-truncate">{{ floor.name }} </h2>
      </div>&nbsp;&nbsp;

      <!-- Col 2 : Dimensions (côte à côte avec le nom, lecture seule) -->
      <div class="d-flex align-items-center">
        <div class="small">
          {{ floor.width }}m × {{ floor.length }}m
          <span v-if="selectedTool" class="ms-3 text-primary">{{ t('b2DrawingLabel') }} {{ selectedTool }}</span>
        </div>
      </div>

      <!-- Col 3 : Boutons d'actions (alignés à droite) -->
      <div class="d-flex justify-content-end gap-2" style="flex-basis: 0; flex-grow: 1;">
        <v-btn
          v-if="selectedElementId"
          size="small"
          variant="outlined"
          icon
          @click="handleRotateElement"
          :title="t('b2RotateElementTitle')"
        >
          <RotateCw :size="16" />
        </v-btn>
        <v-btn
          v-if="selectedElementId"
          size="small"
          variant="outlined"
          icon
          @click="handleOpenRadiusDialog"
          :title="t('b2EditCornerRadiusTitle')"
        >
          <Circle :size="16" />
        </v-btn>
        <v-btn
          v-if="selectedElementId && onShowElementProperties"
          size="small"
          variant="outlined"
          icon
          @click="onShowElementProperties"
          :title="t('b2ViewPropertiesTitle')"
          class="d-md-none"
        >
          <Info :size="16" />
        </v-btn>
        <v-btn
          size="small"
          variant="outlined"
          icon
          @click="handleZoomIn"
        >
          <ZoomIn :size="16" />
        </v-btn>
        <v-btn
          size="small"
          variant="outlined"
          icon
          @click="handleZoomOut"
        >
          <ZoomOut :size="16" />
        </v-btn>
        <v-btn
          v-if="onToggleFullscreen"
          size="small"
          variant="outlined"
          icon
          @click="onToggleFullscreen"
          :title="isFullscreen ? t('b2ExitFullscreen') : t('b2EnterFullscreen')"
        >
          <Minimize v-if="isFullscreen" :size="16" />
          <Maximize v-else :size="16" />
        </v-btn>
      </div>
    </div>

    <div
      ref="containerRef"
      class="flex-fill rounded overflow-auto p-4"
      :style="{
        background: svgBgColor,
        border: `1px solid ${isDark ? '#334155' : '#e5e7eb'}`,
        cursor: isPanning ? 'grabbing' : 'default',
        WebkitOverflowScrolling: 'touch'
      }"
      @mousedown="handleContainerMouseDown"
      @mousemove="handleContainerMouseMove"
      @mouseup="handleContainerMouseUp"
      @mouseleave="handleContainerMouseUp"
      @touchstart="handleContainerTouchStart"
      @touchmove="handleContainerTouchMove"
      @touchend="handleContainerTouchEnd"
    >
      <div
        style="display: inline-flex; align-items: center; justify-content: center; min-width: 100%; min-height: 100%;"
      >
        <svg
          ref="svgRef"
          :width="viewWidth"
          :height="viewHeight"
          :style="{
            background: svgBgColor,
            display: 'block',
            touchAction: (selectedTool || isDraggingElement || isResizing || isPanning) ? 'none' : 'pan-x pan-y',
            cursor: isPanning ? 'grabbing' : (selectedTool ? 'crosshair' : 'default')
          }"
          @pointerdown="handleMouseDown"
          @pointermove="handleMouseMove"
          @pointerup="handleMouseUp"
          @pointerleave="handleMouseUp"
        >
          <!-- Grid -->
          <defs>
            <pattern
              id="grid"
              :width="Math.max(1, scale * 5)"
              :height="Math.max(1, scale * 5)"
              patternUnits="userSpaceOnUse"
            >
              <path
                :d="`M ${Math.max(1, scale * 5)} 0 L 0 0 0 ${Math.max(1, scale * 5)}`"
                fill="none"
                :stroke="gridStrokeColor"
                stroke-width="1.5"
              />
            </pattern>
            <!-- Clip path for grid - excludes hole area -->
            <clipPath id="floor-clip">
              <path :d="createFloorPathWithHole" fill-rule="evenodd" />
            </clipPath>
          </defs>
          <rect :width="Math.max(1, viewWidth)" :height="Math.max(1, viewHeight)" fill="url(#grid)" clip-path="url(#floor-clip)" />

          <!-- Floor boundary with hole -->
          <path
            :d="createFloorPathWithHole"
            fill="transparent"
            fill-rule="evenodd"
            :stroke="floorBorderColor"
            stroke-width="3"
          />

          <!-- Hole visualization (if enabled) -->
          <template v-if="floor.hole?.enabled && onUpdateFloor">
            <g>
              <!-- Invisible clickable area for hole - allows dragging from anywhere in the hole -->
              <path
                :d="createRoundedRectPath(holeX, holeY, holeWidth, holeHeight, floor.hole.cornerRadius)"
                fill="transparent"
                stroke="none"
                style="cursor: move"
                @mousedown.stop="handleHoleMouseDown"
                @touchstart.stop.prevent="handleHoleTouchStart"
              />

              <!-- Hole boundary (solid, matches floor border) -->
              <path
                :d="createRoundedRectPath(holeX, holeY, holeWidth, holeHeight, floor.hole.cornerRadius)"
                fill="none"
                :stroke="floorBorderColor"
                stroke-width="3"
                pointer-events="none"
              />

              <!-- Resize handles for hole - only show when selected -->
              <template v-if="isHoleSelected">
                <!-- SE corner -->
                <circle
                  :cx="holeX + holeWidth"
                  :cy="holeY + holeHeight"
                  :r="holeHandleRadius"
                  fill="#ff3131"
                  stroke="#ffffff"
                  stroke-width="2"
                  @mousedown.stop="handleHoleResizeMouseDown($event, 'se')"
                  @touchstart.stop.prevent="handleHoleResizeTouchStart($event, 'se')"
                  style="cursor: nwse-resize"
                />
                <!-- SW corner -->
                <circle
                  :cx="holeX"
                  :cy="holeY + holeHeight"
                  :r="holeHandleRadius"
                  fill="#ff3131"
                  stroke="#ffffff"
                  stroke-width="2"
                  @mousedown.stop="handleHoleResizeMouseDown($event, 'sw')"
                  @touchstart.stop.prevent="handleHoleResizeTouchStart($event, 'sw')"
                  style="cursor: nesw-resize"
                />
                <!-- NE corner -->
                <circle
                  :cx="holeX + holeWidth"
                  :cy="holeY"
                  :r="holeHandleRadius"
                  fill="#ff3131"
                  stroke="#ffffff"
                  stroke-width="2"
                  @mousedown.stop="handleHoleResizeMouseDown($event, 'ne')"
                  @touchstart.stop.prevent="handleHoleResizeTouchStart($event, 'ne')"
                  style="cursor: nesw-resize"
                />
                <!-- NW corner -->
                <circle
                  :cx="holeX"
                  :cy="holeY"
                  :r="holeHandleRadius"
                  fill="#ff3131"
                  stroke="#ffffff"
                  stroke-width="2"
                  @mousedown.stop="handleHoleResizeMouseDown($event, 'nw')"
                  @touchstart.stop.prevent="handleHoleResizeTouchStart($event, 'nw')"
                  style="cursor: nwse-resize"
                />
              </template>
            </g>
          </template>

          <!-- Grid labels -->
          <text
            v-for="i in Math.max(0, Math.ceil((floor.width || 100) / 5) + 1)"
            :key="`x-${i}`"
            :x="i * scale * 5"
            :y="viewHeight + 15"
            class="small"
            fill="#6b7280"
            text-anchor="middle"
          >
            {{ i * 5 }}m
          </text>
          <text
            v-for="i in Math.max(0, Math.ceil((floor.length || 100) / 5) + 1)"
            :key="`y-${i}`"
            x="-10"
            :y="i * scale * 5"
            class="small"
            fill="#6b7280"
            text-anchor="end"
            dominant-baseline="middle"
          >
            {{ i * 5 }}m
          </text>

          <!-- Existing elements -->
          <g
            v-for="element in visibleElements"
            :key="element.id"
          >
            <g :transform="`rotate(${element.rotation || 0} ${element.x * scale + (element.width * scale) / 2} ${element.y * scale + (element.depth * scale) / 2})`">
              <path
                :d="createRoundedRectPath(
                  element.x * scale,
                  element.y * scale,
                  element.width * scale,
                  element.depth * scale,
                  element.cornerRadius
                )"
                :fill="(element.id === selectedElementId || isElementHighlighted(element) || highlightedElementIds.includes(element.id)) ? getDarkerColor(element.type) : getElementColor(element.type)"
                :fill-opacity="(element.id === selectedElementId || isElementHighlighted(element) || highlightedElementIds.includes(element.id)) ? '0.8' : '0.5'"
                :stroke="(element.id === selectedElementId || isElementHighlighted(element) || highlightedElementIds.includes(element.id)) ? getDarkerColor(element.type) : getElementColor(element.type)"
                :stroke-width="(element.id === selectedElementId || isElementHighlighted(element) || highlightedElementIds.includes(element.id)) ? '3' : '2'"
                @pointerdown="handleElementMouseDown($event, element)"
                :style="{ cursor: selectedTool ? 'pointer' : 'move' }"
              />
              <!-- Resize handles -->
              <template v-if="element.id === selectedElementId">
                <circle
                  :cx="(element.x || 0) * scale + (element.width || 0) * scale"
                  :cy="(element.y || 0) * scale + (element.depth || 0) * scale"
                  :r="elementHandleRadius"
                  :fill="getElementColor(element.type)"
                  stroke="#ffffff"
                  stroke-width="2"
                  @pointerdown.stop="handleResizeMouseDown($event, element, 'se')"
                  style="cursor: nwse-resize"
                />
                <circle
                  :cx="(element.x || 0) * scale"
                  :cy="(element.y || 0) * scale + (element.depth || 0) * scale"
                  :r="elementHandleRadius"
                  :fill="getElementColor(element.type)"
                  stroke="#ffffff"
                  stroke-width="2"
                  @pointerdown.stop="handleResizeMouseDown($event, element, 'sw')"
                  style="cursor: nesw-resize"
                />
                <circle
                  :cx="(element.x || 0) * scale + (element.width || 0) * scale"
                  :cy="(element.y || 0) * scale"
                  :r="elementHandleRadius"
                  :fill="getElementColor(element.type)"
                  stroke="#ffffff"
                  stroke-width="2"
                  @pointerdown.stop="handleResizeMouseDown($event, element, 'ne')"
                  style="cursor: nesw-resize"
                />
                <circle
                  :cx="(element.x || 0) * scale"
                  :cy="(element.y || 0) * scale"
                  :r="elementHandleRadius"
                  :fill="getElementColor(element.type)"
                  stroke="#ffffff"
                  stroke-width="2"
                  @pointerdown.stop="handleResizeMouseDown($event, element, 'nw')"
                  style="cursor: nwse-resize"
                />
              </template>
            </g>
            <text
              :x="element.x * scale + (element.width * scale) / 2"
              :y="element.y * scale + element.depth * scale + 12"
              class="small"
              :fill="(element.id === selectedElementId || isElementHighlighted(element) || highlightedElementIds.includes(element.id)) ? getDarkerColor(element.type) : getElementColor(element.type)"
              text-anchor="middle"
              dominant-baseline="hanging"
              pointer-events="none"
            >
              {{ element.name }}
            </text>
          </g>

          <!-- New element being drawn -->
          <rect
            v-if="newElement && selectedTool"
            :x="newElement.x"
            :y="newElement.y"
            :width="newElement.width"
            :height="newElement.height"
            :fill="getElementColor(selectedTool)"
            fill-opacity="0.3"
            :stroke="getElementColor(selectedTool)"
            stroke-width="2"
            stroke-dasharray="5,5"
          />
        </svg>
      </div>
    </div>
    </template>

    <!-- Corner Radius Dialog -->
    <v-dialog v-model="showRadiusDialog" max-width="500">
      <v-card>
        <v-card-title>{{ t('b2EditCornerRadiusTitle') }}</v-card-title>
        <v-card-text>
          <div class="d-flex align-items-center mb-4">
            <v-checkbox
              v-model="applyToAllCorners"
              :label="t('b2ApplySameRadiusAllCorners')"
              hide-details
            />
          </div>

          <template v-if="applyToAllCorners">
            <v-text-field
              v-model.number="radiusValues.topLeft"
              :label="t('b2CornerRadiusM')"
              type="number"
              :min="0"
              :step="0.1"
              variant="outlined"
              density="compact"
            />
          </template>
          <template v-else>
            <div class="d-flex flex-column gap-3">
              <div class="d-flex gap-3">
                <v-text-field
                  v-model.number="radiusValues.topLeft"
                  :label="t('b2CornerTopLeftFull')"
                  type="number"
                  :min="0"
                  :step="0.1"
                  variant="outlined"
                  density="compact"
                />
                <v-text-field
                  v-model.number="radiusValues.topRight"
                  :label="t('b2CornerTopRightFull')"
                  type="number"
                  :min="0"
                  :step="0.1"
                  variant="outlined"
                  density="compact"
                />
              </div>
              <div class="d-flex gap-3">
                <v-text-field
                  v-model.number="radiusValues.bottomLeft"
                  :label="t('b2CornerBottomLeftFull')"
                  type="number"
                  :min="0"
                  :step="0.1"
                  variant="outlined"
                  density="compact"
                />
                <v-text-field
                  v-model.number="radiusValues.bottomRight"
                  :label="t('b2CornerBottomRightFull')"
                  type="number"
                  :min="0"
                  :step="0.1"
                  variant="outlined"
                  density="compact"
                />
              </div>
            </div>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showRadiusDialog = false">
            {{ t('cancel') }}
          </v-btn>
          <v-btn color="primary" variant="flat" @click="handleSaveRadius">
            {{ t('save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </div>
</template>

<script setup>
import { ref, computed, reactive, inject, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useStore as useVuexStore } from 'vuex'
import { useTheme } from 'vuetify'
import {
  ZoomIn, ZoomOut, RotateCw, Minimize, Maximize,
  Circle, Info,
} from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { containElementInZone } from '../../composables/useIsoProjection'
import { usePlanInteractions } from '../../composables/usePlanInteractions'
import { buildTools, colorOf as colorOfTool, darkerColorOf as darkerColorOfTool } from '../../constants/elementTaxonomy'

const { t } = useI18n()
const store = inject('builderStore')
const vuexStore = useVuexStore()
onMounted(() => vuexStore.dispatch('departments/fetchDepartments'))
const tools = computed(() => buildTools(vuexStore.getters['departments/departments'] || []))
const svgRef       = ref(null)
const containerRef = ref(null)

// ── Thème ─────────────────────────────────────────────────────────────────────
const { global: vuetifyTheme } = useTheme()
const isDark           = computed(() => vuetifyTheme.current.value.dark ?? false)
const svgBgColor       = computed(() => isDark.value ? '#1e293b' : '#ffffff')
const gridStrokeColor  = computed(() => isDark.value ? '#334155' : '#e5e7eb')
const floorBorderColor = computed(() => isDark.value ? '#4b5563' : '#9ca3af')

// ── Alias v1 ──────────────────────────────────────────────────────────────────
// floor : expose `hole` au niveau racine pour parité v1 (v1 avait floor.hole, v2 a floor.geometry.hole)
const floor = computed(() => {
  const z = store.activeZone.value
  if (!z) return null
  return { ...z, hole: z.geometry?.hole }
})
const selectedElementId   = computed(() => store.state.selectedElementId)
const selectedTool        = computed(() => store.state.activeTool)
const isFullscreen        = computed(() => store.state.isPlanFullscreen)
const highlightedElementIds = []         // non utilisé en v2 (isElementHighlighted couvre ce cas)
const elementHandleRadius  = 8
const onUpdateFloor        = computed(() => !!floor.value) // toujours vrai quand une zone est active
const onShowElementProperties = null    // pas de panneau propriétés séparé en v2

function onToggleFullscreen() {
  store.state.isPlanFullscreen = !store.state.isPlanFullscreen
}

// ── Zoom & scale (parité v1 : baseScale=5, scale = baseScale * zoom) ──────────
const zoom_ = ref(1)
const BASE  = 5
const scale = computed(() => BASE * zoom_.value)

const viewWidth  = computed(() => Math.max(100, (floor.value?.width  || 0) * scale.value))
const viewHeight = computed(() => Math.max(100, (floor.value?.length || 0) * scale.value))

function handleZoomIn()  { zoom_.value = Math.min(zoom_.value * 1.25, 3)  }
function handleZoomOut() { zoom_.value = Math.max(zoom_.value * 0.8,  0.2) }

function fitToView() {
  if (!containerRef.value || !floor.value) return
  const w = containerRef.value.clientWidth  - 32
  const h = containerRef.value.clientHeight - 32
  const zx = w / (floor.value.width  * BASE)
  const zy = h / (floor.value.length * BASE)
  zoom_.value = Math.min(zx, zy, 1.6)
}
onMounted(() => nextTick(fitToView))
// Multi-sources (pas getter-de-tableau) : sinon fitToView rejouait à chaque
// mutation locale d'une zone (drag iso) et écrasait le zoom réglé par l'utilisateur.
watch([() => floor.value?.id, () => store.state.isPlanFullscreen], () => nextTick(fitToView))

// ── Interactions SVG (usePlanInteractions) ────────────────────────────────────
// usePlanInteractions.toWorld divise par pxPerMeter * zoom = BASE * zoom_ = scale
const pxPerMeterRef = ref(BASE)
const interactions  = usePlanInteractions(store, { svgRef, pxPerMeter: pxPerMeterRef, zoom: zoom_ })

// drawPreview en mètres → newElement en pixels (parité template v1 : newElement.x/y/width/height déjà en px)
const newElement = computed(() => {
  const p = interactions.drawPreview.value
  if (!p) return null
  return { x: p.x * scale.value, y: p.y * scale.value, width: p.width * scale.value, height: p.depth * scale.value }
})

// États derivés de l'interaction (utilisés dans le :style du SVG)
const isDraggingElement = computed(() => interactions.interaction.mode === 'moving')
const isResizing        = computed(() => interactions.interaction.mode === 'resizing')

// ── Handlers SVG (noms identiques à v1 → délèguent à usePlanInteractions) ────
function handleMouseDown(e)  { interactions.onCanvasPointerDown(e) }
function handleMouseMove(e)  { interactions.onPointerMove(e) }
function handleMouseUp()     { interactions.onPointerUp() }

function handleTouchStart(e) {
  const t = e.touches[0]
  interactions.onCanvasPointerDown({ clientX: t.clientX, clientY: t.clientY, button: 0, currentTarget: e.currentTarget })
}
function handleTouchMove(e) {
  const t = e.touches[0]
  interactions.onPointerMove({ clientX: t.clientX, clientY: t.clientY })
}
function handleTouchEnd() { interactions.onPointerUp() }

function handleElementMouseDown(e, element)  { interactions.onElementPointerDown(e, element) }
function handleElementTouchStart(e, element) {
  const t = e.touches[0]
  interactions.onElementPointerDown({ clientX: t.clientX, clientY: t.clientY, button: 0, stopPropagation: () => e.stopPropagation(), currentTarget: e.currentTarget }, element)
}

function handleResizeMouseDown(e, element, handle)  { interactions.onHandlePointerDown(e, element, handle) }
function handleResizeTouchStart(e, element, handle) {
  const t = e.touches[0]
  interactions.onHandlePointerDown({ clientX: t.clientX, clientY: t.clientY, button: 0, stopPropagation: () => e.stopPropagation(), currentTarget: e.currentTarget }, element, handle)
}

// ── Géométrie du trou ─────────────────────────────────────────────────────────
const holeHandleRadius = 8
const holeData = computed(() => floor.value?.geometry?.hole)

const holeX = computed(() => {
  const h = holeData.value, f = floor.value
  if (!h?.enabled || !f) return 0
  return h.x * viewWidth.value - (h.width * scale.value) / 2
})
const holeY = computed(() => {
  const h = holeData.value, f = floor.value
  if (!h?.enabled || !f) return 0
  return h.y * viewHeight.value - (h.length * scale.value) / 2
})
const holeWidth  = computed(() => (holeData.value?.width  || 0) * scale.value)
const holeHeight = computed(() => (holeData.value?.length || 0) * scale.value)

// ── Chemins SVG ───────────────────────────────────────────────────────────────
function createRoundedRectPath(x, y, w, h, cr) {
  if (!cr || (!cr.topLeft && !cr.topRight && !cr.bottomLeft && !cr.bottomRight))
    return `M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`
  const tl = Math.min((cr.topLeft    || 0) * scale.value, w/2, h/2)
  const tr = Math.min((cr.topRight   || 0) * scale.value, w/2, h/2)
  const br = Math.min((cr.bottomRight|| 0) * scale.value, w/2, h/2)
  const bl = Math.min((cr.bottomLeft || 0) * scale.value, w/2, h/2)
  return `M ${x+tl} ${y} L ${x+w-tr} ${y} Q ${x+w} ${y} ${x+w} ${y+tr} L ${x+w} ${y+h-br} Q ${x+w} ${y+h} ${x+w-br} ${y+h} L ${x+bl} ${y+h} Q ${x} ${y+h} ${x} ${y+h-bl} L ${x} ${y+tl} Q ${x} ${y} ${x+tl} ${y} Z`
}

function createRoundedRectPathCCW(x, y, w, h, cr) {
  if (!cr || (!cr.topLeft && !cr.topRight && !cr.bottomLeft && !cr.bottomRight))
    return `M ${x} ${y} L ${x} ${y+h} L ${x+w} ${y+h} L ${x+w} ${y} Z`
  const tl = Math.min((cr.topLeft    || 0) * scale.value, w/2, h/2)
  const tr = Math.min((cr.topRight   || 0) * scale.value, w/2, h/2)
  const br = Math.min((cr.bottomRight|| 0) * scale.value, w/2, h/2)
  const bl = Math.min((cr.bottomLeft || 0) * scale.value, w/2, h/2)
  return `M ${x+tl} ${y} Q ${x} ${y} ${x} ${y+tl} L ${x} ${y+h-bl} Q ${x} ${y+h} ${x+bl} ${y+h} L ${x+w-br} ${y+h} Q ${x+w} ${y+h} ${x+w} ${y+h-br} L ${x+w} ${y+tr} Q ${x+w} ${y} ${x+w-tr} ${y} Z`
}

const createFloorPathWithHole = computed(() => {
  const f = floor.value
  if (!f) return ''
  const outer = createRoundedRectPath(0, 0, Math.max(1, viewWidth.value), Math.max(1, viewHeight.value), f.geometry?.cornerRadius)
  const h = f.geometry?.hole
  if (!h?.enabled) return outer
  const hx = h.x * viewWidth.value  - (h.width  * scale.value) / 2
  const hy = h.y * viewHeight.value - (h.length * scale.value) / 2
  return `${outer} ${createRoundedRectPathCCW(hx, hy, h.width * scale.value, h.length * scale.value, h.cornerRadius)}`
})

// ── Éléments visibles ─────────────────────────────────────────────────────────
const visibleElements = computed(() => {
  if (!floor.value) return []
  return store.visibleElementsOfZone(floor.value.id).map((el) => ({
    ...el,
    ...containElementInZone(el, floor.value),
  }))
})

// ── Couleurs — CFG-2 Étape 5 : dérivées du référentiel global Department (elementTaxonomy.js),
// plus de map locale codée en dur.
function getElementColor(type) {
  return colorOfTool(type, tools.value)
}
function getDarkerColor(type) {
  return darkerColorOfTool(type, tools.value)
}
function isElementHighlighted(element) {
  const tool = selectedTool.value
  if (!tool || element.type !== tool) return false
  const subs = store.state.activeSubtypes[tool] || []
  if (subs.length === 0) return true
  return (element.subtypes || []).some((s) => subs.includes(s))
}


// ── Rotation / coins arrondis ─────────────────────────────────────────────────
function handleRotateElement() { store.rotateSelected(15) }

const showRadiusDialog  = ref(false)
const applyToAllCorners = ref(false)
const radiusValues = reactive({ topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 })

function handleOpenRadiusDialog() {
  const el = store.selectedElement.value
  if (!el) return
  const r = el.cornerRadius || {}
  radiusValues.topLeft     = r.topLeft     || 0
  radiusValues.topRight    = r.topRight    || 0
  radiusValues.bottomLeft  = r.bottomLeft  || 0
  radiusValues.bottomRight = r.bottomRight || 0
  applyToAllCorners.value = false
  showRadiusDialog.value  = true
}
function handleSaveRadius() {
  const el = store.selectedElement.value
  if (!el) return
  const prev = el.cornerRadius || { topLeft:0, topRight:0, bottomLeft:0, bottomRight:0 }
  const v    = radiusValues.topLeft
  const next = applyToAllCorners.value
    ? { topLeft: v, topRight: v, bottomLeft: v, bottomRight: v }
    : { ...radiusValues }
  store.commitElementPatch(el.id, { cornerRadius: next }, { cornerRadius: prev }, 'Coins arrondis')
  showRadiusDialog.value = false
}

// ── Hole mouse handlers ───────────────────────────────────────────────────────
const isHoleSelected   = ref(false)
const isDraggingHole   = ref(false)
const holeDragOffset   = ref(null)
const isResizingHole   = ref(false)
const holeResizeHandle = ref(null)
const holeResizeStart  = ref(null)

function getSvgPos(e) {
  if (!svgRef.value) return { x: 0, y: 0 }
  const rect = svgRef.value.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (viewWidth.value  / rect.width),
    y: (e.clientY - rect.top)  * (viewHeight.value / rect.height),
  }
}

function getTouchSvgPos(e) {
  const t = e.touches ? e.touches[0] : e.changedTouches[0]
  return getSvgPos({ clientX: t.clientX, clientY: t.clientY })
}

function handleHoleTouchStart(e) {
  const pos = getTouchSvgPos(e)
  const h = holeData.value, f = floor.value
  isHoleSelected.value = true
  isDraggingHole.value = true
  holeDragOffset.value = { x: pos.x / scale.value - h.x * f.width, y: pos.y / scale.value - h.y * f.length }
}
function handleHoleResizeTouchStart(e, handle) {
  const pos = getTouchSvgPos(e)
  const h = holeData.value
  isHoleSelected.value   = true
  isResizingHole.value   = true
  holeResizeHandle.value = handle
  holeResizeStart.value  = { x: pos.x / scale.value, y: pos.y / scale.value, width: h.width, length: h.length }
}

function handleHoleMouseDown(e) {
  e.stopPropagation()
  isHoleSelected.value = true
  const pos = getSvgPos(e)
  const h = holeData.value, f = floor.value
  isDraggingHole.value = true
  holeDragOffset.value = {
    x: pos.x / scale.value - h.x * f.width,
    y: pos.y / scale.value - h.y * f.length,
  }
}
function handleHoleResizeMouseDown(e, handle) {
  e.stopPropagation()
  isHoleSelected.value   = true
  const pos = getSvgPos(e)
  const h = holeData.value
  isResizingHole.value   = true
  holeResizeHandle.value = handle
  holeResizeStart.value  = { x: pos.x / scale.value, y: pos.y / scale.value, width: h.width, length: h.length }
}

function onWindowMouseMove(e) {
  if (!isDraggingHole.value && !isResizingHole.value) return
  const pos = getSvgPos(e)
  const f   = floor.value
  const h   = holeData.value
  if (!h?.enabled || !f) return

  if (isDraggingHole.value && holeDragOffset.value) {
    const nx = Math.max(0.1, Math.min(0.9, (pos.x / scale.value - holeDragOffset.value.x) / f.width))
    const ny = Math.max(0.1, Math.min(0.9, (pos.y / scale.value - holeDragOffset.value.y) / f.length))
    store.patchZoneLocal(f.id, { geometry: { ...(f.geometry||{}), hole: { ...h, x: nx, y: ny } } })
  } else if (isResizingHole.value && holeResizeStart.value) {
    const dx = pos.x / scale.value - holeResizeStart.value.x
    const dy = pos.y / scale.value - holeResizeStart.value.y
    let nw = holeResizeStart.value.width, nl = holeResizeStart.value.length
    if (holeResizeHandle.value === 'se') { nw = Math.max(1, nw + dx*2); nl = Math.max(1, nl + dy*2) }
    if (holeResizeHandle.value === 'sw') { nw = Math.max(1, nw - dx*2); nl = Math.max(1, nl + dy*2) }
    if (holeResizeHandle.value === 'ne') { nw = Math.max(1, nw + dx*2); nl = Math.max(1, nl - dy*2) }
    if (holeResizeHandle.value === 'nw') { nw = Math.max(1, nw - dx*2); nl = Math.max(1, nl - dy*2) }
    store.patchZoneLocal(f.id, { geometry: { ...(f.geometry||{}), hole: { ...h, width: nw, length: nl } } })
  }
}
function onWindowMouseUp() {
  isDraggingHole.value = false; holeDragOffset.value   = null
  isResizingHole.value = false; holeResizeHandle.value = null; holeResizeStart.value = null
}

// ── Container scroll pan ──────────────────────────────────────────────────────
const isPanning    = ref(false)
const panStart_    = ref(null)
const scrollStart_ = ref(null)

function handleContainerMouseDown(e) {
  if (!containerRef.value) return
  if (e.target === svgRef.value || svgRef.value?.contains(e.target)) return
  if (e.target.tagName === 'BUTTON' || e.target.closest?.('button')) return
  const el = containerRef.value
  if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return
  e.preventDefault()
  isPanning.value    = true
  panStart_.value    = { x: e.clientX, y: e.clientY }
  scrollStart_.value = { scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
}
function handleContainerMouseMove(e) {
  if (!isPanning.value || !panStart_.value || !containerRef.value) return
  e.preventDefault()
  containerRef.value.scrollLeft = scrollStart_.value.scrollLeft - (e.clientX - panStart_.value.x)
  containerRef.value.scrollTop  = scrollStart_.value.scrollTop  - (e.clientY - panStart_.value.y)
}
function handleContainerMouseUp() {
  isPanning.value = false; panStart_.value = null; scrollStart_.value = null
}
function handleContainerTouchStart(e) {
  if (!containerRef.value) return
  if (e.target === svgRef.value || svgRef.value?.contains(e.target)) return
  const el = containerRef.value
  if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return
  const t = e.touches[0]
  isPanning.value    = true
  panStart_.value    = { x: t.clientX, y: t.clientY }
  scrollStart_.value = { scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
}
function handleContainerTouchMove(e) {
  if (!isPanning.value || !panStart_.value || !containerRef.value) return
  const t = e.touches[0]
  containerRef.value.scrollLeft = scrollStart_.value.scrollLeft - (t.clientX - panStart_.value.x)
  containerRef.value.scrollTop  = scrollStart_.value.scrollTop  - (t.clientY - panStart_.value.y)
}
function handleContainerTouchEnd() {
  isPanning.value = false; panStart_.value = null; scrollStart_.value = null
}

// ── Keyboard (Backspace → désactiver le trou) ─────────────────────────────────
function handleKeyDown(e) {
  if (['INPUT','TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return
  if (e.key === 'Backspace' && isHoleSelected.value && floor.value) {
    e.preventDefault()
    store.commitZonePatch(
      floor.value.id,
      { geometry: { ...(floor.value.geometry||{}), hole: { ...holeData.value, enabled: false } } },
      { geometry: floor.value.geometry },
      'Disable hole',
    )
    isHoleSelected.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
})
</script>
