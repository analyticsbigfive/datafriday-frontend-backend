<template>
  <div :class="condensed ? 'p-2' : 'px-2 pb-4'">
    <!-- Collapsible header -->
    <button v-if="!condensed" class="palette-header" @click="paletteOpen = !paletteOpen">
      <span class="fw-bold">{{ t('b2ElementPaletteTitle') }}</span>
      <ChevronDown :size="16" :style="{ transform: paletteOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }" />
    </button>

    <!-- Tool list -->
    <div v-if="paletteOpen" class="d-flex flex-column gap-2 pt-2">
      <div v-for="tool in tools" :key="tool.type">
        <!-- Main tool card -->
        <div
          :class="['palette-item', selectedTool === tool.type ? 'palette-item--selected' : '']"
          @click="handleToolClick(tool)"
        >
          <v-avatar :color="tool.vuetifyColor" size="47" rounded="lg" class="flex-shrink-0">
            <component :is="tool.icon" :size="22" :color="tool.iconColor" />
          </v-avatar>
          <span class="flex-grow-1 fw-medium" style="font-size: var(--fs-md);">{{ tool.label }}</span>
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
          <v-checkbox
            v-for="option in subtypeOptions(tool.type)"
            :key="option.value"
            :label="option.label"
            :model-value="isSubtypeSelected(tool.type, option.value)"
            :color="tool.chipColor"
            density="compact"
            hide-details
            @update:model-value="toggleSubtype(tool.type, option.value)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import {
  Store, Package, Scan, Crown, ShoppingBag,
  ChevronDown, ChevronRight, Move, Sparkles, ChefHat,
} from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { TOOLS } from '../../constants/elementTaxonomy'

defineProps({
  condensed: { type: Boolean, default: false },
})

const { t } = useI18n()
const store = inject('builderStore')

const paletteOpen  = ref(true)
const expandedType = ref(null)

const tools = [
  { type: 'shop',          label: 'F&B',           icon: Store,       vuetifyColor: 'green-lighten-5',     iconColor: '#4CAF50', chipColor: 'green',         hasTypes: true },
  { type: 'hospitality',   label: 'Hospitality',   icon: Crown,       vuetifyColor: 'pink-lighten-5',      iconColor: '#E91E63', chipColor: 'pink',          hasTypes: true },
  { type: 'merchshop',     label: 'Merch',         icon: ShoppingBag, vuetifyColor: 'grey-lighten-3',      iconColor: '#616161', chipColor: 'grey-darken-2', hasTypes: true },
  { type: 'storage',       label: 'Storage',       icon: Package,     vuetifyColor: 'orange-lighten-5',    iconColor: '#FF9800', chipColor: 'orange',        hasTypes: true },
  { type: 'entrance',      label: 'Ticketing',     icon: Scan,        vuetifyColor: 'red-lighten-5',       iconColor: '#F44336', chipColor: 'red',           hasTypes: true },
  { type: 'entertainment', label: 'Entertainment', icon: Sparkles,    vuetifyColor: 'purple-lighten-5',    iconColor: '#9C27B0', chipColor: 'purple',        hasTypes: true },
  { type: 'access',        label: 'Access',        icon: Move,        vuetifyColor: 'blue-grey-lighten-5', iconColor: '#607D8B', chipColor: 'blue-grey',     hasTypes: true },
  { type: 'kitchen',       label: 'Kitchen',       icon: ChefHat,     vuetifyColor: 'amber-lighten-5',     iconColor: '#FFA000', chipColor: 'amber-darken-2', hasTypes: true },
]

const selectedTool = computed(() => store.state.activeTool)

function handleToolClick(tool) {
  store.setActiveTool(tool.type)
}

function isToolExpanded(tool) {
  return expandedType.value === tool.type
}

function toggleToolExpanded(tool) {
  expandedType.value = expandedType.value === tool.type ? null : tool.type
}

function subtypeOptions(type) {
  return TOOLS.find((t) => t.type === type)?.subtypes || []
}

function isSubtypeSelected(type, value) {
  return (store.state.activeSubtypes[type] || []).includes(value)
}

function toggleSubtype(type, value) {
  const current = store.state.activeSubtypes[type] || []
  store.setSubtypes(type, current.includes(value) ? current.filter((v) => v !== value) : [...current, value])
}
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
  font-size: var(--fs-md);
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
  flex-direction: column;
  padding: 4px 10px 4px 72px;
}
</style>
