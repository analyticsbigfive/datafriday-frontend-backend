<template>
  <Teleport to="body">
  <Transition name="mpcd">
  <div v-if="localOpen" class="mpcd-overlay" @mousedown.self="close">
    <div class="d-flex flex-column mpcd-panel mpcd" :class="{ 'mpcd--dark': isDark }">
      <!-- Header -->
      <div class="mpcd__grad-header">
        <div class="mpcd__header-icon"><ShoppingBasket :size="22" color="white" /></div>
        <div class="mpcd__header-titles">
          <div class="mpcd__header-title">{{ t('addMarketPrice') }}</div>
          <div class="mpcd__header-subtitle">{{ t('step') }} {{ step }} {{ t('of') }} 2 — {{ step === 1 ? t('basicInfo') : (locale === 'fr' ? 'Informations fournisseur' : 'Supplier Information') }}</div>
        </div>
        <button class="mpcd__close-btn" @click="close"><X :size="18" /></button>
      </div>

      <!-- Error -->
      <div v-if="error" class="mpcd__error">
        <AlertCircle :size="14" class="me-2" style="flex-shrink:0" />{{ error }}
      </div>

      <!-- Content -->
      <div class="mpcd__content">

        <template v-if="step === 1">

          <!-- Toggle mode -->
          <div class="mpcd-section">
            <div class="mpcd-mode-tabs">
              <button
                class="mpcd-mode-tab"
                :class="{ 'mpcd-mode-tab--active': itemNameMode === 'select' }"
                @click="itemNameMode = 'select'"
              >
                <List :size="15" />
                {{ t('selectExisting') }}
              </button>
              <button
                class="mpcd-mode-tab"
                :class="{ 'mpcd-mode-tab--active': itemNameMode === 'create' }"
                @click="itemNameMode = 'create'"
              >
                <PlusCircle :size="15" />
                {{ t('createNew') }}
              </button>
            </div>
          </div>

          <!-- Photo -->
          <div class="mpcd-section">
            <div class="mpcd-section__label">
              <Image :size="13" style="color:#ff3131" class="me-1" />
              {{ t('imageOptional') }}
            </div>
            <div
              class="market-picture-upload"
              :class="{ 'has-image': imagePreview }"
              @click="triggerImagePicker"
            >
              <v-file-input
                ref="imageInput"
                v-model="imageFile"
                accept="image/*"
                prepend-icon=""
                density="compact"
                class="d-none"
                @update:model-value="onImageSelected"
              ></v-file-input>
              <div v-if="!imagePreview" class="picture-placeholder">
                <div class="upload-icon-circle">
                  <ImagePlus :size="32" style="color:#ff3131" />
                </div>
                <p class="text-body-2 font-weight-medium mb-1">{{ t('clickToUpload') }}</p>
                <p class="text-caption text-medium-emphasis mb-0">{{ t('fileFormat') }}</p>
              </div>
              <div v-if="imagePreview" class="picture-preview">
                <v-img :src="imagePreview" cover height="160" class="rounded-lg"></v-img>
                <div class="picture-overlay">
                  <Camera :size="32" color="white" />
                  <p class="text-caption mt-2 mb-0" style="color: white;">{{ t('clickToChange') }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Item Name + Good Type -->
          <div class="mpcd-section">
            <div class="mpcd-section__label">{{ locale === 'fr' ? 'Informations article' : 'Item Information' }}</div>
            <div class="mb-3">
              <div v-if="itemNameMode === 'select'" class="mpcd-field-row">
                <label class="mpcd-field-label">{{ t('itemName') }} <span class="mpcd-required">*</span></label>
                <v-select
                  v-model="form.itemName"
                  :items="existingItemNames"
                  density="compact"
                  variant="outlined"
                  hide-details="auto"
                  :placeholder="t('selectExistingItem')"
                  :menu-props="{ zIndex: 10000 }"
                  class="mpcd-item-select"
                ></v-select>
              </div>
              <div v-else class="mpcd-field-row">
                <label class="mpcd-field-label" for="mpcd-itemName">{{ t('itemName') }} <span class="mpcd-required">*</span></label>
                <input id="mpcd-itemName" v-model="form.itemName" type="text" class="form-control mpcd-input" />
              </div>
            </div>
          <div class="mpcd-field-row mb-3">
            <label class="mpcd-field-label">{{ t('goodType') }} <span class="mpcd-required">*</span></label>
            <v-select
              v-model="form.goodType"
              :items="localGoodTypeOptions"
              density="compact"
              variant="outlined"
              hide-details="auto"
              :menu-props="{ zIndex: 10000 }"
              class="mpcd-item-select"
            >
              <template #prepend-item>
                <v-list-item style="color:#ff3131; font-weight:600;" @click.stop="newTypeOpen = true">
                  <template #prepend><PlusCircle :size="16" class="me-2" style="color:#ff3131" /></template>
                  <v-list-item-title>{{ locale === 'fr' ? 'Ajouter un type' : 'Add Good Type' }}</v-list-item-title>
                </v-list-item>
                <v-divider class="my-1" />
              </template>
            </v-select>
          </div>

          <div class="mpcd-field-row">
            <label class="mpcd-field-label">{{ t('goodCategory') }}</label>
            <v-select
              v-model="form.category"
              :items="goodCategoryOptions"
              density="compact"
              variant="outlined"
              hide-details="auto"
              clearable
              :disabled="!form.goodType"
              :menu-props="{ zIndex: 10000 }"
              class="mpcd-item-select"
            >
              <template #prepend-item>
                <v-list-item style="color:#ff3131; font-weight:600;" @click.stop="newCategoryOpen = true">
                  <template #prepend><PlusCircle :size="16" class="me-2" style="color:#ff3131" /></template>
                  <v-list-item-title>{{ locale === 'fr' ? 'Ajouter une catégorie' : 'Add Category' }}</v-list-item-title>
                </v-list-item>
                <v-divider class="my-1" />
              </template>
            </v-select>
          </div>

          <!-- Dialog — Nouvelle catégorie -->
          <v-dialog v-model="newCategoryOpen" max-width="420" :z-index="11000" :persistent="newCategoryLoading">
            <div class="mpcd-mini-dialog">
              <div class="mpcd-mini-dialog__header">
                <Tag :size="18" color="white" />
                <span>{{ locale === 'fr' ? 'Nouvelle catégorie' : 'New Category' }}</span>
                <button class="mpcd-mini-dialog__close" :disabled="newCategoryLoading" @click="newCategoryOpen = false"><X :size="16" /></button>
              </div>
              <div class="mpcd-mini-dialog__body">
                <v-alert v-if="newCategoryError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3" style="font-size:13px;">
                  {{ newCategoryError }}
                </v-alert>
                <div class="mpcd-field-row">
                  <label class="mpcd-field-label" for="mpcd-nc-name">{{ locale === 'fr' ? 'Nom de la catégorie' : 'Category name' }} <span class="mpcd-required">*</span></label>
                  <input id="mpcd-nc-name" v-model="newCategoryValue" type="text" class="form-control mpcd-input" :disabled="newCategoryLoading" @keyup.enter="confirmNewCategory" />
                </div>
              </div>
              <div class="mpcd-mini-dialog__footer">
                <button class="mpcd-btn mpcd-btn--cancel" :disabled="newCategoryLoading" @click="newCategoryOpen = false">{{ t('cancel') }}</button>
                <button class="mpcd-btn mpcd-btn--primary" :disabled="!newCategoryValue.trim() || newCategoryLoading" @click="confirmNewCategory">
                  <v-progress-circular v-if="newCategoryLoading" indeterminate size="14" width="2" color="white" class="me-1" />
                  <Check v-else :size="14" class="me-1" />
                  {{ locale === 'fr' ? 'Ajouter' : 'Add' }}
                </button>
              </div>
            </div>
          </v-dialog>

          <!-- Dialog — Nouveau type -->
          <v-dialog v-model="newTypeOpen" max-width="420" :z-index="11000" :persistent="newTypeLoading">
            <div class="mpcd-mini-dialog">
              <div class="mpcd-mini-dialog__header">
                <Shapes :size="18" color="white" />
                <span>{{ locale === 'fr' ? 'Nouveau type de produit' : 'New Good Type' }}</span>
                <button class="mpcd-mini-dialog__close" :disabled="newTypeLoading" @click="newTypeOpen = false"><X :size="16" /></button>
              </div>
              <div class="mpcd-mini-dialog__body">
                <v-alert v-if="newTypeError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3" style="font-size:13px;">
                  {{ newTypeError }}
                </v-alert>
                <div class="mpcd-field-row">
                  <label class="mpcd-field-label" for="mpcd-nt-name">{{ locale === 'fr' ? 'Nom du type' : 'Type name' }} <span class="mpcd-required">*</span></label>
                  <input id="mpcd-nt-name" v-model="newTypeValue" type="text" class="form-control mpcd-input" :disabled="newTypeLoading" @keyup.enter="confirmNewType" />
                </div>
              </div>
              <div class="mpcd-mini-dialog__footer">
                <button class="mpcd-btn mpcd-btn--cancel" :disabled="newTypeLoading" @click="newTypeOpen = false">{{ t('cancel') }}</button>
                <button class="mpcd-btn mpcd-btn--primary" :disabled="!newTypeValue.trim() || newTypeLoading" @click="confirmNewType">
                  <v-progress-circular v-if="newTypeLoading" indeterminate size="14" width="2" color="white" class="me-1" />
                  <Check v-else :size="14" class="me-1" />
                  {{ locale === 'fr' ? 'Ajouter' : 'Add' }}
                </button>
              </div>
            </div>
          </v-dialog>
        </div>

        </template>

        <template v-else>
          <v-form ref="formRef" v-model="formValid" validate-on="submit">
            <div class="mpcd-step2-wrap">
            <v-alert color="#EEF2FF" variant="tonal" density="compact" class="mb-3">
              <span class="font-weight-bold" style="color:#1d4ed8">
                {{ t('addingSupplierTo') }} {{ String(form.itemName || '').trim() || '-' }}
              </span>
            </v-alert>

            <div class="mpcd-field-row mb-3">
              <label class="mpcd-field-label">{{ t('supplier') }} <span class="mpcd-required">*</span></label>
              <v-select
                v-model="form.supplierId"
                :items="localSuppliers"
                item-title="name"
                item-value="id"
                density="compact"
                variant="outlined"
                hide-details="auto"
                :placeholder="t('selectSupplier')"
                :menu-props="{ zIndex: 10000 }"
                class="mpcd-item-select"
              >
                <template #prepend-item>
                  <v-list-item
                    style="color: #ff3131; font-weight: 600;"
                    @click.stop="supplierCreateOpen = true"
                  >
                    <template #prepend><PlusCircle :size="16" class="me-2" style="color:#ff3131" /></template>
                    <v-list-item-title>{{ t('addNewSupplier') }}</v-list-item-title>
                  </v-list-item>
                  <v-divider class="my-1" />
                </template>
              </v-select>
            </div>

            <!-- Dialog — création d'un fournisseur -->
            <v-dialog v-model="supplierCreateOpen" max-width="540" :persistent="supplierCreateLoading" :z-index="11000">
              <div class="sc-dialog">

                <!-- Header -->
                <div class="sc-dialog__header">
                  <div class="sc-dialog__icon">
                    <Truck :size="22" color="white" />
                  </div>
                  <div class="sc-dialog__titles">
                    <div class="sc-dialog__title">{{ t('addNewSupplier') }}</div>
                    <div class="sc-dialog__subtitle">{{ t('supplierCreateSubtitle') }}</div>
                  </div>
                  <button class="sc-dialog__close" :disabled="supplierCreateLoading" @click="supplierCreateOpen = false">
                    <X :size="18" />
                  </button>
                </div>

                <!-- Error -->
                <div v-if="supplierCreateError" class="sc-dialog__alert">
                  <AlertCircle :size="15" class="me-2" style="flex-shrink:0" />
                  {{ supplierCreateError }}
                </div>

                <!-- Body -->
                <div class="sc-dialog__body">

                  <!-- Photo du fournisseur -->
                  <input ref="supplierPictureInput" type="file" accept="image/*" class="d-none" @change="onSupplierPictureSelected" />
                  <div class="sc-photo" @click="triggerSupplierPicture">
                    <template v-if="supplierImagePreview">
                      <img :src="supplierImagePreview" class="sc-photo__img" />
                      <button type="button" class="sc-photo__remove" @click.stop="clearSupplierPicture"><X :size="14" /></button>
                    </template>
                    <div v-else class="sc-photo__placeholder">
                      <div class="sc-photo__icon">
                        <ImagePlus :size="30" style="color:#ff3131" />
                      </div>
                      <span class="sc-photo__label">{{ t('uploadPicture') }}</span>
                      <span class="sc-photo__hint">{{ t('fileFormat') }}</span>
                    </div>
                  </div>

                  <!-- Identité -->
                  <div class="sc-section">
                    <div class="sc-section__label">{{ t('sectionIdentity') }}</div>
                    <div class="mpcd-field-row mb-3">
                      <label class="mpcd-field-label" for="sc-name">{{ t('supplierName') }} <span class="sc-required">*</span></label>
                      <input
                        id="sc-name"
                        v-model="supplierCreateForm.name"
                        type="text"
                        class="form-control sc-input"
                        autofocus
                        @keyup.enter="supplierCreateForm.name.trim() && submitSupplierCreate()"
                      />
                    </div>
                    <div class="mpcd-field-row">
                      <label class="mpcd-field-label" for="sc-contact">{{ t('supplierContactName') }} <span class="sc-required">*</span></label>
                      <input id="sc-contact" v-model="supplierCreateForm.contactName" type="text" class="form-control sc-input" />
                    </div>
                  </div>

                  <!-- Contact -->
                  <div class="sc-section">
                    <div class="sc-section__label">{{ t('sectionContact') }}</div>
                    <div class="row g-3">
                      <div class="col-6">
                        <div class="mpcd-field-row">
                          <label class="mpcd-field-label" for="sc-email">{{ t('supplierEmail') }} <span class="sc-required">*</span></label>
                          <input id="sc-email" v-model="supplierCreateForm.email" type="email" class="form-control sc-input" />
                        </div>
                      </div>
                      <div class="col-6">
                        <div class="mpcd-field-row">
                          <label class="mpcd-field-label" for="sc-phone">{{ t('supplierPhone') }} <span class="sc-required">*</span></label>
                          <input id="sc-phone" v-model="supplierCreateForm.phone" type="tel" class="form-control sc-input" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Localisation -->
                  <div class="sc-section">
                    <div class="sc-section__label">{{ t('sectionLocation') }}</div>
                    <div class="mpcd-field-row mb-3">
                      <label class="mpcd-field-label" for="sc-address">{{ t('address') }} <span class="sc-required">*</span></label>
                      <input id="sc-address" v-model="supplierCreateForm.address" type="text" class="form-control sc-input" />
                    </div>
                    <div class="row g-3">
                      <div class="col-7">
                        <div class="mpcd-field-row">
                          <label class="mpcd-field-label" for="sc-city">{{ t('city') }} <span class="sc-required">*</span></label>
                          <input id="sc-city" v-model="supplierCreateForm.city" type="text" class="form-control sc-input" />
                        </div>
                      </div>
                      <div class="col-5">
                        <div class="mpcd-field-row">
                          <label class="mpcd-field-label" for="sc-postcode">{{ t('postcode') }} <span class="sc-required">*</span></label>
                          <input id="sc-postcode" v-model="supplierCreateForm.postcode" type="text" class="form-control sc-input" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Sites -->
                  <div v-if="availableSpaces.length > 0" class="sc-section">
                    <div class="sc-section__header">
                      <div class="sc-section__label mb-0">
                        {{ t('sites') }} <span class="sc-required">*</span>
                        <span class="sc-site-count">({{ supplierCreateForm.spaceIds.length }}/{{ availableSpaces.length }})</span>
                      </div>
                      <button class="sc-toggle-all" @click="toggleAllSpaces">
                        {{ isAllSpacesChecked ? t('unselectAll') : t('selectAll') }}
                      </button>
                    </div>
                    <div class="sc-pill-grid">
                      <label
                        v-for="space in availableSpaces"
                        :key="space.id"
                        class="sc-check-pill"
                        :class="{ 'sc-check-pill--active': supplierCreateForm.spaceIds.includes(space.id) }"
                      >
                        <input type="checkbox" :value="space.id" v-model="supplierCreateForm.spaceIds" class="visually-hidden" @change="onSupplierSpacesChange(supplierCreateForm.spaceIds)" />
                        <Check :size="12" class="sc-check-pill__check" />
                        {{ space.name }}
                      </label>
                    </div>
                  </div>

                  <!-- Notes -->
                  <div class="sc-section">
                    <div class="sc-section__label">{{ t('notes') }}</div>
                    <textarea v-model="supplierCreateForm.notes" class="form-control sc-input" rows="3" :placeholder="t('addNotes')"></textarea>
                  </div>

                </div>

                <!-- Footer -->
                <div class="sc-dialog__footer">
                  <button class="sc-btn sc-btn--cancel" :disabled="supplierCreateLoading" @click="supplierCreateOpen = false">
                    {{ t('cancel') }}
                  </button>
                  <button class="sc-btn sc-btn--create" :disabled="!supplierCreateForm.name.trim() || supplierCreateLoading" @click="submitSupplierCreate">
                    <span v-if="supplierCreateLoading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    <Check v-else :size="15" class="me-1" />
                    {{ t('create') }}
                  </button>
                </div>

              </div>
            </v-dialog>

            <div class="mpcd-field-row mb-3">
              <label class="mpcd-field-label" for="mpcd-supplierItem">{{ t('supplierItem') }} <span class="mpcd-required">*</span></label>
              <input id="mpcd-supplierItem" v-model="form.supplierItem" type="text" class="form-control mpcd-input" />
            </div>

            <!-- Industrial -->
            <div class="mpcd-field-row mb-3">
              <label class="mpcd-field-label">{{ t('industrial') }}</label>
              <v-select
                v-model="form.industrialId"
                :items="industrialsOptions"
                item-title="name"
                item-value="id"
                density="compact"
                variant="outlined"
                hide-details="auto"
                clearable
                :menu-props="{ zIndex: 10000 }"
                class="mpcd-item-select"
              >
                <template #prepend-item>
                  <v-list-item style="color:#ff3131; font-weight:600;" @click.stop="industrialCreateOpen = true">
                    <template #prepend><PlusCircle :size="16" class="me-2" style="color:#ff3131" /></template>
                    <v-list-item-title>{{ locale === 'fr' ? 'Ajouter un industriel' : 'Add Industrial' }}</v-list-item-title>
                  </v-list-item>
                  <v-divider class="my-1" />
                </template>
              </v-select>
            </div>

            <!-- Dialog — Nouvel industriel -->
            <v-dialog v-model="industrialCreateOpen" max-width="420" :z-index="11000" :persistent="industrialCreateLoading">
              <div class="mpcd-mini-dialog">
                <div class="mpcd-mini-dialog__header">
                  <Tag :size="18" color="white" />
                  <span>{{ locale === 'fr' ? 'Nouvel industriel' : 'New Industrial' }}</span>
                  <button class="mpcd-mini-dialog__close" :disabled="industrialCreateLoading" @click="industrialCreateOpen = false"><X :size="16" /></button>
                </div>
                <div class="mpcd-mini-dialog__body">
                  <v-alert v-if="industrialCreateError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3" style="font-size:13px;">
                    {{ industrialCreateError }}
                  </v-alert>
                  <div class="mpcd-field-row">
                    <label class="mpcd-field-label" for="mpcd-ind-name">{{ locale === 'fr' ? 'Nom' : 'Name' }} <span class="mpcd-required">*</span></label>
                    <input id="mpcd-ind-name" v-model="industrialCreateValue" type="text" class="form-control mpcd-input" :disabled="industrialCreateLoading" @keyup.enter="confirmIndustrialCreate" />
                  </div>
                </div>
                <div class="mpcd-mini-dialog__footer">
                  <button class="mpcd-btn mpcd-btn--cancel" :disabled="industrialCreateLoading" @click="industrialCreateOpen = false">{{ t('cancel') }}</button>
                  <button class="mpcd-btn mpcd-btn--primary" :disabled="!industrialCreateValue.trim() || industrialCreateLoading" @click="confirmIndustrialCreate">
                    <v-progress-circular v-if="industrialCreateLoading" indeterminate size="14" width="2" color="white" class="me-1" />
                    <Check v-else :size="14" class="me-1" />
                    {{ locale === 'fr' ? 'Ajouter' : 'Add' }}
                  </button>
                </div>
              </div>
            </v-dialog>

            <!-- Purchase Information -->
            <div class="info-card mb-4">
              <div class="info-card__title">{{ t('purchaseInfo') }}</div>
              <div class="info-card__row mb-3">
                <span class="info-label">{{ t('itemIsPurchasedIn') }}</span>
                <select v-model="form.purchasePackaging" class="mpcd-inline-select" style="min-width:120px;" @change="onPackagingSelectChange('purchasePackaging', $event)">
                  <option value="">—</option>
                  <option value="__add_packaging__" style="color:#ff3131; font-weight:600;">+ Add packaging</option>
                  <option v-for="opt in localPackagingOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <span class="info-label">{{ t('of') }}</span>
                <input v-model.number="form.unitsPerPurchase" type="number" min="1" class="mpcd-inline-input" style="width:70px;" @input="recomputePricePerUnit" />
              </div>
              <div class="info-card__row">
                <select v-model="form.unit" class="mpcd-inline-select" style="width:80px;">
                  <option value="">—</option>
                  <option value="Kg">Kg</option>
                  <option value="L">L</option>
                  <option value="Pc">Pc</option>
                </select>
                <span class="info-label">{{ t('forTheAmountOf') }} €</span>
                <input v-model="form.price" inputmode="decimal" class="mpcd-inline-input" style="width:90px;" placeholder="0.00" @blur="form.price = parseFloat(String(form.price).replace(',', '.')) || 0; recomputePricePerUnit()" @input="recomputePricePerUnit" />
                <span class="info-label info-label--dot">.</span>
              </div>
            </div>

            <!-- Inventory Information -->
            <div class="info-card mt-0">
              <div class="info-card__title">{{ t('inventoryInfo') }}</div>
              <div class="info-card__row">
                <span class="info-label">{{ t('itemIsStoredIn') }}</span>
                <select v-model="form.inventoryPackaging" class="mpcd-inline-select" style="min-width:120px;" @change="onPackagingSelectChange('inventoryPackaging', $event)">
                  <option value="">—</option>
                  <option value="__add_packaging__" style="color:#ff3131; font-weight:600;">+ Add packaging</option>
                  <option v-for="opt in localPackagingOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <span class="info-label">{{ t('of') }}</span>
                <input v-model.number="form.packedUnits" type="number" min="0" step="0.001" class="mpcd-inline-input" style="width:80px;" />
                <span class="info-card__unit-badge">{{ form.unit || '—' }}</span>
                <span class="info-label info-label--dot">.</span>
              </div>
            </div>

            <!-- Dialog — Packaging creation -->
            <v-dialog v-model="packagingCreateOpen" max-width="420" :z-index="11000" :persistent="packagingCreateLoading">
              <div class="mpcd-mini-dialog">
                <div class="mpcd-mini-dialog__header">
                  <Package :size="18" color="white" />
                  <span style="flex:1">{{ locale === 'fr' ? 'Ajouter un packaging' : 'Add a packaging' }}</span>
                  <button class="mpcd-mini-dialog__close" :disabled="packagingCreateLoading" @click="packagingCreateOpen = false"><X :size="16" /></button>
                </div>
                <div v-if="packagingCreateError" style="padding:10px 16px; background:#fef2f2; font-size:13px; color:#ff3131; display:flex; align-items:center; gap:6px;">
                  <AlertCircle :size="13" style="flex-shrink:0" />{{ packagingCreateError }}
                </div>
                <div class="mpcd-mini-dialog__body">
                  <div class="mpcd-field-row">
                    <label class="mpcd-field-label" for="mpcd-pk-name">{{ locale === 'fr' ? 'Nom du packaging' : 'Packaging name' }} <span class="mpcd-required">*</span></label>
                    <input id="mpcd-pk-name" ref="packagingNameInput" v-model="packagingCreateForm.name" type="text" class="form-control mpcd-input" :disabled="packagingCreateLoading" @keyup.enter="submitPackagingCreate" />
                  </div>
                </div>
                <div class="mpcd-mini-dialog__footer">
                  <button class="mpcd-btn mpcd-btn--cancel" :disabled="packagingCreateLoading" @click="packagingCreateOpen = false">{{ t('cancel') }}</button>
                  <button class="mpcd-btn mpcd-btn--primary" :disabled="!packagingCreateForm.name.trim() || packagingCreateLoading" @click="submitPackagingCreate">
                    <span v-if="packagingCreateLoading" class="spinner-border spinner-border-sm me-2" role="status"></span>
                    <Check v-else :size="14" class="me-1" />
                    {{ locale === 'fr' ? 'Ajouter' : 'Add' }}
                  </button>
                </div>
              </div>
            </v-dialog>

            <!-- Packing Information -->
            <div class="info-card mt-0">
              <div class="info-card__title">{{ t('packingInfo') }} <span style="font-weight:400; color:#9ca3af;">({{ t('optional') }})</span></div>
              <div class="row g-2 mt-1">
                <div class="col-6">
                  <div class="mpcd-field-row">
                    <label class="mpcd-field-label" for="mpcd-packedUnits">{{ t('packedUnits') }} ({{ form.unit || 'unit' }})</label>
                    <input id="mpcd-packedUnits" v-model.number="form.packedUnits" type="number" min="0" class="form-control mpcd-input" />
                  </div>
                </div>
                <div class="col-6">
                  <div class="mpcd-field-row">
                    <label class="mpcd-field-label" for="mpcd-numberOfUnits">{{ t('numberOfUnits') }}</label>
                    <input id="mpcd-numberOfUnits" v-model.number="form.numberOfUnits" type="number" min="0" class="form-control mpcd-input" />
                  </div>
                </div>
              </div>
              <div class="row g-2 mt-2">
                <div class="col-4">
                  <div class="mpcd-field-row">
                    <label class="mpcd-field-label" for="mpcd-length">{{ t('length') }} (cm)</label>
                    <input id="mpcd-length" v-model.number="form.packingLength" type="number" min="0" class="form-control mpcd-input" />
                  </div>
                </div>
                <div class="col-4">
                  <div class="mpcd-field-row">
                    <label class="mpcd-field-label" for="mpcd-width">{{ t('width') }} (cm)</label>
                    <input id="mpcd-width" v-model.number="form.packingWidth" type="number" min="0" class="form-control mpcd-input" />
                  </div>
                </div>
                <div class="col-4">
                  <div class="mpcd-field-row">
                    <label class="mpcd-field-label" for="mpcd-height">{{ t('height') }} (cm)</label>
                    <input id="mpcd-height" v-model.number="form.packingHeight" type="number" min="0" class="form-control mpcd-input" />
                  </div>
                </div>
              </div>
            </div>
            </div><!-- /mpcd-step2-wrap -->
          </v-form>
        </template>
      </div>

      <!-- Footer -->
      <div class="mpcd__footer">
        <template v-if="step === 1">
          <button class="mpcd-btn mpcd-btn--cancel" @click="close">{{ t('cancel') }}</button>
          <button class="mpcd-btn mpcd-btn--primary" @click="goNextStep">
            <ArrowRight :size="16" class="me-1" />
            {{ t('next') }}
          </button>
        </template>
        <template v-else>
          <button class="mpcd-btn mpcd-btn--back" @click="goBackStep">
            <ArrowLeft :size="16" class="me-1" />
            {{ t('back') }}
          </button>
          <button class="mpcd-btn mpcd-btn--cancel" @click="close">{{ t('cancel') }}</button>
          <button class="mpcd-btn mpcd-btn--primary" :disabled="loading" @click="submit">
            <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status"></span>
            <Check v-else :size="16" class="me-1" />
            {{ t('addSupplierItem') }}
          </button>
        </template>
      </div>
    </div>
  </div>
  </Transition>
  </Teleport>
</template>

<script>
import { AlertCircle, ArrowLeft, ArrowRight, Camera, Check, Image, ImagePlus, List, Package, Pencil, PlusCircle, Save, Shapes, ShoppingBasket, Tag, Trash2, Truck, X } from 'lucide-vue-next';
import { createMarketPrice, createSupplier } from '@/api/endpoints/menu.api';
import { createMarketPriceType, createMarketPriceCategory } from '@/api/endpoints/market.price.api';
import { createPackingType } from '@/api/endpoints/packing-type.api';
import { createIndustrial } from '@/api/endpoints/industrial.api';


export default {
  name: 'MarketPriceCreateDrawer',
  components: { AlertCircle, ArrowLeft, ArrowRight, Camera, Check, Image, ImagePlus, List, Package, Pencil, PlusCircle, Save, Shapes, ShoppingBasket, Tag, Trash2, Truck, X },
  props: {
    modelValue: { type: Boolean, default: false },
    // initialData: when set, pre-fills form for "add supplier to existing item" (step 2)
    initialData: { type: Object, default: null },
    existingItemNames: { type: Array, default: () => [] },
    suppliers: { type: Array, default: () => [] },
    goodTypeOptions: { type: Array, default: () => [] },
    productCategories: { type: Array, default: () => [] },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'created'],
  data() {
    return {
      locale: localStorage.getItem('appLocale') || 'en',
      step: 1,
      itemNameMode: 'select',
      loading: false,
      error: '',
      formValid: false,
      imageFile: null,
      imagePreview: '',
      localGoodTypeOptions: [],
      newTypeOpen: false,
      newTypeValue: '',
      newTypeLoading: false,
      newTypeError: '',
      localGoodCategoryOptions: [],
      newCategoryOpen: false,
      newCategoryValue: '',
      newCategoryLoading: false,
      newCategoryError: '',
      form: this._defaultForm(),
      translations: {
        en: {
          addMarketPrice: 'Add Market Price',
          step: 'Step',
          of: 'of',
          basicInfo: 'Enter the basic information about the product',
          selectExisting: 'Select Existing',
          createNew: 'Create New',
          imageOptional: 'Image (Optional)',
          clickToUpload: 'Click to upload image',
          fileFormat: 'PNG, JPG up to 5MB',
          clickToChange: 'Click to change',
          itemName: 'Item Name',
          selectExistingItem: 'Select Existing',
          enterItemName: 'Enter item name',
          goodType: 'Good Type',
          goodCategory: 'Good Category (Optional)',
          addingSupplierTo: 'Adding supplier item to:',
          supplier: 'Supplier',
          selectSupplier: 'Select supplier',
          supplierItem: 'Supplier Item',
          supplierItemPlaceholder: "Supplier's item name or code",
          industrial: 'Industrial',
          unit: 'Unit',
          unitsPerPurchase: 'Units Per Purchase',
          price: 'Price',
          pricePerUnit: 'Price Per Unit',
          packedUnits: 'Packed Units (Optional)',
          numberOfUnits: 'Number of Units',
          packingDimensions: 'Packing Dimensions (L/W/H in cm) - Optional',
          length: 'Length',
          width: 'Width',
          height: 'Height',
          cancel: 'Cancel',
          next: 'Next',
          back: 'Back',
          addSupplierItem: 'Add Supplier Item',
          addNewSupplier: 'Add a supplier',
          supplierCreateSubtitle: 'Fill in the supplier contact information',
          sectionIdentity: 'Identity',
          supplierName: 'Supplier name',
          supplierEmail: 'Email',
          supplierPhone: 'Phone',
          supplierContactName: 'Contact name',
          supplierSpaces: 'Spaces',
          sectionContact: 'Contact',
          sectionLocation: 'Location',
          address: 'Address',
          city: 'City',
          postcode: 'Postcode',
          notes: 'Notes',
          sites: 'Sites',
          selectAll: 'Select all',
          unselectAll: 'Unselect all',
          addNotes: 'Add any additional notes…',
          required: 'Required field',
          uploadPicture: 'Upload supplier photo',
          supplierConfigurations: 'Configurations',
          supplierSectors: 'Sectors',
          create: 'Create',
          purchaseInfo: 'Purchase Information',
          inventoryInfo: 'Inventory Information',
          packingInfo: 'Packing Information',
          optional: 'Optional',
          itemIsPurchasedIn: 'Item is purchased in',
          forTheAmountOf: 'for the amount of',
          itemIsStoredIn: 'Item is stored in',
          selectPackaging: 'Select packaging',
          selectUnit: 'Select unit',
          of: 'of',
        },
        fr: {
          addMarketPrice: 'Ajouter Prix du Marché',
          step: 'Étape',
          of: 'sur',
          basicInfo: 'Entrez les informations de base sur le produit',
          selectExisting: 'Sélectionner existant',
          createNew: 'Créer nouveau',
          imageOptional: 'Image (Optionnel)',
          clickToUpload: "Cliquez pour télécharger l'image",
          fileFormat: "PNG, JPG jusqu'à 5MB",
          clickToChange: 'Cliquez pour changer',
          itemName: "Nom de l'article",
          selectExistingItem: 'Sélectionner existant',
          enterItemName: "Entrez le nom de l'article",
          goodType: 'Type de produit',
          goodCategory: 'Catégorie (Optionnel)',
          addingSupplierTo: "Ajout d'un article fournisseur à :",
          supplier: 'Fournisseur',
          selectSupplier: 'Sélectionner un fournisseur',
          supplierItem: 'Article fournisseur',
          supplierItemPlaceholder: "Nom ou code de l'article du fournisseur",
          industrial: 'Industriel',
          unit: 'Unité',
          unitsPerPurchase: 'Unités par achat',
          price: 'Prix',
          pricePerUnit: 'Prix par unité',
          packedUnits: 'Unités emballées (Optionnel)',
          numberOfUnits: "Nombre d'unités",
          packingDimensions: "Dimensions d'emballage (L/l/H en cm) - Optionnel",
          length: 'Longueur',
          width: 'Largeur',
          height: 'Hauteur',
          cancel: 'Annuler',
          next: 'Suivant',
          back: 'Retour',
          addSupplierItem: 'Ajouter article fournisseur',
          addNewSupplier: 'Ajouter un fournisseur',
          supplierCreateSubtitle: 'Renseignez les informations de contact du fournisseur',
          sectionIdentity: 'Identité',
          supplierName: 'Nom du fournisseur',
          supplierEmail: 'Email',
          supplierPhone: 'Téléphone',
          supplierContactName: 'Nom du contact',
          supplierSpaces: 'Espaces',
          sectionContact: 'Contact',
          sectionLocation: 'Localisation',
          address: 'Adresse',
          city: 'Ville',
          postcode: 'Code postal',
          notes: 'Notes',
          sites: 'Sites',
          selectAll: 'Tout sélectionner',
          unselectAll: 'Tout désélectionner',
          addNotes: 'Notes supplémentaires sur ce fournisseur…',
          required: 'Champ requis',
          uploadPicture: 'Photo du fournisseur',
          supplierConfigurations: 'Configurations',
          supplierSectors: 'Secteurs',
          create: 'Créer',
          purchaseInfo: "Informations d'achat",
          inventoryInfo: 'Informations de stock',
          packingInfo: "Informations d'emballage",
          optional: 'Optionnel',
          itemIsPurchasedIn: "L'article est acheté en",
          forTheAmountOf: 'pour le montant de',
          itemIsStoredIn: "L'article est stocké en",
          selectPackaging: 'Sélectionner emballage',
          selectUnit: 'Sélectionner unité',
          of: 'de',
        },
      },
      unitOptions: ['kg', 'g', 'l', 'ml', 'cl', 'pcs', 'unit', 'box', 'bag', 'can'],

      // packaging inline creation
      localPackagingOptions: [],
      packagingCreateOpen: false,
      packagingCreateLoading: false,
      packagingCreateError: '',
      packagingCreateForm: { name: '' },
      packagingTargetField: 'purchasePackaging',

      // industrial inline creation
      industrialCreateOpen: false,
      industrialCreateLoading: false,
      industrialCreateError: '',
      industrialCreateValue: '',

      // supplier inline creation
      supplierCreateOpen: false,
      supplierCreateLoading: false,
      supplierCreateError: '',
      supplierImagePreview: '',
      extraSuppliers: [],
      _spaceConfigsCache: {},
      supplierCreateForm: {
        name: '',
        email: '',
        phone: '',
        contactName: '',
        address: '',
        city: '',
        postcode: '',
        notes: '',
        spaceIds: [],
        configurationIds: [],
        sectors: [],
        picture: '',
      },
      SUPPLIER_SECTORS: ['F&B', 'Hospitality', 'Merch', 'Ticketing', 'Access', 'Kitchen', 'Entertainment'],
    };
  },
  computed: {
    localOpen: {
      get() { return this.modelValue; },
      set(val) { this.$emit('update:modelValue', val); },
    },
    localSuppliers() {
      const ids = new Set(this.suppliers.map(s => s.id))
      const fresh = this.extraSuppliers.filter(s => !ids.has(s.id))
      return [...this.suppliers, ...fresh]
    },
    availableSpaces() {
      return this.$store.getters['spaces/spaces'] || []
    },
    isAllSpacesChecked() {
      return this.availableSpaces.length > 0 && this.supplierCreateForm.spaceIds.length === this.availableSpaces.length
    },
    supplierAvailableConfigs() {
      return this.supplierCreateForm.spaceIds.flatMap(spaceId =>
        this._spaceConfigsCache[spaceId] || []
      )
    },
    packagingCategoryItems() {
      const storePackingTypes = this.$store.getters['packingTypes/packingTypes'] || [];
      return storePackingTypes.map((p) => p.name).filter(Boolean);
    },
    industrialsOptions() {
      return this.$store.getters['industrials/industrials'] || [];
    },
    selectedTypeId() {
      const types = this.$store.getters['marketPriceTypes/marketPriceTypes'] || [];
      return types.find((t) => t.name === this.form.goodType)?.id || null;
    },
    selectedCategoryId() {
      return (this.productCategories || []).find((c) => c.name === this.form.category)?.id || null;
    },
    categoryOptions() {
      const list = (this.productCategories || []).map((c) => c?.name).filter(Boolean);
      return Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b)));
    },
    goodCategoryOptions() {
      const goodType = (this.form.goodType || '').toLowerCase();
      let base;
      if (goodType && this.productCategories && this.productCategories.length) {
        const filtered = this.productCategories
          .filter((c) => (c.typeName || '').toLowerCase() === goodType)
          .map((c) => c?.name)
          .filter(Boolean);
        base = filtered.length ? filtered : this.categoryOptions;
      } else {
        base = this.categoryOptions;
      }
      const extra = this.localGoodCategoryOptions.filter((o) => !base.includes(o));
      return [...base, ...extra];
    },
  },
  watch: {
    modelValue(val) {
      if (val) {
        this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes', { forceRefresh: true });
        this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true });
        this.$store.dispatch('packingTypes/fetchPackingTypes', { forceRefresh: true });
        this.$store.dispatch('industrials/fetchIndustrials', { forceRefresh: true });
        this.reset(this.initialData);
      }
    },
    packagingCategoryItems(newVal) {
      const merged = Array.from(new Set([...newVal, ...this.localPackagingOptions]));
      this.localPackagingOptions = merged;
    },
    'form.goodType'() {
      this.form.category = '';
    },
  },
  mounted() {
    window.addEventListener('locale-changed', this.handleLocaleChange);
  },
  beforeUnmount() {
    window.removeEventListener('locale-changed', this.handleLocaleChange);
  },
  methods: {
    t(key) {
      return this.translations[this.locale]?.[key] || key;
    },
    handleLocaleChange(event) {
      this.locale = event.detail?.locale || 'en';
    },
    _defaultForm() {
      return {
        itemName: '',
        unit: '',
        price: 0,
        goodType: 'Food',
        category: '',
        image: '',
        supplier: '',
        supplierId: '',
        supplierItem: '',
        industrialId: '',
        recipeUnit: '',
        purchaseUnitConversion: 1,
        pricePerUnit: 0,
        packedUnits: 0,
        numberOfUnits: 0,
        unitsPerPurchase: 0,
        packingWidth: 0,
        packingHeight: 0,
        packingLength: 0,
        purchasePackaging: '',
        inventoryPackaging: '',
      };
    },
    reset(initialData) {
      this.loading = false;
      this.error = '';
      this.formValid = false;
      this.imageFile = null;
      this.supplierCreateOpen = false;
      this.supplierCreateForm = { name: '', email: '', phone: '', contactName: '', spaceIds: [], configurationIds: [], sectors: [] };
      this.supplierCreateError = '';
      this.extraSuppliers = [];
      this.localGoodTypeOptions = [...(this.goodTypeOptions || [])];
      this.localPackagingOptions = [...this.packagingCategoryItems];
      this.packagingCreateOpen = false;
      this.packagingCreateLoading = false;
      this.packagingCreateError = '';
      this.packagingCreateForm = { name: '' };
      this.newTypeOpen = false;
      this.newTypeValue = '';
      this.newTypeLoading = false;
      this.newTypeError = '';
      this.localGoodCategoryOptions = [];
      this.newCategoryOpen = false;
      this.newCategoryValue = '';
      this.newCategoryLoading = false;
      this.newCategoryError = '';
      this.industrialCreateOpen = false;
      this.industrialCreateValue = '';
      this.industrialCreateLoading = false;
      this.industrialCreateError = '';

      if (initialData) {
        // Adding supplier to existing item — go to step 2
        this.step = 2;
        this.itemNameMode = 'select';
        this.imagePreview = initialData.image || '';
        this.form = {
          ...this._defaultForm(),
          itemName: String(initialData.name || initialData.itemName || '').trim(),
          goodType: initialData.goodType || initialData.type || 'Food',
          category: initialData.category || '',
          image: initialData.image || '',
          recipeUnit: initialData.recipeUnit || '',
          purchaseUnitConversion: Number(initialData.purchaseUnitConversion) > 0
            ? Number(initialData.purchaseUnitConversion)
            : 1,
        };
      } else {
        // New item — start at step 1
        this.step = 1;
        this.itemNameMode = this.existingItemNames.length ? 'select' : 'create';
        this.imagePreview = '';
        this.form = this._defaultForm();
      }
    },
    triggerImagePicker() {
      const input = this.$refs?.imageInput;
      if (input && typeof input.click === 'function') input.click();
    },
    onImageSelected(value) {
      const file = Array.isArray(value) ? value[0] : value;
      if (!file) return;
      this.imageFile = file;
      try {
        this.imagePreview = URL.createObjectURL(file);
      } catch (e) {
        this.imagePreview = '';
      }
      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          this.form.image = typeof reader.result === 'string' ? reader.result : '';
        };
        reader.readAsDataURL(file);
      } catch (e) {
        this.form.image = '';
      }
    },
    goNextStep() {
      const name = String(this.form.itemName || '').trim();
      if (!name) {
        this.error = 'Item Name is required';
        return;
      }
      if (!this.form.goodType) {
        this.error = 'Good Type is required';
        return;
      }
      this.error = '';
      this.step = 2;
      this.recomputePricePerUnit();
    },
    goBackStep() {
      this.error = '';
      this.step = 1;
    },
    recomputePricePerUnit() {
      const raw = String(this.form.price ?? '').replace(',', '.');
      const price = parseFloat(raw) || 0;
      const units = Number(this.form.unitsPerPurchase) || 0;
      const value = units > 0 ? price / units : 0;
      this.form.pricePerUnit = Number.isFinite(value) ? value : 0;
    },
    toggleAllSpaces() {
      this.supplierCreateForm.spaceIds = this.isAllSpacesChecked ? [] : this.availableSpaces.map(s => s.id)
    },
    async onSupplierSpacesChange(newSpaceIds) {
      // Fetch configurations for newly selected spaces and store results locally
      await Promise.allSettled(
        newSpaceIds.map(async (spaceId) => {
          const rows = await this.$store.dispatch('spaceConfigurations/fetchForSpace', { spaceId }).catch(() => [])
          if (Array.isArray(rows)) {
            this._spaceConfigsCache = { ...this._spaceConfigsCache, [spaceId]: rows }
          }
        })
      )
      // Remove configurationIds that no longer belong to a selected space
      const validConfigIds = new Set(
        newSpaceIds.flatMap(spaceId =>
          (this._spaceConfigsCache[spaceId] || []).map(c => c.id)
        )
      )
      this.supplierCreateForm.configurationIds = this.supplierCreateForm.configurationIds.filter(id => validConfigIds.has(id))
    },
    async confirmIndustrialCreate() {
      const name = this.industrialCreateValue.trim();
      if (!name) return;
      this.industrialCreateLoading = true;
      this.industrialCreateError = '';
      try {
        const res = await createIndustrial({ name });
        const id = res?.id || res?._id;
        if (!id) throw new Error('Industrial creation failed');
        this.$store.dispatch('industrials/addIndustrial', { ...res, id });
        this.$store.dispatch('industrials/fetchIndustrials', { forceRefresh: true });
        this.form.industrialId = id;
        this.industrialCreateValue = '';
        this.industrialCreateOpen = false;
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '';
        const msgStr = Array.isArray(msg) ? msg.join(', ') : String(msg);
        this.industrialCreateError = msgStr.includes('Unique constraint')
          ? (this.locale === 'fr' ? `Un industriel "${name}" existe déjà.` : `An industrial "${name}" already exists.`)
          : msgStr || (this.locale === 'fr' ? 'Échec de la création.' : 'Creation failed.');
      } finally {
        this.industrialCreateLoading = false;
      }
    },
    onPackagingSelectChange(field, e) {
      if (e.target.value === '__add_packaging__') {
        this.form[field] = '';
        this.packagingTargetField = field;
        this.packagingCreateOpen = true;
      }
    },
    async submitPackagingCreate() {
      const name = this.packagingCreateForm.name.trim();
      if (!name) return;
      this.packagingCreateLoading = true;
      this.packagingCreateError = '';
      try {
        const res = await createPackingType({ name });
        const id = res?.id || res?._id;
        if (!id) throw new Error('Packing type creation failed');

        this.$store.dispatch('packingTypes/addPackingType', { ...res, id });
        this.$store.dispatch('packingTypes/fetchPackingTypes', { forceRefresh: true });

        if (!this.localPackagingOptions.includes(name)) {
          this.localPackagingOptions = [...this.localPackagingOptions, name];
        }
        this.form[this.packagingTargetField] = name;
        this.packagingCreateOpen = false;
        this.packagingCreateForm = { name: '' };
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '';
        const msgStr = Array.isArray(msg) ? msg.join(', ') : String(msg);
        this.packagingCreateError = msgStr.includes('Unique constraint')
          ? (this.locale === 'fr' ? `Un packing type "${name}" existe déjà.` : `A packing type "${name}" already exists.`)
          : msgStr || (this.locale === 'fr' ? 'Échec de la création.' : 'Creation failed.');
      } finally {
        this.packagingCreateLoading = false;
      }
    },
    async confirmNewType() {
      const name = this.newTypeValue.trim();
      if (!name) return;
      this.newTypeLoading = true;
      this.newTypeError = '';
      try {
        const res = await createMarketPriceType({ name });
        const id = res?.id || res?._id;
        if (!id) throw new Error('Type creation failed');
        await this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes', { forceRefresh: true });
        if (!this.localGoodTypeOptions.includes(name)) {
          this.localGoodTypeOptions = [...this.localGoodTypeOptions, name];
        }
        this.form.goodType = name;
        this.newTypeValue = '';
        this.newTypeOpen = false;
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '';
        const msgStr = Array.isArray(msg) ? msg.join(', ') : String(msg);
        if (msgStr.includes('Unique constraint')) {
          await this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes', { forceRefresh: true });
          if (!this.localGoodTypeOptions.includes(name)) {
            this.localGoodTypeOptions = [...this.localGoodTypeOptions, name];
          }
          this.form.goodType = name;
          this.newTypeValue = '';
          this.newTypeOpen = false;
        } else {
          this.newTypeError = msgStr || (this.locale === 'fr' ? 'Échec de la création.' : 'Creation failed.');
        }
      } finally {
        this.newTypeLoading = false;
      }
    },
    async confirmNewCategory() {
      const name = this.newCategoryValue.trim();
      if (!name) return;
      if (!this.selectedTypeId) {
        this.newCategoryError = this.locale === 'fr'
          ? 'Choisis d\'abord un Good Type.'
          : 'Pick a Good Type first.';
        return;
      }
      this.newCategoryLoading = true;
      this.newCategoryError = '';
      try {
        await createMarketPriceCategory({ name, typeId: this.selectedTypeId });
        await this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true });
        if (!this.localGoodCategoryOptions.includes(name)) {
          this.localGoodCategoryOptions = [...this.localGoodCategoryOptions, name];
        }
        this.form.category = name;
        this.newCategoryValue = '';
        this.newCategoryOpen = false;
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '';
        const msgStr = Array.isArray(msg) ? msg.join(', ') : String(msg);
        if (msgStr.includes('Unique constraint')) {
          await this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true });
          this.form.category = name;
          this.newCategoryValue = '';
          this.newCategoryOpen = false;
        } else {
          this.newCategoryError = msgStr || (this.locale === 'fr' ? 'Échec de la création.' : 'Creation failed.');
        }
      } finally {
        this.newCategoryLoading = false;
      }
    },
    async submitSupplierCreate() {
      const name = this.supplierCreateForm.name.trim()
      const email = this.supplierCreateForm.email.trim()
      const contactName = this.supplierCreateForm.contactName.trim()
      const required = [
        { key: 'name', label: this.t('supplierName') },
        { key: 'contactName', label: this.t('supplierContactName') },
        { key: 'email', label: this.t('supplierEmail') },
        { key: 'phone', label: this.t('supplierPhone') },
        { key: 'address', label: this.t('address') },
        { key: 'city', label: this.t('city') },
        { key: 'postcode', label: this.t('postcode') },
      ]
      for (const field of required) {
        if (!String(this.supplierCreateForm[field.key] || '').trim()) {
          this.supplierCreateError = `${field.label} — ${this.t('required')}`
          return
        }
      }
      if (!this.supplierCreateForm.spaceIds.length) {
        this.supplierCreateError = this.locale === 'fr'
          ? 'Veuillez sélectionner au moins un site *'
          : 'Please select at least one site *'
        return
      }
      this.supplierCreateLoading = true
      this.supplierCreateError = ''
      try {
        const payload = {
          name,
          email,
          phone: this.supplierCreateForm.phone.trim(),
          contactName,
          address: this.supplierCreateForm.address.trim(),
          city: this.supplierCreateForm.city.trim(),
          postcode: this.supplierCreateForm.postcode.trim(),
          notes: this.supplierCreateForm.notes.trim() || undefined,
          spaceIds: this.supplierCreateForm.spaceIds,
          configurationIds: this.supplierCreateForm.configurationIds,
          sectors: this.supplierCreateForm.sectors,
          picture: this.supplierCreateForm.picture || undefined,
        }
        const res = await createSupplier(payload)
        const created = res?.data || res
        const newSupplier = { id: created?.id || created?._id, name: created?.name || name, ...created }
        this.extraSuppliers = [...this.extraSuppliers, newSupplier]
        this.$store.dispatch('suppliers/addSupplier', newSupplier)
        this.form.supplierId = newSupplier.id
        this.supplierCreateOpen = false
        this.supplierCreateForm = { name: '', email: '', phone: '', contactName: '', address: '', city: '', postcode: '', notes: '', spaceIds: [], configurationIds: [], sectors: [], picture: '' }
        this.clearSupplierPicture()
      } catch (err) {
        this.supplierCreateError = err?.response?.data?.message || err?.message || 'Échec de la création'
      } finally {
        this.supplierCreateLoading = false
      }
    },
    // ── Upload photo du fournisseur (dialog création) ──
    triggerSupplierPicture() {
      this.$refs?.supplierPictureInput?.click()
    },
    async onSupplierPictureSelected(e) {
      const file = e?.target?.files?.[0] || null
      this.clearSupplierPicture()
      if (!file) return
      this.supplierImagePreview = URL.createObjectURL(file)
      try {
        this.supplierCreateForm.picture = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(new Error('FileReader error'))
          reader.readAsDataURL(file)
        })
      } catch {
        this.supplierCreateForm.picture = ''
      }
    },
    clearSupplierPicture() {
      if (this.supplierImagePreview && String(this.supplierImagePreview).startsWith('blob:')) {
        URL.revokeObjectURL(this.supplierImagePreview)
      }
      this.supplierImagePreview = ''
      this.supplierCreateForm.picture = ''
      if (this.$refs?.supplierPictureInput) this.$refs.supplierPictureInput.value = ''
    },
    close() {
      this.$emit('update:modelValue', false);
    },
    async submit() {
      this.loading = true;
      this.error = '';
      try {
        const requiredErrors = [];
        if (!String(this.form.itemName || '').trim()) requiredErrors.push('Item Name is required');
        if (!this.form.goodType) requiredErrors.push('Good Type is required');
        if (!this.form.supplierId) requiredErrors.push('Supplier is required');
        if (!String(this.form.supplierItem || '').trim()) requiredErrors.push('Supplier Item is required');
        if (!String(this.form.unit || '').trim()) requiredErrors.push('Unit is required');
        if (!(Number(this.form.unitsPerPurchase) > 0)) requiredErrors.push('Units Per Purchase is required');
        if (!(Number(this.form.price) >= 0)) requiredErrors.push('Price is required');
        if (requiredErrors.length) {
          this.error = requiredErrors[0];
          return;
        }

        this.recomputePricePerUnit();
        const payload = {
          itemName: String(this.form.itemName || '').trim(),
          unit: this.form.unit,
          price: Number(this.form.price) || 0,
          goodType: this.form.goodType,
          marketPriceTypeId: this.selectedTypeId,
          category: this.form.category,
          marketPriceCategoryId: this.selectedCategoryId,
          image: this.form.image,
          supplierId: this.form.supplierId,
          supplierItem: this.form.supplierItem,
          industrialId: this.form.industrialId || null,
          recipeUnit: this.form.recipeUnit,
          purchasePackaging: this.form.purchasePackaging || '',
          inventoryPackaging: this.form.inventoryPackaging || '',
          unitsPerPurchase: Number(this.form.unitsPerPurchase) || 0,
          pricePerUnit: Number(this.form.pricePerUnit) || 0,
          packedUnits: Number(this.form.packedUnits) || 0,
          numberOfUnits: Number(this.form.numberOfUnits) || 0,
          packingWidth: Number(this.form.packingWidth) || 0,
          packingHeight: Number(this.form.packingHeight) || 0,
          packingLength: Number(this.form.packingLength) || 0,
          purchasePackaging: this.form.purchasePackaging || '',
          inventoryPackaging: this.form.inventoryPackaging || '',
        };

        await createMarketPrice(payload);
        this.$store.dispatch('marketPriceIngredients/invalidate');
        this.$emit('created');
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || 'Failed to create market price';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.mpcd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}

.mpcd-panel {
  width: 520px;
  height: 100%;
  background: #ffffff;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.mpcd-enter-active,
.mpcd-leave-active {
  transition: opacity 0.25s ease;
}
.mpcd-enter-active .mpcd-panel,
.mpcd-leave-active .mpcd-panel {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.mpcd-enter-from,
.mpcd-leave-to {
  opacity: 0;
}
.mpcd-enter-from .mpcd-panel,
.mpcd-leave-to .mpcd-panel {
  transform: translateX(100%);
}

/* === Gradient Header === */
.mpcd__grad-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: #ff3131;
  flex-shrink: 0;
}
.mpcd__header-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mpcd__header-titles { flex: 1; min-width: 0; }
.mpcd__header-title { font-size: 15px; font-weight: 700; color: #fff; line-height: 1.2; }
.mpcd__header-subtitle { font-size: 12px; color: rgba(255,255,255,.72); margin-top: 3px; }
.mpcd__close-btn {
  width: 32px; height: 32px; border: none; border-radius: 8px;
  background: rgba(255,255,255,.18); color: rgba(255,255,255,.85);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .18s; flex-shrink: 0; margin-left: auto;
}
.mpcd__close-btn:hover { background: rgba(255,255,255,.3); }

/* === Error === */
.mpcd__error {
  display: flex; align-items: center; padding: 10px 24px;
  background: #fef2f2; border-bottom: 1px solid #fecaca;
  font-size: 13px; color: #ff3131; flex-shrink: 0;
}

.mpcd__content {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

/* === Sections === */
.mpcd-section {
  padding: 18px 24px;
  border-bottom: 1px solid #f3f4f6;
}
.mpcd-section:last-child { border-bottom: none; }
.mpcd-section__label {
  display: flex; align-items: center;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .9px; color: #9ca3af; margin-bottom: 14px;
}

/* === Bootstrap inputs === */
.mpcd-input.form-control,
.mpcd-select.form-select {
  border-radius: 11px;
  border: 1.5px solid #e5e7eb;
  font-size: 13.5px;
  color: #111827;
  padding: .65rem .8rem;
  background: #fafafa;
  transition: border-color .2s, box-shadow .2s;
}
.mpcd-input.form-control:focus,
.mpcd-select.form-select:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1);
  background: #fff;
  outline: none;
}
.mpcd-field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.mpcd-field-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #374151;
}
.mpcd-required { color: #ff3131; }
.mpcd-label {
  font-size: 13px; font-weight: 600; color: #374151; display: block;
}
/* === Mode tabs === */
.mpcd-mode-tabs {
  display: flex;
  background: #f3f4f6;
  border-radius: 12px;
  padding: 4px;
  gap: 4px;
}
.mpcd-mode-tab {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 14px; border-radius: 9px; border: none;
  font-size: 13.5px; font-weight: 600; cursor: pointer;
  background: transparent; color: #6b7280;
  transition: all .2s;
}
.mpcd-mode-tab--active {
  background: #fff; color: #ff3131;
  box-shadow: 0 2px 8px rgba(0,0,0,.12);
}
.mpcd-mode-tab:hover:not(.mpcd-mode-tab--active) {
  background: rgba(255,255,255,.5); color: #374151;
}

/* === Item Name select field === */
.mpcd-select-field {
  position: relative;
}
.mpcd-select-field__label {
  position: absolute;
  top: -9px;
  left: 12px;
  font-size: 10.5px;
  font-weight: 700;
  color: #374151;
  background: #fff;
  padding: 0 4px;
  border-radius: 4px;
  z-index: 1;
  pointer-events: none;
  letter-spacing: .2px;
}
.mpcd-item-select :deep(.v-field) {
  border-radius: 11px !important;
  border: 1.5px solid #e5e7eb !important;
  background: #fafafa !important;
  box-shadow: none !important;
}
.mpcd-item-select :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1) !important;
  background: #fff !important;
}
.mpcd-item-select :deep(.v-field__outline) { display: none !important; }
.mpcd-item-select :deep(.v-field__input) { font-size: 13.5px !important; color: #111827 !important; }
.mpcd-item-select :deep(.v-select__selection-text) { font-size: 13.5px !important; }

/* === Step 2 content padding === */
.mpcd-step2-wrap {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* === Inline inputs (info-card sentences) === */
.mpcd-inline-input,
.mpcd-inline-select {
  border: 1.5px solid #dbeafe;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 13px;
  color: #1e3a5f;
  background: #fff;
  transition: border-color .15s, box-shadow .15s;
}
.mpcd-inline-input:focus,
.mpcd-inline-select:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37,99,235,.1);
  outline: none;
}

/* === Footer === */
.mpcd__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
  flex-shrink: 0;
}
.mpcd-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 22px; border-radius: 100px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all .2s; border: none; line-height: 1.4;
}
.mpcd-btn:disabled { opacity: .45; cursor: not-allowed; }
.mpcd-btn--cancel {
  background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280;
}
.mpcd-btn--cancel:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; color: #374151; }
.mpcd-btn--back {
  background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280;
}
.mpcd-btn--back:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; color: #374151; }
.mpcd-btn--primary {
  background: #ff3131;
  color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49,.3);
}
.mpcd-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }

.market-picture-upload {
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  min-height: 180px;
  background: #f9fafb;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.market-picture-upload:hover {
  border-color: #ff3131;
  background: #fef2f2;
}

.market-picture-upload.has-image {
  border-style: solid;
  border-color: #e5e7eb;
  background: white;
  min-height: 160px;
}

.picture-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  text-align: center;
}

.picture-placeholder p {
  color: #1f2937 !important;
}

.picture-placeholder .text-medium-emphasis {
  color: #6b7280 !important;
}

.upload-icon-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.picture-preview {
  position: relative;
  width: 100%;
  height: 100%;
}

.picture-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  border-radius: 8px;
}

.picture-preview:hover .picture-overlay {
  opacity: 1;
}

/* Dark mode overrides */
.mpcd--dark.mpcd-panel {
  background: #111827;
}

.mpcd--dark .mpcd__header,
.mpcd--dark .mpcd__footer {
  background: #1f2937 !important;
  border-color: #2d3f55 !important;
}

.mpcd--dark .mpcd__content {
  background: #111827;
}

.mpcd--dark .market-picture-upload {
  border-color: #2d3f55;
  background: #1f2937;
}

.mpcd--dark .market-picture-upload:hover {
  border-color: #ff3131;
  background: #1a1a2e;
}

.mpcd--dark .market-picture-upload.has-image {
  background: #263548;
  border-color: #2d3f55;
}

.mpcd--dark .picture-placeholder p {
  color: #e5e7eb !important;
}

.mpcd--dark .picture-placeholder .text-medium-emphasis {
  color: #9ca3af !important;
}

.mpcd--dark :deep(.v-field) {
  background-color: #263548 !important;
}

.mpcd--dark :deep(.v-field__input),
.mpcd--dark :deep(input),
.mpcd--dark :deep(textarea) {
  color: #e5e7eb !important;
}

.mpcd--dark :deep(.v-select__selection-text) {
  color: #e5e7eb !important;
}

/* ── Info cards (Purchase / Inventory Information) ── */
.info-card {
  background: linear-gradient(135deg, #eff6ff 0%, #e0effe 100%);
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 12px;
}

.info-card__title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 14px;
  color: #1e40af;
}

.info-card__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.info-label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
}

.info-label--dot {
  font-size: 18px;
  font-weight: 700;
  color: #6b7280;
  line-height: 1;
}

/* Tailles fixes pour les champs */
.info-card__select {
  min-width: 148px;
  max-width: 168px;
  flex-shrink: 0;
}

.info-card__input-sm {
  width: 72px;
  flex-shrink: 0;
}

.info-card__input-md {
  width: 108px;
  flex-shrink: 0;
}

.info-card__unit {
  min-width: 86px;
  max-width: 110px;
  flex-shrink: 0;
}

.info-card__unit-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #bfdbfe;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  color: #1e40af;
  white-space: nowrap;
}

.mpcd--dark .info-card__unit-badge {
  background: rgba(30, 58, 95, 0.8);
  border-color: #2d4f7a;
  color: #93c5fd;
}

/* Dark mode */
.mpcd--dark .info-card {
  background: linear-gradient(135deg, #1e3a5f 0%, #1a3351 100%);
  border-color: #2d4f7a;
}

.mpcd--dark .info-card__title {
  color: #93c5fd;
}

.mpcd--dark .info-label {
  color: #cbd5e1;
}

.mpcd--dark .info-label--dot {
  color: #64748b;
}

/* ── Supplier Create Dialog ── */
.sc-dialog {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.14);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.sc-dialog__header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 22px;
  background: linear-gradient(135deg, #fff5f5 0%, #fff 60%);
  border-bottom: 1px solid #f3f4f6;
}

.sc-dialog__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #ff3131 0%, #e84444 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(255, 49, 49, 0.3);
}

.sc-dialog__titles {
  flex: 1;
  min-width: 0;
}

.sc-dialog__title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
}

.sc-dialog__subtitle {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 3px;
}

.sc-dialog__close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
  flex-shrink: 0;
}
.sc-dialog__close:hover:not(:disabled) {
  background: #f3f4f6;
  color: #374151;
}
.sc-dialog__close:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sc-dialog__alert {
  margin: 14px 22px 0;
  padding: 10px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  font-size: 12.5px;
  color: #ff3131;
  display: flex;
  align-items: center;
}

.sc-dialog__body {
  padding: 20px 22px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
  scrollbar-width: thin;
  scrollbar-color: #e5e7eb transparent;
}
.sc-dialog__body::-webkit-scrollbar {
  width: 4px;
}
.sc-dialog__body::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 4px;
}

.sc-section__label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: #9ca3af;
  margin-bottom: 12px;
}

.sc-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sc-site-count {
  font-weight: 500;
  color: #9ca3af;
}
.sc-toggle-all {
  background: none;
  border: none;
  color: #ff3131;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.sc-toggle-all:hover { text-decoration: underline; }

/* Bootstrap floating inputs */
.sc-input.form-control {
  border-radius: 10px;
  border: 1.5px solid #e5e7eb;
  font-size: 13px;
  color: #111827;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: #fafafa;
  padding: .6rem .75rem;
  height: auto;
  min-height: auto;
  line-height: 1.4;
}
.sc-input.form-control:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
  background: #fff;
}
.sc-required {
  color: #ff3131;
}

/* Pill checkboxes (Spaces / Configurations) */
.sc-pill-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Zone d'upload photo (dialogue de création fournisseur) */
.sc-photo {
  position: relative;
  width: 100%;
  min-height: 150px;
  border: 2px dashed #e5e7eb;
  border-radius: 16px;
  background: #fafafa;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: border-color .18s, background .18s;
}
.sc-photo:hover { border-color: #ff3131; background: #fff5f5; }
.sc-photo__img { width: 100%; height: 100%; max-height: 220px; object-fit: cover; }
.sc-photo__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 22px;
  text-align: center;
}
.sc-photo__icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #fef2f2;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sc-photo__label {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}
.sc-photo__hint {
  font-size: 12px;
  color: #9ca3af;
}
.sc-photo__remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, .92);
  color: #ff3131;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .15);
}

.sc-check-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 13px;
  border-radius: 100px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.18s, background 0.18s, color 0.18s, box-shadow 0.18s;
}
.sc-check-pill:hover {
  border-color: #ff3131;
  color: #ff3131;
  background: #fff5f5;
}
.sc-check-pill--active {
  border-color: #ff3131;
  background: #fef2f2;
  color: #ff3131;
  font-weight: 600;
  box-shadow: 0 0 0 2px rgba(255, 49, 49, 0.12);
}

.sc-check-pill__check {
  opacity: 0;
  transition: opacity 0.15s;
  font-size: 12px;
}
.sc-check-pill--active .sc-check-pill__check {
  opacity: 1;
}

/* Sector pills (solid on active) */
.sc-sector-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 100px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  user-select: none;
  transition: all 0.18s;
}
.sc-sector-pill:hover {
  border-color: #ff3131;
  color: #ff3131;
  background: #fff5f5;
}
.sc-sector-pill--active {
  background: #ff3131;
  border-color: #ff3131;
  color: #fff;
  font-weight: 600;
  box-shadow: 0 3px 10px rgba(255, 49, 49, 0.28);
}

/* Footer */
.sc-dialog__footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  padding: 16px 22px;
  border-top: 1px solid #f3f4f6;
  background: #fafafa;
}

.sc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 22px;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  line-height: 1.4;
}
.sc-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.sc-btn--cancel {
  background: transparent;
  border: 1.5px solid #e5e7eb;
  color: #6b7280;
}
.sc-btn--cancel:hover:not(:disabled) {
  border-color: #9ca3af;
  color: #374151;
  background: #f3f4f6;
}

.sc-btn--create {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49, 0.32);
}
.sc-btn--create:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 49, 49, 0.42);
  transform: translateY(-1px);
}
.sc-btn--create:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.3);
}

/* Transition for configurations section */
.sc-fade-enter-active,
.sc-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.sc-fade-enter-from,
.sc-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* No packaging type alert */
.mpcd-no-type-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 14px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
}

/* Mini-dialog for inline type creation */
.mpcd-mini-dialog {
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,.15);
  overflow: hidden;
  min-width: 280px;
}
.mpcd-mini-dialog__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 12px;
  background: #ff3131;
  color: #fff;
}
.mpcd-mini-dialog__title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
}
.mpcd-mini-dialog__close {
  background: none;
  border: none;
  color: rgba(255,255,255,.8);
  cursor: pointer;
  padding: 2px;
  line-height: 1;
}
.mpcd-mini-dialog__close:hover { color: #fff; }
.mpcd-mini-dialog__body {
  padding: 16px;
}
.mpcd-mini-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 16px 14px;
}
</style>
