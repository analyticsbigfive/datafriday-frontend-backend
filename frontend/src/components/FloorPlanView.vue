<template>
  <div class="h-full flex flex-col">
    <div :class="isMobile ? 'flex flex-col gap-2' : 'flex items-center mb-4 justify-between'">
      <!-- Mobile: Title and Dimensions side-by-side -->
      <div v-if="isMobile" class="w-full flex items-center justify-between">
        <h2 class="text-lg">{{ floor.name }} - Plan</h2>
        <div
          :class="onUpdateFloor ? 'text-sm text-gray-700 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded' : 'text-sm text-gray-500'"
          @click="onUpdateFloor && (isEditingDimensions = true)"
          :title="onUpdateFloor ? 'Click to edit dimensions' : undefined"
        >
          {{ floor.width }}m × {{ floor.length }}m
        </div>
      </div>
      <!-- Desktop: Title on left -->
      <h2 v-else class="text-lg">{{ floor.name }} - Plan</h2>

      <div :class="isMobile ? 'flex items-center gap-4 w-full justify-between' : 'flex items-center gap-4'">
        <!-- Desktop: Inline editing -->
        <div v-if="!isMobile && isEditingDimensions && onUpdateFloor" class="flex items-center gap-2 text-sm">
          <NumericInput
            v-model="editedWidth"
            :min="10"
            :max="500"
            class="w-16 h-8 text-sm"
          />
          <span>m ×</span>
          <NumericInput
            v-model="editedLength"
            :min="10"
            :max="500"
            class="w-16 h-8 text-sm"
          />
          <span>m</span>
          <Button
            size="sm"
            variant="ghost"
            @click="handleSaveDimensions"
            class="h-7 px-2"
          >
            <Check class="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            @click="handleCancelDimensions"
            class="h-7 px-2"
          >
            <X class="h-4 w-4" />
          </Button>
        </div>
        <!-- Desktop: Display dimensions -->
        <div
          v-else-if="!isMobile"
          :class="onUpdateFloor ? 'text-sm text-gray-700 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded' : 'text-sm text-gray-500'"
          @click="onUpdateFloor && (isEditingDimensions = true)"
          :title="onUpdateFloor ? 'Click to edit dimensions' : undefined"
        >
          {{ floor.width }}m × {{ floor.length }}m
          <span v-if="selectedTool" class="ml-4 text-blue-600">Drawing: {{ selectedTool }}</span>
        </div>

        <div class="flex gap-2">
          <Button
            v-if="selectedElementId"
            size="sm"
            variant="outline"
            @click="handleRotateElement"
            title="Rotate element 15°"
          >
            <RotateCw class="h-4 w-4" />
          </Button>
          <Button
            v-if="selectedElementId"
            size="sm"
            variant="outline"
            @click="handleOpenRadiusDialog"
            title="Edit corner radius"
          >
            <Circle class="h-4 w-4" />
          </Button>
          <Button
            v-if="isMobile && selectedElementId && onShowElementProperties"
            size="sm"
            variant="outline"
            @click="onShowElementProperties"
            title="View properties"
          >
            <Info class="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            @click="handleZoomIn"
          >
            <ZoomIn class="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            @click="handleZoomOut"
          >
            <ZoomOut class="h-4 w-4" />
          </Button>
          <Button
            v-if="onToggleFullscreen"
            size="sm"
            variant="outline"
            @click="onToggleFullscreen"
            :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
          >
            <Minimize v-if="isFullscreen" class="h-4 w-4" />
            <Maximize v-else class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>

    <div
      ref="containerRef"
      class="flex-1 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-auto p-8"
      @mousedown="handleContainerMouseDown"
      @mousemove="handleContainerMouseMove"
      @mouseup="handleContainerMouseUp"
      @mouseleave="handleContainerMouseUp"
      @touchstart="handleContainerTouchStart"
      @touchmove="handleContainerTouchMove"
      @touchend="handleContainerTouchEnd"
      :style="{
        cursor: isPanning ? 'grabbing' : 'default',
        WebkitOverflowScrolling: 'touch'
      }"
    >
      <div
        :class="zoom <= 1 ? 'min-h-full w-full flex items-center justify-center' : 'min-h-full inline-block'"
        :style="zoom > 1 ? { minWidth: '100%' } : undefined"
      >
        <svg
          ref="svgRef"
          :width="viewWidth"
          :height="viewHeight"
          class="bg-white dark:bg-gray-900"
          :style="{
            maxWidth: zoom > 1 ? 'none' : '100%',
            maxHeight: zoom > 1 ? 'none' : '100%',
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
                stroke="#e5e7eb"
                class="dark:!stroke-gray-500"
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
            stroke="#9ca3af"
            class="dark:!stroke-gray-500"
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
                stroke="#9ca3af"
                class="dark:!stroke-gray-500"
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
                  fill="#ef4444"
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
                  fill="#ef4444"
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
                  fill="#ef4444"
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
                  fill="#ef4444"
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
            v-for="i in Math.ceil(floor.width / 5) + 1"
            :key="`x-${i}`"
            :x="i * scale * 5"
            :y="viewHeight + 15"
            class="text-xs dark:fill-gray-400"
            fill="#6b7280"
            text-anchor="middle"
          >
            {{ i * 5 }}m
          </text>
          <text
            v-for="i in Math.ceil(floor.length / 5) + 1"
            :key="`y-${i}`"
            x="-10"
            :y="i * scale * 5"
            class="text-xs dark:fill-gray-400"
            fill="#6b7280"
            text-anchor="end"
            dominant-baseline="middle"
          >
            {{ i * 5 }}m
          </text>

          <!-- Existing elements -->
          <g
            v-for="element in floor.elements"
            :key="element.id"
            :class="selectedTool ? 'cursor-pointer' : 'cursor-move'"
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
              class="text-xs"
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
    <Dialog :open="showRadiusDialog" @update:open="val => (showRadiusDialog = val)">
      <DialogContent class="sm:max-w-md" aria-describedby="corner-radius-description">
        <DialogHeader>
          <DialogTitle>Edit Corner Radius</DialogTitle>
          <DialogDescription id="corner-radius-description">
            Adjust the corner radius for the selected element
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="flex items-center space-x-2">
            <Checkbox
              id="applyAll"
              :checked="applyToAllCorners"
              @update:checked="checked => (applyToAllCorners = !!checked)"
            />
            <Label for="applyAll" class="text-sm cursor-pointer">
              Apply same radius to all corners
            </Label>
          </div>

          <template v-if="applyToAllCorners">
            <div class="space-y-2">
              <Label for="allCorners">Corner Radius (m)</Label>
              <NumericInput
                id="allCorners"
                :value="radiusValues.topLeft"
                @change="value => handleRadiusChange('topLeft', value)"
                :min="0"
                :step="0.1"
                placeholder="0.0"
              />
            </div>
          </template>
          <template v-else>
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="topLeft">Top Left (m)</Label>
                <NumericInput
                  id="topLeft"
                  :value="radiusValues.topLeft"
                  @change="value => handleRadiusChange('topLeft', value)"
                  :min="0"
                  :step="0.1"
                  placeholder="0.0"
                />
              </div>
              <div class="space-y-2">
                <Label for="topRight">Top Right (m)</Label>
                <NumericInput
                  id="topRight"
                  :value="radiusValues.topRight"
                  @change="value => handleRadiusChange('topRight', value)"
                  :min="0"
                  :step="0.1"
                  placeholder="0.0"
                />
              </div>
              <div class="space-y-2">
                <Label for="bottomLeft">Bottom Left (m)</Label>
                <NumericInput
                  id="bottomLeft"
                  :value="radiusValues.bottomLeft"
                  @change="value => handleRadiusChange('bottomLeft', value)"
                  :min="0"
                  :step="0.1"
                  placeholder="0.0"
                />
              </div>
              <div class="space-y-2">
                <Label for="bottomRight">Bottom Right (m)</Label>
                <NumericInput
                  id="bottomRight"
                  :value="radiusValues.bottomRight"
                  @change="value => handleRadiusChange('bottomRight', value)"
                  :min="0"
                  :step="0.1"
                  placeholder="0.0"
                />
              </div>
            </div>
          </template>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="() => (showRadiusDialog = false)">
            Cancel
          </Button>
          <Button @click="handleSaveRadius">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Mobile: Dimensions editing dialog -->
    <Dialog
      :open="isMobile && isEditingDimensions"
      @update:open="open => {
        if (!open) {
          editedWidth = floor.width;
          editedLength = floor.length;
          isEditingDimensions = false;
        }
      }"
    >
      <DialogContent aria-describedby="edit-floor-dimensions-description">
        <DialogHeader>
          <DialogTitle>Edit Floor Dimensions</DialogTitle>
          <DialogDescription id="edit-floor-dimensions-description">
            Adjust the width and length of the floor plan.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="width">Width (m)</Label>
            <NumericInput
              id="width"
              :value="editedWidth"
              @change="val => (editedWidth = val)"
              :min="10"
              :max="500"
              class="w-full"
            />
          </div>
          <div class="space-y-2">
            <Label for="length">Length (m)</Label>
            <NumericInput
              id="length"
              :value="editedLength"
              @change="val => (editedLength = val)"
              :min="10"
              :max="500"
              class="w-full"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            @click="() => {
              editedWidth = floor.width;
              editedLength = floor.length;
              isEditingDimensions = false;
            }"
          >
            Cancel
          </Button>
          <Button
            @click="() => {
              if (onUpdateFloor) {
                onUpdateFloor({ width: editedWidth, length: editedLength });
              }
              isEditingDimensions = false;
            }"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script>
import { watch, nextTick } from 'vue'
import { RotateCw, ZoomIn, ZoomOut, Minimize, Maximize, Check, Info, Circle, X } from 'lucide-vue-next';
import Button from '../ui/button.vue';
import  useIsMobile  from '../ui/useMobile';
import Dialog from '../ui/dialog.vue';
import DialogContent from '../ui/dialogContent.vue';
import DialogHeader from '../ui/dialogHeader.vue';
import DialogTitle from '../ui/dialogTitle.vue';
import DialogDescription from '../ui/dialogDescription.vue';
import DialogFooter from '../ui/dialogFooter.vue';
import Label from '../ui/label.vue';
import NumericInput from '../ui/numericInput.vue';
import Checkbox from '../ui/checkbox.vue';

export default {
  name: 'FloorPlanView',
  mixins: [useIsMobile],
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
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Label,
    NumericInput,
    Checkbox,
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
      isMobile: false,
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
    };
  },
  computed: {
    baseScale() {
      return 5; // pixels per meter
    },
    scale() {
      return this.baseScale * this.zoom;
    },
    viewWidth() {
      return Math.max(100, this.floor.width * this.scale);
    },
    viewHeight() {
      return Math.max(100, this.floor.length * this.scale);
    },
    holeX() {
      if (!this.floor.hole) return 0;
      return this.floor.hole.x * this.viewWidth - (this.floor.hole.width * this.scale) / 2;
    },
    holeY() {
      if (!this.floor.hole) return 0;
      return this.floor.hole.y * this.viewHeight - (this.floor.hole.length * this.scale) / 2;
    },
    holeWidth() {
      if (!this.floor.hole) return 0;
      return this.floor.hole.width * this.scale;
    },
    holeHeight() {
      if (!this.floor.hole) return 0;
      return this.floor.hole.length * this.scale;
    },
    holeHandleRadius() {
      return this.isMobile ? 10 : 5;
    },
    elementHandleRadius() {
      return this.isMobile ? 10 : 5;
    },
    createFloorPathWithHole() {
      const outerPath = this.createRoundedRectPath(
        0,
        0,
        Math.max(1, this.viewWidth),
        Math.max(1, this.viewHeight),
        this.floor.cornerRadius,
      );

      const floorWithHole = this.floor;
      if (!floorWithHole.hole?.enabled) {
        return outerPath;
      }

      const hole = floorWithHole.hole;
      const holeX = hole.x * this.viewWidth - (hole.width * this.scale) / 2;
      const holeY = hole.y * this.viewHeight - (hole.length * this.scale) / 2;

      const innerPath = this.createRoundedRectPathCounterClockwise(
        holeX,
        holeY,
        hole.width * this.scale,
        hole.length * this.scale,
        hole.cornerRadius,
      );

      return `${outerPath} ${innerPath}`;
    },
  },
  mounted() {
    //this.isMobile = useIsMobile();
    this.editedWidth = this.floor.width;
    this.editedLength = this.floor.length;

    // Calculate initial zoom to fit the floor plan in the window
    this.$nextTick(() => {
      if (this.$refs.containerRef) {
        const containerWidth = this.$refs.containerRef.clientWidth - 64;
        const containerHeight = this.$refs.containerRef.clientHeight - 64;
        const zoomX = containerWidth / (this.floor.width * this.baseScale);
        const zoomY = containerHeight / (this.floor.length * this.baseScale);
        const initialZoom = Math.min(zoomX, zoomY, 1);
        this.zoom = initialZoom;
      }
    });

    // Keyboard handler for delete
    const handleKeyDown = (e) => {
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'Backspace') {
        if (this.isHoleSelected && this.onUpdateFloor && 'hole' in this.floor) {
          e.preventDefault();
          this.onUpdateFloor({
            hole: {
              ...this.floor.hole,
              enabled: false,
            },
          });
          this.isHoleSelected = false;
        } else if (this.selectedElementId) {
          const element = this.floor.elements.find((el) => el.id === this.selectedElementId);
          if (element) {
            const event = new CustomEvent('deleteElement', { detail: this.selectedElementId });
            window.dispatchEvent(event);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    this._handleKeyDown = handleKeyDown;


    // Deselect hole if it becomes disabled
    this.$watch(
      () => this.floor.hole?.enabled,
      (newEnabled) => {
        if (this.isHoleSelected && !newEnabled) {
          this.isHoleSelected = false;
        }
      },
    );
  },

  beforeUnmount() {
    if (this._handleKeyDown) {
      window.removeEventListener('keydown', this._handleKeyDown);
    }
  },
  watch: {
    'floor.width'(newWidth) {
      this.editedWidth = newWidth;
    },
    'floor.length'(newLength) {
      this.editedLength = newLength;
    },
  },
  methods: {
    isElementHighlighted(element) {
      if (!this.selectedTool) return false;
      if (element.type !== this.selectedTool) return false;

      if (element.type === 'shop') {
        if (this.selectedShopTypes.length === 0) return true;
        return element.shopType?.some((type) => this.selectedShopTypes.includes(type)) || false;
      }
      if (element.type === 'storage') {
        if (this.selectedStorageTypes.length === 0) return true;
        return (
          element.storageType?.some((type) => this.selectedStorageTypes.includes(type)) || false
        );
      }
      if (element.type === 'hospitality') {
        if (this.selectedHospitalityTypes.length === 0) return true;
        return (
          element.hospitalityType?.some((type) => this.selectedHospitalityTypes.includes(type)) ||
          false
        );
      }
      if (element.type === 'merchshop') {
        if (this.selectedMerchTypes.length === 0) return true;
        return element.merchType?.some((type) => this.selectedMerchTypes.includes(type)) || false;
      }
      if (element.type === 'access') {
        if (this.selectedAccessTypes.length === 0) return true;
        return element.accessType?.some((type) => this.selectedAccessTypes.includes(type)) || false;
      }
      if (element.type === 'entertainment') {
        if (this.selectedEntertainmentTypes.length === 0) return true;
        return (
          element.entertainmentType?.some((type) =>
            this.selectedEntertainmentTypes.includes(type),
          ) || false
        );
      }
      if (element.type === 'entrance') {
        if (this.selectedEntranceTypes.length === 0) return true;
        return (
          element.entranceType?.some((type) => this.selectedEntranceTypes.includes(type)) || false
        );
      }
      if (element.type === 'kitchen') {
        if (this.selectedKitchenTypes.length === 0) return true;
        return element.kitchenType?.some((type) => this.selectedKitchenTypes.includes(type)) || false;
      }
      return true;
    },
    handleZoomIn() {
      this.zoom = Math.min(this.zoom * 1.25, 3);
    },
    handleZoomOut() {
      this.zoom = Math.max(this.zoom * 0.8, 0.2);
    },
    handleOpenRadiusDialog() {
      if (!this.selectedElementId) return;
      const element = this.floor.elements.find((e) => e.id === this.selectedElementId);
      if (!element) return;

      this.radiusValues =
        element.cornerRadius ||
        {
          topLeft: 0,
          topRight: 0,
          bottomLeft: 0,
          bottomRight: 0,
        };
      this.applyToAllCorners = false;
      this.showRadiusDialog = true;
    },
    handleSaveRadius() {
      if (!this.selectedElementId) return;

      let finalRadius;
      if (this.applyToAllCorners) {
        const value = this.radiusValues.topLeft;
        finalRadius = {
          topLeft: value,
          topRight: value,
          bottomLeft: value,
          bottomRight: value,
        };
      } else {
        finalRadius = { ...this.radiusValues };
      }

      this.onUpdateElement(this.selectedElementId, { cornerRadius: finalRadius });
      this.showRadiusDialog = false;
    },
    handleRadiusChange(corner, value) {
      //this.$set(this.radiusValues, corner, value);
      this.radiusValues[corner] = value;
    },
    handleSaveDimensions() {
      if (this.onUpdateFloor) {
        this.onUpdateFloor({ width: this.editedWidth, length: this.editedLength });
      }
      this.isEditingDimensions = false;
    },
    handleCancelDimensions() {
      this.editedWidth = this.floor.width;
      this.editedLength = this.floor.length;
      this.isEditingDimensions = false;
    },
    handleRotateElement() {
      if (!this.selectedElementId) return;
      const element = this.floor.elements.find((e) => e.id === this.selectedElementId);
      if (!element) return;

      const currentRotation = element.rotation || 0;
      this.onUpdateElement(this.selectedElementId, {
        rotation: (currentRotation + 15) % 360,
      });
    },
    getMousePosition(e) {
      if (!this.$refs.svgRef) return { x: 0, y: 0 };
      const rect = this.$refs.svgRef.getBoundingClientRect();
      const scaleX = this.viewWidth / rect.width;
      const scaleY = this.viewHeight / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    getTouchPosition(e) {
      if (!this.$refs.svgRef || (!e.touches && !e.changedTouches)) return { x: 0, y: 0 };
      const rect = this.$refs.svgRef.getBoundingClientRect();
      const touch = e.touches ? e.touches[0] : e.changedTouches[0];
      const scaleX = this.viewWidth / rect.width;
      const scaleY = this.viewHeight / rect.height;
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    },
    createRoundedRectPath(x, y, width, height, cornerRadius) {
      if (
        !cornerRadius ||
        (cornerRadius.topLeft === 0 &&
          cornerRadius.topRight === 0 &&
          cornerRadius.bottomLeft === 0 &&
          cornerRadius.bottomRight === 0)
      ) {
        return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`;
      }

      const tl = Math.min(cornerRadius.topLeft * this.scale, width / 2, height / 2);
      const tr = Math.min(cornerRadius.topRight * this.scale, width / 2, height / 2);
      const br = Math.min(cornerRadius.bottomRight * this.scale, width / 2, height / 2);
      const bl = Math.min(cornerRadius.bottomLeft * this.scale, width / 2, height / 2);

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
      `.replace(/\s+/g, ' ').trim();
    },
    createRoundedRectPathCounterClockwise(x, y, width, height, cornerRadius) {
      if (
        !cornerRadius ||
        (cornerRadius.topLeft === 0 &&
          cornerRadius.topRight === 0 &&
          cornerRadius.bottomLeft === 0 &&
          cornerRadius.bottomRight === 0)
      ) {
        return `M ${x} ${y} L ${x} ${y + height} L ${x + width} ${y + height} L ${x + width} ${y} Z`;
      }

      const tl = Math.min(cornerRadius.topLeft * this.scale, width / 2, height / 2);
      const tr = Math.min(cornerRadius.topRight * this.scale, width / 2, height / 2);
      const br = Math.min(cornerRadius.bottomRight * this.scale, width / 2, height / 2);
      const bl = Math.min(cornerRadius.bottomLeft * this.scale, width / 2, height / 2);

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
      `.replace(/\s+/g, ' ').trim();
    },
    handleMouseDown(e) {
      if (!this.selectedTool) {
        this.onSelectElement(null);
        this.isHoleSelected = false;
        return;
      }
      const pos = this.getMousePosition(e);
      this.dragStart = pos;
      this.isDragging = true;
      this.newElement = { x: pos.x, y: pos.y, width: 0, height: 0 };
    },
    handleElementMouseDown(e, element) {
      e.stopPropagation();
      if (this.selectedTool) return;

      this.onSelectElement(element.id);
      this.isDraggingElement = true;
      this.draggedElementId = element.id;

      const pos = this.getMousePosition(e);
      this.elementDragOffset = {
        x: pos.x / this.scale - element.x,
        y: pos.y / this.scale - element.y,
      };
    },
    handleResizeMouseDown(e, element, handle) {
      e.stopPropagation();
      this.isResizing = true;
      this.resizeHandle = handle;
      this.draggedElementId = element.id;

      const pos = this.getMousePosition(e);
      this.resizeStart = {
        x: pos.x / this.scale,
        y: pos.y / this.scale,
        width: element.width,
        depth: element.depth,
        elementX: element.x,
        elementY: element.y,
      };
    },
    handleHoleMouseDown(e) {
      e.stopPropagation();
      this.isHoleSelected = true;
      const pos = this.getMousePosition(e);
      this.isDraggingHole = true;
      this.holeDragOffset = {
        x: pos.x / this.scale - this.floor.hole.x * this.floor.width,
        y: pos.y / this.scale - this.floor.hole.y * this.floor.length,
      };
    },
    handleHoleResizeMouseDown(e, handle) {
      e.stopPropagation();
      this.isHoleSelected = true;
      const pos = this.getMousePosition(e);
      this.isResizingHole = true;
      this.holeResizeHandle = handle;
      this.holeResizeStart = {
        x: pos.x / this.scale,
        y: pos.y / this.scale,
        width: this.floor.hole.width,
        length: this.floor.hole.length,
        holeX: this.floor.hole.x,
        holeY: this.floor.hole.y,
      };
    },
    handleMouseMove(e) {
      // Handle resizing
      if (this.isResizing && this.draggedElementId && this.resizeStart && this.resizeHandle) {
        const pos = this.getMousePosition(e);
        const currentX = pos.x / this.scale;
        const currentY = pos.y / this.scale;
        const deltaX = currentX - this.resizeStart.x;
        const deltaY = currentY - this.resizeStart.y;

        const element = this.floor.elements.find((el) => el.id === this.draggedElementId);
        if (!element) return;

        let newWidth = element.width;
        let newDepth = element.depth;
        let newX = element.x;
        let newY = element.y;

        switch (this.resizeHandle) {
          case 'se':
            newWidth = Math.max(1, this.resizeStart.width + deltaX);
            newDepth = Math.max(1, this.resizeStart.depth + deltaY);
            break;
          case 'sw':
            newWidth = Math.max(1, this.resizeStart.width - deltaX);
            newDepth = Math.max(1, this.resizeStart.depth + deltaY);
            newX = this.resizeStart.elementX + (this.resizeStart.width - newWidth);
            break;
          case 'ne':
            newWidth = Math.max(1, this.resizeStart.width + deltaX);
            newDepth = Math.max(1, this.resizeStart.depth - deltaY);
            newY = this.resizeStart.elementY + (this.resizeStart.depth - newDepth);
            break;
          case 'nw':
            newWidth = Math.max(1, this.resizeStart.width - deltaX);
            newDepth = Math.max(1, this.resizeStart.depth - deltaY);
            newX = this.resizeStart.elementX + (this.resizeStart.width - newWidth);
            newY = this.resizeStart.elementY + (this.resizeStart.depth - newDepth);
            break;
        }

        newX = Math.max(0, Math.min(this.floor.width - newWidth, newX));
        newY = Math.max(0, Math.min(this.floor.length - newDepth, newY));

        this.onUpdateElement(this.draggedElementId, {
          width: newWidth,
          depth: newDepth,
          x: newX,
          y: newY,
        });
        return;
      }

      // Handle hole resizing
      if (this.isResizingHole && this.holeResizeStart && this.holeResizeHandle && this.onUpdateFloor) {
        const floorWithHole = this.floor;
        if (floorWithHole.hole?.enabled) {
          const pos = this.getMousePosition(e);
          const currentX = pos.x / this.scale;
          const currentY = pos.y / this.scale;
          const deltaX = currentX - this.holeResizeStart.x;
          const deltaY = currentY - this.holeResizeStart.y;

          let newWidth = this.holeResizeStart.width;
          let newLength = this.holeResizeStart.length;

          switch (this.holeResizeHandle) {
            case 'se':
              newWidth = Math.max(1, this.holeResizeStart.width + deltaX * 2);
              newLength = Math.max(1, this.holeResizeStart.length + deltaY * 2);
              break;
            case 'sw':
              newWidth = Math.max(1, this.holeResizeStart.width - deltaX * 2);
              newLength = Math.max(1, this.holeResizeStart.length + deltaY * 2);
              break;
            case 'ne':
              newWidth = Math.max(1, this.holeResizeStart.width + deltaX * 2);
              newLength = Math.max(1, this.holeResizeStart.length - deltaY * 2);
              break;
            case 'nw':
              newWidth = Math.max(1, this.holeResizeStart.width - deltaX * 2);
              newLength = Math.max(1, this.holeResizeStart.length - deltaY * 2);
              break;
          }

          this.onUpdateFloor({
            hole: {
              ...floorWithHole.hole,
              width: newWidth,
              length: newLength,
            },
          });
        }
        return;
      }

      // Handle hole dragging
      if (this.isDraggingHole && this.holeDragOffset && this.onUpdateFloor) {
        const floorWithHole = this.floor;
        if (floorWithHole.hole?.enabled) {
          const pos = this.getMousePosition(e);
          const newX = (pos.x / this.scale - this.holeDragOffset.x) / this.floor.width;
          const newY = (pos.y / this.scale - this.holeDragOffset.y) / this.floor.length;

          const clampedX = Math.max(0.1, Math.min(0.9, newX));
          const clampedY = Math.max(0.1, Math.min(0.9, newY));

          this.onUpdateFloor({
            hole: {
              ...floorWithHole.hole,
              x: clampedX,
              y: clampedY,
            },
          });
        }
        return;
      }

      // Handle element dragging
      if (this.isDraggingElement && this.draggedElementId && this.elementDragOffset) {
        const pos = this.getMousePosition(e);
        const element = this.floor.elements.find((el) => el.id === this.draggedElementId);
        if (!element) return;

        const newX = Math.max(
          0,
          Math.min(
            this.floor.width - element.width,
            pos.x / this.scale - this.elementDragOffset.x,
          ),
        );
        const newY = Math.max(
          0,
          Math.min(
            this.floor.length - element.depth,
            pos.y / this.scale - this.elementDragOffset.y,
          ),
        );

        this.onUpdateElement(this.draggedElementId, { x: newX, y: newY });
        return;
      }

      // Handle new element drawing
      if (!this.isDragging || !this.dragStart || !this.selectedTool) return;

      const pos = this.getMousePosition(e);
      const x = Math.min(this.dragStart.x, pos.x);
      const y = Math.min(this.dragStart.y, pos.y);
      const width = Math.abs(pos.x - this.dragStart.x);
      const height = Math.abs(pos.y - this.dragStart.y);

      this.newElement = { x, y, width, height };
    },
    handleMouseUp() {
      // Handle resizing
      if (this.isResizing) {
        this.isResizing = false;
        this.resizeHandle = null;
        this.draggedElementId = null;
        this.resizeStart = null;
        return;
      }

      // Handle hole resizing
      if (this.isResizingHole) {
        this.isResizingHole = false;
        this.holeResizeHandle = null;
        this.holeResizeStart = null;
        return;
      }

      // Handle hole dragging
      if (this.isDraggingHole) {
        this.isDraggingHole = false;
        this.holeDragOffset = null;
        return;
      }

      // Handle element dragging
      if (this.isDraggingElement) {
        this.isDraggingElement = false;
        this.draggedElementId = null;
        this.elementDragOffset = null;
        return;
      }

      // Handle new element drawing
      if (!this.isDragging || !this.newElement || !this.selectedTool) return;

      const minSize = 1;
      const width = this.newElement.width / this.scale;
      const height = this.newElement.height / this.scale;

      if (width > minSize && height > minSize) {
        const typeLabel = this.selectedTool.charAt(0).toUpperCase() + this.selectedTool.slice(1);
        const elementId = Date.now().toString();
        const element = {
          id: elementId,
          type: this.selectedTool,
          x: this.newElement.x / this.scale,
          y: this.newElement.y / this.scale,
          width: width,
          depth: height,
          height: 2,
          name: `${typeLabel} ${Date.now() % 1000}`,
        };

        if (this.selectedTool === 'storage' && this.selectedStorageTypes.length > 0) {
          element.storageType = this.selectedStorageTypes;
        }
        if (this.selectedTool === 'shop' && this.selectedShopTypes.length > 0) {
          element.shopType = this.selectedShopTypes;
        }
        if (this.selectedTool === 'hospitality' && this.selectedHospitalityTypes.length > 0) {
          element.hospitalityType = this.selectedHospitalityTypes;
        }
        if (this.selectedTool === 'merchshop' && this.selectedMerchTypes.length > 0) {
          element.merchType = this.selectedMerchTypes;
        }
        if (this.selectedTool === 'access' && this.selectedAccessTypes.length > 0) {
          element.accessType = this.selectedAccessTypes;
        }
        if (this.selectedTool === 'entertainment' && this.selectedEntertainmentTypes.length > 0) {
          element.entertainmentType = this.selectedEntertainmentTypes;
        }
        if (this.selectedTool === 'entrance' && this.selectedEntranceTypes.length > 0) {
          element.entranceType = this.selectedEntranceTypes;
        }
        if (this.selectedTool === 'kitchen' && this.selectedKitchenTypes.length > 0) {
          element.kitchenType = this.selectedKitchenTypes;
        }

        this.onAddElement(element);
        this.onSelectElement(elementId);
      }

      this.isDragging = false;
      this.dragStart = null;
      this.newElement = null;
    },
    handleElementTouchStart(e, element) {
      e.stopPropagation();
      e.preventDefault();
      if (this.selectedTool) return;

      const pos = this.getTouchPosition(e);

      this.onSelectElement(element.id);
      this.isDraggingElement = true;
      this.draggedElementId = element.id;
      this.isTouchingCorner = false;
      this.elementDragOffset = {
        x: pos.x / this.scale - element.x,
        y: pos.y / this.scale - element.y,
      };
    },
    handleResizeTouchStart(e, element, handle) {
      e.stopPropagation();
      e.preventDefault();
      this.isResizing = true;
      this.resizeHandle = handle;
      this.draggedElementId = element.id;
      this.isTouchingCorner = true;

      const pos = this.getTouchPosition(e);
      this.resizeStart = {
        x: pos.x / this.scale,
        y: pos.y / this.scale,
        width: element.width,
        depth: element.depth,
        elementX: element.x,
        elementY: element.y,
      };
    },
    handleHoleTouchStart(e) {
      e.stopPropagation();
      e.preventDefault();
      this.isHoleSelected = true;
      const pos = this.getTouchPosition(e);
      this.isDraggingHole = true;
      this.holeDragOffset = {
        x: pos.x / this.scale - this.floor.hole.x * this.floor.width,
        y: pos.y / this.scale - this.floor.hole.y * this.floor.length,
      };
    },
    handleHoleResizeTouchStart(e, handle) {
      e.stopPropagation();
      e.preventDefault();
      this.isHoleSelected = true;
      const pos = this.getTouchPosition(e);
      this.isResizingHole = true;
      this.holeResizeHandle = handle;
      this.holeResizeStart = {
        x: pos.x / this.scale,
        y: pos.y / this.scale,
        width: this.floor.hole.width,
        length: this.floor.hole.length,
        holeX: this.floor.hole.x,
        holeY: this.floor.hole.y,
      };
    },
    handleTouchStart(e) {
      const target = e.target;
      const isBackground =
        target.tagName === 'svg' ||
        (target.tagName === 'rect' && target.getAttribute('fill') === 'url(#grid)') ||
        (target.tagName === 'path' && target.getAttribute('stroke') === '#9ca3af');

      if (!this.selectedTool && isBackground) {
        this.onSelectElement(null);
        this.isHoleSelected = false;

        if (this.isMobile && this.$refs.containerRef && e.touches.length > 0) {
          const hasOverflow =
            this.$refs.containerRef.scrollWidth > this.$refs.containerRef.clientWidth ||
            this.$refs.containerRef.scrollHeight > this.$refs.containerRef.clientHeight;

          if (hasOverflow) {
            e.preventDefault();
            const touch = e.touches[0];
            this.isPanning = true;
            this.panStart = { x: touch.clientX, y: touch.clientY };
            this.scrollStart = {
              scrollLeft: this.$refs.containerRef.scrollLeft,
              scrollTop: this.$refs.containerRef.scrollTop,
            };
          }
        }
        return;
      }

      if (this.selectedTool) {
        e.preventDefault();
        const pos = this.getTouchPosition(e);
        this.dragStart = pos;
        this.isDragging = true;
        this.newElement = { x: pos.x, y: pos.y, width: 0, height: 0 };
      }
    },
    handleTouchMove(e) {
      // Handle panning first
      if (
        this.isPanning &&
        this.panStart &&
        this.scrollStart &&
        this.$refs.containerRef &&
        e.touches.length > 0
      ) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.panStart.x;
        const deltaY = touch.clientY - this.panStart.y;

        this.$refs.containerRef.scrollLeft = this.scrollStart.scrollLeft - deltaX;
        this.$refs.containerRef.scrollTop = this.scrollStart.scrollTop - deltaY;
        return;
      }

      e.preventDefault();

      // Handle resizing
      if (this.isResizing && this.draggedElementId && this.resizeStart && this.resizeHandle) {
        const pos = this.getTouchPosition(e);
        const currentX = pos.x / this.scale;
        const currentY = pos.y / this.scale;
        const deltaX = currentX - this.resizeStart.x;
        const deltaY = currentY - this.resizeStart.y;

        const element = this.floor.elements.find((el) => el.id === this.draggedElementId);
        if (!element) return;

        let newWidth = element.width;
        let newDepth = element.depth;
        let newX = element.x;
        let newY = element.y;

        switch (this.resizeHandle) {
          case 'se':
            newWidth = Math.max(1, this.resizeStart.width + deltaX);
            newDepth = Math.max(1, this.resizeStart.depth + deltaY);
            break;
          case 'sw':
            newWidth = Math.max(1, this.resizeStart.width - deltaX);
            newDepth = Math.max(1, this.resizeStart.depth + deltaY);
            newX = this.resizeStart.elementX + (this.resizeStart.width - newWidth);
            break;
          case 'ne':
            newWidth = Math.max(1, this.resizeStart.width + deltaX);
            newDepth = Math.max(1, this.resizeStart.depth - deltaY);
            newY = this.resizeStart.elementY + (this.resizeStart.depth - newDepth);
            break;
          case 'nw':
            newWidth = Math.max(1, this.resizeStart.width - deltaX);
            newDepth = Math.max(1, this.resizeStart.depth - deltaY);
            newX = this.resizeStart.elementX + (this.resizeStart.width - newWidth);
            newY = this.resizeStart.elementY + (this.resizeStart.depth - newDepth);
            break;
        }

        newX = Math.max(0, Math.min(this.floor.width - newWidth, newX));
        newY = Math.max(0, Math.min(this.floor.length - newDepth, newY));

        this.onUpdateElement(this.draggedElementId, {
          width: newWidth,
          depth: newDepth,
          x: newX,
          y: newY,
        });
        return;
      }

      // Handle hole resizing
      if (this.isResizingHole && this.holeResizeStart && this.holeResizeHandle && this.onUpdateFloor) {
        const floorWithHole = this.floor;
        if (floorWithHole.hole?.enabled) {
          const pos = this.getTouchPosition(e);
          const currentX = pos.x / this.scale;
          const currentY = pos.y / this.scale;
          const deltaX = currentX - this.holeResizeStart.x;
          const deltaY = currentY - this.holeResizeStart.y;

          let newWidth = this.holeResizeStart.width;
          let newLength = this.holeResizeStart.length;

          switch (this.holeResizeHandle) {
            case 'se':
              newWidth = Math.max(1, this.holeResizeStart.width + deltaX * 2);
              newLength = Math.max(1, this.holeResizeStart.length + deltaY * 2);
              break;
            case 'sw':
              newWidth = Math.max(1, this.holeResizeStart.width - deltaX * 2);
              newLength = Math.max(1, this.holeResizeStart.length + deltaY * 2);
              break;
            case 'ne':
              newWidth = Math.max(1, this.holeResizeStart.width + deltaX * 2);
              newLength = Math.max(1, this.holeResizeStart.length - deltaY * 2);
              break;
            case 'nw':
              newWidth = Math.max(1, this.holeResizeStart.width - deltaX * 2);
              newLength = Math.max(1, this.holeResizeStart.length - deltaY * 2);
              break;
          }

          this.onUpdateFloor({
            hole: {
              ...floorWithHole.hole,
              width: newWidth,
              length: newLength,
            },
          });
        }
        return;
      }

      // Handle hole dragging
      if (this.isDraggingHole && this.holeDragOffset && this.onUpdateFloor) {
        const floorWithHole = this.floor;
        if (floorWithHole.hole?.enabled) {
          const pos = this.getTouchPosition(e);
          const newX = (pos.x / this.scale - this.holeDragOffset.x) / this.floor.width;
          const newY = (pos.y / this.scale - this.holeDragOffset.y) / this.floor.length;

          const clampedX = Math.max(0.1, Math.min(0.9, newX));
          const clampedY = Math.max(0.1, Math.min(0.9, newY));

          this.onUpdateFloor({
            hole: {
              ...floorWithHole.hole,
              x: clampedX,
              y: clampedY,
            },
          });
        }
        return;
      }

      // Handle element dragging
      if (this.isDraggingElement && this.draggedElementId && this.elementDragOffset) {
        const pos = this.getTouchPosition(e);
        const element = this.floor.elements.find((el) => el.id === this.draggedElementId);
        if (!element) return;

        const newX = Math.max(
          0,
          Math.min(
            this.floor.width - element.width,
            pos.x / this.scale - this.elementDragOffset.x,
          ),
        );
        const newY = Math.max(
          0,
          Math.min(
            this.floor.length - element.depth,
            pos.y / this.scale - this.elementDragOffset.y,
          ),
        );

        this.onUpdateElement(this.draggedElementId, { x: newX, y: newY });
        return;
      }

      // Handle new element drawing
      if (!this.isDragging || !this.dragStart || !this.selectedTool) return;

      const pos = this.getTouchPosition(e);
      const x = Math.min(this.dragStart.x, pos.x);
      const y = Math.min(this.dragStart.y, pos.y);
      const width = Math.abs(pos.x - this.dragStart.x);
      const height = Math.abs(pos.y - this.dragStart.y);

      this.newElement = { x, y, width, height };
    },
    handleTouchEnd() {
      this.touchStartPos = null;
      this.isTouchingCorner = false;
      this.handleMouseUp();
    },
    handleContainerMouseDown(e) {
      if (!this.$refs.containerRef) return;

      const target = e.target;
      if (target.tagName === 'svg' || target.closest('svg')) return;
      if (target.tagName === 'BUTTON' || target.closest('button')) return;

      const hasOverflow =
        this.$refs.containerRef.scrollWidth > this.$refs.containerRef.clientWidth ||
        this.$refs.containerRef.scrollHeight > this.$refs.containerRef.clientHeight;

      if (!hasOverflow) return;

      e.preventDefault();
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.scrollStart = {
        scrollLeft: this.$refs.containerRef.scrollLeft,
        scrollTop: this.$refs.containerRef.scrollTop,
      };
    },
    handleContainerMouseMove(e) {
      if (!this.isPanning || !this.panStart || !this.scrollStart || !this.$refs.containerRef) return;

      e.preventDefault();
      const deltaX = e.clientX - this.panStart.x;
      const deltaY = e.clientY - this.panStart.y;

      this.$refs.containerRef.scrollLeft = this.scrollStart.scrollLeft - deltaX;
      this.$refs.containerRef.scrollTop = this.scrollStart.scrollTop - deltaY;
    },
    handleContainerMouseUp() {
      this.isPanning = false;
      this.panStart = null;
      this.scrollStart = null;
    },
    handleContainerTouchStart(e) {
      if (!this.$refs.containerRef) return;

      const target = e.target;
      if (target.tagName === 'svg' || target.closest('svg')) return;
      if (target.tagName === 'BUTTON' || target.closest('button')) return;

      const hasOverflow =
        this.$refs.containerRef.scrollWidth > this.$refs.containerRef.clientWidth ||
        this.$refs.containerRef.scrollHeight > this.$refs.containerRef.clientHeight;

      if (!hasOverflow) return;

      const touch = e.touches[0];
      this.isPanning = true;
      this.panStart = { x: touch.clientX, y: touch.clientY };
      this.scrollStart = {
        scrollLeft: this.$refs.containerRef.scrollLeft,
        scrollTop: this.$refs.containerRef.scrollTop,
      };
    },
    handleContainerTouchMove(e) {
      if (!this.isPanning || !this.panStart || !this.scrollStart || !this.$refs.containerRef) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - this.panStart.x;
      const deltaY = touch.clientY - this.panStart.y;

      this.$refs.containerRef.scrollLeft = this.scrollStart.scrollLeft - deltaX;
      this.$refs.containerRef.scrollTop = this.scrollStart.scrollTop - deltaY;
    },
    handleContainerTouchEnd() {
      this.isPanning = false;
      this.panStart = null;
      this.scrollStart = null;
    },
    getElementColor(type) {
      const colors = {
        shop: '#10b981',
        storage: '#f59e0b',
        entrance: '#ef4444',
        hospitality: '#ec4899',
        merchshop: '#a0522d',
        access: '#64748b',
        entertainment: '#8b5cf6',
        kitchen: '#f97316',
      };
      return colors[type] || '#6b7280';
    },
    getDarkerColor(type) {
      const colors = {
        shop: '#059669',
        storage: '#d97706',
        entrance: '#dc2626',
        hospitality: '#db2777',
        merchshop: '#78350f',
        access: '#475569',
        entertainment: '#7c3aed',
        kitchen: '#ea580c',
      };
      return colors[type] || '#4b5563';
    },
  },
};
</script>
