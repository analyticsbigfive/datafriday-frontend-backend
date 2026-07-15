<template>
  <div class="d-flex flex-column h-100">
    <div class="d-flex align-items-center mb-3 gap-2">

      <!-- Col 1 : Nom du floor -->
      <div class="flex-fill" style="flex-basis: 0; min-width: 0;">
        <h2 class="h5 mb-0 text-truncate">{{ floor.name }} - Plan</h2>
      </div>

      <!-- Col 2 : Dimensions (centré) -->
      <div class="d-flex justify-content-center" style="flex-basis: 0; flex-grow: 1;">
        <div v-if="isEditingDimensions && onUpdateFloor" class="d-flex align-items-center gap-2 small">
          <v-text-field
            v-model.number="editedWidth"
            type="number"
            :min="10"
            :max="500"
            density="compact"
            variant="outlined"
            hide-details
            style="width: 90px"
          />
          <span>m ×</span>
          <v-text-field
            v-model.number="editedLength"
            type="number"
            :min="10"
            :max="500"
            density="compact"
            variant="outlined"
            hide-details
            style="width: 90px"
          />
          <span>m</span>
          <v-btn
            size="small"
            variant="text"
            icon
            @click="handleSaveDimensions"
          >
            <Check :size="16" />
          </v-btn>
          <v-btn
            size="small"
            variant="text"
            icon
            @click="handleCancelDimensions"
          >
            <X :size="16" />
          </v-btn>
        </div>
        <!-- Display dimensions -->
        <div
          v-else
          :class="onUpdateFloor ? 'small px-2 py-1 rounded' : 'small'"
          :style="{ ...dimensionBadgeStyle, ...(onUpdateFloor ? { cursor: 'pointer' } : {}) }"
          @click="onUpdateFloor && (isEditingDimensions = true)"
          :title="onUpdateFloor ? 'Click to edit dimensions' : undefined"
          @mouseenter="onUpdateFloor && ($event.target.style.backgroundColor = '#f0f0f0')"
          @mouseleave="onUpdateFloor && ($event.target.style.backgroundColor = dimensionBadgeStyle.backgroundColor)"
        >
          {{ floor.width }}m × {{ floor.length }}m
          <span v-if="selectedTool" class="ms-3 text-primary">Drawing: {{ selectedTool }}</span>
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
          title="Rotate element 15°"
        >
          <RotateCw :size="16" />
        </v-btn>
        <v-btn
          v-if="selectedElementId"
          size="small"
          variant="outlined"
          icon
          @click="handleOpenRadiusDialog"
          title="Edit corner radius"
        >
          <Circle :size="16" />
        </v-btn>
        <v-btn
          v-if="selectedElementId && onShowElementProperties"
          size="small"
          variant="outlined"
          icon
          @click="onShowElementProperties"
          title="View properties"
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
          :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
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
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseUp"
          @touchstart="handleTouchStart"
          @touchmove="handleTouchMove"
          @touchend="handleTouchEnd"
          @touchcancel="handleTouchEnd"
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
                @mousedown="handleElementMouseDown($event, element)"
                @touchstart="handleElementTouchStart($event, element)"
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
                  @mousedown.stop="handleResizeMouseDown($event, element, 'se')"
                  @touchstart.stop.prevent="handleResizeTouchStart($event, element, 'se')"
                  style="cursor: nwse-resize"
                />
                <circle
                  :cx="(element.x || 0) * scale"
                  :cy="(element.y || 0) * scale + (element.depth || 0) * scale"
                  :r="elementHandleRadius"
                  :fill="getElementColor(element.type)"
                  stroke="#ffffff"
                  stroke-width="2"
                  @mousedown.stop="handleResizeMouseDown($event, element, 'sw')"
                  @touchstart.stop.prevent="handleResizeTouchStart($event, element, 'sw')"
                  style="cursor: nesw-resize"
                />
                <circle
                  :cx="(element.x || 0) * scale + (element.width || 0) * scale"
                  :cy="(element.y || 0) * scale"
                  :r="elementHandleRadius"
                  :fill="getElementColor(element.type)"
                  stroke="#ffffff"
                  stroke-width="2"
                  @mousedown.stop="handleResizeMouseDown($event, element, 'ne')"
                  @touchstart.stop.prevent="handleResizeTouchStart($event, element, 'ne')"
                  style="cursor: nesw-resize"
                />
                <circle
                  :cx="(element.x || 0) * scale"
                  :cy="(element.y || 0) * scale"
                  :r="elementHandleRadius"
                  :fill="getElementColor(element.type)"
                  stroke="#ffffff"
                  stroke-width="2"
                  @mousedown.stop="handleResizeMouseDown($event, element, 'nw')"
                  @touchstart.stop.prevent="handleResizeTouchStart($event, element, 'nw')"
                  style="cursor: nwse-resize"
                />
              </template>
            </g>
            <text
              :x="element.x * scale + (element.width * scale) / 2"
              :y="element.y * scale + (element.depth * scale) / 2"
              class="small"
              :fill="(element.id === selectedElementId || isElementHighlighted(element) || highlightedElementIds.includes(element.id)) ? getDarkerColor(element.type) : getElementColor(element.type)"
              text-anchor="middle"
              dominant-baseline="middle"
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

    <!-- Corner Radius Dialog -->
    <v-dialog v-model="showRadiusDialog" max-width="500">
      <v-card>
        <v-card-title>Edit Corner Radius</v-card-title>
        <v-card-text>
          <div class="d-flex align-items-center mb-4">
            <v-checkbox
              v-model="applyToAllCorners"
              label="Apply same radius to all corners"
              hide-details
            />
          </div>

          <template v-if="applyToAllCorners">
            <v-text-field
              v-model.number="radiusValues.topLeft"
              label="Corner Radius (m)"
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
                  label="Top Left (m)"
                  type="number"
                  :min="0"
                  :step="0.1"
                  variant="outlined"
                  density="compact"
                />
                <v-text-field
                  v-model.number="radiusValues.topRight"
                  label="Top Right (m)"
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
                  label="Bottom Left (m)"
                  type="number"
                  :min="0"
                  :step="0.1"
                  variant="outlined"
                  density="compact"
                />
                <v-text-field
                  v-model.number="radiusValues.bottomRight"
                  label="Bottom Right (m)"
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
            Cancel
          </v-btn>
          <v-btn color="primary" variant="flat" @click="handleSaveRadius">
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </div>
</template>

<script>
import { watch, nextTick } from 'vue'
import { RotateCw, ZoomIn, ZoomOut, Minimize, Maximize, Check, Info, Circle, X } from 'lucide-vue-next'
import { useTheme } from 'vuetify'

export default {
  name: 'FloorPlanBuilderView',
  components: {
    RotateCw,
    ZoomIn,
    ZoomOut,
    Minimize,
    Maximize,
    Check,
    Info,
    Circle,
    X,
  },
  setup() {
    const { global: vuetifyTheme } = useTheme();
    return { vuetifyTheme };
  },
  props: {
    floor: {
      type: Object,
      required: true,
    },
    selectedElementId: {
      type: String,
      default: null,
    },
    selectedTool: {
      type: String,
      default: null,
    },
    selectedStorageTypes: {
      type: Array,
      default: () => [],
    },
    selectedShopTypes: {
      type: Array,
      default: () => [],
    },
    selectedHospitalityTypes: {
      type: Array,
      default: () => [],
    },
    selectedMerchTypes: {
      type: Array,
      default: () => [],
    },
    selectedAccessTypes: {
      type: Array,
      default: () => [],
    },
    selectedEntertainmentTypes: {
      type: Array,
      default: () => [],
    },
    selectedEntranceTypes: {
      type: Array,
      default: () => [],
    },
    selectedKitchenTypes: {
      type: Array,
      default: () => [],
    },
    highlightedElementIds: {
      type: Array,
      default: () => [],
    },
    currentConfigId: {
      type: String,
      default: null,
    },
    onSelectElement: {
      type: Function,
      required: true,
    },
    onAddElement: {
      type: Function,
      required: true,
    },
    onUpdateElement: {
      type: Function,
      required: true,
    },
    onUpdateFloor: {
      type: Function,
      default: null,
    },
    onShowElementProperties: {
      type: Function,
      default: null,
    },
    isFullscreen: {
      type: Boolean,
      default: false,
    },
    onToggleFullscreen: {
      type: Function,
      default: null,
    },
  },
  data() {
    return {
      isDragging: false,
      dragStart: null,
      newElement: null,
      isDraggingElement: false,
      draggedElementId: null,
      elementDragOffset: null,
      isResizing: false,
      resizeHandle: null,
      resizeStart: null,
      zoom: 1,
      isPanning: false,
      panStart: null,
      scrollStart: null,
      isDraggingHole: false,
      holeDragOffset: null,
      isResizingHole: false,
      holeResizeHandle: null,
      holeResizeStart: null,
      isHoleSelected: false,
      showRadiusDialog: false,
      radiusValues: {
        topLeft: 0,
        topRight: 0,
        bottomLeft: 0,
        bottomRight: 0,
      },
      applyToAllCorners: false,
      isEditingDimensions: false,
      editedWidth: this.floor.width,
      editedLength: this.floor.length,
      touchStartPos: null,
      isTouchingCorner: false,
    }
  },
  computed: {
    visibleElements() {
      const elements = this.floor.elements || [];
      if (!this.currentConfigId) return elements;
      return elements.filter(el => {
        const ids = el.configurationIds;
        if (!Array.isArray(ids) || ids.length === 0) return true;
        return ids.includes(this.currentConfigId);
      });
    },
    isDark() {
      return this.vuetifyTheme?.current.value.dark ?? false;
    },
    svgBgColor() {
      return this.isDark ? '#1e293b' : '#ffffff';
    },
    gridStrokeColor() {
      return this.isDark ? '#334155' : '#e5e7eb';
    },
    floorBorderColor() {
      return this.isDark ? '#4b5563' : '#9ca3af';
    },
    dimensionBadgeStyle() {
      return {
        backgroundColor: 'white',
        color: '#374151',
        border: '1px solid #e5e7eb',
      };
    },
    baseScale() {
      return 5
    },
    scale() {
      return this.baseScale * this.zoom
    },
    viewWidth() {
      return Math.max(100, (this.floor.width || 100) * this.scale)
    },
    viewHeight() {
      return Math.max(100, (this.floor.length || 100) * this.scale)
    },
    holeX() {
      if (!this.floor.hole) return 0
      return this.floor.hole.x * this.viewWidth - (this.floor.hole.width * this.scale) / 2
    },
    holeY() {
      if (!this.floor.hole) return 0
      return this.floor.hole.y * this.viewHeight - (this.floor.hole.length * this.scale) / 2
    },
    holeWidth() {
      if (!this.floor.hole) return 0
      return this.floor.hole.width * this.scale
    },
    holeHeight() {
      if (!this.floor.hole) return 0
      return this.floor.hole.length * this.scale
    },
    holeHandleRadius() {
      return 8
    },
    elementHandleRadius() {
      return 8
    },
    createFloorPathWithHole() {
      const outerPath = this.createRoundedRectPath(
        0,
        0,
        Math.max(1, this.viewWidth),
        Math.max(1, this.viewHeight),
        this.floor.cornerRadius,
      )

      const floorWithHole = this.floor
      if (!floorWithHole.hole?.enabled) {
        return outerPath
      }

      const hole = floorWithHole.hole
      const holeX = hole.x * this.viewWidth - (hole.width * this.scale) / 2
      const holeY = hole.y * this.viewHeight - (hole.length * this.scale) / 2

      const innerPath = this.createRoundedRectPathCounterClockwise(
        holeX,
        holeY,
        hole.width * this.scale,
        hole.length * this.scale,
        hole.cornerRadius,
      )

      return `${outerPath} ${innerPath}`
    },
  },
  mounted() {
    this.editedWidth = this.floor.width
    this.editedLength = this.floor.length

    this.$nextTick(() => {
      if (this.$refs.containerRef) {
        const containerWidth = this.$refs.containerRef.clientWidth - 32
        const containerHeight = this.$refs.containerRef.clientHeight - 32
        const zoomX = containerWidth / (this.floor.width * this.baseScale)
        const zoomY = containerHeight / (this.floor.length * this.baseScale)
        const initialZoom = Math.min(zoomX, zoomY, 1)
        this.zoom = initialZoom
      }
    })

    const handleKeyDown = (e) => {
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        return
      }

      if (e.key === 'Backspace') {
        if (this.isHoleSelected && this.onUpdateFloor && 'hole' in this.floor) {
          e.preventDefault()
          this.onUpdateFloor({
            hole: {
              ...this.floor.hole,
              enabled: false,
            },
          })
          this.isHoleSelected = false
        } else if (this.selectedElementId) {
          const element = this.floor.elements.find((el) => el.id === this.selectedElementId)
          if (element) {
            const event = new CustomEvent('deleteElement', { detail: this.selectedElementId })
            window.dispatchEvent(event)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    this._handleKeyDown = handleKeyDown

    this.$watch(
      () => this.floor.hole?.enabled,
      (newEnabled) => {
        if (this.isHoleSelected && !newEnabled) {
          this.isHoleSelected = false
        }
      },
    )
  },

  beforeUnmount() {
    if (this._handleKeyDown) {
      window.removeEventListener('keydown', this._handleKeyDown)
    }
  },
  watch: {
    'floor.width'(newWidth) {
      this.editedWidth = newWidth
    },
    'floor.length'(newLength) {
      this.editedLength = newLength
    },
  },
  methods: {
    isElementHighlighted(element) {
      if (!this.selectedTool) return false
      if (element.type !== this.selectedTool) return false

      if (element.type === 'shop') {
        if (this.selectedShopTypes.length === 0) return true
        return element.shopType?.some((type) => this.selectedShopTypes.includes(type)) || false
      }
      if (element.type === 'storage') {
        if (this.selectedStorageTypes.length === 0) return true
        return element.storageType?.some((type) => this.selectedStorageTypes.includes(type)) || false
      }
      if (element.type === 'hospitality') {
        if (this.selectedHospitalityTypes.length === 0) return true
        return element.hospitalityType?.some((type) => this.selectedHospitalityTypes.includes(type)) || false
      }
      if (element.type === 'merchshop') {
        if (this.selectedMerchTypes.length === 0) return true
        return element.merchType?.some((type) => this.selectedMerchTypes.includes(type)) || false
      }
      if (element.type === 'access') {
        if (this.selectedAccessTypes.length === 0) return true
        return element.accessType?.some((type) => this.selectedAccessTypes.includes(type)) || false
      }
      if (element.type === 'entertainment') {
        if (this.selectedEntertainmentTypes.length === 0) return true
        return element.entertainmentType?.some((type) => this.selectedEntertainmentTypes.includes(type)) || false
      }
      if (element.type === 'entrance') {
        if (this.selectedEntranceTypes.length === 0) return true
        return element.entranceType?.some((type) => this.selectedEntranceTypes.includes(type)) || false
      }
      if (element.type === 'kitchen') {
        if (this.selectedKitchenTypes.length === 0) return true
        return element.kitchenType?.some((type) => this.selectedKitchenTypes.includes(type)) || false
      }
      return true
    },
    handleZoomIn() {
      this.zoom = Math.min(this.zoom * 1.25, 3)
    },
    handleZoomOut() {
      this.zoom = Math.max(this.zoom * 0.8, 0.2)
    },
    handleOpenRadiusDialog() {
      if (!this.selectedElementId) return
      const element = this.floor.elements.find((e) => e.id === this.selectedElementId)
      if (!element) return

      this.radiusValues = element.cornerRadius || {
        topLeft: 0,
        topRight: 0,
        bottomLeft: 0,
        bottomRight: 0,
      }
      this.applyToAllCorners = false
      this.showRadiusDialog = true
    },
    handleSaveRadius() {
      if (!this.selectedElementId) return

      let finalRadius
      if (this.applyToAllCorners) {
        const value = this.radiusValues.topLeft
        finalRadius = {
          topLeft: value,
          topRight: value,
          bottomLeft: value,
          bottomRight: value,
        }
      } else {
        finalRadius = { ...this.radiusValues }
      }

      this.onUpdateElement(this.selectedElementId, { cornerRadius: finalRadius })
      this.showRadiusDialog = false
    },
    handleSaveDimensions() {
      if (this.onUpdateFloor) {
        this.onUpdateFloor({ width: this.editedWidth, length: this.editedLength })
      }
      this.isEditingDimensions = false
    },
    handleCancelDimensions() {
      this.editedWidth = this.floor.width
      this.editedLength = this.floor.length
      this.isEditingDimensions = false
    },
    handleRotateElement() {
      if (!this.selectedElementId) return
      const element = this.floor.elements.find((e) => e.id === this.selectedElementId)
      if (!element) return

      const currentRotation = element.rotation || 0
      this.onUpdateElement(this.selectedElementId, {
        rotation: (currentRotation + 15) % 360,
      })
    },
    getMousePosition(e) {
      if (!this.$refs.svgRef) return { x: 0, y: 0 }
      const rect = this.$refs.svgRef.getBoundingClientRect()
      const scaleX = this.viewWidth / rect.width
      const scaleY = this.viewHeight / rect.height
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    },
    getTouchPosition(e) {
      if (!this.$refs.svgRef || (!e.touches && !e.changedTouches)) return { x: 0, y: 0 }
      const rect = this.$refs.svgRef.getBoundingClientRect()
      const touch = e.touches ? e.touches[0] : e.changedTouches[0]
      const scaleX = this.viewWidth / rect.width
      const scaleY = this.viewHeight / rect.height
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      }
    },
    createRoundedRectPath(x, y, width, height, cornerRadius) {
      if (
        !cornerRadius ||
        (cornerRadius.topLeft === 0 &&
          cornerRadius.topRight === 0 &&
          cornerRadius.bottomLeft === 0 &&
          cornerRadius.bottomRight === 0)
      ) {
        return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`
      }

      const tl = Math.min(cornerRadius.topLeft * this.scale, width / 2, height / 2)
      const tr = Math.min(cornerRadius.topRight * this.scale, width / 2, height / 2)
      const br = Math.min(cornerRadius.bottomRight * this.scale, width / 2, height / 2)
      const bl = Math.min(cornerRadius.bottomLeft * this.scale, width / 2, height / 2)

      return `
        M ${x + tl} ${y}
        L ${x + width - tr} ${y}
        Q ${x + width} ${y} ${x + width} ${y + tr}
        L ${x + width} ${y + height - br}
        Q ${x + width} ${y + height} ${x + width - br} ${y + height}
        L ${x + bl} ${y + height}
        Q ${x} ${y + height} ${x} ${y + height - bl}
        L ${x} ${y + tl}
        Q ${x} ${y} ${x + tl} ${y}
        Z
      `.replace(/\s+/g, ' ').trim()
    },
    createRoundedRectPathCounterClockwise(x, y, width, height, cornerRadius) {
      if (
        !cornerRadius ||
        (cornerRadius.topLeft === 0 &&
          cornerRadius.topRight === 0 &&
          cornerRadius.bottomLeft === 0 &&
          cornerRadius.bottomRight === 0)
      ) {
        return `M ${x} ${y} L ${x} ${y + height} L ${x + width} ${y + height} L ${x + width} ${y} Z`
      }

      const tl = Math.min(cornerRadius.topLeft * this.scale, width / 2, height / 2)
      const tr = Math.min(cornerRadius.topRight * this.scale, width / 2, height / 2)
      const br = Math.min(cornerRadius.bottomRight * this.scale, width / 2, height / 2)
      const bl = Math.min(cornerRadius.bottomLeft * this.scale, width / 2, height / 2)

      return `
        M ${x + tl} ${y}
        Q ${x} ${y} ${x} ${y + tl}
        L ${x} ${y + height - bl}
        Q ${x} ${y + height} ${x + bl} ${y + height}
        L ${x + width - br} ${y + height}
        Q ${x + width} ${y + height} ${x + width} ${y + height - br}
        L ${x + width} ${y + tr}
        Q ${x + width} ${y} ${x + width - tr} ${y}
        Z
      `.replace(/\s+/g, ' ').trim()
    },
    handleMouseDown(e) {
      if (!this.selectedTool) {
        this.onSelectElement(null)
        this.isHoleSelected = false
        return
      }
      const pos = this.getMousePosition(e)
      this.dragStart = pos
      this.isDragging = true
      this.newElement = { x: pos.x, y: pos.y, width: 0, height: 0 }
    },
    handleElementMouseDown(e, element) {
      e.stopPropagation()
      if (this.selectedTool) return

      this.onSelectElement(element.id)
      this.isDraggingElement = true
      this.draggedElementId = element.id

      const pos = this.getMousePosition(e)
      this.elementDragOffset = {
        x: pos.x / this.scale - element.x,
        y: pos.y / this.scale - element.y,
      }
    },
    handleResizeMouseDown(e, element, handle) {
      e.stopPropagation()
      this.isResizing = true
      this.resizeHandle = handle
      this.draggedElementId = element.id

      const pos = this.getMousePosition(e)
      this.resizeStart = {
        x: pos.x / this.scale,
        y: pos.y / this.scale,
        width: element.width,
        depth: element.depth,
        elementX: element.x,
        elementY: element.y,
      }
    },
    handleHoleMouseDown(e) {
      e.stopPropagation()
      this.isHoleSelected = true
      const pos = this.getMousePosition(e)
      this.isDraggingHole = true
      this.holeDragOffset = {
        x: pos.x / this.scale - this.floor.hole.x * this.floor.width,
        y: pos.y / this.scale - this.floor.hole.y * this.floor.length,
      }
    },
    handleHoleResizeMouseDown(e, handle) {
      e.stopPropagation()
      this.isHoleSelected = true
      const pos = this.getMousePosition(e)
      this.isResizingHole = true
      this.holeResizeHandle = handle
      this.holeResizeStart = {
        x: pos.x / this.scale,
        y: pos.y / this.scale,
        width: this.floor.hole.width,
        length: this.floor.hole.length,
        holeX: this.floor.hole.x,
        holeY: this.floor.hole.y,
      }
    },
    handleMouseMove(e) {
      if (this.isResizing && this.draggedElementId && this.resizeStart && this.resizeHandle) {
        const pos = this.getMousePosition(e)
        const currentX = pos.x / this.scale
        const currentY = pos.y / this.scale
        const deltaX = currentX - this.resizeStart.x
        const deltaY = currentY - this.resizeStart.y

        const element = this.floor.elements.find((el) => el.id === this.draggedElementId)
        if (!element) return

        let newWidth = element.width
        let newDepth = element.depth
        let newX = element.x
        let newY = element.y

        switch (this.resizeHandle) {
          case 'se':
            newWidth = Math.max(1, this.resizeStart.width + deltaX)
            newDepth = Math.max(1, this.resizeStart.depth + deltaY)
            break
          case 'sw':
            newWidth = Math.max(1, this.resizeStart.width - deltaX)
            newDepth = Math.max(1, this.resizeStart.depth + deltaY)
            newX = this.resizeStart.elementX + (this.resizeStart.width - newWidth)
            break
          case 'ne':
            newWidth = Math.max(1, this.resizeStart.width + deltaX)
            newDepth = Math.max(1, this.resizeStart.depth - deltaY)
            newY = this.resizeStart.elementY + (this.resizeStart.depth - newDepth)
            break
          case 'nw':
            newWidth = Math.max(1, this.resizeStart.width - deltaX)
            newDepth = Math.max(1, this.resizeStart.depth - deltaY)
            newX = this.resizeStart.elementX + (this.resizeStart.width - newWidth)
            newY = this.resizeStart.elementY + (this.resizeStart.depth - newDepth)
            break
        }

        newX = Math.max(0, Math.min(this.floor.width - newWidth, newX))
        newY = Math.max(0, Math.min(this.floor.length - newDepth, newY))

        this.onUpdateElement(this.draggedElementId, {
          width: newWidth,
          depth: newDepth,
          x: newX,
          y: newY,
        })
        return
      }

      if (this.isResizingHole && this.holeResizeStart && this.holeResizeHandle && this.onUpdateFloor) {
        const floorWithHole = this.floor
        if (floorWithHole.hole?.enabled) {
          const pos = this.getMousePosition(e)
          const currentX = pos.x / this.scale
          const currentY = pos.y / this.scale
          const deltaX = currentX - this.holeResizeStart.x
          const deltaY = currentY - this.holeResizeStart.y

          let newWidth = this.holeResizeStart.width
          let newLength = this.holeResizeStart.length

          switch (this.holeResizeHandle) {
            case 'se':
              newWidth = Math.max(1, this.holeResizeStart.width + deltaX * 2)
              newLength = Math.max(1, this.holeResizeStart.length + deltaY * 2)
              break
            case 'sw':
              newWidth = Math.max(1, this.holeResizeStart.width - deltaX * 2)
              newLength = Math.max(1, this.holeResizeStart.length + deltaY * 2)
              break
            case 'ne':
              newWidth = Math.max(1, this.holeResizeStart.width + deltaX * 2)
              newLength = Math.max(1, this.holeResizeStart.length - deltaY * 2)
              break
            case 'nw':
              newWidth = Math.max(1, this.holeResizeStart.width - deltaX * 2)
              newLength = Math.max(1, this.holeResizeStart.length - deltaY * 2)
              break
          }

          this.onUpdateFloor({
            hole: {
              ...floorWithHole.hole,
              width: newWidth,
              length: newLength,
            },
          })
        }
        return
      }

      if (this.isDraggingHole && this.holeDragOffset && this.onUpdateFloor) {
        const floorWithHole = this.floor
        if (floorWithHole.hole?.enabled) {
          const pos = this.getMousePosition(e)
          const newX = (pos.x / this.scale - this.holeDragOffset.x) / this.floor.width
          const newY = (pos.y / this.scale - this.holeDragOffset.y) / this.floor.length

          const clampedX = Math.max(0.1, Math.min(0.9, newX))
          const clampedY = Math.max(0.1, Math.min(0.9, newY))

          this.onUpdateFloor({
            hole: {
              ...floorWithHole.hole,
              x: clampedX,
              y: clampedY,
            },
          })
        }
        return
      }

      if (this.isDraggingElement && this.draggedElementId && this.elementDragOffset) {
        const pos = this.getMousePosition(e)
        const element = this.floor.elements.find((el) => el.id === this.draggedElementId)
        if (!element) return

        const newX = Math.max(
          0,
          Math.min(
            this.floor.width - element.width,
            pos.x / this.scale - this.elementDragOffset.x,
          ),
        )
        const newY = Math.max(
          0,
          Math.min(
            this.floor.length - element.depth,
            pos.y / this.scale - this.elementDragOffset.y,
          ),
        )

        this.onUpdateElement(this.draggedElementId, { x: newX, y: newY })
        return
      }

      if (!this.isDragging || !this.dragStart || !this.selectedTool) return

      const pos = this.getMousePosition(e)
      const x = Math.min(this.dragStart.x, pos.x)
      const y = Math.min(this.dragStart.y, pos.y)
      const width = Math.abs(pos.x - this.dragStart.x)
      const height = Math.abs(pos.y - this.dragStart.y)

      this.newElement = { x, y, width, height }
    },
    handleMouseUp() {
      if (this.isResizing) {
        this.isResizing = false
        this.resizeHandle = null
        this.draggedElementId = null
        this.resizeStart = null
        return
      }

      if (this.isResizingHole) {
        this.isResizingHole = false
        this.holeResizeHandle = null
        this.holeResizeStart = null
        return
      }

      if (this.isDraggingHole) {
        this.isDraggingHole = false
        this.holeDragOffset = null
        return
      }

      if (this.isDraggingElement) {
        this.isDraggingElement = false
        this.draggedElementId = null
        this.elementDragOffset = null
        return
      }

      if (!this.isDragging || !this.newElement || !this.selectedTool) return

      const minSize = 1
      const width = this.newElement.width / this.scale
      const height = this.newElement.height / this.scale

      if (width > minSize && height > minSize) {
        const typeLabel = this.selectedTool.charAt(0).toUpperCase() + this.selectedTool.slice(1)
        const elementId = Date.now().toString()
        const element = {
          id: elementId,
          type: this.selectedTool,
          color: this.getElementColor(this.selectedTool),
          x: this.newElement.x / this.scale,
          y: this.newElement.y / this.scale,
          width: width,
          depth: height,
          height: 2,
          name: `${typeLabel} ${Date.now() % 1000}`,
        }

        if (this.selectedTool === 'storage' && this.selectedStorageTypes.length > 0) {
          element.storageType = this.selectedStorageTypes
        }
        if (this.selectedTool === 'shop' && this.selectedShopTypes.length > 0) {
          element.shopType = this.selectedShopTypes
        }
        if (this.selectedTool === 'hospitality' && this.selectedHospitalityTypes.length > 0) {
          element.hospitalityType = this.selectedHospitalityTypes
        }
        if (this.selectedTool === 'merchshop' && this.selectedMerchTypes.length > 0) {
          element.merchType = this.selectedMerchTypes
        }
        if (this.selectedTool === 'access' && this.selectedAccessTypes.length > 0) {
          element.accessType = this.selectedAccessTypes
        }
        if (this.selectedTool === 'entertainment' && this.selectedEntertainmentTypes.length > 0) {
          element.entertainmentType = this.selectedEntertainmentTypes
        }
        if (this.selectedTool === 'entrance' && this.selectedEntranceTypes.length > 0) {
          element.entranceType = this.selectedEntranceTypes
        }
        if (this.selectedTool === 'kitchen' && this.selectedKitchenTypes.length > 0) {
          element.kitchenType = this.selectedKitchenTypes
        }

        this.onAddElement(element)
        this.onSelectElement(elementId)
      }

      this.isDragging = false
      this.dragStart = null
      this.newElement = null
    },
    handleElementTouchStart(e, element) {
      e.stopPropagation()
      e.preventDefault()
      if (this.selectedTool) return

      const pos = this.getTouchPosition(e)

      this.onSelectElement(element.id)
      this.isDraggingElement = true
      this.draggedElementId = element.id
      this.isTouchingCorner = false
      this.elementDragOffset = {
        x: pos.x / this.scale - element.x,
        y: pos.y / this.scale - element.y,
      }
    },
    handleResizeTouchStart(e, element, handle) {
      e.stopPropagation()
      e.preventDefault()
      this.isResizing = true
      this.resizeHandle = handle
      this.draggedElementId = element.id
      this.isTouchingCorner = true

      const pos = this.getTouchPosition(e)
      this.resizeStart = {
        x: pos.x / this.scale,
        y: pos.y / this.scale,
        width: element.width,
        depth: element.depth,
        elementX: element.x,
        elementY: element.y,
      }
    },
    handleHoleTouchStart(e) {
      e.stopPropagation()
      e.preventDefault()
      this.isHoleSelected = true
      const pos = this.getTouchPosition(e)
      this.isDraggingHole = true
      this.holeDragOffset = {
        x: pos.x / this.scale - this.floor.hole.x * this.floor.width,
        y: pos.y / this.scale - this.floor.hole.y * this.floor.length,
      }
    },
    handleHoleResizeTouchStart(e, handle) {
      e.stopPropagation()
      e.preventDefault()
      this.isHoleSelected = true
      const pos = this.getTouchPosition(e)
      this.isResizingHole = true
      this.holeResizeHandle = handle
      this.holeResizeStart = {
        x: pos.x / this.scale,
        y: pos.y / this.scale,
        width: this.floor.hole.width,
        length: this.floor.hole.length,
        holeX: this.floor.hole.x,
        holeY: this.floor.hole.y,
      }
    },
    handleTouchStart(e) {
      const target = e.target
      const isBackground =
        target.tagName === 'svg' ||
        (target.tagName === 'rect' && target.getAttribute('fill') === 'url(#grid)') ||
        (target.tagName === 'path' && target.getAttribute('stroke') === this.floorBorderColor)

      if (!this.selectedTool && isBackground) {
        this.onSelectElement(null)
        this.isHoleSelected = false
        return
      }

      if (this.selectedTool) {
        e.preventDefault()
        const pos = this.getTouchPosition(e)
        this.dragStart = pos
        this.isDragging = true
        this.newElement = { x: pos.x, y: pos.y, width: 0, height: 0 }
      }
    },
    handleTouchMove(e) {
      if (
        this.isPanning &&
        this.panStart &&
        this.scrollStart &&
        this.$refs.containerRef &&
        e.touches.length > 0
      ) {
        const touch = e.touches[0]
        const deltaX = touch.clientX - this.panStart.x
        const deltaY = touch.clientY - this.panStart.y

        this.$refs.containerRef.scrollLeft = this.scrollStart.scrollLeft - deltaX
        this.$refs.containerRef.scrollTop = this.scrollStart.scrollTop - deltaY
        return
      }

      e.preventDefault()

      if (this.isResizing && this.draggedElementId && this.resizeStart && this.resizeHandle) {
        const pos = this.getTouchPosition(e)
        const currentX = pos.x / this.scale
        const currentY = pos.y / this.scale
        const deltaX = currentX - this.resizeStart.x
        const deltaY = currentY - this.resizeStart.y

        const element = this.floor.elements.find((el) => el.id === this.draggedElementId)
        if (!element) return

        let newWidth = element.width
        let newDepth = element.depth
        let newX = element.x
        let newY = element.y

        switch (this.resizeHandle) {
          case 'se':
            newWidth = Math.max(1, this.resizeStart.width + deltaX)
            newDepth = Math.max(1, this.resizeStart.depth + deltaY)
            break
          case 'sw':
            newWidth = Math.max(1, this.resizeStart.width - deltaX)
            newDepth = Math.max(1, this.resizeStart.depth + deltaY)
            newX = this.resizeStart.elementX + (this.resizeStart.width - newWidth)
            break
          case 'ne':
            newWidth = Math.max(1, this.resizeStart.width + deltaX)
            newDepth = Math.max(1, this.resizeStart.depth - deltaY)
            newY = this.resizeStart.elementY + (this.resizeStart.depth - newDepth)
            break
          case 'nw':
            newWidth = Math.max(1, this.resizeStart.width - deltaX)
            newDepth = Math.max(1, this.resizeStart.depth - deltaY)
            newX = this.resizeStart.elementX + (this.resizeStart.width - newWidth)
            newY = this.resizeStart.elementY + (this.resizeStart.depth - newDepth)
            break
        }

        newX = Math.max(0, Math.min(this.floor.width - newWidth, newX))
        newY = Math.max(0, Math.min(this.floor.length - newDepth, newY))

        this.onUpdateElement(this.draggedElementId, {
          width: newWidth,
          depth: newDepth,
          x: newX,
          y: newY,
        })
        return
      }

      if (this.isResizingHole && this.holeResizeStart && this.holeResizeHandle && this.onUpdateFloor) {
        const floorWithHole = this.floor
        if (floorWithHole.hole?.enabled) {
          const pos = this.getTouchPosition(e)
          const currentX = pos.x / this.scale
          const currentY = pos.y / this.scale
          const deltaX = currentX - this.holeResizeStart.x
          const deltaY = currentY - this.holeResizeStart.y

          let newWidth = this.holeResizeStart.width
          let newLength = this.holeResizeStart.length

          switch (this.holeResizeHandle) {
            case 'se':
              newWidth = Math.max(1, this.holeResizeStart.width + deltaX * 2)
              newLength = Math.max(1, this.holeResizeStart.length + deltaY * 2)
              break
            case 'sw':
              newWidth = Math.max(1, this.holeResizeStart.width - deltaX * 2)
              newLength = Math.max(1, this.holeResizeStart.length + deltaY * 2)
              break
            case 'ne':
              newWidth = Math.max(1, this.holeResizeStart.width + deltaX * 2)
              newLength = Math.max(1, this.holeResizeStart.length - deltaY * 2)
              break
            case 'nw':
              newWidth = Math.max(1, this.holeResizeStart.width - deltaX * 2)
              newLength = Math.max(1, this.holeResizeStart.length - deltaY * 2)
              break
          }

          this.onUpdateFloor({
            hole: {
              ...floorWithHole.hole,
              width: newWidth,
              length: newLength,
            },
          })
        }
        return
      }

      if (this.isDraggingHole && this.holeDragOffset && this.onUpdateFloor) {
        const floorWithHole = this.floor
        if (floorWithHole.hole?.enabled) {
          const pos = this.getTouchPosition(e)
          const newX = (pos.x / this.scale - this.holeDragOffset.x) / this.floor.width
          const newY = (pos.y / this.scale - this.holeDragOffset.y) / this.floor.length

          const clampedX = Math.max(0.1, Math.min(0.9, newX))
          const clampedY = Math.max(0.1, Math.min(0.9, newY))

          this.onUpdateFloor({
            hole: {
              ...floorWithHole.hole,
              x: clampedX,
              y: clampedY,
            },
          })
        }
        return
      }

      if (this.isDraggingElement && this.draggedElementId && this.elementDragOffset) {
        const pos = this.getTouchPosition(e)
        const element = this.floor.elements.find((el) => el.id === this.draggedElementId)
        if (!element) return

        const newX = Math.max(
          0,
          Math.min(
            this.floor.width - element.width,
            pos.x / this.scale - this.elementDragOffset.x,
          ),
        )
        const newY = Math.max(
          0,
          Math.min(
            this.floor.length - element.depth,
            pos.y / this.scale - this.elementDragOffset.y,
          ),
        )

        this.onUpdateElement(this.draggedElementId, { x: newX, y: newY })
        return
      }

      if (!this.isDragging || !this.dragStart || !this.selectedTool) return

      const pos = this.getTouchPosition(e)
      const x = Math.min(this.dragStart.x, pos.x)
      const y = Math.min(this.dragStart.y, pos.y)
      const width = Math.abs(pos.x - this.dragStart.x)
      const height = Math.abs(pos.y - this.dragStart.y)

      this.newElement = { x, y, width, height }
    },
    handleTouchEnd() {
      this.touchStartPos = null
      this.isTouchingCorner = false
      this.handleMouseUp()
    },
    handleContainerMouseDown(e) {
      if (!this.$refs.containerRef) return

      const target = e.target
      if (target.tagName === 'svg' || target.closest('svg')) return
      if (target.tagName === 'BUTTON' || target.closest('button')) return

      const hasOverflow =
        this.$refs.containerRef.scrollWidth > this.$refs.containerRef.clientWidth ||
        this.$refs.containerRef.scrollHeight > this.$refs.containerRef.clientHeight

      if (!hasOverflow) return

      e.preventDefault()
      this.isPanning = true
      this.panStart = { x: e.clientX, y: e.clientY }
      this.scrollStart = {
        scrollLeft: this.$refs.containerRef.scrollLeft,
        scrollTop: this.$refs.containerRef.scrollTop,
      }
    },
    handleContainerMouseMove(e) {
      if (!this.isPanning || !this.panStart || !this.scrollStart || !this.$refs.containerRef) return

      e.preventDefault()
      const deltaX = e.clientX - this.panStart.x
      const deltaY = e.clientY - this.panStart.y

      this.$refs.containerRef.scrollLeft = this.scrollStart.scrollLeft - deltaX
      this.$refs.containerRef.scrollTop = this.scrollStart.scrollTop - deltaY
    },
    handleContainerMouseUp() {
      this.isPanning = false
      this.panStart = null
      this.scrollStart = null
    },
    handleContainerTouchStart(e) {
      if (!this.$refs.containerRef) return

      const target = e.target
      if (target.tagName === 'svg' || target.closest('svg')) return
      if (target.tagName === 'BUTTON' || target.closest('button')) return

      const hasOverflow =
        this.$refs.containerRef.scrollWidth > this.$refs.containerRef.clientWidth ||
        this.$refs.containerRef.scrollHeight > this.$refs.containerRef.clientHeight

      if (!hasOverflow) return

      const touch = e.touches[0]
      this.isPanning = true
      this.panStart = { x: touch.clientX, y: touch.clientY }
      this.scrollStart = {
        scrollLeft: this.$refs.containerRef.scrollLeft,
        scrollTop: this.$refs.containerRef.scrollTop,
      }
    },
    handleContainerTouchMove(e) {
      if (!this.isPanning || !this.panStart || !this.scrollStart || !this.$refs.containerRef) return

      const touch = e.touches[0]
      const deltaX = touch.clientX - this.panStart.x
      const deltaY = touch.clientY - this.panStart.y

      this.$refs.containerRef.scrollLeft = this.scrollStart.scrollLeft - deltaX
      this.$refs.containerRef.scrollTop = this.scrollStart.scrollTop - deltaY
    },
    handleContainerTouchEnd() {
      this.isPanning = false
      this.panStart = null
      this.scrollStart = null
    },
    getElementColor(type) {
      const colors = {
        shop: '#10b981',
        storage: '#f59e0b',
        entrance: '#ff3131',
        hospitality: '#ec4899',
        merchshop: '#a0522d',
        access: '#64748b',
        entertainment: '#8b5cf6',
        kitchen: '#f97316',
      }
      // Les éléments F&B importés (Data Integration) peuvent avoir un type `fnb-*`
      // (originalType) au lieu de `shop` → on les rattache à la couleur F&B.
      const key = String(type || '').startsWith('fnb') ? 'shop' : type
      return colors[key] || '#6b7280'
    },
    getDarkerColor(type) {
      const colors = {
        shop: '#059669',
        storage: '#d97706',
        entrance: '#ff3131',
        hospitality: '#db2777',
        merchshop: '#78350f',
        access: '#475569',
        entertainment: '#7c3aed',
        kitchen: '#ea580c',
      }
      const key = String(type || '').startsWith('fnb') ? 'shop' : type
      return colors[key] || '#4b5563'
    },
  },
}
</script>