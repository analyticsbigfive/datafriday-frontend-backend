<template>
  <div class="sms-wrap" :class="{ 'sms--dark': isDark }">

    <!-- ── Gradient Header ── -->
    <div class="sms-header">
      <div class="sms-header__icon"><Store :size="22" color="white" /></div>
      <div class="sms-header__body">
        <p class="sms-header__title">
          {{ t('smsTitle') }}
          <span class="sms-header__step">— {{ t('intgShopsStep2') }}</span>
        </p>
        <p class="sms-header__sub">{{ t('smsSubtitle') }}</p>
      </div>
      <span class="sms-prog-badge" :class="mappedCount === locations.length && locations.length > 0 ? 'sms-prog-badge--green' : 'sms-prog-badge--gray'">
        {{ mappedCount }}/{{ locations.length }} {{ t('smsMappedChip') }}
      </span>
    </div>

    <!-- ── Loading ── -->
    <div v-if="loading" class="sms-skeletons">
      <div v-for="i in 5" :key="i" class="sms-skeleton-row"></div>
    </div>
    

    <!-- ── Empty ── -->
    <div v-else-if="!locations.length" class="sms-empty-state">
      <div class="sms-empty-state__icon"><Store :size="26" /></div>
      <!-- Digifood : les PDV n'existent qu'après les premières ventes webhook →
           proposer l'amorçage par import CSV (étape « 1bis » du flux Digifood) -->
      <template v-if="location?.type === 'digifood'">
        <p class="sms-empty-state__text">{{ t('diDigifoodNoLocationsHint') }}</p>
        <button class="sms-csv-btn" @click="$emit('request-csv-import')">
          <v-icon size="15" class="mr-1">mdi-file-delimited-outline</v-icon>
          {{ t('diDigifoodImportCsv') }}
        </button>
      </template>
      <p v-else class="sms-empty-state__text">{{ t('smsNoMerchants') }}</p>
    </div>

    <template v-else>

      <!-- ── Auto-suggestion banner ── -->
      <div v-if="autoSuggestionCount > 0" class="sms-banner sms-banner--amber">
        <div class="sms-banner__left">
          <Zap :size="15" class="sms-banner__icon" />
          <span>
            <strong>{{ autoSuggestionCount }}</strong>
            {{ autoSuggestionCount > 1 ? t('smsAutoSuggestions') : t('smsAutoSuggestion') }}
            {{ t('smsAutoSuggestionAvailable') }}
          </span>
        </div>
        <button class="sms-banner-btn sms-banner-btn--amber" @click="applyAutoSuggestions">
          {{ t('smsApplyAll') }}
        </button>
      </div>

      <!-- ── Bulk create banner ── -->
      <div v-if="unmappedCount > 0 && !bulkCreating" class="sms-banner sms-banner--red">
        <div class="sms-banner__left">
          <Plus :size="15" class="sms-banner__icon" />
          <span>
            <strong>{{ unmappedCount }}</strong> {{ t('intgShopsUnmappedBulkHint') }}
          </span>
        </div>
        <button class="sms-banner-btn sms-banner-btn--red" @click="openBulkConfirm">
          {{ t('intgShopsBulkCreateMap') }}
        </button>
      </div>

      <!-- ── Bulk progress (un seul appel API : spinner indéterminé) ── -->
      <div v-if="bulkCreating" class="sms-banner sms-banner--progress">
        <div class="sms-banner__left">
          <v-progress-circular indeterminate size="15" width="2" color="#ff3131" />
          <span style="font-weight: 600;">{{ t('intgShopsBulkProgressPrefix') }} {{ bulkCreateTotal }} {{ t('intgShopsBulkProgressSuffix') }}</span>
        </div>
      </div>

      <!-- ── Toolbar ── -->
      <div class="sms-toolbar">
        <div class="sms-search">
          <Search :size="15" class="sms-search__icon" />
          <input v-model="search" class="sms-search__input" :placeholder="t('intgShopsSearchPlaceholder')" />
          <button v-if="search" class="sms-search__clear" :title="t('anClear')" @click="search = ''"><X :size="13" /></button>
        </div>
        <div class="sms-tabs">
          <button class="sms-tab" :class="{ 'sms-tab--active': activeTab === 'all' }" @click="activeTab = 'all'">
            {{ t('intgShopsTabAll') }} <span class="sms-tab__count">{{ locations.length }}</span>
          </button>
          <button class="sms-tab sms-tab--mapped" :class="{ 'sms-tab--active': activeTab === 'mapped' }" @click="activeTab = 'mapped'">
            {{ t('intgShopsTabMapped') }} <span class="sms-tab__count sms-tab__count--green">{{ mappedCount }}</span>
          </button>
          <button class="sms-tab sms-tab--unmapped" :class="{ 'sms-tab--active': activeTab === 'unmapped' }" @click="activeTab = 'unmapped'">
            {{ t('intgShopsTabUnmapped') }}
            <span v-if="unmappedCount > 0" class="sms-tab__count sms-tab__count--red">{{ unmappedCount }}</span>
          </button>
        </div>
      </div>

      <!-- ── Location list ── -->
      <div class="sms-list">

        <!-- Column headers -->
        <div class="sms-list__header">
          <div class="sms-list__header-col sms-list__header-col--loc">{{ t('smsColLocation') }}</div>
          <div class="sms-list__header-col sms-list__header-col--shop">{{ t('smsColShop') }}</div>
          <div class="sms-list__header-col sms-list__header-col--status">{{ t('intgShopsStatus') }}</div>
        </div>

        <!-- Empty search result -->
        <div v-if="!displayedRows.length" class="sms-list-empty">
          <Search :size="18" style="color: #9ca3af;" />
          <span>{{ t('intgShopsNoLocationFound') }}</span>
        </div>

        <!-- Rows -->
        <div
          v-for="item in displayedRows"
          :key="item.id"
          class="sms-row"
          :class="{
            'sms-row--mapped': !!localMappings[item.id],
            'sms-row--suggested': !localMappings[item.id] && !!autoSuggestions[item.id],
          }"
        >
          <!-- Location name -->
          <div class="sms-row__loc">
            <div class="sms-row__loc-header">
              <div class="sms-row__loc-dot" :class="localMappings[item.id] ? 'sms-row__loc-dot--ok' : autoSuggestions[item.id] ? 'sms-row__loc-dot--suggest' : 'sms-row__loc-dot--pending'"></div>
              <span class="sms-row__loc-name">{{ item.name }}</span>       
            </div>
          </div>

          <!-- Shop select -->
          <div class="sms-row__shop">
            <select
              class="sms-select"
              :class="{ 'sms-select--suggested': !localMappings[item.id] && !!autoSuggestions[item.id] }"
              :value="localMappings[item.id] || autoSuggestions[item.id] || ''"
              @change="updateMapping(item.id, $event.target.value || null)"
            >
              <option value="">{{ t('smsSelectPlaceholder') }}</option>
              <option v-for="el in elementItems" :key="el.id" :value="el.id">{{ el.label }}</option>
            </select>
          </div>

          <!-- Actions -->
          <div class="sms-row__actions">
            <!-- Not mapped -->
            <template v-if="!localMappings[item.id]">
              <template v-if="autoSuggestions[item.id]">
                <button class="sms-act sms-act--accept" :title="t('intgShopsValidateSuggestion')" @click="acceptSuggestion(item.id)">
                  <Check :size="13" />
                </button>
                <button class="sms-act sms-act--reject" :title="t('intgShopsIgnore')" @click="rejectSuggestion(item.id)">
                  <X :size="13" />
                </button>
              </template>
              <button v-else class="sms-act sms-act--create" :title="`${t('intgShopsCreateShopFor')} « ${item.name} »`" @click="openQuickCreate(item)">
                <Plus :size="14" />
              </button>
            </template>
            <!-- Mapped -->
            <template v-else>
              <span v-if="savingRows[item.id] === 'saving'" class="sms-status sms-status--saving">
                <v-progress-circular indeterminate size="14" width="2" color="#9ca3af" />
              </span>
              <span v-else-if="savingRows[item.id] === 'error'" class="sms-status sms-status--error" :title="t('intgShopsSaveError')">!</span>
              <span v-else class="sms-status sms-status--ok"><Check :size="13" /></span>
              <!-- Floor badge -->
              <button v-if="floorMap[item.id] !== undefined" class="sms-floor-badge" @click="openFloorDialog(item.id)" :title="floorNameMap[item.id] || floorBadgeLabel(floorMap[item.id])">
                <v-icon size="11">{{ floorBadgeIcon(floorMap[item.id]) }}</v-icon>
                {{ floorNameMap[item.id] || floorBadgeLabel(floorMap[item.id]) }}
              </button>
              <button v-else class="sms-act sms-act--floor" :title="t('intgShopsAssignFloor')" @click="openFloorDialog(item.id)">
                <Layers :size="13" />
              </button>
            </template>
          </div>
        </div>
      </div>

      <!-- Blocking warning -->
      <div v-if="!loading && unmappedCount > 0" class="sms-infobar sms-infobar--warn mt-2">
        <AlertTriangle :size="14" style="flex-shrink: 0;" />
        <span>
          <strong>{{ unmappedCount }} {{ t('intgShopsUnmappedWarnLabel') }}</strong> — {{ t('intgShopsUnmappedWarnHint') }}
        </span>
      </div>

    </template>

    <!-- ── Footer (teleported) ── -->
    <!-- BUG-273 : l'erreur principale est téléportée avec le bouton (même Teleport que le
         footer) pour rester visible dans la zone fixe .iw-footer, au lieu d'être perdue dans
         le corps scrollable .iw-body du wizard parent (IntegrationWizard.vue). -->
    <Teleport v-if="teleportActive" :to="footerTarget" :disabled="!footerTarget">
      <div class="sms-footer-teleport">
        <div v-if="error" class="sms-infobar sms-infobar--error sms-footer-error">
          <AlertTriangle :size="14" style="flex-shrink: 0;" />
          <span>{{ error }}</span>
        </div>
        <div class="sms-footer-actions">
          <button v-if="unmappedCount > 0" class="sms-btn sms-btn--ghost" @click="handleSkipUnmapped">
            {{ t('smsSkipUnmapped') }}
          </button>
          <span v-else></span>
          <button class="sms-btn sms-btn--primary" :disabled="mappedCount === 0 || hasPendingSaves" @click="handleSave">
            <v-progress-circular v-if="hasPendingSaves" indeterminate size="14" width="2" color="white" />
            <span v-else>{{ t('smsSave') }}</span>
            <ChevronRight :size="16" />
          </button>
        </div>
      </div>
    </Teleport>

    <!-- ── Floor dialog ── -->
    <v-dialog v-model="floorDialogOpen" max-width="500" :persistent="floorSaving" transition="dialog-bottom-transition" scrollable>
      <v-card rounded="xl" elevation="12" class="sms-fd-card" :class="{ 'sms-fd-card--dark': isDark }">

        <!-- Gradient Header -->
        <div class="sms-fd-header">
          <div class="sms-fd-header__icon"><Layers :size="20" color="white" /></div>
          <div class="sms-fd-header__text">
            <div class="sms-fd-header__title">{{ t('intgShopsAssignFloor') }}</div>
            <div class="sms-fd-header__sub">{{ anchorLocationName }}</div>
          </div>
          <button class="sms-fd-header__close" :title="t('close')" :disabled="floorSaving" @click="floorDialogOpen = false"><X :size="16" /></button>
        </div>

        <!-- Progress steps -->
        <div class="sms-fd-progress">
          <div class="sms-fd-progress__item" :class="{ 'sms-fd-progress__item--active': !floorDialogConfigId, 'sms-fd-progress__item--done': !!floorDialogConfigId }">
            <span class="sms-fd-progress__dot"><Check v-if="floorDialogConfigId" :size="11" color="white" /><span v-else>1</span></span>
            <span class="sms-fd-progress__label">{{ t('intgShopsStepConfig') }}</span>
          </div>
          <div class="sms-fd-progress__line" :class="{ 'sms-fd-progress__line--done': !!floorDialogConfigId }" />
          <div class="sms-fd-progress__item" :class="{ 'sms-fd-progress__item--active': floorDialogConfigId && (floorDialogLevel === null || floorDialogLevel === undefined), 'sms-fd-progress__item--done': floorDialogLevel !== null && floorDialogLevel !== undefined && floorDialogLevel !== '__add_zone__' }">
            <span class="sms-fd-progress__dot"><Check v-if="floorDialogLevel !== null && floorDialogLevel !== undefined && floorDialogLevel !== '__add_zone__'" :size="11" color="white" /><span v-else>2</span></span>
            <span class="sms-fd-progress__label">{{ t('intgShopsStepZone') }}</span>
          </div>
          <div class="sms-fd-progress__line" :class="{ 'sms-fd-progress__line--done': floorDialogLevel !== null && floorDialogLevel !== undefined && floorDialogLevel !== '__add_zone__' }" />
          <div class="sms-fd-progress__item" :class="{ 'sms-fd-progress__item--active': floorDialogLevel !== null && floorDialogLevel !== undefined && floorDialogLevel !== '__add_zone__' }">
            <span class="sms-fd-progress__dot">3</span>
            <span class="sms-fd-progress__label">{{ t('intgShopsStepPosition') }}</span>
          </div>
        </div>

        <v-card-text class="sms-fd-body pa-0">

          <!-- Section 1 : Configuration -->
          <div class="sms-fd-section">
            <div class="sms-fd-section__label">
              <Settings :size="12" />
              {{ t('intgShopsConfiguration') }}
            </div>
            <div v-if="floorDialogConfigLoading" class="sms-fd-loading">
              <v-progress-circular indeterminate size="18" width="2" color="#ff3131" />
              <span>{{ t('intgShopsLoading') }}</span>
            </div>
            <template v-else>
              <!-- Config détectée depuis le shop : affichage direct -->
              <div v-if="floorDialogConfigId && !floorDialogConfigOverride" class="sms-fd-config-chip">
                <Settings :size="13" class="sms-fd-config-chip__icon" />
                <span class="sms-fd-config-chip__name">{{ floorDialogConfigName }}</span>
                <button class="sms-fd-config-chip__change" @click="floorDialogConfigId = null; floorDialogLevel = null; floorDialogFloors = []; floorDialogConfigOverride = true">
                  {{ t('intgShopsChange') }}
                </button>
              </div>
              <!-- Fallback : sélecteur manuel -->
              <select v-else v-model="floorDialogConfigId" class="sms-select sms-select--full" @change="onFloorDialogConfigChange(floorDialogConfigId)">
                <option value="" disabled>{{ floorDialogConfigs.length ? t('intgShopsSelectConfig') : t('intgShopsNoConfigAvailable') }}</option>
                <option v-for="c in floorDialogConfigOptions" :key="c.value" :value="c.value">{{ c.title }}</option>
                <option value="__create_config__">{{ t('intgShopsAddNewConfig') }}</option>
              </select>
            </template>
          </div>

          <!-- Section 2 : Zone / Étage (visual cards) -->
          <transition name="sms-fd-slide">
            <div v-if="floorDialogConfigId" class="sms-fd-section">
              <div class="sms-fd-section__label">
                <Layers :size="12" />
                {{ t('intgShopsZoneFloor') }}
                <span v-if="floorDialogFloorsLoading" class="sms-fd-dot-loader"><span /><span /><span /></span>
              </div>

              <div v-if="!floorDialogFloorsLoading" class="sms-fd-areas">
                <!-- Floor / Basement cards -->
                <button
                  v-for="floor in sortedFloorDialogFloors"
                  :key="floor.id || floor.level"
                  class="sms-fd-area-card"
                  :class="{ 'sms-fd-area-card--selected': floorDialogLevel === floor.level }"
                  @click="pickExistingFloor(floor)"
                >
                  <div class="sms-fd-area-card__badge">
                    <ChevronUp v-if="floor.level >= 0" :size="13" />
                    <ChevronDown v-else :size="13" />
                  </div>
                  <div class="sms-fd-area-card__name">{{ floor.name || (floor.level === 0 ? t('intgShopsGroundFloorShort') : floor.level < 0 ? `${t('intgShopsBasementWord')} ${Math.abs(floor.level)}` : `${t('intgShopsFloorWord')} ${floor.level}`) }}</div>
                  <div class="sms-fd-area-card__count">{{ (floor.elements || []).length }} {{ t('intgShopsElementsShort') }}</div>
                </button>

                <!-- Forecourt -->
                <button
                  v-if="floorDialogZones.forecourt"
                  class="sms-fd-area-card sms-fd-area-card--special"
                  :class="{ 'sms-fd-area-card--selected': floorDialogLevel === 'forecourt' }"
                  @click="floorDialogLevel = 'forecourt'; floorDialogZoneName = floorDialogZones.forecourt.name || 'Forecourt'; newFloorDimensions = { width: floorDialogZones.forecourt.width || 200, length: floorDialogZones.forecourt.length || 200, height: floorDialogZones.forecourt.height || 4 }"
                >
                  <div class="sms-fd-area-card__badge sms-fd-area-card__badge--orange">
                    <MapPin :size="13" />
                  </div>
                  <div class="sms-fd-area-card__name">{{ floorDialogZones.forecourt.name || 'Forecourt' }}</div>
                  <div class="sms-fd-area-card__count">{{ (floorDialogZones.forecourt.elements || []).length }} {{ t('intgShopsElementsShort') }}</div>
                </button>

                <!-- External Merch -->
                <button
                  v-if="floorDialogZones.externalMerch"
                  class="sms-fd-area-card sms-fd-area-card--special"
                  :class="{ 'sms-fd-area-card--selected': floorDialogLevel === 'externalmerch' }"
                  @click="floorDialogLevel = 'externalmerch'; floorDialogZoneName = floorDialogZones.externalMerch.name || 'External'; newFloorDimensions = { width: floorDialogZones.externalMerch.width || 100, length: floorDialogZones.externalMerch.length || 100, height: floorDialogZones.externalMerch.height || 4 }"
                >
                  <div class="sms-fd-area-card__badge sms-fd-area-card__badge--green">
                    <Map :size="13" />
                  </div>
                  <div class="sms-fd-area-card__name">{{ floorDialogZones.externalMerch.name || t('intgShopsExternalAreaShort') }}</div>
                  <div class="sms-fd-area-card__count">{{ (floorDialogZones.externalMerch.elements || []).length }} {{ t('intgShopsElementsShort') }}</div>
                </button>

                <!-- Pending: nouveau Floor -->
                <button
                  v-if="floorDialogLevel === '__new_floor__'"
                  class="sms-fd-area-card sms-fd-area-card--selected"
                  @click="floorDialogLevel = '__add_zone__'"
                >
                  <div class="sms-fd-area-card__badge"><ChevronUp :size="13" /></div>
                  <div class="sms-fd-area-card__name">{{ t('intgShopsNewFloor') }}</div>
                  <div class="sms-fd-area-card__count sms-fd-area-card__count--new">● {{ t('intgShopsNew') }}</div>
                </button>

                <!-- Pending: nouveau Basement -->
                <button
                  v-if="floorDialogLevel === '__new_basement__'"
                  class="sms-fd-area-card sms-fd-area-card--selected"
                  @click="floorDialogLevel = '__add_zone__'"
                >
                  <div class="sms-fd-area-card__badge"><ChevronDown :size="13" /></div>
                  <div class="sms-fd-area-card__name">{{ t('intgShopsNewBasement') }}</div>
                  <div class="sms-fd-area-card__count sms-fd-area-card__count--new">● {{ t('intgShopsNew') }}</div>
                </button>

                <!-- Pending: nouveau Forecourt -->
                <button
                  v-if="floorDialogLevel === '__new_forecourt__'"
                  class="sms-fd-area-card sms-fd-area-card--special sms-fd-area-card--selected"
                  @click="floorDialogLevel = '__add_zone__'"
                >
                  <div class="sms-fd-area-card__badge sms-fd-area-card__badge--orange"><MapPin :size="13" /></div>
                  <div class="sms-fd-area-card__name">Forecourt</div>
                  <div class="sms-fd-area-card__count sms-fd-area-card__count--new">● {{ t('intgShopsNew') }}</div>
                </button>

                <!-- Pending: nouveau External Merch -->
                <button
                  v-if="floorDialogLevel === '__new_externalmerch__'"
                  class="sms-fd-area-card sms-fd-area-card--special sms-fd-area-card--selected"
                  @click="floorDialogLevel = '__add_zone__'"
                >
                  <div class="sms-fd-area-card__badge sms-fd-area-card__badge--green"><Map :size="13" /></div>
                  <div class="sms-fd-area-card__name">{{ t('intgShopsExternalAreaShort') }}</div>
                  <div class="sms-fd-area-card__count sms-fd-area-card__count--new">● {{ t('intgShopsNew') }}</div>
                </button>

                <!-- Add new zone -->
                <button
                  class="sms-fd-area-card sms-fd-area-card--add"
                  :class="{ 'sms-fd-area-card--selected': floorDialogLevel === '__add_zone__' }"
                  @click="floorDialogLevel = '__add_zone__'"
                >
                  <div class="sms-fd-area-card__badge sms-fd-area-card__badge--gray"><Plus :size="13" /></div>
                  <div class="sms-fd-area-card__name">{{ t('intgShopsAdd') }}</div>
                  <div class="sms-fd-area-card__count">{{ t('intgShopsAZone') }}</div>
                </button>

                <!-- No floors placeholder -->
                <div v-if="sortedFloorDialogFloors.length === 0 && !floorDialogZones.forecourt && !floorDialogZones.externalMerch && !floorDialogLevel" class="sms-fd-no-floors">
                  {{ t('intgShopsNoFloorInConfig') }}
                </div>
              </div>

              <!-- Zone type picker (shown when Add is selected) -->
              <transition name="sms-fd-slide">
                <div v-if="floorDialogLevel === '__add_zone__'" class="sms-fd-zone-picker">
                  <button v-for="opt in floorDialogZoneOptions" :key="opt.value" class="sms-fd-zone-pill" @click="selectNewZone(opt.value)">
                    {{ opt.title }}
                  </button>
                </div>
              </transition>

              <!-- Nom + Dimensions -->
              <transition name="sms-fd-slide">
                <div v-if="floorDialogLevel !== null && floorDialogLevel !== undefined && floorDialogLevel !== '__add_zone__'" class="sms-fd-dims">
                  <div class="sms-fd-dims__label">{{ t('intgShopsZoneName') }}</div>
                  <input v-model="floorDialogZoneName" type="text" class="sms-fd-field__input" style="width:100%;margin-bottom:10px;" :placeholder="t('intgShopsZoneNamePlaceholder')" />
                  <div class="sms-fd-dims__label">{{ t('intgShopsZoneDimensions') }}</div>
                  <div class="sms-fd-dims__row">
                    <div class="sms-fd-field">
                      <label class="sms-fd-field__label">{{ t('intgShopsWidthM') }}</label>
                      <input v-model.number="newFloorDimensions.width" type="number" class="sms-fd-field__input" />
                    </div>
                    <div class="sms-fd-field">
                      <label class="sms-fd-field__label">{{ t('intgShopsLengthM') }}</label>
                      <input v-model.number="newFloorDimensions.length" type="number" class="sms-fd-field__input" />
                    </div>
                    <div class="sms-fd-field">
                      <label class="sms-fd-field__label">{{ t('intgShopsHeightM') }}</label>
                      <input v-model.number="newFloorDimensions.height" type="number" class="sms-fd-field__input" />
                    </div>
                  </div>
                </div>
              </transition>
            </div>
          </transition>

          <!-- Section 3 : Placement visuel -->
          <transition name="sms-fd-slide">
            <div v-if="selectedFloorData" class="sms-fd-section">
              <div class="sms-fd-section__label">
                <MapPin :size="12" />
                {{ t('intgShopsPositionOnPlan') }}
              </div>

              <!-- Mini SVG floor plan -->
              <div class="sms-fd-preview-wrap">
                <svg
                  :width="floorPreviewWidth"
                  :height="floorPreviewHeight"
                  class="sms-fd-preview-svg"
                  @click="handleFloorPreviewClick"
                  @mousemove="onDragShopMove"
                  @mouseup="onDragShopEnd"
                  @mouseleave="onDragShopEnd"
                >
                  <!-- Floor background -->
                  <rect x="0" y="0" :width="floorPreviewWidth" :height="floorPreviewHeight" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5" rx="2" />

                  <!-- Existing elements -->
                  <g v-for="el in (selectedFloorData.elements || [])" :key="el.id">
                    <rect
                      v-if="el.x != null && el.width"
                      :x="el.x * floorPreviewScale"
                      :y="(el.y || 0) * floorPreviewScale"
                      :width="el.width * floorPreviewScale"
                      :height="(el.depth || el.width) * floorPreviewScale"
                      fill="#94a3b8" fill-opacity="0.35" stroke="#64748b" stroke-width="0.8" rx="1"
                    />
                  </g>

                  <!-- Shop being placed (draggable) -->
                  <g
                    :transform="`translate(${floorDialogPosition.x * floorPreviewScale},${floorDialogPosition.y * floorPreviewScale})`"
                    style="cursor:move"
                    @mousedown.stop.prevent="startDragShop"
                    @click.stop
                  >
                    <rect
                      x="0" y="0"
                      :width="Math.max(1, floorDialogShopDimensions.width * floorPreviewScale)"
                      :height="Math.max(1, floorDialogShopDimensions.depth * floorPreviewScale)"
                      fill="#ff3131" fill-opacity="0.82" stroke="#b91c1c" stroke-width="1.5" rx="2"
                    />
                    <text
                      :x="(floorDialogShopDimensions.width * floorPreviewScale) / 2"
                      :y="(floorDialogShopDimensions.depth * floorPreviewScale) / 2 + 4"
                      text-anchor="middle"
                      font-size="9"
                      fill="white"
                      font-weight="600"
                      pointer-events="none"
                    >{{ anchorLocationName.slice(0, 10) }}</text>
                  </g>
                </svg>
                <p class="sms-fd-preview-hint">{{ t('intgShopsDragHint') }}</p>
              </div>

              <!-- X / Y inputs -->
              <div class="sms-fd-pos-row">
                <div class="sms-fd-field">
                  <label class="sms-fd-field__label">X (m)</label>
                  <input v-model.number="floorDialogPosition.x" type="number" min="0" class="sms-fd-field__input" />
                </div>
                <div class="sms-fd-field">
                  <label class="sms-fd-field__label">Y (m)</label>
                  <input v-model.number="floorDialogPosition.y" type="number" min="0" class="sms-fd-field__input" />
                </div>
              </div>
            </div>
          </transition>

          <!-- Section 4 : Shop dimensions -->
          <transition name="sms-fd-slide">
            <div v-if="floorDialogLevel !== null && floorDialogLevel !== undefined && floorDialogLevel !== '__add_zone__'" class="sms-fd-section">
              <div class="sms-fd-section__label">
                <Store :size="12" />
                {{ t('intgShopsShopDimensions') }}
              </div>
              <div class="sms-fd-dims__row">
                <div class="sms-fd-field">
                  <label class="sms-fd-field__label">{{ t('intgShopsWidthM') }}</label>
                  <input v-model.number="floorDialogShopDimensions.width" type="number" min="1" class="sms-fd-field__input" />
                </div>
                <div class="sms-fd-field">
                  <label class="sms-fd-field__label">{{ t('intgShopsDepthM') }}</label>
                  <input v-model.number="floorDialogShopDimensions.depth" type="number" min="1" class="sms-fd-field__input" />
                </div>
                <div class="sms-fd-field">
                  <label class="sms-fd-field__label">{{ t('intgShopsHeightM') }}</label>
                  <input v-model.number="floorDialogShopDimensions.height" type="number" min="1" class="sms-fd-field__input" />
                </div>
              </div>
            </div>
          </transition>

          <!-- Section 5 : Batch -->
          <transition name="sms-fd-slide">
            <div v-if="floorDialogLevel !== null && floorDialogLevel !== undefined && floorDialogLevel !== '__add_zone__' && floorDialogBatchOptions.length > 0" class="sms-fd-section">
              <div class="sms-fd-section__label">
                <Check :size="12" />
                {{ t('intgShopsApplyToLocations') }}
              </div>
              <div class="sms-fd-batch">
                <button
                  v-for="loc in floorDialogBatchOptions"
                  :key="loc.id"
                  class="sms-fd-batch-item"
                  :class="{ 'sms-fd-batch-item--on': floorDialogBatchIds.includes(loc.id) }"
                  @click="floorDialogBatchIds.includes(loc.id) ? (floorDialogBatchIds = floorDialogBatchIds.filter(id => id !== loc.id)) : floorDialogBatchIds.push(loc.id)"
                >
                  <span class="sms-fd-batch-item__box">
                    <Check v-if="floorDialogBatchIds.includes(loc.id)" :size="10" color="white" />
                  </span>
                  <span class="sms-fd-batch-item__label">{{ loc.name }}</span>
                  <span v-if="floorMap[loc.id] !== undefined" class="sms-fd-batch-item__current">
                    {{ floorNameMap[loc.id] || floorBadgeLabel(floorMap[loc.id]) }}
                  </span>
                </button>
              </div>
            </div>
          </transition>

        </v-card-text>

        <!-- Footer -->
        <div class="sms-fd-footer">
          <button class="sms-btn sms-btn--ghost" :disabled="floorSaving" @click="floorDialogOpen = false">{{ t('intgShopsCancel') }}</button>
          <button
            class="sms-btn sms-btn--primary"
            :disabled="floorSaving || floorDialogLevel === null || floorDialogLevel === undefined || floorDialogLevel === '__add_zone__'"
            @click="applyFloorDialog"
          >
            <v-progress-circular v-if="floorSaving" indeterminate size="14" width="2" color="white" />
            <Check v-else :size="14" />
            {{ t('intgShopsApply') }}
          </button>
        </div>
      </v-card>
    </v-dialog>

    <!-- ── Config creation dialog (aucune config pour cet espace) ── -->
    <!-- Bulk confirm dialog : récap explicite de ce qui sera mappé / créé -->
    <v-dialog v-model="bulkConfirmOpen" max-width="520">
      <div class="sms-qc-dialog">
        <div class="sms-qc-header">
          <div class="sms-qc-header__icon"><Layers :size="20" color="white" /></div>
          <div class="sms-qc-header__info">
            <p class="sms-qc-header__title">{{ t('intgShopsBulkMappingTitle') }}</p>
            <p class="sms-qc-header__sub">{{ bulkPlan.matched.length + bulkPlan.unmatched.length }} {{ t('intgShopsUnmappedLocations') }}</p>
          </div>
          <button class="sms-qc-header__close" :title="t('close')" @click="bulkConfirmOpen = false">
            <X :size="15" />
          </button>
        </div>
        <div class="sms-qc-body">
          <p v-if="bulkPlan.matched.length" class="sms-cfg-info">
            <strong>{{ bulkPlan.matched.length }}</strong> {{ t('intgShopsMatchedNamePrefix') }}
            {{ t('intgShopsMatchedNameMid') }} <strong>{{ t('intgShopsMapped') }}</strong>{{ t('intgShopsMatchedNameSuffix') }}
          </p>
          <p v-else class="sms-cfg-info">
            {{ t('intgShopsNoNameMatch') }}
          </p>

          <template v-if="bulkPlan.unmatched.length">
            <label class="sms-bulk-opt">
              <input v-model="bulkCreateMissing" type="checkbox" class="sms-bulk-opt__check" />
              <span class="sms-bulk-opt__text">
                {{ t('intgShopsCreateMissingPrefix') }} <strong>{{ bulkPlan.unmatched.length }}</strong> {{ t('intgShopsCreateMissingSuffix') }}
                <span class="sms-bulk-opt__hint">
                  {{ t('intgShopsGridHint') }}{{ bulkTargetConfigName ? ` ${t('intgShopsOfConfig')} « ${bulkTargetConfigName} »` : '' }}.
                </span>
              </span>
            </label>
            <p v-if="!bulkCreateMissing" class="sms-bulk-note">
              {{ t('intgShopsBulkNotePrefix') }} {{ bulkPlan.unmatched.length }} {{ t('intgShopsBulkNoteSuffix') }}
            </p>
          </template>
        </div>
        <div class="sms-qc-footer">
          <button class="sms-btn sms-btn--ghost" @click="bulkConfirmOpen = false">
            {{ t('intgShopsCancel') }}
          </button>
          <button class="sms-btn sms-btn--primary" :disabled="bulkItemCount === 0" @click="confirmBulk">
            <Check :size="14" />
            {{ bulkConfirmLabel }}
          </button>
        </div>
      </div>
    </v-dialog>

    <v-dialog v-model="configCreateDialog" max-width="480" persistent>
      <div class="sms-qc-dialog">
        <div class="sms-qc-header">
          <div class="sms-qc-header__icon"><Settings :size="20" color="white" /></div>
          <div class="sms-qc-header__info">
            <p class="sms-qc-header__title">{{ t('intgShopsConfigRequired') }}</p>
            <p class="sms-qc-header__sub">{{ t('intgShopsNoConfigForSpace') }}</p>
          </div>
        </div>
        <div class="sms-qc-body">
          <p class="sms-cfg-info">
            {{ t('intgShopsCreateConfigInfo') }}
          </p>

          <div class="sms-qc-field-wrap mb-3">
            <label class="sms-qc-label">{{ t('intgShopsConfigName') }} <span class="sms-qc-required">*</span></label>
            <input v-model="configForm.configName" class="sms-qc-input-nb" :placeholder="t('intgShopsConfigNamePlaceholder')" autofocus />
          </div>

          <div class="sms-cfg-section-label">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff3131" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            {{ t('intgShopsGroundFloorLong') }}
          </div>

          <div class="sms-qc-field-wrap mb-3">
            <label class="sms-qc-label">{{ t('intgShopsGroundFloorName') }}</label>
            <input v-model="configForm.floorName" class="sms-qc-input-nb" :placeholder="t('intgShopsGroundFloorNamePlaceholder')" />
          </div>

          <div class="sms-qc-row">
            <div class="sms-qc-field-wrap">
              <label class="sms-qc-label">{{ t('intgShopsWidthM') }}</label>
              <input v-model.number="configForm.floorWidth" type="number" min="1" class="sms-qc-input-nb" />
            </div>
            <div class="sms-qc-field-wrap">
              <label class="sms-qc-label">{{ t('intgShopsLengthM') }}</label>
              <input v-model.number="configForm.floorLength" type="number" min="1" class="sms-qc-input-nb" />
            </div>
          </div>

          <div v-if="configCreateError" class="sms-qc-error mt-3">
            <AlertTriangle :size="14" />
            {{ configCreateError }}
          </div>
        </div>
        <div class="sms-qc-footer">
          <button class="sms-btn sms-btn--ghost" :disabled="creatingConfig" @click="skipConfigCreate">
            {{ t('intgShopsSkip') }}
          </button>
          <button class="sms-btn sms-btn--primary" :disabled="!configForm.configName || creatingConfig" @click="confirmConfigCreate">
            <v-progress-circular v-if="creatingConfig" indeterminate size="13" width="2" color="white" />
            <Check v-else :size="14" />
            {{ t('intgShopsCreateConfig') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <!-- Quick-create shop dialog -->
    <v-dialog v-model="quickCreateOpen" max-width="460" :persistent="quickCreateSaving">
      <div class="sms-qc-dialog">

        <!-- Header dégradé -->
        <div class="sms-qc-header">
          <div class="sms-qc-header__icon"><Store :size="20" color="white" /></div>
          <div class="sms-qc-header__info">
            <p class="sms-qc-header__title">{{ t('intgShopsCreateShopTitle') }}</p>
            <p class="sms-qc-header__sub">{{ quickCreateLocation?.name }}</p>
          </div>
          <button class="sms-qc-header__close" :title="t('close')" :disabled="quickCreateSaving" @click="quickCreateOpen = false">
            <X :size="15" />
          </button>
        </div>

        <!-- Body -->
        <div class="sms-qc-body">

          <!-- Nom -->
          <div class="sms-qc-field-wrap mb-3">
            <label class="sms-qc-label">{{ t('intgShopsShopName') }} <span class="sms-qc-required">*</span></label>
            <input v-model="quickCreateForm.name" class="sms-qc-input-nb" :placeholder="t('intgShopsShopNamePlaceholder')" autofocus />
          </div>

          <!-- Type -->
          <div class="sms-qc-field-wrap mb-3">
            <label class="sms-qc-label">{{ t('intgShopsType') }}</label>
            <select v-model="quickCreateForm.type" class="sms-select">
              <option v-for="st in shopTypeItems" :key="st.value" :value="st.value">{{ st.label }}</option>
            </select>
          </div>

          <!-- Configuration -->
          <div v-if="quickCreateConfigOptions.length > 0" class="sms-qc-field-wrap mb-3">
            <label class="sms-qc-label">{{ t('intgShopsConfiguration') }}</label>
            <div v-if="quickCreateConfigsLoading" class="sms-qc-loading">
              <v-progress-circular indeterminate size="14" width="2" color="#ff3131" />
              <span>{{ t('intgShopsLoading') }}</span>
            </div>
            <select v-else v-model="quickCreateForm.configId" class="sms-select" @change="onQuickCreateConfigChange(quickCreateForm.configId)">
              <option value="">{{ t('intgShopsSelectConfig') }}</option>
              <option v-for="c in quickCreateConfigOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
          </div>

          <!-- Étage / Zone -->
          <div v-if="quickCreateForm.configId && quickCreateFloorOptions.length > 0" class="sms-qc-field-wrap mb-3">
            <label class="sms-qc-label">{{ t('intgShopsFloorZone') }}</label>
            <div v-if="quickCreateFloorsLoading" class="sms-qc-loading">
              <v-progress-circular indeterminate size="14" width="2" color="#ff3131" />
              <span>{{ t('intgShopsLoading') }}</span>
            </div>
            <select v-else v-model="quickCreateForm.floorLevel" class="sms-select">
              <option :value="null">{{ t('intgShopsSelectFloor') }}</option>
              <option v-for="f in quickCreateFloorOptions" :key="f.value" :value="f.value">{{ f.label }}</option>
            </select>
          </div>

          <!-- Erreur -->
          <div v-if="quickCreateError" class="sms-qc-error">
            <AlertTriangle :size="14" />
            {{ quickCreateError }}
          </div>

        </div>

        <!-- Footer -->
        <div class="sms-qc-footer">
          <button class="sms-btn sms-btn--ghost" :disabled="quickCreateSaving" @click="quickCreateOpen = false">
            {{ t('intgShopsCancel') }}
          </button>
          <button class="sms-btn sms-btn--primary" :disabled="!quickCreateForm.name || quickCreateSaving" @click="submitQuickCreate">
            <v-progress-circular v-if="quickCreateSaving" indeterminate size="13" width="2" color="white" />
            <Plus v-else :size="14" />
            {{ t('intgShopsCreateAndMap') }}
          </button>
        </div>

      </div>
    </v-dialog>

  </div>
</template>

<script>
import { t as translate } from '@/i18n'
import { Store, Check, X, Search, Zap, Plus, ChevronRight, AlertTriangle, Layers, MapPin, Map, Settings, ChevronUp, ChevronDown } from 'lucide-vue-next'
import { quickCreateSpaceElement, assignShopsFloor, bulkQuickCreateAndMap, getSpaceFloorOptions } from '@/api/endpoints/space.api'
import { getBuilderState, updateZone, createZone, createConfiguration as createConfigurationV2 } from '@/api/endpoints/builder-v2.api'
import { getLocationShopMappings, createLocationShopMapping, deleteLocationShopMapping, bulkLocationShopMappings } from '@/api/endpoints/mapping.api'

// Seuils du matcher nom-de-location → shop (findBestElementMatch) : matchScore est
// exposé en 0-100, MIN_CANDIDATE_SCORE est comparé au score interne 0-1.
const PERFECT_MATCH_SCORE = 100   // égalité exacte des noms normalisés → mapping appliqué directement
const SUGGESTED_MATCH_SCORE = 70  // score ≥ 70 → suggestion affichée (confirmation utilisateur requise)
const MIN_CANDIDATE_SCORE = 0.5   // en-dessous, aucun candidat retenu

export default {
  name: 'StepMapShops',

  components: { Store, Check, X, Search, Zap, Plus, ChevronRight, AlertTriangle, Layers, MapPin, Map, Settings, ChevronUp, ChevronDown },

  props: {
    location: { type: Object, required: true },
    spaceId: { type: String, required: true },
    isDark: { type: Boolean, default: false },
    footerTarget: { type: [Object, String], default: null },
  },

  emits: ['completed', 'request-csv-import'],

  data() {
    return {
      teleportActive: true,
      // Data from API
      locations: [],
      elements: [],
      localMappings: {},      // confirmed mappings (saved to API)
      autoSuggestions: {},   // name-match suggestions NOT yet saved
      loading: false,
      saving: false,
      error: null,
      // per-row save state: { [locationId]: 'saving' | 'saved' | 'error' }
      savingRows: {},
      // sérialise les appels concurrents à updateMapping pour une même location
      _updateMappingLocks: {},
      // UI state
      activeTab: 'all',
      itemsPerPage: 50,
      search: '',
      // Quick-create dialog
      quickCreateOpen: false,
      quickCreateLocation: null,
      quickCreateSaving: false,
      quickCreateError: null,
      quickCreateForm: { name: '', type: 'shop', area: '', configId: null, floorLevel: null, posX: 31, posY: 34, width: 4, depth: 4, height: 4 },
      quickCreateConfigsLoading: false,
      quickCreateFloorsLoading: false,
      quickCreateFloors: [],
      quickCreateZones: { forecourt: null, externalMerch: null },
      // Config creation dialog
      configCreateDialog: false,
      configCreateContext: 'bulk', // 'bulk' | 'floor'
      creatingConfig: false,
      configCreateError: null,
      configForm: { configName: 'Configuration principale', floorName: 'RDC', floorWidth: 100, floorLength: 100 },
      // Bulk create & map
      bulkCreating: false,
      bulkCreateTotal: 0,
      // Dialogue de confirmation bulk : récap explicite AVANT toute écriture
      bulkConfirmOpen: false,
      bulkPlan: { matched: [], unmatched: [] }, // matched: [{ location, element }], unmatched: [location]
      bulkCreateMissing: true,
      // Floor assignment
      floorMap: {},                  // { [locationId]: level }
      floorDialogOpen: false,
      floorDialogAnchorLocationId: null,
      floorDialogConfigId: null,     // selected config in the dialog
      floorDialogConfigs: [],        // list of configs for the space
      floorDialogConfigLoading: false,
      floorDialogFloors: [],         // floors of the selected config
      appliedFloorDims: {},          // dims retenues par niveau (héritage inter-assignations, même config)
      appliedDimsConfigId: null,    // config à laquelle appartient appliedFloorDims
      floorDialogZones: { forecourt: null, externalMerch: null }, // forecourt/external area of the selected config
      floorDialogFloorsLoading: false,
      floorDialogLevel: null,
      floorDialogPosition: { x: 31, y: 34 },
      floorDialogZoneName: '',
      newFloorDimensions: { width: 100, length: 100, height: 4 },
      floorDialogShopDimensions: { width: 4, depth: 4, height: 4 },
      floorDialogConfigOverride: false,
      floorDialogBatchIds: [],
      floorSaving: false,
      isDraggingShop: false,
      shopDragStart: null,
      floorNameMap: {},              // { [locationId]: floorName }
      _spaceConfigsCache: [],        // cache local des configs de l'espace (stateless store)
      // i18n
      locale: localStorage.getItem('appLocale') || 'en',
    }
  },

  computed: {
    selectedFloorData() {
      const level = this.floorDialogLevel
      if (level === null || level === undefined || level === '__add_zone__') return null
      if (typeof level === 'string' && level.startsWith('__new_')) {
        return { width: this.newFloorDimensions.width, length: this.newFloorDimensions.length, elements: [] }
      }
      if (typeof level === 'number') return this.floorDialogFloors.find(f => f.level === level) || null
      if (level === 'forecourt') return this.floorDialogZones.forecourt || null
      if (level === 'externalmerch') return this.floorDialogZones.externalMerch || null
      return null
    },
    floorPreviewScale() {
      const fd = this.selectedFloorData
      const w = fd?.width || this.newFloorDimensions.width || 100
      const l = fd?.length || this.newFloorDimensions.length || 100
      return 240 / Math.max(w, l)
    },
    floorPreviewWidth() {
      const w = this.selectedFloorData?.width || this.newFloorDimensions.width || 100
      return Math.round(w * this.floorPreviewScale)
    },
    floorPreviewHeight() {
      const l = this.selectedFloorData?.length || this.newFloorDimensions.length || 100
      return Math.round(l * this.floorPreviewScale)
    },
    mappedCount() {
      // only count confirmed (user-chosen) mappings
      return Object.values(this.localMappings).filter(Boolean).length
    },
    unmappedCount() {
      return this.locations.length - this.mappedCount
    },
    bulkUserConfigs() {
      return (this._spaceConfigsCache || [])
        .filter(c => !c.isSystem && c.name?.toLowerCase() !== 'weezevent import')
    },
    bulkTargetConfigName() {
      return this.bulkUserConfigs[0]?.name || ''
    },
    bulkItemCount() {
      return this.bulkPlan.matched.length + (this.bulkCreateMissing ? this.bulkPlan.unmatched.length : 0)
    },
    bulkConfirmLabel() {
      const created = this.bulkCreateMissing ? this.bulkPlan.unmatched.length : 0
      if (created > 0) return `${this.t('intgShopsCreateWord')} ${created} ${this.t('intgShopsAndMapWord')} ${this.bulkItemCount}`
      return `${this.t('intgShopsMapWord')} ${this.bulkItemCount} ${this.t('intgShopsLocationsWord')}`
    },
    shopTypeItems() {
      return [
        { label: 'F&B',           value: 'shop' },
        { label: 'Hospitality',   value: 'hospitality' },
        { label: 'Merch',         value: 'merchshop' },
        { label: 'Storage',       value: 'storage' },
        { label: 'Ticketing',     value: 'entrance' },
        { label: 'Entertainment', value: 'entertainment' },
        { label: 'Access',        value: 'access' },
        { label: 'Kitchen',       value: 'kitchen' },
      ]
    },
    anchorLocationName() {
      const loc = this.locations.find(l => l.id === this.floorDialogAnchorLocationId)
      return loc?.name || ''
    },
    sortedFloorDialogFloors() {
      const seen = new Set()
      return [...this.floorDialogFloors]
        .sort((a, b) => b.level - a.level)
        .filter(f => {
          if (seen.has(f.level)) return false
          seen.add(f.level)
          return true
        })
    },
    floorDialogConfigOptions() {
      // A6/A2 : masquer la config interne auto-générée. On filtre désormais sur le flag
      // backend `isSystem` (fiable). Le filtre par nom est conservé en transition pour les
      // configs créées avant la migration `isSystem` (où le flag arrive `undefined`).
      return this.floorDialogConfigs
        .filter(c => !c.isSystem && c.name?.toLowerCase() !== 'weezevent import')
        .map(c => ({ title: c.name, value: c.id }))
    },
    quickCreateConfigOptions() {
      return (this._spaceConfigsCache || [])
        .filter(c => !c.isSystem && c.name?.toLowerCase() !== 'weezevent import')
        .map(c => ({ label: c.name, value: c.id }))
    },
    quickCreateFloorOptions() {
      const seen = new Set()
      const items = [...(this.quickCreateFloors || [])]
        .sort((a, b) => a.level - b.level)
        .filter(f => { if (seen.has(f.level)) return false; seen.add(f.level); return true })
        .map(f => ({
          label: f.name || (f.level === 0 ? this.t('intgShopsGroundFloorShort') : f.level < 0 ? `${this.t('intgShopsBasementWord')} ${Math.abs(f.level)}` : `${this.t('intgShopsFloorWord')} ${f.level}`),
          value: f.level,
        }))
      if (this.quickCreateZones?.forecourt)
        items.push({ label: this.quickCreateZones.forecourt.name || 'Forecourt', value: 'forecourt' })
      if (this.quickCreateZones?.externalMerch)
        items.push({ label: this.quickCreateZones.externalMerch.name || this.t('intgShopsExternalAreaLong'), value: 'externalmerch' })
      return items
    },
    floorDialogZoneOptions() {
      const groundFloors = this.floorDialogFloors.filter(f => f.level >= 0)
      const nextFloorLevel = groundFloors.length
        ? Math.max(...groundFloors.map(f => this.getFloorNumber(f))) + 1
        : 0
      const nextBasementNumber = this.floorDialogFloors.filter(f => f.level < 0).length + 1

      const options = [
        { title: `${this.t('intgShopsFloorWord')} ${nextFloorLevel}`, value: '__new_floor__', icon: 'mdi-arrow-up-bold' },
        { title: nextBasementNumber === 1 ? this.t('intgShopsBasementWord') : `${this.t('intgShopsBasementWord')} ${nextBasementNumber}`, value: '__new_basement__', icon: 'mdi-arrow-down-bold' },
      ]
      if (!this.floorDialogZones.forecourt) {
        options.push({ title: 'Forecourt', value: '__new_forecourt__', icon: 'mdi-storefront-outline' })
      }
      if (!this.floorDialogZones.externalMerch) {
        options.push({ title: this.t('intgShopsExternalAreaLong'), value: '__new_externalmerch__', icon: 'mdi-map-marker-radius-outline' })
      }
      return options
    },
    floorDialogBatchOptions() {
      return this.locations.filter(l =>
        l.id !== this.floorDialogAnchorLocationId &&
        this.localMappings[l.id]
      )
    },
    elementItems() {
      const seenIds = new Set()
      const seenNames = new Set()
      return this.elements
        .filter(el => {
          if (!el.id) return false
          if (seenIds.has(el.id)) return false
          const nameKey = (el.name || '').toLowerCase().trim()
          if (nameKey && seenNames.has(nameKey)) return false
          seenIds.add(el.id)
          if (nameKey) seenNames.add(nameKey)
          return true
        })
        .map(el => ({
          id: el.id,
          label: el.name,
        }))
    },
    locationRows() {
      return this.locations.map(m => ({
        id: m.id,
        name: m.name || m.label || `Location ${m.weezeventId || m.id}`,
      }))
    },
    filteredRows() {
      if (this.activeTab === 'mapped') return this.locationRows.filter(r => !!this.localMappings[r.id])
      if (this.activeTab === 'unmapped') return this.locationRows.filter(r => !this.localMappings[r.id])
      return this.locationRows
    },
    displayedRows() {
      const q = this.search.toLowerCase().trim()
      if (!q) return this.filteredRows
      return this.filteredRows.filter(r => r.name.toLowerCase().includes(q))
    },
    autoSuggestionCount() {
      return Object.keys(this.autoSuggestions).filter(id => !this.localMappings[id]).length
    },
    hasPendingSaves() {
      return Object.values(this.savingRows).some(s => s === 'saving')
    },
    floorDialogConfigName() {
      if (!this.floorDialogConfigId) return ''
      return this.floorDialogConfigs.find(c => c.id === this.floorDialogConfigId)?.name || ''
    },
  },

  mounted() {
    if (this.location && this.spaceId) {
      this.loadData(this.location.id, this.spaceId)
    }
    window.addEventListener('locale-changed', this.handleLocaleChange)
  },

  beforeUnmount() {
    window.removeEventListener('locale-changed', this.handleLocaleChange)
  },

  // KeepAlive (IntegrationWizard.vue) garde ce composant monté entre deux étapes — mais
  // <Teleport> n'écoute pas deactivated(), son contenu resterait donc affiché dans le footer
  // partagé même une fois l'étape quittée (boutons de plusieurs étapes empilés). teleportActive
  // referme nous-mêmes le Teleport à la désactivation.
  activated() {
    this.teleportActive = true
  },
  deactivated() {
    this.teleportActive = false
  },

  watch: {
    spaceId(val) {
      if (val && this.location) {
        this.loadData(this.location.id, val)
      }
    },
  },

  methods: {
    t(key) {
      return translate(key, this.locale)
    },

    handleLocaleChange(event) {
      this.locale = event.detail.locale
    },

    // Boucle sur toutes les pages backend (comme getWeezeventLocations) : au-delà
    // de 1000 mappings, un seul appel {limit:1000} laisserait les mappings
    // excédentaires manquants, et les locations correspondantes s'afficheraient
    // à tort comme non mappées.
    async fetchAllLocationShopMappings(spaceId) {
      const first = await getLocationShopMappings(null, spaceId, { limit: 1000 })
      const items = [...(first?.data || [])]
      const totalPages = first?.meta?.totalPages ?? 1
      for (let page = 2; page <= totalPages; page++) {
        const res = await getLocationShopMappings(null, spaceId, { page, limit: 1000 })
        items.push(...(res?.data || []))
      }
      return items
    },

    async loadData(integrationId, spaceId) {
      this.loading = true
      this.error = null
      try {
        // Fetch in parallel:
        // - Weezevent locations for THIS integration
        // - DataFriday shops for THIS space
        // - Existing location→shop mappings scoped to THIS space
        // - Space configurations (to extract real floors)
        const configsPromise = this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId })
        // getSpaceFloorOptions dépend du configId résolu depuis configsPromise (pas seulement
        // de spaceId) — démarré dès que les configs sont connues, en parallèle du reste, au
        // lieu d'attendre la fin du Promise.all ci-dessous puis d'être lancé en série.
        const floorOptionsPromise = configsPromise.then(fetchedConfigs => {
          const configs = Array.isArray(fetchedConfigs) ? fetchedConfigs : []
          const userConfigs = configs.filter(c => !c.isSystem && c.name?.toLowerCase() !== 'weezevent import')
          // Route légère : zones v2 (par espace, même vides) + floors legacy v1 de la
          // config principale — remplace un getConfiguration COMPLET par config.
          return getSpaceFloorOptions(spaceId, userConfigs[0]?.id || null)
        })
        // Marque la promesse comme gérée dès sa création : le Promise.all ci-dessous peut
        // prendre plus longtemps que floorOptionsPromise, et un rejet non encore "await" à ce
        // moment déclencherait un warning unhandledrejection — la vraie erreur reste traitée
        // par le try/catch plus bas, au moment du await réel.
        floorOptionsPromise.catch(() => {})

        const [locRes, rawShops, allMappings, fetchedConfigs] = await Promise.all([
          // Cache TTL court (weezeventLocations.js, 5 min) au lieu d'un appel direct sans
          // cache — mêmes économies que spaceShops/spaceIntegrations sur les allers-retours.
          this.$store.dispatch('weezeventLocations/fetchForIntegration', { integrationId }),
          // Cache TTL déjà fonctionnel (spaceShops.js, 15 min) : plus de forceRefresh, un
          // aller-retour Précédent/Suivant sur cette étape réutilise le cache au lieu de
          // retaper le réseau.
          this.$store.dispatch('spaceShops/fetchForSpace', { spaceId }),
          this.fetchAllLocationShopMappings(spaceId),
          configsPromise,
        ])
        this._spaceConfigsCache = Array.isArray(fetchedConfigs) ? fetchedConfigs : []

        // Only show locations belonging to this integration
        this.locations = locRes?.data || []
        this.elements = rawShops.map(s => ({
          id: s.shopId || s.id,
          name: s.shopName || s.name,
          configName: s.configName,
          areaName: s.locationName,
        }))

        // Niveau d'étage par shop (renvoyé par le backend : floorLevel = level d'étage,
        // 'forecourt' ou 'externalmerch'). Sert à reconstruire le badge d'étage au
        // rechargement (sinon floorMap repart vide et le badge disparaît), et est
        // conservé sur l'instance pour être réutilisé par _updateMappingOne/executeBulk
        // quand un shop existant est associé en cours de session (sans recharger la page).
        const levelByShop = {}
        for (const s of rawShops) {
          const shopId = s.shopId || s.id
          if (s.floorLevel !== null && s.floorLevel !== undefined) levelByShop[shopId] = s.floorLevel
        }
        this._levelByShop = levelByShop

        // Build confirmed mappings from saved API data (only for this integration)
        const locationIds = new Set(this.locations.map(m => m.id))
        const map = {}
        for (const m of allMappings) {
          if (locationIds.has(m.weezeventLocationId)) {
            map[m.weezeventLocationId] = m.spaceElementId
          }
        }
        this.localMappings = map

        // Reconstruit floorMap (location → niveau) depuis les shops mappés : le badge
        // d'étage redevient visible après un refresh / changement de page.
        const floorMap = {}
        for (const [locationId, elementId] of Object.entries(map)) {
          if (levelByShop[elementId] !== undefined) floorMap[locationId] = levelByShop[elementId]
        }
        this.floorMap = floorMap
        this.savingRows = {}

        // Reconstruit floorMap + floorNameMap depuis les zones sauvegardées, pour que
        // les assignations floor survivent à un rechargement de page.
        try {
          const options = await floorOptionsPromise

          // elementId → { level, name } depuis les zones/floors retournés
          const elementFloorIndex = {}
          for (const floor of (options?.floors || [])) {
            for (const el of (floor.elements || [])) {
              if (el.id && !elementFloorIndex[el.id]) {
                elementFloorIndex[el.id] = { level: floor.level, name: floor.name || '' }
              }
            }
          }
          if (options?.forecourt) {
            for (const el of (options.forecourt.elements || [])) {
              if (el.id && !elementFloorIndex[el.id]) {
                elementFloorIndex[el.id] = { level: 'forecourt', name: options.forecourt.name || 'Forecourt' }
              }
            }
          }
          if (options?.externalMerch) {
            for (const el of (options.externalMerch.elements || [])) {
              if (el.id && !elementFloorIndex[el.id]) {
                elementFloorIndex[el.id] = { level: 'externalmerch', name: options.externalMerch.name || 'External' }
              }
            }
          }

          // Fusionne avec la 1ère passe (space-wide) au lieu d'écraser : les locations
          // dont le shop appartient à une config utilisateur autre que userConfigs[0]
          // ne seront pas trouvées dans elementFloorIndex (scopé à une seule config)
          // et doivent conserver la valeur déjà posée par la 1ère passe.
          const newFloorMap = { ...this.floorMap }
          const newFloorNameMap = { ...this.floorNameMap }
          for (const [locationId, elementId] of Object.entries(map)) {
            const info = elementFloorIndex[elementId]
            if (info) {
              newFloorMap[locationId] = info.level
              newFloorNameMap[locationId] = info.name || this.floorBadgeLabel(info.level)
            }
          }
          this.floorMap = newFloorMap
          this.floorNameMap = newFloorNameMap
          this._elementFloorIndex = elementFloorIndex
        } catch (e) {
          console.warn('[StepMapShops] Could not rebuild floorMap from configs:', e)
        }

        // Suggestions auto : 100% → appliqué directement, 70–99% → suggéré (confirmation requise)
        const suggestions = {}
        const perfectMatches = []
        for (const location of this.locations) {
          if (this.localMappings[location.id]) continue
          const match = this.findBestElementMatch(location.name)
          if (!match) continue
          if (match.matchScore === PERFECT_MATCH_SCORE) {
            perfectMatches.push({ locationId: location.id, elementId: match.id })
          } else if (match.matchScore >= SUGGESTED_MATCH_SCORE) {
            suggestions[location.id] = match.id
          }
        }
        this.autoSuggestions = suggestions

        // Pré-remplit floorMap pour les 100% : levelByShop est déjà chargé ici
        if (perfectMatches.length > 0) {
          const extraMap = { ...this.floorMap }
          for (const { locationId, elementId } of perfectMatches) {
            if (levelByShop[elementId] !== undefined && extraMap[locationId] === undefined) {
              extraMap[locationId] = levelByShop[elementId]
            }
          }
          this.floorMap = extraMap
        }

        // Applique les correspondances exactes sans attendre (fire-and-forget)
        for (const { locationId, elementId } of perfectMatches) {
          this.updateMapping(locationId, elementId)
        }
      } catch (err) {
        console.error('[StepMapShops] loadData error:', err)
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    findBestElementMatch(locationName) {
      if (!locationName || !this.elements.length) return null

      const normalize = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
      // Only keep tokens of 2+ chars to avoid single-letter false positives
      const tokenize = s => normalize(s).split(/\s+/).filter(w => w.length >= 2)

      const normName = normalize(locationName)
      const nameTokens = tokenize(locationName)

      let best = null
      let bestScore = 0

      for (const el of this.elements) {
        if (!el.name) continue
        const normEl = normalize(el.name)

        // Exact match → perfect score, return immediately
        if (normName === normEl) return { ...el, matchScore: PERFECT_MATCH_SCORE }

        const elTokens = tokenize(el.name)

        // Token overlap: only count tokens of 3+ chars as "meaningful"
        let tokenScore = 0
        if (nameTokens.length > 0 && elTokens.length > 0) {
          const common = nameTokens.filter(t =>
            elTokens.some(e =>
              e === t ||
              (e.length >= 3 && t.length >= 3 && (e.startsWith(t) || t.startsWith(e)))
            )
          )
          tokenScore = (common.length * 2) / (nameTokens.length + elTokens.length)
        }

        // Levenshtein on full normalized names
        const levScore = this.similarity(normName, normEl)

        const score = Math.max(tokenScore, levScore)

        if (score > bestScore && score > MIN_CANDIDATE_SCORE) {
          bestScore = score
          best = { ...el, matchScore: Math.round(score * 100) }
        }
      }
      return best
    },

    similarity(a, b) {
      if (a === b) return 1
      const longer = a.length > b.length ? a : b
      const shorter = a.length > b.length ? b : a
      if (longer.length === 0) return 1
      const costs = []
      for (let i = 0; i <= longer.length; i++) {
        let lastValue = i
        for (let j = 0; j <= shorter.length; j++) {
          if (i === 0) { costs[j] = j } else if (j > 0) {
            let newValue = costs[j - 1]
            if (longer[i - 1] !== shorter[j - 1])
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
            costs[j - 1] = lastValue
            lastValue = newValue
          }
        }
        if (i > 0) costs[shorter.length] = lastValue
      }
      return (longer.length - costs[shorter.length]) / longer.length
    },

    // Étage réel connu d'un shop, à partir des index construits par loadData().
    // elementFloorIndex a un nom mais est scopé à userConfigs[0] (BUG-208) ; levelByShop
    // est space-wide mais n'a que le niveau. On combine les deux au lieu de dépendre
    // uniquement de la reconstruction faite au rechargement de page.
    getFloorInfoForElement(elementId) {
      const fromIndex = this._elementFloorIndex?.[elementId]
      if (fromIndex) return fromIndex
      const level = this._levelByShop?.[elementId]
      if (level !== null && level !== undefined) return { level, name: null }
      return null
    },

    // Sérialise les appels concurrents pour une même location (double-clic / re-sélection
    // rapide sur le select) : sans ce verrou, deux createLocationShopMapping peuvent
    // partir en parallèle pour la même location, avec un ordre de résolution non garanti.
    updateMapping(locationId, elementId) {
      const previous = this._updateMappingLocks[locationId] || Promise.resolve()
      const run = previous.then(() => this._updateMappingOne(locationId, elementId))
      this._updateMappingLocks[locationId] = run.catch(() => {})
      return run
    },

    async _updateMappingOne(locationId, elementId) {
      // Valeur avant la mise à jour optimiste, pour pouvoir faire un rollback
      // symétrique à applyAutoSuggestions en cas d'échec.
      const previousElementId = this.localMappings[locationId]
      const previousFloor = this.floorMap[locationId]
      const previousFloorName = this.floorNameMap[locationId]

      // Update local state immediately
      const updated = { ...this.localMappings }
      if (elementId == null) {
        delete updated[locationId]
      } else {
        updated[locationId] = elementId
      }
      this.localMappings = updated
      // Remove auto-suggestion for this row (user has made an explicit choice)
      const suggestions = { ...this.autoSuggestions }
      delete suggestions[locationId]
      this.autoSuggestions = suggestions

      // Reprend l'étage réel du shop choisi (existant) : sans ça le badge disparaît
      // et le dialogue d'assignation d'étage s'ouvre vide tant que la page n'a pas
      // été rechargée, ce qui pousse à re-choisir/écraser manuellement l'étage.
      const floorInfo = elementId != null ? this.getFloorInfoForElement(elementId) : null
      const floorMap = { ...this.floorMap }
      const floorNameMap = { ...this.floorNameMap }
      if (floorInfo) {
        floorMap[locationId] = floorInfo.level
        floorNameMap[locationId] = floorInfo.name || this.floorBadgeLabel(floorInfo.level)
      } else {
        delete floorMap[locationId]
        delete floorNameMap[locationId]
      }
      this.floorMap = floorMap
      this.floorNameMap = floorNameMap

      // Persist to API
      this.savingRows = { ...this.savingRows, [locationId]: 'saving' }
      try {
        if (elementId == null) {
          await deleteLocationShopMapping(locationId)
        } else {
          await createLocationShopMapping(locationId, elementId)
        }
        this.savingRows = { ...this.savingRows, [locationId]: 'saved' }
      } catch (err) {
        if (err?.response?.status === 409) {
          // Mapping déjà en base — pas d'erreur à afficher
          this.savingRows = { ...this.savingRows, [locationId]: 'saved' }
        } else {
          console.error('[StepMapShops] auto-save error:', err)
          // Rollback de la mise à jour optimiste : on restaure l'état pré-appel
          // (absent, ou mappé vers un autre élément) sinon la ligne reste
          // faussement "mappée" (compteurs gonflés, badge d'erreur invisible
          // dans la branche "non mappée").
          const rolledBack = { ...this.localMappings }
          if (previousElementId == null) {
            delete rolledBack[locationId]
          } else {
            rolledBack[locationId] = previousElementId
          }
          this.localMappings = rolledBack
          const rolledBackFloorMap = { ...this.floorMap }
          const rolledBackFloorNameMap = { ...this.floorNameMap }
          if (previousFloor === undefined) {
            delete rolledBackFloorMap[locationId]
          } else {
            rolledBackFloorMap[locationId] = previousFloor
          }
          if (previousFloorName === undefined) {
            delete rolledBackFloorNameMap[locationId]
          } else {
            rolledBackFloorNameMap[locationId] = previousFloorName
          }
          this.floorMap = rolledBackFloorMap
          this.floorNameMap = rolledBackFloorNameMap
          this.savingRows = { ...this.savingRows, [locationId]: 'error' }
        }
      }
    },

    // Applique toutes les suggestions en UN appel (POST /mappings/location-shop/bulk)
    // au lieu d'un POST unitaire par ligne.
    async applyAutoSuggestions() {
      const pairs = Object.entries(this.autoSuggestions)
        .filter(([locationId, elementId]) => !this.localMappings[locationId] && elementId)
      const clearedSuggestions = this.autoSuggestions
      this.autoSuggestions = {}
      if (!pairs.length) return

      // UI optimiste : lignes en 'saving' pendant l'appel
      const optimistic = { ...this.localMappings }
      const saving = { ...this.savingRows }
      for (const [locationId, elementId] of pairs) {
        optimistic[locationId] = elementId
        saving[locationId] = 'saving'
      }
      this.localMappings = optimistic
      this.savingRows = saving

      try {
        const res = await bulkLocationShopMappings(
          pairs.map(([weezeventLocationId, spaceElementId]) => ({ weezeventLocationId, spaceElementId }))
        )
        const failedIds = new Set((res?.errors || []).map(e => e.weezeventLocationId))
        const savedRows = { ...this.savingRows }
        const mappings = { ...this.localMappings }
        for (const [locationId] of pairs) {
          if (failedIds.has(locationId)) {
            savedRows[locationId] = 'error'
            delete mappings[locationId]
          } else {
            savedRows[locationId] = 'saved'
          }
        }
        this.savingRows = savedRows
        this.localMappings = mappings
        if (failedIds.size > 0) {
          this.error = `${failedIds.size} ${this.t('intgShopsMappingFailedSuffix')}`
        }
      } catch (err) {
        console.error('[StepMapShops] applyAutoSuggestions error:', err)
        // Échec global : on annule l'optimisme, on marque les lignes en erreur et on
        // restaure les suggestions effacées en amont (sinon elles disparaissent
        // définitivement côté client alors que rien n'a été écrit côté serveur).
        const savedRows = { ...this.savingRows }
        const mappings = { ...this.localMappings }
        for (const [locationId] of pairs) {
          savedRows[locationId] = 'error'
          delete mappings[locationId]
        }
        this.savingRows = savedRows
        this.localMappings = mappings
        this.autoSuggestions = clearedSuggestions
        this.error = err?.response?.data?.message || err.message
      }
    },

    async acceptSuggestion(locationId) {
      const elementId = this.autoSuggestions[locationId]
      if (elementId) await this.updateMapping(locationId, elementId)
    },

    rejectSuggestion(locationId) {
      const suggestions = { ...this.autoSuggestions }
      delete suggestions[locationId]
      this.autoSuggestions = suggestions
    },

    async handleSave() {
      // Mappings are already auto-saved on each change.
      // Wait for any in-flight saves to settle before advancing.
      const inFlight = Object.values(this.savingRows).filter(s => s === 'saving').length
      if (inFlight > 0) {
        // Poll until no more saving rows (max 5s)
        await new Promise(resolve => {
          const check = () => {
            const still = Object.values(this.savingRows).filter(s => s === 'saving').length
            if (still === 0) return resolve()
            setTimeout(check, 200)
          }
          setTimeout(check, 200)
          setTimeout(resolve, 5000) // safety timeout
        })
      }
      const erroredCount = Object.values(this.savingRows).filter(s => s === 'error').length
      if (erroredCount > 0) {
        this.error = `${erroredCount} ${this.t('intgShopsMappingFailedSuffix')}`
        return
      }
      this.$emit('completed', { merchants: this.mappedCount })
    },

    handleSkipUnmapped() {
      this.$emit('completed', { merchants: this.mappedCount })
    },

    async openQuickCreate(location) {
      this.quickCreateLocation = location
      this.quickCreateForm = { name: location.name || '', type: 'shop', area: '', configId: null, floorLevel: null, posX: 31, posY: 34, width: 4, depth: 4, height: 4 }
      this.quickCreateError = null
      this.quickCreateFloors = []
      this.quickCreateZones = { forecourt: null, externalMerch: null }
      this.quickCreateConfigsLoading = true
      try {
        if (!this._spaceConfigsCache.length) {
          const fetched = await this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId: this.spaceId })
          this._spaceConfigsCache = Array.isArray(fetched) ? fetched : []
        }
        const userConfigs = (this._spaceConfigsCache || [])
          .filter(c => !c.isSystem && c.name?.toLowerCase() !== 'weezevent import')
        if (userConfigs.length === 1) {
          this.quickCreateForm.configId = userConfigs[0].id
          await this.onQuickCreateConfigChange(userConfigs[0].id)
        }
      } finally {
        this.quickCreateConfigsLoading = false
      }
      this.quickCreateOpen = true
    },

    async onQuickCreateConfigChange(configId) {
      this.quickCreateFloors = []
      this.quickCreateZones = { forecourt: null, externalMerch: null }
      this.quickCreateForm.floorLevel = null
      if (!configId) return
      this.quickCreateFloorsLoading = true
      try {
        // Même route légère que le dialogue « Assigner un étage » (zones v2 même vides).
        const options = await getSpaceFloorOptions(this.spaceId, configId)
        this.quickCreateFloors = (options?.floors || []).filter(f => f.level !== undefined)
        this.quickCreateZones = { forecourt: options?.forecourt || null, externalMerch: options?.externalMerch || null }
        if (this.quickCreateFloorOptions.length === 1)
          this.quickCreateForm.floorLevel = this.quickCreateFloorOptions[0].value
      } catch (e) {
        console.error('[StepMapShops] onQuickCreateConfigChange error:', e)
      } finally {
        this.quickCreateFloorsLoading = false
      }
    },

    async submitQuickCreate() {
      if (!this.quickCreateForm.name) return
      this.quickCreateSaving = true
      this.quickCreateError = null
      try {
        const created = await quickCreateSpaceElement(this.spaceId, {
          name: this.quickCreateForm.name,
          type: this.quickCreateForm.type,
          area: this.quickCreateForm.area || undefined,
        })
        const newElement = {
          id: created.shopId || created.id,
          name: created.shopName || created.name,
          configName: created.configName || '',
          areaName: created.locationName || '',
        }
        this.elements = [...this.elements, newElement]
        this.updateMapping(this.quickCreateLocation.id, newElement.id)
        if (this.quickCreateForm.configId && this.quickCreateForm.floorLevel != null) {
          await assignShopsFloor(this.spaceId, [newElement.id], this.quickCreateForm.floorLevel, {
            configId: this.quickCreateForm.configId,
          })
          this.floorMap = { ...this.floorMap, [this.quickCreateLocation.id]: this.quickCreateForm.floorLevel }
        }
        this.$store.dispatch('spaceShops/invalidateForSpace', this.spaceId)
        this.quickCreateOpen = false
      } catch (err) {
        console.error('[StepMapShops] submitQuickCreate error:', err)
        this.quickCreateError = err?.response?.data?.message || err.message
      } finally {
        this.quickCreateSaving = false
      }
    },
    // Ouvre le récap AVANT toute écriture : matching par nom fait localement,
    // l'utilisateur voit ce qui sera mappé et choisit si les shops manquants sont créés.
    openBulkConfirm() {
      const unmapped = this.locations.filter(l => !this.localMappings[l.id])
      if (!unmapped.length) return
      const matched = []
      const unmatched = []
      for (const location of unmapped) {
        // Réutilise le même matcher (token-overlap + Levenshtein, seuil > 0.5) que le
        // reste du fichier, au lieu d'une égalité exacte naïve — sinon des noms
        // quasi-identiques ("Bar - Central" vs "Bar Central") créent un doublon.
        const existing = this.findBestElementMatch(location.name)
        if (existing) matched.push({ location, element: existing })
        else unmatched.push(location)
      }
      this.bulkPlan = { matched, unmatched }
      this.bulkCreateMissing = unmatched.length > 0
      this.bulkConfirmOpen = true
    },

    // Confirmation du récap : vérifie qu'une config utilisateur existe si des
    // créations sont demandées, puis lance le bulk.
    async confirmBulk() {
      this.bulkConfirmOpen = false
      if (this.bulkCreateMissing && this.bulkPlan.unmatched.length) {
        // Même garde que openQuickCreate/openFloorDialog : ne refetch que si le cache local
        // (déjà peuplé par loadData au montage) est vide.
        if (!this._spaceConfigsCache.length) {
          const fetched = await this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId: this.spaceId })
          this._spaceConfigsCache = Array.isArray(fetched) ? fetched : []
        }
        if (!this.bulkUserConfigs.length) {
          this.configCreateContext = 'bulk'
          this.configCreateError = null
          this.configForm = { configName: 'Configuration principale', floorName: 'RDC', floorWidth: 100, floorLength: 100 }
          this.configCreateDialog = true
          return
        }
      }
      await this.executeBulk()
    },

    async confirmConfigCreate() {
      this.creatingConfig = true
      this.configCreateError = null
      // Capturé avant le reset de configForm : RDC saisi par l'utilisateur.
      const rdcWidth = this.configForm.floorWidth || 100
      const rdcLength = this.configForm.floorLength || 100
      const rdcName = this.configForm.floorName || 'RDC'
      try {
        let configName = (this.configForm.configName || '').trim()
        if (!configName || configName.toLowerCase() === 'weezevent import') configName = 'Configuration principale'

        // Création NATIVE v2 (builder-v2) : plus de conversion v1→v2 qui perdait les
        // dimensions. La config puis, pour le RDC, une vraie zone v2 (width/length
        // portés nativement — c'est ce que lit le 3D Builder via getBuilderState).
        const created = await createConfigurationV2(this.spaceId, { name: configName })
        if (created?.id) {
          this._spaceConfigsCache = [
            ...(this._spaceConfigsCache || []).filter(c => c.id !== created.id),
            { id: created.id, name: created.name, capacity: 0 },
          ]
        }

        // RDC : réutilise un floor niveau 0 déjà présent (dims mises à jour) sinon
        // le crée comme zone v2 aux dimensions saisies. Non bloquant.
        try {
          const bs = await getBuilderState(this.spaceId)
          const existingRdc = (bs?.zones || []).find(
            z => Number(z.level) === 0 && String(z.kind || 'FLOOR').toUpperCase() === 'FLOOR',
          )
          if (existingRdc?.id) {
            if (Number(existingRdc.width) !== rdcWidth || Number(existingRdc.length) !== rdcLength) {
              await updateZone(existingRdc.id, { width: rdcWidth, length: rdcLength })
            }
          } else {
            await createZone(this.spaceId, {
              kind: 'FLOOR', level: 0, name: rdcName,
              width: rdcWidth, length: rdcLength, height: 4,
            })
          }
        } catch (e) {
          console.warn('[StepMapShops] Création/màj RDC (v2) échouée :', e)
        }

        this.configCreateDialog = false
        this.configForm = { configName: 'Configuration principale', floorName: 'RDC', floorWidth: 100, floorLength: 100 }
        if (this.configCreateContext === 'floor') {
          // Sélectionne la nouvelle config dans le dialogue d'étage et charge ses floors
          this.floorDialogConfigs = [...this._spaceConfigsCache]
          this.floorDialogConfigId = created?.id || null
          // Mémorise les dims du RDC saisies AVANT le rechargement : la route légère
          // peut ne pas les renvoyer, ce qui écraserait le RDC à 100×100 à la 1re
          // assignation. onFloorDialogConfigChange (même config) fusionnera en gardant ceci.
          if (created?.id) {
            this.appliedDimsConfigId = created.id
            this.appliedFloorDims = { 0: { width: rdcWidth, length: rdcLength, height: 4 } }
          }
          if (this.floorDialogConfigId) await this.onFloorDialogConfigChange(this.floorDialogConfigId)
        } else {
          await this.executeBulk()
        }
      } catch (err) {
        console.error('[StepMapShops] confirmConfigCreate error:', err)
        this.configCreateError = err?.response?.data?.message || err.message
      } finally {
        this.creatingConfig = false
      }
    },

    skipConfigCreate() {
      this.configCreateDialog = false
      this.configCreateError = null
      this.configForm = { configName: 'Configuration principale', floorName: 'RDC', floorWidth: 100, floorLength: 100 }
    },

    // Exécute le bulk en UN appel API : le backend crée les éléments manquants
    // (zone RDC, grille), upserte les mappings et invalide son cache une seule fois.
    async executeBulk() {
      const items = [
        ...this.bulkPlan.matched.map(({ location, element }) => ({
          weezeventLocationId: location.id,
          name: location.name || `Location ${location.id}`,
          elementId: element.id,
        })),
        ...(this.bulkCreateMissing
          ? this.bulkPlan.unmatched.map(l => ({
              weezeventLocationId: l.id,
              name: l.name || `Location ${l.id}`,
              type: 'shop',
            }))
          : []),
      ]
      if (!items.length) return
      this.bulkCreating = true
      this.bulkCreateTotal = items.length
      this.error = null
      try {
        const res = await bulkQuickCreateAndMap(this.spaceId, items)
        const updatedMappings = { ...this.localMappings }
        const updatedSaving = { ...this.savingRows }
        const suggestions = { ...this.autoSuggestions }
        const floorMap = { ...this.floorMap }
        const floorNameMap = { ...this.floorNameMap }
        const newElements = []
        for (const r of (res?.mapped || [])) {
          updatedMappings[r.weezeventLocationId] = r.elementId
          updatedSaving[r.weezeventLocationId] = 'saved'
          delete suggestions[r.weezeventLocationId]
          if (r.created) {
            newElements.push({ id: r.elementId, name: r.elementName, configName: r.configName || '', areaName: r.areaName || '' })
            if (r.floorLevel !== null && r.floorLevel !== undefined) {
              floorMap[r.weezeventLocationId] = r.floorLevel
              floorNameMap[r.weezeventLocationId] = r.areaName || this.floorBadgeLabel(r.floorLevel)
            }
          } else {
            // Shop existant matché en masse : le backend renvoie floorLevel=null pour
            // ces lignes (seuls les shops nouvellement créés le renseignent), donc on
            // reprend l'étage réel via l'index construit par loadData().
            const floorInfo = this.getFloorInfoForElement(r.elementId)
            if (floorInfo) {
              floorMap[r.weezeventLocationId] = floorInfo.level
              floorNameMap[r.weezeventLocationId] = floorInfo.name || this.floorBadgeLabel(floorInfo.level)
            }
          }
        }
        this.localMappings = updatedMappings
        this.savingRows = updatedSaving
        this.autoSuggestions = suggestions
        this.floorMap = floorMap
        this.floorNameMap = floorNameMap
        if (newElements.length) this.elements = [...this.elements, ...newElements]
        if (res?.errors?.length) {
          this.error = `${res.errors.length} ${this.t('intgShopsMappingFailedSuffix')}`
        }
        this.$store.dispatch('spaceShops/invalidateForSpace', this.spaceId)
        this._spaceConfigsCache = []
      } catch (err) {
        console.error('[StepMapShops] executeBulk error:', err)
        this.error = err?.response?.data?.message || err.message
      } finally {
        this.bulkCreating = false
      }
    },

    async openFloorDialog(locationId) {
      this.floorDialogAnchorLocationId = locationId
      this.floorDialogBatchIds = []
      this.floorDialogConfigId = null
      this.floorDialogFloors = []
      this.floorDialogZones = { forecourt: null, externalMerch: null }
      this.floorDialogLevel = this.floorMap[locationId] !== undefined ? this.floorMap[locationId] : null
      this.floorDialogPosition = { x: 31, y: 34 }
      this.floorDialogZoneName = ''
      this.newFloorDimensions = { width: 100, length: 100, height: 4 }
      this.floorDialogShopDimensions = { width: 4, depth: 4, height: 4 }

      // Ouvre le dialogue TOUT DE SUITE : les chargements se font derrière les
      // loaders internes (avant, le clic paraissait mort le temps du fetch).
      this.floorDialogOpen = true

      // Si le cache est vide, invalider et refetch pour s'assurer d'avoir la config
      // créée lors de l'étape précédente (race condition post-création de space).
      if (!this._spaceConfigsCache.length) {
        const fetched = await this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId: this.spaceId })
        this._spaceConfigsCache = Array.isArray(fetched) ? fetched : []
      }

      this.floorDialogConfigs = [...this._spaceConfigsCache]
      const isUserConfig = c => !c.isSystem && c.name?.toLowerCase() !== 'weezevent import'
      const userConfigs = this.floorDialogConfigs.filter(isUserConfig)
      if (userConfigs.length === 1) {
        this.floorDialogConfigId = userConfigs[0].id
        await this.onFloorDialogConfigChange(userConfigs[0].id)
      }
    },

    async onFloorDialogConfigChange(configId) {
      if (!configId) {
        this.floorDialogFloors = []
        this.floorDialogZones = { forecourt: null, externalMerch: null }
        this.floorDialogLevel = null
        return
      }
      if (configId === '__create_config__') {
        this.floorDialogConfigId = null
        this.configCreateContext = 'floor'
        this.configCreateError = null
        this.configForm = { configName: 'Configuration principale', floorName: 'RDC', floorWidth: 100, floorLength: 100 }
        this.configCreateDialog = true
        return
      }
      this.floorDialogFloorsLoading = true
      this.floorDialogFloors = []
      this.floorDialogZones = { forecourt: null, externalMerch: null }
      this.floorDialogLevel = null
      try {
        // Route légère : zones v2 (même vides) + floors legacy v1 — plus de
        // getConfiguration (fusion complète) qui masquait les zones sans élément.
        const options = await getSpaceFloorOptions(this.spaceId, configId)
        this.floorDialogFloors = (options?.floors || []).filter(f => f.level !== undefined)
        // Amorce le cache d'héritage avec les dimensions connues des floors chargés.
        // Même config : les dims modifiées pendant la session priment sur le seed backend
        // (au cas où la route légère ne renvoie pas encore les dernières dimensions).
        const seed = {}
        for (const f of this.floorDialogFloors) {
          if (typeof f.level === 'number' && (f.width || f.length)) {
            seed[f.level] = { width: f.width, length: f.length, height: f.height ?? 4 }
          }
        }
        this.appliedFloorDims = this.appliedDimsConfigId === configId
          ? { ...seed, ...this.appliedFloorDims }
          : seed
        this.appliedDimsConfigId = configId
        this.floorDialogZones = {
          forecourt: options?.forecourt || null,
          externalMerch: options?.externalMerch || null,
        }

        // Réamorce le niveau affiché depuis l'étage réel du shop de la location
        // ancrée, une fois les floors de la config chargés (floorMap peut être vide
        // si le shop existant vient d'être associé sans passer par un rechargement).
        const anchorElementId = this.localMappings[this.floorDialogAnchorLocationId]
        const knownLevel = this.floorMap[this.floorDialogAnchorLocationId] !== undefined
          ? this.floorMap[this.floorDialogAnchorLocationId]
          : anchorElementId ? this.getFloorInfoForElement(anchorElementId)?.level : undefined
        if (knownLevel !== undefined) this.floorDialogLevel = knownLevel
      } catch (e) {
        console.error('[StepMapShops] onFloorDialogConfigChange error:', e)
      } finally {
        this.floorDialogFloorsLoading = false
      }
    },

    // Numéro "affiché" d'un floor : le plus grand entre `level` et le nombre
    // présent dans son nom ("Floor 1" -> 1). Mirroir de SpaceBuilderViewRoute.
    getFloorNumber(floor) {
      const nameMatch = (floor.name || '').match(/floor\s*(\d+)/i)
      const nameNumber = nameMatch ? Number(nameMatch[1]) : -Infinity
      const levelNumber = typeof floor.level === 'number' && !Number.isNaN(floor.level) ? floor.level : -Infinity
      return Math.max(nameNumber, levelNumber)
    },

    floorBadgeLabel(value) {
      if (value === 'forecourt') return 'FC'
      if (value === 'externalmerch') return 'EXT'
      if (value === 0) return 'RDC'
      if (value < 0) return `S${Math.abs(value)}`
      return `E${value}`
    },

    floorBadgeIcon(value) {
      if (value === 'forecourt' || value === 'externalmerch') return 'mdi-map-marker-radius'
      return 'mdi-layers'
    },

    // Résout la zone choisie via "Ajouter une zone" en un `level` (numérique pour
    // Floor/Basement, ou 'forecourt'/'externalmerch'). On ne réécrit pas la
    // configuration ici : assignShopsFloor crée le floor correspondant côté backend
    // s'il n'existe pas encore (cf. sa docstring), ce qui évite de renvoyer les floors
    // existants (avec leurs éléments déjà créés) via updateConfiguration, qui causait
    // une erreur 500 (prisma.spaceElement.create() — contrainte unique sur id).
    resolveNewZoneLevel(zoneType) {
      if (zoneType === '__new_floor__' || zoneType === '__new_basement__') {
        if (zoneType === '__new_basement__') {
          // Sous-sol N au niveau immédiatement sous le plus profond existant
          // (-1, -2, -3…) : chaque basement est distinct, plus de collision à -1.
          const levels = [
            ...this.floorDialogFloors.filter(f => f.level < 0).map(f => f.level),
            ...Object.keys(this.appliedFloorDims || {}).map(Number).filter(l => l < 0),
          ]
          return levels.length ? Math.min(...levels) - 1 : -1
        }
        const groundFloors = this.floorDialogFloors.filter(f => f.level >= 0)
        return groundFloors.length
          ? Math.max(...groundFloors.map(f => this.getFloorNumber(f))) + 1
          : 0
      }
      if (zoneType === '__new_forecourt__') return 'forecourt'
      if (zoneType === '__new_externalmerch__') return 'externalmerch'
      return null
    },

    // Sélectionne une nouvelle zone ("Floor N" / "Basement N" / ...) et, pour les
    // floors/basements, pré-remplit newFloorDimensions avec les dimensions du
    // floor n-1 (le floor adjacent déjà présent dans le builder).
    startDragShop(e) {
      this.isDraggingShop = true
      this.shopDragStart = {
        mouseX: e.offsetX,
        mouseY: e.offsetY,
        posX: this.floorDialogPosition.x,
        posY: this.floorDialogPosition.y,
      }
    },
    onDragShopMove(e) {
      if (!this.isDraggingShop || !this.shopDragStart) return
      const fd = this.selectedFloorData
      const floorW = fd?.width || this.newFloorDimensions.width || 100
      const floorL = fd?.length || this.newFloorDimensions.length || 100
      const maxX = Math.max(0, floorW - this.floorDialogShopDimensions.width)
      const maxY = Math.max(0, floorL - this.floorDialogShopDimensions.depth)
      const dx = (e.offsetX - this.shopDragStart.mouseX) / this.floorPreviewScale
      const dy = (e.offsetY - this.shopDragStart.mouseY) / this.floorPreviewScale
      this.floorDialogPosition.x = Math.max(0, Math.min(maxX, Math.round((this.shopDragStart.posX + dx) * 10) / 10))
      this.floorDialogPosition.y = Math.max(0, Math.min(maxY, Math.round((this.shopDragStart.posY + dy) * 10) / 10))
    },
    onDragShopEnd() {
      this.isDraggingShop = false
      this.shopDragStart = null
    },
    handleFloorPreviewClick(e) {
      if (this.isDraggingShop) return
      const svg = e.currentTarget
      const rect = svg.getBoundingClientRect()
      const svgX = e.clientX - rect.left
      const svgY = e.clientY - rect.top
      const fd = this.selectedFloorData
      const floorW = fd?.width || this.newFloorDimensions.width || 100
      const floorL = fd?.length || this.newFloorDimensions.length || 100
      const maxX = Math.max(0, floorW - this.floorDialogShopDimensions.width)
      const maxY = Math.max(0, floorL - this.floorDialogShopDimensions.depth)
      const cx = svgX / this.floorPreviewScale - this.floorDialogShopDimensions.width / 2
      const cy = svgY / this.floorPreviewScale - this.floorDialogShopDimensions.depth / 2
      this.floorDialogPosition.x = Math.max(0, Math.min(maxX, Math.round(cx * 10) / 10))
      this.floorDialogPosition.y = Math.max(0, Math.min(maxY, Math.round(cy * 10) / 10))
    },

    // Sélection d'un floor déjà présent : les dimensions viennent du cache de
    // session en priorité (la route légère peut avoir omis width/length ; sans ça
    // on ré-écraserait le floor à 100×100 à la prochaine assignation).
    pickExistingFloor(floor) {
      this.floorDialogLevel = floor.level
      this.floorDialogZoneName = floor.name || ''
      const cached = this.appliedFloorDims?.[floor.level]
      this.newFloorDimensions = {
        width: cached?.width || floor.width || 100,
        length: cached?.length || floor.length || 100,
        height: cached?.height || floor.height || 4,
      }
    },
    selectNewZone(zoneType) {
      this.floorDialogLevel = zoneType
      if (zoneType === '__new_floor__') {
        const groundFloors = this.floorDialogFloors.filter(f => f.level >= 0)
        const nextLevel = groundFloors.length ? Math.max(...groundFloors.map(f => this.getFloorNumber(f))) + 1 : 0
        this.floorDialogZoneName = nextLevel === 0 ? this.t('intgShopsGroundFloorShort') : `${this.t('intgShopsFloorWord')} ${nextLevel}`
        this.newFloorDimensions = this.defaultFloorDimensions(zoneType)
      } else if (zoneType === '__new_basement__') {
        const n = this.floorDialogFloors.filter(f => f.level < 0).length + 1
        this.floorDialogZoneName = n === 1 ? this.t('intgShopsBasementWord') : `${this.t('intgShopsBasementWord')} ${n}`
        this.newFloorDimensions = this.defaultFloorDimensions(zoneType)
      } else if (zoneType === '__new_forecourt__') {
        this.floorDialogZoneName = 'Forecourt'
        this.newFloorDimensions = this.defaultFloorDimensions(zoneType)
      } else if (zoneType === '__new_externalmerch__') {
        this.floorDialogZoneName = this.t('intgShopsExternalAreaLong')
        this.newFloorDimensions = this.defaultFloorDimensions(zoneType)
      }
    },

    // Dimensions par défaut d'un nouveau floor/basement : celles du floor n-1
    // (le floor immédiatement adjacent dans l'empilement), sinon une valeur par
    // défaut (100m x 100m x 4m).
    defaultFloorDimensions(zoneType) {
      const HARD = { width: 100, length: 100, height: 4 }

      // Forecourt : valeur fixe 200 × 200, AUCUN héritage.
      if (zoneType === '__new_forecourt__') {
        return { width: 200, length: 200, height: 4 }
      }
      // External Area : valeur fixe 100 × 100, AUCUN héritage.
      if (zoneType === '__new_externalmerch__') {
        return { ...HARD }
      }

      // Dimensions connues pour un niveau : priorité au cache de session
      // (appliedFloorDims — reflète les dernières dims saisies par l'utilisateur),
      // sinon le floor chargé depuis le backend.
      const dimsForLevel = (lvl) => {
        const s = this.appliedFloorDims?.[lvl]
        if (s && (s.width || s.length)) return s
        const f = this.floorDialogFloors.find(ff => ff.level === lvl || this.getFloorNumber(ff) === lvl)
        if (f && (f.width || f.length)) return f
        return null
      }

      let ref = null

      if (zoneType === '__new_floor__') {
        // Étage N hérite de l'étage N-1 (le plus haut déjà présent).
        // 1er étage → RDC (niveau 0). Si l'étage N-1 a été redimensionné, on
        // hérite de SA valeur (via appliedFloorDims), plus celle du RDC.
        const levels = [
          ...this.floorDialogFloors.filter(f => f.level >= 0).map(f => this.getFloorNumber(f)),
          ...Object.keys(this.appliedFloorDims || {}).map(Number).filter(l => l >= 0),
        ]
        const top = levels.length ? Math.max(...levels) : 0
        ref = dimsForLevel(top) || dimsForLevel(0)
      } else if (zoneType === '__new_basement__') {
        // Sous-sol N hérite du sous-sol adjacent = le plus PROFOND déjà présent
        // (Math.min des niveaux négatifs), sinon du RDC (0) pour le 1er basement.
        const levels = [
          ...this.floorDialogFloors.filter(f => f.level < 0).map(f => f.level),
          ...Object.keys(this.appliedFloorDims || {}).map(Number).filter(l => l < 0),
        ]
        ref = levels.length ? dimsForLevel(Math.min(...levels)) : dimsForLevel(0)
      }

      if (!ref) return { ...HARD }
      return {
        width: ref.width ?? HARD.width,
        length: ref.length ?? HARD.length,
        height: ref.height ?? HARD.height,
      }
    },

    async applyFloorDialog() {
      const anchorElementId = this.localMappings[this.floorDialogAnchorLocationId]
      if (!anchorElementId) return
      // On exige une configuration utilisateur cible (étape 1 / 3D Builder) : c'est elle qui
      // recevra les shops. Plus de repli sur une config « Weezevent Import » auto-générée.
      if (!this.floorDialogConfigId) {
        this.error = this.t('intgShopsSelectConfigBeforeAssign')
        return
      }
      this.floorSaving = true
      this.error = null
      try {
        // Si l'utilisateur a choisi de créer une nouvelle zone via "Ajouter une zone",
        // on résout le level/zone correspondant — assignShopsFloor créera le floor
        // côté backend, DANS la configuration sélectionnée, si nécessaire.
        if (typeof this.floorDialogLevel === 'string' && this.floorDialogLevel.startsWith('__new_')) {
          this.floorDialogLevel = this.resolveNewZoneLevel(this.floorDialogLevel)
        }

        const allLocationIds = [this.floorDialogAnchorLocationId, ...this.floorDialogBatchIds]
        const elementIds = allLocationIds.map(locId => this.localMappings[locId]).filter(Boolean)

        // UN SEUL appel : le backend assigne les SpaceElements (v2 : zone + adhésion en
        // batch ; legacy v1 : Floor + sync JSON) ET applique nom de zone, position et
        // dimensions. Plus de getConfiguration + updateConfiguration full-save côté
        // front — c'était le reconcile complet de la config à chaque assignation.
        await assignShopsFloor(this.spaceId, elementIds, this.floorDialogLevel, {
          configId: this.floorDialogConfigId,
          width: this.newFloorDimensions?.width,
          length: this.newFloorDimensions?.length,
          height: this.newFloorDimensions?.height,
          zoneName: this.floorDialogZoneName || undefined,
          position: { x: this.floorDialogPosition.x, y: this.floorDialogPosition.y },
          shopDimensions: {
            width: this.floorDialogShopDimensions.width,
            depth: this.floorDialogShopDimensions.depth,
            height: this.floorDialogShopDimensions.height,
          },
        })

        // Mémorise les dimensions appliquées à ce niveau : le prochain étage/sous-sol
        // ajouté dans cette config héritera de CES dimensions (et non plus du RDC).
        if (typeof this.floorDialogLevel === 'number') {
          this.appliedFloorDims = {
            ...this.appliedFloorDims,
            [this.floorDialogLevel]: {
              width: this.newFloorDimensions?.width,
              length: this.newFloorDimensions?.length,
              height: this.newFloorDimensions?.height,
            },
          }
        }

        const assignedFloorName = this.floorDialogZoneName
          || this.selectedFloorData?.name
          || this.floorBadgeLabel(this.floorDialogLevel)
        for (const locId of allLocationIds) {
          this.floorMap = { ...this.floorMap, [locId]: this.floorDialogLevel }
          this.floorNameMap = { ...this.floorNameMap, [locId]: assignedFloorName }
        }
        // Invalide le cache local des configs : le prochain dialogue relira frais.
        this._spaceConfigsCache = []
        this.floorDialogOpen = false
      } catch (err) {
        console.error('[StepMapShops] applyFloorDialog error:', err)
        this.error = err?.response?.data?.message || err.message
      } finally {
        this.floorSaving = false
      }
    },
  },
}
</script>

<style scoped>
/* ── Wrapper ── */
.sms-wrap { padding: 20px 24px; min-height: 100%; background: #f9fafb; }
.sms--dark { background: #111827; color: #e5e7eb; }

/* ── Gradient Header ── */
.sms-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px; border-radius: 18px; margin-bottom: 16px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.sms-header__icon {
  width: 46px; height: 46px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sms-header__body { flex: 1; min-width: 0; }
.sms-header__title { font-size: 16px; font-weight: 700; color: #fff; margin: 0 0 3px; }
.sms-header__step  { font-size: 13px; font-weight: 400; opacity: .72; }
.sms-header__sub   { font-size: 12.5px; color: rgba(255,255,255,.72); margin: 0; }
.sms-prog-badge {
  display: inline-flex; align-items: center; padding: 4px 14px;
  border-radius: 100px; font-size: 12px; font-weight: 700;
  white-space: nowrap; flex-shrink: 0;
}
.sms-prog-badge--green { background: rgba(255,255,255,.22); color: #fff; }
.sms-prog-badge--gray  { background: rgba(0,0,0,.15); color: rgba(255,255,255,.85); }

/* ── Loading skeletons ── */
.sms-skeletons { display: flex; flex-direction: column; gap: 8px; }
.sms-skeleton-row {
  height: 62px; border-radius: 14px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: sms-shimmer 1.4s infinite;
}
@keyframes sms-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ── Empty state ── */
.sms-empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 48px 24px; color: #9ca3af;
}
.sms-empty-state__icon {
  width: 56px; height: 56px; border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex; align-items: center; justify-content: center; color: #ff3131;
}
.sms-empty-state__text { font-size: 14px; font-weight: 500; color: #6b7280; margin: 0; }
.sms-csv-btn {
  display: inline-flex;
  align-items: center;
  margin-top: 14px;
  padding: 8px 16px;
  border: 1px solid #ff3131;
  border-radius: 8px;
  background: white;
  color: #ff3131;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.sms-csv-btn:hover { background: #fff5f5; }

/* ── Banners ── */
.sms-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 16px; border-radius: 14px; margin-bottom: 10px;
  font-size: 13px;
}
.sms-banner__left  { display: flex; align-items: center; gap: 8px; flex: 1; }
.sms-banner__icon  { flex-shrink: 0; }
.sms-banner--amber { background: #fffbeb; border: 1.5px solid #fde68a; color: #92400e; }
.sms-banner--red   { background: #fef2f2; border: 1.5px solid #fecaca; color: #ff3131; }
.sms-banner--progress { background: #fef2f2; border: 1.5px solid #fecaca; color: #ff3131; }

.sms-banner-btn {
  padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600;
  border: none; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all .15s;
}
.sms-banner-btn--amber { background: #f59e0b; color: #fff; }
.sms-banner-btn--amber:hover { background: #d97706; }
.sms-banner-btn--red   { background: #ff3131; color: #fff; }
.sms-banner-btn--red:hover { background: #b91c1c; }

/* ── Toolbar ── */
.sms-toolbar {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; background: #fff; border-radius: 14px;
  border: 1.5px solid #e5e7eb; margin-bottom: 10px;
}
.sms--dark .sms-toolbar { background: #1f2937; border-color: #374151; }

.sms-search {
  flex: 1; display: flex; align-items: center; gap: 8px;
  background: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 7px 11px;
  transition: border-color .18s, box-shadow .18s;
}
.sms-search:focus-within { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1); }
.sms-search__icon  { color: #9ca3af; flex-shrink: 0; }
.sms-search__input { flex: 1; border: none; outline: none; background: transparent; font-size: 13px; color: #111827; }
.sms-search__input::placeholder { color: #9ca3af; }
.sms-search__clear { border: none; background: none; color: #9ca3af; cursor: pointer; padding: 0; display: flex; align-items: center; }
.sms--dark .sms-search { background: #111827; border-color: #374151; }
.sms--dark .sms-search__input { color: #e5e7eb; }

.sms-tabs { display: flex; gap: 6px; flex-shrink: 0; }
.sms-tab {
  padding: 5px 13px; border-radius: 100px; font-size: 12.5px; font-weight: 500;
  border: 1.5px solid #e5e7eb; background: #f9fafb; color: #6b7280;
  cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
  transition: all .15s;
}
.sms-tab:hover { border-color: #d1d5db; background: #f3f4f6; }
.sms-tab--active { background: #fef2f2; border-color: #ff3131; color: #ff3131; font-weight: 700; }
.sms-tab__count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  background: #e5e7eb; color: #6b7280; border-radius: 100px; font-size: 10.5px; font-weight: 700;
}
.sms-tab__count--green { background: #dcfce7; color: #16a34a; }
.sms-tab__count--red   { background: #fee2e2; color: #ff3131; }

/* ── Location list ── */
.sms-list { display: flex; flex-direction: column; gap: 6px; }

.sms-list__header {
  display: grid; grid-template-columns: 1fr 1.4fr auto;
  gap: 12px; padding: 6px 16px;
}
.sms-list__header-col {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .6px; color: #9ca3af;
}

.sms-list-empty {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; padding: 32px; color: #9ca3af; font-size: 13.5px;
}

/* Row */
.sms-row {
  display: grid; grid-template-columns: 1fr 1.4fr auto;
  align-items: center; gap: 12px;
  padding: 12px 16px; border-radius: 14px;
  background: #fff; border: 1.5px solid #e5e7eb;
  transition: border-color .18s, box-shadow .18s;
}
.sms-row:hover { border-color: #d1d5db; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.sms-row--mapped    { border-color: #bbf7d0; background: #f0fdf4; }
.sms-row--suggested { border-color: #fde68a; background: #fffbeb; }
.sms--dark .sms-row { background: #1f2937; border-color: #374151; }
.sms--dark .sms-row--mapped    { background: #052e16; border-color: #166534; }
.sms--dark .sms-row--suggested { background: #1c1500; border-color: #854d0e; }

/* Location col */
.sms-row__loc { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.sms-row__loc-header { display: flex; align-items: center; gap: 8px; min-width: 0; width: 100%; }
.sms-row__loc-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid currentColor;
}
.sms-row__loc-dot--ok      { color: #16a34a; background: #16a34a; }
.sms-row__loc-dot--suggest { color: #f59e0b; background: #f59e0b; }
.sms-row__loc-dot--pending { color: #d1d5db; background: transparent; }
.sms-row__loc-name { font-size: 13.5px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sms--dark .sms-row__loc-name { color: #f3f4f6; }

/* Shop select */
.sms-row__shop { min-width: 0; }
.sms-select {
  width: 100%; padding: 8px 12px; border-radius: 10px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 13px; color: #111827; outline: none;
  transition: border-color .18s, box-shadow .18s;
  cursor: pointer;
}
.sms-select:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1); background: #fff; }
.sms-select--suggested { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.sms-select--full { width: 100%; }
.sms--dark .sms-select { background: #111827; border-color: #374151; color: #e5e7eb; }

/* Actions col */
.sms-row__actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }

.sms-act {
  width: 30px; height: 30px; border-radius: 8px;
  border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all .15s; flex-shrink: 0;
}
.sms-act--accept { background: #dcfce7; color: #16a34a; }
.sms-act--accept:hover { background: #bbf7d0; }
.sms-act--reject { background: #fee2e2; color: #ff3131; }
.sms-act--reject:hover { background: #fecaca; }
.sms-act--create { background: #fef2f2; color: #ff3131; border: 1.5px dashed #fca5a5; }
.sms-act--create:hover { background: #fee2e2; border-color: #ff3131; }
.sms-act--floor  { background: #ede9fe; color: #7c3aed; }
.sms-act--floor:hover { background: #ddd6fe; }

.sms-status {
  width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
}
.sms-status--saving { background: transparent; }
.sms-status--ok    { background: #dcfce7; color: #16a34a; }
.sms-status--error { background: #fee2e2; color: #ff3131; }

.sms-floor-badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 8px; border-radius: 100px;
  background: #ede9fe; color: #7c3aed; border: none;
  font-size: 11px; font-weight: 700; cursor: pointer;
  transition: background .15s;
  max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sms-floor-badge:hover { background: #ddd6fe; }

/* ── Info bars ── */
.sms-infobar {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 14px; border-radius: 12px; font-size: 13px;
}
.sms-infobar--error { background: #fef2f2; border: 1px solid #fecaca; color: #ff3131; }
.sms-infobar--warn  { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }

/* ── Buttons ── */
.sms-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 20px; border-radius: 100px; font-size: 13px; font-weight: 600;
  cursor: pointer; border: none; transition: all .2s; line-height: 1.4;
}
.sms-btn:disabled { opacity: .45; cursor: not-allowed; }
.sms-btn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49,.3); }
.sms-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.sms-btn--ghost   { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.sms-btn--ghost:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; }
.sms-btn--purple  { background: #7c3aed; color: #fff; box-shadow: 0 4px 14px rgba(124,58,237,.25); }
.sms-btn--purple:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(124,58,237,.35); transform: translateY(-1px); }

/* ── Footer actions ── */
.sms-footer-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
/* BUG-273 : conteneur du Teleport footer — colonne pour empiler l'erreur au-dessus du bouton,
   dans la zone fixe du wizard (jamais dans le corps scrollable). */
.sms-footer-teleport { display: flex; flex-direction: column; align-items: stretch; gap: 8px; flex: 1 1 auto; min-width: 0; }
.sms-footer-error { margin: 0; }

/* ── Floor Assignment Dialog (sms-fd-*) ── */
.sms-fd-card { display: flex; flex-direction: column; overflow: hidden; max-height: 90vh; }

.sms-fd-header {
  display: flex; align-items: center; gap: 14px; padding: 18px 20px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25); flex-shrink: 0;
}
.sms-fd-header__icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sms-fd-header__text { flex: 1; min-width: 0; }
.sms-fd-header__title { font-size: 15px; font-weight: 700; color: #fff; }
.sms-fd-header__sub { font-size: 12px; color: rgba(255,255,255,.75); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sms-fd-header__close {
  background: rgba(255,255,255,.15); border: none; border-radius: 8px;
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .2s; flex-shrink: 0; color: white;
}
.sms-fd-header__close:hover { background: rgba(255,255,255,.28); }
.sms-fd-header__close:disabled { opacity: .4; cursor: default; }

.sms-fd-progress {
  display: flex; align-items: center; padding: 12px 24px;
  background: #fff; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; gap: 0;
}
.sms-fd-card--dark .sms-fd-progress { background: #1f2937; border-color: #374151; }
.sms-fd-progress__item { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
.sms-fd-progress__dot {
  width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; border: 2px solid #e5e7eb; color: #9ca3af; background: #fff; transition: all .25s;
}
.sms-fd-progress__item--active .sms-fd-progress__dot { border-color: #ff3131; color: #ff3131; background: #fff5f5; }
.sms-fd-progress__item--done   .sms-fd-progress__dot { border-color: #16a34a; background: #16a34a; }
.sms-fd-progress__label { font-size: 10px; font-weight: 600; color: #9ca3af; }
.sms-fd-progress__item--active .sms-fd-progress__label,
.sms-fd-progress__item--done   .sms-fd-progress__label { color: #374151; }
.sms-fd-card--dark .sms-fd-progress__item--active .sms-fd-progress__label,
.sms-fd-card--dark .sms-fd-progress__item--done .sms-fd-progress__label { color: #d1d5db; }
.sms-fd-progress__line { flex: 1; height: 2px; background: #e5e7eb; border-radius: 2px; margin: 0 8px 14px; transition: background .25s; }
.sms-fd-progress__line--done { background: #16a34a; }

.sms-fd-body { overflow-y: auto; flex: 1; }
.sms-fd-section { padding: 16px 20px; border-bottom: 1px solid #f3f4f6; }
.sms-fd-card--dark .sms-fd-section { border-bottom-color: #374151; }
.sms-fd-section:last-child { border-bottom: none; }
.sms-fd-section__label {
  display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .07em; color: #6b7280; margin-bottom: 12px;
}
.sms-fd-card--dark .sms-fd-section__label { color: #9ca3af; }

/* Loading */
.sms-fd-loading { display: flex; align-items: center; gap: 10px; padding: 10px 0; color: #6b7280; font-size: 13px; }

/* Area cards */
.sms-fd-areas { display: flex; flex-wrap: wrap; gap: 8px; }
.sms-fd-area-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  width: 84px; height: 84px; border-radius: 14px; border: 1.5px solid #e5e7eb;
  background: #f9fafb; cursor: pointer; transition: all .2s; padding: 8px; text-align: center;
}
.sms-fd-area-card:hover { border-color: #ff3131; background: #fff5f5; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(255, 49, 49,.1); }
.sms-fd-area-card--selected { border-color: #ff3131 !important; background: #fff0f0 !important; box-shadow: 0 4px 16px rgba(255, 49, 49,.18) !important; transform: translateY(-1px); }
.sms-fd-area-card__badge {
  width: 30px; height: 30px; border-radius: 8px; background: rgba(255, 49, 49,.1);
  display: flex; align-items: center; justify-content: center; color: #ff3131; transition: all .2s;
}
.sms-fd-area-card--selected .sms-fd-area-card__badge { background: #ff3131; color: white; }
.sms-fd-area-card__badge--orange { background: rgba(249,115,22,.12); color: #f97316; }
.sms-fd-area-card--selected .sms-fd-area-card__badge--orange { background: #f97316; color: white; }
.sms-fd-area-card__badge--green  { background: rgba(22,163,74,.12); color: #16a34a; }
.sms-fd-area-card--selected .sms-fd-area-card__badge--green  { background: #16a34a; color: white; }
.sms-fd-area-card__badge--gray   { background: rgba(107,114,128,.1); color: #6b7280; }
.sms-fd-area-card--add:hover .sms-fd-area-card__badge, .sms-fd-area-card--add.sms-fd-area-card--selected .sms-fd-area-card__badge { background: #6b7280; color: white; }
.sms-fd-area-card__name { font-size: 11px; font-weight: 700; color: #374151; line-height: 1.2; }
.sms-fd-area-card--selected .sms-fd-area-card__name { color: #ff3131; }
.sms-fd-area-card__count { font-size: 9.5px; color: #9ca3af; }
.sms-fd-area-card__count--new { color: #ff3131; font-weight: 600; }
.sms-fd-card--dark .sms-fd-area-card { border-color: #374151; background: #1f2937; }
.sms-fd-card--dark .sms-fd-area-card__name { color: #d1d5db; }
.sms-fd-card--dark .sms-fd-area-card:hover { border-color: #ff3131; background: #2d1515; }

.sms-fd-no-floors { font-size: 12px; color: #9ca3af; font-style: italic; padding: 8px 0; }

/* Zone picker */
.sms-fd-zone-picker { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.sms-fd-zone-pill {
  padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600;
  background: #f3f4f6; border: 1.5px solid #e5e7eb; color: #374151; cursor: pointer; transition: all .15s;
}
.sms-fd-zone-pill:hover { background: #fff5f5; border-color: #ff3131; color: #ff3131; }

/* New floor dims */
.sms-fd-dims { margin-top: 14px; }
.sms-fd-dims__label { font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.sms-fd-dims__new-badge { font-size: 10px; font-weight: 500; color: #ff3131; }
.sms-fd-dims__row   { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.sms-fd-field { display: flex; flex-direction: column; gap: 3px; }
.sms-fd-field__label { font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; }
.sms-fd-field__input { width: 100%; border: 1.5px solid #e5e7eb; border-radius: 7px; padding: 5px 8px; font-size: 12.5px; outline: none; background: #fff; color: #111827; }
.sms-fd-field__input:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.08); }

/* Position row */
.sms-fd-pos-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }

/* Floor plan preview */
.sms-fd-preview-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 2px; }
.sms-fd-preview-svg { display: block; border-radius: 4px; cursor: crosshair; user-select: none; }
.sms-fd-preview-hint { font-size: 10px; color: #9ca3af; margin: 0; }

/* Batch list */
.sms-fd-batch { display: flex; flex-wrap: wrap; gap: 6px; max-height: 140px; overflow-y: auto; }
.sms-fd-batch-item {
  display: flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 100px;
  border: 1.5px solid #e5e7eb; background: #f9fafb; font-size: 12px; font-weight: 500;
  color: #374151; cursor: pointer; transition: all .15s;
}
.sms-fd-batch-item:hover { border-color: #ff3131; background: #fff5f5; }
.sms-fd-batch-item--on { border-color: #ff3131; background: #fff0f0; }
.sms-fd-batch-item__box {
  width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid #d1d5db; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; transition: all .15s;
}
.sms-fd-batch-item--on .sms-fd-batch-item__box { background: #ff3131; border-color: #ff3131; }
.sms-fd-batch-item__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sms-fd-batch-item__current {
  font-size: 10px; color: #9ca3af; white-space: nowrap;
  padding: 1px 5px; border-radius: 4px; background: #f3f4f6;
  flex-shrink: 0;
}
.sms-fd-batch-item--on .sms-fd-batch-item__current { background: rgba(255,255,255,.25); color: rgba(255,255,255,.8); }

/* Config chip (détectée depuis le shop) */
.sms-fd-config-chip {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 10px;
  background: #f0fdf4; border: 1.5px solid #bbf7d0;
}
.sms-fd-config-chip__icon { color: #16a34a; flex-shrink: 0; }
.sms-fd-config-chip__name { font-size: 13px; font-weight: 600; color: #15803d; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sms-fd-config-chip__change { font-size: 11px; color: #6b7280; background: none; border: none; cursor: pointer; padding: 0; text-decoration: underline; flex-shrink: 0; }
.sms-fd-config-chip__change:hover { color: #ff3131; }
.sms--dark .sms-fd-config-chip { background: #052e16; border-color: #166534; }
.sms--dark .sms-fd-config-chip__name { color: #86efac; }

/* Footer */
.sms-fd-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding: 14px 20px; border-top: 1px solid #f0f0f0; background: #fff; flex-shrink: 0;
}
.sms-fd-card--dark .sms-fd-footer { background: #1f2937; border-color: #374151; }

/* Loading dots */
.sms-fd-dot-loader { display: inline-flex; gap: 3px; align-items: center; margin-left: 4px; }
.sms-fd-dot-loader span { width: 4px; height: 4px; border-radius: 50%; background: #ff3131; animation: sms-dot-bounce .8s infinite; }
.sms-fd-dot-loader span:nth-child(2) { animation-delay: .15s; }
.sms-fd-dot-loader span:nth-child(3) { animation-delay: .3s; }
@keyframes sms-dot-bounce { 0%, 80%, 100% { transform: scale(.6); opacity: .4; } 40% { transform: scale(1); opacity: 1; } }

/* Slide transition */
.sms-fd-slide-enter-active, .sms-fd-slide-leave-active { transition: all .22s ease; }
.sms-fd-slide-enter-from { opacity: 0; transform: translateY(-5px); }
.sms-fd-slide-leave-to   { opacity: 0; transform: translateY(-3px); }

/* ── Quick-create dialog ── */
.sms-qc-dialog {
  background: #fff; border-radius: 18px; overflow: hidden;
  box-shadow: 0 8px 40px rgba(0,0,0,.18);
}
.sms-qc-header {
  display: flex; align-items: flex-start; gap: 12px; padding: 20px;
  background: #ff3131;
}
.sms-qc-header__icon {
  width: 42px; height: 42px; border-radius: 11px;
  background: rgba(255,255,255,.18); display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sms-qc-header__info  { flex: 1; min-width: 0; }
.sms-qc-header__title { font-size: 15px; font-weight: 700; color: #fff; margin: 0 0 3px; }
.sms-qc-header__sub   { font-size: 12px; color: rgba(255,255,255,.72); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sms-qc-header__close {
  margin-left: auto; width: 30px; height: 30px; border-radius: 8px;
  border: none; background: rgba(255,255,255,.15); color: #fff;
  display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
  transition: background .15s;
}
.sms-qc-header__close:hover { background: rgba(255,255,255,.28); }
.sms-qc-header__close:disabled { opacity: .4; cursor: default; }

.sms-qc-required { color: #ff3131; margin-left: 2px; }

.sms-qc-body   { padding: 20px; }
.sms-qc-footer { padding: 12px 20px; border-top: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }

.sms-qc-error {
  display: flex; align-items: center; gap: 7px;
  margin-top: 12px; padding: 10px 12px; border-radius: 10px;
  background: #fef2f2; border: 1px solid #fecaca;
  color: #ff3131; font-size: 12.5px; font-weight: 500;
}

.sms-qc-input { border-radius: 10px !important; border: 1.5px solid #e5e7eb !important; font-size: 13.5px; }
.sms-qc-input:focus { border-color: #ff3131 !important; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1) !important; }

.sms-qc-field-wrap  { display: flex; flex-direction: column; gap: 5px; flex: 1; }
.sms-qc-label { font-size: 12px; font-weight: 600; color: #6b7280; }

.sms-qc-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin: 14px 0 10px; border-top: 1px solid #f0f0f0; padding-top: 12px; }
.sms-qc-optional { font-weight: 400; text-transform: none; }
.sms-qc-hint { font-size: 12px; color: #9ca3af; margin: 4px 0 8px; }
.sms-qc-row { display: flex; gap: 10px; }
.sms-qc-input-nb { width: 100%; border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 6px 10px; font-size: 13px; outline: none; }
.sms-qc-input-nb:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1); }
.sms-qc-input-nb--readonly { background: #f9fafb; color: #6b7280; cursor: default; }
.sms-qc-loading { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 13px; color: #6b7280; }
.sms-qc-queue-badge {
  display: inline-block; margin-left: 6px; padding: 1px 7px;
  background: rgba(255,255,255,.22); border-radius: 20px; font-size: 11px; font-weight: 700;
}
.sms-cfg-info { font-size: 13.5px; color: #6b7280; margin-bottom: 16px; line-height: 1.5; }

/* ── Bulk confirm dialog ── */
.sms-bulk-opt { display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 10px; cursor: pointer; background: #fafafa; }
.sms-bulk-opt__check { margin-top: 3px; accent-color: #ff3131; cursor: pointer; }
.sms-bulk-opt__text { font-size: 13.5px; color: #374151; line-height: 1.5; }
.sms-bulk-opt__hint { display: block; font-size: 12.5px; color: #9ca3af; margin-top: 2px; }
.sms-bulk-note { display: flex; font-size: 12.5px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 10px; margin-top: 10px; line-height: 1.45; }
.sms-cfg-section-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  color: #ff3131; margin: 0 0 12px; padding: 10px 0 0; border-top: 1px solid #f0f0f0;
}


/* ── Vuetify overrides ── */
:deep(.v-field--focused) { box-shadow: 0 0 0 3px rgba(255, 49, 49,.12) !important; }
:deep(.v-field--focused .v-field__outline__start),
:deep(.v-field--focused .v-field__outline__notch),
:deep(.v-field--focused .v-field__outline__end) { border-color: #ff3131 !important; }

.sms--dark :deep(.v-field) { background: #1f2937; color: #e5e7eb; }
.sms--dark :deep(.v-field__input) { color: #e5e7eb; }
.sms--dark :deep(.v-label)        { color: #9ca3af !important; }
</style>
