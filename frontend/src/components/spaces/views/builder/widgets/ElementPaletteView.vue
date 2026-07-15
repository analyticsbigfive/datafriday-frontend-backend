<template>
  <div :class="condensed ? 'p-2' : 'px-2 pb-4'">
    <!-- Collapsible header -->
    <button v-if="!condensed" class="palette-header" @click="paletteOpen = !paletteOpen">
      <span class="fw-bold">Element Palette</span>
      <ChevronDown :size="16" :style="{ transform: paletteOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }" />
    </button>

    <!-- Tool list -->
    <div v-show="paletteOpen" class="d-flex flex-column gap-2 pt-2">
      <div v-for="tool in tools" :key="tool.type">
        <!-- Main tool card -->
        <div
          :class="['palette-item', selectedTool === tool.type ? 'palette-item--selected' : '']"
          @click="handleToolClick(tool)"
        >
          <v-avatar :color="tool.vuetifyColor" size="47" rounded="lg" class="flex-shrink-0">
            <component :is="tool.icon" :size="22" :color="tool.iconColor" />
          </v-avatar>
          <span class="flex-grow-1 fw-medium" style="font-size: 14px;">{{ tool.label }}</span>
          <button
            v-if="tool.hasTypes"
            class="palette-expand-btn"
            @click.stop="toggleToolExpanded(tool)"
          >
            <ChevronDown v-if="isToolExpanded(tool)" :size="18" />
            <ChevronRight v-else :size="18" />
          </button>
        </div>

        <!-- Subtype expansion -->
        <div v-if="isToolExpanded(tool)" class="palette-subtypes">
          <v-chip
            v-for="option in subtypeOptions(tool.type)"
            :key="option.value"
            size="small"
            rounded="pill"
            :color="isSubtypeSelected(tool.type, option.value) ? tool.chipColor : undefined"
            :variant="isSubtypeSelected(tool.type, option.value) ? 'flat' : 'tonal'"
            class="cursor-pointer"
            @click.stop="toggleSubtype(tool.type, option.value)"
          >{{ option.label }}</v-chip>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  Store,
  Package,
  Scan,
  Drama,
  Trophy,
  Crown,
  ShoppingBag,
  ChevronDown,
  ChevronRight,
  Move,
  Sparkles,
  ChefHat,
} from 'lucide-vue-next';

export default {
  name: 'ElementPaletteView',
  components: {
    Store,
    Package,
    Scan,
    Drama,
    Trophy,
    Crown,
    ShoppingBag,
    ChevronDown,
    ChevronRight,
    Move,
    Sparkles,
    ChefHat,
  },
  props: {
    selectedTool: {
      type: String,
      default: null,
    },
    onSelectTool: {
      type: Function,
      required: true,
    },
    selectedStorageTypes: {
      type: Array,
      required: true,
    },
    onSelectStorageTypes: {
      type: Function,
      required: true,
    },
    selectedShopTypes: {
      type: Array,
      required: true,
    },
    onSelectShopTypes: {
      type: Function,
      required: true,
    },
    selectedHospitalityTypes: {
      type: Array,
      required: true,
    },
    onSelectHospitalityTypes: {
      type: Function,
      required: true,
    },
    selectedMerchTypes: {
      type: Array,
      required: true,
    },
    onSelectMerchTypes: {
      type: Function,
      required: true,
    },
    selectedAccessTypes: {
      type: Array,
      required: true,
    },
    onSelectAccessTypes: {
      type: Function,
      required: true,
    },
    selectedEntertainmentTypes: {
      type: Array,
      required: true,
    },
    onSelectEntertainmentTypes: {
      type: Function,
      required: true,
    },
    selectedEntranceTypes: {
      type: Array,
      required: true,
    },
    onSelectEntranceTypes: {
      type: Function,
      required: true,
    },
    selectedKitchenTypes: {
      type: Array,
      required: true,
    },
    onSelectKitchenTypes: {
      type: Function,
      required: true,
    },
    onClearSelectedElement: {
      type: Function,
      default: null,
    },
    condensed: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      paletteOpen: true,
      shopExpanded: false,
      storageExpanded: false,
      hospitalityExpanded: false,
      merchExpanded: false,
      accessExpanded: false,
      entertainmentExpanded: false,
      entranceExpanded: false,
      kitchenExpanded: false,
      storageTypeOptions: [
        { value: 'dry', label: 'Dry storage' },
        { value: 'cold', label: 'Cold storage' },
        { value: 'belowzero', label: 'Below zero storage' },
        { value: 'material', label: 'Material storage' },
        { value: 'merch', label: 'Merch storage' },
      ],
      shopTypeOptions: [
        { value: 'food', label: 'Food' },
        { value: 'beverages', label: 'Beverages' },
        { value: 'beer', label: 'Beer' },
        { value: 'gppremium', label: 'GP Premium' },
        { value: 'temporary', label: 'Temporary' },
        { value: 'drinkee', label: 'Drinkee' },
      ],
      hospitalityTypeOptions: [
        { value: 'lodges', label: 'Lodges' },
        { value: 'salon', label: 'Salon' },
      ],
      merchTypeOptions: [
        { value: 'onsite', label: 'On site' },
        { value: 'offsite', label: 'Off site' },
        { value: 'temporary', label: 'Temporary' },
      ],
      accessTypeOptions: [
        { value: 'lift', label: 'Lift' },
        { value: 'staircase', label: 'Staircase' },
        { value: 'servicelift', label: 'Service Lift' },
        { value: 'venueentrance', label: 'Venue Entrance' },
        { value: 'parking', label: 'Parking' },
        { value: 'reception', label: 'Reception' },
        { value: 'information', label: 'Information' },
      ],
      entertainmentTypeOptions: [
        { value: 'sportground', label: 'Sport Ground' },
        { value: 'stage', label: 'Stage' },
        { value: 'mice', label: 'M.I.C.E.' },
      ],
      entranceTypeOptions: [
        { value: 'public', label: 'Public' },
        { value: 'vip', label: 'VIP' },
        { value: 'staff', label: 'Staff' },
      ],
      kitchenTypeOptions: [
        { value: 'fb', label: 'F&B' },
        { value: 'hospitality', label: 'Hospitality' },
        { value: 'storage', label: 'Storage' },
      ],
      tools: [
        { type: 'shop', label: 'F&B', icon: Store, vuetifyColor: 'green-lighten-5', iconColor: '#4CAF50', chipColor: 'green', hasTypes: true },
        { type: 'hospitality', label: 'Hospitality', icon: Crown, vuetifyColor: 'pink-lighten-5', iconColor: '#E91E63', chipColor: 'pink', hasTypes: true },
        { type: 'merchshop', label: 'Merch', icon: ShoppingBag, vuetifyColor: 'grey-lighten-3', iconColor: '#616161', chipColor: 'grey-darken-2', hasTypes: true },
        { type: 'storage', label: 'Storage', icon: Package, vuetifyColor: 'orange-lighten-5', iconColor: '#FF9800', chipColor: 'orange', hasTypes: true },
        { type: 'entrance', label: 'Ticketing', icon: Scan, vuetifyColor: 'red-lighten-5', iconColor: '#F44336', chipColor: 'red', hasTypes: true },
        { type: 'entertainment', label: 'Entertainment', icon: Sparkles, vuetifyColor: 'purple-lighten-5', iconColor: '#9C27B0', chipColor: 'purple', hasTypes: true },
        { type: 'access', label: 'Access', icon: Move, vuetifyColor: 'blue-grey-lighten-5', iconColor: '#607D8B', chipColor: 'blue-grey', hasTypes: true },
        { type: 'kitchen', label: 'Kitchen', icon: ChefHat, vuetifyColor: 'amber-lighten-5', iconColor: '#FFA000', chipColor: 'amber-darken-2', hasTypes: true },
      ],
    };
  },
  methods: {
    handleToolClick(tool) {
      const isSelected = this.selectedTool === tool.type;
      this.onSelectTool(isSelected ? null : tool.type);
    },
    isToolExpanded(tool) {
      const expansionMap = {
        shop: this.shopExpanded,
        storage: this.storageExpanded,
        hospitality: this.hospitalityExpanded,
        merchshop: this.merchExpanded,
        access: this.accessExpanded,
        entertainment: this.entertainmentExpanded,
        entrance: this.entranceExpanded,
        kitchen: this.kitchenExpanded,
      };
      return expansionMap[tool.type] || false;
    },
    toggleToolExpanded(tool) {
      const expansionMap = {
        shop: 'shopExpanded',
        storage: 'storageExpanded',
        hospitality: 'hospitalityExpanded',
        merchshop: 'merchExpanded',
        access: 'accessExpanded',
        entertainment: 'entertainmentExpanded',
        entrance: 'entranceExpanded',
        kitchen: 'kitchenExpanded',
      };
      
      const key = expansionMap[tool.type];
      if (key) {
        const wasExpanded = this[key];
        
        // Reset all expansions
        this.shopExpanded = false;
        this.storageExpanded = false;
        this.hospitalityExpanded = false;
        this.merchExpanded = false;
        this.accessExpanded = false;
        this.entertainmentExpanded = false;
        this.entranceExpanded = false;
        this.kitchenExpanded = false;
        
        // Toggle: if it was expanded, keep it closed; if it was closed, open it
        if (!wasExpanded) {
          this[key] = true;
        }
      }
    },
    toggleStorageType(type) {
      if (this.selectedStorageTypes.includes(type)) {
        this.onSelectStorageTypes(this.selectedStorageTypes.filter((t) => t !== type));
      } else {
        this.onSelectStorageTypes([...this.selectedStorageTypes, type]);
      }
    },
    toggleShopType(type) {
      if (this.selectedShopTypes.includes(type)) {
        this.onSelectShopTypes(this.selectedShopTypes.filter((t) => t !== type));
      } else {
        this.onSelectShopTypes([...this.selectedShopTypes, type]);
      }
    },
    toggleHospitalityType(type) {
      if (this.selectedHospitalityTypes.includes(type)) {
        this.onSelectHospitalityTypes(
          this.selectedHospitalityTypes.filter((t) => t !== type),
        );
      } else {
        this.onSelectHospitalityTypes([...this.selectedHospitalityTypes, type]);
      }
    },
    toggleMerchType(type) {
      if (this.selectedMerchTypes.includes(type)) {
        this.onSelectMerchTypes(this.selectedMerchTypes.filter((t) => t !== type));
      } else {
        this.onSelectMerchTypes([...this.selectedMerchTypes, type]);
      }
    },
    toggleAccessType(type) {
      if (this.selectedAccessTypes.includes(type)) {
        this.onSelectAccessTypes(this.selectedAccessTypes.filter((t) => t !== type));
      } else {
        this.onSelectAccessTypes([...this.selectedAccessTypes, type]);
      }
    },
    toggleEntertainmentType(type) {
      if (this.selectedEntertainmentTypes.includes(type)) {
        this.onSelectEntertainmentTypes(
          this.selectedEntertainmentTypes.filter((t) => t !== type),
        );
      } else {
        this.onSelectEntertainmentTypes([...this.selectedEntertainmentTypes, type]);
      }
    },
    toggleEntranceType(type) {
      if (this.selectedEntranceTypes.includes(type)) {
        this.onSelectEntranceTypes(this.selectedEntranceTypes.filter((t) => t !== type));
      } else {
        this.onSelectEntranceTypes([...this.selectedEntranceTypes, type]);
      }
    },
    toggleKitchenType(type) {
      if (this.selectedKitchenTypes.includes(type)) {
        this.onSelectKitchenTypes(this.selectedKitchenTypes.filter((t) => t !== type));
      } else {
        this.onSelectKitchenTypes([...this.selectedKitchenTypes, type]);
      }
    },
    subtypeOptions(type) {
      const map = {
        shop: this.shopTypeOptions,
        hospitality: this.hospitalityTypeOptions,
        merchshop: this.merchTypeOptions,
        storage: this.storageTypeOptions,
        entrance: this.entranceTypeOptions,
        entertainment: this.entertainmentTypeOptions,
        access: this.accessTypeOptions,
        kitchen: this.kitchenTypeOptions,
      };
      return map[type] || [];
    },
    isSubtypeSelected(type, value) {
      const map = {
        shop: this.selectedShopTypes,
        hospitality: this.selectedHospitalityTypes,
        merchshop: this.selectedMerchTypes,
        storage: this.selectedStorageTypes,
        entrance: this.selectedEntranceTypes,
        entertainment: this.selectedEntertainmentTypes,
        access: this.selectedAccessTypes,
        kitchen: this.selectedKitchenTypes,
      };
      return (map[type] || []).includes(value);
    },
    toggleSubtype(type, value) {
      const toggleMap = {
        shop: this.toggleShopType,
        hospitality: this.toggleHospitalityType,
        merchshop: this.toggleMerchType,
        storage: this.toggleStorageType,
        entrance: this.toggleEntranceType,
        entertainment: this.toggleEntertainmentType,
        access: this.toggleAccessType,
        kitchen: this.toggleKitchenType,
      };
      const fn = toggleMap[type];
      if (fn) fn(value);
    },
  },
};
</script>

<style scoped>
.palette-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  font-size: 14px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.07);
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  user-select: none;
}

.palette-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.palette-item--selected {
  background-color: rgba(147, 197, 253, 0.22) !important;
  border-color: #93c5fd !important;
}

.palette-expand-btn {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  color: #9ca3af;
  flex-shrink: 0;
  line-height: 0;
}

.palette-subtypes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px 4px 72px;
}
</style>