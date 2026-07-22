<template>
  <v-app class="space-builder">
    <!-- Header content is teleported into DashboardView's app-bar -->
    <Teleport to="#space-builder-header-target">
      <template v-if="_headerVisible">
      <!-- Menu button for mobile -->
      <v-app-bar-nav-icon
        v-if="!isFloorPlanFullscreen"
        class="d-lg-none" 
        @click="leftDrawer = !leftDrawer"
      ></v-app-bar-nav-icon>
      
      <!-- Space switcher -->
      <v-menu v-model="spaceSwitcherOpen" :close-on-content-click="true" location="bottom start" offset="8" max-height="360">
        <template #activator="{ props: menuProps }">
          <div
            v-bind="menuProps"
            class="space-switcher-trigger ms-2 ms-lg-6 d-flex align-center"
            style="cursor: pointer; user-select: none;"
          >
            <v-icon icon="mdi-floor-plan" :size="$vuetify.display.mdAndUp ? 28 : 24" color="#ff3131" class="me-2 me-lg-3 flex-shrink-0"></v-icon>
            <span class="text-h6 text-lg-h5 font-weight-bold d-none d-sm-inline texte-truncate" style="max-width: 260px;">
              {{ space?.name || t('spaceBuilderNewSpace') }}
            </span>
            <v-chip
              v-if="space?.maxCapacity"
              size="small"
              color="#ff3131"
              variant="flat"
              class="ms-3 text-white d-none d-md-inline-flex flex-shrink-0"
            >
              <v-icon icon="mdi-account-group" size="14" class="me-1"></v-icon>
              {{ space.maxCapacity }}
            </v-chip>
            <ChevronDownIcon :size="16" class="ms-2 flex-shrink-0" style="opacity: 0.6;" />
          </div>
        </template>

        <v-card min-width="260" max-width="340" rounded="lg" elevation="4">
          <v-list density="compact" nav>
            <v-list-subheader class="text-caption font-weight-bold" style="text-transform: uppercase; letter-spacing: 0.05em;">
              Changer de space
            </v-list-subheader>
            <v-progress-linear v-if="$store.state.spaces.isFetching" indeterminate color="#ff3131" height="2" />
            <v-list-item
              v-for="s in allSpaces"
              :key="s.id"
              :active="s.id === space?.id"
              active-color="#ff3131"
              rounded="lg"
              @click="switchToSpace(s.id)"
            >
              <template #prepend>
                <Building2Icon :size="16" class="me-2" style="flex-shrink: 0;" />
              </template>
              <v-list-item-title class="text-body-2">{{ s.name }}</v-list-item-title>
              <template v-if="s.id === space?.id" #append>
                <v-icon icon="mdi-check" size="16" color="#ff3131" />
              </template>
            </v-list-item>
            <v-list-item v-if="!$store.state.spaces.isFetching && allSpaces.length === 0" disabled>
              <v-list-item-title class="text-caption text-medium-emphasis">Aucun space</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card>
      </v-menu>
      
      <v-spacer />
      
      <!-- Properties button for mobile -->
      <v-btn
        v-if="!isFloorPlanFullscreen && selectedElement"
        icon
        class="d-lg-none me-2"
        @click="rightDrawer = !rightDrawer"
      >
        <v-icon icon="mdi-cog"></v-icon>
      </v-btn>
      </template>
    </Teleport>

    <v-main>
      <div class="d-flex main-container" style="height: calc(100vh - 64px); overflow: hidden;">
        <!-- Left Sidebar -->
        <v-navigation-drawer
          v-if="!isFloorPlanFullscreen"
          v-model="leftDrawer"
          :permanent="$vuetify.display.lgAndUp"
          :temporary="$vuetify.display.mdAndDown"
          :width="$vuetify.display.xlAndUp ? 360 : $vuetify.display.lgAndUp ? 320 : 300"
          class="left-sidebar"
          elevation="2"
        >
          <div class="left-sidebar-inner">
            <!-- Areas Section -->
            <div class="left-sidebar-floors">
              <FloorListView
                :floors="floors"
                :forecourt="forecourt"
                :external-merch="externalMerch"
                :selected-floor-id="selectedFloorId"
                :view-mode="viewMode"
                :on-select-floor="handleSelectFloor"
                :on-select-forecourt="handleSelectForecourt"
                :on-select-external-merch="handleSelectExternalMerch"
                :on-update-floor="handleUpdateFloor"
                :on-update-forecourt="handleUpdateForecourt"
                :on-update-external-merch="handleUpdateExternalMerch"
                :on-delete-floor="handleDeleteFloor"
                :on-delete-forecourt="handleDeleteForecourt"
                :on-delete-external-merch="handleDeleteExternalMerch"
                :on-duplicate-floor="handleDuplicateFloor"
                :on-add-floor="handleAddFloor"
                :on-add-forecourt="handleAddForecourt"
                :on-add-external-merch="handleAddExternalMerch"
                :on-reorder-floors="handleReorderFloors"
                :condensed="false"
              />
            </div>

            <!-- Element Palette -->
            <div class="left-sidebar-palette">
              <ElementPaletteView
                :selected-tool="selectedTool"
                :on-select-tool="handleSelectTool"
                :selected-storage-types="selectedStorageTypes"
                :on-select-storage-types="handleSelectStorageTypes"
                :selected-shop-types="selectedShopTypes"
                :on-select-shop-types="handleSelectShopTypes"
                :selected-hospitality-types="selectedHospitalityTypes"
                :on-select-hospitality-types="handleSelectHospitalityTypes"
                :selected-merch-types="selectedMerchTypes"
                :on-select-merch-types="handleSelectMerchTypes"
                :selected-access-types="selectedAccessTypes"
                :on-select-access-types="handleSelectAccessTypes"
                :selected-entertainment-types="selectedEntertainmentTypes"
                :on-select-entertainment-types="handleSelectEntertainmentTypes"
                :selected-entrance-types="selectedEntranceTypes"
                :on-select-entrance-types="handleSelectEntranceTypes"
                :selected-kitchen-types="selectedKitchenTypes"
                :on-select-kitchen-types="handleSelectKitchenTypes"
                :condensed="false"
              />
            </div>
          </div>
        </v-navigation-drawer>

        <!-- Center Canvas Area -->
        <div
          class="d-flex flex-column"
          style="flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden;"
        >
        
          <!-- Canvas Area -->
          <div
            :class="$vuetify.display.mdAndUp ? 'pa-3' : 'pa-2'"
            :style="isFloorPlanFullscreen 
              ? 'flex: 1 1 auto; min-height: 0; height: 100%; display: flex; flex-direction: column; overflow: hidden;' 
              : $vuetify.display.mdAndUp 
                ? 'flex: 1 1 auto; min-height: 0; height: 100%; display: grid; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; overflow: hidden;'
                : 'flex: 1 1 auto; min-height: 0; height: 100%; display: flex; flex-direction: column; overflow: auto; gap: 0.5rem;'"
          >
            <!-- Elevation View -->
            <v-card 
              v-if="!isFloorPlanFullscreen && $vuetify.display.mdAndUp" 
              rounded="xl" 
              elevation="3" 
              class="elevation-card" 
              style="min-height: 0; overflow: hidden; display: flex; flex-direction: column;"
            >
              <div :class="$vuetify.display.mdAndUp ? 'pa-4' : 'pa-3'" style="flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column;">
                <div style="flex: 1; min-height: 0; overflow: auto;">
                  <ElevationBuilderView
                    :floors="floors"
                    :forecourt="forecourt"
                    :external-merch="externalMerch"
                    :selected-floor-id="selectedFloorId"
                    :selected-element-id="selectedElementId"
                    :view-mode="viewMode"
                    :selected-tool="selectedTool"
                    :current-config-id="configuration.id || null"
                    :selected-storage-types="selectedStorageTypes"
                    :selected-shop-types="selectedShopTypes"
                    :selected-hospitality-types="selectedHospitalityTypes"
                    :selected-merch-types="selectedMerchTypes"
                    :selected-access-types="selectedAccessTypes"
                    :selected-entertainment-types="selectedEntertainmentTypes"
                    :selected-entrance-types="selectedEntranceTypes"
                    :selected-kitchen-types="selectedKitchenTypes"
                    :inventory-items="inventoryItems"
                    :menu-items="menuItems"
                    :on-select-element="handleSelectElement"
                    :on-select-floor="handleSelectFloor"
                    :on-select-forecourt="handleSelectForecourt"
                    :on-select-external-merch="handleSelectExternalMerch"
                    :on-update-floor="handleUpdateFloor"
                    :on-update-forecourt="handleUpdateForecourt"
                    :on-update-external-merch="handleUpdateExternalMerch"
                  >
                    <template #config-controls>
                      <!-- Configuration Selector -->
                      <v-select
                        v-if="availableConfigurations.length > 0"
                        v-model="selectedConfigId"
                        :items="configurationOptions"
                        item-title="name"
                        item-value="id"
                        variant="outlined"
                        density="compact"
                        rounded="lg"
                        hide-details
                        style="max-width: 260px; min-width: 160px;"
                        :loading="loadingConfigurations"
                      >
                        <template #selection="{ item }">
                          <div class="d-flex align-center justify-space-between w-100">
                            <span class="font-weight-medium text-body-2">{{ item?.raw?.name || '' }}</span>
                            <v-chip v-if="item?.raw?.capacity" size="x-small" color="#ff3131" variant="flat" class="text-white ms-2">
                              <v-icon icon="mdi-account-group" size="10" class="me-1"></v-icon>
                              {{ item.raw.capacity }}
                            </v-chip>
                          </div>
                        </template>
                        <template #item="{ props, item }">
                          <v-list-item v-bind="props">
                            <template #append>
                              <v-chip v-if="item?.raw?.capacity" size="small" color="#ff3131" variant="flat" class="text-white">
                                <v-icon icon="mdi-account-group" size="12" class="me-1"></v-icon>
                                {{ item.raw.capacity }}
                              </v-chip>
                            </template>
                          </v-list-item>
                        </template>
                      </v-select>

                      <!-- Configuration Actions Menu -->
                      <v-menu
                        v-model="configMenuOpen"
                        :close-on-content-click="true"
                        location="bottom end"
                        offset="8"
                      >
                        <template #activator="{ props: menuProps }">
                          <v-btn
                            v-bind="menuProps"
                            icon
                            variant="outlined"
                            size="small"
                          >
                            <FolderIcon :size="18" />
                          </v-btn>
                        </template>
                        <v-card min-width="220" rounded="xl" elevation="4">
                          <v-list density="compact" nav>
                            <v-list-item key="cfg-back" @click="handleCancel" rounded="lg">
                              <template #prepend>
                                <ArrowLeftIcon :size="16" class="me-3" />
                              </template>
                              <v-list-item-title>{{ t('spaceBuilderBack') }}</v-list-item-title>
                            </v-list-item>

                            <v-divider key="cfg-div1" class="my-1" />

                            <v-list-item key="cfg-save" @click="handleSaveConfiguration" rounded="lg">
                              <template #prepend>
                                <SaveIcon :size="16" class="me-3" />
                              </template>
                              <v-list-item-title>{{ t('spaceBuilderSave') }}</v-list-item-title>
                            </v-list-item>

                            <v-list-item key="cfg-dup" @click="handleDuplicateConfiguration" :disabled="!configuration.id" rounded="lg">
                              <template #prepend>
                                <CopyIcon :size="16" class="me-3" />
                              </template>
                              <v-list-item-title>{{ t('ppDuplicate') }}</v-list-item-title>
                            </v-list-item>

                            <v-list-item key="cfg-rename" @click="handleRenameConfiguration" :disabled="!configuration.id" rounded="lg">
                              <template #prepend>
                                <PencilIcon :size="16" class="me-3" />
                              </template>
                              <v-list-item-title>{{ t('spaceBuilderRename') }}</v-list-item-title>
                            </v-list-item>

                            <v-list-item key="cfg-new" @click="selectedConfigId = '__create__'" rounded="lg">
                              <template #prepend>
                                <PlusIcon :size="16" class="me-3" />
                              </template>
                              <v-list-item-title>{{ t('spaceBuilderNewConfig') }}</v-list-item-title>
                            </v-list-item>

                            <v-divider key="cfg-div2" class="my-1" />

                            <v-list-item key="cfg-del" @click="showDeleteConfigDialog = true" :disabled="!configuration.id" rounded="lg" color="error">
                              <template #prepend>
                                <Trash2Icon :size="16" class="me-3" color="#ff3131" />
                              </template>
                              <v-list-item-title class="text-error">{{ t('delete') }}</v-list-item-title>
                            </v-list-item>

                            <template v-if="configuration.id" :key="`cfg-info-${configuration.id}`">
                              <v-divider class="my-1" />
                              <v-list-item disabled rounded="lg">
                                <v-list-item-title class="font-weight-medium">{{ configuration.name }}</v-list-item-title>
                                <template #append>
                                  <span v-if="configuration.capacity" class="text-medium-emphasis text-body-2">{{ configuration.capacity }}</span>
                                </template>
                              </v-list-item>
                            </template>
                          </v-list>
                        </v-card>
                      </v-menu>
                    </template>
                  </ElevationBuilderView>
                </div>
              </div>
            </v-card>

            <!-- Floor Plan View -->
            <v-card
              rounded="xl" 
              elevation="3"
              class="floor-plan-card"
              :style="isFloorPlanFullscreen 
                ? 'flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column;' 
                : $vuetify.display.mdAndUp 
                  ? 'min-height: 0; overflow: hidden; display: flex; flex-direction: column;'
                  : 'min-height: 400px; overflow: hidden; display: flex; flex-direction: column;'"
            >
              <div
                v-if="selectedFloor"
                :class="$vuetify.display.mdAndUp ? 'pa-4' : 'pa-3'"
                style="flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column;"
              >
                <div style="flex: 1; min-height: 0; overflow: auto;">
                  <FloorPlanBuilderView
                    :floor="selectedFloor"
                    :selected-element-id="selectedElementId"
                    :selected-tool="selectedTool"
                    :current-config-id="configuration.id || null"
                    :selected-storage-types="selectedStorageTypes"
                    :selected-shop-types="selectedShopTypes"
                    :selected-hospitality-types="selectedHospitalityTypes"
                    :selected-merch-types="selectedMerchTypes"
                    :selected-access-types="selectedAccessTypes"
                    :selected-entertainment-types="selectedEntertainmentTypes"
                    :selected-entrance-types="selectedEntranceTypes"
                    :selected-kitchen-types="selectedKitchenTypes"
                    :on-select-element="handleSelectElement"
                    :on-add-element="handleAddElement"
                    :on-update-element="handleUpdateElement"
                    :on-update-floor="handleUpdateFloorPlan"
                    :is-fullscreen="isFloorPlanFullscreen"
                    :on-toggle-fullscreen="handleToggleFloorPlanFullscreen"
                  />
                </div>
              </div>
              <div
                v-else
                :class="$vuetify.display.mdAndUp ? 'pa-8' : 'pa-6'"
                class="d-flex align-center justify-center text-medium-emphasis empty-state"
                style="flex: 1; min-height: 0;"
              >
                <div class="text-center">
                  <v-icon icon="mdi-floor-plan" :size="$vuetify.display.mdAndUp ? 64 : 48" color="grey-lighten-2" class="mb-4"></v-icon>
                  <div :class="$vuetify.display.mdAndUp ? 'text-h6' : 'text-subtitle-1'" class="font-weight-medium">{{ t('spaceBuilderSelectFloor') }}</div>
                  <div class="text-body-2 text-medium-emphasis mt-2 d-none d-sm-block">{{ t('spaceBuilderSelectFloorDesc') }}</div>
                </div>
              </div>
            </v-card>
          </div>
        </div>

        <!-- Right Sidebar -->
        <v-navigation-drawer
          v-if="!isFloorPlanFullscreen"
          v-model="rightDrawer"
          :permanent="$vuetify.display.lgAndUp"
          :temporary="$vuetify.display.mdAndDown"
          location="right"
          :width="$vuetify.display.xlAndUp ? 420 : $vuetify.display.lgAndUp ? 360 : 320"
          class="right-sidebar"
          elevation="2"
        >
          <PropertiesPanelView
            v-if="selectedElement"
            :element="selectedElement"
            :configurations="availableConfigurations"
            :current-config-id="configuration.id"
            :available-menu-items="menuItems"
            :all-fb-elements="allFBElements"
            :current-space="space"
            :available-areas="availableAreas"
            :syncing-config-ids="syncingConfigIds"
            :on-update="handleUpdateSelectedElement"
            :on-delete="handleDeleteSelectedElement"
            :on-duplicate="handleDuplicateSelectedElement"
            :on-close="handleCloseProperties"
          />

          <div
            v-else-if="selectedTool"
            :class="$vuetify.display.mdAndUp ? 'pa-4' : 'pa-3'"
            style="height: 100%; overflow-y: auto;"
          >
            <div class="d-flex align-center gap-2 mb-3">
              <v-icon :icon="selectedToolIcon" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ selectedTool === 'shop' ? t('spaceBuilderFBShopsList') : selectedToolLabel }}</span>
            </div>
            <div v-if="selectedToolElements.length === 0" class="text-center text-medium-emphasis py-8">
              <v-icon icon="mdi-shape-outline" :size="$vuetify.display.mdAndUp ? 48 : 36" color="grey-lighten-2" class="mb-2"></v-icon>
              <div class="text-body-2">{{ selectedTool === 'shop' ? t('spaceBuilderNoFBShops') : t('spaceBuilderNoElementsInCategory') }}</div>
            </div>
            <template v-else>
              <div class="text-body-2 text-medium-emphasis mb-3">{{ selectedTool === 'shop' ? t('spaceBuilderFBShopsListDesc') : t('spaceBuilderElementsListDesc') }}</div>
              <v-chip-group v-model="selectedFBAreaId" mandatory color="primary" class="mb-2">
                <v-chip key="all" value="all" size="small" filter variant="outlined">
                  {{ t('spaceBuilderAllAreas') }}
                </v-chip>
                <v-chip
                  v-for="group in selectedToolGroupsByFloor"
                  :key="group.floorId"
                  :value="group.floorId"
                  size="small"
                  filter
                  variant="outlined"
                >
                  {{ group.floorName }}
                </v-chip>
              </v-chip-group>
              <div class="d-flex flex-column gap-2">
                <div
                  v-for="group in filteredSelectedToolGroups"
                  :key="group.floorId"
                  class="d-flex flex-column gap-2"
                >
                  <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mt-1">{{ group.floorName }}</div>
                  <v-card
                    v-for="shop in group.shops"
                    :key="shop.id"
                    rounded="lg"
                    elevation="0"
                    hover
                    class="pa-3"
                    style="cursor: pointer; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));"
                    @click="handleSelectFBShop(shop)"
                  >
                    <div class="d-flex align-center gap-2">
                      <v-avatar :color="selectedToolColor" size="32" rounded="lg">
                        <v-icon :icon="selectedToolIcon" size="16" color="white"></v-icon>
                      </v-avatar>
                      <div class="flex-grow-1 text-truncate">
                        <div class="fw-medium text-truncate" style="font-size: 13px;">{{ shop.name }}</div>
                      </div>
                    </div>
                  </v-card>
                </div>
              </div>
            </template>
          </div>

          <div v-else :class="$vuetify.display.mdAndUp ? 'pa-8' : 'pa-6'" class="d-flex align-center justify-center" style="height: 100%;">
            <div class="text-center empty-state">
              <v-icon icon="mdi-cursor-default-click" :size="$vuetify.display.mdAndUp ? 64 : 48" color="grey-lighten-2" class="mb-4"></v-icon>
              <div :class="$vuetify.display.mdAndUp ? 'text-h6' : 'text-subtitle-1'" class="font-weight-medium mb-2">{{ t('spaceBuilderNoElement') }}</div>
              <div class="text-body-2 text-medium-emphasis d-none d-sm-block">
                {{ t('spaceBuilderNoElementDesc') }}
              </div>
            </div>
          </div>
        </v-navigation-drawer>
      </div>
    </v-main>

    <!-- Snackbar pour les messages de succès et d'erreur -->
    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="snackbar.timeout"
      location="top"
      rounded="lg"
    >
      <div class="d-flex align-center">
        <v-icon :icon="snackbar.icon" size="20" class="me-2"></v-icon>
        <span class="font-weight-medium">{{ snackbar.message }}</span>
      </div>
      <template v-slot:actions>
        <v-btn
          variant="text"
          icon="mdi-close"
          size="small"
          @click="snackbar.show = false"
        ></v-btn>
      </template>
    </v-snackbar>

    <!-- Configuration Name Dialog -->
    <v-dialog v-model="showConfigNameDialog" :max-width="$vuetify.display.smAndUp ? 500 : '90vw'" persistent :fullscreen="$vuetify.display.xs">
      <v-card rounded="xl" elevation="8">
        <v-card-title class="text-h5 font-weight-bold pa-6">
          <v-icon icon="mdi-content-save" color="#ff3131" size="28" class="me-3"></v-icon>
          {{ t('spaceBuilderSaveDialogTitle') }}
        </v-card-title>
        
        <v-card-text class="pa-6">
          <p class="text-body-1 mb-4 text-medium-emphasis">
            {{ t('spaceBuilderSaveDialogDesc') }}
          </p>
          <v-text-field
            v-model="configName"
            :label="t('spaceBuilderSaveDialogLabel')"
            :placeholder="t('spaceBuilderSaveDialogPlaceholder')"
            variant="outlined"
            rounded="lg"
            density="compact"
            autofocus
            @keyup.enter="confirmSaveConfiguration"
          >
            <template #prepend-inner>
              <v-icon icon="mdi-tag" size="20" class="me-2"></v-icon>
            </template>
          </v-text-field>
        </v-card-text>
        
        <v-card-actions class="pa-6 pt-0">
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            size="large"
            rounded="lg"
            @click="cancelSaveConfiguration"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            variant="flat"
            color="#ff3131"
            size="small"
            rounded="lg"
            class="text-white font-weight-bold"
            elevation="2"
            :disabled="!configName || !configName.trim()"
            @click="confirmSaveConfiguration"
          >
            {{ saveButtonText }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Rename Configuration Dialog -->
    <v-dialog v-model="showRenameDialog" :max-width="$vuetify.display.smAndUp ? 500 : '90vw'" persistent :fullscreen="$vuetify.display.xs">
      <v-card rounded="xl" elevation="8">
        <v-card-title class="text-h5 font-weight-bold pa-6">
          <v-icon icon="mdi-pencil" color="#ff3131" size="28" class="me-3"></v-icon>
          {{ t('spaceBuilderRenameDialogTitle') }}
        </v-card-title>
        <v-card-text class="pa-6">
          <v-text-field
            v-model="renameValue"
            :label="t('spaceBuilderRenameDialogLabel')"
            variant="outlined"
            rounded="lg"
            density="compact"
            autofocus
            @keyup.enter="confirmRenameConfiguration"
          >
            <template #prepend-inner>
              <v-icon icon="mdi-tag" size="20" class="me-2"></v-icon>
            </template>
          </v-text-field>
        </v-card-text>
        <v-card-actions class="pa-6 pt-0">
          <v-spacer></v-spacer>
          <v-btn variant="text" size="large" rounded="lg" @click="showRenameDialog = false">
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            variant="flat"
            color="#ff3131"
            size="small"
            rounded="lg"
            class="text-white font-weight-bold"
            elevation="2"
            :disabled="!renameValue || !renameValue.trim() || renameValue.trim() === configuration.name"
            @click="confirmRenameConfiguration"
          >
            {{ t('spaceBuilderRename') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Configuration Dialog -->
    <v-dialog v-model="showDeleteConfigDialog" max-width="420" persistent>
      <v-card rounded="xl" elevation="8">
        <v-card-title class="text-h6 font-weight-bold pa-6">
          <v-icon icon="mdi-delete-alert" color="#ff3131" size="24" class="me-3"></v-icon>
          {{ t('delete') }} configuration
        </v-card-title>
        <v-card-text class="pa-6 pt-0">
          <p class="text-body-2 text-medium-emphasis">
            {{ t('ppDeleteDesc') }}
          </p>
          <v-chip v-if="configuration.name" color="#ff3131" variant="tonal" rounded="lg" class="mt-2">
            {{ configuration.name }}
          </v-chip>
        </v-card-text>
        <v-card-actions class="pa-6 pt-0">
          <v-spacer />
          <v-btn variant="text" rounded="lg" @click="showDeleteConfigDialog = false">{{ t('cancel') }}</v-btn>
          <v-btn variant="flat" color="#ff3131" rounded="lg" class="text-white font-weight-bold" @click="handleDeleteConfiguration">{{ t('delete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Processing overlay — blocks all interaction during async operations -->
    <div
      v-if="savingConfiguration"
      style="position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,0.48); display: flex; align-items: center; justify-content: center;"
    >
      <v-card rounded="xl" elevation="12" class="pa-8 d-flex flex-column align-center ga-6" style="min-width: 260px; text-align: center;">
        <v-progress-circular indeterminate color="#ff3131" size="56" width="5" />
        <div>
          <div class="text-subtitle-1 font-weight-medium">{{ t('spaceBuilderSaving') }}</div>
          <div class="text-body-2 text-medium-emphasis mt-1">{{ t('spaceBuilderSavingWait') }}</div>
        </div>
      </v-card>
    </div>

  </v-app>
</template>

<script>
import ElementPaletteView from '../widgets/ElementPaletteView.vue';
import FloorListView from '../widgets/FloorListView.vue';
import ElevationBuilderView from '../widgets/ElevationBuilderView.vue';
import FloorPlanBuilderView from '../widgets/FloorPlanBuilderView.vue';
import PropertiesPanelView from '../widgets/PropertiesPanelView.vue';
import { getSpace, getSpaceConfigurations } from '@/api/endpoints/space.api';
import { createConfiguration, updateConfiguration, getConfiguration, deleteConfiguration } from '@/api/endpoints/configuration.api';
import { useI18n } from '@/i18n/useI18n';
import { confirmDialog, leaveDialog } from '@/composables/useConfirmDialog';
import { Folder as FolderIcon, Save as SaveIcon, Copy as CopyIcon, Plus as PlusIcon, Trash2 as Trash2Icon, ArrowLeft as ArrowLeftIcon, Pencil as PencilIcon, ChevronDown as ChevronDownIcon, Building2 as Building2Icon } from 'lucide-vue-next';

export default {
  name: 'SpaceBuilder',
  components: {
    ElementPaletteView,
    FloorListView,
    ElevationBuilderView,
    FloorPlanBuilderView,
    PropertiesPanelView,
    FolderIcon,
    SaveIcon,
    CopyIcon,
    PlusIcon,
    Trash2Icon,
    ArrowLeftIcon,
    PencilIcon,
    ChevronDownIcon,
    Building2Icon,
  },
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      space: null,
      availableConfigurations: [],
      selectedConfigId: null,
      loadingConfigurations: false,
      configuration: {
        id: '',
        name: '',
        spaceId: '',
        capacity: 0,
        data: {
          floors: [],
          forecourt: null,
          externalMerch: null
        }
      },
      savingConfiguration: false,
      showConfigNameDialog: false,
      showRenameDialog: false,
      renameValue: '',
      configMenuOpen: false,
      showDeleteConfigDialog: false,
      configName: '',
      // Confirmation de sortie sans sauvegarde
      savedSnapshot: null,
      snackbar: {
        show: false,
        message: '',
        color: 'success',
        icon: 'mdi-check-circle',
        timeout: 4000,
      },
      leftDrawer: true,
      rightDrawer: true,
      selectedTool: null,
      selectedFBAreaId: 'all',
      searchInventory: '',
      searchFB: '',
      gridWidth: 600,
      gridHeight: 400,
      isDrawing: false,
      drawStart: { x: 0, y: 0 },
      drawEnd: { x: 0, y: 0 },
      placedElements: [],
      selectedElementIndex: null,
      selectedStorageTypes: [],
      selectedShopTypes: [],
      selectedHospitalityTypes: [],
      selectedMerchTypes: [],
      selectedAccessTypes: [],
      selectedEntertainmentTypes: [],
      selectedEntranceTypes: [],
      selectedKitchenTypes: [],
      // Floor management
      floors: [],
      forecourt: null,
      externalMerch: null,
      selectedFloorId: null,
      loadingFloors: false,
      viewMode: 'floor',
      lastFloorDimensions: { width: 100, length: 100, height: 4 },
      _suppressNextWatcherReload: false,
      _headerVisible: true,
      _fetchSpaceRequestId: null,
      spaceSwitcherOpen: false,
      inventoryItems: [],
      menuItems: [],
      selectedElementId: null,
      syncingConfigIds: [],
      isFloorPlanFullscreen: false,
    };
  },
  computed: {
    allSpaces() {
      return this.$store.getters['spaces/spaces'] || [];
    },
    selectedFloor() {
      if (this.viewMode === 'floor' && this.selectedFloorId) {
        return this.floors.find(f => f.id === this.selectedFloorId);
      }
      if (this.viewMode === 'forecourt' && this.forecourt) {
        return this.forecourt;
      }
      if (this.viewMode === 'externalmerch' && this.externalMerch) {
        return this.externalMerch;
      }
      return null;
    },
    allFBElements() {
      // Tous les éléments F&B : floors (y compris basement), forecourt et external area.
      const result = [];
      for (const floor of this.floors || []) {
        for (const el of floor.elements || []) {
          if (this.categoryOfElementType(el.type) === 'shop' || el.subType === 'fb') {
            result.push({ ...el, floorName: floor.name, floorId: floor.id, areaType: 'floor' });
          }
        }
      }
      if (this.forecourt) {
        for (const el of this.forecourt.elements || []) {
          if (this.categoryOfElementType(el.type) === 'shop' || el.subType === 'fb') {
            result.push({ ...el, floorName: this.forecourt.name || 'Forecourt', floorId: '__forecourt__', areaType: 'forecourt' });
          }
        }
      }
      if (this.externalMerch) {
        for (const el of this.externalMerch.elements || []) {
          if (this.categoryOfElementType(el.type) === 'shop' || el.subType === 'fb') {
            result.push({ ...el, floorName: this.externalMerch.name || 'External Area', floorId: '__external__', areaType: 'externalmerch' });
          }
        }
      }
      return result;
    },
    availableAreas() {
      const seen = new Set();
      const allElements = [
        ...(this.floors || []).flatMap(f => f.elements || []),
        ...((this.forecourt?.elements) || []),
        ...((this.externalMerch?.elements) || []),
      ];
      for (const el of allElements) {
        const a = el.attributes?.area ?? el.area;
        if (a && typeof a === 'string' && a.trim()) seen.add(a.trim());
      }
      return [...seen].sort();
    },
    // Shops F&B groupés par floor, dans l'ordre d'affichage des Areas
    fbShopsByFloor() {
      const groups = [];
      const byFloorId = new Map();
      for (const shop of this.allFBElements) {
        let group = byFloorId.get(shop.floorId);
        if (!group) {
          group = { floorId: shop.floorId, floorName: shop.floorName, shops: [] };
          byFloorId.set(shop.floorId, group);
          groups.push(group);
        }
        group.shops.push(shop);
      }
      return groups;
    },
    // Shops F&B filtrés selon l'Area sélectionnée (onglet/tag)
    filteredFbShopsByFloor() {
      if (!this.selectedFBAreaId || this.selectedFBAreaId === 'all') {
        return this.fbShopsByFloor;
      }
      return this.fbShopsByFloor.filter((group) => group.floorId === this.selectedFBAreaId);
    },
    // ── Liste GÉNÉRIQUE des éléments de la catégorie/outil sélectionné(e) dans la palette
    // (F&B, Hospitality, Merch, Storage, …). Avant, seul F&B (`selectedTool === 'shop'`)
    // affichait ses éléments dans le panneau de droite ; les autres catégories ne
    // montraient rien alors qu'elles contiennent des éléments. On généralise ici.
    selectedToolElements() {
      if (!this.selectedTool) return [];
      const result = [];
      const matchesTool = (el) =>
        this.categoryOfElementType(el.type) === this.selectedTool ||
        (this.selectedTool === 'shop' && el.subType === 'fb');

      for (const floor of this.floors || []) {
        for (const el of floor.elements || []) {
          if (matchesTool(el)) result.push({ ...el, floorName: floor.name, floorId: floor.id, areaType: 'floor' });
        }
      }
      if (this.forecourt) {
        for (const el of this.forecourt.elements || []) {
          if (matchesTool(el)) result.push({ ...el, floorName: this.forecourt.name || 'Forecourt', floorId: '__forecourt__', areaType: 'forecourt' });
        }
      }
      if (this.externalMerch) {
        for (const el of this.externalMerch.elements || []) {
          if (matchesTool(el)) result.push({ ...el, floorName: this.externalMerch.name || 'External Area', floorId: '__external__', areaType: 'externalmerch' });
        }
      }
      return result;
    },
    selectedToolGroupsByFloor() {
      const groups = [];
      const byFloorId = new Map();
      for (const el of this.selectedToolElements) {
        let group = byFloorId.get(el.floorId);
        if (!group) {
          group = { floorId: el.floorId, floorName: el.floorName, shops: [] };
          byFloorId.set(el.floorId, group);
          groups.push(group);
        }
        group.shops.push(el);
      }
      return groups;
    },
    filteredSelectedToolGroups() {
      if (!this.selectedFBAreaId || this.selectedFBAreaId === 'all') {
        return this.selectedToolGroupsByFloor;
      }
      return this.selectedToolGroupsByFloor.filter((group) => group.floorId === this.selectedFBAreaId);
    },
    selectedToolLabel() {
      const map = {
        shop: 'F&B', hospitality: 'Hospitality', merchshop: 'Merch', storage: 'Storage',
        entrance: 'Ticketing', entertainment: 'Entertainment', access: 'Access', kitchen: 'Kitchen',
      };
      return map[this.selectedTool] || this.selectedTool || '';
    },
    selectedToolColor() {
      const map = {
        shop: '#10b981', hospitality: '#E91E63', merchshop: '#616161', storage: '#FF9800',
        entrance: '#F44336', entertainment: '#9C27B0', access: '#607D8B', kitchen: '#FFA000',
      };
      return map[this.selectedTool] || '#10b981';
    },
    selectedToolIcon() {
      const map = {
        shop: 'mdi-store', hospitality: 'mdi-crown', merchshop: 'mdi-shopping',
        storage: 'mdi-package-variant', entrance: 'mdi-ticket-confirmation',
        entertainment: 'mdi-party-popper', access: 'mdi-transit-connection-variant',
        kitchen: 'mdi-chef-hat',
      };
      return map[this.selectedTool] || 'mdi-shape';
    },
    selectedElement() {
      if (!this.selectedElementId) return null;
      // Search in the current view mode's area
      if (this.viewMode === 'floor') {
        // Search in the currently selected floor first
        if (this.selectedFloor) {
          const found = (this.selectedFloor.elements || []).find(e => e.id === this.selectedElementId);
          if (found) return found;
        }
        // If not found in selected floor, search all floors
        for (const floor of this.floors) {
          const found = (floor.elements || []).find(e => e.id === this.selectedElementId);
          if (found) return found;
        }
      }
      if (this.viewMode === 'forecourt' && this.forecourt) {
        return (this.forecourt.elements || []).find(e => e.id === this.selectedElementId) || null;
      }
      if (this.viewMode === 'externalmerch' && this.externalMerch) {
        return (this.externalMerch.elements || []).find(e => e.id === this.selectedElementId) || null;
      }
      return null;
    },
    saveButtonText() {
      return this.configuration.id ? this.t('spaceBuilderSaveUpdate') : this.t('spaceBuilderSave');
    },
    configurationOptions() {
      const configs = this.availableConfigurations.map(c => ({
        id: c.id,
        name: c.name,
        capacity: c.capacity || 0,
        _raw: c,
      }));
      return configs;
    },
    hasUnsavedChanges() {
      if (this.savedSnapshot === null) return false;
      const current = JSON.stringify({
        floors: this.floors,
        forecourt: this.forecourt,
        externalMerch: this.externalMerch,
      });
      return current !== this.savedSnapshot;
    },
  },
  watch: {
    '$route.params.spaceId': {
      async handler(newSpaceId, oldSpaceId) {
        if (newSpaceId && newSpaceId !== oldSpaceId) {
          this.resetBuilderState();
          await this.fetchSpace();
        }
      },
    },
    async selectedConfigId(newId, oldId) {
      if (!newId || newId === oldId) return;
      if (this._suppressNextWatcherReload) {
        this._suppressNextWatcherReload = false;
        return;
      }

      if (newId === '__create__') {
        // Mode création : réinitialiser la configuration
        this.configuration = {
          id: '',
          name: '',
          spaceId: this.space?.id || this.$route.params.spaceId,
          capacity: 0,
          data: {
            floors: [],
            forecourt: null,
            externalMerch: null
          }
        };
        
        // Créer un floor par défaut
        this.floors = [
          {
            id: 'temp-default',
            name: 'Floor 0',
            level: 0,
            width: 100,
            length: 100,
            height: 4,
            elements: [],
            cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
            hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
          },
        ];
        this.selectedFloorId = 'temp-default';
        this.viewMode = 'floor';
        this.forecourt = null;
        this.externalMerch = null;
        this.captureSavedSnapshot();
      } else {
        // Charger la configuration sélectionnée
        await this.loadConfiguration(newId);
      }
    },
  },
  methods: {
    resetBuilderState() {
      this.space = null;
      this.availableConfigurations = [];
      this.selectedConfigId = null;
      this.configuration = {
        id: '',
        name: '',
        spaceId: '',
        capacity: 0,
        data: { floors: [], forecourt: null, externalMerch: null }
      };
      this.floors = [];
      this.forecourt = null;
      this.externalMerch = null;
      this.selectedFloorId = null;
      this.selectedElementId = null;
      this.selectedTool = null;
      this.viewMode = 'floor';
      this.savedSnapshot = null;
      this.savingConfiguration = false;
      this.configMenuOpen = false;
      this.showConfigNameDialog = false;
      this.showRenameDialog = false;
      this.renameValue = '';
      this.showDeleteConfigDialog = false;
      this.configName = '';
      this.lastFloorDimensions = { width: 100, length: 100, height: 4 };
    },
    startDrawing(event) {
      const rect = this.$refs.gridCanvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      this.isDrawing = true;
      this.drawStart = { x, y };
      this.drawEnd = { x, y };
    },
    onMouseMove(event) {
      if (!this.isDrawing) return;
      
      const rect = this.$refs.gridCanvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      this.drawEnd = { x, y };
    },
    stopDrawing() {
      if (!this.isDrawing) return;
      
      const width = Math.abs(this.drawEnd.x - this.drawStart.x);
      const height = Math.abs(this.drawEnd.y - this.drawStart.y);
      
      if (width > 20 && height > 20) {
        const category = this.elementCategories.find(c => c.id === this.selectedCategory);
        this.placedElements.push({
          x: Math.min(this.drawStart.x, this.drawEnd.x),
          y: Math.min(this.drawStart.y, this.drawEnd.y),
          width,
          height,
          name: category?.name || 'Element',
          color: this.getCategoryColor(this.selectedCategory),
          selected: false,
        });
      }
      
      this.isDrawing = false;
      this.drawStart = { x: 0, y: 0 };
      this.drawEnd = { x: 0, y: 0 };
    },
    selectElement(index) {
      this.placedElements.forEach((el, i) => {
        el.selected = i === index;
      });
      this.selectedElementIndex = index;
    },
    handleSelectTool(tool) {
      this.selectedTool = tool;
      // Désélectionner l'élément en cours pour laisser place à la liste de l'outil (ex: shops F&B)
      if (tool) {
        this.selectedElementId = null;
        // Repartir sur « Toutes les Areas » : un filtre de floor hérité d'une autre
        // catégorie pourrait masquer à tort les éléments de la nouvelle catégorie.
        this.selectedFBAreaId = 'all';
      }
    },
    handleSelectStorageTypes(types) {
      this.selectedStorageTypes = types;
    },
    handleSelectShopTypes(types) {
      this.selectedShopTypes = types;
    },
    handleSelectHospitalityTypes(types) {
      this.selectedHospitalityTypes = types;
    },
    handleSelectMerchTypes(types) {
      this.selectedMerchTypes = types;
    },
    handleSelectAccessTypes(types) {
      this.selectedAccessTypes = types;
    },
    handleSelectEntertainmentTypes(types) {
      this.selectedEntertainmentTypes = types;
    },
    handleSelectEntranceTypes(types) {
      this.selectedEntranceTypes = types;
    },
    handleSelectKitchenTypes(types) {
      this.selectedKitchenTypes = types;
    },
    // Floor management methods
    handleSelectFloor(floorId) {
      this.selectedFloorId = floorId;
      this.viewMode = 'floor';
    },
    handleSelectForecourt() {
      this.selectedFloorId = null;
      this.viewMode = 'forecourt';
    },
    handleSelectExternalMerch() {
      this.selectedFloorId = null;
      this.viewMode = 'externalmerch';
    },
    handleUpdateFloor(floorId, formData) {
      const floorIndex = this.floors.findIndex(f => f.id === floorId);
      if (floorIndex === -1) return;

      this.floors[floorIndex] = { ...this.floors[floorIndex], ...formData };
      if (formData.width) this.lastFloorDimensions.width = formData.width;
      if (formData.length) this.lastFloorDimensions.length = formData.length;
      if (formData.height) this.lastFloorDimensions.height = formData.height;
    },
    handleUpdateForecourt(formData) {
      if (this.forecourt) {
        this.forecourt = { ...this.forecourt, ...formData };
      }
    },
    handleUpdateExternalMerch(formData) {
      if (this.externalMerch) {
        this.externalMerch = { ...this.externalMerch, ...formData };
      }
    },
    handleDeleteFloor(floorId) {
      // Suppression locale uniquement (pas d'API floor)
      this.floors = this.floors.filter(f => f.id !== floorId);
      if (this.selectedFloorId === floorId && this.floors.length > 0) {
        this.selectedFloorId = this.floors[0].id;
      } else if (this.floors.length === 0) {
        this.selectedFloorId = null;
      }
    },
    handleDeleteForecourt() {
      this.forecourt = null;
      if (this.viewMode === 'forecourt') {
        this.viewMode = 'floor';
        this.selectedFloorId = this.floors.length > 0 ? this.floors[0].id : null;
      }
    },
    handleDeleteExternalMerch() {
      this.externalMerch = null;
      if (this.viewMode === 'externalmerch') {
        this.viewMode = 'floor';
        this.selectedFloorId = this.floors.length > 0 ? this.floors[0].id : null;
      }
    },
    handleDuplicateFloor(floorId) {
      const originalFloor = this.floors.find(f => f.id === floorId);
      if (!originalFloor) return;
      
      // Duplication locale — IDs uniques garantis avec un timestamp de base + index
      const base = Date.now();
      const newFloor = {
        ...originalFloor,
        id: `temp-${base}`,
        name: `${originalFloor.name} (Copy)`,
        elements: (originalFloor.elements || []).map((el, idx) => ({
          ...el,
          id: `temp-${base}-${idx}-${Math.floor(Math.random() * 1e6)}`,
        })),
      };
      this.floors.push(newFloor);
      this.selectedFloorId = newFloor.id;
    },
    // Le backend ne renvoie pas toujours `level` (anciennes configs) : on le déduit
    // du nom ("Floor 2" -> 2, "Basement 1" -> -1), avec l'index comme dernier recours.
    inferFloorLevel(floor, fallbackIndex) {
      if (typeof floor.level === 'number' && !Number.isNaN(floor.level)) return floor.level;
      const name = floor.name || '';
      const basementMatch = name.match(/basement\s*(\d+)/i);
      if (basementMatch) return -Number(basementMatch[1]);
      const floorMatch = name.match(/floor\s*(\d+)/i);
      if (floorMatch) return Number(floorMatch[1]);
      return fallbackIndex;
    },
    // Numéro "affiché" d'un floor : le plus grand entre `level` et le nombre
    // présent dans son nom ("Floor 1" -> 1). Couvre le cas d'un floor renommé
    // sans que `level` ait été mis à jour en conséquence.
    getFloorNumber(floor) {
      const nameMatch = (floor.name || '').match(/floor\s*(\d+)/i);
      const nameNumber = nameMatch ? Number(nameMatch[1]) : -Infinity;
      const levelNumber = typeof floor.level === 'number' && !Number.isNaN(floor.level) ? floor.level : -Infinity;
      return Math.max(nameNumber, levelNumber);
    },
    handleAddFloor(isBasement) {
      const groundFloors = this.floors.filter(f => f.level >= 0);
      const nextFloorLevel = groundFloors.length
        ? Math.max(...groundFloors.map(f => this.getFloorNumber(f))) + 1
        : 0;

      const floorData = {
        name: isBasement ? `Basement ${this.floors.filter(f => f.level < 0).length + 1}` : `Floor ${nextFloorLevel}`,
        level: isBasement ? -1 : nextFloorLevel,
        width: this.lastFloorDimensions.width,
        length: this.lastFloorDimensions.length,
        height: this.lastFloorDimensions.height,
        elements: [],
        cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
        hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
      };
      
      // Créer un floor avec un ID temporaire UNIQUE (pas d'API floor). Le suffixe
      // aléatoire évite que deux floors ajoutés dans la même milliseconde partagent le
      // même `temp-…` → deux lignes relationnelles avec le même id (violation d'unicité).
      const newFloor = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...floorData
      };
      // Le nouveau floor doit apparaître au-dessus des autres dans la liste
      this.floors.unshift(newFloor);
      this.selectedFloorId = newFloor.id;
      this.viewMode = 'floor';
    },
    handleAddForecourt() {
      this.forecourt = {
        name: 'Forecourt',
        width: 50,
        length: 50,
        elements: [],
        cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
      };
      this.viewMode = 'forecourt';
      this.selectedFloorId = null;
    },
    handleAddExternalMerch() {
      this.externalMerch = {
        name: 'External Area',
        width: 50,
        length: 50,
        elements: [],
        cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
      };
      this.viewMode = 'externalmerch';
      this.selectedFloorId = null;
    },
    handleReorderFloors(draggedFloorId, targetFloorId, insertBefore) {
      const draggedIndex = this.floors.findIndex(f => f.id === draggedFloorId);
      const targetIndex = this.floors.findIndex(f => f.id === targetFloorId);
      if (draggedIndex === -1 || targetIndex === -1) return;
      
      const [draggedFloor] = this.floors.splice(draggedIndex, 1);
      const newTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertIndex = insertBefore ? newTargetIndex : newTargetIndex + 1;
      this.floors.splice(insertIndex, 0, draggedFloor);
    },
    handleSelectElement(elementId) {
      this.selectedElementId = elementId;
    },
    handleSelectFBShop(shop) {
      if (shop.areaType === 'forecourt') {
        this.viewMode = 'forecourt';
        this.selectedFloorId = null;
      } else if (shop.areaType === 'externalmerch') {
        this.viewMode = 'externalmerch';
        this.selectedFloorId = null;
      } else if (shop.floorId) {
        this.selectedFloorId = shop.floorId;
        this.viewMode = 'floor';
      }
      this.selectedElementId = shop.id;
    },
    // Mappe le `type` d'un élément vers la catégorie/outil de la palette correspondante
    // (le type de l'élément peut être 'shop'/'fnb-food'/… ⇒ catégorie 'shop' = F&B).
    categoryOfElementType(type) {
      const t = String(type || '').toLowerCase();
      if (t === 'fb' || t === 'shop' || t.startsWith('fnb')) return 'shop';
      if (t === 'merchshop' || t === 'merch') return 'merchshop';
      if (t === 'hospitality') return 'hospitality';
      if (t === 'storage') return 'storage';
      if (t === 'entrance' || t === 'ticketing') return 'entrance';
      if (t === 'entertainment') return 'entertainment';
      if (t === 'access') return 'access';
      if (t === 'kitchen') return 'kitchen';
      return t;
    },
    handleAddElement(element) {
      // Estampiller le nouvel élément avec la config courante pour éviter le
      // comportement legacy "configurationIds vide = visible dans toutes les configs".
      const stamped = this.configuration.id
        ? { ...element, configurationIds: [this.configuration.id] }
        : element;
      element = stamped;

      if (this.viewMode === 'floor' && this.selectedFloor) {
        const floorIndex = this.floors.findIndex(f => f.id === this.selectedFloor.id);
        if (floorIndex !== -1) {
          // Ensure elements array exists
          if (!this.floors[floorIndex].elements) {
            this.floors[floorIndex].elements = [];
          }
          this.floors[floorIndex].elements.push(element);
          // Force reactivity update
          this.floors = [...this.floors];
        }
      } else if (this.viewMode === 'forecourt' && this.forecourt) {
        // Ensure elements array exists
        if (!this.forecourt.elements) {
          this.forecourt.elements = [];
        }
        this.forecourt.elements.push(element);
        // Force reactivity update
        this.forecourt = { ...this.forecourt };
      } else if (this.viewMode === 'externalmerch' && this.externalMerch) {
        // Ensure elements array exists
        if (!this.externalMerch.elements) {
          this.externalMerch.elements = [];
        }
        this.externalMerch.elements.push(element);
        // Force reactivity update
        this.externalMerch = { ...this.externalMerch };
      }
    },
    handleUpdateElement(elementId, updates) {
      const area =
        this.viewMode === 'floor'
          ? this.selectedFloor
          : this.viewMode === 'forecourt'
            ? this.forecourt
            : this.viewMode === 'externalmerch'
              ? this.externalMerch
              : null;

      if (!area || !Array.isArray(area.elements)) return;
      const elementIndex = area.elements.findIndex(e => e.id === elementId);
      if (elementIndex === -1) return;
      area.elements[elementIndex] = {
        ...area.elements[elementIndex],
        ...updates,
      };
    },
    handleUpdateSelectedElement(updates) {
      if (!this.selectedElementId) return;

      if ('configurationIds' in updates && this.selectedElement && this.configuration.id) {
        const rawOldIds = this.selectedElement.configurationIds || [];
        const newIds = updates.configurationIds || [];
        const currentId = this.configuration.id;

        // Empty configurationIds means "visible in all configs" — expand for accurate diff
        const allConfigIds = this.availableConfigurations.map(c => c.id);
        const oldIds = rawOldIds.length === 0 ? allConfigIds : rawOldIds;

        const added   = newIds.filter(id => id !== currentId && !oldIds.includes(id));
        const removed = oldIds.filter(id => id !== currentId && !newIds.includes(id));

        if (added.length > 0 || removed.length > 0) {
          const affectedIds = [...added, ...removed];
          this.syncingConfigIds = [...this.syncingConfigIds, ...affectedIds];
          this.syncConfigurationIdChanges(
            this.selectedElement.name,
            this.selectedElement.type,
            added,
            removed,
            this.selectedElement,
            this.viewMode,
            this.viewMode === 'floor' ? (this.selectedFloor?.level ?? null) : null,
            this.viewMode === 'floor'
              ? { width: this.selectedFloor?.width ?? null, height: this.selectedFloor?.length ?? null }
              : null,
          ).finally(() => {
            this.syncingConfigIds = this.syncingConfigIds.filter(id => !affectedIds.includes(id));
          });
        }
      }

      this.handleUpdateElement(this.selectedElementId, updates);

      // Persister immédiatement la config courante quand configurationIds change,
      // sinon loadConfiguration() (déclenché au changement de config) refetch l'API
      // et perd la modification locale — la coche disparaît à la prochaine visite.
      if ('configurationIds' in updates && this.configuration.id) {
        this.persistCurrentConfigSilently();
      }
    },
    async persistCurrentConfigSilently() {
      if (!this.configuration.id || !this.configuration.name) return;
      try {
        const cleanElements = (elements) => (elements || []).map(el => {
          const isTempId = !el.id || String(el.id).startsWith('temp-');
          if (isTempId) {
            const { id: _id, ...rest } = el;
            return rest;
          }
          return el;
        });
        await updateConfiguration(this.configuration.id, {
          name: this.configuration.name,
          spaceId: this.configuration.spaceId,
          capacity: this.configuration.capacity,
          data: {
            floors: this.floors.map(floor => ({ ...floor, elements: cleanElements(floor.elements) })),
            forecourt: this.forecourt ? { ...this.forecourt, elements: cleanElements(this.forecourt.elements) } : null,
            externalMerch: this.externalMerch ? { ...this.externalMerch, elements: cleanElements(this.externalMerch.elements) } : null,
          },
        });
      } catch (err) {
        console.warn('[SpaceBuilder] persistCurrentConfigSilently:', err?.message);
      }
    },
    handleDeleteSelectedElement() {
      if (!this.selectedElementId) return;
      const area =
        this.viewMode === 'floor'
          ? this.selectedFloor
          : this.viewMode === 'forecourt'
            ? this.forecourt
            : this.viewMode === 'externalmerch'
              ? this.externalMerch
              : null;
      if (!area || !Array.isArray(area.elements)) return;
      area.elements = area.elements.filter(e => e.id !== this.selectedElementId);
      this.selectedElementId = null;
    },
    handleDuplicateSelectedElement() {
      if (!this.selectedElement) return;
      const area =
        this.viewMode === 'floor'
          ? this.selectedFloor
          : this.viewMode === 'forecourt'
            ? this.forecourt
            : this.viewMode === 'externalmerch'
              ? this.externalMerch
              : null;
      if (!area || !Array.isArray(area.elements)) return;
      const copy = {
        ...this.selectedElement,
        id: Date.now().toString(),
        name: `${this.selectedElement.name} (Copy)`,
        x: (this.selectedElement.x || 0) + 1,
        y: (this.selectedElement.y || 0) + 1,
      };
      area.elements.push(copy);
      this.selectedElementId = copy.id;
    },
    handleCloseProperties() {
      this.selectedElementId = null;
    },
    handleUpdateFloorPlan(updates) {
      if (this.viewMode === 'floor' && this.selectedFloor) {
        const floorIndex = this.floors.findIndex(f => f.id === this.selectedFloor.id);
        if (floorIndex !== -1) {
          this.floors[floorIndex] = { ...this.floors[floorIndex], ...updates };
          this.floors = [...this.floors];
        }
      } else if (this.viewMode === 'forecourt' && this.forecourt) {
        this.forecourt = { ...this.forecourt, ...updates };
      } else if (this.viewMode === 'externalmerch' && this.externalMerch) {
        this.externalMerch = { ...this.externalMerch, ...updates };
      }
    },
    handleToggleFloorPlanFullscreen() {
      this.isFloorPlanFullscreen = !this.isFloorPlanFullscreen;
    },
    handleCancel() {
      this.$router.push('/spaces');
    },
    captureSavedSnapshot() {
      this.savedSnapshot = JSON.stringify({
        floors: this.floors,
        forecourt: this.forecourt,
        externalMerch: this.externalMerch,
      });
    },
    handleBeforeUnload(event) {
      if (this.hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = '';
        return '';
      }
    },
    _unwrapConfigs(res) {
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      if (Array.isArray(res?.items)) return res.items;
      if (Array.isArray(res?.data?.data)) return res.data.data;
      return [];
    },
    async fetchSpace() {
      const spaceId = this.$route.params.spaceId;
      if (!spaceId) return;

      // Guard contre les réponses périmées : seule la dernière demande est prise en compte
      const requestId = Symbol();
      this._fetchSpaceRequestId = requestId;

      try {
        const [spaceResponse, configsResponse] = await Promise.all([
          getSpace(spaceId),
          getSpaceConfigurations(spaceId).catch(() => []),
        ]);

        if (this._fetchSpaceRequestId !== requestId) return;

        this.space = spaceResponse?.data || spaceResponse;
        this.configuration.spaceId = spaceId;

        const configs = this._unwrapConfigs(configsResponse);

        if (configs.length > 0) {
          this.availableConfigurations = configs;
          this.selectedConfigId = configs[0].id;
        } else {
          this.availableConfigurations = [];
          this.selectedConfigId = '__create__';
        }
      } catch (error) {
        if (this._fetchSpaceRequestId !== requestId) return;
        console.error('Error fetching space:', error);
      }
    },
    async refreshConfigsForCurrentSpace() {
      const spaceId = this.$route.params.spaceId;
      if (!spaceId) return;

      try {
        const configsResponse = await getSpaceConfigurations(spaceId);
        const configs = this._unwrapConfigs(configsResponse);

        this.availableConfigurations = configs;

        // Si la config sélectionnée n'existe plus, revenir à la première
        if (this.selectedConfigId && this.selectedConfigId !== '__create__') {
          if (!configs.some(c => c.id === this.selectedConfigId)) {
            this.selectedConfigId = configs[0]?.id || '__create__';
          }
        } else if (!this.selectedConfigId && configs.length > 0) {
          this.selectedConfigId = configs[0].id;
        }
      } catch (error) {
        console.error('Error refreshing configs:', error);
      }
    },
    async switchToSpace(targetSpaceId) {
      if (!targetSpaceId || targetSpaceId === this.space?.id) return;
      if (this.hasUnsavedChanges) {
        const result = await leaveDialog({
          title: this.t('spaceBuilderUnsavedTitle'),
          message: this.t('spaceBuilderUnsavedConfirmLeave'),
          leaveText: this.t('spaceBuilderLeaveWithoutSaving'),
          saveText: this.t('spaceBuilderSaveAndLeave'),
          cancelText: this.t('cancel'),
        });
        if (result === false) return;
        if (result === 'save') {
          if (this.configuration.id) {
            this.configName = this.configName || this.configuration.name;
            await this.confirmSaveConfiguration();
          } else {
            this.handleSaveConfiguration();
            return;
          }
        }
      }
      this.$router.push({ path: `/spaces/${targetSpaceId}/builder` });
    },
    handleSaveConfiguration() {
      // Si la configuration existe déjà, on sauvegarde directement sans dialog
      if (this.configuration.id) {
        this.configName = this.configuration.name;
        this.confirmSaveConfiguration();
        return;
      }
      // Nouvelle configuration : demander le nom
      this.configName = '';
      this.showConfigNameDialog = true;
    },
    cancelSaveConfiguration() {
      this.showConfigNameDialog = false;
      this.configName = '';
      // Restore id if we were duplicating and user cancelled
      if (this._duplicatingFromId) {
        this.configuration.id = this._duplicatingFromId;
        this._duplicatingFromId = null;
      }
    },
    handleRenameConfiguration() {
      if (!this.configuration.id) return;
      this.renameValue = this.configuration.name;
      this.showRenameDialog = true;
    },
    async confirmRenameConfiguration() {
      const newName = this.renameValue?.trim();
      if (!newName || newName === this.configuration.name) return;
      this.showRenameDialog = false;
      this.savingConfiguration = true;
      try {
        await updateConfiguration(this.configuration.id, {
          name: newName,
          spaceId: this.configuration.spaceId,
          capacity: this.configuration.capacity,
          data: {
            floors: this.floors,
            forecourt: this.forecourt,
            externalMerch: this.externalMerch,
          },
        });
        this.configuration.name = newName;
        const idx = this.availableConfigurations.findIndex(c => c.id === this.configuration.id);
        if (idx !== -1) {
          this.availableConfigurations[idx] = { ...this.availableConfigurations[idx], name: newName };
        }
        this.snackbar = {
          show: true,
          message: this.t('spaceBuilderSaveSuccess').replace('{name}', newName),
          color: 'success',
          icon: 'mdi-check-circle',
          timeout: 3000,
        };
        this.renameValue = '';
      } catch (e) {
        this.snackbar = {
          show: true,
          message: this.t('spaceBuilderSaveError'),
          color: 'error',
          icon: 'mdi-alert-circle',
          timeout: 4000,
        };
      } finally {
        this.savingConfiguration = false;
      }
    },
    handleDuplicateConfiguration() {
      if (!this.configuration.id) return;
      this.configName = this.configuration.name + ' (copy)';
      // Temporarily clear the id so confirmSaveConfiguration creates a new config
      this._duplicatingFromId = this.configuration.id;
      this.configuration.id = null;
      this.showConfigNameDialog = true;
    },
    async handleDeleteConfiguration() {
      if (!this.configuration.id) return;
      this.showDeleteConfigDialog = false;
      try {
        const deletedId = this.configuration.id;
        await deleteConfiguration(deletedId);
        this.availableConfigurations = this.availableConfigurations.filter(c => c.id !== deletedId);
        this.selectedConfigId = this.availableConfigurations[0]?.id || '__create__';
        const spaceId = this.configuration.spaceId || this.$route.params.spaceId;
        if (spaceId) {
          this.$store.dispatch('spaceShops/invalidateForSpace', spaceId);
        }
        this.snackbar = {
          show: true,
          message: this.t('spaceBuilderSaveSuccess').replace('{name}', this.configuration.name),
          color: 'success',
          icon: 'mdi-check-circle',
          timeout: 3000,
        };
      } catch (e) {
        this.snackbar = {
          show: true,
          message: this.t('spaceBuilderSaveError'),
          color: 'error',
          icon: 'mdi-alert-circle',
          timeout: 4000,
        };
      }
    },
    // Construit le payload depuis this.floors et l'envoie au backend (création ou
    // mise à jour de la configuration), puis réconcilie les IDs temporaires des
    // floors avec les vrais IDs renvoyés par le serveur.
    async persistFloorsToBackend() {
      // Calculer la capacité totale (somme des capacités de tous les éléments)
      let totalCapacity = 0;
      this.floors.forEach(floor => {
        floor.elements?.forEach(element => {
          if (element.capacity) {
            totalCapacity += element.capacity;
          }
        });
      });

      // Un vrai ID backend ne commence pas par 'config-'
      const hasRealId = !!this.configuration.id && !String(this.configuration.id).startsWith('config-');
      const isUpdate = hasRealId;

      // Préparer les données de configuration
      // Pour un POST (nouvelle config ou duplication), on supprime TOUS les IDs de floors et éléments
      // Pour un PATCH (mise à jour), on garde l'ID de chaque floor, MÊME temporaire :
      // sans ID, le backend crée bien le floor mais perd ses elements (ex: shop fraîchement
      // ajouté). En renvoyant le même ID temporaire à chaque enregistrement, le backend
      // peut le retrouver et persister ses elements lors du 2e enregistrement automatique.
      // Dédupliquer par level avant envoi pour ne pas alimenter l'accumulation backend
      const uniqueFloors = (() => {
        const byLevel = new Map();
        for (const floor of this.floors) {
          const key = floor.level !== undefined ? floor.level : `nolevel-${byLevel.size}`;
          const existing = byLevel.get(key);
          const hasRealId = floor.id && !String(floor.id).startsWith('temp-');
          const existingHasRealId = existing?.id && !String(existing.id).startsWith('temp-');
          if (!existing || hasRealId || !existingHasRealId) byLevel.set(key, floor);
        }
        return [...byLevel.values()].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
      })();

      const cleanFloors = uniqueFloors.map(floor => {
        const shouldRemoveFloorId = !isUpdate;
        const floorData = shouldRemoveFloorId ? (() => {
          const { id, ...rest } = floor;
          return rest;
        })() : { ...floor };

        // Pour un POST : supprimer tous les IDs d'éléments
        // Pour un PATCH : supprimer seulement les IDs temporaires
        if (floorData.elements && Array.isArray(floorData.elements)) {
          floorData.elements = floorData.elements.map(element => {
            const isTempElement = !element.id || element.id.toString().startsWith('temp-');
            if (!isUpdate || isTempElement) {
              const { id: elementId, ...elementWithoutId } = element;
              return elementWithoutId;
            }
            return element;
          });
        }
        return floorData;
      });

      const configurationData = {
        ...(isUpdate ? { id: this.configuration.id } : {}),
        name: this.configName.trim(),
        spaceId: this.configuration.spaceId,
        capacity: totalCapacity,
        data: {
          floors: cleanFloors,
          forecourt: this.forecourt,
          externalMerch: this.externalMerch
        }
      };

      // Appeler l'API pour créer ou mettre à jour la configuration
      const response = isUpdate
        ? await updateConfiguration(this.configuration.id, configurationData)
        : await createConfiguration(configurationData);

      // Adopter les vrais IDs renvoyés par le backend (floors ET éléments). Le backend
      // renvoie désormais `data.floors` réconcilié — un floor par niveau, avec de vrais
      // IDs (cuid) — dans l'ordre d'envoi. On matche par `level` (clé métier stable)
      // plutôt que « par élimination/ordre », et on adopte les IDs d'éléments par
      // position (le backend les recrée dans l'ordre reçu). Sans cette adoption, l'état
      // local garde des IDs temporaires qui divergent des lignes relationnelles — cause
      // du bug « shops créés en Data Integration invisibles dans le builder ».
      const newlyResolvedFloors = [];
      const savedFloors = response?.data?.floors || response?.floors;
      if (Array.isArray(savedFloors) && savedFloors.length) {
        const savedByLevel = new Map();
        for (const sf of savedFloors) {
          if (sf?.id == null) continue;
          const key = sf.level !== undefined && sf.level !== null ? sf.level : null;
          if (key !== null && !savedByLevel.has(key)) savedByLevel.set(key, sf);
        }

        // Niveau du floor sélectionné, pour restaurer la sélection après changement d'ID.
        const selectedLevel = this.floors.find(f => f.id === this.selectedFloorId)?.level;
        const adoptedLevels = new Set();

        this.floors = this.floors.map(floor => {
          const saved = savedByLevel.get(floor.level);
          // Un seul floor local par niveau adopte l'ID serveur (un floor dupliqué garde
          // temporairement le même `level` ; il sera dédupliqué au prochain chargement).
          if (!saved?.id || adoptedLevels.has(floor.level)) return floor;
          adoptedLevels.add(floor.level);

          const savedEls = Array.isArray(saved.elements) ? saved.elements : [];
          const elements = (floor.elements || []).map((el, idx) =>
            savedEls[idx]?.id ? { ...el, id: savedEls[idx].id } : el,
          );
          const updated = { ...floor, id: saved.id, elements };
          if (floor.id !== saved.id) newlyResolvedFloors.push(updated);
          return updated;
        });

        // Restaurer la sélection sur le floor du même niveau (son ID a pu changer).
        if (selectedLevel !== undefined) {
          const sel = this.floors.find(f => f.level === selectedLevel);
          if (sel?.id) this.selectedFloorId = sel.id;
        }
      }

      return { response, newlyResolvedFloors };
    },
    async confirmSaveConfiguration() {
      if (!this.configName || !this.configName.trim()) {
        return;
      }

      this.showConfigNameDialog = false;
      this.savingConfiguration = true;

      try {
        // Mémoriser si la config avait déjà un vrai ID AVANT ce premier enregistrement,
        // pour savoir plus bas si on vient de créer une toute nouvelle configuration.
        const hadRealId = !!this.configuration.id && !String(this.configuration.id).startsWith('config-');

        let { response, newlyResolvedFloors } = await this.persistFloorsToBackend();

        // Mémoriser le vrai ID de configuration tout de suite : nécessaire pour qu'un
        // éventuel second envoi soit bien une mise à jour (PATCH) et non une nouvelle création.
        if (response && response.id) {
          this.configuration.id = response.id;
          this.configuration.name = response.name;
        }

        // Pour une nouvelle config (non dupliquée), estampiller les éléments qui n'ont
        // pas encore de configurationIds avec le nouvel ID — maintenant disponible —
        // avant le second enregistrement. Sans ça, le comportement legacy
        // « tableau vide = visible dans toutes les configs » s'applique et toutes les
        // configurations existantes apparaissent cochées dans le panneau Propriétés.
        if (!hadRealId && !this._duplicatingFromId && response?.id) {
          const newId = response.id;
          const stamp = (els) => (els || []).map(el =>
            (!Array.isArray(el.configurationIds) || el.configurationIds.length === 0)
              ? { ...el, configurationIds: [newId] }
              : el
          );
          this.floors = this.floors.map(f => ({ ...f, elements: stamp(f.elements) }));
          if (this.forecourt) this.forecourt = { ...this.forecourt, elements: stamp(this.forecourt.elements) };
          if (this.externalMerch) this.externalMerch = { ...this.externalMerch, elements: stamp(this.externalMerch.elements) };

          // Graduer les configs existantes : leurs éléments avec configurationIds:[]
          // (legacy "visible partout") absorberaient la nouvelle config. On les estampille
          // explicitement avec leur propre ID pour couper cette fuite.
          const otherConfigIds = this.availableConfigurations
            .map(c => c.id)
            .filter(id => id && id !== newId);
          otherConfigIds.forEach(id => this.graduateConfigElements(id));
        }

        // Un floor tout juste créé n'existe pas encore côté backend au moment de l'envoi :
        // ses éléments (ex. un shop) ne sont donc pas persistés lors de cette première création.
        // Une fois le floor reconnu avec un vrai ID, on relance un enregistrement pour que
        // ses éléments soient bien sauvegardés (évite à l'utilisateur de devoir enregistrer 2 fois).
        // Lors d'une duplication, ce second enregistrement est à la fois inutile (la création
        // initiale a déjà persisté floors + éléments avec de vrais IDs) et dangereux : le floor
        // tout juste résolu garde les éléments (et leurs IDs) de la configuration ORIGINALE,
        // et les renvoyer associés au nouveau floor crée des floors/éléments en double.
        if (!this._duplicatingFromId && newlyResolvedFloors.some(floor => (floor.elements || []).length > 0)) {
          ({ response } = await this.persistFloorsToBackend());
          if (response && response.id) {
            this.configuration.id = response.id;
            this.configuration.name = response.name;
          }
        }

        // Si on vient de dupliquer, lier les deux configurations entre elles dans
        // configurationIds (dans les deux sens) pour que les PDVs apparaissent comme
        // sélectionnés peu importe la configuration consultée.
        if (this._duplicatingFromId && response && response.id) {
          const originalId = this._duplicatingFromId;
          const newId = response.id;

          // Côté original (A) : sa donnée n'a pas été modifiée dans cet appel,
          // on peut donc la relire depuis le serveur en confiance.
          await this.addConfigurationIdToElements(originalId, newId);

          // Côté duplication (B) : on relit B fraîchement pour récupérer les
          // floors/éléments avec leurs VRAIS IDs serveur. La réponse de création
          // (`response.data.floors`) renvoie le payload tel qu'envoyé (IDs
          // supprimés) : la réutiliser créerait des floors/éléments en double.
          let newFloors = [];
          let createdForecourt = null;
          let createdExternalMerch = null;
          try {
            const created = await getConfiguration(newId);
            const createdData = created?.data || created || {};
            newFloors = this.mergeFloorsByLevel(createdData.floors || []);
            createdForecourt = createdData.forecourt || null;
            createdExternalMerch = createdData.externalMerch || null;
          } catch (e) {
            console.error('Error fetching newly created configuration:', e);
          }
          if (newFloors.length > 0 || createdForecourt || createdExternalMerch) {
            await updateConfiguration(newId, {
              name: response.name,
              spaceId: response.spaceId,
              capacity: response.capacity,
              data: {
                floors: this.addConfigIdToFloorsElements(newFloors, originalId, newId),
                forecourt: this.addConfigIdToAreaElements(createdForecourt, originalId, newId),
                externalMerch: this.addConfigIdToAreaElements(createdExternalMerch, originalId, newId),
              },
            });
          }
        }

        // Mettre à jour la liste des configurations disponibles
        if (response && response.id) {
          // Si c'était une nouvelle configuration, l'ajouter à la liste
          if (!this.availableConfigurations.find(c => c.id === response.id)) {
            this.availableConfigurations.push({
              id: response.id,
              name: response.name,
              capacity: response.capacity || 0,
            });
          } else {
            const index = this.availableConfigurations.findIndex(c => c.id === response.id);
            if (index !== -1) {
              this.availableConfigurations[index] = {
                ...this.availableConfigurations[index],
                name: response.name,
                capacity: response.capacity || 0,
              };
            }
          }

          // Recharger la config dupliquée depuis le backend pour que l'état local
          // (forecourt, externalMerch, floors) reflète les configurationIds mis à jour.
          await this.loadConfiguration(response.id);
          this._suppressNextWatcherReload = true;
          this.selectedConfigId = response.id;
          // Si selectedConfigId n'a pas changé (même ID), le watcher ne fire pas et
          // _suppressNextWatcherReload resterait true indéfiniment — ce qui supprimerait
          // le prochain changement de config. On le réinitialise au tick suivant.
          await this.$nextTick();
          this._suppressNextWatcherReload = false;
        }

        // Invalider spaceShops pour que StepMapShops et les autres vues reflètent
        // immédiatement toute modification de configurationIds ou d'éléments.
        const spaceId = this.configuration.spaceId || this.$route.params.spaceId;
        if (spaceId && response?.id) {
          this.$store.dispatch('spaceShops/invalidateForSpace', spaceId);
        }

        // Afficher un message de succès
        this.snackbar = {
          show: true,
          message: this.t('spaceBuilderSaveSuccess').replace('{name}', this.configName),
          color: 'success',
          icon: 'mdi-check-circle',
          timeout: 4000,
        };
        this.configName = '';
        this._duplicatingFromId = null;
        this.captureSavedSnapshot();

      } catch (error) {
        console.error('Error saving configuration:', error);
        // Restore id if we were duplicating and save failed
        if (this._duplicatingFromId) {
          this.configuration.id = this._duplicatingFromId;
          this._duplicatingFromId = null;
        }
        this.snackbar = {
          show: true,
          message: error?.response?.data?.message || this.t('spaceBuilderSaveError'),
          color: 'error',
          icon: 'mdi-alert-circle',
          timeout: 6000,
        };
      } finally {
        this.savingConfiguration = false;
      }
    },
    // Ajoute `configIdToAdd` dans configurationIds de chaque élément des floors
    // donnés (sans muter l'original). Utilisé pour faire apparaître un élément
    // comme présent/sélectionné dans `configIdToAdd` même en consultant une
    // autre configuration.
    addConfigIdToFloorsElements(floors, configIdToAdd, selfConfigId = null) {
      return (floors || []).map(floor => ({
        ...floor,
        elements: (floor.elements || []).map(element => {
          const configIds = new Set(element.configurationIds || []);
          configIds.add(configIdToAdd);
          if (selfConfigId) configIds.add(selfConfigId);
          return { ...element, configurationIds: [...configIds] };
        }),
      }));
    },
    addConfigIdToAreaElements(area, configIdToAdd, selfConfigId = null) {
      if (!area) return null;
      return {
        ...area,
        elements: (area.elements || []).map(element => {
          const configIds = new Set(element.configurationIds || []);
          configIds.add(configIdToAdd);
          if (selfConfigId) configIds.add(selfConfigId);
          return { ...element, configurationIds: [...configIds] };
        }),
      };
    },
    // Synchronise les configurationIds d'un élément vers les autres configurations.
    // Appelé quand l'utilisateur coche/décoche une config dans le panneau Propriétés.
    // Pour chaque config impactée, on fetch ses floors, on localise les éléments
    // portant le même nom+type, et on ajoute ou retire le configId de leur array.
    // Si l'élément n'existe pas encore dans la config cible lors d'un ajout,
    // il est copié dans le floor du même niveau (sourceElement requis).
    async syncConfigurationIdChanges(
      elementName, elementType, addedConfigIds, removedConfigIds,
      sourceElement = null, sourceViewMode = 'floor', sourceFloorLevel = null,
      sourceFloorDimensions = null,
    ) {
      const norm = (s) => (s || '').toLowerCase().trim();
      const normalName = norm(elementName);

      // Repositionne une coordonnée proportionnellement entre le floor source et le floor cible.
      // Fallback sur la valeur brute si l'une des dimensions est absente ou identique.
      const scaleCoord = (value, srcDim, dstDim) => {
        if (!srcDim || !dstDim || srcDim === dstDim) return value;
        return (value / srcDim) * dstDim;
      };

      const patchConfig = async (configId, action) => {
        try {
          const target = await getConfiguration(configId);
          const src = target?.data || target;
          const floors = this.mergeFloorsByLevel(src.floors || []);
          const forecourt = src.forecourt || null;
          const externalMerch = src.externalMerch || null;
          const matches = el => norm(el.name) === normalName && (!elementType || el.type === elementType);
          const removeEl = els => (els || []).filter(el => !matches(el));

          let patchedFloors = floors;
          let patchedForecourt = forecourt;
          let patchedExternalMerch = externalMerch;

          if (action === 'remove') {
            patchedFloors = floors.map(f => ({ ...f, elements: removeEl(f.elements) }));
            if (forecourt) patchedForecourt = { ...forecourt, elements: removeEl(forecourt.elements) };
            if (externalMerch) patchedExternalMerch = { ...externalMerch, elements: removeEl(externalMerch.elements) };
          } else if (action === 'add' && sourceElement) {
            // Vérifier si l'élément existe déjà quelque part dans la config cible
            const existsAnywhere =
              floors.some(f => (f.elements || []).some(matches)) ||
              (forecourt?.elements || []).some(matches) ||
              (externalMerch?.elements || []).some(matches);

            if (!existsAnywhere) {
              const { id: _id, ...elementWithoutId } = sourceElement;
              const configIds = new Set(sourceElement.configurationIds || []);
              configIds.add(configId);
              const newEl = { ...elementWithoutId, configurationIds: [...configIds] };

              if (sourceViewMode === 'forecourt') {
                patchedForecourt = { ...(forecourt || {}), elements: [...(forecourt?.elements || []), newEl] };
              } else if (sourceViewMode === 'externalmerch') {
                patchedExternalMerch = { ...(externalMerch || {}), elements: [...(externalMerch?.elements || []), newEl] };
              } else {
                // Chercher le floor de même level ; si absent, fallback sur le premier floor.
                const targetFloor = floors.find(f => f.level === sourceFloorLevel) ?? floors[0];
                if (targetFloor) {
                  const srcW = sourceFloorDimensions?.width;
                  const srcH = sourceFloorDimensions?.height;
                  const dstW = targetFloor.width;
                  const dstH = targetFloor.length ?? targetFloor.height;
                  const scaledEl = {
                    ...newEl,
                    ...(newEl.x != null && { x: scaleCoord(newEl.x, srcW, dstW) }),
                    ...(newEl.y != null && { y: scaleCoord(newEl.y, srcH, dstH) }),
                  };
                  patchedFloors = floors.map(f =>
                    f.id === targetFloor.id
                      ? { ...f, elements: [...(f.elements || []), scaledEl] }
                      : f
                  );
                }
              }
            }
          }

          await updateConfiguration(configId, {
            name: target.name,
            spaceId: target.spaceId,
            capacity: target.capacity,
            data: {
              floors: patchedFloors,
              forecourt: patchedForecourt,
              externalMerch: patchedExternalMerch,
            },
          });
        } catch (err) {
          console.warn(`[SpaceBuilder] syncConfigurationIdChanges (${action}) config ${configId}:`, err?.message);
        }
      };

      await Promise.all([
        ...addedConfigIds.map(id => patchConfig(id, 'add')),
        ...removedConfigIds.map(id => patchConfig(id, 'remove')),
      ]);
    },
    _healConfigurationIds(configId) {
      if (!configId) return;
      const heal = elements =>
        (elements || []).map(el => {
          const ids = el.configurationIds;
          // Cas legacy ([] = "toutes les configs") : stamper explicitement avec configId
          if (!Array.isArray(ids) || ids.length === 0) return { ...el, configurationIds: [configId] };
          if (ids.includes(configId)) return el;
          return { ...el, configurationIds: [...ids, configId] };
        });
      this.floors = this.floors.map(floor => ({ ...floor, elements: heal(floor.elements) }));
      if (this.forecourt) this.forecourt = { ...this.forecourt, elements: heal(this.forecourt.elements) };
      if (this.externalMerch) this.externalMerch = { ...this.externalMerch, elements: heal(this.externalMerch.elements) };
    },
    // `getConfiguration(id).data.floors` peut contenir, pour un même `level`,
    // plusieurs entrées : une "brute" sans IDs réels et une ou plusieurs
    // reconstructions avec de vrais IDs backend. Renvoyer toutes ces entrées
    // telles quelles lors d'un update fait grossir `data.floors` à chaque
    // enregistrement (chaque entrée sans ID provoque une nouvelle
    // reconstruction). On ne garde donc, par level, qu'une seule entrée (de
    // préférence la dernière avec de vrais IDs), en fusionnant les
    // `configurationIds` de toutes les entrées de ce level dans ses éléments
    // (par position).
    mergeFloorsByLevel(floors) {
      const byLevel = new Map();
      for (const floor of (floors || [])) {
        const key = floor.level !== undefined ? floor.level : `nolevel-${byLevel.size}`;
        if (!byLevel.has(key)) byLevel.set(key, []);
        byLevel.get(key).push(floor);
      }
      const result = [];
      for (const group of byLevel.values()) {
        const withRealId = group.filter(f => f.id && !String(f.id).startsWith('temp-'));
        const base = withRealId.length > 0 ? withRealId[withRealId.length - 1] : group[group.length - 1];
        const others = group.filter(f => f !== base);
        const elements = (base.elements || []).map((element, index) => {
          const configIds = new Set(element.configurationIds || []);
          for (const other of others) {
            for (const id of ((other.elements || [])[index]?.configurationIds || [])) {
              configIds.add(id);
            }
          }
          return configIds.size > 0 ? { ...element, configurationIds: [...configIds] } : element;
        });
        result.push({ ...base, elements });
      }
      // Tri décroissant : floor le plus récent (level le plus élevé) en tête
      return result.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
    },
    // Pour chaque élément de `configId` dont configurationIds est vide (legacy),
    // le remplace par [configId]. Appelé sur toutes les configs existantes lors
    // de la création d'une nouvelle config pour éviter que le comportement
    // « vide = visible partout » ne fasse apparaître les éléments legacy comme
    // cochés dans la nouvelle configuration.
    async graduateConfigElements(configId) {
      try {
        const target = await getConfiguration(configId);
        const dataSource = target.data || target;
        const floors = this.mergeFloorsByLevel(dataSource.floors || []);
        const forecourt = dataSource.forecourt || null;
        const externalMerch = dataSource.externalMerch || null;
        if (floors.length === 0 && !forecourt && !externalMerch) return;

        const needsGraduation = (els) =>
          (els || []).some(el => !Array.isArray(el.configurationIds) || el.configurationIds.length === 0);

        const hasAny = floors.some(f => needsGraduation(f.elements))
          || needsGraduation(forecourt?.elements)
          || needsGraduation(externalMerch?.elements);
        if (!hasAny) return;

        const graduate = (els) => (els || []).map(el =>
          (!Array.isArray(el.configurationIds) || el.configurationIds.length === 0)
            ? { ...el, configurationIds: [configId] }
            : el
        );

        await updateConfiguration(configId, {
          name: target.name,
          spaceId: target.spaceId,
          capacity: target.capacity,
          data: {
            floors: floors.map(f => ({ ...f, elements: graduate(f.elements) })),
            forecourt: forecourt ? { ...forecourt, elements: graduate(forecourt.elements) } : null,
            externalMerch: externalMerch ? { ...externalMerch, elements: graduate(externalMerch.elements) } : null,
          },
        });
      } catch (error) {
        console.error('[graduateConfigElements] Error for', configId, error);
      }
    },

    // Récupère la configuration `targetConfigId` (fetch + update) et ajoute
    // `configIdToAdd` dans configurationIds de chacun de ses éléments. Utilisé
    // après une duplication pour la configuration qui n'a PAS été modifiée dans
    // cet appel (sa donnée côté serveur est donc fiable à relire).
    async addConfigurationIdToElements(targetConfigId, configIdToAdd) {
      try {
        const target = await getConfiguration(targetConfigId);
        const dataSource = target.data || target;
        const floors = this.mergeFloorsByLevel(dataSource.floors || []);
        const forecourt = dataSource.forecourt || null;
        const externalMerch = dataSource.externalMerch || null;
        // Ne rien écraser si la réponse est vraiment vide (aucune zone).
        if (floors.length === 0 && !forecourt && !externalMerch) return;

        await updateConfiguration(targetConfigId, {
          name: target.name,
          spaceId: target.spaceId,
          capacity: target.capacity,
          data: {
            floors: this.addConfigIdToFloorsElements(floors, configIdToAdd, targetConfigId),
            forecourt: this.addConfigIdToAreaElements(forecourt, configIdToAdd, targetConfigId),
            externalMerch: this.addConfigIdToAreaElements(externalMerch, configIdToAdd, targetConfigId),
          },
        });
      } catch (error) {
        console.error('Error adding configuration id to elements:', error);
      }
    },
    async loadConfiguration(configId) {
      if (!configId || configId === '__create__') return;

      this.loadingConfigurations = true;
      try {
        const configData = await getConfiguration(configId);

        this.configuration.id = configData.id;
        this.configuration.name = configData.name;
        this.configuration.capacity = configData.capacity;
        
        // Charger les floors et autres données
        const dataSource = configData.data || configData;
        const normalizeZone = (z) => z ? { width: 50, length: 50, ...z } : null
        this.forecourt = normalizeZone(dataSource.forecourt)
        this.externalMerch = normalizeZone(dataSource.externalMerch)

        // Dédupliquer par level (clé métier) : le backend peut accumuler des copies de floors
        // (ex. une copie sans ID issue du PATCH et l'originale avec ID issue du POST).
        // On garde l'ID et les éléments du floor ayant un vrai ID backend, mais on fusionne
        // le hole en prenant celui dont enabled=true pour ne pas perdre la configuration du trou.
        const byLevel = new Map();
        for (const floor of (dataSource.floors || [])) {
          const key = floor.level !== undefined ? floor.level : `nolevel-${byLevel.size}`;
          const existing = byLevel.get(key);

          if (!existing) {
            byLevel.set(key, floor);
            continue;
          }

          const hasRealId = floor.id && !String(floor.id).startsWith('temp-');
          const existingHasRealId = existing?.id && !String(existing.id).startsWith('temp-');

          if (hasRealId || !existingHasRealId) {
            // Ce floor est une meilleure base (vrai ID), mais si l'existant avait le hole activé
            // et que ce floor ne l'a pas, on conserve le hole de l'existant.
            const hole = (existing.hole?.enabled && !floor.hole?.enabled) ? existing.hole : floor.hole;
            byLevel.set(key, { ...floor, hole });
          } else if (floor.hole?.enabled && !existing.hole?.enabled) {
            // L'existant reste la base mais ce floor a le hole activé → on le fusionne.
            byLevel.set(key, { ...existing, hole: floor.hole });
          }
        }
        const baseTs = Date.now();
        this.floors = [...byLevel.values()]
          .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
          .map((floor, floorIdx) => {
            const id = floor.id || `temp-${baseTs}-f${floorIdx}`;
            const level = this.inferFloorLevel(floor, floorIdx);
            const elements = (floor.elements || []).map((el, elIdx) => {
              const base = el.id ? el : { ...el, id: `temp-${baseTs}-f${floorIdx}-e${elIdx}` };
              // Stamper localement les éléments legacy (configurationIds: []) avec l'ID
              // de la configuration courante pour que isInConfig() affiche correctement
              // les coches sans attendre une sauvegarde.
              if (!Array.isArray(base.configurationIds) || base.configurationIds.length === 0) {
                return { ...base, configurationIds: [configId] };
              }
              return base;
            });
            return { ...floor, id, level, elements };
          });

        // Stamp forecourt/externalMerch legacy elements
        const stampArea = (area) => {
          if (!area) return area;
          return {
            ...area,
            elements: (area.elements || []).map(el =>
              (!Array.isArray(el.configurationIds) || el.configurationIds.length === 0)
                ? { ...el, configurationIds: [configId] }
                : el
            ),
          };
        };
        this.forecourt = stampArea(this.forecourt);
        this.externalMerch = stampArea(this.externalMerch);

        // Sélectionner le premier floor si disponible
        if (this.floors.length > 0) {
          this.selectedFloorId = this.floors[0].id;
          this.viewMode = 'floor';
        }

        this.captureSavedSnapshot();
      } catch (error) {
        console.error('Error loading configuration:', error);
        this.snackbar = {
          show: true,
          message: this.t('spaceBuilderLoadError'),
          color: 'error',
          icon: 'mdi-alert-circle',
          timeout: 4000,
        };
      } finally {
        this.loadingConfigurations = false;
      }
    },
    async loadFloors() {
      if (!this.configuration.id) return;

      this.loadingFloors = true;
      try {
        const configData = await getConfiguration(this.configuration.id);
        // Extraire les floors depuis configuration.data.floors
        const nz = (z) => z ? { width: 50, length: 50, ...z } : null
        this.floors = configData?.data?.floors || [];
        this.forecourt = nz(configData?.data?.forecourt)
        this.externalMerch = nz(configData?.data?.externalMerch)
        
        // Sélectionner le premier floor si disponible
        if (this.floors.length > 0 && !this.selectedFloorId) {
          this.selectedFloorId = this.floors[0].id;
          this.viewMode = 'floor';
        }
      } catch (error) {
        console.error('Error loading configuration:', error);
        // Si aucune configuration n'existe, on laisse les tableaux vides
        this.floors = [];
        this.forecourt = null;
        this.externalMerch = null;
      } finally {
        this.loadingFloors = false;
      }
    },
  },
  async mounted() {
    this.$store.dispatch('spaces/fetchSpaces');
    await this.fetchSpace();
    const newShop = this.$route.query.newShop
    if (newShop) {
      this.snackbar = {
        show: true,
        message: `Shop "${decodeURIComponent(newShop)}" créé — dessinez-le sur le plan depuis la palette à gauche.`,
        color: 'deep-purple',
        icon: 'mdi-cube-outline',
        timeout: 8000,
      }
    }
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  },
  activated() {
    this._headerVisible = true;
    const spaceId = this.$route.params.spaceId;
    if (!spaceId) return;
    if (spaceId === this.space?.id) {
      // Retour sur le même space depuis une autre route (ex. liste → builder) :
      // le watcher $route.params.spaceId ne se déclenche pas car la valeur n'a pas changé.
      // On rafraîchit uniquement la liste des configurations pour ne pas perdre l'état de l'éditeur.
      this.refreshConfigsForCurrentSpace();
    }
    // Si le spaceId diffère de this.space?.id, le watcher $route.params.spaceId
    // se charge du reset + rechargement complet (il se déclenche au réveil du composant).
  },
  deactivated() {
    this._headerVisible = false;
  },
  beforeUnmount() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  },
  async beforeRouteLeave(to, from, next) {
    if (!this.hasUnsavedChanges) {
      next();
      return;
    }
    const result = await leaveDialog({
      title: this.t('spaceBuilderUnsavedTitle'),
      message: this.t('spaceBuilderUnsavedConfirmLeave'),
      leaveText: this.t('spaceBuilderLeaveWithoutSaving'),
      saveText: this.t('spaceBuilderSaveAndLeave'),
      cancelText: this.t('cancel'),
    });
    if (result === false) {
      next(false);
    } else if (result === 'leave') {
      next(true);
    } else {
      // 'save' — sauvegarde puis navigation
      if (this.configuration.id) {
        this.configName = this.configName || this.configuration.name;
        await this.confirmSaveConfiguration();
        next(true);
      } else {
        // Nouvelle config sans nom : ouvre le dialog de nom et reste sur la page
        this.handleSaveConfiguration();
        next(false);
      }
    }
  },
};
</script>

<style scoped>
.space-builder {
  height: calc(100vh - 64px);
  overflow: hidden;
}

/* App Bar Styling */
.toolbar-title {
  animation: fadeInLeft 0.6s ease-out;
  display: flex;
  align-items: center;
}

/* Sidebars */
.left-sidebar,
.right-sidebar {
  transition: all 0.3s ease;
  border: none !important;
}

.left-sidebar {
  box-shadow: 4px 0 12px rgba(0, 0, 0, 0.05);
}

/* Left sidebar layout: floors shrink to natural height, palette scrolls in remaining space */
.left-sidebar :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.left-sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.left-sidebar-floors {
  flex-shrink: 0;
}

.left-sidebar-palette {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}

.right-sidebar {
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.05);
}

/* Main Container */
.main-container {
  animation: fadeIn 0.5s ease-out;
}

/* Cards */
.elevation-card,
.floor-plan-card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(255, 49, 49, 0.08);
}

.elevation-card:hover,
.floor-plan-card:hover {
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
}

/* Empty States */
.empty-state {
  animation: fadeInUp 0.6s ease-out;
}

.empty-state v-icon {
  animation: pulse 2s ease-in-out infinite;
}

/* Grid Canvas */
.grid-canvas {
  border: 2px solid rgba(255, 49, 49, 0.1);
  border-radius: 12px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
  cursor: crosshair;
  transition: all 0.3s ease;
}

.grid-canvas:hover {
  border-color: rgba(255, 49, 49, 0.3);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.grid-svg {
  display: block;
}

.element-rect {
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.element-rect:hover {
  opacity: 0.8;
  transform: scale(1.02);
}

.canvas-3d {
  background: rgb(var(--v-theme-surface-variant, var(--v-theme-surface)));
  border-radius: 12px;
  padding: 24px;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.05);
}

/* Animations */
@keyframes fadeInLeft {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.6;
  }
}


</style>