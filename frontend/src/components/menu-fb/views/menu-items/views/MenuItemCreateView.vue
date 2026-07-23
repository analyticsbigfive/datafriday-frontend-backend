<template>
  <div id="menu-item-create-page" :class="{'mic--dark': isDark}">
    <div class="mic-inner">
      <!-- Header -->
      <div class="mic-header">
        <div class="mic-header__left">
          <div class="mic-header__icon">
            <UtensilsCrossed :size="22" color="white" />
          </div>
          <div>
            <h1 class="mic-header__title">{{ isEditMode ? t('menuItemCreate.editTitle') : t('menuItemCreate.title') }}</h1>
            <p class="mic-header__subtitle">{{ isEditMode ? t('menuItemCreate.editSubtitle') : t('menuItemCreate.subtitle') }}</p>
          </div>
        </div>
        <div class="mic-header__right">
          <div class="mic-item-count" v-if="items.length > 0">
            <span class="mic-item-count__num">{{ items.length }}</span>
            <span class="mic-item-count__label">composants</span>
          </div>
          <button class="mic-cancel-btn" @click="onCancel">
            <X :size="15" /> {{ t('menuItemCreate.close') }}
          </button>
        </div>
      </div>

      <!-- Main Content -->
      <div class="content-section">
        <v-row no-gutters align="stretch" style="height: 100%; overflow: hidden;">
          <!-- Left Section: Components & Ingredients -->
          <v-col cols="12" md="8" class="left-section">
            <div class="pa-4">
              <div class="mic-left-header">
                <h2 class="mic-left-title">{{ t('menuItemCreate.componentsTitle') }}</h2>
                <div class="mic-left-actions">
                  <button class="mic-add-btn mic-add-btn--outline" @click="onAddIngredient">
                    <Plus :size="14" /> {{ t('menuItemCreate.addIngredient') }}
                  </button>
                  <button class="mic-add-btn mic-add-btn--dark" @click="onAddComponent">
                    <Plus :size="14" /> {{ t('menuItemCreate.addComponent') }}
                  </button>
                  <button class="mic-add-btn mic-add-btn--outline" @click="onAddComboItem">
                    <Plus :size="14" /> {{ t('menuItemCreate.addComboItem') }}
                  </button>
                  <button class="mic-add-btn mic-add-btn--outline" @click="onAddPackaging">
                    <Plus :size="14" /> {{ t('menuItemCreate.addPackaging') }}
                  </button>
                </div>
              </div>

              <!-- Table -->
              <v-card rounded="xl" elevation="0" class="components-table-card">
                <v-skeleton-loader v-if="loading" type="table-row@4" />
                <v-data-table
                  v-else
                  :headers="tableHeaders"
                  :items="items"
                  item-value="id"
                  density="compact"
                  class="components-table"
                  hide-default-footer
                  :items-per-page="-1"
                >
                  <template #no-data>
                    <div class="pa-12 text-center">
                      <div class="text-body-1 text-medium-emphasis mb-2">
                        {{ t('menuItemCreate.noItems') }}
                      </div>
                    </div>
                  </template>

                  <template #item.name="{ item }">
                    <div class="mic-col-name">
                      <span class="mic-col-name__main">{{ item.name }}</span>
                      <span v-if="item.supplierItemName" class="mic-col-name__ref">{{ item.supplierItemName }}</span>
                    </div>
                  </template>

                  <template #item.type="{ item }">
                    <v-chip 
                      size="small" 
                      variant="tonal" 
                      rounded="lg" 
                      :color="item.type === 'Ingredient' ? '#10b981' : '#3b82f6'"
                    >
                      {{ item.type }}
                    </v-chip>
                  </template>

                  <template #item.category="{ item }">
                    <v-chip size="small" color="#64748b" variant="tonal" rounded="lg">
                      {{ item.category || '-' }}
                    </v-chip>
                  </template>

                  <template #item.quantity="{ item }">
                    <div class="mic-qty-stepper">
                      <button
                        class="mic-qty-btn"
                        type="button"
                        @click="item.quantity = Math.max(0, +((+item.quantity || 0) - 1).toFixed(3))"
                      >−</button>
                      <input
                        v-model.number="item.quantity"
                        type="number"
                        min="0"
                        step="0.001"
                        class="mic-qty-input"
                        @change="item.quantity = Math.max(0, +(+item.quantity || 0).toFixed(3))"
                      />
                      <button
                        class="mic-qty-btn"
                        type="button"
                        @click="item.quantity = +((+item.quantity || 0) + 1).toFixed(3)"
                      >+</button>
                    </div>
                  </template>

                  <template #item.unitCost="{ item }">
                    {{ formatCurrency(item.unitCost) }}
                  </template>

                  <template #item.totalCost="{ item }">
                    <span class="font-weight-bold">{{ formatCurrency(item.quantity * item.unitCost) }}</span>
                  </template>

                  <template #item.storage="{ item }">
                    <v-chip size="small" variant="tonal" rounded="lg" :color="getStorageColor(item.storage)">
                      {{ item.storage }}
                    </v-chip>
                  </template>

                  <template #item.actions="{ item }">
                    <div class="mic-actions-cell">
                      <v-btn icon variant="tonal" size="small" :title="t('menuItemCreate.actionEdit')" @click="onEditItem(item)">
                        <Pencil :size="14" />
                      </v-btn>
                      <v-btn icon variant="tonal" size="small" color="error" :title="t('menuItemCreate.actionDelete')" @click="onRemoveItem(item)">
                        <Trash2 :size="14" />
                      </v-btn>
                    </div>
                  </template>
                </v-data-table>
              </v-card>

              <!-- Summary below table -->
              <div v-if="items.length > 0" class="mic-table-summary mt-3">
                <div class="mic-table-summary__row">
                  <span class="mic-table-summary__label">{{ t('menuItemCreate.totalCostLabel') }}</span>
                  <span class="mic-table-summary__value">{{ formatCurrency(totalCost) }}</span>
                </div>
                <div class="mic-table-summary__row">
                  <span class="mic-table-summary__label">{{ t('menuItemCreate.pieceCountLabel') }}</span>
                  <span class="mic-table-summary__value">{{ Number(form.numberOfPiecesRecipe || 1).toFixed(3) }}</span>
                </div>
                <div class="mic-table-summary__divider" />
                <div class="mic-table-summary__row">
                  <span class="mic-table-summary__cost-label">{{ t('menuItemCreate.costPerPieceLabel') }}</span>
                  <span class="mic-table-summary__cost-value">{{ formatCurrency(costPerPiece) }}</span>
                </div>
              </div>

            </div>
          </v-col>

          <!-- Right Section: Menu Item Details -->
          <v-col cols="12" md="4" class="right-section" style="height: 100%;">
            <div class="right-section-header">
              <h2 class="text-subtitle-2 font-weight-bold mic-title mb-0">{{ t('menuItemCreate.detailsTitle') }}</h2>
            </div>
            <div class="right-section-scroll">

              <!-- Picture Upload -->
              <div class="mb-3">
                <label class="field-label">{{ t('menuItemCreate.labelPicture') }}</label>
                <v-card rounded="lg" elevation="0" class="picture-upload" @click="triggerFileInput">
                  <div v-if="!form.picturePreview" class="d-flex flex-column align-center justify-center pa-6">
                    <ImageIcon :size="40" class="text-medium-emphasis mb-3" />
                    <v-btn variant="outlined" rounded="lg" size="small" class="text-none">
                      <Upload :size="15" class="mr-2" />
                      {{ t('menuItemCreate.uploadPicture') }}
                    </v-btn>
                  </div>
                  <div v-else class="picture-preview">
                    <img :src="form.picturePreview" alt="Menu item" />
                    <v-btn icon variant="text" size="small" class="picture-remove" @click.stop="removePicture">
                      <X :size="16" />
                    </v-btn>
                  </div>
                </v-card>
                <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="onFileSelected" />
              </div>

              <!-- Name -->
              <div class="mb-3">
                <label for="mic-name" class="mic-field-label">{{ t('menuItemCreate.labelName') }} <span class="mic-required-star">*</span></label>
                <input
                  id="mic-name"
                  v-model="form.name"
                  type="text"
                  class="form-control mic-input"
                />
              </div>

              <!-- Section: Classification -->
              <div class="form-section-divider mb-3">
                <span>{{ t('menuItemCreate.sectionClassification') }}</span>
              </div>

              <!-- Space -->
              <div class="mb-3">
                <label class="field-label">{{ t('menuItemCreate.labelSpace') }}</label>
                <div class="space-trigger" @click="spaceDrawer = true">
                  <span v-if="!form.spaces.length" class="space-trigger__placeholder">
                    {{ t('menuItemCreate.spacePlaceholder') }}
                  </span>
                  <span v-else class="space-trigger__count">
                    {{ form.spaces.length }} {{ t('menuItemCreate.spacesCount') }}
                  </span>
                  <v-icon size="16" class="space-trigger__icon">mdi-chevron-right</v-icon>
                </div>
              </div>

              <!-- Type -->
              <div class="mb-3">
                <label class="field-label">{{ t('menuItemCreate.labelType') }} <span class="mic-required-star">*</span></label>
                <v-select
                  v-model="form.typeName"
                  :items="productTypeNamesWithCreate"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  density="compact"
                  hide-details
                  :placeholder="t('menuItemCreate.typePlaceholder')"
                  rounded="lg"
                  @update:model-value="onTypeSelectChange"
                >
                  <template #item="{ item, props }">
                    <v-list-item
                      v-bind="props"
                      :class="item.raw.isCreate ? 'create-option' : ''"
                      :style="item.raw.isCreate ? 'color: #ff3131; font-weight: 600;' : ''"
                    />
                  </template>
                </v-select>
              </div>

              <!-- Category -->
              <div class="mb-3">
                <label class="field-label">{{ t('menuItemCreate.labelCategory') }} <span class="mic-required-star">*</span></label>
                <v-select
                  v-model="form.categoryName"
                  :items="filteredCategoryNamesWithCreate"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  density="compact"
                  hide-details
                  :placeholder="t('menuItemCreate.categoryPlaceholder')"
                  rounded="lg"
                  :disabled="!form.typeName"
                  @update:model-value="onCategorySelectChange"
                >
                  <template #item="{ item, props }">
                    <v-list-item
                      v-bind="props"
                      :class="item.raw.isCreate ? 'create-option' : ''"
                      :style="item.raw.isCreate ? 'color: #ff3131; font-weight: 600;' : ''"
                    />
                  </template>
                </v-select>
              </div>

              <!-- Brand Name -->
              <div class="mb-3">
                <label class="field-label">{{ t('menuItemCreate.labelBrand') }}</label>
                <v-select
                  v-model="form.brandId"
                  :items="brandNamesWithCreate"
                  item-title="name"
                  item-value="id"
                  variant="outlined"
                  density="compact"
                  hide-details
                  :placeholder="t('menuItemCreate.brandPlaceholder')"
                  rounded="lg"
                  clearable
                  @update:model-value="onBrandSelectChange"
                >
                  <template #item="{ item, props }">
                    <v-list-item
                      v-bind="props"
                      :class="item.raw.isCreate ? 'create-option' : ''"
                      :style="item.raw.isCreate ? 'color: #ff3131; font-weight: 600;' : ''"
                    />
                  </template>
                </v-select>
              </div>

              <!-- Display Name -->
              <div class="mb-3">
                <label class="field-label">{{ t('menuItemCreate.labelDisplayName') }}</label>
                <v-select
                  v-model="form.displayNameId"
                  :items="displayNamesWithCreate"
                  item-title="name"
                  item-value="id"
                  variant="outlined"
                  density="compact"
                  hide-details
                  :placeholder="t('menuItemCreate.displayNamePlaceholder')"
                  rounded="lg"
                  clearable
                  @update:model-value="onDisplayNameSelectChange"
                >
                  <template #item="{ item, props }">
                    <v-list-item
                      v-bind="props"
                      :class="item.raw.isCreate ? 'create-option' : ''"
                      :style="item.raw.isCreate ? 'color: #ff3131; font-weight: 600;' : ''"
                    />
                  </template>
                </v-select>
              </div>

              <!-- Section: Configuration -->
              <div class="form-section-divider mb-3">
                <span>{{ t('menuItemCreate.sectionConfiguration') }}</span>
              </div>

              <!-- Ready for Sale + Combo Item inline -->
              <div class="d-flex mb-3" style="gap: 8px;">
                <div style="flex: 1; min-width: 0;">
                  <label class="field-label">{{ t('menuItemCreate.labelReady') }}</label>
                  <v-select v-model="form.readyForSale" :items="['Yes', 'No']" variant="outlined" density="compact" hide-details placeholder="No" rounded="lg" />
                </div>
                <div style="flex: 1; min-width: 0;">
                  <label class="field-label">{{ t('menuItemCreate.labelCombo') }}</label>
                  <v-select v-model="form.comboItem" :items="['Yes', 'No']" variant="outlined" density="compact" hide-details placeholder="No" rounded="lg" />
                </div>
              </div>

              <!-- Inventory Information -->
              <div v-if="form.readyForSale === 'Yes'" class="mb-3">
                <div class="mic-inventory-card">
                  <div class="mic-inventory-card__title mb-2">{{ t('menuItemCreate.inventoryInfo') }}</div>
                  <div class="mic-sentence" style="flex-wrap: wrap;">
                    <span class="mic-sentence-chip">{{ form.name || '…' }}</span>
                    <span class="mic-sentence-text">{{ t('menuItemCreate.isStoredIn') }}</span>
                    <select v-model="form.inventoryPackagingType" class="mic-inline-select" style="min-width: 120px;" @change="onPackagingSelectChange">
                      <option :value="null">—</option>
                      <option value="__create_packing_type__" style="color:#ff3131; font-weight:600;">+ {{ t('menuItemCreate.addPackaging') }}</option>
                      <option v-for="opt in packagingCategoryOptions" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                    <span class="mic-sentence-text">{{ t('menuItemCreate.of') }}</span>
                    <input
                      v-model.number="form.inventoryNumberOfUnits"
                      type="number"
                      min="0"
                      step="0.001"
                      class="mic-inline-input"
                      style="width: 80px;"
                    />
                    <select v-model="form.inventoryUnit" class="mic-inline-select" style="width: 80px;">
                      <option value="Kg">Kg</option>
                      <option value="L">L</option>
                      <option value="Pc">Pc</option>
                    </select>
                    <span class="mic-sentence-text">.</span>
                  </div>
                  <div class="mic-inventory-card__field">
                    <label class="field-label">{{ t('menuItemCreate.kitchenType') }}</label>
                    <select v-model="form.kitchenType" class="mic-inline-select" style="min-width: 130px;">
                      <option :value="null">—</option>
                      <option v-for="opt in kitchenTypeOptions" :key="opt.value" :value="opt.value">{{ opt.title }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Number of Pieces (Recipe) -->
              <div class="mb-3">
                <label for="mic-pieces" class="mic-field-label">{{ t('menuItemCreate.labelNumberOfPieces') }} <span class="mic-required-star">*</span></label>
                <input
                  id="mic-pieces"
                  v-model.number="form.numberOfPiecesRecipe"
                  type="number"
                  min="1"
                  step="1"
                  class="form-control mic-input"
                />
              </div>

              <!-- Prix par space -->
              <div class="form-section-divider mb-2 mt-1">
                <span>{{ t('menuItemCreate.sectionPricePerSpace') }}</span>
              </div>

              <!-- Add price group row (création uniquement) -->
              <div v-if="!isEditMode" class="mic-price-add-row mb-3">
                <div class="mic-prefix-wrap mic-price-add-row__amount">
                  <span class="mic-prefix-symbol">€</span>
                  <input
                    v-model.number="newPriceAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control mic-input mic-input--prefixed"
                    placeholder="0.00 TTC"
                  />
                </div>
                <div class="mic-suffix-wrap mic-price-add-row__vat">
                  <input
                    v-model.number="newPriceVat"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    class="form-control mic-input mic-input--suffixed"
                    placeholder="TVA %"
                  />
                  <span class="mic-suffix-symbol">%</span>
                </div>
                <v-select
                  v-model="newPriceSpaces"
                  :items="availableSpaceOptions"
                  item-title="title"
                  item-value="value"
                  multiple
                  density="compact"
                  variant="outlined"
                  hide-details
                  rounded="lg"
                  placeholder="Spaces…"
                  class="mic-price-space-sel"
                  :menu-props="{ zIndex: 10000 }"
                />
                <button
                  class="mic-price-add-btn"
                  :disabled="!newPriceAmount || !newPriceSpaces.length"
                  @click="addPriceGroup"
                  type="button"
                >
                  <Plus :size="15" />
                </button>
              </div>

              <!-- Price group cards -->
              <div v-if="groupedSpaces.length" class="mb-3">
                <div v-for="group in groupedSpaces" :key="group.key" class="mic-price-card mb-2">
                  <div class="mic-price-row">
                    <div class="mic-price-display mic-price-input">
                      <span class="mic-price-display__prefix">€</span>
                      <span class="mic-price-display__value">{{ Number(group.price || 0).toFixed(2) }}</span>
                    </div>
                    <div class="mic-space-names mic-space-names--clickable" @click="openGroupDrawer(group.spaceIds, group.price, group.vatRate)">
                      <span v-for="sid in group.spaceIds" :key="sid" class="mic-space-name-pill">
                        {{ getSpaceName(sid) }}
                      </span>
                    </div>
                  </div>

                  <div class="mic-price-summary">
                    <div class="mic-price-row-info">
                      <span class="mic-price-label">HT</span>
                      <span class="mic-price-value">{{ formatCurrency(getGroupHT(group.price, group.vatRate)) }}</span>
                    </div>
                    <div class="mic-price-row-info">
                      <span class="mic-price-label">TVA{{ group.vatRate != null ? ` (${group.vatRate}%)` : '' }}</span>
                      <span class="mic-price-value">{{ formatCurrency(group.price - getGroupHT(group.price, group.vatRate)) }}</span>
                    </div>
                    <div class="mic-price-row-info">
                      <span class="mic-price-label">Coût</span>
                      <span class="mic-price-value">{{ formatCurrency(costPerPiece) }}</span>
                    </div>
                    <div class="mic-price-sep" />
                    <div class="mic-price-row-info">
                      <span class="mic-price-label mic-price-margin-label">Marge</span>
                      <span :class="getGroupMarginColor(group.price)" class="mic-margin-value">{{ getGroupMargin(group.price) }}</span>
                    </div>
                    <div class="mt-2">
                      <v-btn icon size="x-small" variant="text" color="error" @click="removeGroupFromItem(group.spaceIds)">
                        <Trash2 :size="14" />
                      </v-btn>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else-if="!isEditMode" class="mic-price-empty mb-3">
                Entrez un prix et sélectionnez un ou plusieurs spaces pour l'associer.
              </div>

              <!-- Section: Régime & Conservation -->
              <div class="form-section-divider mb-2" :class="form.readyForSale === 'Yes' ? 'mt-1' : ''">
                <span>{{ t('menuItemCreate.sectionDietStorage') }}</span>
              </div>

              <!-- Storage Type -->
              <div v-if="form.readyForSale === 'Yes'" class="mb-2">
                <label class="field-label">{{ t('menuItemCreate.labelStorage') }}</label>
                <div class="checkbox-grid">
                  <v-checkbox v-model="form.storageTypes" value="Dry" :label="t('menuItemCreate.storageDry')" hide-details density="compact" />
                  <v-checkbox v-model="form.storageTypes" value="Cold" :label="t('menuItemCreate.storageCold')" hide-details density="compact" />
                  <v-checkbox v-model="form.storageTypes" value="Freezer" :label="t('menuItemCreate.storageFreezer')" hide-details density="compact" />
                </div>
              </div>

              <!-- Diet -->
              <div class="mb-3">
                <label class="field-label">{{ t('menuItemCreate.labelDiet') }}</label>
                <div class="checkbox-grid">
                  <v-checkbox v-model="form.dietTypes" value="Vegan" :label="t('menuItemCreate.dietVegan')" hide-details density="compact" />
                  <v-checkbox v-model="form.dietTypes" value="Vegetarian" :label="t('menuItemCreate.dietVegetarian')" hide-details density="compact" />
                  <v-checkbox v-model="form.dietTypes" value="Halal" :label="t('menuItemCreate.dietHalal')" hide-details density="compact" />
                  <v-checkbox v-model="form.dietTypes" value="Kosher" :label="t('menuItemCreate.dietKosher')" hide-details density="compact" />
                  <v-checkbox v-model="form.dietTypes" value="Hot" :label="t('menuItemCreate.dietHot')" hide-details density="compact" />
                </div>
              </div>

              <!-- Section: Description & Allergènes -->
              <div class="form-section-divider mb-3">
                <span>{{ t('menuItemCreate.sectionDescriptionAllergens') }}</span>
              </div>

              <!-- Description -->
              <div class="mb-3">
                <label class="field-label">{{ t('menuItemCreate.labelDescription') }}</label>
                <v-textarea v-model="form.description" variant="outlined" density="compact" hide-details :placeholder="t('menuItemCreate.descriptionPlaceholder')" rounded="lg" rows="2" />
              </div>

              <!-- Allergens -->
              <div class="mb-3">
                <label class="field-label">{{ t('menuItemCreate.labelAllergens') }}</label>
                <div class="checkbox-grid">
                  <v-checkbox v-model="form.allergens" value="GLUTEN" :label="t('menuItemCreate.allergenGluten')" hide-details density="compact" />
                  <v-checkbox v-model="form.allergens" value="LACTOSE" :label="t('menuItemCreate.allergenLactose')" hide-details density="compact" />
                  <v-checkbox v-model="form.allergens" value="EGGS" :label="t('menuItemCreate.allergenEggs')" hide-details density="compact" />
                  <v-checkbox v-model="form.allergens" value="NUTS" :label="t('menuItemCreate.allergenNuts')" hide-details density="compact" />
                  <v-checkbox v-model="form.allergens" value="FISH" :label="t('menuItemCreate.allergenFish')" hide-details density="compact" />
                  <v-checkbox v-model="form.allergens" value="SHELLFISH" :label="t('menuItemCreate.allergenShellfish')" hide-details density="compact" />
                  <v-checkbox v-model="form.allergens" value="SOY" :label="t('menuItemCreate.allergenSoy')" hide-details density="compact" />
                </div>
              </div>


            </div>
            <div class="right-section-footer">
              <v-alert v-if="saveError" type="error" variant="tonal" density="compact" closable class="mb-2" @click:close="saveError = null">
                {{ saveError }}
              </v-alert>
              <v-alert v-if="saveSuccess" type="success" variant="tonal" density="compact" closable class="mb-2" @click:close="saveSuccess = null">
                {{ saveSuccess }}
              </v-alert>
              <div class="mic-footer-actions">
                <button class="mic-footer-btn mic-footer-btn--ghost" @click="onCancel">
                  {{ hasUnsavedChanges ? t('menuItemCreate.cancel') : t('menuItemCreate.close') }}
                </button>
                <button class="mic-footer-btn mic-footer-btn--save" @click="onCreate" :disabled="saving">
                  <Save :size="15" />
                  <span v-if="saving">...</span>
                  <span v-else>{{ isEditMode ? t('menuItemCreate.saveEdit') : t('menuItemCreate.save') }}</span>
                </button>
              </div>
            </div>
          </v-col>

        </v-row>
      </div>
    </div>

    <!-- Ingredient Picker Drawer -->
    <IngredientPickerDrawer v-model="ingredientDrawer" :is-dark="isDark" @add="onIngredientsAdded" />

    <!-- Component Picker Drawer -->
    <ComponentPickerDrawer v-model="componentDrawer" :is-dark="isDark" @add="onComponentsAdded" />

    <!-- Packaging Picker Drawer -->
    <PackagingPickerDrawer v-model="packagingDrawer" :is-dark="isDark" @add="onPackagingAdded" />

    <!-- Brand Name Drawer -->
    <BrandNameFormDrawer
      v-model="createBrandDrawer"
      mode="create"
      :is-dark="isDark"
      @saved="onBrandCreated"
    />

    <!-- Display Name Drawer -->
    <DisplayNameFormDrawer
      v-model="createDisplayNameDrawer"
      :is-dark="isDark"
      @saved="onDisplayNameCreated"
    />

    <!-- Create Packing Type Dialog -->
    <CreatePackingTypeDialog v-model="packingTypeCreateOpen" :is-dark="isDark" @created="onPackingTypeCreated" />

    <!-- Create Type Dialog -->
    <CreateTypeDialog v-model="createTypeDialog" :is-dark="isDark" @created="onTypeCreated" />

    <!-- Create Category Dialog -->
    <CreateCategoryDialog
      v-model="createCategoryDialog"
      :is-dark="isDark"
      :type-name="form.typeName"
      :type-id="currentTypeId"
      @created="onCategoryCreated"
    />

    <!-- Space Group Drawer (view mode: liste du groupe de prix) -->
    <SpaceGroupDrawer
      v-model="groupDrawer"
      :is-dark="isDark"
      :space-ids="activeGroupSpaceIds"
      :spaces="spaces"
      :group-price="activeGroupPrice"
      :vat-rate="activeGroupVat"
      :cost-per-piece="costPerPiece"
    />

    <!-- Space Group Drawer (selection mode: champ Space du formulaire) -->
    <SpaceGroupDrawer
      v-model="spaceDrawer"
      :is-dark="isDark"
      :selectable="true"
      :spaces="spaces"
      :selected-ids="form.spaces"
      @confirm="onSpaceConfirm"
    />

  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { createMenuItem, getMenuItemById, updateMenuItem } from "@/api/endpoints/menu-item.api";
import { createProductType, createProductCategory } from "@/api/endpoints/product.api";
import { formatCurrency } from "@/composables/useFormatters.js";
import { Plus, X, Save, Trash2, Upload, ImageIcon, UtensilsCrossed, Pencil } from "lucide-vue-next";
import { confirmDialog, leaveDialog } from '@/composables/useConfirmDialog';
import IngredientPickerDrawer from '../drawers/IngredientPickerDrawer.vue';
import ComponentPickerDrawer from '../drawers/ComponentPickerDrawer.vue';
import PackagingPickerDrawer from '../drawers/PackagingPickerDrawer.vue';
import SpaceGroupDrawer from '../drawers/SpaceGroupDrawer.vue';
import CreateTypeDialog from '../dialogs/CreateTypeDialog.vue';
import CreateCategoryDialog from '../dialogs/CreateCategoryDialog.vue';
import BrandNameFormDrawer from '@/components/brand-name/drawers/BrandNameFormDrawer.vue';
import DisplayNameFormDrawer from '@/components/display-name/drawers/DisplayNameFormDrawer.vue';
import CreatePackingTypeDialog from '../dialogs/CreatePackingTypeDialog.vue';

export default {
  name: "MenuItemCreateView",
  components: { Plus, X, Save, Trash2, Upload, ImageIcon, UtensilsCrossed, Pencil, IngredientPickerDrawer, ComponentPickerDrawer, PackagingPickerDrawer, SpaceGroupDrawer, CreateTypeDialog, CreateCategoryDialog, BrandNameFormDrawer, DisplayNameFormDrawer, CreatePackingTypeDialog },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      isEditMode: false,
      menuItemId: null,
      loading: false,
      saving: false,
      savedSnapshot: null,
      saveError: null,
      saveSuccess: null,
      // L'image est stockée en base64 (souvent ~1 Mo) : ne la renvoyer dans le payload
      // de save que si l'utilisateur l'a réellement changée, sinon chaque sauvegarde
      // ré-upload le même blob inchangé (payload/patch très lent).
      pictureChanged: false,
      form: {
        name: "",
        picture: null,
        picturePreview: null,
        spaces: [],
        spacePrices: {},
        brandId: null,
        displayNameId: null,
        typeName: "",
        typeId: null,
        categoryName: "",
        categoryId: null,
        readyForSale: "No",
        kitchenType: null,
        inventoryPackagingType: null,
        inventoryNumberOfUnits: 1,
        inventoryUnit: "Pc",
        comboItem: "No",
        basePrice: 0,
        vatRate: null,
        discountType: 'none',
        discountValue: 0,
        storageTypes: [],
        dietTypes: [],
        allergens: [],
        description: "",
        numberOfPiecesRecipe: 1,
      },
      
      // Space selection drawer
      spaceDrawer: false,
      groupDrawer: false,
      activeGroupSpaceIds: [],
      activeGroupPrice: 0,
      activeGroupVat: null,

      // Create Type dialog
      createTypeDialog: false,

      // Create Category dialog
      createCategoryDialog: false,

      // Create Brand Name drawer
      createBrandDrawer: false,

      // Create Display Name drawer
      createDisplayNameDrawer: false,

      // Create Packing Type dialog
      packingTypeCreateOpen: false,

      // Price group builder
      newPriceAmount: 0,
      newPriceVat: null,
      newPriceSpaces: [],
      
      // Ingredient drawer
      ingredientDrawer: false,

      // Component drawer
      componentDrawer: false,

      // Packaging drawer
      packagingDrawer: false,

      editingItemIndex: null,

      // Main table items (ingredients + components + packaging)
      items: [],
    };
  },
  async mounted() {
    const menuItemId = this.$route.params.id;
    if (menuItemId) {
      this.isEditMode = true;
      this.menuItemId = menuItemId;
    }

    await Promise.all([
      this.$store.dispatch('spaces/fetchSpaces'),
      this.$store.dispatch('productTypes/fetchProductTypes', { forceRefresh: true }),
      this.$store.dispatch('productCategories/fetchProductCategories', { forceRefresh: true }),
      this.$store.dispatch('brandNames/fetchBrandNames'),
      this.$store.dispatch('displayNames/fetchDisplayNames'),
      this.$store.dispatch('packingTypes/fetchPackingTypes', { forceRefresh: true }),
    ]);

    if (this.isEditMode) {
      await this.loadMenuItemData();
    }
    this.$nextTick(() => this.takeSnapshot());
  },
  computed: {
    kitchenTypeOptions() {
      return [
        { title: this.t('menuItemCreate.kitchenCentral'), value: 'Central' },
        { title: this.t('menuItemCreate.kitchenLocal'), value: 'Local' },
      ];
    },
    hasUnsavedChanges() {
      if (this.savedSnapshot === null) return false;
      const { picture, picturePreview, ...rest } = this.form;
      return JSON.stringify({ form: rest, items: this.items }) !== this.savedSnapshot;
    },
    // Données depuis le store (avec cache TTL)
    spaces() {
      return this.$store.getters['spaces/spaces']
    },
    productTypes() {
      return this.$store.getters['productTypes/productTypes']
    },
    productCategories() {
      return this.$store.getters['productCategories/productCategories']
    },
    brandNames() {
      return this.$store.getters['brandNames/brandNames']
    },
    brandNamesWithCreate() {
      return [
        ...(this.brandNames || []),
        { id: '__create_brand__', name: '+ Ajouter une brand name', isCreate: true },
      ];
    },
    displayNames() {
      return this.$store.getters['displayNames/displayNames']
    },
    displayNamesWithCreate() {
      return [
        ...(this.displayNames || []),
        { id: '__create_display_name__', name: '+ Ajouter un display name', isCreate: true },
      ];
    },
    packagingCategoryOptions() {
      const packingTypes = this.$store.getters['packingTypes/packingTypes'] || [];
      const names = packingTypes.map((p) => p.name).filter(Boolean);
      if (names.length) return names;
      const filtered = (this.productCategories || [])
        .filter((c) => (c.typeName || '').toLowerCase().includes('packag'))
        .map((c) => c.name)
        .filter(Boolean);
      return filtered.length ? filtered : ['Bottle', 'Box', 'Bag', 'Crate', 'Can', 'Keg', 'Pouch', 'Carton'];
    },
    tableHeaders() {
      return [
        { title: this.t("menuItemCreate.colName"), key: "name", width: 200, sortable: false },
        { title: this.t("menuItemCreate.colType"), key: "type", sortable: false, width: 120 },
        { title: this.t("menuItemCreate.colCategory"), key: "category", sortable: false, width: 140 },
        { title: this.t("menuItemCreate.colUnit"), key: "unit", sortable: false, width: 100 },
        { title: this.t("menuItemCreate.colQuantity"), key: "quantity", sortable: false, width: 120 },
        { title: this.t("menuItemCreate.colUnitCost"), key: "unitCost", sortable: false, width: 110 },
        { title: this.t("menuItemCreate.colTotalCost"), key: "totalCost", sortable: false, width: 120 },
        { title: this.t("menuItemCreate.colStorage"), key: "storage", sortable: false, width: 110 },
        { title: this.t("menuItemCreate.colActions"), key: "actions", sortable: false, align: "end", width: 80 },
      ];
    },
    productTypeNamesWithCreate() {
      const existing = (this.productTypes || [])
        .map(t => String(t?.name || '').trim())
        .filter(Boolean)
        .sort()
        .map(name => ({ title: name, value: name, isCreate: false }));
      return [
        { title: this.t('menuItemCreateTypeCreateOption'), value: '__create_type__', isCreate: true },
        ...existing,
      ];
    },
    filteredCategoryNamesWithCreate() {
      if (!this.form.typeName) return [
        { title: this.t('menuItemCreateCategoryCreateOption'), value: '__create_category__', isCreate: true },
      ];
      const type = (this.productTypes || []).find(t => t.name === this.form.typeName);
      const existing = type
        ? (this.productCategories || [])
            .filter(c => c.typeId === (type.id || type._id))
            .map(c => String(c?.name || '').trim())
            .filter(Boolean)
            .sort()
            .map(name => ({ title: name, value: name, isCreate: false }))
        : [];
      return [
        { title: this.t('menuItemCreateCategoryCreateOption'), value: '__create_category__', isCreate: true },
        ...existing,
      ];
    },
    effectiveBasePrice() {
      const prices = Object.values(this.form.spacePrices).map(e => this.spTtc(e)).filter(p => p > 0);
      if (prices.length) return prices.reduce((a, b) => a + b, 0) / prices.length;
      return Number(this.form.basePrice) || 0;
    },
    availableSpaceOptions() {
      return (this.spaces || [])
        .map(s => ({
          title: String(s?.name || s?.title || '').trim(),
          value: String(s?.id || s?._id || '').trim(),
        }))
        .filter(s => s.title && s.value);
    },
    currentTypeId() {
      return this.form.typeId || '';
    },
    groupedSpaces() {
      // Regroupe les espaces par couple (prix TTC, TVA) : deux espaces au même prix mais à des
      // TVA différentes forment deux groupes distincts.
      const groups = new Map();
      for (const spaceId of (this.form.spaces || [])) {
        const entry = this.form.spacePrices[spaceId];
        const price = entry != null ? this.spTtc(entry) : (Number(this.form.basePrice) || 0);
        const vatRate = entry != null ? this.spVat(entry, this.form.vatRate) : (this.form.vatRate != null ? Number(this.form.vatRate) : null);
        const key = `${price.toFixed(2)}|${vatRate == null ? '' : vatRate}`;
        if (!groups.has(key)) groups.set(key, { key, price, vatRate, spaceIds: [] });
        groups.get(key).spaceIds.push(spaceId);
      }
      return Array.from(groups.values());
    },
    totalCost() {
      return this.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
    },
    costPerPiece() {
      const pieces = Number(this.form.numberOfPiecesRecipe) || 1;
      return this.totalCost / pieces;
    },
  },
  methods: {
    /** TTC d'une entrée spacePrices (legacy number ou { ttc, vatRate }). */
    spTtc(entry) {
      if (entry == null) return 0;
      if (typeof entry === 'object') return Number(entry.ttc) || 0;
      return Number(entry) || 0;
    },
    /** TVA d'une entrée spacePrices ({ ttc, vatRate }) sinon `fallback` (TVA article). */
    spVat(entry, fallback = null) {
      if (entry != null && typeof entry === 'object' && entry.vatRate != null) return Number(entry.vatRate);
      return fallback != null && fallback !== '' ? Number(fallback) : null;
    },
    onSpaceConfirm({ spaceIds }) {
      this.form.spaces = spaceIds;
    },
    getSpaceName(spaceId) {
      return (this.spaces || []).find(s => (s.id || s._id) === spaceId)?.name || spaceId;
    },
    openGroupDrawer(spaceIds, price = 0, vatRate = null) {
      this.activeGroupSpaceIds = spaceIds;
      this.activeGroupPrice = Number(price) || 0;
      this.activeGroupVat = vatRate != null ? Number(vatRate) : (this.form.vatRate != null ? Number(this.form.vatRate) : null);
      this.groupDrawer = true;
    },
    /** HT d'un groupe à partir de son TTC et de SA TVA (repli sur la TVA article). */
    getGroupHT(price, vatRate = null) {
      const p = Number(price || 0);
      const v = vatRate != null ? Number(vatRate) : (Number(this.form.vatRate) || 0);
      return v > 0 ? p / (1 + v / 100) : p;
    },
    getGroupMargin(price) {
      const p = Number(price || 0);
      if (!p) return '0.0%';
      return `${(((p - this.costPerPiece) / p) * 100).toFixed(1)}%`;
    },
    getGroupMarginColor(price) {
      const p = Number(price || 0);
      if (!p) return 'text-medium-emphasis';
      return ((p - this.costPerPiece) / p) * 100 >= 60 ? 'text-success' : 'text-error';
    },
    addPriceGroup() {
      const price = Number(this.newPriceAmount);
      if (!(price > 0) || !this.newPriceSpaces.length) return;
      const vatRate = this.newPriceVat != null && this.newPriceVat !== '' ? Number(this.newPriceVat) : null;
      const prices = { ...this.form.spacePrices };
      this.newPriceSpaces.forEach(spaceId => { prices[spaceId] = { ttc: price, vatRate }; });
      this.form.spacePrices = prices;
      this.form.spaces = [...new Set([...this.form.spaces, ...this.newPriceSpaces])];
      this.newPriceAmount = 0;
      this.newPriceVat = null;
      this.newPriceSpaces = [];
    },
    removeGroupFromItem(spaceIds) {
      this.form.spaces = this.form.spaces.filter(s => !spaceIds.includes(s));
      const prices = { ...this.form.spacePrices };
      spaceIds.forEach(id => delete prices[id]);
      this.form.spacePrices = prices;
    },
    async onCancel() {
      if (this.hasUnsavedChanges) {
        const result = await leaveDialog({
          title: this.t('menuItemCreate.unsavedTitle'),
          message: this.t('menuItemCreate.unsavedMessage'),
          leaveText: this.t('menuItemCreate.leaveWithoutSaving'),
          saveText: this.t('menuItemCreate.saveAndLeave'),
          cancelText: this.t('cancel'),
        });
        if (result === false) return;
        if (result === 'save') {
          this.onCreate();
          return;
        }
      }
      this.$router.push({ path: "/menu-fb/menu-items" });
    },
    async onCreate() {
      this.saveError = null;

      // Validation des champs requis
      if (!this.form.name?.trim()) {
        this.saveError = this.t('menuItemCreate.errorNameRequired');
        return;
      }
      if (!this.form.typeName?.trim()) {
        this.saveError = this.t('menuItemCreate.errorTypeRequired');
        return;
      }
      if (!this.form.categoryName?.trim()) {
        this.saveError = this.t('menuItemCreate.errorCategoryRequired');
        return;
      }

      const piecesCount = Number(this.form.numberOfPiecesRecipe);
      if (!piecesCount || piecesCount < 1 || !Number.isInteger(piecesCount)) {
        this.saveError = this.t('menuItemCreate.errorPieceCountInvalid');
        return;
      }

      this.saving = true;
      try {
        // Préparer les ingrédients selon le format API
        const ingredients = (this.items || [])
          .filter((item) => item.type === "Ingredient" && item.ingredientId)
          .map((item) => ({
            ingredientId: String(item.ingredientId || "").trim(),
            numberOfUnits: Math.max(0, Number(item.quantity || 0)),
          }))
          .filter((ing) => ing.ingredientId);

        // Préparer les composants selon le format API
        const components = (this.items || [])
          .filter((item) => item.type === "Component" && item.componentId)
          .map((item) => ({
            componentId: String(item.componentId || "").trim(),
            numberOfUnits: Math.max(0, Number(item.quantity || 0)),
          }))
          .filter((comp) => comp.componentId);

        // Préparer les packagings selon le format API
        const packagings = (this.items || [])
          .filter((item) => item.type === "Packaging" && item.packagingId)
          .map((item) => ({
            packagingId: String(item.packagingId || "").trim(),
            numberOfUnits: Math.max(0, Number(item.quantity || 0)),
          }))
          .filter((pkg) => pkg.packagingId);

        // Calculer le coût total et le coût par pièce
        const totalCost = this.totalCost;
        const costPerPiece = this.costPerPiece;

        // form.typeId est la source de vérité (synchronisée par onTypeSelectChange/onTypeCreated) ;
        // la résolution par nom ne sert plus que de filet de sécurité si l'id n'a pas été
        // synchronisé, et crée le type au besoin.
        let typeId = this.form.typeId || "";
        if (!typeId && this.form.typeName) {
          const existingType = (this.productTypes || []).find(t => t.name === this.form.typeName);
          if (existingType) {
            typeId = String(existingType.id || existingType._id || "");
          } else {
            const res = await createProductType({ name: this.form.typeName });
            typeId = String(res?.data?.id || res?.id || "");
            await this.$store.dispatch('productTypes/fetchProductTypes', { forceRefresh: true });
          }
          this.form.typeId = typeId;
        }

        // form.categoryId est la source de vérité (synchronisée par onCategorySelectChange/
        // onCategoryCreated) ; même filet de sécurité que pour le type.
        let categoryId = this.form.categoryId || "";
        if (!categoryId && this.form.categoryName) {
          const existingCat = (this.productCategories || []).find(c => c.name === this.form.categoryName);
          if (existingCat) {
            categoryId = String(existingCat.id || existingCat._id || "");
          } else {
            const res = await createProductCategory({ name: this.form.categoryName, typeId });
            categoryId = String(res?.data?.id || res?.id || "");
            await this.$store.dispatch('productCategories/fetchProductCategories', { forceRefresh: true });
          }
          this.form.categoryId = categoryId;
        }

        // Calculer la marge (sur le coût par pièce, pas le coût total de la recette)
        const basePrice = this.effectiveBasePrice;
        const margin = basePrice > 0 ? ((basePrice - costPerPiece) / basePrice) * 100 : 0;

        // Image: preserve existing or convert new file
        let pictureUrl = this.form.picturePreview || "";
        if (this.form.picture instanceof File) {
          try {
            const reader = new FileReader();
            pictureUrl = await new Promise((resolve) => {
              reader.onload = (e) => resolve(e.target.result);
              reader.readAsDataURL(this.form.picture);
            });
          } catch (uploadError) {
            console.error("Error uploading image:", uploadError);
          }
        }

        // Construire le payload selon le modèle API
        const payload = {
          name: String(this.form.name || "").trim(),
          typeId: typeId,
          categoryId: categoryId,
          basePrice: this.effectiveBasePrice,
          vatRate:
            this.form.vatRate === null || this.form.vatRate === '' || this.form.vatRate === undefined
              ? null
              : Number(this.form.vatRate),
          discountType: (this.form.discountType && this.form.discountType !== 'none') ? this.form.discountType : null,
          discountValue: Number(this.form.discountValue) || 0,
          // `totalCost` = coût TOTAL de la recette (fournée). Le backend en dérive le coût par pièce
          // (÷ numberOfPiecesRecipe) pour l'affichage et la marge. NE PAS envoyer costPerPiece ici,
          // sinon un article sans recette (refreshCosts non déclenché) stockerait un coût déjà divisé.
          totalCost: totalCost,
          margin: margin,
          description: String(this.form.description || "").trim(),
          allergens: Array.isArray(this.form.allergens) ? this.form.allergens : [],
          diet: Array.isArray(this.form.dietTypes) ? this.form.dietTypes : [],
          storageType: Array.isArray(this.form.storageTypes) ? this.form.storageTypes : [],
          readyForSale: String(this.form.readyForSale || "No").trim(),
          kitchenType: this.form.readyForSale === "Yes" ? (this.form.kitchenType || null) : null,
          comboItem: String(this.form.comboItem || "No").trim(),
          numberOfPiecesRecipe: Number(this.form.numberOfPiecesRecipe) || 1,
          inventoryPackagingType: this.form.inventoryPackagingType || null,
          inventoryNumberOfUnits: Number(this.form.inventoryNumberOfUnits) || 1,
          inventoryUnit: this.form.inventoryUnit || null,
          spaceIds: Array.isArray(this.form.spaces) ? this.form.spaces : [],
          spacePrices: this.form.spacePrices || {},
          brandId: this.form.brandId || null,
          displayNameId: this.form.displayNameId || null,
          componentsData: {},
          components: components,
          ingredients: ingredients,
          packagings: packagings,
        };

        // N'envoie l'image que si elle a réellement changé (création, upload, suppression) —
        // sinon on ré-uploaderait le même blob base64 (souvent ~1 Mo) à chaque sauvegarde.
        if (!this.isEditMode || this.pictureChanged) {
          payload.picture = pictureUrl;
        }

        // Appeler l'API pour créer ou mettre à jour le menu item
        if (this.isEditMode && this.menuItemId) {
          await updateMenuItem(this.menuItemId, payload);
        } else {
          await createMenuItem(payload);
        }
        
        this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true });

        if (this.isEditMode && this.menuItemId) {
          // Reste sur la fiche : recharge la recette depuis le serveur (ordre stable,
          // coûts recalculés) au lieu de renvoyer vers la liste et forcer à rouvrir
          // la fiche pour vérifier que la sauvegarde a bien pris.
          await this.loadMenuItemData();
          this.takeSnapshot();
          this.saveSuccess = this.t('menuItemCreate.successUpdated');
          clearTimeout(this._saveSuccessTimeout);
          this._saveSuccessTimeout = setTimeout(() => { this.saveSuccess = null; }, 2500);
        } else {
          this.takeSnapshot();
          this.$router.push({ path: "/menu-fb/menu-items" });
        }
      } catch (e) {
        console.error("Error creating menu item:", e);
        this.saveError = e?.response?.data?.message || e?.message || this.t('menuItemCreate.errorGeneric');
      } finally {
        this.saving = false;
      }
    },
    onEditItem(item) {
      this.editingItemIndex = this.items.indexOf(item);
      if (item.type === 'Ingredient') this.ingredientDrawer = true;
      else if (item.type === 'Component') this.componentDrawer = true;
      else if (item.type === 'Packaging') this.packagingDrawer = true;
    },
    onAddIngredient() {
      this.editingItemIndex = null;
      this.ingredientDrawer = true;
    },
    onAddComponent() {
      this.editingItemIndex = null;
      this.componentDrawer = true;
    },
    onAddComboItem() {
    },
    onAddPackaging() {
      this.editingItemIndex = null;
      this.packagingDrawer = true;
    },
    triggerFileInput() {
      this.$refs.fileInput.click();
    },
    onFileSelected(event) {
      const file = event.target.files[0];
      if (file) {
        const MAX_PICTURE_SIZE = 5 * 1024 * 1024; // 5 Mo
        if (file.size > MAX_PICTURE_SIZE) {
          this.saveError = this.t('menuItemCreate.errorImageTooLarge');
          if (this.$refs.fileInput) {
            this.$refs.fileInput.value = "";
          }
          return;
        }
        this.form.picture = file;
        this.pictureChanged = true;
        const reader = new FileReader();
        reader.onload = (e) => {
          this.form.picturePreview = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    },
    removePicture() {
      this.form.picture = null;
      this.form.picturePreview = null;
      this.pictureChanged = true;
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = "";
      }
    },
    onTypeSelectChange(value) {
      if (value === '__create_type__') {
        this.form.typeName = '';
        this.form.typeId = null;
        this.createTypeDialog = true;
      } else {
        this.form.categoryName = '';
        this.form.categoryId = null;
        const type = (this.productTypes || []).find(t => t.name === value);
        this.form.typeId = type ? String(type.id || type._id || '') : null;
      }
    },
    onCategorySelectChange(value) {
      if (value === '__create_category__') {
        this.form.categoryName = '';
        this.form.categoryId = null;
        this.createCategoryDialog = true;
      } else {
        const cat = (this.productCategories || []).find(c => c.name === value);
        this.form.categoryId = cat ? String(cat.id || cat._id || '') : null;
      }
    },
    onBrandSelectChange(value) {
      if (value === '__create_brand__') {
        this.form.brandId = null;
        this.createBrandDrawer = true;
      }
    },
    onPackagingSelectChange(event) {
      if (event.target.value === '__create_packing_type__') {
        this.form.inventoryPackagingType = null;
        this.packingTypeCreateOpen = true;
      }
    },
    onPackingTypeCreated(name) {
      if (name) {
        this.form.inventoryPackagingType = name;
      }
    },
    onBrandCreated(brand) {
      const id = brand?.id || brand?._id;
      if (id) {
        this.$store.dispatch('brandNames/fetchBrandNames', { forceRefresh: true });
        this.form.brandId = id;
      }
    },
    onDisplayNameSelectChange(value) {
      if (value === '__create_display_name__') {
        this.form.displayNameId = null;
        this.createDisplayNameDrawer = true;
      }
    },
    onDisplayNameCreated(displayName) {
      const id = displayName?.id || displayName?._id;
      if (id) {
        this.$store.dispatch('displayNames/fetchDisplayNames', { forceRefresh: true });
        this.form.displayNameId = id;
      }
    },
    onRemoveItem(item) {
      const index = this.items.indexOf(item);
      if (index > -1) {
        this.items.splice(index, 1);
      }
    },
    formatCurrency,
    getStorageColor(storage) {
      const colors = {
        Cold: "blue",
        Dry: "orange",
        Frozen: "cyan",
      };
      return colors[storage] || "grey";
    },
    
    // Load data methods
    async loadMenuItemData() {
      this.loading = true;
      try {
        const res = await getMenuItemById(this.menuItemId);
        const menuItem = res?.data || res;
        
        if (!menuItem) {
          console.error('Menu item not found');
          this.$router.push({ path: "/menu-fb/menu-items" });
          return;
        }
        
        // Pré-remplir le formulaire
        this.form.name = menuItem.name || "";
        this.form.typeId = menuItem.typeId || "";
        this.form.categoryId = menuItem.categoryId || "";
        this.form.basePrice = Number(menuItem.basePrice) || 0;
        this.form.vatRate = menuItem.vatRate != null ? Number(menuItem.vatRate) : null;
        this.form.discountType = menuItem.discountType || 'none';
        this.form.discountValue = Number(menuItem.discountValue) || 0;
        this.form.description = menuItem.description || "";
        this.form.readyForSale = menuItem.readyForSale || "No";
        this.form.kitchenType = menuItem.kitchenType || null;
        this.form.inventoryPackagingType = menuItem.inventoryPackagingType || null;
        this.form.inventoryNumberOfUnits = Number(menuItem.inventoryNumberOfUnits) || 1;
        this.form.inventoryUnit = menuItem.inventoryUnit || "Pc";
        this.form.comboItem = menuItem.comboItem || "No";
        this.form.numberOfPiecesRecipe = Number(menuItem.numberOfPiecesRecipe) || 1;
        this.form.storageTypes = Array.isArray(menuItem.storageType) ? menuItem.storageType : [];
        this.form.dietTypes = Array.isArray(menuItem.diet) ? menuItem.diet : [];
        this.form.allergens = Array.isArray(menuItem.allergens) ? menuItem.allergens : [];

        // Filter out spaces that no longer exist so their IDs are never displayed
        const existingSpaceIds = new Set((this.spaces || []).map(s => String(s.id || s._id || '')));
        const validSpaceIds = (Array.isArray(menuItem.spaceIds) ? menuItem.spaceIds : [])
          .filter(id => existingSpaceIds.has(String(id)));
        this.form.spaces = validSpaceIds;
        // Normalise chaque entrée en { ttc, vatRate } (rétro-compat du legacy number ; TVA héritée
        // de l'article si l'entrée n'en porte pas).
        this.form.spacePrices = Object.fromEntries(
          Object.entries(menuItem.spacePrices || {})
            .filter(([id]) => existingSpaceIds.has(String(id)))
            .map(([id, entry]) => [id, { ttc: this.spTtc(entry), vatRate: this.spVat(entry, menuItem.vatRate) }])
        );
        this.form.brandId = menuItem.brandId || menuItem.brand?.id || null;
        this.form.displayNameId = menuItem.displayNameId || menuItem.displayName?.id || null;

        // Resolve typeId → typeName
        if (menuItem.typeId) {
          const type = (this.productTypes || []).find(t => (t.id || t._id) === menuItem.typeId);
          this.form.typeName = type?.name || menuItem.typeId || "";
        }
        // Resolve categoryId → categoryName
        if (menuItem.categoryId) {
          const cat = (this.productCategories || []).find(c => (c.id || c._id) === menuItem.categoryId);
          this.form.categoryName = cat?.name || menuItem.categoryId || "";
        }

        // Charger l'image si elle existe
        const pictureVal = menuItem.picture || menuItem.imageUrl || menuItem.image;
        if (pictureVal) {
          this.form.picturePreview = pictureVal;
        }
        this.pictureChanged = false;

        // Repart d'une liste vide à chaque (re)chargement : sinon un type sans ligne
        // (ex. 0 ingrédient) laisse `this.items` intact et les composants/packagings
        // suivants viennent s'y AJOUTER au lieu de remplacer, dupliquant les lignes
        // au second appel (rechargement après sauvegarde en édition).
        this.items = [];

        // Charger les ingrédients : `menuItem.ingredients[].ingredient` (+ marketPrice) est déjà
        // renvoyé par le GET (includeRelations) — pas besoin d'un getIngredient() par ligne, ce
        // N+1 ajoutait un aller-retour réseau par ingrédient (lent en dev, ~600ms/requête).
        if (Array.isArray(menuItem.ingredients) && menuItem.ingredients.length > 0) {
          this.items = menuItem.ingredients.map((ing) => {
            const ingredientId = ing.ingredientId || ing.ingredient_id || "";
            const marketPrice = ing.ingredient?.marketPrice || {};
            return {
              id: `ing-${ing.id || Date.now()}-${Math.random()}`,
              name: ing.ingredient?.name || marketPrice.itemName || "-",
              type: "Ingredient",
              category: ing.ingredient?.ingredientCategory || marketPrice.category || "-",
              unit: ing.ingredient?.recipeUnit || marketPrice.recipeUnit || marketPrice.unit || "-",
              quantity: Number(ing.numberOfUnits) || 1,
              unitCost: Number(ing.unitCost) || 0,
              totalCost: Number(ing.totalCost) || 0,
              storage: ing.ingredient?.storageType || "-",
              ingredientId,
              supplierId: marketPrice.supplierId || "",
              supplierName: marketPrice.supplier || "",
              supplierItemName: marketPrice.supplierItem || "",
            };
          });
        }
        
        // Charger les composants
        if (Array.isArray(menuItem.components) && menuItem.components.length > 0) {
          const componentItems = menuItem.components.map(comp => ({
            id: `comp-${comp.id || Date.now()}-${Math.random()}`,
            name: comp.component?.name || "-",
            type: "Component",
            category: comp.component?.category || "-",
            unit: comp.component?.unit || "-",
            quantity: Number(comp.numberOfUnits) || 1,
            unitCost: Number(comp.component?.unitCost) || 0,
            totalCost: Number(comp.numberOfUnits || 0) * Number(comp.component?.unitCost || 0),
            storage: comp.component?.storageType || "-",
            componentId: comp.componentId,
            supplierId: comp.component?.marketPrice?.supplierId || "",
            supplierName: comp.component?.marketPrice?.supplier || "",
            supplierItemName: comp.component?.marketPrice?.supplierItem || "",
          }));
          this.items = [...this.items, ...componentItems];
        }
        
        // Charger les packagings
        if (Array.isArray(menuItem.packagings) && menuItem.packagings.length > 0) {
          const packagingItems = menuItem.packagings.map(pkg => {
            const packaging = pkg.packaging || {};
            const mp = packaging.marketPrice || {};
            return {
              id: `pkg-${pkg.id || Date.now()}-${Math.random()}`,
              name: packaging.name || mp.itemName || "-",
              type: "Packaging",
              category: packaging.ingredientCategory || mp.inventoryPackaging || mp.category || "-",
              unit: packaging.recipeUnit || mp.recipeUnit || mp.unit || "-",
              quantity: Number(pkg.numberOfUnits) || 1,
              unitCost: Number(packaging.costPerRecipeUnit ?? mp.pricePerUnit) || 0,
              totalCost: Number(pkg.numberOfUnits || 0) * Number(packaging.costPerRecipeUnit ?? mp.pricePerUnit ?? 0),
              storage: packaging.storageType || "-",
              packagingId: pkg.packagingId,
              marketPriceId: packaging.marketPriceId || mp.id || "",
              supplierId: packaging.supplierId || mp.supplierId || "",
              supplierName: packaging.supplier || mp.supplier || "",
              supplierItemName: mp.supplierItem || "",
            };
          });
          this.items = [...this.items, ...packagingItems];
        }
      } catch (e) {
        console.error('Error loading menu item:', e);
        this.saveError = e?.userMessage || e?.message || this.t('menuItemCreate.errorLoadFailed');
      } finally {
        this.loading = false;
      }
    },
    onIngredientsAdded(newItems) {
      if (this.editingItemIndex !== null) {
        const updated = [...this.items];
        updated.splice(this.editingItemIndex, 1, newItems[0]);
        this.items = updated;
        this.editingItemIndex = null;
      } else {
        this.items = [...this.items, ...newItems];
      }
    },
    onComponentsAdded(newItems) {
      if (this.editingItemIndex !== null) {
        const updated = [...this.items];
        updated.splice(this.editingItemIndex, 1, newItems[0]);
        this.items = updated;
        this.editingItemIndex = null;
      } else {
        this.items = [...this.items, ...newItems];
      }
    },
    onPackagingAdded(newItems) {
      if (this.editingItemIndex !== null) {
        const updated = [...this.items];
        updated.splice(this.editingItemIndex, 1, newItems[0]);
        this.items = updated;
        this.editingItemIndex = null;
      } else {
        this.items = [...this.items, ...newItems];
      }
    },
    onTypeCreated(typeName) {
      this.form.typeName = typeName;
      this.form.categoryName = '';
      this.form.categoryId = null;
      const type = (this.productTypes || []).find(t => t.name === typeName);
      this.form.typeId = type ? String(type.id || type._id || '') : null;
    },
    onCategoryCreated(categoryName) {
      this.form.categoryName = categoryName;
      const cat = (this.productCategories || []).find(c => c.name === categoryName);
      this.form.categoryId = cat ? String(cat.id || cat._id || '') : null;
    },
    takeSnapshot() {
      const { picture, picturePreview, ...rest } = this.form;
      this.savedSnapshot = JSON.stringify({ form: rest, items: this.items });
    },
  },
  async beforeRouteLeave(to, from, next) {
    if (!this.hasUnsavedChanges) {
      next();
      return;
    }
    const result = await leaveDialog({
      title: this.t('menuItemCreate.unsavedTitle'),
      message: this.t('menuItemCreate.unsavedMessage'),
      leaveText: this.t('menuItemCreate.leaveWithoutSaving'),
      saveText: this.t('menuItemCreate.saveAndLeave'),
      cancelText: this.t('cancel'),
    });
    if (result === false) {
      next(false);
    } else if (result === 'leave') {
      next(true);
    } else {
      // 'save' — onCreate sauvegarde et navigue vers /menu-items
      next(false);
      this.onCreate();
    }
  },
};
</script>

<style scoped>
#menu-item-create-page {
  background: #f6f7fb;
}

.mic-inner {
  position: fixed;
  top: var(--v-layout-top, 64px);
  left: var(--v-layout-left, 0px);
  right: 0;
  bottom: var(--v-layout-bottom, 0px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f6f7fb;
}

/* ── Gradient Header ── */
.mic-header {
  flex-shrink: 0;
  background: #ff3131;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 64px;
  gap: 16px;
}

.mic-header__left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.mic-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mic-header__title {
  font-size: 1rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  line-height: 1.25;
}

.mic-header__subtitle {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.75);
  margin: 0;
  line-height: 1.3;
}

.mic-header__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mic-item-count {
  display: flex;
  align-items: baseline;
  gap: 4px;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  padding: 4px 12px;
}

.mic-item-count__num {
  font-size: 0.95rem;
  font-weight: 700;
  color: #ffffff;
}

.mic-item-count__label {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.8);
}

.mic-cancel-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.15);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
  border-radius: 20px;
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
  white-space: nowrap;
}

.mic-cancel-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.7);
}

/* ── Left panel header ── */
.mic-left-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}

.mic-left-title {
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.mic-left-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

/* ── Add buttons ── */
.mic-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 5px 13px;
  cursor: pointer;
  transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
  white-space: nowrap;
  line-height: 1;
}

.mic-add-btn--outline {
  background: #ffffff;
  border: 1.5px solid #d1d5db;
  color: #374151;
}

.mic-add-btn--outline:hover {
  border-color: #ff3131;
  color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.08);
}

.mic-add-btn--dark {
  background: #111827;
  border: 1.5px solid #111827;
  color: #ffffff;
}

.mic-add-btn--dark:hover {
  background: #1f2937;
  border-color: #1f2937;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* ── Footer actions ── */
.mic-footer-actions {
  display: flex;
  gap: 8px;
}

.mic-footer-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 8px 18px;
  cursor: pointer;
  transition: background 0.18s, box-shadow 0.18s, opacity 0.18s;
  white-space: nowrap;
}

.mic-footer-btn--ghost {
  background: transparent;
  border: 1.5px solid #d1d5db;
  color: #6b7280;
  flex-shrink: 0;
}

.mic-footer-btn--ghost:hover {
  border-color: #9ca3af;
  color: #374151;
}

.mic-footer-btn--save {
  flex: 1;
  justify-content: center;
  background: #ff3131;
  border: none;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.35);
}

.mic-footer-btn--save:hover:not(:disabled) {
  box-shadow: 0 4px 14px rgba(255, 49, 49, 0.45);
  opacity: 0.93;
}

.mic-footer-btn--save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.content-section {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.left-section {
  background: #f6f7fb;
  border-right: 1px solid #e5e7eb;
  overflow-y: auto;
  height: 100%;
  max-height: 100%;
}

.right-section {
  background: white;
  height: 100%;
  max-height: 100%;
  overflow-y: hidden;
  display: flex;
  flex-direction: column;
}

.right-section-header {
  flex-shrink: 0;
  padding: 10px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: white;
}

.right-section-scroll {
  flex: 1 1 0;
  overflow-y: auto;
  padding: 14px 16px;
  min-height: 0;
}

.right-section-footer {
  flex-shrink: 0;
  padding: 10px 16px 12px;
  background: white;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
}

.save-btn-sticky {
  position: sticky;
  bottom: 0;
  background: white;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
}

/* Force red color on the "Create" option in selects, overriding global styles */
:deep(.create-option) {
  color: #ff3131 !important;
  -webkit-text-fill-color: #ff3131 !important;
  font-weight: 600 !important;
}

:deep(.create-option .v-list-item-title) {
  color: #ff3131 !important;
  -webkit-text-fill-color: #ff3131 !important;
  font-weight: 600 !important;
}


.components-table-card {
  background: white;
  border: 1px solid #e5e7eb;
}

.components-table :deep(tbody tr td) {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}

.components-table :deep(thead tr th) {
  padding-top: 10px !important;
  padding-bottom: 10px !important;
}

.mic-qty-stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  overflow: hidden;
  height: 30px;
}

.mic-qty-btn {
  width: 26px;
  height: 100%;
  background: #f3f4f6;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  color: #374151;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  user-select: none;
  flex-shrink: 0;
}

.mic-qty-btn:hover {
  background: #e5e7eb;
  color: #ff3131;
}

.mic-qty-input {
  width: 48px;
  height: 100%;
  border: none;
  border-left: 1px solid #d1d5db;
  border-right: 1px solid #d1d5db;
  text-align: center;
  font-size: 0.82rem;
  color: #111827;
  outline: none;
  padding: 0 4px;
  background: white;
}

.mic-qty-input::-webkit-outer-spin-button,
.mic-qty-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}

.mic-qty-input[type=number] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.mic-actions-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.mic-act-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mic-act-btn--edit {
  color: #6b7280;
}

.mic-act-btn--edit:hover {
  background: #f3f4f6;
  color: #374151;
}

.mic-act-btn--delete {
  color: #ff3131;
}

.mic-act-btn--delete:hover {
  background: #fef2f2;
  color: #ff3131;
}

.mic-col-name {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mic-col-name__main {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mic-col-name__ref {
  font-size: 11.5px;
  color: #9ca3af;
}

.components-table :deep(thead) {
  background: #f9fafb;
}

.components-table :deep(thead th),
.components-table :deep(thead th .v-data-table-header__content),
.components-table :deep(thead th span) {
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 0.75rem !important;
  letter-spacing: 0.025em;
  white-space: nowrap;
  color: #374151 !important;
  border-bottom: none !important;
}

.components-table :deep(tbody td),
.components-table :deep(tbody td span),
.components-table :deep(tbody td div) {
  font-size: 0.82rem !important;
}

.components-table :deep(tbody tr:hover) {
  background: #f9fafb !important;
  transition: background-color 0.2s ease;
}

.picture-upload {
  border: 2px dashed #e5e7eb;
  background: #f9fafb;
  cursor: pointer;
  transition: all 0.2s ease;
}

.picture-upload:hover {
  border-color: #ff3131;
  background: #fef2f2;
}

label {
  color: #374151;
}

.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 5px;
  letter-spacing: 0.01em;
}
.mic-required-star {
  color: #ff3131;
  font-weight: 700;
  margin-left: 2px;
}

/* ── Price group builder ── */
.mic-price-add-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mic-price-add-row__amount {
  flex: 0 0 140px;
}
.mic-price-space-sel {
  flex: 1;
  min-width: 0;
}
.mic-price-space-sel :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  background: #fafafa !important;
  box-shadow: none !important;
}
.mic-price-space-sel :deep(.v-field__outline) { display: none !important; }
.mic-price-space-sel :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1) !important;
  background: #fff !important;
}
.mic-price-add-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #ff3131;
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: box-shadow .2s, transform .15s;
}
.mic-price-add-btn:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(255, 49, 49,.4);
  transform: scale(1.08);
}
.mic-price-add-btn:disabled {
  opacity: .4;
  cursor: not-allowed;
}
.mic-price-empty {
  font-size: 12.5px;
  color: #9ca3af;
  text-align: center;
  background: #f9fafb;
  border: 1.5px dashed #e5e7eb;
  border-radius: 11px;
  padding: 14px 12px;
}

/* Label statique au-dessus du champ (neutre, pas rouge). */
.mic-field-label { display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.mic--dark .mic-field-label { color: #cbd5e1; }

/* ── Supplier-style inputs ── */
.mic-input.form-control {
  border-radius: 11px;
  border: 1.5px solid #e5e7eb;
  font-size: 13.5px;
  color: #111827;
  padding: .65rem .8rem;
  height: auto;
  min-height: auto;
  line-height: 1.4;
  background: #fafafa;
  transition: border-color .2s, box-shadow .2s;
}
.mic-input.form-control:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1);
  background: #fff;
  outline: none;
}
.mic-input.form-control::placeholder { color: #9ca3af; }

/* Floating label */
.form-floating > label {
  font-size: 13.5px;
  color: #9ca3af;
  padding: .65rem .8rem;
}
.form-floating > .mic-input:focus ~ label,
.form-floating > .mic-input:not(:placeholder-shown) ~ label {
  color: #ff3131;
  font-size: 11px;
  font-weight: 600;
}

/* Prefixed input (€) */
.mic-prefix-wrap {
  display: flex;
  align-items: center;
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  background: #fafafa;
  overflow: hidden;
  transition: border-color .2s, box-shadow .2s;
}
.mic-prefix-wrap:focus-within {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1);
  background: #fff;
}
.mic-prefix-symbol {
  padding: 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  border-right: 1.5px solid #e5e7eb;
  align-self: stretch;
  display: flex;
  align-items: center;
  background: #f3f4f6;
}
.mic-input--prefixed {
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
  flex: 1;
}
.mic-input--prefixed:focus {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}

/* Champ TVA par espace : symbole % en suffixe (miroir du préfixe €). */
.mic-price-add-row__vat { flex: 0 0 96px; }
.mic-suffix-wrap {
  display: flex;
  align-items: center;
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  background: #fafafa;
  overflow: hidden;
  transition: border-color .2s, box-shadow .2s;
}
.mic-suffix-wrap:focus-within {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1);
  background: #fff;
}
.mic-suffix-symbol {
  padding: 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  border-left: 1.5px solid #e5e7eb;
  align-self: stretch;
  display: flex;
  align-items: center;
  background: #f3f4f6;
}
.mic-input--suffixed {
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
  flex: 1;
  min-width: 0;
}
.mic-input--suffixed:focus {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}
.mic--dark .mic-suffix-wrap { background: #1e293b; border-color: rgba(255, 255, 255, .12); }
.mic--dark .mic-suffix-symbol { background: #1a2535; border-color: rgba(255, 255, 255, .12); color: #9ca3af; }

.mic-prefix-wrap--readonly {
  background: #f3f4f6 !important;
  cursor: not-allowed;
}

.mic-prefix-wrap--readonly input:disabled {
  background: transparent !important;
  color: #6b7280 !important;
  cursor: not-allowed;
}

/* v-select / v-text-field in right panel → supplier style */
.right-section :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  background: #fafafa !important;
  box-shadow: none !important;
}
.right-section :deep(.v-field__outline) { display: none !important; }
.right-section :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important;
  background: #fff !important;
}
.right-section :deep(.v-field__input) {
  font-size: 13.5px !important;
  color: #111827;
}
.right-section :deep(.v-field-label) { font-size: 13px !important; }

/* Dark mode */
.mic--dark .mic-input.form-control {
  background: #1e293b;
  border-color: rgba(255, 255, 255, .12);
  color: #f1f5f9;
}
.mic--dark .mic-input.form-control:focus {
  background: #263548;
  border-color: #ff3131;
}
.mic--dark .mic-input.form-control::placeholder { color: rgba(255, 255, 255, .25); }
.mic--dark .form-floating > label { color: rgba(255, 255, 255, .35); }
.mic--dark .form-floating > .mic-input:focus ~ label,
.mic--dark .form-floating > .mic-input:not(:placeholder-shown) ~ label { color: #e84444; }
.mic--dark .mic-prefix-wrap { background: #1e293b; border-color: rgba(255, 255, 255, .12); }
.mic--dark .mic-prefix-symbol { background: #1a2535; border-color: rgba(255, 255, 255, .12); color: #9ca3af; }
.mic--dark .right-section :deep(.v-field) {
  background: #1e293b !important;
  border-color: rgba(255, 255, 255, .12) !important;
}
.mic--dark .right-section :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  background: #263548 !important;
}
/* v-select (Type, Catégorie, Marque, Nom d'affichage, Ready for sale, Combo, Prix par space) :
   valeur sélectionnée + placeholder + icônes clairs sur le champ sombre (sinon texte noir). */
.mic--dark .right-section :deep(.v-field__input),
.mic--dark .right-section :deep(.v-select__selection-text) { color: #f1f5f9 !important; }
.mic--dark .right-section :deep(.v-field__input input::placeholder) { color: rgba(255, 255, 255, .35); }
.mic--dark .right-section :deep(.v-field__append-inner .v-icon),
.mic--dark .right-section :deep(.v-field__clearable .v-icon) { color: #94a3b8 !important; }
/* Cartes « Prix par space » : pills de space + état vide. */
.mic--dark .mic-space-name-pill { background: rgba(37, 99, 235, .18); color: #93c5fd; border-color: rgba(37, 99, 235, .35); }
.mic--dark .mic-price-empty { background: #1a2535; border-color: rgba(255, 255, 255, .12); color: #94a3b8; }

.form-section-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #9ca3af;
  margin-top: 8px;
}

.form-section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e5e7eb;
}

.checkbox-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 4px;
}


.mic-inventory-card {
  background: #eff6ff;
  border: 1.5px solid #dbeafe;
  border-radius: 12px;
  padding: 16px;
}

.mic-inventory-card__title {
  font-weight: 700;
  font-size: 0.9375rem;
  color: #1e3a5f;
  margin-bottom: 10px;
}

.mic-sentence {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.mic-sentence-text {
  font-size: 0.875rem;
  color: #374151;
  white-space: nowrap;
}

.mic-sentence-chip {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 6px;
  padding: 2px 10px;
  white-space: nowrap;
}

.mic-inventory-card__field {
  margin-top: 12px;
}

.mic-inline-input,
.mic-inline-select {
  border: 1.5px solid #dbeafe;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 13px;
  color: #1e3a5f;
  background: #fff;
  transition: border-color .15s, box-shadow .15s;
}

.mic-inline-input:focus,
.mic-inline-select:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, .1);
  outline: none;
}

.picture-preview {
  position: relative;
  width: 100%;
  height: 260px;
  border-radius: 8px;
  overflow: hidden;
}

.picture-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.picture-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(255, 255, 255, 0.9) !important;
}

/* Ingredient Drawer Styles */
.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e5e7eb;
  background: white;
}

.drawer-body {
  max-height: calc(100vh - 250px);
  overflow-y: auto;
  background: #f9fafb;
}

.drawer-footer {
  border-top: 1px solid #e5e7eb;
  background: white;
}

.ingredient-group .group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.ingredient-group .group-header:hover {
  background: #f9fafb;
}

.ingredient-group .group-body {
  border-top: 1px solid #e5e7eb;
}

.ingredient-group :deep(.v-table) {
  background: white;
}

.ingredient-group :deep(.v-table thead th),
.ingredient-group :deep(.v-table thead th .v-data-table-header__content),
.ingredient-group :deep(.v-table thead th span) {
  font-weight: 700;
  font-size: 0.68rem !important;
  color: #374151;
  background-color: #f9fafb;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  white-space: nowrap;
}

.ingredient-group :deep(.v-table tbody td),
.ingredient-group :deep(.v-table tbody td span),
.ingredient-group :deep(.v-table tbody td div) {
  font-size: 0.75rem !important;
}

.ingredient-group :deep(.v-table tbody tr:hover) {
  background-color: #f9fafb !important;
}

/* Component Drawer Styles */
.component-drawer .drawer-body {
  max-height: calc(100vh - 250px);
}

/* ── Form fields font size ── */
:deep(.v-field__input),
:deep(.v-field-label),
:deep(.v-select__selection-text),
:deep(.v-field__input input),
:deep(.v-list-item-title) {
  font-size: 0.85rem !important;
}

:deep(.v-checkbox .v-label),
:deep(.v-checkbox-btn .v-label) {
  font-size: 0.82rem !important;
}

:deep(.v-chip) {
  font-size: 0.78rem !important;
}

.cost-summary-card :deep(.v-card-text) span {
  font-size: 0.82rem !important;
}

/* ── Price display (readonly replacement) ── */
.mic-price-display {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 12px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  cursor: not-allowed;
}

.mic-price-display__prefix {
  font-size: 0.85rem;
  color: #9ca3af;
}

.mic-price-display__value {
  font-size: 0.85rem;
  color: #6b7280;
  font-weight: 500;
}

/* ── Table summary ── */
.mic-table-summary {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #ff3131;
  border-radius: 10px;
  padding: 12px 16px;
}

.mic-table-summary__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
}

.mic-table-summary__label {
  font-size: 0.8rem;
  color: #6b7280;
}

.mic-table-summary__value {
  font-size: 0.8rem;
  color: #374151;
}

.mic-table-summary__divider {
  height: 1px;
  background: #e2e8f0;
  margin: 8px 0;
}

.mic-table-summary__cost-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #111827;
}

.mic-table-summary__cost-value {
  font-size: 0.85rem;
  font-weight: 700;
  color: #111827;
}

/* ── Title helper ── */
.mic-title {
  color: #111827;
}

/* ── Dark mode ── */
.mic--dark #menu-item-create-page,
.mic--dark .mic-inner,
.mic--dark {
  background: #111827 !important;
}

/* .mic-header is always red gradient — no dark override needed */

.mic--dark .left-section {
  background: #111827;
  border-color: #374151;
}

.mic--dark .right-section {
  background: #1f2937;
}

.mic--dark .right-section-header {
  background: #1f2937;
  border-bottom-color: #374151;
}

.mic--dark .right-section-footer {
  background: #1f2937;
  border-top-color: #374151;
}

.mic--dark .mic-title {
  color: #f9fafb !important;
}

.mic--dark label,
.mic--dark .field-label {
  color: #d1d5db;
}

.mic--dark .mic-inventory-card {
  background: #1e3a5f;
  border-color: #1d4ed8;
}

.mic--dark .mic-inventory-card__title {
  color: #93c5fd;
}

.mic--dark .mic-sentence-text {
  color: #d1d5db;
}

.mic--dark .mic-inline-input,
.mic--dark .mic-inline-select {
  background: #1a2535;
  border-color: rgba(255, 255, 255, .12);
  color: #e5e7eb;
}

/* Contrôle quantité (dans la table) : texte + fond + boutons en dark. */
.mic--dark .mic-qty-input {
  background: #1e293b;
  border-left-color: rgba(255, 255, 255, .12);
  border-right-color: rgba(255, 255, 255, .12);
  color: #f1f5f9;
}
.mic--dark .mic-qty-stepper { border-color: rgba(255, 255, 255, .12); }
.mic--dark .mic-qty-btn { background: #263548; color: #cbd5e1; }
.mic--dark .mic-qty-btn:hover { background: #2d3748; }

.mic--dark .form-section-divider {
  color: #6b7280;
}

.mic--dark .form-section-divider::after {
  background: #374151;
}

.mic--dark .components-table-card {
  background: #1f2937;
  border-color: #374151;
}

.mic--dark .components-table :deep(.v-table) {
  background: #1f2937;
  --v-hover-opacity: 0 !important;
}

.mic--dark .components-table :deep(tbody tr:hover),
.mic--dark .components-table :deep(tbody tr:hover td) {
  background: #2d3748 !important;
}

.mic--dark .components-table :deep(tbody tr:hover::after),
.mic--dark .components-table :deep(tbody tr::after) {
  display: none !important;
}

.mic--dark .components-table :deep(thead) {
  background: #111827;
}

.mic--dark .components-table :deep(thead th) {
  color: #9ca3af !important;
  border-color: #374151 !important;
  background: #111827;
}

.mic--dark .components-table :deep(tbody td) {
  border-color: #374151;
  color: #f3f4f6;
}

.mic--dark .components-table :deep(.v-data-table__tr--hover),
.mic--dark .components-table :deep(.v-data-table__tr--hover td) {
  background: #2d3748 !important;
}

.mic--dark .picture-upload {
  background: #1f2937;
  border-color: #4b5563;
}


.mic--dark .drawer-header {
  background: #1f2937;
  border-color: #374151;
}

.mic--dark .drawer-body {
  background: #111827;
}

.mic--dark .drawer-footer {
  background: #1f2937;
  border-color: #374151;
}

.mic--dark .ingredient-group :deep(.v-table) {
  background: #1f2937;
}

.mic--dark .ingredient-group :deep(.v-table thead th) {
  background-color: #111827;
  color: #9ca3af;
}

.mic--dark .ingredient-group :deep(.v-table tbody tr:hover) {
  background-color: #2d3748 !important;
}

/* Space trigger field */
.space-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  padding: 0 14px;
  height: 40px;
  cursor: pointer;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
  font-size: 0.85rem;
}

.space-trigger:hover {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.08);
}

.space-trigger__placeholder {
  font-size: 13.5px;
  color: #9ca3af;
  flex: 1;
}

.space-trigger__count {
  font-size: 13.5px;
  color: #111827;
  font-weight: 600;
  flex: 1;
}

.space-trigger__icon {
  color: rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
}

/* === Per-space Price Cards === */
.mic-price-card {
  border: 1.5px solid #2563eb;
  border-radius: 10px;
  overflow: hidden;
}

.mic-price-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}

.mic-price-input { flex: 1; }

.mic-space-names {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex-shrink: 0;
  max-width: 55%;
  justify-content: flex-end;
}
.mic-space-names--clickable {
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 4px;
  transition: background 0.15s;
}
.mic-space-names--clickable:hover .mic-space-name-pill {
  background: #dbeafe;
  border-color: #93c5fd;
}

.mic-space-name-pill {
  display: inline-block;
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  border-radius: 50px;
  font-size: 0.73rem;
  font-weight: 600;
  padding: 2px 9px;
  white-space: nowrap;
}

.mic-price-summary {
  padding: 8px 14px 8px;
}

.mic-price-row-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}

.mic-price-label {
  font-size: 0.78rem;
  color: #6b7280;
}

.mic-price-margin-label {
  font-weight: 700;
  font-size: 0.82rem;
  color: #374151;
}

.mic-price-value {
  font-size: 0.78rem;
  font-weight: 600;
  color: #374151;
}

.mic-price-sep {
  height: 1px;
  background: #e2e8f0;
  margin: 6px 0;
}

.mic-margin-value {
  font-size: 0.82rem;
  font-weight: 700;
}

/* Dark mode table summary */
.mic--dark .mic-table-summary {
  background: #1e2a3a;
  border-color: #334155;
}

.mic--dark .mic-table-summary__label {
  color: #94a3b8;
}

.mic--dark .mic-table-summary__value {
  color: #cbd5e1;
}

.mic--dark .mic-table-summary__divider {
  background: #334155;
}

.mic--dark .mic-table-summary__cost-label,
.mic--dark .mic-table-summary__cost-value {
  color: #ffffff;
}

/* Dark mode price display */
.mic--dark .mic-price-display {
  background: #0f172a;
  border-color: #374151;
}

.mic--dark .mic-price-display__prefix,
.mic--dark .mic-price-display__value {
  color: #6b7280;
}



/* Dark mode for price cards */
.mic--dark .mic-price-card {
  border-color: #2563eb;
}

.mic--dark .mic-space-badge {
  color: #93c5fd;
}

.mic--dark .mic-price-label {
  color: #9ca3af;
}

.mic--dark .mic-price-margin-label {
  color: rgba(255, 255, 255, 0.87);
}

.mic--dark .mic-price-value {
  color: rgba(255, 255, 255, 0.87);
}

.mic--dark .mic-price-sep {
  background: #374151;
}


/* Dark mode — left panel */
.mic--dark .mic-left-title {
  color: #f9fafb;
}

.mic--dark .mic-add-btn--outline {
  background: #1f2937;
  border-color: #4b5563;
  color: #d1d5db;
}

.mic--dark .mic-add-btn--outline:hover {
  border-color: #ff3131;
  color: #fca5a5;
}

.mic--dark .mic-add-btn--dark {
  background: #374151;
  border-color: #4b5563;
  color: #f9fafb;
}

/* Dark mode — footer buttons */
.mic--dark .mic-footer-btn--ghost {
  border-color: #4b5563;
  color: #9ca3af;
}

.mic--dark .mic-footer-btn--ghost:hover {
  border-color: #6b7280;
  color: #d1d5db;
}

/* Dark mode overrides */
.mic--dark .space-trigger {
  background: #1f2937;
  border-color: rgba(255, 255, 255, 0.24);
  color: #f9fafb;
}

.mic--dark .space-trigger:hover {
  border-color: rgba(255, 255, 255, 0.5);
}

.mic--dark .space-trigger__placeholder {
  color: rgba(255, 255, 255, 0.38);
}

.mic--dark .space-trigger__count {
  color: #f9fafb;
}

.mic--dark .spaces-price-summary {
  background: #1f2937;
  border-color: rgba(255, 255, 255, 0.12);
  color: #9ca3af;
}
</style>
