<template>
  <div class="d-flex flex-column h-100">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-3">
      <h2 class="text-h6 mb-0 flex-shrink-0">Vue 3D de l'espace</h2>

      <div class="d-flex align-center ga-2">
        <slot name="config-controls" />
      </div>

      <div class="d-flex align-center ga-2">
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
    </div>

    <!-- Main SVG area -->
    <v-card class="flex-fill overflow-hidden" rounded="lg" elevation="2">
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

<script>
import { RotateCw, ZoomIn, ZoomOut } from 'lucide-vue-next';
import { h } from 'vue';
import { useTheme } from 'vuetify';

export default {
  name: 'ElevationBuilderView',
  components: {
    RotateCw,
    ZoomIn,
    ZoomOut,
    SvgPaths: {
      name: 'SvgPaths',
      props: {
        opacity: { type: Number, default: 0.7 },
        paths: { type: Array, default: () => [] }
      },
      render() {
        return h('g', { opacity: this.opacity },
          (this.paths || []).map(pathProps => h('path', pathProps))
        );
      }
    }
  },
  props: {
    floors: { type: Array, required: true },
    forecourt: { type: Object, default: null },
    externalMerch: { type: Object, default: null },
    selectedFloorId: { type: String, default: null },
    selectedElementId: { type: String, default: null },
    viewMode: { type: String, required: true }, // 'floor' | 'forecourt' | 'externalmerch'
    selectedTool: { type: String, default: null },
    selectedStorageTypes: { type: Array, default: () => [] },
    selectedShopTypes: { type: Array, default: () => [] },
    selectedHospitalityTypes: { type: Array, default: () => [] },
    selectedMerchTypes: { type: Array, default: () => [] },
    selectedAccessTypes: { type: Array, default: () => [] },
    selectedEntertainmentTypes: { type: Array, default: () => [] },
    selectedEntranceTypes: { type: Array, default: () => [] },
    selectedKitchenTypes: { type: Array, default: () => [] },
    allShopMenuItems: { type: Array, default: () => [] },
    allMerchShopItems: { type: Array, default: () => [] },
    onSelectElement: { type: Function, default: null },
    onSelectFloor: { type: Function, required: true },
    onSelectForecourt: { type: Function, required: true },
    onSelectExternalMerch: { type: Function, required: true },
    onUpdateFloor: { type: Function, required: true },
    onUpdateForecourt: { type: Function, required: true },
    onUpdateExternalMerch: { type: Function, required: true },
    onHighlightElements: { type: Function, default: null },
    onSearchQueryChange: { type: Function, default: null },
    onShowSearchResults: { type: Function, default: null },
    configurations: { type: Array, default: () => [] },
    currentConfigId: { type: [String, null], default: null },
    hasUnsavedChanges: { type: Boolean, default: false },
    onSaveConfiguration: { type: Function, default: null },
    onLoadConfiguration: { type: Function, default: null },
    onNewConfiguration: { type: Function, default: null },
    onDuplicateConfiguration: { type: Function, default: null },
    onRenameConfiguration: { type: Function, default: null },
    onDeleteConfiguration: { type: Function, default: null },
    getAvailableMenuItemsForElement: { type: Function, default: null }
  },
  setup() {
    const { global: vuetifyTheme } = useTheme();
    return { vuetifyTheme };
  },
  data() {
    return {
      rotation: 0,
      isResizingFloor: false,
      resizingFloorId: null,
      isResizingForecourt: false,
      resizeStart: null, // { x, y, width, length }
      searchQuery: '',
      highlightedElementIds: [],
      showSuggestions: false,
      zoom: 1,
      panOffset: { x: 0, y: 0 },
      isPanning: false,
      panStart: { x: 0, y: 0 },
    };
  },
  computed: {
    isDark() {
      return this.vuetifyTheme?.current.value.dark ?? false;
    },
    svgBackground() {
      return this.isDark ? 'rgba(30, 41, 59, 0.45)' : '#ffffff';
    },
    // constantes de projection
    scale() {
      return 3;
    },
    viewCenterX() {
      return 400;
    },
    viewCenterY() {
      return 300;
    },
    sortedFloors() {
      return [...this.floors].sort((a, b) => a.level - b.level);
    },
    _visibleFilter() {
      const configId = this.currentConfigId;
      if (!configId) return null;
      return el => {
        const ids = el.configurationIds;
        if (!Array.isArray(ids) || ids.length === 0) return true;
        return ids.includes(configId);
      };
    },
    visibleForecourtElements() {
      const elems = this.forecourt?.elements || [];
      return this._visibleFilter ? elems.filter(this._visibleFilter) : elems;
    },
    visibleExternalMerchElements() {
      const elems = this.externalMerch?.elements || [];
      return this._visibleFilter ? elems.filter(this._visibleFilter) : elems;
    },
    visibleElementsByFloorId() {
      const filter = this._visibleFilter;
      const result = {};
      for (const floor of this.sortedFloors) {
        const elems = floor.elements || [];
        result[floor.id] = filter ? elems.filter(filter) : elems;
      }
      return result;
    },

    // Forecourt
    isForecourtSelected() {
      return this.viewMode === 'forecourt';
    },
    forecourtColor() {
      return '#93c5fd'; // même couleur que floor
    },
    forecourtOpacity() {
      return this.isForecourtSelected ? 0.5 : 0.2;
    },
    forecourtOffsetX() {
      return this.forecourt ? -(this.forecourt.width / 2) : 0;
    },
    forecourtOffsetY() {
      return this.forecourt ? -(this.forecourt.length / 2) : 0;
    },
    groundZForForecourt() {
      const groundFloor = this.floors.find(f => f.level === 0);
      return groundFloor ? this.getFloorZ(groundFloor) : 0;
    },
    // External merch
    isExternalMerchSelected() {
      return this.viewMode === 'externalmerch';
    },
    externalMerchColor() {
      return '#a78bfa';
    },
    externalMerchOpacity() {
      return this.isExternalMerchSelected ? 0.5 : 0.2;
    },
    maxWidth() {
      const floorMax = this.floors.length ? Math.max(...this.floors.map(f => f.width)) : 0;
      const forecourtW = this.forecourt ? this.forecourt.width : 0;
      return Math.max(floorMax, forecourtW);
    },
    maxLength() {
      const floorMax = this.floors.length ? Math.max(...this.floors.map(f => f.length)) : 0;
      const forecourtL = this.forecourt ? this.forecourt.length : 0;
      return Math.max(floorMax, forecourtL);
    },
    externalOffsetX() {
      return this.maxWidth / 2 + 20;
    },
    externalOffsetY() {
      const merchLength = this.externalMerch ? this.externalMerch.length : 0;
      return -this.maxLength / 2 - merchLength - 20;
    },
    groundZForExternal() {
      const groundFloor = this.floors.find(f => f.level === 0);
      return groundFloor ? this.getFloorZ(groundFloor) : 0;
    },
    // Floor visual helpers
    floorColor() {
      return '#93c5fd';
    },
    // suggestions de recherche (Set -> Array triée)
    searchSuggestions() {
      const suggestions = new Set();
      // Simplified: just collect element names for now
      this.floors.forEach((floor) => {
        floor.elements?.forEach((element) => {
          if (element.name) suggestions.add(element.name);
        });
      });
      if (this.forecourt?.elements) {
        this.forecourt.elements.forEach((element) => {
          if (element.name) suggestions.add(element.name);
        });
      }
      if (this.externalMerch?.elements) {
        this.externalMerch.elements.forEach((element) => {
          if (element.name) suggestions.add(element.name);
        });
      }
      return Array.from(suggestions).sort();
    },
    filteredSuggestions() {
      if (!this.searchQuery) return [];
      const query = this.searchQuery.toLowerCase();
      return this.searchSuggestions
        .filter((s) => s.toLowerCase().includes(query))
        .slice(0, 10);
    }
  },
  methods: {

    getElementLabelColor(element) {
      const isSelected = element.id === this.selectedElementId;
      const isHighlighted =
        this.isElementHighlighted(element) ||
        this.highlightedElementIds.includes(element.id);
      if (isSelected || isHighlighted) return '#000000';
      return '#374151';
    },

    handlePanStart(e) {
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
    },
    
    handlePanMove(e) {
      if (!this.isPanning) return;
      const current = { x: e.clientX, y: e.clientY };
      const delta = {
        x: current.x - this.panStart.x,
        y: current.y - this.panStart.y,
      };
      this.panOffset = {
        x: this.panOffset.x + delta.x,
        y: this.panOffset.y + delta.y,
      };
      this.panStart = current;
    },

    handlePanEnd() {
      this.isPanning = false;
    },

    handleFloorClick(floorId, e) {
      if (e && e.stopPropagation) {
        e.stopPropagation();
      }
      if (this.onSelectFloor) {
        this.onSelectFloor(floorId);
      }
    },

    handleElementClick(elementId, e) {
      if (e && e.stopPropagation) {
        e.stopPropagation();
      }
      if (this.onSelectElement) {
        this.onSelectElement(elementId);
      }
    },

    setRotation(newRotation) {
      this.rotation = newRotation;
    },

    handleZoomIn() {
      this.zoom = Math.min(this.zoom + 0.1, 2);
    },

    handleZoomOut() {
      this.zoom = Math.max(this.zoom - 0.1, 0.5);
    },

    handleSearchKeyDown(e) {
      if (e.key === 'Enter') {
        this.performSearch();
      } else if (e.key === 'Escape') {
        this.showSuggestions = false;
      }
    },

    handleSuggestionClick(suggestion) {
      this.searchQuery = suggestion;
      this.showSuggestions = false;
      this.performSearch();
    },
    performSearch() {
      // Simplified search - just highlight matching elements
      const query = this.searchQuery.toLowerCase();
      const matchingIds = [];
      
      this.floors.forEach((floor) => {
        floor.elements?.forEach((element) => {
          if (element.name?.toLowerCase().includes(query)) {
            matchingIds.push(element.id);
          }
        });
      });
      
      this.highlightedElementIds = matchingIds;
      this.onHighlightElements && this.onHighlightElements(matchingIds);
    },

  // --- projection déjà présentes peut-être ---
    rotatePoint(x, y, angle) {
      const rad = (angle * Math.PI) / 180;
      return {
        x: x * Math.cos(rad) - y * Math.sin(rad),
        y: x * Math.sin(rad) + y * Math.cos(rad)
      };
    },
    toIsometric(x, y, z, angle) {
      const rotated = this.rotatePoint(x, y, angle);
      return {
        x: rotated.x - rotated.y,
        y: (rotated.x + rotated.y) * 0.5 - z
      };
    },
    getFloorZ(floor) {
      const floorsBelow = this.floors.filter(f => f.level < floor.level);
      return floorsBelow.reduce((sum, f) => sum + f.height, 0);
    },

    // --- couleur / highlight ---
    getElementColor(type) {
      const colors = {
        shop: '#10b981',
        storage: '#f59e0b',
        entrance: '#ff3131',
        hospitality: '#ec4899',
        merchshop: '#a0522d',
        access: '#64748b',
        entertainment: '#8b5cf6',
        kitchen: '#f97316'
      };
      // Éléments F&B importés (Data Integration) parfois typés `fnb-*` → couleur F&B.
      const key = String(type || '').startsWith('fnb') ? 'shop' : type;
      return colors[key] || '#6b7280';
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
        kitchen: '#ea580c'
      };
      const key = String(type || '').startsWith('fnb') ? 'shop' : type;
      return colors[key] || '#4b5563';
    },
    isElementHighlighted(element) {
      if (!this.selectedTool) return false;
      if (element.type !== this.selectedTool) return false;

      if (element.type === 'shop') {
        if (this.selectedShopTypes.length === 0) return true;
        return element.shopType?.some(t => this.selectedShopTypes.includes(t)) || false;
      }
      if (element.type === 'storage') {
        if (this.selectedStorageTypes.length === 0) return true;
        return element.storageType?.some(t => this.selectedStorageTypes.includes(t)) || false;
      }
      if (element.type === 'hospitality') {
        if (this.selectedHospitalityTypes.length === 0) return true;
        return element.hospitalityType?.some(t => this.selectedHospitalityTypes.includes(t)) || false;
      }
      if (element.type === 'merchshop') {
        if (this.selectedMerchTypes.length === 0) return true;
        return element.merchType?.some(t => this.selectedMerchTypes.includes(t)) || false;
      }
      if (element.type === 'access') {
        if (this.selectedAccessTypes.length === 0) return true;
        return element.accessType?.some(t => this.selectedAccessTypes.includes(t)) || false;
      }
      if (element.type === 'entertainment') {
        if (this.selectedEntertainmentTypes.length === 0) return true;
        return element.entertainmentType?.some(t => this.selectedEntertainmentTypes.includes(t)) || false;
      }
      if (element.type === 'entrance') {
        if (this.selectedEntranceTypes.length === 0) return true;
        return element.entranceType?.some(t => this.selectedEntranceTypes.includes(t)) || false;
      }
      if (element.type === 'kitchen') {
        if (this.selectedKitchenTypes.length === 0) return true;
        return element.kitchenType?.some(t => this.selectedKitchenTypes.includes(t)) || false;
      }
      return true;
    },
    getElementBoxColor(element) {
      const base = this.getElementColor(element.type);
      const selected = element.id === this.selectedElementId;
      const highlighted = this.isElementHighlighted(element) ||
        this.highlightedElementIds.includes(element.id);
      if (selected || highlighted) {
        return this.getDarkerColor(element.type);
      }
      return base;
    },

    // --- grille (getGridH / getGridV) ---
    getGridH(i) {
      const gridSize = 10;
      const start = this.toIsometric(-50, i * gridSize - 50, 0, this.rotation);
      const end = this.toIsometric(50, i * gridSize - 50, 0, this.rotation);
      return {
        x1: start.x * this.scale + this.viewCenterX,
        y1: start.y * this.scale + this.viewCenterY,
        x2: end.x * this.scale + this.viewCenterX,
        y2: end.y * this.scale + this.viewCenterY
      };
    },
    getGridV(i) {
      const gridSize = 10;
      const start = this.toIsometric(i * gridSize - 50, -50, 0, this.rotation);
      const end = this.toIsometric(i * gridSize - 50, 50, 0, this.rotation);
      return {
        x1: start.x * this.scale + this.viewCenterX,
        y1: start.y * this.scale + this.viewCenterY,
        x2: end.x * this.scale + this.viewCenterX,
        y2: end.y * this.scale + this.viewCenterY
      };
    },

    // --- floor sélection & opacité ---
    isFloorSelected(floor) {
      return this.viewMode === 'floor' && floor.id === this.selectedFloorId;
    },
    getFloorOpacity(floor) {
      return this.isFloorSelected(floor) ? 0.4 : 0.15; // valeurs plus basses = plus transparent
    },

    // --- positions des labels (mêmes formules que TSX) ---
    getElementLabelPosForecourt(element) {
      const z = this.groundZForForecourt + element.height + 1;
      const x = element.x + this.forecourtOffsetX + element.width / 2;
      const y = element.y + this.forecourtOffsetY + element.depth / 2;
      const p = this.toIsometric(x, y, z, this.rotation);
      return {
        x: p.x * this.scale + this.viewCenterX,
        y: p.y * this.scale + this.viewCenterY
      };
    },
    getForecourtLabelPos() {
      const z = this.groundZForForecourt;
      const x = this.forecourt.width / 2 + 5;
      const y = 0;
      const p = this.toIsometric(x, y, z, this.rotation);
      return {
        x: p.x * this.scale + this.viewCenterX,
        y: p.y * this.scale + this.viewCenterY
      };
    },
    getExternalElementLabelPos(element) {
      const elX = element.x || 0;
      const elY = element.y || 0;
      const elWidth = element.width || 0;
      const elDepth = element.depth || 0;
      const elHeight = element.height || 0;
      const z = this.groundZForExternal + elHeight + 1;
      const x = elX + this.externalOffsetX + elWidth / 2;
      const y = elY + this.externalOffsetY + elDepth / 2;
      const p = this.toIsometric(x, y, z, this.rotation);
      return {
        x: p.x * this.scale + this.viewCenterX,
        y: p.y * this.scale + this.viewCenterY
      };
    },
    getExternalMerchLabelPos() {
      const z = this.groundZForExternal + 2;
      const x = this.externalOffsetX + this.externalMerch.width / 2;
      const y = this.externalOffsetY + this.externalMerch.length / 2;
      const p = this.toIsometric(x, y, z, this.rotation);
      return {
        x: p.x * this.scale + this.viewCenterX,
        y: p.y * this.scale + this.viewCenterY
      };
    },
    getFloorElementLabelPos(element, floor) {
      const floorZ = this.getFloorZ(floor);
      const z = floorZ + element.height + 1;
      const x = element.x - floor.width / 2 + element.width / 2;
      const y = element.y - floor.length / 2 + element.depth / 2;
      const p = this.toIsometric(x, y, z, this.rotation);
      return {
        x: p.x * this.scale + this.viewCenterX,
        y: p.y * this.scale + this.viewCenterY
      };
    },
    getFloorLabelPos(floor) {
      const floorZ = this.getFloorZ(floor);
      const z = floorZ + floor.height / 2;
      const x = floor.width / 2 + 5;
      const y = 0;
      const p = this.toIsometric(x, y, z, this.rotation);
      return {
        x: p.x * this.scale + this.viewCenterX,
        y: p.y * this.scale + this.viewCenterY
      };
    },

    // --- dessin de base: drawBox (non utilisé directement dans le template, mais utile) ---
    drawBox(x, y, z, width, depth, height, color, opacity = 0.7, strokeWidth = 1) {
      const corners = [
        this.toIsometric(x, y, z, this.rotation),
        this.toIsometric(x + width, y, z, this.rotation),
        this.toIsometric(x + width, y + depth, z, this.rotation),
        this.toIsometric(x, y + depth, z, this.rotation),
        this.toIsometric(x, y, z + height, this.rotation),
        this.toIsometric(x + width, y, z + height, this.rotation),
        this.toIsometric(x + width, y + depth, z + height, this.rotation),
        this.toIsometric(x, y + depth, z + height, this.rotation)
      ].map(p => ({
        x: p.x * this.scale + this.viewCenterX,
        y: p.y * this.scale + this.viewCenterY
      }));

      return {
        opacity,
        paths: [
          { d: `M ${corners[0].x} ${corners[0].y} L ${corners[1].x} ${corners[1].y} L ${corners[2].x} ${corners[2].y} L ${corners[3].x} ${corners[3].y} Z`, fill: color, fillOpacity: 0.3, stroke: color, strokeWidth },
          { d: `M ${corners[4].x} ${corners[4].y} L ${corners[5].x} ${corners[5].y} L ${corners[6].x} ${corners[6].y} L ${corners[7].x} ${corners[7].y} Z`, fill: color, fillOpacity: 0.5, stroke: color, strokeWidth },
          { d: `M ${corners[0].x} ${corners[0].y} L ${corners[1].x} ${corners[1].y} L ${corners[5].x} ${corners[5].y} L ${corners[4].x} ${corners[4].y} Z`, fill: color, fillOpacity: 0.4, stroke: color, strokeWidth },
          { d: `M ${corners[1].x} ${corners[1].y} L ${corners[2].x} ${corners[2].y} L ${corners[6].x} ${corners[6].y} L ${corners[5].x} ${corners[5].y} Z`, fill: color, fillOpacity: 0.4, stroke: color, strokeWidth }
        ]
      };
    },

    // --- drawRoundedBox: version fidèle au TSX, renvoie un <g> avec deux paths arrondis ---
    drawRoundedBox(x, y, z, width, depth, height, cornerRadius, color, opacity = 0.7, strokeWidth = 1) {
      if (
        !cornerRadius ||
        (cornerRadius.topLeft === 0 &&
          cornerRadius.topRight === 0 &&
          cornerRadius.bottomLeft === 0 &&
          cornerRadius.bottomRight === 0)
      ) {
        return this.drawBox(x, y, z, width, depth, height, color, opacity, strokeWidth);
      }

      const createRoundedPath = (zLevel) => {
        const tl = Math.min(cornerRadius.topLeft, width / 2, depth / 2);
        const tr = Math.min(cornerRadius.topRight, width / 2, depth / 2);
        const br = Math.min(cornerRadius.bottomRight, width / 2, depth / 2);
        const bl = Math.min(cornerRadius.bottomLeft, width / 2, depth / 2);

        const points = [];
        const segments = 8;

        // top-left
        if (tl > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = x + tl - tl * Math.cos(angle);
            const py = y + tl - tl * Math.sin(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            points.push({
              x: iso.x * this.scale + this.viewCenterX,
              y: iso.y * this.scale + this.viewCenterY
            });
          }
        } else {
          const iso = this.toIsometric(x, y, zLevel, this.rotation);
          points.push({
            x: iso.x * this.scale + this.viewCenterX,
            y: iso.y * this.scale + this.viewCenterY
          });
        }

        // top-right
        if (tr > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = x + width - tr + tr * Math.sin(angle);
            const py = y + tr - tr * Math.cos(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            points.push({
              x: iso.x * this.scale + this.viewCenterX,
              y: iso.y * this.scale + this.viewCenterY
            });
          }
        } else {
          const iso = this.toIsometric(x + width, y, zLevel, this.rotation);
          points.push({
            x: iso.x * this.scale + this.viewCenterX,
            y: iso.y * this.scale + this.viewCenterY
          });
        }

        // bottom-right
        if (br > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = x + width - br + br * Math.cos(angle);
            const py = y + depth - br + br * Math.sin(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            points.push({
              x: iso.x * this.scale + this.viewCenterX,
              y: iso.y * this.scale + this.viewCenterY
            });
          }
        } else {
          const iso = this.toIsometric(x + width, y + depth, zLevel, this.rotation);
          points.push({
            x: iso.x * this.scale + this.viewCenterX,
            y: iso.y * this.scale + this.viewCenterY
          });
        }

        // bottom-left
        if (bl > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = x + bl - bl * Math.sin(angle);
            const py = y + depth - bl + bl * Math.cos(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            points.push({
              x: iso.x * this.scale + this.viewCenterX,
              y: iso.y * this.scale + this.viewCenterY
            });
          }
        } else {
          const iso = this.toIsometric(x, y + depth, zLevel, this.rotation);
          points.push({
            x: iso.x * this.scale + this.viewCenterX,
            y: iso.y * this.scale + this.viewCenterY
          });
        }

        let pathStr = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          pathStr += ` L ${points[i].x} ${points[i].y}`;
        }
        pathStr += ' Z';
        return pathStr;
      };

      return {
        opacity,
        paths: [
          { d: createRoundedPath(z), fill: color, fillOpacity: 0.3, stroke: color, strokeWidth },
          { d: createRoundedPath(z + height), fill: color, fillOpacity: 0.5, stroke: color, strokeWidth }
        ]
      };
    },

    drawRotatedBox(
      x,
      y,
      z,
      width,
      depth,
      height,
      elementRotation,
      color,
      opacity = 0.7,
      strokeWidth = 1
    ) {
      // Centre de l’élément
      const centerX = x + width / 2;
      const centerY = y + depth / 2;
      // 4 coins du rectangle de base (repère local)
      const baseCorners = [
        { x: -width / 2, y: -depth / 2 }, // top-left
        { x:  width / 2, y: -depth / 2 }, // top-right
        { x:  width / 2, y:  depth / 2 }, // bottom-right
        { x: -width / 2, y:  depth / 2 }  // bottom-left
      ];
      // Rotation autour du centre
      const rotationRad = (elementRotation * Math.PI) / 180;
      const rotatedCorners = baseCorners.map(corner => {
        const rotatedX = corner.x * Math.cos(rotationRad) - corner.y * Math.sin(rotationRad);
        const rotatedY = corner.x * Math.sin(rotationRad) + corner.y * Math.cos(rotationRad);
        return {
          x: centerX + rotatedX,
          y: centerY + rotatedY
        };
      });
      // Isométrique pour faces bas / haut
      const bottomCorners = rotatedCorners.map(c =>
        this.toIsometric(c.x, c.y, z, this.rotation)
      );
      const topCorners = rotatedCorners.map(c =>
        this.toIsometric(c.x, c.y, z + height, this.rotation)
      );
      const corners = [...bottomCorners, ...topCorners].map(p => ({
        x: p.x * this.scale + this.viewCenterX,
        y: p.y * this.scale + this.viewCenterY
      }));
      return {
        opacity,
        paths: [
          { d: `M ${corners[0].x} ${corners[0].y} L ${corners[1].x} ${corners[1].y} L ${corners[2].x} ${corners[2].y} L ${corners[3].x} ${corners[3].y} Z`, fill: color, fillOpacity: 0.3, stroke: color, strokeWidth },
          { d: `M ${corners[4].x} ${corners[4].y} L ${corners[5].x} ${corners[5].y} L ${corners[6].x} ${corners[6].y} L ${corners[7].x} ${corners[7].y} Z`, fill: color, fillOpacity: 0.5, stroke: color, strokeWidth },
          { d: `M ${corners[0].x} ${corners[0].y} L ${corners[1].x} ${corners[1].y} L ${corners[5].x} ${corners[5].y} L ${corners[4].x} ${corners[4].y} Z`, fill: color, fillOpacity: 0.4, stroke: color, strokeWidth },
          { d: `M ${corners[1].x} ${corners[1].y} L ${corners[2].x} ${corners[2].y} L ${corners[6].x} ${corners[6].y} L ${corners[5].x} ${corners[5].y} Z`, fill: color, fillOpacity: 0.4, stroke: color, strokeWidth },
          { d: `M ${corners[2].x} ${corners[2].y} L ${corners[3].x} ${corners[3].y} L ${corners[7].x} ${corners[7].y} L ${corners[6].x} ${corners[6].y} Z`, fill: color, fillOpacity: 0.4, stroke: color, strokeWidth },
          { d: `M ${corners[3].x} ${corners[3].y} L ${corners[0].x} ${corners[0].y} L ${corners[4].x} ${corners[4].y} L ${corners[7].x} ${corners[7].y} Z`, fill: color, fillOpacity: 0.4, stroke: color, strokeWidth }
        ]
      };
    },

    // --- drawRotatedRoundedBox & drawDoughnutFloor ---
    // Pour l'instant on peut les implémenter plus tard ou faire des placeholders :
    drawRotatedRoundedBox(
      x,
      y,
      z,
      width,
      depth,
      height,
      elementRotation,
      cornerRadius,
      color,
      opacity = 0.7,
      strokeWidth = 1
    ) {
      if (
        !cornerRadius ||
        (cornerRadius.topLeft === 0 &&
          cornerRadius.topRight === 0 &&
          cornerRadius.bottomLeft === 0 &&
          cornerRadius.bottomRight === 0)
      ) {
        // fallback: box simple tournée (tu dois déjà avoir drawRotatedBox ou l’implémenter)
        return this.drawRotatedBox
          ? this.drawRotatedBox(x, y, z, width, depth, height, elementRotation, color, opacity, strokeWidth)
          : this.drawBox(x, y, z, width, depth, height, color, opacity, strokeWidth);
      }

      const centerX = x + width / 2;
      const centerY = y + depth / 2;

      const tl = Math.min(cornerRadius.topLeft, width / 2, depth / 2);
      const tr = Math.min(cornerRadius.topRight, width / 2, depth / 2);
      const br = Math.min(cornerRadius.bottomRight, width / 2, depth / 2);
      const bl = Math.min(cornerRadius.bottomLeft, width / 2, depth / 2);

      const createRotatedRoundedPath = (zLevel) => {
        const points = [];
        const segments = 8;
        const rotationRad = (elementRotation * Math.PI) / 180;

        const rotateAndTransform = (localX, localY) => {
          const relX = localX - width / 2;
          const relY = localY - depth / 2;
          const rotatedX = relX * Math.cos(rotationRad) - relY * Math.sin(rotationRad);
          const rotatedY = relX * Math.sin(rotationRad) + relY * Math.cos(rotationRad);
          return {
            x: centerX + rotatedX,
            y: centerY + rotatedY
          };
        };

        // Top-left
        if (tl > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const localX = tl - tl * Math.cos(angle);
            const localY = tl - tl * Math.sin(angle);
            const world = rotateAndTransform(localX, localY);
            const iso = this.toIsometric(world.x, world.y, zLevel, this.rotation);
            points.push({
              x: iso.x * this.scale + this.viewCenterX,
              y: iso.y * this.scale + this.viewCenterY
            });
          }
        } else {
          const world = rotateAndTransform(0, 0);
          const iso = this.toIsometric(world.x, world.y, zLevel, this.rotation);
          points.push({
            x: iso.x * this.scale + this.viewCenterX,
            y: iso.y * this.scale + this.viewCenterY
          });
        }

        // Top-right
        if (tr > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const localX = width - tr + tr * Math.sin(angle);
            const localY = tr - tr * Math.cos(angle);
            const world = rotateAndTransform(localX, localY);
            const iso = this.toIsometric(world.x, world.y, zLevel, this.rotation);
            points.push({
              x: iso.x * this.scale + this.viewCenterX,
              y: iso.y * this.scale + this.viewCenterY
            });
          }
        } else {
          const world = rotateAndTransform(width, 0);
          const iso = this.toIsometric(world.x, world.y, zLevel, this.rotation);
          points.push({
            x: iso.x * this.scale + this.viewCenterX,
            y: iso.y * this.scale + this.viewCenterY
          });
        }

        // Bottom-right
        if (br > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const localX = width - br + br * Math.cos(angle);
            const localY = depth - br + br * Math.sin(angle);
            const world = rotateAndTransform(localX, localY);
            const iso = this.toIsometric(world.x, world.y, zLevel, this.rotation);
            points.push({
              x: iso.x * this.scale + this.viewCenterX,
              y: iso.y * this.scale + this.viewCenterY
            });
          }
        } else {
          const world = rotateAndTransform(width, depth);
          const iso = this.toIsometric(world.x, world.y, zLevel, this.rotation);
          points.push({
            x: iso.x * this.scale + this.viewCenterX,
            y: iso.y * this.scale + this.viewCenterY
          });
        }

        // Bottom-left
        if (bl > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const localX = bl - bl * Math.sin(angle);
            const localY = depth - bl + bl * Math.cos(angle);
            const world = rotateAndTransform(localX, localY);
            const iso = this.toIsometric(world.x, world.y, zLevel, this.rotation);
            points.push({
              x: iso.x * this.scale + this.viewCenterX,
              y: iso.y * this.scale + this.viewCenterY
            });
          }
        } else {
          const world = rotateAndTransform(0, depth);
          const iso = this.toIsometric(world.x, world.y, zLevel, this.rotation);
          points.push({
            x: iso.x * this.scale + this.viewCenterX,
            y: iso.y * this.scale + this.viewCenterY
          });
        }

        let pathStr = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          pathStr += ` L ${points[i].x} ${points[i].y}`;
        }
        pathStr += ' Z';
        return pathStr;
      };

      return {
        opacity,
        paths: [
          { d: createRotatedRoundedPath(z), fill: color, fillOpacity: 0.3, stroke: color, strokeWidth },
          { d: createRotatedRoundedPath(z + height), fill: color, fillOpacity: 0.5, stroke: color, strokeWidth }
        ]
      };
    },

    drawDoughnutFloor(
      x,
      y,
      z,
      width,
      depth,
      height,
      cornerRadius,
      hole,
      color,
      opacity = 0.7,
      strokeWidth = 1
    ) {
      const holeX = x + (hole.x * width) - hole.width / 2;
      const holeY = y + (hole.y * depth) - hole.length / 2;

      const createDoughnutPath = (zLevel) => {
        const segments = 8;
        const outerPoints = [];
        const innerPoints = [];

        const outerTL = cornerRadius ? Math.min(cornerRadius.topLeft, width / 2, depth / 2) : 0;
        const outerTR = cornerRadius ? Math.min(cornerRadius.topRight, width / 2, depth / 2) : 0;
        const outerBR = cornerRadius ? Math.min(cornerRadius.bottomRight, width / 2, depth / 2) : 0;
        const outerBL = cornerRadius ? Math.min(cornerRadius.bottomLeft, width / 2, depth / 2) : 0;

        const innerTL = Math.min(hole.cornerRadius.topLeft, hole.width / 2, hole.length / 2);
        const innerTR = Math.min(hole.cornerRadius.topRight, hole.width / 2, hole.length / 2);
        const innerBR = Math.min(hole.cornerRadius.bottomRight, hole.width / 2, hole.length / 2);
        const innerBL = Math.min(hole.cornerRadius.bottomLeft, hole.width / 2, hole.length / 2);

        // outer TL
        if (outerTL > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = x + outerTL - outerTL * Math.cos(angle);
            const py = y + outerTL - outerTL * Math.sin(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            outerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
          }
        } else {
          const iso = this.toIsometric(x, y, zLevel, this.rotation);
          outerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
        }

        // outer TR
        if (outerTR > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = x + width - outerTR + outerTR * Math.sin(angle);
            const py = y + outerTR - outerTR * Math.cos(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            outerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
          }
        } else {
          const iso = this.toIsometric(x + width, y, zLevel, this.rotation);
          outerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
        }

        // outer BR
        if (outerBR > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = x + width - outerBR + outerBR * Math.cos(angle);
            const py = y + depth - outerBR + outerBR * Math.sin(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            outerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
          }
        } else {
          const iso = this.toIsometric(x + width, y + depth, zLevel, this.rotation);
          outerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
        }

        // outer BL
        if (outerBL > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = x + outerBL - outerBL * Math.sin(angle);
            const py = y + depth - outerBL + outerBL * Math.cos(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            outerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
          }
        } else {
          const iso = this.toIsometric(x, y + depth, zLevel, this.rotation);
          outerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
        }

        // inner TL
        if (innerTL > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = holeX + innerTL - innerTL * Math.cos(angle);
            const py = holeY + innerTL - innerTL * Math.sin(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            innerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
          }
        } else {
          const iso = this.toIsometric(holeX, holeY, zLevel, this.rotation);
          innerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
        }

        // inner BL
        if (innerBL > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = holeX + innerBL - innerBL * Math.sin(angle);
            const py = holeY + hole.length - innerBL + innerBL * Math.cos(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            innerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
          }
        } else {
          const iso = this.toIsometric(holeX, holeY + hole.length, zLevel, this.rotation);
          innerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
        }

        // inner BR
        if (innerBR > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = holeX + hole.width - innerBR + innerBR * Math.cos(angle);
            const py = holeY + hole.length - innerBR + innerBR * Math.sin(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            innerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
          }
        } else {
          const iso = this.toIsometric(holeX + hole.width, holeY + hole.length, zLevel, this.rotation);
          innerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
        }

        // inner TR
        if (innerTR > 0) {
          for (let i = 0; i <= segments; i++) {
            const angle = (Math.PI / 2) * (i / segments);
            const px = holeX + hole.width - innerTR + innerTR * Math.sin(angle);
            const py = holeY + innerTR - innerTR * Math.cos(angle);
            const iso = this.toIsometric(px, py, zLevel, this.rotation);
            innerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
          }
        } else {
          const iso = this.toIsometric(holeX + hole.width, holeY, zLevel, this.rotation);
          innerPoints.push({ x: iso.x * this.scale + this.viewCenterX, y: iso.y * this.scale + this.viewCenterY });
        }

        let path = `M ${outerPoints[0].x} ${outerPoints[0].y}`;
        for (let i = 1; i < outerPoints.length; i++) {
          path += ` L ${outerPoints[i].x} ${outerPoints[i].y}`;
        }
        path += ' Z';

        path += ` M ${innerPoints[0].x} ${innerPoints[0].y}`;
        for (let i = 1; i < innerPoints.length; i++) {
          path += ` L ${innerPoints[i].x} ${innerPoints[i].y}`;
        }
        path += ' Z';

        return path;
      };

      return {
        opacity,
        paths: [
          { d: createDoughnutPath(z), fill: color, fillOpacity: 0.3, fillRule: 'evenodd', stroke: color, strokeWidth },
          { d: createDoughnutPath(z + height), fill: color, fillOpacity: 0.5, fillRule: 'evenodd', stroke: color, strokeWidth }
        ]
      };
    },
  }
};
</script>