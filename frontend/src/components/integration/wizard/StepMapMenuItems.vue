<template>
  <div class="smi-wrap" :class="{ 'smi--dark': isDark }">

    <!-- ── Gradient Header ── -->
    <div class="smi-header">
      <div class="smi-header__icon">
        <UtensilsCrossed :size="22" color="white" />
      </div>
      <div class="smi-header__body">
        <p class="smi-header__title">
          {{ t('smmHeaderTitle') }}
          <span class="smi-header__step">{{ t('smmHeaderStep') }}</span>
        </p>
        <p class="smi-header__sub">{{ t('smmHeaderSub') }}</p>
      </div>
      <span
        class="smi-prog-badge"
        :class="mappedCount === totalProductCount && totalProductCount > 0 ? 'smi-prog-badge--green' : 'smi-prog-badge--gray'"
      >
        {{ mappedCount }}/{{ totalProductCount }} {{ t('smmMapped') }}
      </span>
    </div>

    <!-- ── Loading ── -->
    <div v-if="loading" class="smi-skeletons">
      <div v-for="i in 6" :key="i" class="smi-skeleton-row"></div>
    </div>

    <!-- ── Empty ── -->
    <div v-else-if="!products.length" class="smi-empty-state">
      <div class="smi-empty-state__icon"><UtensilsCrossed :size="26" /></div>
      <p class="smi-empty-state__text">{{ t('smmEmptyProducts') }}</p>
    </div>

    <template v-else>

      <!-- ── Auto-suggestion banner ── -->
      <div v-if="autoSuggestionCount > 0" class="smi-banner smi-banner--amber">
        <div class="smi-banner__left">
          <template v-if="autoMappingRunning">
            <v-progress-circular indeterminate size="15" width="2" color="#f59e0b" />
          </template>
          <Zap v-else :size="15" class="smi-banner__icon" />
          <span>
            <template v-if="autoMappingRunning">
              {{ t('smmAutoMappingOf') }} <strong>{{ autoSuggestionCount }}</strong>
              {{ autoSuggestionCount > 1 ? t('smmSuggestionsPlural') : t('smmSuggestion') }}&#8230;
            </template>
            <template v-else>
              <strong>{{ autoSuggestionCount }}</strong>
              {{ autoSuggestionCount > 1 ? t('smmSuggestionsAvailablePlural') : t('smmSuggestionAvailable') }}
            </template>
          </span>
        </div>
        <div class="smi-banner-actions">
          <button class="smi-banner-btn smi-banner-btn--ghost-amber" @click="showSuggestionsDialog = true">
            <Eye :size="13" style="margin-right:4px" />{{ t('smmView') }}
          </button>
          <button class="smi-banner-btn smi-banner-btn--amber" :disabled="autoMappingRunning" @click="applyAutoSuggestions">
            {{ autoMappingRunning ? t('smmMappingProgress') : t('smmAutoMapAll') }}
          </button>
        </div>
      </div>

      <!-- ── Auto-map result message ── -->
      <div
        v-if="autoMappingMessage"
        class="smi-banner"
        :class="autoMappingMessageType === 'success' ? 'smi-banner--green' : autoMappingMessageType === 'warning' ? 'smi-banner--amber' : 'smi-banner--red'"
      >
        <div class="smi-banner__left">
          <Check v-if="autoMappingMessageType === 'success'" :size="15" class="smi-banner__icon" />
          <AlertTriangle v-else :size="15" class="smi-banner__icon" />
          <span>{{ autoMappingMessage }}</span>
        </div>
        <button class="smi-banner-btn smi-banner-btn--ghost" @click="autoMappingMessage = ''">
          <X :size="13" />
        </button>
      </div>

      <!-- ── Bulk create banner ── -->
      <div
        v-if="(unmappedCount > 0 || patchableItemsCount > 0) && !bulkCreateRunning"
        class="smi-banner smi-banner--red"
      >
        <div class="smi-banner__left">
          <Plus :size="15" class="smi-banner__icon" />
          <span>
            <template v-if="unmappedCount > 0">
              <strong>{{ unmappedCount }}</strong> {{ unmappedCount > 1 ? t('smmProductsPlural') : t('smmProduct') }} {{ t('smmWithoutMapping') }}
              <template v-if="patchableItemsCount > 0"> · <strong>{{ patchableItemsCount }}</strong> {{ patchableItemsCount > 1 ? t('smmItemsPlural') : t('smmItem') }} {{ t('smmWithoutSpace') }}</template>
              {{ t('smmCreateAndAttach') }}
            </template>
            <template v-else>
              <strong>{{ patchableItemsCount }}</strong> {{ patchableItemsCount > 1 ? t('smmItemsAlreadyMappedPlural') : t('smmItemAlreadyMapped') }} {{ t('smmWithoutSpaceAttach') }}
            </template>
          </span>
        </div>
        <button class="smi-banner-btn smi-banner-btn--red" @click="bulkCreateAndMap">
          {{ t('smmCreateAndMapAll') }}
        </button>
      </div>

      <!-- ── Apply Weezevent prices banner ── -->
      <div v-if="applicablePriceCount > 0" class="smi-banner smi-banner--blue">
        <div class="smi-banner__left">
          <template v-if="applyAllRunning">
            <v-progress-circular indeterminate size="15" width="2" color="#2563eb" />
          </template>
          <Tag v-else :size="15" class="smi-banner__icon" />
          <span>
            <strong>{{ applicablePriceCount }}</strong>
            {{ applicablePriceCount > 1 ? t('smmItemsMappedPricePlural') : t('smmItemMappedPrice') }}
          </span>
        </div>
        <button class="smi-banner-btn smi-banner-btn--blue" :disabled="applyAllRunning" @click="applyAllPrices">
          {{ applyAllRunning ? t('smmApplyingProgress') : t('smmApplyWeezeventPrices') }}
        </button>
      </div>

      <!-- ── Toolbar ── -->
      <div class="smi-toolbar">
        <div class="smi-tabs">
          <button class="smi-tab" :class="{ 'smi-tab--active': activeTab === 'all' }" @click="activeTab = 'all'">
            {{ t('smmTabAll') }} <span class="smi-tab__count">{{ totalProductCount }}</span>
          </button>
          <button class="smi-tab" :class="{ 'smi-tab--active': activeTab === 'mapped' }" @click="activeTab = 'mapped'">
            {{ t('smmTabMapped') }} <span class="smi-tab__count smi-tab__count--green">{{ mappedCount }}</span>
          </button>
          <button class="smi-tab" :class="{ 'smi-tab--active': activeTab === 'unmapped' }" @click="activeTab = 'unmapped'">
            {{ t('smmTabUnmapped') }}
            <span v-if="unmappedCount > 0" class="smi-tab__count smi-tab__count--red">{{ unmappedCount }}</span>
          </button>
        </div>
        <label
          class="smi-unsold-toggle"
          :title="t('smmHideUnsoldTitle') + ' ' + unsoldHiddenCount + ' ' + t('smmHiddenSuffix')"
        >
          <input type="checkbox" v-model="hideUnsold" />
          {{ t('smmHideUnsold') }}
          <span v-if="unsoldHiddenCount > 0" class="smi-unsold-toggle__count">{{ unsoldHiddenCount }}</span>
        </label>
      </div>

      <!-- ── Product list ── -->
      <div class="smi-list">

        <!-- Column headers -->
        <div class="smi-list__header">
          <div class="smi-list__header-col">{{ t('smmColProduct') }}</div>
          <div class="smi-list__header-col">{{ t('smmColMenuItem') }}</div>
          <div class="smi-list__header-col smi-list__header-col--center">{{ t('smmColMatch') }}</div>
          <div class="smi-list__header-col"></div>
        </div>

        <!-- Empty search result -->
        <div v-if="!displayedRows.length" class="smi-list-empty">
          <Search :size="18" style="color: #9ca3af;" />
          <span>{{ t('smmNoProductFound') }}</span>
        </div>

        <!-- Rows (page courante uniquement) -->
        <div
          v-for="item in pagedRows"
          :key="item.id"
          class="smi-row"
          :class="{
            'smi-row--mapped': !!localMappings[item.id],
            'smi-row--suggested': !localMappings[item.id] && !!autoSuggestions[item.id],
          }"
        >
          <!-- Product name -->
          <div class="smi-row__name">
            <div
              class="smi-row__dot"
              :class="localMappings[item.id] ? 'smi-row__dot--ok' : autoSuggestions[item.id] ? 'smi-row__dot--suggest' : 'smi-row__dot--pending'"
            ></div>
            <div class="smi-row__name-body">
              <span class="smi-row__name-text">{{ item.name }}</span>
              <span v-if="item.basePrice != null" class="smi-row__price">
                {{ fmtPrice(productHt(item)) }} <span class="smi-row__price-tag">{{ t('smmHtTag') }}</span>
                <span class="smi-row__price-ttc">{{ Number(item.basePrice).toFixed(2) }} € {{ t('smmTtcTag') }}</span>
              </span>

            </div>
          </div>

          <!-- Menu item select -->
          <div class="smi-row__select-col">
            <select
              class="smi-select"
              :class="{ 'smi-select--suggested': !localMappings[item.id] && !!autoSuggestions[item.id] }"
              :value="localMappings[item.id] || autoSuggestions[item.id] || ''"
              @change="updateMapping(item.id, $event.target.value || null)"
            >
              <option value="">{{ t('smmSelectOption') }}</option>
              <option v-for="mi in menuItemOptions" :key="mi.id" :value="mi.id">{{ mi.label }}</option>
            </select>

            <!-- Prix DataFriday actuel + application du prix Weezevent (article mappé) -->
            <div v-if="localMappings[item.id]" class="smi-priceline">
              <span class="smi-priceline__df" :title="t('smmPricelineDfTitle')">
                {{ t('smmPriceInSpace') }} <strong>{{ currentMenuPrice(item) != null ? fmtPrice(currentMenuPriceHt(item)) + ' ' + t('smmHtTag') : '—' }}</strong>
                <span v-if="currentMenuPrice(item) != null" class="smi-priceline__ttc">{{ fmtPrice(currentMenuPrice(item)) }} {{ t('smmTtcTag') }}</span>
              </span>
              <button
                v-if="canApplyPrice(item)"
                class="smi-priceline__apply"
                :disabled="priceApplying[item.id] === 'saving'"
                :title="t('smmApplyWeezeventPricePrefix') + ' (' + fmtPrice(item.basePrice) + ') ' + t('smmApplyWeezeventPriceSuffix')"
                @click="applyPrice(item)"
              >
                <v-progress-circular v-if="priceApplying[item.id] === 'saving'" indeterminate size="11" width="2" color="#ff3131" />
                <template v-else>{{ t('smmApply') }} {{ fmtPrice(item.basePrice) }}</template>
              </button>
              <span v-else-if="priceApplying[item.id] === 'done'" class="smi-priceline__done" :title="t('smmPriceApplied')">
                <Check :size="12" /> {{ t('smmUpToDate') }}
              </span>
              <button class="smi-priceline__hist" :title="t('smmPriceHistoryTitle')" @click="openPriceHistory(item)">
                <History :size="13" />
              </button>
            </div>
          </div>

          <!-- Match score -->
          <div class="smi-row__match">
            <span
              v-if="item.matchScore"
              class="smi-match"
              :class="item.matchScore === 100 ? 'smi-match--green' : item.priceVerified ? 'smi-match--gray' : 'smi-match--amber'"
            >
              {{ item.matchScore }}%
            </span>
            <span v-else class="smi-match-none">—</span>
          </div>

          <!-- Actions -->
          <div class="smi-row__actions">
            <!-- No confirmed mapping -->
            <template v-if="!localMappings[item.id]">
              <template v-if="autoSuggestions[item.id]">
                <button class="smi-act smi-act--accept" :title="t('smmAcceptSuggestion')" @click="acceptSuggestion(item.id)">
                  <Check :size="13" />
                </button>
                <button class="smi-act smi-act--reject" :title="t('smmIgnore')" @click="rejectSuggestion(item.id)">
                  <X :size="13" />
                </button>
              </template>
              <button
                v-else
                class="smi-act smi-act--create"
                :title="t('smmCreateMenuItemForPrefix') + ' « ' + item.name + ' »'"
                @click="openQuickCreate(item)"
              >
                <Plus :size="14" />
              </button>
            </template>
            <!-- Confirmed mapping: save status -->
            <template v-else>
              <span v-if="savingRows[item.id] === 'saving'" class="smi-status smi-status--saving">
                <v-progress-circular indeterminate size="14" width="2" color="#9ca3af" />
              </span>
              <span v-else-if="savingRows[item.id] === 'error'" class="smi-status smi-status--error" :title="t('smmSaveError')">!</span>
              <span v-else class="smi-status smi-status--ok"><Check :size="13" /></span>
            </template>
          </div>
        </div>
      </div>

      <!-- ── Pagination ── -->
      <div v-if="displayedRows.length" class="smi-pagination">
        <span class="smi-pagination__info">
          {{ pageRangeStart }}–{{ pageRangeEnd }} {{ t('smmPaginationOf') }} {{ displayedRows.length }}
        </span>
        <div class="smi-pagination__controls">
          <button
            class="smi-pagination__btn"
            :disabled="currentPage <= 1"
            @click="currentPage = Math.max(1, currentPage - 1)"
          >{{ t('smmPrevious') }}</button>
          <span class="smi-pagination__page">{{ t('smmPage') }} {{ currentPage }} / {{ totalPages }}</span>
          <button
            class="smi-pagination__btn"
            :disabled="currentPage >= totalPages"
            @click="currentPage = Math.min(totalPages, currentPage + 1)"
          >{{ t('smmNext') }}</button>
        </div>
      </div>

      <!-- ── Error bar ── -->
      <div v-if="error" class="smi-infobar smi-infobar--error smi-mt-3">
        <AlertTriangle :size="14" style="flex-shrink: 0;" />
        <span>{{ error }}</span>
      </div>

      <!-- ── Blocking warning ── -->
      <div v-if="!loading && unmappedCount > 0" class="smi-infobar smi-infobar--warn smi-mt-2">
        <AlertTriangle :size="14" style="flex-shrink: 0;" />
        <span>
          <strong>{{ unmappedCount }} {{ t('smmUnmappedProductsWarn') }}</strong> {{ t('smmAllMustBeMapped') }}
        </span>
      </div>

    </template>

    <!-- ── Footer (teleported) ── -->
    <Teleport :to="footerTarget" :disabled="!footerTarget">
      <div class="smi-footer-actions">
        <span></span>
        <button
          class="smi-btn smi-btn--primary"
          :disabled="mappedCount === 0 || hasPendingSaves"
          @click="handleSave"
        >
          <v-progress-circular v-if="hasPendingSaves" indeterminate size="14" width="2" color="white" />
          <span v-else>{{ t('smmNext') }}</span>
          <ChevronRight :size="16" />
        </button>
      </div>
    </Teleport>

    <!-- ── Quick-create menu item dialog ── -->
    <v-dialog v-model="quickCreateOpen" max-width="460" :persistent="quickCreateSaving">
      <div class="smi-qc-dialog" :class="{ 'smi-qc-dialog--dark': isDark }">
        <!-- Header -->
        <div class="smi-qc-header">
          <div class="smi-qc-header__icon"><UtensilsCrossed :size="20" color="white" /></div>
          <div class="smi-qc-header__text">
            <p class="smi-qc-header__title">{{ t('smmCreateTitle') }}</p>
            <p v-if="quickCreateProduct" class="smi-qc-header__sub">
              {{ t('smmCreateFor') }} <strong style="color:#fff;">{{ quickCreateProduct.name }}</strong>
            </p>
          </div>
          <button class="smi-qc-header__close" :disabled="quickCreateSaving" @click="quickCreateOpen = false">
            <X :size="16" />
          </button>
        </div>

        <!-- Body -->
        <div class="smi-qc-body">

          <!-- Loading overlay (async type/category) -->
          <div v-if="quickCreateLoading" class="smi-qc-loading">
            <v-progress-circular indeterminate size="20" width="2" color="#ff3131" />
            <span>{{ t('smmLoadingCategories') }}</span>
          </div>

          <!-- Identification -->
          <div class="smi-qc-section-label">{{ t('smmCreateSectionId') }}</div>

          <div class="form-floating smi-mb-3">
            <input
              id="qc-name"
              v-model="quickCreateForm.name"
              type="text"
              class="form-control smi-qc-input"
              placeholder=" "
              autofocus
            />
            <label for="qc-name">{{ t('smmCreateLabelName') }} *</label>
          </div>

          <div class="smi-qc-row">
            <div class="smi-qc-field-wrap">
              <label class="smi-qc-label">{{ t('smmCreateLabelType') }}</label>
              <select
                :value="quickCreateForm.typeId"
                class="smi-select smi-select--full"
                :disabled="quickCreateLoading"
                @change="handleQuickTypeChange($event.target.value || null)"
              >
                <option value="">{{ t('smmCreateChoose') }}</option>
                <option v-for="typeOpt in typeSelectItems" :key="typeOpt.id" :value="typeOpt.id">{{ typeOpt.name }}</option>
              </select>
            </div>
            <div class="smi-qc-field-wrap">
              <label class="smi-qc-label">{{ t('smmCreateLabelCategory') }}</label>
              <select
                :value="quickCreateForm.categoryId"
                class="smi-select smi-select--full"
                :disabled="!quickCreateForm.typeId || quickCreateLoading"
                @change="handleQuickCategoryChange($event.target.value || null)"
              >
                <option value="">{{ t('smmCreateChoose') }}</option>
                <option v-for="catOpt in categorySelectItems" :key="catOpt.id" :value="catOpt.id">{{ catOpt.name }}</option>
              </select>
            </div>
          </div>

          <!-- Prix -->
          <div class="smi-qc-section-label">{{ t('smmCreateSectionPrice') }}</div>

          <div class="smi-qc-row">
            <div class="smi-qc-field-wrap">
              <label class="smi-qc-label">{{ t('smmCreateLabelPriceTtc') }}</label>
              <div class="smi-qc-input-wrap">
                <span class="smi-qc-prefix">€</span>
                <input
                  v-model.number="quickCreateForm.basePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  class="smi-qc-input smi-qc-input--prefixed"
                  :placeholder="t('smmCreatePlaceholderPrice')"
                />
              </div>
            </div>
            <div class="smi-qc-field-wrap">
              <label class="smi-qc-label">{{ t('smmCreateLabelVat') }}</label>
              <div class="smi-qc-input-wrap">
                <input
                  v-model.number="quickCreateForm.vatRate"
                  type="number"
                  min="0"
                  step="0.1"
                  class="smi-qc-input smi-qc-input--suffixed"
                  :placeholder="t('smmCreateVatPlaceholder')"
                />
                <span class="smi-qc-suffix">%</span>
              </div>
            </div>
          </div>

          <div class="smi-qc-row">
            <div class="smi-qc-field-wrap">
              <label class="smi-qc-label">{{ t('smmCreateLabelDiscountType') }}</label>
              <select v-model="quickCreateForm.discountType" class="smi-select smi-select--full">
                <option value="">{{ t('smmCreateDiscountNone') }}</option>
                <option value="percent">{{ t('smmCreateDiscountPercent') }} (%)</option>
                <option value="amount">{{ t('smmCreateDiscountAmount') }}</option>
              </select>
            </div>
            <div class="smi-qc-field-wrap">
              <label class="smi-qc-label">{{ t('smmCreateLabelDiscountValue') }}</label>
              <div class="smi-qc-input-wrap">
                <span class="smi-qc-prefix">{{ quickCreateForm.discountType === 'amount' ? '€' : '%' }}</span>
                <input
                  v-model.number="quickCreateForm.discountValue"
                  type="number"
                  min="0"
                  step="0.01"
                  :disabled="!quickCreateForm.discountType"
                  class="smi-qc-input smi-qc-input--prefixed"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <!-- Décomposition live des prix -->
          <div class="smi-qc-pricing smi-mb-3">
            <div class="smi-qc-pricing__row">
              <span>{{ t('smmPriceGrossTtc') }}</span>
              <span>{{ fmtMoney(quickCreatePricing.grossTtc) }}</span>
            </div>
            <div v-if="quickCreatePricing.hasDiscount" class="smi-qc-pricing__row smi-qc-pricing__row--discount">
              <span>{{ t('smmPriceDiscount') }}</span>
              <span>− {{ fmtMoney(quickCreatePricing.discountTtc) }}</span>
            </div>
            <div class="smi-qc-pricing__row smi-qc-pricing__row--total">
              <span>{{ t('smmPriceNetTtc') }}</span>
              <span>{{ fmtMoney(quickCreatePricing.netTtc) }}</span>
            </div>
            <div class="smi-qc-pricing__sub">
              <div class="smi-qc-pricing__row">
                <span>{{ t('smmPriceHt') }}</span>
                <span>{{ fmtMoney(quickCreatePricing.netHt) }}</span>
              </div>
              <div class="smi-qc-pricing__row">
                <span>{{ t('smmPriceVat') }}</span>
                <span>{{ fmtMoney(quickCreatePricing.netVat) }}</span>
              </div>
            </div>
            <p v-if="!quickCreatePricing.hasVat" class="smi-qc-pricing__hint">{{ t('smmPriceVatUnknown') }}</p>
          </div>

          <div v-if="quickCreateError" class="smi-infobar smi-infobar--error">
            <AlertTriangle :size="13" style="flex-shrink:0;" />
            <span>{{ quickCreateError }}</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="smi-qc-footer">
          <button class="smi-btn smi-btn--ghost" :disabled="quickCreateSaving" @click="quickCreateOpen = false">
            {{ t('smmCreateCancel') }}
          </button>
          <button
            class="smi-btn smi-btn--primary"
            :disabled="!quickCreateForm.name || quickCreateSaving"
            @click="submitQuickCreate"
          >
            <v-progress-circular v-if="quickCreateSaving" indeterminate size="13" width="2" color="white" />
            <Plus v-else :size="14" />
            {{ t('smmCreateConfirm') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <!-- ── Create product type dialog ── -->
    <v-dialog v-model="typeCreateOpen" max-width="440" persistent>
      <div class="smi-mini-dialog" :class="{ 'smi-mini-dialog--dark': isDark }">
        <div class="smi-mini-dialog__header">
          <span>{{ t('smmCreateProductType') }}</span>
          <button class="smi-mini-dialog__close" :disabled="typeCreateLoading" @click="typeCreateOpen = false">
            <X :size="15" />
          </button>
        </div>
        <div class="smi-mini-dialog__body">
          <div v-if="typeCreateError" class="smi-infobar smi-infobar--error smi-mb-3">
            <AlertTriangle :size="13" style="flex-shrink:0;" /><span>{{ typeCreateError }}</span>
          </div>
          <div class="form-floating">
            <input
              id="tc-name"
              v-model="typeCreateName"
              type="text"
              class="form-control smi-qc-input"
              placeholder=" "
              @keyup.enter="submitTypeCreate"
            />
            <label for="tc-name">{{ t('smmTypeName') }}</label>
          </div>
        </div>
        <div class="smi-mini-dialog__footer">
          <button class="smi-btn smi-btn--ghost" :disabled="typeCreateLoading" @click="typeCreateOpen = false">{{ t('smmCancel') }}</button>
          <button class="smi-btn smi-btn--primary" :disabled="typeCreateLoading" @click="submitTypeCreate">
            <v-progress-circular v-if="typeCreateLoading" indeterminate size="13" width="2" color="white" />
            <Plus v-else :size="13" />
            {{ t('smmCreate') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <!-- ── Create product category dialog ── -->
    <v-dialog v-model="categoryCreateOpen" max-width="440" persistent>
      <div class="smi-mini-dialog" :class="{ 'smi-mini-dialog--dark': isDark }">
        <div class="smi-mini-dialog__header">
          <span>{{ t('smmCreateCategory') }}</span>
          <button class="smi-mini-dialog__close" :disabled="categoryCreateLoading" @click="categoryCreateOpen = false">
            <X :size="15" />
          </button>
        </div>
        <div class="smi-mini-dialog__body">
          <p class="smi-mini-dialog__hint">{{ t('smmLinkedToType') }} <strong>{{ selectedQuickTypeName }}</strong></p>
          <div v-if="categoryCreateError" class="smi-infobar smi-infobar--error smi-mb-3">
            <AlertTriangle :size="13" style="flex-shrink:0;" /><span>{{ categoryCreateError }}</span>
          </div>
          <div class="form-floating">
            <input
              id="cc-name"
              v-model="categoryCreateName"
              type="text"
              class="form-control smi-qc-input"
              placeholder=" "
              @keyup.enter="submitCategoryCreate"
            />
            <label for="cc-name">{{ t('smmCategoryName') }}</label>
          </div>
        </div>
        <div class="smi-mini-dialog__footer">
          <button class="smi-btn smi-btn--ghost" :disabled="categoryCreateLoading" @click="categoryCreateOpen = false">{{ t('smmCancel') }}</button>
          <button class="smi-btn smi-btn--primary" :disabled="categoryCreateLoading" @click="submitCategoryCreate">
            <v-progress-circular v-if="categoryCreateLoading" indeterminate size="13" width="2" color="white" />
            <Plus v-else :size="13" />
            {{ t('smmCreate') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <!-- ── Bulk create & map progress dialog ── -->
    <v-dialog v-model="bulkCreateDialog" max-width="460" :persistent="bulkCreateRunning">
      <div class="smi-bulk-dialog" :class="{ 'smi-bulk-dialog--dark': isDark }">

        <!-- Header -->
        <div class="smi-bulk-dialog__header">
          <div class="smi-bulk-dialog__header-icon">
            <Zap :size="20" color="white" />
          </div>
          <div>
            <p class="smi-bulk-dialog__header-title">{{ t('smmBulkTitle') }}</p>
            <p class="smi-bulk-dialog__header-sub">{{ t('smmBulkSub') }}</p>
          </div>
        </div>

        <!-- Steps pills -->
        <div class="smi-bulk-steps">
          <div
            v-for="(step, i) in bulkSteps"
            :key="i"
            class="smi-bulk-step"
            :class="{
              'smi-bulk-step--active': step.active,
              'smi-bulk-step--done': step.done,
            }"
          >
            <span class="smi-bulk-step__num">
              <Check v-if="step.done" :size="10" />
              <span v-else>{{ i + 1 }}</span>
            </span>
            {{ step.label }}
          </div>
        </div>

        <!-- Body -->
        <div class="smi-bulk-dialog__body">
          <div class="smi-bulk-progress">
            <v-progress-circular
              v-if="bulkCreateRunning && (bulkCreatePhase === 'patching' || bulkCreatePhase === 'sync' || bulkCreatePhase === 'preparing')"
              indeterminate color="#ff3131" size="72" width="5"
            />
            <v-progress-circular
              v-else-if="bulkCreateRunning"
              :model-value="bulkCreateTotal > 0 ? Math.round((bulkCreateProgress / bulkCreateTotal) * 100) : 0"
              color="#ff3131" size="72" width="5"
            >
              <span class="smi-bulk-pct">
                {{ bulkCreateTotal > 0 ? Math.round((bulkCreateProgress / bulkCreateTotal) * 100) : 0 }}%
              </span>
            </v-progress-circular>
            <div v-else-if="bulkCreatePhase === 'done'" class="smi-bulk-done-icon">
              <Check :size="30" color="white" />
            </div>
            <div v-else class="smi-bulk-error-icon">
              <AlertTriangle :size="30" color="white" />
            </div>
          </div>

          <div class="smi-bulk-status">
            <div class="smi-bulk-status__title">
              <template v-if="bulkCreatePhase === 'patching'">{{ t('smmPhasePatchingTitle') }}</template>
              <template v-else-if="bulkCreatePhase === 'sync'">{{ t('smmPhaseSyncTitle') }}</template>
              <template v-else-if="bulkCreatePhase === 'preparing'">{{ t('smmPhasePreparingTitle') }}</template>
              <template v-else-if="bulkCreatePhase === 'creating'">{{ t('smmPhaseCreatingTitle') }}</template>
              <template v-else-if="bulkCreatePhase === 'done'">{{ t('smmPhaseDoneTitle') }}</template>
              <template v-else>{{ t('smmPhaseInterruptedTitle') }}</template>
            </div>
            <div class="smi-bulk-status__sub">
              <template v-if="bulkCreatePhase === 'patching'">{{ t('smmPhasePatchingSub') }}</template>
              <template v-else-if="bulkCreatePhase === 'sync'">{{ t('smmPhaseSyncSub') }}</template>
              <template v-else-if="bulkCreatePhase === 'preparing'">{{ t('smmPhasePreparingSub') }}</template>
              <template v-else-if="bulkCreatePhase === 'creating'">{{ bulkCreateProgress }} / {{ bulkCreateTotal }} {{ t('smmProductsProcessed') }}</template>
              <template v-else>{{ bulkCreateMessage }}</template>
            </div>
            <div v-if="bulkCreateErrors > 0" class="smi-bulk-status__errors">
              {{ bulkCreateErrors }} {{ t('smmProductsFailed') }}
            </div>
          </div>
        </div>

        <div v-if="!bulkCreateRunning" class="smi-bulk-dialog__footer">
          <button class="smi-btn smi-btn--primary" @click="bulkCreateDialog = false">{{ t('smmClose') }}</button>
        </div>
      </div>
    </v-dialog>

    <!-- ── Suggestions preview dialog ── -->
    <v-dialog v-model="showSuggestionsDialog" max-width="580">
      <div class="smi-qc-dialog" :class="{ 'smi-qc-dialog--dark': isDark }">
        <div class="smi-qc-header">
          <div class="smi-qc-header__icon"><Zap :size="20" color="white" /></div>
          <div class="smi-qc-header__text">
            <p class="smi-qc-header__title">{{ t('smmAutoSuggestionsTitle') }}</p>
            <p class="smi-qc-header__sub">{{ suggestionList.length }} {{ suggestionList.length > 1 ? t('smmMatchesPlural') : t('smmMatch') }} {{ t('smmClickApplyHint') }}</p>
          </div>
          <button class="smi-qc-header__close" @click="showSuggestionsDialog = false"><X :size="16" /></button>
        </div>

        <div class="smi-qc-body" style="padding:0; max-height:420px; overflow-y:auto;">
          <div v-if="!suggestionList.length" class="smi-hist-empty">
            {{ t('smmNoSuggestionAvailable') }}
          </div>
          <div
            v-for="s in suggestionList"
            :key="s.productId"
            class="smi-suggest-row"
          >
            <div class="smi-suggest-row__product">
              <span class="smi-suggest-row__name">{{ s.productName }}</span>
              <span v-if="s.productPrice != null" class="smi-suggest-row__price">{{ Number(s.productPrice).toFixed(2) }} €</span>
            </div>
            <div class="smi-suggest-row__arrow">→</div>
            <div class="smi-suggest-row__item">
              <span class="smi-suggest-row__name">{{ s.menuItemName }}</span>
              <span
                v-if="s.score != null"
                class="smi-suggest-row__score"
                :class="s.score >= 90 ? 'smi-suggest-row__score--high' : s.score >= 70 ? 'smi-suggest-row__score--mid' : 'smi-suggest-row__score--low'"
              >{{ s.score }}%</span>
            </div>
            <button
              class="smi-suggest-row__apply"
              :disabled="savingRows[s.productId] === 'saving'"
              @click="updateMapping(s.productId, s.menuItemId)"
            >
              <Check v-if="savingRows[s.productId] === 'saved'" :size="13" />
              <span v-else>{{ t('smmApply') }}</span>
            </button>
          </div>
        </div>

        <div class="smi-bulk-dialog__footer">
          <button class="smi-btn smi-btn--ghost" @click="showSuggestionsDialog = false">{{ t('smmClose') }}</button>
          <button class="smi-btn smi-btn--primary" :disabled="autoMappingRunning" @click="applyAutoSuggestions(); showSuggestionsDialog = false">
            {{ t('smmApplyAll') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <!-- ── Price history dialog ── -->
    <v-dialog v-model="priceHistoryOpen" max-width="520">
      <div class="smi-qc-dialog" :class="{ 'smi-qc-dialog--dark': isDark }">
        <div class="smi-qc-header">
          <div class="smi-qc-header__icon"><History :size="20" color="white" /></div>
          <div class="smi-qc-header__text">
            <p class="smi-qc-header__title">{{ t('smmPriceHistoryDialogTitle') }}</p>
            <p v-if="priceHistoryItem" class="smi-qc-header__sub">
              <strong style="color:#fff;">{{ priceHistoryItem.name }}</strong>
            </p>
          </div>
          <button class="smi-qc-header__close" @click="priceHistoryOpen = false"><X :size="16" /></button>
        </div>

        <div class="smi-qc-body">
          <div v-if="priceHistoryLoading" class="smi-qc-loading">
            <v-progress-circular indeterminate size="20" width="2" color="#ff3131" />
            <span>{{ t('smmLoadingHistory') }}</span>
          </div>

          <div v-else-if="!priceHistoryRows.length" class="smi-hist-empty">
            {{ t('smmNoPriceChange') }}
          </div>

          <table v-else class="smi-hist-table">
            <thead>
              <tr>
                <th>{{ t('smmHistDate') }}</th>
                <th>{{ t('smmHistPriceTtc') }}</th>
                <th>{{ t('smmHistVat') }}</th>
                <th>{{ t('smmHistSource') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in priceHistoryRows" :key="h.id">
                <td>{{ new Date(h.createdAt).toLocaleString('fr-FR') }}</td>
                <td><strong>{{ fmtPrice(h.basePrice) }}</strong><span v-if="h.currency" class="smi-hist-cur"> {{ h.currency }}</span></td>
                <td>{{ h.vatRate != null ? Number(h.vatRate) + ' %' : '—' }}</td>
                <td><span class="smi-hist-src">{{ priceSourceLabel(h.source) }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="smi-bulk-dialog__footer">
          <button class="smi-btn smi-btn--primary" @click="priceHistoryOpen = false">{{ t('smmClose') }}</button>
        </div>
      </div>
    </v-dialog>

  </div>
</template>

<script>
import { getAllMenuItems, createMenuItem, bulkCreateMenuItems, updateMenuItem, applyWeezeventPrice, applyWeezeventPrices, getMenuItemPriceHistory } from '@/api/endpoints/menu-item.api'
import { getWeezeventProducts, refreshWeezeventProduct, syncWeezeventData } from '@/api/endpoints/aggregation.api'
import { getProductMappings, getProductMappingStats, createProductMapping, deleteProductMapping, bulkProductMappings } from '@/api/endpoints/mapping.api'
import { createProductType, createProductCategory } from '@/api/endpoints/product.api'
import { useI18n } from '@/i18n/useI18n'
import { htFromTtc } from '@/utils/price'
import { UtensilsCrossed, Check, X, Search, Zap, Plus, ChevronRight, AlertTriangle, Tag, History, Eye } from 'lucide-vue-next'
import {
  findBestMatch as matchBestMenuItem,
  findTopMatches as matchTopMenuItems,
  similarity as strSimilarity,
  isPriceCompatible as pricesCompatible,
} from '@/utils/menuItemMatching'

export default {
  name: 'StepMapMenuItems',

  props: {
    location: { type: Object, required: true },
    spaceId: { type: String, required: true },
    isDark: { type: Boolean, default: false },
    footerTarget: { type: [Object, String], default: null },
  },

  components: { UtensilsCrossed, Check, X, Search, Zap, Plus, ChevronRight, AlertTriangle, Tag, History, Eye },

  emits: ['completed'],

  setup() {
    const { t } = useI18n()
    return { t }
  },

  data() {
    return {
      products: [],
      menuItemsList: [],
      mappingStats: null,
      localMappings: {},
      autoSuggestions: {},
      autoMappingRunning: false,
      autoMappingMessage: '',
      autoMappingMessageType: 'success',
      savingRows: {},
      loading: false,
      error: null,
      activeTab: 'all',
      // Pagination du tableau (évite de rendre des milliers de lignes d'un coup → page figée)
      currentPage: 1,
      pageSize: 50,
      quickCreateOpen: false,
      quickCreateProduct: null,
      quickCreateSaving: false,
      quickCreateLoading: false,
      quickCreateError: null,
      quickCreateForm: { name: '', typeId: '', categoryId: '', basePrice: 0, vatRate: null, discountType: '', discountValue: 0 },

      // inline type creation
      typeCreateOpen: false,
      typeCreateName: '',
      typeCreateLoading: false,
      typeCreateError: '',

      // inline category creation
      categoryCreateOpen: false,
      categoryCreateName: '',
      categoryCreateLoading: false,
      categoryCreateError: '',

      showSuggestionsDialog: false,

      // bulk create & map
      bulkCreateDialog: false,
      bulkCreateRunning: false,
      bulkCreateProgress: 0,
      bulkCreateTotal: 0,
      bulkCreateErrors: 0,
      bulkCreatePhase: '',  // 'patching' | 'sync' | 'preparing' | 'creating' | 'done' | 'error'
      bulkCreateMessage: '',

      // Application du prix Weezevent → menu item (+ historique)
      priceApplying: {},        // { [productId]: 'saving' | 'done' | 'error' }
      applyAllRunning: false,
      // Réparation des ventes non liées (WeezeventTransactionItem.productId null)
      priceHistoryOpen: false,
      priceHistoryItem: null,   // { productId, menuItemId, name }
      priceHistoryRows: [],
      priceHistoryLoading: false,
      // Masquer les produits du catalogue jamais vendus (filtrés côté backend via onlySold). Total
      // catalogue (meta.total) pour afficher le nombre masqué. Interrupteur pour tout réafficher.
      hideUnsold: true,
      catalogTotal: 0,
    }
  },

  computed: {
    // Le filtrage « vendus seulement » est fait CÔTÉ BACKEND (onlySold) : this.products ne contient
    // déjà que les produits pertinents. Le nombre masqué = total catalogue (meta.total) − renvoyés.
    unsoldHiddenCount() {
      if (!this.hideUnsold) return 0
      return Math.max((this.catalogTotal || 0) - this.products.length, 0)
    },
    totalProductCount() {
      return this.productRows.length
    },
    mappedCount() {
      return this.productRows.filter(r => !!this.localMappings[r.id]).length
    },
    unmappedCount() {
      return this.productRows.filter(r => !this.localMappings[r.id]).length
    },
    autoSuggestionCount() {
      return Object.keys(this.autoSuggestions).filter(id => !this.localMappings[id]).length
    },
    patchableItemsCount() {
      if (!this.spaceId) return 0
      return Object.entries(this.localMappings).filter(([, menuItemId]) => {
        const item = this.menuItemsList.find(mi => mi.id === menuItemId)
        return item && !(item.spaceIds || []).includes(this.spaceId)
      }).length
    },
    hasPendingSaves() {
      return Object.values(this.savingRows).some(s => s === 'saving')
    },
    topMatchesMap() {
      const result = {}
      for (const item of this.pagedRows) {
        result[item.id] = this.findTopMatches(item)
      }
      return result
    },
    suggestionList() {
      return Object.entries(this.autoSuggestions)
        .filter(([id]) => !this.localMappings[id])
        .map(([productId, menuItemId]) => {
          const product = this.products.find(p => p.id === productId)
          const menuItem = this.menuItemsList.find(mi => mi.id === menuItemId)
          const match = product ? this.findBestMatch(product) : null
          return {
            productId,
            productName: product?.name || productId,
            productPrice: product?.basePrice ?? null,
            menuItemId,
            menuItemName: menuItem?.name || '—',
            score: match?.matchScore ?? null,
          }
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    },
    // Nombre d'articles mappés dont le prix DataFriday diffère du prix Weezevent connu
    // (= candidats à « Appliquer les prix Weezevent »).
    applicablePriceCount() {
      return this.productRows.filter(row => this.canApplyPrice(row)).length
    },
    headers() {
      return [
        { title: this.t('smmColProduct'), key: 'name', width: '40%' },
        { title: this.t('smmColMenuItem'), key: 'menuItem', width: '45%' },
        { title: this.t('smmColMatch'), key: 'match', width: '15%', align: 'center' },
      ]
    },
    menuItemOptions() {
      return this.menuItemsList.map(mi => ({ id: mi.id, label: mi.name }))
    },
    productRows() {
      return this.products.map(p => {
        const match = this.findBestMatch(p)
        const basePrice = p.basePrice ?? null
        const vatRate = p.vatRate ?? null
        // HT exposé à côté du TTC (basePrice = TTC). null si TVA inconnue.
        const priceHt = (basePrice != null && vatRate != null)
          ? Math.round((Number(basePrice) / (1 + Number(vatRate) / 100)) * 100) / 100
          : null
        return {
          id: p.id,
          name: p.name || p.label || `${this.t('smmProductFallback')} ${p.id}`,
          basePrice,
          vatRate,
          priceHt,
          nature: p.nature ?? null,
          subnature: p.subnature ?? null,
          productType: p.productType ?? null,
          matchScore: match?.matchScore || null,
          priceVerified: match?.priceVerified ?? false,
        }
      })
    },
    displayedRows() {
      return this.filteredRows
    },
    // Pagination : on ne rend que la page courante (pageSize lignes) pour ne pas figer
    // l'onglet avec un gros catalogue Weezevent.
    totalPages() {
      return Math.max(1, Math.ceil(this.displayedRows.length / this.pageSize))
    },
    pagedRows() {
      const start = (this.currentPage - 1) * this.pageSize
      return this.displayedRows.slice(start, start + this.pageSize)
    },
    pageRangeStart() {
      return this.displayedRows.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1
    },
    pageRangeEnd() {
      return Math.min(this.currentPage * this.pageSize, this.displayedRows.length)
    },
        filteredRows() {
      if (this.activeTab === 'mapped') return this.productRows.filter(r => !!this.localMappings[r.id])
      if (this.activeTab === 'unmapped') return this.productRows.filter(r => !this.localMappings[r.id])
      return this.productRows
    },
    productTypes() {
      return this.$store.getters['productTypes/productTypes'] || []
    },
    filteredQuickCreateCategories() {
      const cats = this.$store.getters['productCategories/productCategories'] || []
      if (!this.quickCreateForm.typeId) return cats
      return cats.filter(c => c.typeId === this.quickCreateForm.typeId)
    },
    typeSelectItems() {
      return [
        ...this.productTypes,
        { id: '__create_type__', name: this.t('smmCreateTypeOption') },
      ]
    },
    categorySelectItems() {
      return [
        ...this.filteredQuickCreateCategories,
        { id: '__create_category__', name: this.t('smmCreateCategoryOption') },
      ]
    },
    selectedQuickTypeName() {
      return this.productTypes.find(t => t.id === this.quickCreateForm.typeId)?.name || ''
    },
    // Décomposition de prix calculée à la volée — réplique exacte de
    // MenuItemPricingService.computePricing (backend) : basePrice = TTC brut,
    // TVA assise sur le net (après remise, règle FR). HT/TVA = null si pas de taux.
    quickCreatePricing() {
      const round2 = (v) => {
        const n = Number(v)
        return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0
      }
      const basePrice = Number(this.quickCreateForm.basePrice) || 0
      const rawRate = this.quickCreateForm.vatRate
      const hasVat = rawRate !== '' && rawRate != null && Number.isFinite(Number(rawRate))
      const vatRate = hasVat ? Number(rawRate) : null
      const divisor = hasVat ? 1 + vatRate / 100 : 1

      const grossTtc = round2(basePrice)
      const grossHt = hasVat ? round2(basePrice / divisor) : null
      const grossVat = hasVat ? round2(grossTtc - grossHt) : null

      const dType = this.quickCreateForm.discountType
      const dVal = Number(this.quickCreateForm.discountValue) || 0
      let discountTtc = 0
      if (dType === 'percent') discountTtc = round2((basePrice * dVal) / 100)
      else if (dType === 'amount') discountTtc = round2(dVal)
      discountTtc = Math.min(Math.max(discountTtc, 0), grossTtc) // clamp 0..TTC

      const netTtc = round2(grossTtc - discountTtc)
      const netHt = hasVat ? round2(netTtc / divisor) : null
      const netVat = hasVat ? round2(netTtc - netHt) : null

      return {
        hasVat,
        hasDiscount: discountTtc > 0,
        grossTtc, grossHt, grossVat,
        discountTtc,
        netTtc, netHt, netVat,
      }
    },
    bulkSteps() {
      const phase = this.bulkCreatePhase
      const isDone = phase === 'done'
      return [
        { label: this.t('smmStepCatalog'),    active: phase === 'sync',      done: isDone || ['preparing','creating'].includes(phase) },
        { label: this.t('smmStepCategories'), active: phase === 'preparing', done: isDone || phase === 'creating' },
        { label: this.t('smmStepCreation'),   active: phase === 'creating',  done: isDone },
      ]
    },
  },

  mounted() {
    if (this.location) this.loadData(this.location.id)
  },

  watch: {
    'location.id'(val) {
      if (val) this.loadData(val)
    },
    // Revenir page 1 dès que la liste affichée change (onglet / chargement).
    activeTab() {
      this.currentPage = 1
    },
    // Le filtrage vendus/tous est fait côté backend → on recharge la liste au changement.
    hideUnsold() {
      this.currentPage = 1
      const id = this.location?.id
      if (id) this.loadData(id)
    },
    // Clamp : si la liste rétrécit (ex. après mapping en masse), ne pas rester sur une page vide.
    totalPages(val) {
      if (this.currentPage > val) this.currentPage = val
    },
    'quickCreateForm.typeId'(newTypeId) {
      // Only reset categoryId if the current category doesn't belong to the new type
      // (avoids wiping pre-filled categoryId when both are set programmatically)
      const cats = this.$store.getters['productCategories/productCategories'] || []
      const currentCat = cats.find(c => c.id === this.quickCreateForm.categoryId)
      if (!currentCat || currentCat.typeId !== newTypeId) {
        this.quickCreateForm.categoryId = ''
      }
    },
  },

  methods: {
    async refreshMappingsAndStats() {
      const integrationId = this.location?.id
      const [mappingsRes, statsRes] = await Promise.all([
        getProductMappings(),
        getProductMappingStats(integrationId),
      ])

      const productIds = new Set(this.products.map(p => p.id))
      const allMappings = mappingsRes?.data || mappingsRes || []
      const map = {}
      for (const m of allMappings) {
        if (productIds.has(m.weezeventProductId) && m.menuItemId) {
          map[m.weezeventProductId] = m.menuItemId
        }
      }

      this.localMappings = map
      this.mappingStats = statsRes?.data || statsRes || null
    },

    async loadData(integrationId) {
      this.loading = true
      this.error = null
      try {
        const [productsRes, menuItemsRes, mappingsRes, statsRes] = await Promise.all([
          getWeezeventProducts(null, integrationId, this.spaceId, this.hideUnsold),
          getAllMenuItems(),
          getProductMappings(),
          getProductMappingStats(integrationId),
        ])

        this.products = (productsRes?.data || productsRes || []).filter(p => p.productType !== 'VARIANT')
        // meta.total = total catalogue NON filtré → sert à afficher le nombre de produits masqués.
        this.catalogTotal = productsRes?.meta?.total ?? this.products.length
        this.mappingStats = statsRes?.data || statsRes || null
        this.menuItemsList = Array.isArray(menuItemsRes?.data)
          ? menuItemsRes.data
          : Array.isArray(menuItemsRes)
            ? menuItemsRes
            : []

        const productIds = new Set(this.products.map(p => p.id))
        const allMappings = mappingsRes?.data || mappingsRes || []
        const map = {}
        for (const m of allMappings) {
          if (productIds.has(m.weezeventProductId) && m.menuItemId) {
            map[m.weezeventProductId] = m.menuItemId
          }
        }
        this.localMappings = map
        this.savingRows = {}

        const suggestions = {}
        for (const product of this.products) {
          if (this.localMappings[product.id]) continue
          const match = this.findBestMatch(product)
          if (match && (match.matchScore || 0) >= 70) {
            suggestions[product.id] = match.id
          }
        }
        this.autoSuggestions = suggestions

        // Parallèle de la reconstruction du badge d'étage (étape 2) : on rattache
        // automatiquement l'espace courant aux items déjà mappés qui ne l'ont pas, dès
        // l'ouverture de l'étape. Ainsi l'espace « tient » après un refresh sans action
        // manuelle (idempotent, additif). Les nouveaux maps reçoivent déjà l'espace.
        await this.ensureSpaceOnMappedItems()
      } catch (err) {
        console.error('[StepMapMenuItems] loadData error:', err)
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    // Matcher déplacé dans src/utils/menuItemMatching.js (source unique partagée
    // avec la réconciliation EventPredict). Wrappers conservés pour ne pas toucher
    // aux call sites (this.findBestMatch / this.similarity / this.isPriceCompatible).
    isPriceCompatible(productPrice, menuItemPrice) {
      return pricesCompatible(productPrice, menuItemPrice)
    },

    findBestMatch(productOrName) {
      return matchBestMenuItem(productOrName, this.menuItemsList)
    },

    findTopMatches(productOrName, n = 5) {
      return matchTopMenuItems(productOrName, this.menuItemsList, n)
    },

    similarity(a, b) {
      return strSimilarity(a, b)
    },

    async updateMapping(productId, menuItemId) {
      const updated = { ...this.localMappings }
      if (menuItemId == null) { delete updated[productId] } else { updated[productId] = menuItemId }
      this.localMappings = updated
      const suggestions = { ...this.autoSuggestions }
      delete suggestions[productId]
      this.autoSuggestions = suggestions
      this.savingRows = { ...this.savingRows, [productId]: 'saving' }
      try {
        if (menuItemId == null) {
          await deleteProductMapping(productId)
        } else {
          // Passe l'espace courant : le backend rattache l'item au space (spaceIds).
          await createProductMapping(productId, menuItemId, this.spaceId)
          // Mettre à jour le state local immédiatement pour que patchableItemsCount se remette à 0
          if (this.spaceId) {
            const idx = this.menuItemsList.findIndex(mi => mi.id === menuItemId)
            if (idx !== -1 && !(this.menuItemsList[idx].spaceIds || []).includes(this.spaceId)) {
              this.menuItemsList[idx] = {
                ...this.menuItemsList[idx],
                spaceIds: [...(this.menuItemsList[idx].spaceIds || []), this.spaceId],
              }
            }
          }
        }
        await this.refreshMappingsAndStats()
        this.savingRows = { ...this.savingRows, [productId]: 'saved' }
      } catch (err) {
        console.error('[StepMapMenuItems] save error:', err)
        this.savingRows = { ...this.savingRows, [productId]: 'error' }
      }
    },

    // ── Prix Weezevent → menu item (+ historique) ───────────────────────────

    fmtPrice(value) {
      const n = Number(value)
      return Number.isFinite(n) ? `${n.toFixed(2)} €` : '—'
    },

    pricesEqual(a, b) {
      if (a == null || b == null) return false
      return Math.abs(Number(a) - Number(b)) < 0.005
    },

    /** Menu item actuellement mappé à un produit (ou null). */
    currentMenuItem(row) {
      const menuItemId = this.localMappings[row.id]
      if (!menuItemId) return null
      return this.menuItemsList.find(mi => mi.id === menuItemId) || null
    },

    /**
     * Prix de l'article DANS l'espace courant : `spacePrices[spaceId]` ({ ttc, vatRate } ou
     * nombre legacy). Renvoie `null` si l'article n'a pas de prix propre à cet espace.
     */
    spacePriceEntry(mi) {
      if (!mi || !this.spaceId) return null
      const sp = mi.spacePrices
      if (!sp || typeof sp !== 'object') return null
      const raw = sp[this.spaceId]
      if (raw == null) return null
      if (typeof raw === 'object') {
        const ttc = Number(raw.ttc)
        if (!Number.isFinite(ttc)) return null
        return { ttc, vatRate: raw.vatRate != null ? Number(raw.vatRate) : (mi.vatRate != null ? Number(mi.vatRate) : null) }
      }
      const n = Number(raw)
      return Number.isFinite(n) ? { ttc: n, vatRate: mi.vatRate != null ? Number(mi.vatRate) : null } : null
    },

    /**
     * Prix DataFriday de l'article mappé POUR L'ESPACE courant (number) ou null si non mappé.
     * STRICTEMENT le prix propre à l'espace (`spacePrices[spaceId]`) : s'il n'y en a pas, c'est 0
     * (le prix global `basePrice` n'est PAS un repli — on n'affiche pas le prix d'un autre espace).
     */
    currentMenuPrice(row) {
      const mi = this.currentMenuItem(row)
      if (!mi) return null
      const entry = this.spacePriceEntry(mi)
      return entry ? entry.ttc : 0
    },

    /** Prix produit Weezevent en HT (basePrice TTC + vatRate dérivé des ventes). */
    productHt(row) {
      return htFromTtc(row?.basePrice, row?.vatRate)
    },

    /** Prix DataFriday de l'article mappé en HT (TVA de l'espace si prix propre à l'espace). */
    currentMenuPriceHt(row) {
      const mi = this.currentMenuItem(row)
      const entry = this.spacePriceEntry(mi)
      const vat = entry ? entry.vatRate : mi?.vatRate
      return htFromTtc(this.currentMenuPrice(row), vat)
    },

    /**
     * Le bouton « Appliquer le prix Weezevent » a un sens si : l'article est mappé, le prix
     * Weezevent est connu, et il diffère du prix DataFriday courant (sinon rien à faire).
     */
    canApplyPrice(row) {
      if (!this.localMappings[row.id]) return false
      if (row.basePrice == null) return false
      return !this.pricesEqual(row.basePrice, this.currentMenuPrice(row))
    },

    /**
     * Met à jour le prix local de l'article mappé (rafraîchit l'affichage sans recharger).
     * En mode espace, on écrit dans `spacePrices[spaceId]` (le prix global `basePrice` n'est
     * plus touché) ; sinon on met à jour le prix global comme avant.
     */
    patchLocalMenuItemPrice(menuItemId, ttc, vatRate) {
      const idx = this.menuItemsList.findIndex(mi => mi.id === menuItemId)
      if (idx === -1) return
      const mi = this.menuItemsList[idx]
      if (this.spaceId) {
        const sp = { ...(mi.spacePrices && typeof mi.spacePrices === 'object' ? mi.spacePrices : {}) }
        const prevTtc = this.spacePriceEntry(mi)?.ttc ?? null
        sp[this.spaceId] = {
          ttc: ttc != null ? Number(ttc) : prevTtc,
          vatRate: vatRate != null ? Number(vatRate) : null,
        }
        this.menuItemsList[idx] = { ...mi, spacePrices: sp }
      } else {
        this.menuItemsList[idx] = {
          ...mi,
          basePrice: ttc != null ? ttc : mi.basePrice,
          vatRate: vatRate != null ? vatRate : mi.vatRate,
        }
      }
    },

    /** Applique le prix Weezevent d'un produit à l'article mappé (et l'archive côté backend). */
    async applyPrice(row) {
      const menuItemId = this.localMappings[row.id]
      if (!menuItemId) return
      this.priceApplying = { ...this.priceApplying, [row.id]: 'saving' }
      try {
        // On envoie le prix DU PRODUIT TEL QU'AFFICHÉ : le menu item en hérite exactement.
        const res = await applyWeezeventPrice(menuItemId, row.id, this.spaceId || null, {
          basePrice: row.basePrice,
          vatRate: row.vatRate,
        })
        const applied = res?.applied
        this.patchLocalMenuItemPrice(menuItemId, applied?.basePrice, applied?.vatRate)
        this.priceApplying = { ...this.priceApplying, [row.id]: 'done' }
      } catch (err) {
        console.error('[StepMapMenuItems] applyPrice error:', err)
        this.priceApplying = { ...this.priceApplying, [row.id]: 'error' }
        this.error = err?.userMessage || this.t('smmApplyPriceError')
      }
    },

    /** Applique en masse le prix Weezevent à tous les articles mappés dont le prix diffère. */
    async applyAllPrices() {
      if (this.applyAllRunning) return
      const items = this.productRows
        .filter(row => this.canApplyPrice(row))
        .map(row => ({ menuItemId: this.localMappings[row.id], weezeventProductId: row.id, basePrice: row.basePrice, vatRate: row.vatRate }))
      if (!items.length) return
      this.applyAllRunning = true
      this.error = null
      try {
        const res = await applyWeezeventPrices(items, this.spaceId || null)
        for (const r of res?.results || []) {
          if (r.changed && r.applied) {
            this.patchLocalMenuItemPrice(r.menuItemId, r.applied.basePrice, r.applied.vatRate)
          }
        }
      } catch (err) {
        console.error('[StepMapMenuItems] applyAllPrices error:', err)
        this.error = err?.userMessage || this.t('smmApplyPricesError')
      } finally {
        this.applyAllRunning = false
      }
    },

    async openPriceHistory(row) {
      const menuItemId = this.localMappings[row.id]
      if (!menuItemId) return
      this.priceHistoryItem = { productId: row.id, menuItemId, name: row.name }
      this.priceHistoryOpen = true
      this.priceHistoryLoading = true
      this.priceHistoryRows = []
      try {
        this.priceHistoryRows = await getMenuItemPriceHistory(menuItemId) || []
      } catch (err) {
        console.error('[StepMapMenuItems] price history error:', err)
      } finally {
        this.priceHistoryLoading = false
      }
    },

    priceSourceLabel(source) {
      if (source === 'weezevent_catalog') return this.t('smmSourceCatalog')
      if (source === 'weezevent_sales') return this.t('smmSourceSales')
      if (source === 'manual') return this.t('smmSourceManual')
      return source || '—'
    },

    /**
     * Réparation : rattache l'espace courant aux items DÉJÀ mappés qui ne l'ont pas
     * encore dans leur spaceIds. Les NOUVEAUX maps reçoivent déjà l'espace côté backend
     * (bulkProductMappings/createProductMapping avec spaceId) ; cette passe couvre les
     * items mappés lors d'une session précédente, sans toucher aux mappings eux-mêmes.
     */
    async ensureSpaceOnMappedItems() {
      if (!this.spaceId) return
      const mappedIds = [...new Set(Object.values(this.localMappings).filter(Boolean))]
      const toHeal = mappedIds
        .map(id => this.menuItemsList.find(mi => mi.id === id))
        .filter(item => item && !(item.spaceIds || []).includes(this.spaceId))
      if (!toHeal.length) return
      const results = await Promise.allSettled(
        toHeal.map(item => updateMenuItem(item.id, { spaceIds: [...(item.spaceIds || []), this.spaceId] })),
      )
      results.forEach((result, i) => {
        if (result.status !== 'fulfilled') {
          console.warn('[ensureSpaceOnMappedItems] patch space error:', result.reason)
          return
        }
        const healed = toHeal[i]
        const idx = this.menuItemsList.findIndex(mi => mi.id === healed.id)
        if (idx !== -1) {
          this.menuItemsList[idx] = {
            ...this.menuItemsList[idx],
            spaceIds: result.value?.spaceIds ?? [...(healed.spaceIds || []), this.spaceId],
          }
        }
      })
    },

    async applyAutoSuggestions() {
      if (this.autoMappingRunning) return

      const entries = Object.entries(this.autoSuggestions)
        .filter(([productId, menuItemId]) => !this.localMappings[productId] && menuItemId)

      if (!entries.length) {
        this.autoSuggestions = {}
        // Pas de nouvelle suggestion, mais on rattache quand même l'espace courant
        // aux items déjà mappés qui ne l'ont pas (répare les « mappés sans espace »).
        await this.ensureSpaceOnMappedItems()
        return
      }

      this.autoMappingMessage = ''
      const pending = {}
      for (const [productId] of entries) pending[productId] = 'saving'
      this.savingRows = { ...this.savingRows, ...pending }
      this.autoMappingRunning = true

      const mappings = entries.map(([productId, menuItemId]) => ({
        weezeventProductId: productId,
        menuItemId,
        autoMapped: true,
        confidence: null,
      }))

      try {
        // spaceId : le backend rattache chaque item mappé à l'espace courant.
        const res = await bulkProductMappings(mappings, this.spaceId)
        const failedIds = new Set((res?.errors || []).map(e => e.weezeventProductId))
        const updatedMappings = { ...this.localMappings }
        const updatedSuggestions = { ...this.autoSuggestions }
        const updatedSavingRows = { ...this.savingRows }

        for (const [productId, menuItemId] of entries) {
          if (failedIds.has(productId)) {
            updatedSavingRows[productId] = 'error'
            continue
          }
          updatedMappings[productId] = menuItemId
          updatedSavingRows[productId] = 'saved'
          delete updatedSuggestions[productId]
        }

        this.localMappings = updatedMappings
        this.autoSuggestions = updatedSuggestions
        this.savingRows = updatedSavingRows
        await this.refreshMappingsAndStats()
        // Rattache aussi l'espace aux items déjà mappés sur une session précédente.
        await this.ensureSpaceOnMappedItems()
        this.autoMappingMessageType = failedIds.size > 0 ? 'warning' : 'success'
        this.autoMappingMessage = failedIds.size > 0
          ? `${entries.length - failedIds.size} ${this.t('smmMappingsAppliedMid')} ${failedIds.size} ${this.t('smmFailedSuffix')}`
          : `${entries.length} ${this.t('smmMappingsApplied')}`
      } catch (err) {
        console.error('[StepMapMenuItems] bulk auto-map error:', err)
        const updatedSavingRows = { ...this.savingRows }
        for (const [productId] of entries) updatedSavingRows[productId] = 'error'
        this.savingRows = updatedSavingRows
        this.autoMappingMessageType = 'error'
        this.autoMappingMessage = err?.response?.data?.message || err?.message || this.t('smmAutoMappingFailed')
      } finally {
        this.autoMappingRunning = false
      }
    },

    async acceptSuggestion(productId) {
      const menuItemId = this.autoSuggestions[productId]
      if (menuItemId) await this.updateMapping(productId, menuItemId)
    },

    rejectSuggestion(productId) {
      const suggestions = { ...this.autoSuggestions }
      delete suggestions[productId]
      this.autoSuggestions = suggestions
    },

    handleQuickTypeChange(val) {
      if (val === '__create_type__') {
        this.typeCreateName = ''
        this.typeCreateError = ''
        this.typeCreateOpen = true
        return
      }
      this.quickCreateForm.typeId = val || ''
      this.quickCreateForm.categoryId = ''
    },

    handleQuickCategoryChange(val) {
      if (val === '__create_category__') {
        this.categoryCreateName = ''
        this.categoryCreateError = ''
        this.categoryCreateOpen = true
        return
      }
      this.quickCreateForm.categoryId = val || ''
    },

    async submitTypeCreate() {
      const name = this.typeCreateName.trim()
      if (!name) { this.typeCreateError = this.t('smmNameRequired'); return }
      this.typeCreateLoading = true
      this.typeCreateError = ''
      try {
        const res = await createProductType({ name })
        const created = res?.data || res
        const id = created?.id || created?._id
        if (!id) throw new Error(this.t('smmCannotCreateType'))
        await this.$store.dispatch('productTypes/addProductType', { ...created, id })
        this.quickCreateForm.typeId = id
        this.quickCreateForm.categoryId = ''
        this.typeCreateOpen = false
        // enchaîner la création de catégorie
        this.categoryCreateName = ''
        this.categoryCreateError = ''
        this.categoryCreateOpen = true
      } catch (err) {
        this.typeCreateError = err?.response?.data?.message || err?.message || this.t('smmCreationFailed')
      } finally {
        this.typeCreateLoading = false
      }
    },

    async submitCategoryCreate() {
      const name = this.categoryCreateName.trim()
      if (!name) { this.categoryCreateError = this.t('smmNameRequired'); return }
      if (!this.quickCreateForm.typeId) { this.categoryCreateError = this.t('smmSelectTypeFirst'); return }
      this.categoryCreateLoading = true
      this.categoryCreateError = ''
      try {
        const res = await createProductCategory({ name, typeId: this.quickCreateForm.typeId })
        const created = res?.data || res
        const id = created?.id || created?._id
        if (!id) throw new Error(this.t('smmCannotCreateCategory'))
        await this.$store.dispatch('productCategories/addProductCategory', {
          ...created, id,
          typeId: created?.typeId || this.quickCreateForm.typeId,
          typeName: this.selectedQuickTypeName,
        })
        this.quickCreateForm.categoryId = id
        this.categoryCreateOpen = false
      } catch (err) {
        this.categoryCreateError = err?.response?.data?.message || err?.message || this.t('smmCreationFailed')
      } finally {
        this.categoryCreateLoading = false
      }
    },

    // Finds-or-creates a ProductType by name, returns its id
    async ensureType(name) {
      if (!name) return ''
      const types = this.$store.getters['productTypes/productTypes'] || []
      const norm = name.toLowerCase().trim()
      const existing = types.find(t => t.name.toLowerCase().trim() === norm)
      if (existing) return existing.id
      try {
        const res = await createProductType({ name })
        const created = res?.data || res
        const id = created?.id || created
        await this.$store.dispatch('productTypes/fetchProductTypes')
        return id
      } catch (err) {
        console.warn('[ensureType] failed to create type:', name, err)
        return ''
      }
    },

    // Finds-or-creates a ProductCategory by name + typeId, returns its id
    async ensureCategory(name, typeId) {
      if (!name || !typeId) return ''
      const cats = this.$store.getters['productCategories/productCategories'] || []
      const norm = name.toLowerCase().trim()
      const existing = cats.find(c => c.name.toLowerCase().trim() === norm && c.typeId === typeId)
      if (existing) return existing.id
      try {
        const res = await createProductCategory({ name, typeId })
        const created = res?.data || res
        const id = created?.id || created
        await this.$store.dispatch('productCategories/fetchProductCategories')
        return id
      } catch (err) {
        console.warn('[ensureCategory] failed to create category:', name, err)
        return ''
      }
    },

    async openQuickCreate(product) {
      this.quickCreateProduct = product
      this.quickCreateError = null
      this.quickCreateLoading = true

      // Open dialog immediately with name + price so the user sees it right away
      this.quickCreateForm = {
        name: product.name || '',
        typeId: '',
        categoryId: '',
        basePrice: product.basePrice != null ? Number(product.basePrice) : 0,
        // TVA réelle Weezevent si connue ; sinon null → défaut tenant côté serveur
        vatRate: product.vatRate != null ? Number(product.vatRate) : null,
        discountType: '',
        discountValue: 0,
      }
      this.quickCreateOpen = true

      // Populate type/category asynchronously in the background
      try {
        await Promise.all([
          this.$store.dispatch('productTypes/fetchProductTypes'),
          this.$store.dispatch('productCategories/fetchProductCategories'),
        ])

        // Products created during transaction sync have empty classification fields
        // (nature, subnature, productType, categoryId). In that case we call the
        // Weezevent products API to get the full data, then persist it in the DB.
        let freshNature = product.nature
        let freshSubnature = product.subnature
        let freshProductType = product.productType
        let freshBasePrice = product.basePrice

        const needsRefresh = (!product.productType && !product.nature) || product.basePrice == null || Number(product.basePrice) === 0
        if (needsRefresh) {
          try {
            // spaceId : le prix dérivé reste celui de l'espace courant (jamais un autre espace).
            const fresh = await refreshWeezeventProduct(product.id, this.spaceId)
            freshNature = fresh?.nature ?? null
            freshSubnature = fresh?.subnature ?? null
            freshProductType = fresh?.productType ?? null
            freshBasePrice = fresh?.basePrice != null ? Number(fresh.basePrice) : freshBasePrice
            // Update the local products list so the table reflects the fresh data
            const idx = this.products.findIndex(p => p.id === product.id)
            if (idx !== -1) {
              this.products = [
                ...this.products.slice(0, idx),
                { ...this.products[idx], nature: freshNature, subnature: freshSubnature, productType: freshProductType, basePrice: freshBasePrice },
                ...this.products.slice(idx + 1),
              ]
            }
            if (freshBasePrice != null) {
              this.quickCreateForm = {
                ...this.quickCreateForm,
                basePrice: Number(freshBasePrice),
                vatRate: fresh?.vatRate != null ? Number(fresh.vatRate) : this.quickCreateForm.vatRate,
              }
            }
          } catch (err) {
            console.warn('[openQuickCreate] refresh from API failed, using cached values:', err?.message)
          }
        }

        // Auto-match type from Weezevent `nature` (CUP/DRINK/FOOD/MERCH/OTHER).
        // Weezevent `type` (STANDARD/MENU/PACK/…) is a commerce type, not a food classification — not usable here.
        let prefilledTypeId = ''
        let prefilledCategoryId = ''

        if (freshNature) {
          prefilledTypeId = await this.ensureType(freshNature)
        }

        if (freshSubnature && prefilledTypeId) {
          prefilledCategoryId = await this.ensureCategory(freshSubnature, prefilledTypeId)
        }

        if (prefilledTypeId || prefilledCategoryId) {
          this.quickCreateForm = {
            ...this.quickCreateForm,
            typeId: prefilledTypeId,
            categoryId: prefilledCategoryId,
          }
        }
      } finally {
        this.quickCreateLoading = false
      }
    },

    fmtMoney(v) {
      return v == null ? '—' : `${Number(v).toFixed(2)} €`
    },

    async submitQuickCreate() {
      if (!this.quickCreateForm.name) return
      this.quickCreateSaving = true
      this.quickCreateError = null
      try {
        const payload = {
          name: this.quickCreateForm.name,
          typeId: this.quickCreateForm.typeId || null,
          categoryId: this.quickCreateForm.categoryId || null,
          basePrice: this.quickCreateForm.basePrice || 0,
          spaceIds: this.spaceId ? [this.spaceId] : [],
          // BUG-052 : réutilise un MenuItem actif existant du même nom au lieu d'en recréer un
          // doublon à chaque ré-import (cause des SpaceMenuItem orphelins de BUG-051).
          dedupeByName: true,
        }
        // TVA : n'envoyer que si renseignée (sinon le backend applique le défaut tenant)
        const rate = this.quickCreateForm.vatRate
        if (rate !== '' && rate != null && Number.isFinite(Number(rate))) {
          payload.vatRate = Number(rate)
        }
        // Remise : n'envoyer que si un type ET une valeur > 0 sont saisis
        if (this.quickCreateForm.discountType && Number(this.quickCreateForm.discountValue) > 0) {
          payload.discountType = this.quickCreateForm.discountType
          payload.discountValue = Number(this.quickCreateForm.discountValue)
        }
        const res = await createMenuItem(payload)
        const newItem = res?.data || res
        this.menuItemsList = [...this.menuItemsList, newItem]
        await this.updateMapping(this.quickCreateProduct.id, newItem.id)
        if (this.quickCreateProduct.basePrice != null) {
          await this.applyPrice(this.quickCreateProduct)
        }
        this.quickCreateOpen = false
      } catch (err) {
        console.error('[StepMapMenuItems] submitQuickCreate error:', err)
        this.quickCreateError = err?.response?.data?.message || err.message
      } finally {
        this.quickCreateSaving = false
      }
    },

    async bulkCreateAndMap() {
      const integrationId = this.location?.id
      if (!integrationId) return

      // Items déjà mappés mais sans le Space courant dans spaceIds
      const toPatch = this.spaceId
        ? Object.entries(this.localMappings).filter(([, menuItemId]) => {
            const item = this.menuItemsList.find(mi => mi.id === menuItemId)
            return item && !(item.spaceIds || []).includes(this.spaceId)
          })
        : []

      const unmapped = this.productRows.filter(r => !this.localMappings[r.id])

      if (!toPatch.length && !unmapped.length) return

      await Promise.all([
        this.$store.dispatch('productTypes/fetchProductTypes'),
        this.$store.dispatch('productCategories/fetchProductCategories'),
      ])

      this.bulkCreateProgress = 0
      this.bulkCreateTotal = unmapped.length
      this.bulkCreateErrors = 0
      this.bulkCreatePhase = 'patching'
      this.bulkCreateMessage = ''
      this.bulkCreateDialog = true
      this.bulkCreateRunning = true

      let patchedCount = 0

      try {
        // ── Phase 0 : Rattacher les articles existants au Space courant ──
        if (toPatch.length > 0) {
          const PATCH_BATCH = 10
          for (let i = 0; i < toPatch.length; i += PATCH_BATCH) {
            const batch = toPatch.slice(i, i + PATCH_BATCH)
            const results = await Promise.allSettled(
              batch.map(([, menuItemId]) => {
                const item = this.menuItemsList.find(mi => mi.id === menuItemId)
                const currentSpaceIds = Array.isArray(item?.spaceIds) ? item.spaceIds : []
                return updateMenuItem(menuItemId, { spaceIds: [...currentSpaceIds, this.spaceId] })
              })
            )
            for (const result of results) {
              if (result.status === 'fulfilled') {
                patchedCount++
                const updated = result.value?.data || result.value
                if (updated?.id) {
                  const idx = this.menuItemsList.findIndex(mi => mi.id === updated.id)
                  if (idx !== -1) this.menuItemsList[idx] = { ...this.menuItemsList[idx], spaceIds: updated.spaceIds ?? [...(this.menuItemsList[idx].spaceIds || []), this.spaceId] }
                }
              } else {
                console.warn('[bulkCreateAndMap] patch space error:', result.reason)
                this.bulkCreateErrors++
              }
            }
          }
        }

        // Si rien à créer, on s'arrête après le patch.
        // A12 : si des erreurs de patch ont eu lieu, refléter l'état 'error' (pas un faux 'done').
        if (!unmapped.length) {
          this.bulkCreatePhase = this.bulkCreateErrors > 0 ? 'error' : 'done'
          this.bulkCreateMessage = this.bulkCreateErrors > 0
            ? `${patchedCount} ${this.t('smmItemsAttachedMid')} ${this.bulkCreateErrors} ${this.t('smmFailedSuffix')}`
            : `${patchedCount} ${this.t('smmItemsAttachedToSpace')}`
          this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true })
          return
        }

        // ── Phase 1 : Synchroniser tous les produits depuis l'API Weezevent ──
        this.bulkCreatePhase = 'sync'
        // Cela appelle GET /pay/v1/organizations/{org_id}/products en pages de 100
        // et met à jour nature/subnature/productType/categoryId en DB pour tous les produits
        await syncWeezeventData('products', { integrationId })

        // Recharger la liste fraîche depuis la DB (spaceId → prix de l'espace + repli par nom)
        const productsRes = await getWeezeventProducts(null, integrationId, this.spaceId, this.hideUnsold)
        this.products = (productsRes?.data || productsRes || []).filter(p => p.productType !== 'VARIANT')
        this.catalogTotal = productsRes?.meta?.total ?? this.products.length

        // Recalculer les lignes non mappées avec les données fraîches
        const freshUnmapped = this.productRows.filter(r => !this.localMappings[r.id])
        this.bulkCreateTotal = freshUnmapped.length
        this.bulkCreatePhase = 'preparing'

        // ── Idempotence : réutiliser un MenuItem ACTIF de même nom au lieu d'en créer un doublon ──
        // Cause racine du churn (496 noms pour 3304 lignes = ~6 ré-imports) : chaque ré-import
        // recréait tout le catalogue. On réutilise par nom EXACT normalisé (pas de fuzzy, pour ne
        // pas fusionner « Coca 33cl » et « Coca 50cl »). Les items soft-deleted sont ressuscités
        // côté backend lors du mapping (bulkProductMappings).
        const normalizeName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
        const activeMenuItemByName = new Map()
        for (const mi of this.menuItemsList) {
          const key = normalizeName(mi.name)
          if (key && !activeMenuItemByName.has(key)) activeMenuItemByName.set(key, mi)
        }
        const reusable = []   // { product, item } — produits rattachables à un item existant
        const toCreate = []   // produits sans équivalent actif → création
        for (const p of freshUnmapped) {
          const match = activeMenuItemByName.get(normalizeName(p.name))
          if (match?.id) reusable.push({ product: p, item: match })
          else toCreate.push(p)
        }

        // Mapper d'emblée les produits réutilisant un item existant + les rattacher au Space.
        const reuseMappings = []
        for (const { product, item } of reusable) {
          this.localMappings = { ...this.localMappings, [product.id]: item.id }
          reuseMappings.push({ weezeventProductId: product.id, menuItemId: item.id, autoMapped: true })
        }
        if (this.spaceId && reusable.length) {
          const PATCH_BATCH = 10
          const needPatch = reusable.filter(({ item }) => !(item.spaceIds || []).includes(this.spaceId))
          for (let i = 0; i < needPatch.length; i += PATCH_BATCH) {
            const batch = needPatch.slice(i, i + PATCH_BATCH)
            const patchResults = await Promise.allSettled(batch.map(({ item }) =>
              updateMenuItem(item.id, { spaceIds: [...(item.spaceIds || []), this.spaceId] }),
            ))
            // Mettre à jour le state local pour que patchableItemsCount se remette à 0
            patchResults.forEach((result, j) => {
              if (result.status !== 'fulfilled') return
              const { item } = batch[j]
              const updated = result.value?.data || result.value
              const idx = this.menuItemsList.findIndex(mi => mi.id === item.id)
              if (idx !== -1) {
                this.menuItemsList[idx] = {
                  ...this.menuItemsList[idx],
                  spaceIds: updated?.spaceIds ?? [...(item.spaceIds || []), this.spaceId],
                }
              }
            })
          }
        }
        this.bulkCreateProgress = reusable.length

        // ── Phase 2 : S'assurer que tous les types et catégories existent ──
        const typeMap = new Map()   // nature → typeId
        const catMap = new Map()    // `${nature}::${subnature}` → categoryId

        const uniqueNatures = [...new Set(toCreate.map(p => p.nature).filter(Boolean))]
        for (const nature of uniqueNatures) {
          const id = await this.ensureType(nature)
          typeMap.set(nature, id)
        }

        const uniquePairs = [...new Set(
          toCreate
            .filter(p => p.nature && p.subnature)
            .map(p => `${p.nature}::${p.subnature}`)
        )]
        for (const pair of uniquePairs) {
          const [nature, subnature] = pair.split('::')
          const typeId = typeMap.get(nature)
          if (typeId) {
            const id = await this.ensureCategory(subnature, typeId)
            catMap.set(pair, id)
          }
        }

        // ── Phase 3 : Créer les menu items SANS équivalent (toCreate) par batches et mapper ──
        this.bulkCreatePhase = 'creating'
        const BATCH = 500
        const allMappings = [...reuseMappings]

        for (let i = 0; i < toCreate.length; i += BATCH) {
          const chunk = toCreate.slice(i, i + BATCH)
          const items = chunk.map(p => ({
            name: p.name,
            typeId: (p.nature ? typeMap.get(p.nature) : null) || null,
            categoryId: (p.nature && p.subnature ? catMap.get(`${p.nature}::${p.subnature}`) : null) || null,
            basePrice: p.basePrice != null ? Number(p.basePrice) : 0,
            // TVA réelle Weezevent (dérivée des ventes par le backend, cf. getProducts) :
            // sans ça, tous les items auto-mappés naissaient avec vatRate null → taxe 0, HT=TTC.
            vatRate: p.vatRate != null ? Number(p.vatRate) : null,
            spaceIds: this.spaceId ? [this.spaceId] : [],
          }))

          try {
            const res = await bulkCreateMenuItems(items)
            const created = (res?.data || res)?.items || []

            // Add new items to local list
            this.menuItemsList = [...this.menuItemsList, ...created]

            // Match created items back to products by index (same order)
            for (let j = 0; j < chunk.length; j++) {
              const product = chunk[j]
              const newItem = created[j]
              if (newItem?.id) {
                this.localMappings = { ...this.localMappings, [product.id]: newItem.id }
                allMappings.push({ weezeventProductId: product.id, menuItemId: newItem.id, autoMapped: true })
              } else {
                this.bulkCreateErrors++
              }
            }
          } catch (err) {
            console.error('[bulkCreateAndMap] batch error:', err)
            this.bulkCreateMessage = err?.response?.data?.message || err?.message || this.t('smmBatchCreateFailed')
            this.bulkCreateErrors += chunk.length
          }

          this.bulkCreateProgress = Math.min(reusable.length + i + BATCH, freshUnmapped.length)
        }

        // Step 3: bulk map all at once — passer spaceId pour que le backend attache
        // le space à chaque item mappé en même temps que le mapping (pas d'action séparée).
        let mappingFailed = 0
        let mappingLastError = ''
        if (allMappings.length > 0) {
          const mappingRes = await bulkProductMappings(allMappings, this.spaceId)
          mappingFailed = mappingRes?.failed || 0
          this.bulkCreateErrors += mappingFailed
          if (Array.isArray(mappingRes?.errors) && mappingRes.errors.length > 0) {
            mappingLastError = mappingRes.errors[mappingRes.errors.length - 1]?.error || ''
          }
          // Mettre à jour le state local : marquer tous les items mappés comme rattachés au space
          if (this.spaceId) {
            const mappedItemIds = new Set(allMappings.map(m => m.menuItemId).filter(Boolean))
            this.menuItemsList = this.menuItemsList.map(mi =>
              mappedItemIds.has(mi.id) && !(mi.spaceIds || []).includes(this.spaceId)
                ? { ...mi, spaceIds: [...(mi.spaceIds || []), this.spaceId] }
                : mi,
            )
          }
          await this.refreshMappingsAndStats()

          // Auto-apply Weezevent prices for newly created items (not reused ones)
          const priceItems = toCreate
            .filter(p => this.localMappings[p.id] && p.basePrice != null)
            .map(p => ({ menuItemId: this.localMappings[p.id], weezeventProductId: p.id, basePrice: p.basePrice, vatRate: p.vatRate }))
          if (priceItems.length) {
            try {
              const priceRes = await applyWeezeventPrices(priceItems, this.spaceId || null)
              for (const r of priceRes?.results || []) {
                if (r.applied) this.patchLocalMenuItemPrice(r.menuItemId, r.applied.basePrice, r.applied.vatRate)
              }
            } catch (err) {
              console.warn('[bulkCreateAndMap] auto-apply prices failed:', err?.message)
            }
          }
        }
        const mappedOk = Math.max(0, allMappings.length - mappingFailed)
        const patchSummary = patchedCount > 0 ? `${patchedCount} ${this.t('smmItemsAttachedToSpace')} ` : ''
        if (this.bulkCreateErrors > 0) {
          const lastError = mappingLastError
            ? ` ${this.t('smmLastError')} ${mappingLastError}`
            : (this.bulkCreateMessage ? ` ${this.t('smmLastError')} ${this.bulkCreateMessage}` : '')
          this.bulkCreatePhase = 'error'
          this.bulkCreateMessage = `${patchSummary}${mappedOk} ${this.t('smmProductsCreatedMappedOn')} ${freshUnmapped.length}. ${this.bulkCreateErrors} ${this.t('smmProductsNotProcessed')}${lastError}`
        } else {
          this.bulkCreatePhase = 'done'
          this.bulkCreateMessage = `${patchSummary}${mappedOk} ${this.t('smmProductsCreatedMappedOn')} ${freshUnmapped.length}.`
        }
      } catch (err) {
        console.error('[bulkCreateAndMap] fatal error:', err)
        this.bulkCreatePhase = 'error'
        this.bulkCreateMessage = err?.response?.data?.message || err?.message || this.t('smmBulkFatalError')
      } finally {
        this.bulkCreateRunning = false
        this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true })
      }
    },

    async handleSave() {
      if (this.hasPendingSaves) {
        await new Promise(resolve => {
          const check = () => {
            if (!Object.values(this.savingRows).some(s => s === 'saving')) return resolve()
            setTimeout(check, 200)
          }
          setTimeout(check, 200)
          setTimeout(resolve, 5000)
        })
      }
      this.$emit('completed', { products: this.mappedCount })
    },
  },
}
</script>
<style scoped>
/* ── Wrapper ── */
.smi-wrap { padding: 20px 24px; min-height: 100%; background: #f9fafb; }
.smi--dark { background: #111827; color: #e5e7eb; }

/* ── Gradient Header ── */
.smi-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px; border-radius: 18px; margin-bottom: 16px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.smi-header__icon {
  width: 46px; height: 46px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.smi-header__body { flex: 1; min-width: 0; }
.smi-header__title { font-size: 16px; font-weight: 700; color: #fff; margin: 0 0 3px; }
.smi-header__step  { font-size: 13px; font-weight: 400; opacity: .72; }
.smi-header__sub   { font-size: 12.5px; color: rgba(255,255,255,.72); margin: 0; }
.smi-prog-badge {
  display: inline-flex; align-items: center; padding: 4px 14px;
  border-radius: 100px; font-size: 12px; font-weight: 700;
  white-space: nowrap; flex-shrink: 0;
}
.smi-prog-badge--green { background: rgba(255,255,255,.22); color: #fff; }
.smi-prog-badge--gray  { background: rgba(0,0,0,.15); color: rgba(255,255,255,.85); }

/* ── Loading skeletons ── */
.smi-skeletons { display: flex; flex-direction: column; gap: 8px; }
.smi-skeleton-row {
  height: 62px; border-radius: 14px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: smi-shimmer 1.4s infinite;
}
@keyframes smi-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.smi--dark .smi-skeleton-row {
  background: linear-gradient(90deg, #1f2937 25%, #374151 50%, #1f2937 75%);
  background-size: 200% 100%;
}

/* ── Empty state ── */
.smi-empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 48px 24px; color: #9ca3af;
}
.smi-empty-state__icon {
  width: 56px; height: 56px; border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex; align-items: center; justify-content: center; color: #ff3131;
}
.smi-empty-state__text { font-size: 14px; font-weight: 500; color: #6b7280; margin: 0; }

/* ── Banners ── */
.smi-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 16px; border-radius: 14px; margin-bottom: 10px;
  font-size: 13px;
}
.smi-banner__left  { display: flex; align-items: center; gap: 8px; flex: 1; }
.smi-banner__icon  { flex-shrink: 0; }
.smi-banner--amber  { background: #fffbeb; border: 1.5px solid #fde68a; color: #92400e; }
.smi-banner--red    { background: #fef2f2; border: 1.5px solid #fecaca; color: #ff3131; }
.smi-banner--green  { background: #f0fdf4; border: 1.5px solid #bbf7d0; color: #166534; }
.smi-banner--blue   { background: #eff6ff; border: 1.5px solid #bfdbfe; color: #1d4ed8; }
.smi-banner--gray   { background: #f9fafb; border: 1.5px solid #e5e7eb; color: #374151; }

.smi-banner-btn {
  padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600;
  border: none; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all .15s;
  display: inline-flex; align-items: center; gap: 5px;
}
.smi-banner-btn:disabled { opacity: .45; cursor: not-allowed; }
.smi-banner-btn--amber { background: #f59e0b; color: #fff; }
.smi-banner-btn--amber:hover:not(:disabled) { background: #d97706; }
.smi-banner-btn--red   { background: #ff3131; color: #fff; }
.smi-banner-btn--red:hover:not(:disabled) { background: #b91c1c; }
.smi-banner-btn--blue  { background: #2563eb; color: #fff; }
.smi-banner-btn--blue:hover:not(:disabled) { background: #1d4ed8; }
.smi-banner-btn--ghost { background: transparent; color: inherit; padding: 4px 8px; }
.smi-banner-btn--gray  { background: #6b7280; color: #fff; }
.smi-banner-btn--gray:hover:not(:disabled) { background: #4b5563; }
.smi-banner-btn--ghost:hover { background: rgba(0,0,0,.06); border-radius: 8px; }
.smi-banner-btn--ghost-amber { background: transparent; color: #92400e; border: 1px solid #fcd34d; padding: 4px 10px; display:inline-flex; align-items:center; }
.smi-banner-btn--ghost-amber:hover { background: rgba(245,158,11,.12); }
.smi-banner-actions { display:flex; align-items:center; gap:6px; }

/* Suggestions dialog rows */
.smi-suggest-row { display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid #f3f4f6; }
.smi-suggest-row:last-child { border-bottom:none; }
.smi-suggest-row__product { flex:1; min-width:0; }
.smi-suggest-row__item { flex:1; min-width:0; display:flex; align-items:center; gap:6px; }
.smi-suggest-row__name { font-size:13px; font-weight:500; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; }
.smi-suggest-row__price { font-size:11px; color:#6b7280; }
.smi-suggest-row__arrow { color:#9ca3af; font-size:14px; flex-shrink:0; }
.smi-suggest-row__score { font-size:11px; font-weight:600; padding:1px 5px; border-radius:4px; flex-shrink:0; }
.smi-suggest-row__score--high { background:#d1fae5; color:#065f46; }
.smi-suggest-row__score--mid  { background:#fef3c7; color:#92400e; }
.smi-suggest-row__score--low  { background:#fee2e2; color:#991b1b; }
.smi-suggest-row__apply { flex-shrink:0; font-size:12px; padding:3px 10px; border-radius:6px; border:1px solid #d1d5db; background:#fff; color:#374151; cursor:pointer; }
.smi-suggest-row__apply:hover:not(:disabled) { background:#f9fafb; border-color:#9ca3af; }
.smi-suggest-row__apply:disabled { opacity:.45; cursor:not-allowed; }

/* ── Prix DataFriday actuel + application prix Weezevent (par ligne) ── */
.smi-priceline {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 6px; font-size: 11.5px; color: #6b7280;
}
.smi--dark .smi-priceline { color: #9ca3af; }
.smi-priceline__df strong { color: #111827; font-weight: 700; }
.smi--dark .smi-priceline__df strong { color: #f3f4f6; }
.smi-priceline__ttc { margin-left: 6px; font-size: 10px; color: #9ca3af; }
.smi-priceline__apply {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 100px; border: 1.5px solid #bfdbfe;
  background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 600;
  cursor: pointer; white-space: nowrap; transition: all .15s;
}
.smi-priceline__apply:hover:not(:disabled) { background: #dbeafe; }
.smi-priceline__apply:disabled { opacity: .6; cursor: not-allowed; }
.smi-priceline__done { display: inline-flex; align-items: center; gap: 3px; color: #16a34a; font-weight: 600; }
.smi-priceline__hist {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 6px; border: none;
  background: transparent; color: #9ca3af; cursor: pointer; transition: all .15s;
}
.smi-priceline__hist:hover { background: rgba(0,0,0,.06); color: #4b5563; }

/* ── Historique des prix (dialog) ── */
.smi-hist-empty { padding: 24px 8px; text-align: center; color: #6b7280; font-size: 13px; }
.smi-hist-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.smi-hist-table th {
  text-align: left; padding: 8px 10px; color: #6b7280; font-weight: 600;
  border-bottom: 1.5px solid #e5e7eb; font-size: 11px; text-transform: uppercase; letter-spacing: .02em;
}
.smi-hist-table td { padding: 9px 10px; border-bottom: 1px solid #f3f4f6; color: #374151; }
.smi--dark .smi-hist-table td { color: #d1d5db; border-color: #374151; }
.smi-hist-cur { color: #9ca3af; font-size: 11px; }
.smi-hist-src {
  display: inline-block; padding: 2px 8px; border-radius: 100px;
  background: #f3f4f6; color: #4b5563; font-size: 11px; font-weight: 600;
}

/* ── Toolbar ── */
.smi-toolbar {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; background: #fff; border-radius: 14px;
  border: 1.5px solid #e5e7eb; margin-bottom: 10px;
}
.smi--dark .smi-toolbar { background: #1f2937; border-color: #374151; }

.smi-unsold-toggle {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  font-size: 12px; color: #6b7280; cursor: pointer; user-select: none; white-space: nowrap;
}
.smi-unsold-toggle input { cursor: pointer; accent-color: #ff3131; }
.smi-unsold-toggle__count {
  background: #f3f4f6; color: #6b7280; border-radius: 999px; padding: 1px 7px; font-weight: 600; font-size: 11px;
}
.smi--dark .smi-unsold-toggle { color: #9ca3af; }
.smi--dark .smi-unsold-toggle__count { background: #374151; color: #d1d5db; }

.smi-search {
  flex: 1; display: flex; align-items: center; gap: 8px;
  background: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 7px 11px;
  transition: border-color .18s, box-shadow .18s;
}
.smi-search:focus-within { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1); }
.smi-search__icon  { color: #9ca3af; flex-shrink: 0; }
.smi-search__input { flex: 1; border: none; outline: none; background: transparent; font-size: 13px; color: #111827; }
.smi-search__input::placeholder { color: #9ca3af; }
.smi-search__clear { border: none; background: none; color: #9ca3af; cursor: pointer; padding: 0; display: flex; align-items: center; }
.smi--dark .smi-search { background: #111827; border-color: #374151; }
.smi--dark .smi-search__input { color: #e5e7eb; }

.smi-tabs { display: flex; gap: 6px; flex-shrink: 0; }
.smi-tab {
  padding: 5px 13px; border-radius: 100px; font-size: 12.5px; font-weight: 500;
  border: 1.5px solid #e5e7eb; background: #f9fafb; color: #6b7280;
  cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
  transition: all .15s;
}
.smi-tab:hover { border-color: #d1d5db; background: #f3f4f6; }
.smi-tab--active { background: #fef2f2; border-color: #ff3131; color: #ff3131; font-weight: 700; }
.smi-tab__count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  background: #e5e7eb; color: #6b7280; border-radius: 100px; font-size: 10.5px; font-weight: 700;
}
.smi-tab__count--green { background: #dcfce7; color: #16a34a; }
.smi-tab__count--red   { background: #fee2e2; color: #ff3131; }

/* ── Product list ── */
.smi-list { display: flex; flex-direction: column; gap: 6px; }

.smi-list__header {
  display: grid; grid-template-columns: 1.1fr 1.4fr 80px 52px;
  gap: 12px; padding: 6px 16px;
}
.smi-list__header-col {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .6px; color: #9ca3af;
}
.smi-list__header-col--center { text-align: center; }

.smi-list-empty {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; padding: 32px; color: #9ca3af; font-size: 13.5px;
}

/* Pagination */
.smi-pagination {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-top: 12px; flex-wrap: wrap;
}
.smi-pagination__info { font-size: 12.5px; color: #6b7280; }
.smi-pagination__controls { display: flex; align-items: center; gap: 10px; }
.smi-pagination__page { font-size: 12.5px; color: #6b7280; min-width: 92px; text-align: center; }
.smi-pagination__btn {
  padding: 6px 14px; border-radius: 100px; font-size: 12.5px; font-weight: 600;
  border: 1.5px solid #e5e7eb; background: #fff; color: #374151; cursor: pointer;
  transition: background .15s, border-color .15s;
}
.smi-pagination__btn:hover:not(:disabled) { background: #f3f4f6; border-color: #d1d5db; }
.smi-pagination__btn:disabled { opacity: .5; cursor: not-allowed; }
.smi--dark .smi-pagination__info,
.smi--dark .smi-pagination__page { color: #9ca3af; }
.smi--dark .smi-pagination__btn { background: #1f2937; border-color: #374151; color: #d1d5db; }
.smi--dark .smi-pagination__btn:hover:not(:disabled) { background: #374151; }

/* Row */
.smi-row {
  display: grid; grid-template-columns: 1.1fr 1.4fr 80px 52px;
  align-items: center; gap: 12px;
  padding: 11px 16px; border-radius: 14px;
  background: #fff; border: 1.5px solid #e5e7eb;
  transition: border-color .18s, box-shadow .18s;
}
.smi-row:hover { border-color: #d1d5db; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.smi-row--mapped    { border-color: #bbf7d0; background: #f0fdf4; }
.smi-row--suggested { border-color: #fde68a; background: #fffbeb; }
.smi--dark .smi-row { background: #1f2937; border-color: #374151; }
.smi--dark .smi-row--mapped    { background: #052e16; border-color: #166534; }
.smi--dark .smi-row--suggested { background: #1c1500; border-color: #854d0e; }

/* Name col */
.smi-row__name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.smi-row__dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid currentColor;
}
.smi-row__dot--ok      { color: #16a34a; background: #16a34a; }
.smi-row__dot--suggest { color: #f59e0b; background: #f59e0b; }
.smi-row__dot--pending { color: #d1d5db; background: transparent; }
.smi-row__name-body { min-width: 0; }
.smi-row__name-text {
  display: block; font-size: 13.5px; font-weight: 600; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.smi--dark .smi-row__name-text { color: #f3f4f6; }
.smi-row__price { display: block; font-size: 12px; color: #374151; font-weight: 600; margin-top: 1px; }
.smi--dark .smi-row__price { color: #d1d5db; }
.smi-row__price-tag { font-size: 9px; font-weight: 700; color: #6b7280; letter-spacing: .03em; }
.smi-row__price-ttc { margin-left: 6px; font-size: 10px; font-weight: 400; color: #9ca3af; }
.smi-suggestions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.smi-suggestion-pill {
  display: inline-flex; align-items: center;
  padding: 1px 7px; border-radius: 6px;
  background: #f3f4f6; border: 1px solid #e5e7eb;
  font-size: 11px; color: #6b7280; white-space: nowrap;
}
.smi-suggestion-pill em { font-style: normal; color: #9ca3af; font-size: 10px; }
.smi--dark .smi-suggestion-pill { background: #374151; border-color: #4b5563; color: #d1d5db; }
.smi--dark .smi-suggestion-pill em { color: #9ca3af; }

/* Select col */
.smi-row__select-col { min-width: 0; }

/* Native select */
.smi-select {
  width: 100%; padding: 8px 12px; border-radius: 10px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 13px; color: #111827; outline: none;
  transition: border-color .18s, box-shadow .18s;
  cursor: pointer;
}
.smi-select:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1); background: #fff; }
.smi-select--suggested { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.smi-select--full { width: 100%; }
.smi--dark .smi-select { background: #111827; border-color: #374151; color: #e5e7eb; }

/* Match col */
.smi-row__match { display: flex; align-items: center; justify-content: center; }
.smi-match {
  font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 100px;
}
.smi-match--green { background: #dcfce7; color: #16a34a; }
.smi-match--amber { background: #fef9c3; color: #92400e; }
.smi-match--gray  { background: #f3f4f6; color: #9ca3af; }
.smi-match-none   { color: #9ca3af; font-size: 12px; }

/* Actions col */
.smi-row__actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; justify-content: flex-end; }

.smi-act {
  width: 30px; height: 30px; border-radius: 8px;
  border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all .15s; flex-shrink: 0;
}
.smi-act--accept { background: #dcfce7; color: #16a34a; }
.smi-act--accept:hover { background: #bbf7d0; }
.smi-act--reject { background: #fee2e2; color: #ff3131; }
.smi-act--reject:hover { background: #fecaca; }
.smi-act--create { background: #fef2f2; color: #ff3131; border: 1.5px dashed #fca5a5; }
.smi-act--create:hover { background: #fee2e2; border-color: #ff3131; }

.smi-status {
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
}
.smi-status--saving { background: transparent; }
.smi-status--ok    { background: #dcfce7; color: #16a34a; }
.smi-status--error { background: #fee2e2; color: #ff3131; }

/* ── Info bars ── */
.smi-infobar {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 14px; border-radius: 12px; font-size: 13px;
}
.smi-infobar--error { background: #fef2f2; border: 1px solid #fecaca; color: #ff3131; }
.smi-infobar--warn  { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.smi-mt-2 { margin-top: 8px; }
.smi-mt-3 { margin-top: 12px; }
.smi-mb-3 { margin-bottom: 12px; }

/* ── Buttons ── */
.smi-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 20px; border-radius: 100px; font-size: 13px; font-weight: 600;
  cursor: pointer; border: none; transition: all .2s; line-height: 1.4;
}
.smi-btn:disabled { opacity: .45; cursor: not-allowed; }
.smi-btn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49,.3); }
.smi-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.smi-btn--ghost   { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.smi-btn--ghost:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; }

/* ── Footer actions ── */
.smi-footer-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

/* ── Quick-create dialog ── */
.smi-qc-dialog {
  background: #fff; border-radius: 18px; overflow: hidden;
  box-shadow: 0 8px 40px rgba(0,0,0,.18);
}
.smi-qc-dialog--dark { background: #1f2937; }

.smi-qc-header {
  display: flex; align-items: flex-start; gap: 12px; padding: 20px;
  background: #ff3131;
}
.smi-qc-header__icon {
  width: 42px; height: 42px; border-radius: 11px;
  background: rgba(255,255,255,.18); display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.smi-qc-header__text { flex: 1; min-width: 0; }
.smi-qc-header__title { font-size: 15px; font-weight: 700; color: #fff; margin: 0 0 3px; }
.smi-qc-header__sub   { font-size: 12px; color: rgba(255,255,255,.72); margin: 0; }
.smi-qc-header__close {
  margin-left: auto; width: 30px; height: 30px; border-radius: 8px;
  border: none; background: rgba(255,255,255,.15); color: #fff;
  display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
  transition: background .15s;
}
.smi-qc-header__close:hover { background: rgba(255,255,255,.28); }
.smi-qc-header__close:disabled { opacity: .45; cursor: not-allowed; }

.smi-qc-body { padding: 20px; }

.smi-qc-loading {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 10px; margin-bottom: 14px;
  background: #fef2f2; border: 1px solid #fecaca;
  font-size: 13px; color: #ff3131;
}

.smi-qc-section-label {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .6px; color: #9ca3af; margin-bottom: 8px;
}
.smi-qc-dialog--dark .smi-qc-section-label { color: #6b7280; }

.smi-qc-row {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;
}

.smi-qc-field-wrap { display: flex; flex-direction: column; gap: 5px; }

.smi-qc-label { font-size: 12px; font-weight: 600; color: #374151; display: block; }
.smi-qc-dialog--dark .smi-qc-label { color: #d1d5db; }

/* Form floating input */
.smi-qc-input {
  border-radius: 10px !important; border: 1.5px solid #e5e7eb !important; font-size: 13.5px;
  background: #f9fafb;
}
.smi-qc-input:focus {
  border-color: #ff3131 !important; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1) !important;
  background: #fff !important;
}
.smi-qc-dialog--dark .smi-qc-input {
  background: #111827 !important; border-color: #374151 !important; color: #f3f4f6 !important;
}
.smi-qc-dialog--dark .smi-qc-input:focus {
  border-color: #ff3131 !important; background: #1a2233 !important;
}

/* Prefixed price input */
.smi-qc-input-wrap { position: relative; }
.smi-qc-prefix {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  font-size: 13px; color: #6b7280; pointer-events: none;
}
.smi-qc-input--prefixed { padding-left: 24px !important; }
.smi-qc-suffix {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  font-size: 13px; color: #6b7280; pointer-events: none;
}
.smi-qc-input--suffixed { padding-right: 26px !important; }

/* Décomposition de prix (HT / TTC / taxe / remise) */
.smi-qc-pricing {
  margin-top: 12px; padding: 12px 14px; border-radius: 10px;
  background: #f9fafb; border: 1px solid #e5e7eb;
}
.smi-qc-dialog--dark .smi-qc-pricing { background: #111827; border-color: #374151; }
.smi-qc-pricing__row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; color: #374151; padding: 3px 0;
}
.smi-qc-dialog--dark .smi-qc-pricing__row { color: #d1d5db; }
.smi-qc-pricing__row--discount { color: #ff3131; }
.smi-qc-pricing__row--total {
  font-weight: 700; color: #111827; font-size: 14px;
  padding-top: 7px; margin-top: 4px; border-top: 1px solid #e5e7eb;
}
.smi-qc-dialog--dark .smi-qc-pricing__row--total { color: #f3f4f6; border-top-color: #374151; }
.smi-qc-pricing__sub {
  margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e5e7eb;
}
.smi-qc-dialog--dark .smi-qc-pricing__sub { border-top-color: #374151; }
.smi-qc-pricing__sub .smi-qc-pricing__row { font-size: 12px; color: #6b7280; }
.smi-qc-dialog--dark .smi-qc-pricing__sub .smi-qc-pricing__row { color: #9ca3af; }
.smi-qc-pricing__hint {
  margin: 8px 0 0; font-size: 11px; line-height: 1.4; color: #9ca3af;
}

.smi-qc-footer {
  padding: 12px 20px 18px; border-top: 1px solid #f0f0f0;
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
}
.smi-qc-dialog--dark .smi-qc-footer { border-top-color: #374151; }

/* ── Mini dialogs (type / category create) ── */
.smi-mini-dialog {
  background: #fff; border-radius: 18px; overflow: hidden;
  box-shadow: 0 8px 40px rgba(0,0,0,.18);
}
.smi-mini-dialog--dark { background: #1f2937; color: #e5e7eb; }

.smi-mini-dialog__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 14px;
  font-size: 15px; font-weight: 700; color: #111827;
  border-bottom: 1.5px solid #f0f0f0;
}
.smi-mini-dialog--dark .smi-mini-dialog__header { color: #f3f4f6; border-bottom-color: #374151; }

.smi-mini-dialog__close {
  width: 28px; height: 28px; border-radius: 8px; border: none;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: background .15s;
}
.smi-mini-dialog__close:hover { background: #e5e7eb; }
.smi-mini-dialog--dark .smi-mini-dialog__close { background: #374151; color: #9ca3af; }
.smi-mini-dialog--dark .smi-mini-dialog__close:hover { background: #4b5563; }

.smi-mini-dialog__body   { padding: 20px; }
.smi-mini-dialog__hint   { font-size: 13px; color: #6b7280; margin: 0 0 14px; }
.smi-mini-dialog--dark .smi-mini-dialog__hint { color: #9ca3af; }

.smi-mini-dialog__footer {
  padding: 12px 20px 18px; border-top: 1px solid #f0f0f0;
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
}
.smi-mini-dialog--dark .smi-mini-dialog__footer { border-top-color: #374151; }

/* ── Bulk create dialog ── */
.smi-bulk-dialog {
  background: #fff; border-radius: 18px; overflow: hidden;
  box-shadow: 0 8px 40px rgba(0,0,0,.18);
}
.smi-bulk-dialog--dark { background: #1f2937; color: #e5e7eb; }

.smi-bulk-dialog__header {
  display: flex; align-items: center; gap: 14px; padding: 20px;
  background: #ff3131;
}
.smi-bulk-dialog__header-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.18); display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.smi-bulk-dialog__header-title { font-size: 15px; font-weight: 700; color: #fff; margin: 0 0 2px; }
.smi-bulk-dialog__header-sub   { font-size: 12px; color: rgba(255,255,255,.72); margin: 0; }

/* Bulk steps pills */
.smi-bulk-steps {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 20px;
  background: #ff3131;
}
.smi-bulk-step {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 600;
  background: rgba(255,255,255,.15); color: rgba(255,255,255,.6);
  transition: all .2s;
}
.smi-bulk-step--active { background: rgba(255,255,255,.28); color: #fff; }
.smi-bulk-step--done   { background: rgba(255,255,255,.22); color: #fff; }
.smi-bulk-step__num {
  width: 16px; height: 16px; border-radius: 50%; font-size: 9px; font-weight: 800;
  background: rgba(255,255,255,.25); display: flex; align-items: center; justify-content: center;
}
.smi-bulk-step--done .smi-bulk-step__num { background: #fff; color: #ff3131; }

.smi-bulk-dialog__body {
  padding: 28px 24px 20px;
  display: flex; flex-direction: column; align-items: center; gap: 20px;
}

.smi-bulk-progress { display: flex; align-items: center; justify-content: center; }

.smi-bulk-pct { font-size: 13px; font-weight: 700; color: #ff3131; }

.smi-bulk-done-icon {
  width: 72px; height: 72px; border-radius: 50%;
  background: linear-gradient(135deg, #16a34a, #15803d);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 20px rgba(22,163,74,.3);
}
.smi-bulk-error-icon {
  width: 72px; height: 72px; border-radius: 50%;
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.3);
}

.smi-bulk-status { text-align: center; }
.smi-bulk-status__title { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 6px; }
.smi-bulk-dialog--dark .smi-bulk-status__title { color: #f3f4f6; }
.smi-bulk-status__sub { font-size: 13px; color: #6b7280; }
.smi-bulk-dialog--dark .smi-bulk-status__sub { color: #9ca3af; }
.smi-bulk-status__errors { font-size: 12px; color: #ff3131; margin-top: 6px; font-weight: 600; }

.smi-bulk-dialog__footer {
  padding: 12px 24px 20px; display: flex; justify-content: flex-end;
}

/* ── Vuetify focus overrides ── */
:deep(.v-field--focused) { box-shadow: 0 0 0 3px rgba(255, 49, 49,.12) !important; }
:deep(.v-field--focused .v-field__outline__start),
:deep(.v-field--focused .v-field__outline__notch),
:deep(.v-field--focused .v-field__outline__end) { border-color: #ff3131 !important; }

.smi--dark :deep(.v-field) { background: #1f2937; color: #e5e7eb; }
.smi--dark :deep(.v-field__input) { color: #e5e7eb; }
.smi--dark :deep(.v-label)        { color: #9ca3af !important; }

@media (max-width: 480px) {
  .smi-list__header,
  .smi-row { grid-template-columns: 1fr 1fr 60px 40px; }
  .smi-qc-row { grid-template-columns: 1fr; }
  .smi-header { flex-wrap: wrap; }
}
</style>
