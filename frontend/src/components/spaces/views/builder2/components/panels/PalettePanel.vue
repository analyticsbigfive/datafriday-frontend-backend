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
          <v-avatar :style="avatarStyle(tool.color)" size="47" rounded="lg" class="flex-shrink-0">
            <v-icon :icon="tool.icon" size="22" :color="tool.color" />
          </v-avatar>
          <span class="flex-grow-1 fw-medium" style="font-size: var(--fs-md);">{{ tool.label }}</span>
          <button
            v-if="subtypeOptions(tool.type).length"
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
            :color="tool.color"
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
import { ref, computed, inject, onMounted } from 'vue'
import { useStore as useVuexStore } from 'vuex'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { toolOf, storageSubtypesFor, buildTools } from '../../constants/elementTaxonomy'

defineProps({
  condensed: { type: Boolean, default: false },
})

const { t } = useI18n()
const store = inject('builderStore')
const vuexStore = useVuexStore()

onMounted(() => {
  vuexStore.dispatch('departments/fetchDepartments')
  vuexStore.dispatch('storageTypes/fetchStorageTypes')
})

const paletteOpen  = ref(true)
const expandedType = ref(null)

const tools = computed(() => buildTools(vuexStore.getters['departments/departments'] || []))

const selectedTool = computed(() => store.state.activeTool)

function avatarStyle(color) {
  const c = color || '#94a3b8'
  return { background: `color-mix(in srgb, ${c} 15%, transparent)` }
}

function handleToolClick(tool) {
  store.setActiveTool(tool.type)
}

function isToolExpanded(tool) {
  return expandedType.value === tool.type
}

function toggleToolExpanded(tool) {
  expandedType.value = expandedType.value === tool.type ? null : tool.type
}

// Le tool "storage" a ses sous-types de CONDITION pilotés par le référentiel StorageType
// (lien délibéré, cf. SubtypesSection.vue), pas par ses propres Subtype génériques.
function subtypeOptions(type) {
  if (type === 'storage') return storageSubtypesFor(vuexStore.getters['storageTypes/storageTypes'] || [])
  return toolOf(type, tools.value)?.subtypes || []
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
