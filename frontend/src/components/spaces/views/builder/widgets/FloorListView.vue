<template>
  <div :class="condensed ? 'p-2' : 'px-2 py-3'">
    <v-expansion-panels v-model="floorsPanel">
      <v-expansion-panel>
        <template #title>
          <div class="d-flex align-items-center w-100" :class="condensed ? 'justify-content-center' : 'gap-2'">
            <v-menu>
              <template #activator="{ props }">
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  v-bind="props"
                  @click.stop
                >
                  <Plus :size="16" />
                </v-btn>
              </template>
              <v-list density="compact">
                <v-list-item @click="onAddFloor(false)">
                  <template #prepend>
                    <Plus :size="16" class="me-2" />
                  </template>
                  <template #default>
                    <v-list-item-title>Floor</v-list-item-title>
                  </template>
                </v-list-item>
                <v-list-item @click="onAddFloor(true)">
                  <template #prepend>
                    <Plus :size="16" class="me-2" />
                  </template>
                  <template #default>
                    <v-list-item-title>Basement</v-list-item-title>
                  </template>
                </v-list-item>
                <v-list-item v-if="!forecourt" @click="onAddForecourt">
                  <template #prepend>
                    <Plus :size="16" class="me-2" />
                  </template>
                  <template #default>
                    <v-list-item-title>Forecourt</v-list-item-title>
                  </template>
                </v-list-item>
                <v-list-item v-if="!externalMerch" @click="onAddExternalMerch">
                  <template #prepend>
                    <Plus :size="16" class="me-2" />
                  </template>
                  <template #default>
                    <v-list-item-title>External</v-list-item-title>
                  </template>
                </v-list-item>
              </v-list>
            </v-menu>
            <span v-if="!condensed" class="fw-bold">Areas</span>
          </div>
        </template>

        <template #text>
          <div class="d-flex flex-column gap-2">
            <!-- Floors List -->
            <div v-for="floor in floors" :key="floor.id" class="position-relative">
              <!-- Drag indicators -->
              <div
                v-if="dragOverFloorId === floor.id && insertBefore"
                class="position-absolute w-100"
                style="top: -2px; height: 2px; background: #2196F3; z-index: 10;"
              >
                <div class="position-absolute" style="left: 0; top: 50%; margin-top: -4px; width: 8px; height: 8px; background: #2196F3; border-radius: 50%;"></div>
                <div class="position-absolute" style="right: 0; top: 50%; margin-top: -4px; width: 8px; height: 8px; background: #2196F3; border-radius: 50%;"></div>
              </div>
              <div
                v-if="dragOverFloorId === floor.id && !insertBefore"
                class="position-absolute w-100"
                style="bottom: -2px; height: 2px; background: #2196F3; z-index: 10;"
              >
                <div class="position-absolute" style="left: 0; top: 50%; margin-top: -4px; width: 8px; height: 8px; background: #2196F3; border-radius: 50%;"></div>
                <div class="position-absolute" style="right: 0; top: 50%; margin-top: -4px; width: 8px; height: 8px; background: #2196F3; border-radius: 50%;"></div>
              </div>

              <v-card
                draggable="true"
                @dragstart="handleDragStart($event, floor.id)"
                @dragover="handleDragOver($event, floor.id)"
                @dragleave="handleDragLeave"
                @drop="handleDrop($event, floor.id)"
                @dragend="handleDragEnd"
                :class="[
                  'p-3',
                  (viewMode === 'floor' && selectedFloorId === floor.id) ? 'df-selected' : '',
                  (draggedFloorId === floor.id) ? 'opacity-50' : ''
                ]"
                :border="viewMode === 'floor' && selectedFloorId === floor.id"
                rounded="lg"
                elevation="0"
                hover
                @click="onSelectFloor(floor.id)"
              >
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <div class="d-flex align-items-center gap-2 flex-grow-1 text-nowrap" style="min-width: 0;">
                    <div class="flex-shrink-0" style="cursor: grab;" @mousedown.stop>
                      <GripVertical :size="16" class="text-medium-emphasis" />
                    </div>
                    <ChevronUp
                      v-if="floor.level >= 0"
                      :size="16"
                      class="text-medium-emphasis flex-shrink-0"
                    />
                    <ChevronDown
                      v-else
                      :size="16"
                      class="text-medium-emphasis flex-shrink-0"
                    />
                    <span class="small text-nowrap text-truncate">{{ floor.name }}</span>
                  </div>
                  <div class="d-flex gap-1 flex-shrink-0">
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="openEditDialog(floor)"
                    >
                      <Edit2 :size="14" />
                    </v-btn>
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="openDeleteDialog({ type: 'floor', id: floor.id, name: floor.name })"
                    >
                      <Trash2 :size="14" />
                    </v-btn>
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="onDuplicateFloor(floor.id)"
                    >
                      <Copy :size="14" />
                    </v-btn>
                  </div>
                </div>
                <div class="small text-medium-emphasis">
                  {{ floor.width }}m × {{ floor.length }}m × {{ floor.height }}m
                  <div class="mt-1">
                    {{ floor.elements.length }} element{{ floor.elements.length !== 1 ? 's' : '' }}
                  </div>
                </div>
              </v-card>
            </div>

            <!-- Forecourt -->
            <template v-if="forecourt">
              <v-divider class="my-2" />
              <v-card
                :class="viewMode === 'forecourt' ? 'df-selected' : ''"
                :border="viewMode === 'forecourt'"
                rounded="lg"
                elevation="0"
                hover
                class="p-3"
                @click="onSelectForecourt"
              >
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <span class="small">{{ forecourt.name }}</span>
                  <div class="d-flex gap-1">
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="openEditForecourtDialog"
                    >
                      <Edit2 :size="14" />
                    </v-btn>
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="openDeleteDialog({ type: 'forecourt', name: forecourt.name })"
                    >
                      <Trash2 :size="14" />
                    </v-btn>
                  </div>
                </div>
                <div class="small text-medium-emphasis">
                  {{ forecourt.width }}m × {{ forecourt.length }}m
                  <div class="mt-1">
                    {{ forecourt.elements.length }} element{{ forecourt.elements.length !== 1 ? 's' : '' }}
                  </div>
                </div>
              </v-card>
            </template>

            <!-- External Merch -->
            <template v-if="externalMerch">
              <v-divider class="my-2" />
              <v-card
                :class="viewMode === 'externalmerch' ? 'df-selected' : ''"
                :border="viewMode === 'externalmerch'"
                rounded="lg"
                elevation="0"
                hover
                class="p-3"
                @click="onSelectExternalMerch"
              >
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <span class="small">{{ externalMerch.name }}</span>
                  <div class="d-flex gap-1">
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="openEditExternalMerchDialog"
                    >
                      <Edit2 :size="14" />
                    </v-btn>
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click.stop="openDeleteDialog({ type: 'externalmerch', name: externalMerch.name })"
                    >
                      <Trash2 :size="14" />
                    </v-btn>
                  </div>
                </div>
                <div class="small text-medium-emphasis">
                  {{ externalMerch.width }}m × {{ externalMerch.length }}m
                  <div class="mt-1">
                    {{ externalMerch.elements.length }} element{{ externalMerch.elements.length !== 1 ? 's' : '' }}
                  </div>
                </div>
              </v-card>
            </template>
          </div>
        </template>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Edit Floor Dialog -->
    <v-dialog v-model="editFloorDialog" max-width="560" scrollable>
      <v-card rounded="xl" elevation="8">
        <div class="d-flex align-items-center justify-content-between px-5 py-4" style="border-bottom: 1px solid rgba(0,0,0,.08);">
          <div class="d-flex align-items-center gap-3">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(255, 49, 49,.1);display:flex;align-items:center;justify-content:center;">
              <Edit2 :size="17" color="#ff3131" />
            </div>
            <div>
              <div class="fw-semibold" style="font-size:.95rem;">Edit Floor</div>
              <div class="text-medium-emphasis" style="font-size:.8rem;">Update name and dimensions</div>
            </div>
          </div>
          <v-btn icon size="small" variant="text" @click="editFloorDialog = false"><X :size="16" /></v-btn>
        </div>

        <v-card-text class="px-5 py-4" style="max-height: 65vh;">
          <!-- Name -->
          <div class="mb-4">
            <label class="form-label small fw-semibold mb-1" style="text-transform:uppercase;letter-spacing:.06em;color:#6c757d;">Name</label>
            <input type="text" class="form-control" v-model="formData.name" placeholder="Floor name…" />
          </div>

          <!-- Dimensions -->
          <div class="mb-4">
            <label class="form-label small fw-semibold mb-2" style="text-transform:uppercase;letter-spacing:.06em;color:#6c757d;">Dimensions</label>
            <div class="row g-2">
              <div class="col-4">
                <label class="form-label small mb-1">Width (m)</label>
                <input type="number" class="form-control form-control-sm" v-model.number="formData.width" min="1" />
              </div>
              <div class="col-4">
                <label class="form-label small mb-1">Length (m)</label>
                <input type="number" class="form-control form-control-sm" v-model.number="formData.length" min="1" />
              </div>
              <div class="col-4">
                <label class="form-label small mb-1">Height (m)</label>
                <input type="number" class="form-control form-control-sm" v-model.number="formData.height" min="1" />
              </div>
            </div>
          </div>

          <!-- Corner Radius -->
          <div class="mb-4">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <label class="form-label small fw-semibold mb-0" style="text-transform:uppercase;letter-spacing:.06em;color:#6c757d;">Corner Radius (m)</label>
              <v-btn icon size="x-small" variant="tonal" @click="linkedCorners = !linkedCorners">
                <Link v-if="linkedCorners" key="lc-link" :size="13" />
                <Unlink v-else key="lc-unlink" :size="13" />
              </v-btn>
            </div>
            <input
              v-if="linkedCorners"
              type="number"
              class="form-control form-control-sm"
              :value="formData.cornerRadius.topLeft"
              placeholder="All corners"
              @input="handleFloorCornerRadiusChange('topLeft', $event.target.value)"
            />
            <div v-else class="row g-2">
              <div class="col-6">
                <label class="form-label small mb-1">Top Left</label>
                <input type="number" class="form-control form-control-sm" v-model.number="formData.cornerRadius.topLeft" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Top Right</label>
                <input type="number" class="form-control form-control-sm" v-model.number="formData.cornerRadius.topRight" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Bottom Left</label>
                <input type="number" class="form-control form-control-sm" v-model.number="formData.cornerRadius.bottomLeft" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Bottom Right</label>
                <input type="number" class="form-control form-control-sm" v-model.number="formData.cornerRadius.bottomRight" />
              </div>
            </div>
          </div>

          <!-- Hole -->
          <div class="rounded-3 p-3" style="background:rgba(0,0,0,.03);border:1px solid rgba(0,0,0,.07);">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" v-model="formData.hole.enabled" id="holeEnabled" />
              <label class="form-check-label fw-medium small" for="holeEnabled">Create hole in floor (doughnut shape)</label>
            </div>
            <template v-if="formData.hole.enabled">
              <hr class="my-3" style="opacity:.1;" />
              <div class="row g-2 mb-3">
                <div class="col-6">
                  <label class="form-label small mb-1">Hole Width (m)</label>
                  <input type="number" class="form-control form-control-sm" v-model.number="formData.hole.width" />
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Hole Length (m)</label>
                  <input type="number" class="form-control form-control-sm" v-model.number="formData.hole.length" />
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">X Position (0–1)</label>
                  <input type="number" class="form-control form-control-sm" v-model.number="formData.hole.x" step="0.1" min="0" max="1" />
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Y Position (0–1)</label>
                  <input type="number" class="form-control form-control-sm" v-model.number="formData.hole.y" step="0.1" min="0" max="1" />
                </div>
              </div>
              <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="small fw-semibold" style="text-transform:uppercase;letter-spacing:.06em;color:#6c757d;">Hole Corner Radius</span>
                <v-btn icon size="x-small" variant="tonal" @click="linkedHoleCorners = !linkedHoleCorners">
                  <Link v-if="linkedHoleCorners" key="lhc-link" :size="13" />
                  <Unlink v-else key="lhc-unlink" :size="13" />
                </v-btn>
              </div>
              <input
                v-if="linkedHoleCorners"
                type="number"
                class="form-control form-control-sm"
                :value="formData.hole.cornerRadius.topLeft"
                placeholder="All corners"
                @input="handleHoleCornerRadiusChange('topLeft', $event.target.value)"
              />
              <div v-else class="row g-2">
                <div class="col-6">
                  <label class="form-label small mb-1">Top Left</label>
                  <input type="number" class="form-control form-control-sm" v-model.number="formData.hole.cornerRadius.topLeft" />
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Top Right</label>
                  <input type="number" class="form-control form-control-sm" v-model.number="formData.hole.cornerRadius.topRight" />
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Bottom Left</label>
                  <input type="number" class="form-control form-control-sm" v-model.number="formData.hole.cornerRadius.bottomLeft" />
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Bottom Right</label>
                  <input type="number" class="form-control form-control-sm" v-model.number="formData.hole.cornerRadius.bottomRight" />
                </div>
              </div>
              <p class="small text-medium-emphasis mt-2 mb-0" style="font-size:.78rem;">Drag the hole in the floor plan view to reposition it.</p>
            </template>
          </div>
        </v-card-text>

        <div class="d-flex justify-content-end gap-2 px-5 py-3" style="border-top:1px solid rgba(0,0,0,.08);">
          <v-btn variant="text" size="small" @click="editFloorDialog = false">Cancel</v-btn>
          <v-btn color="#ff3131" variant="flat" size="small" @click="saveFloor">Save Changes</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Edit Forecourt Dialog -->
    <v-dialog v-model="editingForecourt" max-width="480" scrollable>
      <v-card rounded="xl" elevation="8">
        <div class="d-flex align-items-center justify-content-between px-5 py-4" style="border-bottom:1px solid rgba(0,0,0,.08);">
          <div class="d-flex align-items-center gap-3">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(255, 49, 49,.1);display:flex;align-items:center;justify-content:center;">
              <Edit2 :size="17" color="#ff3131" />
            </div>
            <div>
              <div class="fw-semibold" style="font-size:.95rem;">Edit Forecourt</div>
              <div class="text-medium-emphasis" style="font-size:.8rem;">Update name and dimensions</div>
            </div>
          </div>
          <v-btn icon size="small" variant="text" @click="editingForecourt = false"><X :size="16" /></v-btn>
        </div>

        <v-card-text class="px-5 py-4">
          <div class="mb-4">
            <label class="form-label small fw-semibold mb-1" style="text-transform:uppercase;letter-spacing:.06em;color:#6c757d;">Name</label>
            <input type="text" class="form-control" v-model="forecourtFormData.name" placeholder="Forecourt name…" />
          </div>
          <div class="mb-4">
            <label class="form-label small fw-semibold mb-2" style="text-transform:uppercase;letter-spacing:.06em;color:#6c757d;">Dimensions</label>
            <div class="row g-2">
              <div class="col-6">
                <label class="form-label small mb-1">Width (m)</label>
                <input type="number" class="form-control form-control-sm" v-model.number="forecourtFormData.width" min="1" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Length (m)</label>
                <input type="number" class="form-control form-control-sm" v-model.number="forecourtFormData.length" min="1" />
              </div>
            </div>
          </div>
          <div>
            <div class="d-flex align-items-center justify-content-between mb-2">
              <label class="form-label small fw-semibold mb-0" style="text-transform:uppercase;letter-spacing:.06em;color:#6c757d;">Corner Radius (m)</label>
              <v-btn icon size="x-small" variant="tonal" @click="forecourtLinkedCorners = !forecourtLinkedCorners">
                <Link v-if="forecourtLinkedCorners" key="fc-link" :size="13" />
                <Unlink v-else key="fc-unlink" :size="13" />
              </v-btn>
            </div>
            <input
              v-if="forecourtLinkedCorners"
              type="number"
              class="form-control form-control-sm"
              :value="forecourtFormData.cornerRadius.topLeft"
              placeholder="All corners"
              @input="handleForecourtCornerRadiusChange('topLeft', $event.target.value)"
            />
            <div v-else class="row g-2">
              <div class="col-6">
                <label class="form-label small mb-1">Top Left</label>
                <input type="number" class="form-control form-control-sm" v-model.number="forecourtFormData.cornerRadius.topLeft" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Top Right</label>
                <input type="number" class="form-control form-control-sm" v-model.number="forecourtFormData.cornerRadius.topRight" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Bottom Left</label>
                <input type="number" class="form-control form-control-sm" v-model.number="forecourtFormData.cornerRadius.bottomLeft" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Bottom Right</label>
                <input type="number" class="form-control form-control-sm" v-model.number="forecourtFormData.cornerRadius.bottomRight" />
              </div>
            </div>
          </div>
        </v-card-text>

        <div class="d-flex justify-content-end gap-2 px-5 py-3" style="border-top:1px solid rgba(0,0,0,.08);">
          <v-btn variant="text" size="small" @click="editingForecourt = false">Cancel</v-btn>
          <v-btn color="#ff3131" variant="flat" size="small" @click="saveForecourt">Save Changes</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Edit External Merch Dialog -->
    <v-dialog v-model="editingExternalMerch" max-width="480" scrollable>
      <v-card rounded="xl" elevation="8">
        <div class="d-flex align-items-center justify-content-between px-5 py-4" style="border-bottom:1px solid rgba(0,0,0,.08);">
          <div class="d-flex align-items-center gap-3">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(255, 49, 49,.1);display:flex;align-items:center;justify-content:center;">
              <Edit2 :size="17" color="#ff3131" />
            </div>
            <div>
              <div class="fw-semibold" style="font-size:.95rem;">Edit External Area</div>
              <div class="text-medium-emphasis" style="font-size:.8rem;">Update name and dimensions</div>
            </div>
          </div>
          <v-btn icon size="small" variant="text" @click="editingExternalMerch = false"><X :size="16" /></v-btn>
        </div>

        <v-card-text class="px-5 py-4">
          <div class="mb-4">
            <label class="form-label small fw-semibold mb-1" style="text-transform:uppercase;letter-spacing:.06em;color:#6c757d;">Name</label>
            <input type="text" class="form-control" v-model="externalMerchFormData.name" placeholder="External area name…" />
          </div>
          <div class="mb-4">
            <label class="form-label small fw-semibold mb-2" style="text-transform:uppercase;letter-spacing:.06em;color:#6c757d;">Dimensions</label>
            <div class="row g-2">
              <div class="col-6">
                <label class="form-label small mb-1">Width (m)</label>
                <input type="number" class="form-control form-control-sm" v-model.number="externalMerchFormData.width" min="1" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Length (m)</label>
                <input type="number" class="form-control form-control-sm" v-model.number="externalMerchFormData.length" min="1" />
              </div>
            </div>
          </div>
          <div>
            <div class="d-flex align-items-center justify-content-between mb-2">
              <label class="form-label small fw-semibold mb-0" style="text-transform:uppercase;letter-spacing:.06em;color:#6c757d;">Corner Radius (m)</label>
              <v-btn icon size="x-small" variant="tonal" @click="externalMerchLinkedCorners = !externalMerchLinkedCorners">
                <Link v-if="externalMerchLinkedCorners" key="em-link" :size="13" />
                <Unlink v-else key="em-unlink" :size="13" />
              </v-btn>
            </div>
            <input
              v-if="externalMerchLinkedCorners"
              type="number"
              class="form-control form-control-sm"
              :value="externalMerchFormData.cornerRadius.topLeft"
              placeholder="All corners"
              @input="handleExternalMerchCornerRadiusChange('topLeft', $event.target.value)"
            />
            <div v-else class="row g-2">
              <div class="col-6">
                <label class="form-label small mb-1">Top Left</label>
                <input type="number" class="form-control form-control-sm" v-model.number="externalMerchFormData.cornerRadius.topLeft" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Top Right</label>
                <input type="number" class="form-control form-control-sm" v-model.number="externalMerchFormData.cornerRadius.topRight" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Bottom Left</label>
                <input type="number" class="form-control form-control-sm" v-model.number="externalMerchFormData.cornerRadius.bottomLeft" />
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Bottom Right</label>
                <input type="number" class="form-control form-control-sm" v-model.number="externalMerchFormData.cornerRadius.bottomRight" />
              </div>
            </div>
          </div>
        </v-card-text>

        <div class="d-flex justify-content-end gap-2 px-5 py-3" style="border-top:1px solid rgba(0,0,0,.08);">
          <v-btn variant="text" size="small" @click="editingExternalMerch = false">Cancel</v-btn>
          <v-btn color="#ff3131" variant="flat" size="small" @click="saveExternalMerch">Save Changes</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialogOpen" max-width="500">
      <v-card>
        <v-card-title>
          Delete
          {{
            areaToDelete && areaToDelete.type === 'floor'
              ? 'Floor/Basement'
              : areaToDelete && areaToDelete.type === 'forecourt'
                ? 'Forecourt'
                : 'External Area'
          }}?
        </v-card-title>
        <v-card-text>
          Are you sure you want to delete "{{ areaToDelete ? areaToDelete.name : '' }}"?
          This action cannot be undone and will permanently remove this area and all its elements from the database.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialogOpen = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import {
  Trash2,
  Edit2,
  ChevronUp,
  ChevronDown,
  Copy,
  Link,
  Unlink,
  Plus,
  GripVertical,
  X,
} from 'lucide-vue-next';

const defaultCornerRadius = () => ({
  topLeft: 0,
  topRight: 0,
  bottomLeft: 0,
  bottomRight: 0,
});

const defaultHole = () => ({
  enabled: false,
  x: 0.5,
  y: 0.5,
  width: 10,
  length: 10,
  cornerRadius: defaultCornerRadius(),
});

export default {
  name: 'FloorListView',
  components: {
    Trash2,
    Edit2,
    ChevronUp,
    ChevronDown,
    Copy,
    Link,
    Unlink,
    Plus,
    GripVertical,
    X,
  },
  props: {
    floors: { type: Array, required: true },
    forecourt: { type: Object, default: null },
    externalMerch: { type: Object, default: null },
    selectedFloorId: { type: String, default: null },
    viewMode: { type: String, required: true },
    onSelectFloor: { type: Function, required: true },
    onSelectForecourt: { type: Function, required: true },
    onSelectExternalMerch: { type: Function, required: true },
    onUpdateFloor: { type: Function, required: true },
    onUpdateForecourt: { type: Function, required: true },
    onUpdateExternalMerch: { type: Function, required: true },
    onDeleteFloor: { type: Function, required: true },
    onDeleteForecourt: { type: Function, required: true },
    onDeleteExternalMerch: { type: Function, required: true },
    onDuplicateFloor: { type: Function, required: true },
    onAddFloor: { type: Function, required: true },
    onAddForecourt: { type: Function, required: true },
    onAddExternalMerch: { type: Function, required: true },
    onReorderFloors: { type: Function, required: true },
    condensed: { type: Boolean, default: false },
  },
  data() {
    return {
      floorsPanel: 0,
      editFloorDialog: false,
      editingFloor: null,
      editingForecourt: false,
      editingExternalMerch: false,
      formData: {
        name: '',
        width: 0,
        length: 0,
        height: 0,
        cornerRadius: defaultCornerRadius(),
        hole: defaultHole(),
      },
      forecourtFormData: {
        name: '',
        width: 0,
        length: 0,
        cornerRadius: defaultCornerRadius(),
      },
      externalMerchFormData: {
        name: '',
        width: 0,
        length: 0,
        cornerRadius: defaultCornerRadius(),
      },
      linkedCorners: true,
      linkedHoleCorners: true,
      forecourtLinkedCorners: true,
      externalMerchLinkedCorners: true,
      draggedFloorId: null,
      dragOverFloorId: null,
      insertBefore: true,
      deleteDialogOpen: false,
      areaToDelete: null,
    };
  },
  methods: {
    openEditDialog(floor) {
      this.editingFloor = floor;
      this.formData = {
        name: floor.name,
        width: floor.width,
        length: floor.length,
        height: floor.height,
        cornerRadius: floor.cornerRadius || defaultCornerRadius(),
        hole: floor.hole || defaultHole(),
      };
      const hasCornerRadius = !!floor.cornerRadius;
      const allSame =
        hasCornerRadius &&
        floor.cornerRadius.topLeft === floor.cornerRadius.topRight &&
        floor.cornerRadius.topLeft === floor.cornerRadius.bottomLeft &&
        floor.cornerRadius.topLeft === floor.cornerRadius.bottomRight;
      this.linkedCorners = allSame || !hasCornerRadius;
      const hasHoleCornerRadius = !!(floor.hole && floor.hole.cornerRadius);
      const allHoleSame =
        hasHoleCornerRadius &&
        floor.hole.cornerRadius.topLeft === floor.hole.cornerRadius.topRight &&
        floor.hole.cornerRadius.topLeft === floor.hole.cornerRadius.bottomLeft &&
        floor.hole.cornerRadius.topLeft === floor.hole.cornerRadius.bottomRight;
      this.linkedHoleCorners = allHoleSame || !hasHoleCornerRadius;
      this.editFloorDialog = true;
    },
    saveFloor() {
      if (!this.editingFloor) return;
      this.onUpdateFloor(this.editingFloor.id, this.formData);
      this.editFloorDialog = false;
      this.editingFloor = null;
    },
    openEditForecourtDialog() {
      if (!this.forecourt) return;
      this.editingForecourt = true;
      this.forecourtFormData = {
        name: this.forecourt.name,
        width: this.forecourt.width,
        length: this.forecourt.length,
        cornerRadius: this.forecourt.cornerRadius || defaultCornerRadius(),
      };
      const hasCornerRadius = !!this.forecourt.cornerRadius;
      const allSame =
        hasCornerRadius &&
        this.forecourt.cornerRadius.topLeft === this.forecourt.cornerRadius.topRight &&
        this.forecourt.cornerRadius.topLeft === this.forecourt.cornerRadius.bottomLeft &&
        this.forecourt.cornerRadius.topLeft === this.forecourt.cornerRadius.bottomRight;
      this.forecourtLinkedCorners = allSame || !hasCornerRadius;
    },
    saveForecourt() {
      this.onUpdateForecourt(this.forecourtFormData);
      this.editingForecourt = false;
    },
    openEditExternalMerchDialog() {
      if (!this.externalMerch) return;
      this.editingExternalMerch = true;
      this.externalMerchFormData = {
        name: this.externalMerch.name,
        width: this.externalMerch.width,
        length: this.externalMerch.length,
        cornerRadius: this.externalMerch.cornerRadius || defaultCornerRadius(),
      };
      const hasCornerRadius = !!this.externalMerch.cornerRadius;
      const allSame =
        hasCornerRadius &&
        this.externalMerch.cornerRadius.topLeft === this.externalMerch.cornerRadius.topRight &&
        this.externalMerch.cornerRadius.topLeft === this.externalMerch.cornerRadius.bottomLeft &&
        this.externalMerch.cornerRadius.topLeft === this.externalMerch.cornerRadius.bottomRight;
      this.externalMerchLinkedCorners = allSame || !hasCornerRadius;
    },
    saveExternalMerch() {
      this.onUpdateExternalMerch(this.externalMerchFormData);
      this.editingExternalMerch = false;
    },
    handleFloorCornerRadiusChange(corner, value) {
      const numValue = parseInt(value) || 0;
      if (this.linkedCorners) {
        this.formData.cornerRadius = {
          topLeft: numValue,
          topRight: numValue,
          bottomLeft: numValue,
          bottomRight: numValue,
        };
      } else {
        this.formData.cornerRadius[corner] = numValue;
      }
    },
    handleHoleCornerRadiusChange(corner, value) {
      const numValue = parseInt(value) || 0;
      if (this.linkedHoleCorners) {
        this.formData.hole.cornerRadius = {
          topLeft: numValue,
          topRight: numValue,
          bottomLeft: numValue,
          bottomRight: numValue,
        };
      } else {
        this.formData.hole.cornerRadius[corner] = numValue;
      }
    },
    handleForecourtCornerRadiusChange(corner, value) {
      const numValue = parseInt(value) || 0;
      if (this.forecourtLinkedCorners) {
        this.forecourtFormData.cornerRadius = {
          topLeft: numValue,
          topRight: numValue,
          bottomLeft: numValue,
          bottomRight: numValue,
        };
      } else {
        this.forecourtFormData.cornerRadius[corner] = numValue;
      }
    },
    handleExternalMerchCornerRadiusChange(corner, value) {
      const numValue = parseInt(value) || 0;
      if (this.externalMerchLinkedCorners) {
        this.externalMerchFormData.cornerRadius = {
          topLeft: numValue,
          topRight: numValue,
          bottomLeft: numValue,
          bottomRight: numValue,
        };
      } else {
        this.externalMerchFormData.cornerRadius[corner] = numValue;
      }
    },
    canSwapFloors(sourceId, targetId) {
      const sourceFloor = this.floors.find((f) => f.id === sourceId);
      const targetFloor = this.floors.find((f) => f.id === targetId);
      if (!sourceFloor || !targetFloor) return false;
      const sourceIsFloor = sourceFloor.level >= 0;
      const targetIsFloor = targetFloor.level >= 0;
      return sourceIsFloor === targetIsFloor;
    },
    handleDragStart(e, floorId) {
      this.draggedFloorId = floorId;
      if (e && e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
      }
    },
    handleDragOver(e, floorId) {
      e.preventDefault();
      if (!this.draggedFloorId || this.draggedFloorId === floorId) return;
      if (!this.canSwapFloors(this.draggedFloorId, floorId)) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        this.dragOverFloorId = null;
        return;
      }
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const cursorY = e.clientY;
      const shouldInsertBefore = cursorY < midpoint;
      this.dragOverFloorId = floorId;
      this.insertBefore = shouldInsertBefore;
    },
    handleDragLeave() {
      this.dragOverFloorId = null;
    },
    handleDrop(e, targetFloorId) {
      e.preventDefault();
      if (
        this.draggedFloorId &&
        this.draggedFloorId !== targetFloorId &&
        this.canSwapFloors(this.draggedFloorId, targetFloorId)
      ) {
        this.onReorderFloors(this.draggedFloorId, targetFloorId, this.insertBefore);
      }
      this.draggedFloorId = null;
      this.dragOverFloorId = null;
      this.insertBefore = true;
    },
    handleDragEnd() {
      this.draggedFloorId = null;
      this.dragOverFloorId = null;
      this.insertBefore = true;
    },
    openDeleteDialog(payload) {
      this.areaToDelete = payload;
      this.deleteDialogOpen = true;
    },
    confirmDelete() {
      if (!this.areaToDelete) return;
      if (this.areaToDelete.type === 'floor' && this.areaToDelete.id) {
        this.onDeleteFloor(this.areaToDelete.id);
      } else if (this.areaToDelete.type === 'forecourt') {
        this.onDeleteForecourt();
      } else if (this.areaToDelete.type === 'externalmerch') {
        this.onDeleteExternalMerch();
      }
      this.deleteDialogOpen = false;
      this.areaToDelete = null;
    },
  },
};
</script>

<style scoped>
/* Move scroll to the expansion panel wrapper to avoid nested overflow conflicts
   with v-navigation-drawer's own overflow:hidden context */
:deep(.v-expansion-panel-text__wrapper) {
  overflow-y: auto !important;
  max-height: 40vh !important;
}

.df-selected {
  background-color: rgba(147, 197, 253, 0.25) !important;
  border: 1px solid #93c5fd !important;
}

.cursor-grab {
  cursor: grab;
}

.cursor-grab:active {
  cursor: grabbing;
}

.opacity-50 {
  opacity: 0.5;
}
</style>