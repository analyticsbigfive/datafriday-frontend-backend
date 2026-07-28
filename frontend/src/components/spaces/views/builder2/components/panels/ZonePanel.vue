<template>
  <div class="px-2 py-3">
    <v-expansion-panels v-model="floorsPanel">
      <v-expansion-panel>
        <template #title>
          <div class="d-flex align-center w-100 gap-2">
            <v-menu location="bottom start" offset="4">
              <template #activator="{ props: menuProps }">
                <v-btn icon size="small" variant="text" v-bind="menuProps" @click.stop>
                  <PlusIcon :size="16" />
                </v-btn>
              </template>
              <v-list density="compact">
                <v-list-item @click="store.addZone('FLOOR')">
                  <template #prepend><PlusIcon :size="16" class="me-2" /></template>
                  <v-list-item-title>{{ t('b2ZoneKindFloor') }}</v-list-item-title>
                </v-list-item>
                <v-list-item @click="store.addZone('FLOOR', { isBasement: true })">
                  <template #prepend><PlusIcon :size="16" class="me-2" /></template>
                  <v-list-item-title>{{ t('b2ZoneKindBasement') }}</v-list-item-title>
                </v-list-item>
                <v-list-item :disabled="hasKind('FORECOURT')" @click="store.addZone('FORECOURT')">
                  <template #prepend><PlusIcon :size="16" class="me-2" /></template>
                  <v-list-item-title>{{ t('b2ZoneKindForecourt') }}</v-list-item-title>
                </v-list-item>
                <v-list-item :disabled="hasKind('EXTERNAL')" @click="store.addZone('EXTERNAL')">
                  <template #prepend><PlusIcon :size="16" class="me-2" /></template>
                  <v-list-item-title>{{ t('b2ZoneKindExternal') }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
            <span class="font-weight-bold">{{ t('b2AreasTitle') }}</span>
          </div>
        </template>

        <template #text>
          <div class="d-flex flex-column gap-2">

            <!-- Floor / Basement zones (draggable) -->
            <div v-for="zone in floorZones" :key="zone.id" class="position-relative">

              <!-- Drag indicator — avant -->
              <div v-if="dragOverZoneId === zone.id && insertBefore" class="b2-drag-indicator b2-drag-indicator--before">
                <div class="b2-drag-dot b2-drag-dot--left" />
                <div class="b2-drag-dot b2-drag-dot--right" />
              </div>
              <!-- Drag indicator — après -->
              <div v-if="dragOverZoneId === zone.id && !insertBefore" class="b2-drag-indicator b2-drag-indicator--after">
                <div class="b2-drag-dot b2-drag-dot--left" />
                <div class="b2-drag-dot b2-drag-dot--right" />
              </div>

              <v-card
                draggable="true"
                :class="['b2-zone-card pa-3', zone.id === store.state.activeZoneId ? 'b2-zone-selected' : '', draggedZoneId === zone.id ? 'b2-zone-dragging' : '']"
                rounded="lg"
                elevation="0"
                @dragstart="handleDragStart($event, zone.id)"
                @dragover.prevent="handleDragOver($event, zone.id)"
                @dragleave="handleDragLeave"
                @drop.prevent="handleDrop($event, zone.id)"
                @dragend="handleDragEnd"
                @click="store.setActiveZone(zone.id)"
              >
                <!-- Ligne 1 : grip + icône direction + nom + actions -->
                <div class="d-flex align-center justify-space-between mb-2">
                  <div class="d-flex align-center gap-2 flex-grow-1 text-truncate" style="min-width: 0;">
                    <div class="b2-grip flex-shrink-0" @mousedown.stop>
                      <GripVerticalIcon :size="16" class="text-medium-emphasis" />
                    </div>
                    <ChevronDownIcon v-if="isBasement(zone)" :size="16" class="text-medium-emphasis flex-shrink-0" />
                    <ChevronUpIcon   v-else                  :size="16" class="text-medium-emphasis flex-shrink-0" />
                    <span class="text-truncate" style="font-size: var(--fs-base);">{{ zone.name }}</span>
                  </div>
                  <div class="d-flex gap-1 flex-shrink-0">
                    <v-btn icon size="x-small" variant="text" @click.stop="openEdit(zone)">
                      <Edit2Icon :size="14" />
                    </v-btn>
                    <v-btn icon size="x-small" variant="text" @click.stop="confirmDelete(zone)">
                      <Trash2Icon :size="14" color="#ff3131" />
                    </v-btn>
                    <v-btn
                      v-if="zone.kind === 'FLOOR'"
                      icon size="x-small" variant="text"
                      :loading="duplicatingId === zone.id"
                      @click.stop="duplicate(zone)"
                    >
                      <CopyIcon :size="14" />
                    </v-btn>
                  </div>
                </div>

                <!-- Ligne 2 : dimensions + compteur -->
                <div class="text-caption text-medium-emphasis">
                  {{ zone.width }}m × {{ zone.length }}m{{ zone.height ? ` × ${zone.height}m` : '' }}
                  <div class="mt-1">{{ zoneCountLabel(zone.id) }}</div>
                </div>
              </v-card>
            </div>

            <!-- Forecourt -->
            <template v-if="forecourtZone">
              <v-divider class="my-2" />
              <v-card
                :class="['b2-zone-card pa-3', forecourtZone.id === store.state.activeZoneId ? 'b2-zone-selected' : '']"
                rounded="lg" elevation="0"
                @click="store.setActiveZone(forecourtZone.id)"
              >
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-truncate" style="font-size: var(--fs-base);">{{ forecourtZone.name }}</span>
                  <div class="d-flex gap-1 flex-shrink-0">
                    <v-btn icon size="x-small" variant="text" @click.stop="openEdit(forecourtZone)">
                      <Edit2Icon :size="14" />
                    </v-btn>
                    <v-btn icon size="x-small" variant="text" @click.stop="confirmDelete(forecourtZone)">
                      <Trash2Icon :size="14" color="#ff3131" />
                    </v-btn>
                  </div>
                </div>
                <div class="text-caption text-medium-emphasis">
                  {{ forecourtZone.width }}m × {{ forecourtZone.length }}m
                  <div class="mt-1">{{ zoneCountLabel(forecourtZone.id) }}</div>
                </div>
              </v-card>
            </template>

            <!-- External -->
            <template v-if="externalZone">
              <v-divider class="my-2" />
              <v-card
                :class="['b2-zone-card pa-3', externalZone.id === store.state.activeZoneId ? 'b2-zone-selected' : '']"
                rounded="lg" elevation="0"
                @click="store.setActiveZone(externalZone.id)"
              >
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-truncate" style="font-size: var(--fs-base);">{{ externalZone.name }}</span>
                  <div class="d-flex gap-1 flex-shrink-0">
                    <v-btn icon size="x-small" variant="text" @click.stop="openEdit(externalZone)">
                      <Edit2Icon :size="14" />
                    </v-btn>
                    <v-btn icon size="x-small" variant="text" @click.stop="confirmDelete(externalZone)">
                      <Trash2Icon :size="14" color="#ff3131" />
                    </v-btn>
                  </div>
                </div>
                <div class="text-caption text-medium-emphasis">
                  {{ externalZone.width }}m × {{ externalZone.length }}m
                  <div class="mt-1">{{ zoneCountLabel(externalZone.id) }}</div>
                </div>
              </v-card>
            </template>

            <div v-if="store.zonesSorted.value.length === 0" class="text-caption text-medium-emphasis text-center py-4">
              {{ t('b2NoZonesEmpty') }}
            </div>
          </div>
        </template>
      </v-expansion-panel>
    </v-expansion-panels>

    <ZoneEditDialog v-model="editOpen" :zone="editingZone" />
    <DeleteZoneDialog v-model="deleteOpen" :zone="deletingZone" />
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import {
  Plus as PlusIcon,
  Edit2 as Edit2Icon,
  Trash2 as Trash2Icon,
  Copy as CopyIcon,
  GripVertical as GripVerticalIcon,
  ChevronUp as ChevronUpIcon,
  ChevronDown as ChevronDownIcon,
} from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import ZoneEditDialog from '../../dialogs/ZoneEditDialog.vue'
import DeleteZoneDialog from '../../dialogs/DeleteZoneDialog.vue'

const { t } = useI18n()
const store = inject('builderStore')

// ── Expansion panel (ouvert par défaut = 0) ──────────────────────────────────
const floorsPanel = ref(0)

// ── Zones groupées par kind ──────────────────────────────────────────────────
const floorZones = computed(() =>
  store.zonesSorted.value.filter((z) => z.kind === 'FLOOR'),
)
const forecourtZone = computed(() =>
  store.zonesSorted.value.find((z) => z.kind === 'FORECOURT') ?? null,
)
const externalZone = computed(() =>
  store.zonesSorted.value.find((z) => z.kind === 'EXTERNAL') ?? null,
)

function isBasement(zone) {
  return zone.isBasement === true || (zone.level !== undefined && zone.level < 0)
}

function hasKind(kind) {
  return store.zonesSorted.value.some((z) => z.kind === kind)
}

function zoneCountLabel(zoneId) {
  const total = store.elementsOfZone(zoneId).length
  const visible = store.visibleElementsOfZone(zoneId).length
  const word = total !== 1 ? t('b2ElementsWord') : t('b2ElementWord')
  return visible === total
    ? `${total} ${word}`
    : `${total} ${t('b2ElementAbbrev')} (${visible} ${t('b2InThisConfig')})`
}

// ── Dialogs ──────────────────────────────────────────────────────────────────
const editOpen = ref(false)
const editingZone = ref(null)
const duplicatingId = ref(null)
const deleteOpen = ref(false)
const deletingZone = ref(null)

function openEdit(zone) {
  editingZone.value = zone
  editOpen.value = true
}

async function duplicate(zone) {
  duplicatingId.value = zone.id
  try {
    await store.duplicateZone(zone.id)
  } finally {
    duplicatingId.value = null
  }
}

function confirmDelete(zone) {
  deletingZone.value = zone
  deleteOpen.value = true
}

// ── Drag & drop (réordonner les étages — parité v1) ──────────────────────────
const draggedZoneId = ref(null)
const dragOverZoneId = ref(null)
const insertBefore = ref(true)

function handleDragStart(e, zoneId) {
  draggedZoneId.value = zoneId
  if (e?.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function handleDragOver(e, zoneId) {
  if (!draggedZoneId.value || draggedZoneId.value === zoneId) return
  if (e?.dataTransfer) e.dataTransfer.dropEffect = 'move'
  const rect = e.currentTarget.getBoundingClientRect()
  insertBefore.value = e.clientY < rect.top + rect.height / 2
  dragOverZoneId.value = zoneId
}

function handleDragLeave() {
  dragOverZoneId.value = null
}

function handleDrop(e, targetId) {
  if (draggedZoneId.value && draggedZoneId.value !== targetId) {
    store.reorderZones?.(draggedZoneId.value, targetId, insertBefore.value)
  }
  draggedZoneId.value = null
  dragOverZoneId.value = null
  insertBefore.value = true
}

function handleDragEnd() {
  draggedZoneId.value = null
  dragOverZoneId.value = null
  insertBefore.value = true
}
</script>

<style scoped>
/* Limiter la hauteur du panneau comme la v1 */
:deep(.v-expansion-panel-text__wrapper) {
  overflow-y: auto !important;
  max-height: 40vh !important;
  padding: 8px 12px 12px !important;
}

/* Carte de zone */
.b2-zone-card {
  cursor: pointer;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.b2-zone-card:hover {
  background: rgba(var(--v-theme-on-surface), 0.03);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.07);
}

/* Sélection bleue — parité exacte v1 */
.b2-zone-selected {
  background-color: rgba(147, 197, 253, 0.25) !important;
  border: 1px solid #93c5fd !important;
}

/* Drag en cours : zone source semi-transparente */
.b2-zone-dragging {
  opacity: 0.5;
}

/* Grip */
.b2-grip {
  cursor: grab;
  line-height: 0;
}
.b2-grip:active {
  cursor: grabbing;
}

/* Indicateur de position de drop (ligne bleue avec points) */
.b2-drag-indicator {
  position: absolute;
  width: 100%;
  height: 2px;
  background: #2196F3;
  z-index: 10;
}
.b2-drag-indicator--before { top: -2px; }
.b2-drag-indicator--after  { bottom: -2px; }

.b2-drag-dot {
  position: absolute;
  top: 50%;
  margin-top: -4px;
  width: 8px;
  height: 8px;
  background: #2196F3;
  border-radius: 50%;
}
.b2-drag-dot--left  { left: 0; }
.b2-drag-dot--right { right: 0; }
</style>
