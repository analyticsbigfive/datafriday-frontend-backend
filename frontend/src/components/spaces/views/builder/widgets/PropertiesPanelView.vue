<template>
  <div class="d-flex flex-column properties-panel">
    <!-- Header with Image -->
    <div v-if="element.image" class="position-relative" style="height: 192px; overflow: hidden;">
      <img
        :src="element.image"
        :alt="element.name"
        class="w-100 h-100"
        style="object-fit: cover;"
      />
      <div class="position-absolute top-0 start-0 end-0 bottom-0" style="background: linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0.3), transparent);" />
      <div class="position-absolute top-0 start-0 end-0 p-3">
        <div class="d-flex align-items-start justify-content-between">
          <div class="flex-grow-1">
            <div class="text-white-50 small mb-1">{{ getTypeLabel(element.type) }}</div>
            <input
              type="text"
              class="form-control border-0 bg-transparent text-white shadow-none p-0 fw-semibold"
              style="font-size: 18px; outline: none;"
              :value="formData.name"
              @input="handleUpdate('name', $event.target.value)"
            />
          </div>
          <div class="d-flex gap-1 ms-2">
            <v-btn
              icon
              size="x-small"
              variant="text"
              class="text-white"
              @click="$refs.fileInputRef && $refs.fileInputRef.click()"
            >
              <Camera :size="16" />
            </v-btn>
            <v-btn
              icon
              size="x-small"
              variant="text"
              class="text-white"
              @click="handleRemoveImage"
            >
              <X :size="16" />
            </v-btn>
            <v-btn
              icon
              size="x-small"
              variant="text"
              class="text-white"
              @click="onDuplicate && onDuplicate()"
            >
              <Copy :size="16" />
            </v-btn>
            <v-btn
              icon
              size="x-small"
              variant="text"
              class="text-white"
              @click="deleteDialogOpen = true"
            >
              <Trash2 :size="16" />
            </v-btn>
          </div>
        </div>
      </div>
    </div>

    <!-- Header without Image -->
    <div v-else class="px-2 py-4 border-bottom">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div class="d-flex align-items-center gap-2">
          <v-avatar :color="getTypeColor(element.type)" size="40" rounded="lg">
            <v-icon :icon="getTypeIcon(element.type)" size="20" color="white" />
          </v-avatar>
          <div>
            <div class="text-medium-emphasis text-caption">{{ getTypeLabel(element.type) }}</div>
            <div class="fw-bold">{{ t('ppProperties') }}</div>
          </div>
        </div>
        <div class="d-flex align-items-center gap-1">
          <v-btn
            v-if="onClose"
            icon
            size="small"
            variant="text"
            @click="onClose && onClose()"
          >
            <X :size="18" />
          </v-btn>
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="d-flex gap-2">
        <v-btn
          size="small"
          variant="elevated"
          color="surface"
          rounded="lg"
          class="flex-fill"
          @click="$refs.fileInputRef && $refs.fileInputRef.click()"
        >
          <Upload :size="16" class="me-2" />
          {{ t('ppImage') }}
        </v-btn>
        <v-btn
          size="small"
          variant="elevated"
          color="surface"
          rounded="lg"
          class="flex-fill"
          @click="onDuplicate && onDuplicate()"
        >
          <Copy :size="16" class="me-2" />
          {{ t('ppDuplicate') }}
        </v-btn>
        <v-btn
          size="small"
          variant="elevated"
          color="error"
          rounded="lg"
          @click="deleteDialogOpen = true"
        >
          <Trash2 :size="16" />
        </v-btn>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      class="d-none"
      @change="handleImageUpload"
    />

    <!-- Scrollable Content -->
    <div :style="{ background: scrollAreaBg, paddingBottom: '4rem' }">
      <!-- Name Field (only when no image) -->
      <div v-if="!element.image" class="pa-4 pb-2">
        <v-card rounded="xl" elevation="0" class="pa-4" :style="cardBorderStyle">
          <div>
            <label for="pp-name" class="form-label small fw-medium mb-1">{{ t('ppElementName') }}</label>
            <input
              id="pp-name"
              type="text"
              class="form-control form-control-sm rounded-3"
              :value="formData.name"
              placeholder=" "
              @input="handleUpdate('name', $event.target.value)"
            />
          </div>
        </v-card>
      </div>

      <!-- Shop Type Section -->
      <div v-if="element.type === 'shop'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div 
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('shopType')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-store" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppShopType') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.shopType }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.shopType" class="pa-4">
              <v-checkbox
                v-for="opt in shopTypeOptions"
                :key="opt.value"
                density="compact"
                hide-details
                color="primary"
                :label="opt.label"
                :model-value="(element.shopType || []).includes(opt.value)"
                @update:model-value="(checked) => toggleArrayProp('shopType', opt.value, checked)"
              />
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Zone Section (alimente shopArea pour l'analytique : filtre « Zones » + donut « By area ») -->
      <div v-if="['shop', 'entertainment', 'kitchen'].includes(element.type)" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" class="pa-4" :style="cardBorderStyle">
          <div>
            <label for="pp-zone" class="form-label small fw-medium mb-1">Zone</label>
            <input
              id="pp-zone"
              type="text"
              class="form-control form-control-sm rounded-3"
              list="pp-zone-list"
              :value="formData.area"
              placeholder=" "
              @input="handleUpdateArea($event.target.value)"
              @change="handleUpdateArea($event.target.value)"
            />
          </div>
          <datalist id="pp-zone-list">
            <option v-for="a in availableAreas" :key="a" :value="a" />
          </datalist>
        </v-card>
      </div>

      <!-- Hospitality Type Section -->
      <div v-if="element.type === 'hospitality'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('hospitalityType')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-silverware-fork-knife" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppHospitalityType') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.hospitalityType }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.hospitalityType" class="pa-4">
              <div class="d-flex flex-wrap gap-2">
                <v-chip
                  v-for="opt in hospitalityTypeOptions"
                  :key="opt.value"
                  rounded="pill"
                  size="small"
                  :color="(element.hospitalityType || []).includes(opt.value) ? 'primary' : undefined"
                  :variant="(element.hospitalityType || []).includes(opt.value) ? 'flat' : 'tonal'"
                  class="cursor-pointer"
                  @click="toggleArrayProp('hospitalityType', opt.value, !(element.hospitalityType || []).includes(opt.value))"
                >{{ opt.label }}</v-chip>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Shops Selection - for Storage elements (early position, before Storage Type) -->
      <div v-if="element.type === 'storage' && relatedFBElements.length" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('shops')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-store-outline" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppShops') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.shops }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.shops" class="pa-4">
              <div class="text-medium-emphasis small mb-3">{{ t('ppShopsDesc') }}</div>
              <div class="d-flex flex-column gap-2">
                <v-checkbox
                  v-for="fbElement in relatedFBElements"
                  :key="fbElement.id"
                  density="compact"
                  hide-details
                  color="primary"
                  :label="fbElement.name"
                  :model-value="(element.selectedShops && element.selectedShops.includes(fbElement.id)) || false"
                  @update:model-value="(checked) => {
                    const currentShops = element.selectedShops || [];
                    const newShops = checked
                      ? [...currentShops, fbElement.id]
                      : currentShops.filter((id) => id !== fbElement.id);
                    onUpdate && onUpdate({ selectedShops: newShops });
                  }"
                />
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Storage Type Section -->
      <div v-if="element.type === 'storage'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('storageType')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-warehouse" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppStorageType') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.storageType }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.storageType" class="pa-4">
              <div class="d-flex flex-wrap gap-2">
                <v-chip
                  v-for="opt in storageTypeOptions"
                  :key="opt.value"
                  rounded="pill"
                  size="small"
                  :color="(element.storageType || []).includes(opt.value) ? 'primary' : undefined"
                  :variant="(element.storageType || []).includes(opt.value) ? 'flat' : 'tonal'"
                  class="cursor-pointer"
                  @click="toggleArrayProp('storageType', opt.value, !(element.storageType || []).includes(opt.value))"
                >{{ opt.label }}</v-chip>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Merch Type Section -->
      <div v-if="element.type === 'merchshop'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('merchType')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-shopping-outline" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppMerchType') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.merchType }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.merchType" class="pa-4">
              <div class="d-flex flex-wrap gap-2">
                <v-chip
                  v-for="opt in merchTypeOptions"
                  :key="opt.value"
                  rounded="pill"
                  size="small"
                  :color="(element.merchType || []).includes(opt.value) ? 'primary' : undefined"
                  :variant="(element.merchType || []).includes(opt.value) ? 'flat' : 'tonal'"
                  class="cursor-pointer"
                  @click="toggleArrayProp('merchType', opt.value, !(element.merchType || []).includes(opt.value))"
                >{{ opt.label }}</v-chip>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Access Type Section -->
      <div v-if="element.type === 'access'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('accessType')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-door-open" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppAccessType') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.accessType }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.accessType" class="pa-4">
              <div class="d-flex flex-wrap gap-2">
                <v-chip
                  v-for="opt in accessTypeOptions"
                  :key="opt.value"
                  rounded="pill"
                  size="small"
                  :color="(element.accessType || []).includes(opt.value) ? 'primary' : undefined"
                  :variant="(element.accessType || []).includes(opt.value) ? 'flat' : 'tonal'"
                  class="cursor-pointer"
                  @click="toggleArrayProp('accessType', opt.value, !(element.accessType || []).includes(opt.value))"
                >{{ opt.label }}</v-chip>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Entertainment Type Section -->
      <div v-if="element.type === 'entertainment'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('entertainmentType')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-music" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppEntertainmentType') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.entertainmentType }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.entertainmentType" class="pa-4">
              <div class="d-flex flex-wrap gap-2">
                <v-chip
                  v-for="opt in entertainmentTypeOptions"
                  :key="opt.value"
                  rounded="pill"
                  size="small"
                  :color="(element.entertainmentType || []).includes(opt.value) ? 'primary' : undefined"
                  :variant="(element.entertainmentType || []).includes(opt.value) ? 'flat' : 'tonal'"
                  class="cursor-pointer"
                  @click="toggleArrayProp('entertainmentType', opt.value, !(element.entertainmentType || []).includes(opt.value))"
                >{{ opt.label }}</v-chip>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Entrance Type Section -->
      <div v-if="element.type === 'entrance'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('entranceType')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-ticket-outline" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppTicketingType') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.entranceType }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.entranceType" class="pa-4">
              <div class="d-flex flex-wrap gap-2">
                <v-chip
                  v-for="opt in entranceTypeOptions"
                  :key="opt.value"
                  rounded="pill"
                  size="small"
                  :color="(element.entranceType || []).includes(opt.value) ? 'primary' : undefined"
                  :variant="(element.entranceType || []).includes(opt.value) ? 'flat' : 'tonal'"
                  class="cursor-pointer"
                  @click="toggleArrayProp('entranceType', opt.value, !(element.entranceType || []).includes(opt.value))"
                >{{ opt.label }}</v-chip>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Kitchen Type Section -->
      <div v-if="element.type === 'kitchen'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('kitchenType')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-chef-hat" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppKitchenType') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.kitchenType }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.kitchenType" class="pa-4">
              <div class="d-flex flex-wrap gap-2">
                <v-chip
                  v-for="opt in kitchenTypeOptions"
                  :key="opt.value"
                  rounded="pill"
                  size="small"
                  :color="(element.kitchenType || []).includes(opt.value) ? 'primary' : undefined"
                  :variant="(element.kitchenType || []).includes(opt.value) ? 'flat' : 'tonal'"
                  class="cursor-pointer"
                  @click="toggleArrayProp('kitchenType', opt.value, !(element.kitchenType || []).includes(opt.value))"
                >{{ opt.label }}</v-chip>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Configuration Section -->
      <div v-if="configurations && configurations.length > 0 && element.type !== 'storage' && element.type !== 'entrance' && element.type !== 'access'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('configuration')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-cog-outline" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppConfiguration') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.configuration }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.configuration" class="pa-4">
              <div class="text-medium-emphasis small mb-2">{{ t('ppConfigurationDesc') }}</div>
              <div class="d-flex flex-column gap-1">
                <div
                  v-for="config in configurations"
                  :key="config.id"
                  class="d-flex align-center"
                  style="min-height: 36px;"
                >
                  <template v-if="syncingConfigIds.includes(config.id)">
                    <v-progress-circular indeterminate size="18" width="2" color="primary" class="mr-2" />
                    <span class="text-body-2 text-medium-emphasis">{{ config.name }}<span v-if="config.id === currentConfigId"> {{ t('ppCurrent') }}</span></span>
                  </template>
                  <v-checkbox
                    v-else
                    density="compact"
                    hide-details
                    color="primary"
                    :label="config.name + (config.id === currentConfigId ? ' ' + t('ppCurrent') : '')"
                    :model-value="isInConfig(config.id)"
                    :disabled="config.id === currentConfigId"
                    @update:model-value="(checked) => handleConfigToggle(config, checked)"
                  />
                </div>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Performance Section -->
      <div v-if="!['storage', 'entertainment', 'access', 'kitchen'].includes(element.type)" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('performance')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-chart-line" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppPerformanceMetrics') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.performance }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.performance" class="pa-3 pp-fields">
              <div class="d-flex gap-2 mb-2">
                <div class="flex-fill">
                  <label for="pp-revenue" class="form-label small fw-medium mb-1">{{ t('ppRevenue') }}</label>
                  <input id="pp-revenue" type="number" class="form-control form-control-sm" :value="performance.revenue" @input="handleUpdatePerformance('revenue', parseFloat($event.target.value) || 0)" />
                </div>
                <div class="flex-fill">
                  <label for="pp-npos" class="form-label small fw-medium mb-1">{{ t('ppNumberOfPOS') }}</label>
                  <input id="pp-npos" type="number" class="form-control form-control-sm" :value="performance.numberOfPOS" @input="handleUpdatePerformance('numberOfPOS', parseFloat($event.target.value) || 0)" />
                </div>
              </div>
              <div class="d-flex gap-2 mb-2">
                <div class="flex-fill">
                  <label for="pp-ntx" class="form-label small fw-medium mb-1">{{ t('ppTransactions') }}</label>
                  <input id="pp-ntx" type="number" class="form-control form-control-sm" :value="performance.numberOfTransactions" @input="handleUpdatePerformance('numberOfTransactions', parseFloat($event.target.value) || 0)" />
                </div>
                <div class="flex-fill">
                  <label for="pp-txpm" class="form-label small fw-medium mb-1">{{ t('ppTransPerMin') }}</label>
                  <input id="pp-txpm" type="number" class="form-control form-control-sm" :value="performance.transactionsPerMinute" @input="handleUpdatePerformance('transactionsPerMinute', parseFloat($event.target.value) || 0)" />
                </div>
              </div>
              <div class="d-flex gap-2">
                <div class="flex-fill">
                  <label for="pp-scost" class="form-label small fw-medium mb-1">{{ t('ppStaffCost') }}</label>
                  <input id="pp-scost" type="number" class="form-control form-control-sm" :value="performance.staffCost" @input="handleUpdatePerformance('staffCost', parseFloat($event.target.value) || 0)" />
                </div>
                <div class="flex-fill">
                  <label for="pp-rpe" class="form-label small fw-medium mb-1">{{ t('ppRevPerEmployee') }}</label>
                  <input id="pp-rpe" type="number" class="form-control form-control-sm" :value="performance.revenuePerEmployee" @input="handleUpdatePerformance('revenuePerEmployee', parseFloat($event.target.value) || 0)" />
                </div>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Menu Section for shop and hospitality -->
      <div v-if="element.type === 'shop' || element.type === 'hospitality'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div 
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('menu')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-food" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppMenu') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.menu }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.menu" class="pa-4">
          <template v-if="availableMenuItems.length > 0">
            <!-- Search Input -->
            <div class="mi-search mb-3">
              <Search style="width: 15px; height: 15px; opacity: 0.5; flex-shrink: 0;" />
              <input
                v-model="menuSearchQuery"
                type="text"
                class="mi-search__input"
                :placeholder="t('ppSearchMenuItems')"
              />
            </div>

            <!-- Menu Items List -->
            <div class="mi-list">
              <template v-if="getFilteredMenuItems(menuSearchQuery).length > 0">
                <div
                  v-for="item in getFilteredMenuItems(menuSearchQuery)"
                  :key="item.id"
                  class="mi-card"
                >
                  <img
                    v-if="item.picture"
                    :src="item.picture"
                    :alt="item.name"
                    class="mi-card__img"
                  />
                  <div class="mi-card__body">
                    <div class="mi-card__top">
                      <span class="mi-card__name">{{ item.name }}</span>
                      <span v-if="item.type" class="mi-card__badge">{{ item.type }}</span>
                    </div>
                    <div v-if="item.category" class="mi-card__sub">{{ item.category }}</div>
                    <div v-if="getDisplayPrice(item) > 0" class="mi-card__price">
                      €{{ getDisplayPrice(item).toFixed(2) }}
                    </div>
                  </div>
                </div>
              </template>
              <div v-else class="text-center py-4 border border-dashed rounded">
                <p class="text-medium-emphasis small mb-0">
                  {{ t('ppNoMenuItemsQuery') }} "{{ menuSearchQuery }}"
                </p>
              </div>
            </div>
          </template>
              <div v-else class="text-center py-4 border border-dashed rounded">
                <p class="text-medium-emphasis small mb-2">{{ t('ppNoMenuItemsConfigured') }}</p>
                <p class="text-medium-emphasis" style="font-size: 11px;">
                  {{ t('ppGoToSpaceMenusConfigure') }}
                </p>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Inventory Section - Consolidated View -->
      <div v-if="['shop', 'hospitality', 'merchshop', 'storage', 'entrance', 'kitchen'].includes(element.type)" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('inventory')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-package-variant" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppInventory') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.inventory }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.inventory" class="pa-4">
          <!-- Search Input -->
          <div class="input-group input-group-sm mb-2">
            <span class="input-group-text bg-transparent border-end-0">
              <Search style="width: 14px; height: 14px; opacity: 0.5;" />
            </span>
            <input
              v-model="inventorySearchQuery"
              type="text"
              class="form-control form-control-sm border-start-0"
              :placeholder="t('ppSearchInventory')"
            />
          </div>

          <!-- Consolidated Inventory View -->
          <template v-if="availableMenuItems.length > 0 && allMenuItems.length > 0">
            <div class="mb-3">
              <p class="text-medium-emphasis small mb-2">{{ t('ppInventoryItems') }}</p>
              <div style="max-height: 384px; overflow-y: auto;">
                <div
                  v-for="inventoryItem in getFilteredConsolidatedInventory(inventorySearchQuery)"
                  :key="inventoryItem.id"
                  class="p-2 mb-2 rounded"
                  style="background-color: rgb(var(--v-theme-surface-variant, var(--v-theme-surface)));"
                >
                  <!-- Main inventory item -->
                  <div class="d-flex align-items-center gap-2 mb-2">
                    <span class="small flex-grow-1">{{ inventoryItem.name }}</span>
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      :value="getExistingInventoryItem(inventoryItem)?.quantity || ''"
                      placeholder="0.0"
                      style="width: 80px;"
                      @input="handleConsolidatedQuantityChange(inventoryItem, parseFloat($event.target.value) || 0)"
                    />
                  </div>

                  <!-- Stock level indicator -->
                  <div v-if="getExistingInventoryItem(inventoryItem)?.quantity" class="d-flex align-items-center gap-2 mb-2">
                    <span class="small text-medium-emphasis" style="width: 48px; font-size: 11px;">
                      {{ getInventoryStockInfo(inventoryItem).currentStock }}
                    </span>
                    <div class="flex-grow-1 rounded-pill overflow-hidden" style="height: 16px; background: linear-gradient(to right, #ff3131, #f97316, #22c55e);">
                      <div
                        class="h-100"
                        :style="{
                          marginLeft: getInventoryStockInfo(inventoryItem).stockPercentage + '%',
                          transition: 'margin-left 0.3s ease',
                        }"
                      />
                    </div>
                  </div>

                  <!-- Show which menu items use this inventory item -->
                  <div
                    v-if="inventoryItem.usedIn && inventoryItem.usedIn.length > 0"
                    class="ps-2 border-start border-primary border-2 ms-1"
                  >
                    <p class="small fw-medium text-primary mb-1" style="font-size: 11px;">{{ t('ppUsedIn') }}</p>
                    <div
                      v-for="menuItem in inventoryItem.usedIn"
                      :key="menuItem.id"
                      class="d-flex align-items-center gap-2 ps-2 mb-1"
                    >
                      <img
                        v-if="menuItem.picture"
                        :src="menuItem.picture"
                        :alt="menuItem.name"
                        class="rounded"
                        style="width: 20px; height: 20px; object-fit: cover;"
                      />
                      <p class="small mb-0" style="font-size: 11px;">• {{ menuItem.name }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Custom Inventory Items -->
            <div class="border-top pt-2">
              <p class="text-medium-emphasis small mb-2">{{ t('ppCustomInventoryItems') }}</p>
              <div v-if="getFilteredCustomInventoryItems(inventorySearchQuery).length > 0" style="max-height: 240px; overflow-y: auto;">
                <div
                  v-for="item in getFilteredCustomInventoryItems(inventorySearchQuery)"
                  :key="item.id"
                  class="p-2 mb-2 rounded"
                >
                  <div class="d-flex align-items-center gap-2 mb-2">
                    <span class="small flex-grow-1">{{ item.name }}</span>
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      :value="item.quantity || ''"
                      placeholder="0.0"
                      style="width: 80px;"
                      @input="handleUpdateInventoryItemQuantity(item.id, parseFloat($event.target.value) || 0)"
                    />
                    <v-btn icon size="x-small" variant="text" @click="handleDeleteInventoryItem(item.id)">
                      <X :size="14" class="text-danger" />
                    </v-btn>
                  </div>
                  <div class="d-flex align-items-center gap-2">
                    <span class="small text-medium-emphasis" style="width: 48px; font-size: 11px;">
                      {{ Math.floor((item.quantity || 0) * 0.6) }}
                    </span>
                    <div class="flex-grow-1 rounded-pill overflow-hidden" style="height: 16px; background: linear-gradient(to right, #ff3131, #f97316, #22c55e);">
                      <div
                        class="h-100"
                        :style="{
                          marginLeft: (item.quantity ? (Math.floor((item.quantity || 0) * 0.6) / item.quantity) * 100 : 0) + '%',
                          transition: 'margin-left 0.3s ease',
                        }"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="text-medium-emphasis small text-center py-2">{{ t('ppNoCustomInventory') }}</p>
            </div>
          </template>

          <!-- Fallback when no menu items -->
          <template v-else>
            <p class="text-medium-emphasis small text-center py-4">{{ t('ppNoInventory') }}</p>
          </template>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Staff Section - Conditional for shop/hospitality/entertainment/access -->
      <div 
        v-if="['shop', 'hospitality', 'entertainment', 'merchshop', 'entrance', 'access', 'kitchen'].includes(element.type)"
        class="px-2 mb-2"
      >
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div 
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('staff')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-account-group" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppStaffManagement') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.staff }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.staff" class="pa-3">
              <div class="d-flex gap-2 mb-3">
                <input
                  v-model="newStaffPosition"
                  type="text"
                  class="form-control form-control-sm flex-grow-1"
                  :placeholder="t('ppStaffPositionPlaceholder')"
                  @keydown.enter.prevent="handleAddStaffPosition"
                />
                <input
                  v-model.number="newStaffCount"
                  type="number"
                  class="form-control form-control-sm"
                  placeholder="#"
                  style="width: 68px;"
                  @keydown.enter.prevent="handleAddStaffPosition"
                />
                <v-btn
                  size="small"
                  color="primary"
                  variant="flat"
                  rounded="lg"
                  icon
                  :disabled="!newStaffPosition.trim() || newStaffCount < 1"
                  @click="handleAddStaffPosition"
                >
                  <Plus :size="16" />
                </v-btn>
              </div>
              <div v-if="staffPositions.length === 0" class="text-center py-4">
                <v-icon icon="mdi-account-off" size="48" color="grey-lighten-2" class="mb-2" />
                <div class="text-medium-emphasis small">{{ t('ppNoStaffPositions') }}</div>
                <div class="text-caption text-medium-emphasis">{{ t('ppAddStaffHint') }}</div>
              </div>
              <div v-else class="d-flex flex-column gap-2">
                <v-card
                  v-for="pos in staffPositions"
                  :key="pos.id"
                  rounded="lg"
                  elevation="0"
                  class="pa-3"
                  :style="metricCardStyle"
                >
                  <div class="d-flex align-items-center gap-3">
                    <v-avatar color="blue-lighten-4" size="32" rounded="lg">
                      <v-icon icon="mdi-account" size="16" color="primary" />
                    </v-avatar>
                    <span class="flex-grow-1 fw-medium" style="font-size: 13px;">{{ pos.position }}</span>
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      :value="pos.count"
                      style="width: 70px;"
                      @input="handleUpdateStaffPositionCount(pos.id, parseInt($event.target.value) || 1)"
                    />
                    <v-btn icon size="small" variant="text" color="error" @click="handleDeleteStaffPosition(pos.id)">
                      <X :size="16" />
                    </v-btn>
                  </div>
                </v-card>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Position Section -->
      <div class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderStyle">
          <div 
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('position')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-vector-square" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppPositionDimensions') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.position }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.position" class="pa-3 pp-fields">
              <div class="mb-3">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <v-icon icon="mdi-crosshairs-gps" size="16" color="primary" />
                  <span class="fw-semibold text-high-emphasis" style="font-size: 12px;">{{ t('ppPosition') }}</span>
                </div>
                <div class="d-flex gap-2">
                  <div class="flex-fill">
                    <label class="form-label small fw-medium mb-1">{{ t('ppXMeters') }}</label>
                    <div class="input-group input-group-sm">
                      <input type="number" class="form-control form-control-sm" :value="formData.x" @input="handleUpdate('x', parseFloat($event.target.value) || 0)" />
                      <span class="input-group-text">m</span>
                    </div>
                  </div>
                  <div class="flex-fill">
                    <label class="form-label small fw-medium mb-1">{{ t('ppYMeters') }}</label>
                    <div class="input-group input-group-sm">
                      <input type="number" class="form-control form-control-sm" :value="formData.y" @input="handleUpdate('y', parseFloat($event.target.value) || 0)" />
                      <span class="input-group-text">m</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="mb-3">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <v-icon icon="mdi-ruler" size="16" color="primary" />
                  <span class="fw-semibold text-high-emphasis" style="font-size: 12px;">{{ t('ppDimensions') }}</span>
                </div>
                <div class="d-flex gap-2 mb-2">
                  <div class="flex-fill">
                    <label class="form-label small fw-medium mb-1">{{ t('ppWidthMeters') }}</label>
                    <div class="input-group input-group-sm">
                      <input type="number" class="form-control form-control-sm" :value="formData.width" @input="handleUpdate('width', parseFloat($event.target.value) || 0)" />
                      <span class="input-group-text">m</span>
                    </div>
                  </div>
                  <div class="flex-fill">
                    <label class="form-label small fw-medium mb-1">{{ t('ppDepthMeters') }}</label>
                    <div class="input-group input-group-sm">
                      <input type="number" class="form-control form-control-sm" :value="formData.depth" @input="handleUpdate('depth', parseFloat($event.target.value) || 0)" />
                      <span class="input-group-text">m</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label class="form-label small fw-medium mb-1">{{ t('ppHeightMeters') }}</label>
                  <div class="input-group input-group-sm">
                    <input type="number" class="form-control form-control-sm" :value="formData.height" @input="handleUpdate('height', parseFloat($event.target.value) || 0)" />
                    <span class="input-group-text">m</span>
                  </div>
                </div>
              </div>

              <!-- Corner Radius -->
              <v-divider class="my-4" />
              <div>
                <div class="d-flex align-items-center justify-content-between mb-3">
                  <div class="d-flex align-items-center gap-2">
                    <v-icon icon="mdi-border-radius" size="18" color="primary" />
                    <span class="fw-semibold text-high-emphasis" style="font-size: 13px;">{{ t('ppCornerRadius') }}</span>
                  </div>
                  <v-btn
                    size="small"
                    variant="flat"
                    rounded="lg"
                    :color="linkedCorners ? 'primary' : 'grey-lighten-2'"
                    @click="linkedCorners = !linkedCorners"
                  >
                    <Link v-if="linkedCorners" :size="16" color="white" />
                    <Unlink v-else :size="16" />
                  </v-btn>
                </div>
                
                <!-- All Corners (when linked) -->
                <div v-if="linkedCorners">
                  <label class="form-label small fw-medium mb-1">{{ t('ppAllCorners') }}</label>
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    :value="formData.cornerRadius.topLeft"
                    placeholder="0"
                    @input="handleCornerRadiusChange('topLeft', parseFloat($event.target.value) || 0)"
                  />
                </div>

                <!-- Individual Corners (when unlinked) -->
                <div v-else>
                  <div class="d-flex gap-2 mb-2">
                    <div class="flex-fill">
                      <label class="form-label small fw-medium mb-1">{{ t('ppTopLeft') }}</label>
                      <input type="number" class="form-control form-control-sm" :value="formData.cornerRadius.topLeft" placeholder="0" @input="handleCornerRadiusChange('topLeft', parseFloat($event.target.value) || 0)" />
                    </div>
                    <div class="flex-fill">
                      <label class="form-label small fw-medium mb-1">{{ t('ppTopRight') }}</label>
                      <input type="number" class="form-control form-control-sm" :value="formData.cornerRadius.topRight" placeholder="0" @input="handleCornerRadiusChange('topRight', parseFloat($event.target.value) || 0)" />
                    </div>
                  </div>
                  <div class="d-flex gap-2">
                    <div class="flex-fill">
                      <label class="form-label small fw-medium mb-1">{{ t('ppBottomLeft') }}</label>
                      <input type="number" class="form-control form-control-sm" :value="formData.cornerRadius.bottomLeft" placeholder="0" @input="handleCornerRadiusChange('bottomLeft', parseFloat($event.target.value) || 0)" />
                    </div>
                    <div class="flex-fill">
                      <label class="form-label small fw-medium mb-1">{{ t('ppBottomRight') }}</label>
                      <input type="number" class="form-control form-control-sm" :value="formData.cornerRadius.bottomRight" placeholder="0" @input="handleCornerRadiusChange('bottomRight', parseFloat($event.target.value) || 0)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Floor Area and Volume -->
      <div v-if="!['storage', 'entrance', 'entertainment', 'access', 'kitchen'].includes(element.type)" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" class="pa-4" :style="cardBorderStyle">
          <div class="d-flex align-items-center gap-2 mb-3">
            <v-icon icon="mdi-calculator" size="18" color="primary" />
            <span class="fw-semibold text-high-emphasis" style="font-size: 13px;">{{ t('ppCalculations') }}</span>
          </div>
          <div class="d-flex gap-3">
            <div class="flex-fill text-center pa-3 rounded-lg" :style="metricCardStyle">
              <div class="text-medium-emphasis small mb-1">{{ t('ppFloorArea') }}</div>
              <div class="fw-bold" :style="{ fontSize: '18px', color: metricValueColor }">{{ ((formData.width || 0) * (formData.depth || 0)).toFixed(2) }} m²</div>
            </div>
            <div v-if="element.type !== 'parking'" class="flex-fill text-center pa-3 rounded-lg" :style="metricCardStyle">
              <div class="text-medium-emphasis small mb-1">{{ t('ppVolume') }}</div>
              <div class="fw-bold" :style="{ fontSize: '18px', color: metricValueColor }">{{ ((formData.width || 0) * (formData.depth || 0) * (formData.height || 0)).toFixed(2) }} m³</div>
            </div>
          </div>
        </v-card>
      </div>

      <!-- Shops Selection - for Shop (F&B) elements -->
      <div v-if="element.type === 'shop' && relatedFBElements.length" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('shops')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-store-outline" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppShops') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.shops }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.shops" class="pa-4">
              <div class="text-medium-emphasis small mb-3">{{ element.type === 'storage' ? t('ppShopsDesc') : t('ppShopsDescShop') }}</div>
              <div class="d-flex flex-column gap-2">
                <v-checkbox
                  v-for="fbElement in relatedFBElements"
                  :key="fbElement.id"
                  density="compact"
                  hide-details
                  color="primary"
                  :label="fbElement.name"
                  :model-value="(element.selectedShops && element.selectedShops.includes(fbElement.id)) || false"
                  @update:model-value="(checked) => {
                    const currentShops = element.selectedShops || [];
                    const newShops = checked
                      ? [...currentShops, fbElement.id]
                      : currentShops.filter((id) => id !== fbElement.id);
                    onUpdate && onUpdate({ selectedShops: newShops });
                  }"
                />
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Shops Selection - for Kitchen (F&B) elements -->
      <div v-if="element.type === 'kitchen' && (element.kitchenType || []).includes('fb') && relatedFoodBeverageShops.length" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('shops')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-store-outline" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppShops') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.shops }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.shops" class="pa-4">
              <div class="text-medium-emphasis small mb-3">{{ t('ppShopsDescKitchen') }}</div>
              <div class="d-flex flex-column gap-2">
                <v-checkbox
                  v-for="fbElement in relatedFoodBeverageShops"
                  :key="fbElement.id"
                  density="compact"
                  hide-details
                  color="primary"
                  :label="fbElement.name"
                  :model-value="(element.selectedShops && element.selectedShops.includes(fbElement.id)) || false"
                  @update:model-value="(checked) => {
                    const currentShops = element.selectedShops || [];
                    const newShops = checked
                      ? [...currentShops, fbElement.id]
                      : currentShops.filter((id) => id !== fbElement.id);
                    onUpdate && onUpdate({ selectedShops: newShops });
                  }"
                />
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>

      <!-- Items Section for merchshop -->
      <div v-if="element.type === 'merchshop'" class="px-2 mb-2">
        <v-card rounded="xl" elevation="0" :style="cardBorderOverflowStyle">
          <div
            class="pa-4 d-flex align-items-center justify-content-between cursor-pointer border-bottom"
            @click="toggleSection('items')"
          >
            <div class="d-flex align-items-center gap-2">
              <v-icon icon="mdi-format-list-bulleted" size="20" color="primary" />
              <span class="fw-semibold text-high-emphasis" style="font-size: 14px;">{{ t('ppItems') }}</span>
            </div>
            <ChevronDown :size="18" class="text-medium-emphasis transition-transform" :class="{ 'rotate-180': openSections.items }" />
          </div>
          <v-expand-transition>
            <div v-if="openSections.items" class="pa-3">
              <div class="d-flex gap-2 mb-3">
                <input
                  v-model="newMenuItem"
                  type="text"
                  class="form-control form-control-sm flex-grow-1"
                  :placeholder="t('ppItemsPlaceholder')"
                  @keydown.enter.prevent="handleAddMenuItem"
                />
                <v-btn
                  size="small"
                  color="primary"
                  variant="flat"
                  rounded="lg"
                  icon
                  :disabled="!newMenuItem.trim()"
                  @click="handleAddMenuItem"
                >
                  <Plus :size="16" />
                </v-btn>
              </div>
              <div v-if="menuItems.length === 0" class="text-center py-4">
                <v-icon icon="mdi-format-list-bulleted-square" size="40" color="grey-lighten-2" class="mb-2" />
                <div class="text-medium-emphasis small">{{ t('ppNoItems') }}</div>
              </div>
              <div v-else class="d-flex flex-column gap-2">
                <v-card
                  v-for="item in menuItems"
                  :key="item.id"
                  rounded="lg"
                  elevation="0"
                  class="pa-3"
                  :style="metricCardStyle"
                >
                  <div class="d-flex align-items-center gap-3">
                    <span class="flex-grow-1 fw-medium" style="font-size: 13px;">{{ item.name }}</span>
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      :value="item.quantity"
                      style="width: 80px;"
                      @input="handleUpdateMenuItemQuantity(item.id, parseFloat($event.target.value) || 0)"
                    />
                    <v-btn icon size="small" variant="text" color="error" @click="handleDeleteMenuItem(item.id)">
                      <X :size="16" />
                    </v-btn>
                  </div>
                </v-card>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>
    </div>

    <!-- Delete Dialog -->
    <v-dialog v-model="deleteDialogOpen" max-width="400">
      <v-card>
        <v-card-title class="text-body-1 fw-semibold">{{ t('ppDeleteTitle') }}</v-card-title>
        <v-card-text>
          <div class="small text-medium-emphasis">{{ t('ppDeleteDesc') }}</div>
          <v-checkbox
            v-model="keepHistoricalData"
            :label="t('ppKeepHistoricalData')"
            density="compact"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialogOpen = false">{{ t('cancel') }}</v-btn>
          <v-btn color="error" variant="flat" @click="onDelete(keepHistoricalData)">{{ t('delete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import { useTheme } from 'vuetify';
import { useI18n } from '@/i18n/useI18n';
import {
  Trash2,
  Plus,
  X,
  Copy,
  Upload,
  Camera,
  Link,
  Unlink,
  ChevronDown,
  Search,
} from 'lucide-vue-next';

import { expandInventoryItems, buildConsolidatedInventory } from '@/utils/inventoryUtils';
import * as api from '@/utils/api';

export default {
  name: 'PropertiesPanelView',
  components: {
    Trash2,
    Plus,
    X,
    Copy,
    Upload,
    Camera,
    Link,
    Unlink,
    ChevronDown,
    Search,
  },
  setup() {
    const { global: vuetifyTheme } = useTheme();
    const { t } = useI18n();
    return { vuetifyTheme, t };
  },
  props: {
    element: { type: Object, required: true },
    configurations: { type: Array, default: () => [] },
    currentConfigId: { type: [String, null], default: null },
    allShopMenuItems: { type: Array, default: () => [] },
    allMerchShopItems: { type: Array, default: () => [] },
    availableMenuItems: { type: Array, default: () => [] },
    allFBElements: { type: Array, default: () => [] },
    currentSpace: { type: Object, default: null },
    onUpdate: { type: Function, required: true },
    onDelete: { type: Function, required: true },
    onDuplicate: { type: Function, required: true },
    onClose: { type: Function, default: null },
    syncingConfigIds: { type: Array, default: () => [] },
    availableAreas: { type: Array, default: () => [] },
  },
  data() {
    return {
      deleteDialogOpen: false,
      keepHistoricalData: true,
      openSections: {
        inventory: true,
        staff: false,
        position: true,
        shopType: false,
        storageType: false,
        hospitalityType: false,
        merchType: false,
        accessType: false,
        entertainmentType: false,
        entranceType: false,
        kitchenType: false,
        performance: false,
        menu: false,
        items: false,
        configuration: false,
        shops: false,
      },
      searchInventory: '',
      menuSearchQuery: '',
      inventorySearchQuery: '',
      formData: {
        name: this.element.name,
        // Zone d'implantation : lue depuis attributes.area (source analytique)
        // avec repli sur un éventuel champ top-level area.
        area: this.element.attributes?.area ?? this.element.area ?? '',
        x: this.element.x || 0,
        y: this.element.y || 0,
        width: this.element.width || 0,
        depth: this.element.depth || 0,
        height: this.element.height || 0,
        cornerRadius: this.element.cornerRadius || {
          topLeft: 0,
          topRight: 0,
          bottomLeft: 0,
          bottomRight: 0,
        },
        configurationIds: this.element.configurationIds || [],
      },
      menuItems: this.element.menuItems || [],
      newMenuItem: '',
      inventoryItems: this.element.inventoryItems || [],
      newInventoryItem: '',
      performance: this.element.performance || {},
      staffPositions: this.element.staffPositions || [],
      newStaffPosition: '',
      newStaffCount: 1,
      linkedCorners: true,
      allMenuItems: [],
      shopTypeOptions: [
        { value: 'food', label: 'Food' },
        { value: 'beverages', label: 'Beverages' },
        { value: 'beer', label: 'Beer' },
        { value: 'gppremium', label: 'GP Premium' },
        { value: 'temporary', label: 'Temporary' },
        { value: 'drinkee', label: 'Drinkee' },
      ],
      storageTypeOptions: [
        { value: 'dry', label: 'Dry storage' },
        { value: 'cold', label: 'Cold storage' },
        { value: 'belowzero', label: 'Below zero storage' },
        { value: 'material', label: 'Material storage' },
        { value: 'merch', label: 'Merch storage' },
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
    };
  },
  created() {
    const cr = this.element.cornerRadius;
    if (cr) {
      const allSame =
        cr.topLeft === cr.topRight &&
        cr.topLeft === cr.bottomLeft &&
        cr.topLeft === cr.bottomRight;
      this.linkedCorners = allSame;
    } else {
      this.linkedCorners = true;
    }
    this.loadAllMenuItems();
  },
  mounted() {
    this._handleMenuItemsChanged = () => {
      console.log('PropertiesPanelView: Menu items changed, reloading...');
      this.loadAllMenuItems();
    };
    window.addEventListener('menuItemsChanged', this._handleMenuItemsChanged);
  },
  beforeUnmount() {
    if (this._handleMenuItemsChanged) {
      window.removeEventListener('menuItemsChanged', this._handleMenuItemsChanged);
    }
  },
  watch: {
    element: {
      deep: true,
      handler(newEl) {
        this.formData = {
          name: newEl.name,
          x: newEl.x || 0,
          y: newEl.y || 0,
          width: newEl.width || 0,
          depth: newEl.depth || 0,
          height: newEl.height || 0,
          cornerRadius: newEl.cornerRadius || {
            topLeft: 0,
            topRight: 0,
            bottomLeft: 0,
            bottomRight: 0,
          },
          configurationIds: newEl.configurationIds || [],
        };
        this.menuItems = newEl.menuItems || [];
        this.inventoryItems = newEl.inventoryItems || [];
        this.performance = newEl.performance || {};
        this.staffPositions = newEl.staffPositions || [];
      },
    },
  },
  computed: {
    isDark() {
      return this.vuetifyTheme?.current.value.dark ?? false;
    },
    cardBorderStyle() {
      return { border: `1px solid ${this.isDark ? '#334155' : '#e2e8f0'}` };
    },
    cardBorderOverflowStyle() {
      return { border: `1px solid ${this.isDark ? '#334155' : '#e2e8f0'}`, overflow: 'hidden' };
    },
    scrollAreaBg() {
      return this.isDark
        ? 'linear-gradient(to bottom, #1e293b 0%, #0f172a 100%)'
        : 'linear-gradient(to bottom, #f8fafc 0%, #f1f5f9 100%)';
    },
    metricCardStyle() {
      return {
        background: this.isDark ? '#1e293b' : '#f1f5f9',
        border: `1px solid ${this.isDark ? '#334155' : '#cbd5e1'}`,
      };
    },
    metricValueColor() {
      return this.isDark ? '#94a3b8' : '#475569';
    },
    relatedFBElements() {
      return (this.allFBElements || []).filter(fbElement => fbElement.id !== this.element.id);
    },
    relatedFoodBeverageShops() {
      return (this.allFBElements || []).filter(fbElement =>
        fbElement.id !== this.element.id &&
        Array.isArray(fbElement.shopType) &&
        (fbElement.shopType.includes('food') || fbElement.shopType.includes('beverages'))
      );
    },
  },
  methods: {
    toggleSection(section) {
      this.openSections[section] = !this.openSections[section];
    },
    isInConfig(configId) {
      // La config courante est toujours cochée (verrouillée dans le template)
      if (configId === this.currentConfigId) return true;
      const ids = this.formData.configurationIds;
      // Rétrocompat : tableau vide = visible dans toutes les configs
      if (!Array.isArray(ids) || ids.length === 0) return true;
      return ids.includes(configId);
    },
    handleConfigToggle(config, checked) {
      // La config courante est disabled dans le template — garde-fou
      if (config.id === this.currentConfigId) return;

      const currentIds = this.formData.configurationIds;
      // Rétrocompat : matérialiser le cas "toutes les configs" avant le toggle
      const allIds = this.configurations.map(c => c.id);
      const explicitIds = currentIds.length === 0 ? [...allIds] : [...currentIds];

      const newIds = checked
        ? [...new Set([...explicitIds, config.id])]
        : explicitIds.filter(id => id !== config.id);

      // La config courante doit toujours rester dans le tableau
      if (this.currentConfigId && !newIds.includes(this.currentConfigId)) {
        newIds.push(this.currentConfigId);
      }

      // Mise à jour optimiste locale pour que le checkbox réagisse immédiatement
      this.formData = { ...this.formData, configurationIds: newIds };
      this.onUpdate({ configurationIds: newIds });
    },
    confirmDelete() {
      this.deleteDialogOpen = false;
      this.onDelete && this.onDelete(this.keepHistoricalData);
    },
    handleUpdate(key, value) {
      this.formData = { ...this.formData, [key]: value };
      this.onUpdate({ [key]: value });
    },
    // Zone d'implantation du shop. Persistée dans attributes.area (consommé par
    // l'analytique via shopArea → filtre « Zones » + donut « By area ») ET en
    // top-level `area` par robustesse selon la sérialisation backend de
    // saveConfiguration (qui spread element.attributes).
    handleUpdateArea(value) {
      const attributes = { ...(this.element.attributes || {}), area: value };
      this.formData = { ...this.formData, area: value };
      this.onUpdate({ area: value, attributes });
    },
    handleUpdatePerformance(key, value) {
      const updated = { ...this.performance, [key]: value };
      this.performance = updated;
      this.onUpdate({ performance: updated });
    },
    handleCornerRadiusChange(corner, value) {
      let newCornerRadius;
      if (this.linkedCorners) {
        newCornerRadius = {
          topLeft: value,
          topRight: value,
          bottomLeft: value,
          bottomRight: value,
        };
      } else {
        newCornerRadius = {
          ...this.formData.cornerRadius,
          [corner]: value,
        };
      }
      this.formData = { ...this.formData, cornerRadius: newCornerRadius };
      this.onUpdate({ cornerRadius: newCornerRadius });
    },
    toggleArrayProp(prop, value, checked) {
      const current = this.element[prop] || [];
      const updated = checked
        ? Array.from(new Set([...current, value]))
        : current.filter((t) => t !== value);
      this.onUpdate({ [prop]: updated });
    },
    handleAddMenuItem() {
      if (!this.newMenuItem.trim()) return;
      const newItem = {
        id: Date.now().toString(),
        name: this.newMenuItem.trim(),
        quantity: 0,
      };
      const updated = [...this.menuItems, newItem];
      this.menuItems = updated;
      this.onUpdate({ menuItems: updated });
      this.newMenuItem = '';
    },
    handleDeleteMenuItem(itemId) {
      const updated = this.menuItems.filter((i) => i.id !== itemId);
      this.menuItems = updated;
      this.onUpdate({ menuItems: updated });
    },
    handleUpdateMenuItemQuantity(itemId, quantity) {
      const updated = this.menuItems.map((i) => (i.id === itemId ? { ...i, quantity } : i));
      this.menuItems = updated;
      this.onUpdate({ menuItems: updated });
    },
    handleAddInventoryItem() {
      if (!this.newInventoryItem.trim()) return;
      const newItem = {
        id: Date.now().toString(),
        name: this.newInventoryItem.trim(),
        quantity: 0,
      };
      const updated = [...this.inventoryItems, newItem];
      this.inventoryItems = updated;
      this.onUpdate({ inventoryItems: updated });
      this.newInventoryItem = '';
    },
    handleDeleteInventoryItem(itemId) {
      const updated = this.inventoryItems.filter((i) => i.id !== itemId);
      this.inventoryItems = updated;
      this.onUpdate({ inventoryItems: updated });
    },
    handleUpdateInventoryItemQuantity(itemId, quantity) {
      const updated = this.inventoryItems.map((i) => (i.id === itemId ? { ...i, quantity } : i));
      this.inventoryItems = updated;
      this.onUpdate({ inventoryItems: updated });
    },
    handleAddStaffPosition() {
      if (!this.newStaffPosition.trim() || this.newStaffCount < 1) return;
      const position = {
        id: Date.now().toString(),
        position: this.newStaffPosition.trim(),
        count: this.newStaffCount,
      };
      const updated = [...this.staffPositions, position];
      this.staffPositions = updated;
      this.onUpdate({ staffPositions: updated });
      this.newStaffPosition = '';
      this.newStaffCount = 2;
    },
    handleDeleteStaffPosition(positionId) {
      const updated = this.staffPositions.filter((p) => p.id !== positionId);
      this.staffPositions = updated;
      this.onUpdate({ staffPositions: updated });
    },
    handleUpdateStaffPositionCount(positionId, count) {
      const updated = this.staffPositions.map((p) =>
        p.id === positionId ? { ...p, count } : p,
      );
      this.staffPositions = updated;
      this.onUpdate({ staffPositions: updated });
    },
    handleImageUpload(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        this.onUpdate({ image: reader.result });
      };
      reader.readAsDataURL(file);
    },
    handleRemoveImage() {
      this.onUpdate({ image: undefined });
    },
    getTypeLabel(type) {
      switch (type) {
        case 'shop': return 'Shop';
        case 'storage': return 'Storage Area';
        case 'entrance': return 'Ticket Entrance';
        case 'hospitality': return 'Hospitality';
        case 'merchshop': return 'Merch Shop';
        case 'access': return 'Access';
        case 'entertainment': return 'Entertainment';
        case 'kitchen': return 'Kitchen';
        default: return type;
      }
    },
    getTypeIcon(type) {
      // Retourne le nom de l'icône Material Design Icons pour chaque type
      const icons = {
        shop: 'mdi-store',
        storage: 'mdi-warehouse',
        entrance: 'mdi-door-open',
        hospitality: 'mdi-food-fork-drink',
        merchshop: 'mdi-shopping',
        access: 'mdi-gate',
        entertainment: 'mdi-theater',
        kitchen: 'mdi-chef-hat',
      };
      return icons[type] || 'mdi-cube-outline';
    },
    getTypeColor(type) {
      const colors = {
        shop: '#10b981',
        storage: '#f59e0b',
        entrance: '#ff3131',
        hospitality: '#ec4899',
        merchshop: '#a0522d',
        access: '#64748b',
        entertainment: '#8b5cf6',
        kitchen: '#f97316',
      };
      return colors[type] || '#6b7280';
    },
    getTypeBadgeStyle(type) {
      const colors = {
        shop: { bg: '#10b981', text: '#fff' },
        storage: { bg: '#f59e0b', text: '#fff' },
        entrance: { bg: '#ff3131', text: '#fff' },
        hospitality: { bg: '#ec4899', text: '#fff' },
        merchshop: { bg: '#a0522d', text: '#fff' },
        access: { bg: '#64748b', text: '#fff' },
        entertainment: { bg: '#8b5cf6', text: '#fff' },
        kitchen: { bg: '#f97316', text: '#fff' },
      };
      const color = colors[type] || { bg: '#6b7280', text: '#fff' };
      return {
        backgroundColor: color.bg,
        color: color.text,
      };
    },
    getFilteredMenuItems(query) {
      if (!query || !query.trim()) return this.availableMenuItems || [];
      const q = query.toLowerCase();
      return (this.availableMenuItems || []).filter(item => 
        item.name?.toLowerCase().includes(q) || 
        item.category?.toLowerCase().includes(q) ||
        item.type?.toLowerCase().includes(q)
      );
    },
    getDisplayPrice(item) {
      if (!item) return 0;
      if (item.spaceSpecificPrices && Array.isArray(item.spaceSpecificPrices) && this.currentSpace) {
        const rule = item.spaceSpecificPrices.find(priceRule =>
          priceRule.spaceIds && priceRule.spaceIds.includes(this.currentSpace.id)
        );
        if (rule && rule.price !== undefined) return rule.price;
      }
      return item.basePrice || item.price || 0;
    },
    async loadAllMenuItems() {
      try {
        const items = await api.getAllMenuItems();
        this.allMenuItems = items || [];
      } catch (error) {
        console.error('PropertiesPanelView: Error loading menu items:', error);
        this.allMenuItems = [];
      }
    },
    getConsolidatedInventory() {
      if (!this.availableMenuItems || this.availableMenuItems.length === 0) return [];
      if (!this.allMenuItems || this.allMenuItems.length === 0) return [];
      return buildConsolidatedInventory(this.availableMenuItems, this.allMenuItems);
    },
    getFilteredConsolidatedInventory(query) {
      const consolidated = this.getConsolidatedInventory();
      if (!query || !query.trim()) return consolidated;
      const lower = query.toLowerCase();
      return consolidated.filter(item =>
        item.name.toLowerCase().includes(lower) ||
        (item.usedIn && item.usedIn.some(mi => mi.name.toLowerCase().includes(lower)))
      );
    },
    getExistingInventoryItem(consolidatedItem) {
      return this.inventoryItems.find(item => item.id === consolidatedItem.id);
    },
    getInventoryStockInfo(consolidatedItem) {
      const existing = this.getExistingInventoryItem(consolidatedItem);
      const quantity = existing?.quantity || 0;
      const currentStock = Math.floor(quantity * 0.6);
      const stockPercentage = quantity > 0 ? (currentStock / quantity) * 100 : 0;
      return { currentStock, stockPercentage };
    },
    handleConsolidatedQuantityChange(consolidatedItem, quantity) {
      const existing = this.getExistingInventoryItem(consolidatedItem);
      if (existing) {
        const updated = this.inventoryItems.map(item =>
          item.id === consolidatedItem.id ? { ...item, quantity } : item
        );
        this.inventoryItems = updated;
        this.onUpdate({ inventoryItems: updated });
      } else {
        const newItem = {
          id: consolidatedItem.id,
          name: consolidatedItem.name,
          quantity,
        };
        const updated = [...this.inventoryItems, newItem];
        this.inventoryItems = updated;
        this.onUpdate({ inventoryItems: updated });
      }
    },
    getFilteredCustomInventoryItems(query) {
      const consolidated = this.getConsolidatedInventory();
      const consolidatedIds = consolidated.map(item => item.id);
      const custom = this.inventoryItems.filter(item => !consolidatedIds.includes(item.id));
      if (!query || !query.trim()) return custom;
      const lower = query.toLowerCase();
      return custom.filter(item => item.name.toLowerCase().includes(lower));
    },
    getAllInventorySearchableItems() {
      const searchable = [];
      this.availableMenuItems.forEach(menuItem => {
        searchable.push({
          id: menuItem.id,
          name: menuItem.name,
          type: 'menu-item',
        });
        if (this.allMenuItems.length > 0 && menuItem.readyForSale === 'No' && menuItem.components) {
          const rawComponents = menuItem.components.filter(c => c.itemType === 'Component');
          const rawIngredients = menuItem.components.filter(c => c.itemType === 'Ingredient');
          if (rawComponents.length > 0) {
            const toExpand = rawComponents.map(c => ({ name: c.name, id: c.id }));
            const expanded = expandInventoryItems(toExpand, this.allMenuItems);
            expanded.forEach(comp => {
              if (!searchable.find(item => item.id === comp.id)) {
                searchable.push({
                  id: comp.id,
                  name: comp.name,
                  type: 'component',
                  source: menuItem.name,
                });
              }
            });
          }
          rawIngredients.forEach(ing => {
            if (!searchable.find(item => item.id === ing.id)) {
              searchable.push({
                id: ing.id,
                name: ing.name,
                type: 'ingredient',
                source: menuItem.name,
              });
            }
          });
        }
      });
      this.inventoryItems.forEach(item => {
        if (!this.availableMenuItems.find(mi => mi.id === item.id)) {
          if (!searchable.find(si => si.id === item.id)) {
            searchable.push({
              id: item.id,
              name: item.name,
              type: 'component',
            });
          }
        }
      });
      return searchable;
    },
    getFilteredInventoryItems(query) {
      const allItems = this.getAllInventorySearchableItems();
      if (!query || !query.trim()) return allItems;
      const lower = query.toLowerCase();
      return allItems.filter(item =>
        item.name.toLowerCase().includes(lower) ||
        (item.source || '').toLowerCase().includes(lower)
      );
    },
  },
};
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}

/* Menu items list (design aligné sur la capture builder2 MenuSection) */
.mi-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 12px;
  padding: 10px 14px;
}
.mi-search__input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: 14px;
  color: inherit;
  min-width: 0;
}
.mi-search__input::placeholder { opacity: 0.5; }

.mi-list {
  max-height: 360px;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* marge pour que la barre de défilement ne colle pas aux cartes */
  margin-right: -4px;
  padding-right: 4px;
}
.mi-list::-webkit-scrollbar { width: 6px; }
.mi-list::-webkit-scrollbar-track { background: transparent; }
.mi-list::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 3px;
}
.mi-list::-webkit-scrollbar-thumb:hover { background: rgba(var(--v-theme-on-surface), 0.32); }
.mi-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.03);
}
.mi-card__img {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.mi-card__body { flex: 1; min-width: 0; }
.mi-card__top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mi-card__name {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}
.mi-card__badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 100px;
  background: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
  white-space: nowrap;
}
.mi-card__sub {
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-top: 2px;
}
.mi-card__price {
  font-size: 14px;
  font-weight: 600;
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

/* Champs stylés — sections Performance & Position/Dimensions */
.pp-fields .form-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 5px;
}
.pp-fields .form-control {
  border-radius: 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-on-surface), 0.02);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  color: rgb(var(--v-theme-on-surface));
  box-shadow: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.pp-fields .form-control:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.24);
}
.pp-fields .form-control:focus {
  outline: none;
  border-color: #ff3131;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}

/* Input-group avec suffixe (m) */
.pp-fields .input-group { flex-wrap: nowrap; }
.pp-fields .input-group .form-control {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}
.pp-fields .input-group .form-control:focus {
  box-shadow: none;
}
.pp-fields .input-group-text {
  border-radius: 0 10px 10px 0;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-left: none;
  background: rgba(var(--v-theme-on-surface), 0.05);
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.5);
  padding: 0 12px;
}
.pp-fields .input-group:focus-within .form-control,
.pp-fields .input-group:focus-within .input-group-text {
  border-color: #ff3131;
}
.pp-fields .input-group:focus-within {
  border-radius: 10px;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}

/* Retire les flèches natives des champs number */
.pp-fields input[type='number']::-webkit-outer-spin-button,
.pp-fields input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.pp-fields input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.rotate-180 {
  transform: rotate(180deg);
}

.transition-transform {
  transition: transform 0.2s ease;
}

.hover-bg:hover {
  background-color: rgb(var(--v-theme-surface-variant, var(--v-theme-surface)));
}

/* Unified input styling across the whole panel */
.properties-panel >>> .v-field--variant-outlined {
  border-radius: 10px;
  background-color: rgb(var(--v-theme-surface));
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.properties-panel >>> .v-field--variant-outlined .v-field__outline {
  --v-field-border-opacity: 0.6;
}

.properties-panel >>> .v-field--variant-outlined.v-field--focused {
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.12);
}

.properties-panel >>> .v-field__input {
  font-size: 13px;
}

.properties-panel >>> .v-field--density-compact .v-field__input {
  min-height: 36px;
}

.properties-panel >>> .v-label {
  font-size: 12px;
}

/* Unified checkbox styling across the panel */
.properties-panel >>> .v-selection-control {
  align-items: flex-start;
  min-height: 28px;
}

.properties-panel >>> .v-selection-control__wrapper {
  margin-top: 2px;
}

.properties-panel >>> .v-selection-control .v-label {
  font-size: 12px;
  line-height: 1.3;
  white-space: normal;
}

.properties-title-field >>> .v-field__input {
  color: white !important;
  font-weight: 600;
}

.properties-title-field >>> input::placeholder {
  color: rgba(255, 255, 255, 0.7) !important;
}

/* Smooth scrollbar */
.overflow-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-auto::-webkit-scrollbar-track {
  background: rgb(var(--v-theme-surface));
}

.overflow-auto::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 3px;
}

.overflow-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-on-surface), 0.35);
}
</style>
