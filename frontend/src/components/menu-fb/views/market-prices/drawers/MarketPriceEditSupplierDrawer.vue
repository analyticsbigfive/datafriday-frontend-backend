<template>
  <Teleport to="body">
    <Transition name="mpesd">
      <div v-if="localOpen" class="mpesd-overlay" @mousedown.self="close">
        <div class="mpesd-panel" :class="{ 'mpesd-panel--dark': isDark }">

          <!-- Gradient Header -->
          <div class="mpesd__grad-header">
            <div class="mpesd__header-icon"><Pencil :size="22" color="white" /></div>
            <div class="mpesd__header-titles">
              <div class="mpesd__header-title">{{ t('editSupplierItem') }}</div>
              <div class="mpesd__header-subtitle">{{ t('editSupplierSubtitle') }}</div>
            </div>
            <button class="mpesd__close-btn" :disabled="loading" @click="close"><X :size="18" /></button>
          </div>

          <!-- Error -->
          <div v-if="error" class="mpesd__error">
            <AlertCircle :size="14" class="me-2" style="flex-shrink:0" />{{ error }}
          </div>

          <!-- Content -->
          <div class="mpesd-content">

            <!-- Supplier Item Name -->
            <div class="mpesd-field-row" style="margin-bottom: 14px;">
              <label for="mpesd-supplierItem" class="mpesd-field-label">{{ t('supplierItemName') }} <span class="mpesd-required">*</span></label>
              <input id="mpesd-supplierItem" v-model="form.supplierItem" type="text" class="form-control mpesd-input" />
            </div>

            <!-- Item Name (read-only) -->
            <div class="mpesd-field-row" style="margin-bottom: 14px;">
              <label for="mpesd-itemName" class="mpesd-field-label">{{ t('itemName') }} <span class="mpesd-required">*</span></label>
              <input id="mpesd-itemName" :value="form.itemName" type="text" class="form-control mpesd-input mpesd-input--readonly" readonly />
            </div>

            <!-- Supplier -->
            <div class="mpesd-field-row" style="margin-bottom: 14px;">
              <label class="mpesd-field-label">{{ t('supplier') }} <span class="mpesd-required">*</span></label>
              <v-select
                v-model="form.supplierId"
                :items="localSuppliers"
                item-title="name"
                item-value="id"
                density="compact"
                variant="outlined"
                hide-details
                :menu-props="{ attach: 'body', zIndex: 10001 }"
                class="mpesd-item-select"
              >
                <template #prepend-item>
                  <v-list-item style="color:#ff3131; font-weight:600;" @click.stop="supplierCreateOpen = true">
                    <template #prepend><PlusCircle :size="16" class="me-2" style="color:#ff3131" /></template>
                    <v-list-item-title>{{ t('addSupplier') }}</v-list-item-title>
                  </v-list-item>
                  <v-divider class="my-1" />
                </template>
              </v-select>
            </div>

            <!-- Dialog — création fournisseur -->
            <v-dialog v-model="supplierCreateOpen" max-width="540" :z-index="11000">
              <div class="mpesd-mini-dialog" :class="{ 'mpesd-mini-dialog--dark': isDark }">
                <div class="mpesd-mini-dialog__header">
                  <Truck :size="18" color="white" />
                  <span>{{ t('addSupplier') }}</span>
                  <button class="mpesd-mini-dialog__close" @click="supplierCreateOpen = false"><X :size="16" /></button>
                </div>
                <div v-if="supplierCreateError" class="mpesd-mini-dialog__error">{{ supplierCreateError }}</div>
                <div class="mpesd-mini-dialog__body">
                  <!-- Photo du fournisseur -->
                  <input ref="supplierPictureInput" type="file" accept="image/*" class="d-none" @change="onSupplierPictureSelected" />
                  <div class="mpesd-sc-photo" @click="triggerSupplierPicture">
                    <template v-if="supplierImagePreview">
                      <img :src="supplierImagePreview" alt="" class="mpesd-sc-photo__img" />
                      <button type="button" class="mpesd-sc-photo__remove" @click.stop="clearSupplierPicture"><X :size="14" /></button>
                    </template>
                    <div v-else class="mpesd-sc-photo__placeholder">
                      <div class="mpesd-sc-photo__icon">
                        <ImagePlus :size="30" style="color:#ff3131" />
                      </div>
                      <span class="mpesd-sc-photo__label">{{ t('uploadPicture') }}</span>
                      <span class="mpesd-sc-photo__hint">{{ t('fileFormat') }}</span>
                    </div>
                  </div>

                  <!-- Identité -->
                  <div class="mpesd-sc-section">
                    <div class="mpesd-sc-section__label">{{ t('sectionIdentity') }}</div>
                    <div class="mpesd-field-row mb-3">
                      <label for="mpesd-sc-name" class="mpesd-field-label">{{ t('supplierName') }} <span class="mpesd-required">*</span></label>
                      <input id="mpesd-sc-name" v-model="supplierCreateForm.name" type="text" class="form-control mpesd-input" autofocus @keyup.enter="supplierCreateForm.name.trim() && submitSupplierCreate()" />
                    </div>
                    <div class="mpesd-field-row">
                      <label for="mpesd-sc-contact" class="mpesd-field-label">{{ t('supplierContactName') }} <span class="mpesd-required">*</span></label>
                      <input id="mpesd-sc-contact" v-model="supplierCreateForm.contactName" type="text" class="form-control mpesd-input" />
                    </div>
                  </div>

                  <!-- Contact -->
                  <div class="mpesd-sc-section">
                    <div class="mpesd-sc-section__label">{{ t('sectionContact') }}</div>
                    <div class="row g-2">
                      <div class="col-6">
                        <div class="mpesd-field-row">
                          <label for="mpesd-sc-email" class="mpesd-field-label">{{ t('email') }} <span class="mpesd-required">*</span></label>
                          <input id="mpesd-sc-email" v-model="supplierCreateForm.email" type="email" class="form-control mpesd-input" />
                        </div>
                      </div>
                      <div class="col-6">
                        <div class="mpesd-field-row">
                          <label for="mpesd-sc-phone" class="mpesd-field-label">{{ t('phone') }} <span class="mpesd-required">*</span></label>
                          <input id="mpesd-sc-phone" v-model="supplierCreateForm.phone" type="tel" class="form-control mpesd-input" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Localisation -->
                  <div class="mpesd-sc-section">
                    <div class="mpesd-sc-section__label">{{ t('sectionLocation') }}</div>
                    <div class="mpesd-field-row mb-3">
                      <label for="mpesd-sc-address" class="mpesd-field-label">{{ t('address') }} <span class="mpesd-required">*</span></label>
                      <input id="mpesd-sc-address" v-model="supplierCreateForm.address" type="text" class="form-control mpesd-input" />
                    </div>
                    <div class="row g-2">
                      <div class="col-7">
                        <div class="mpesd-field-row">
                          <label for="mpesd-sc-city" class="mpesd-field-label">{{ t('city') }} <span class="mpesd-required">*</span></label>
                          <input id="mpesd-sc-city" v-model="supplierCreateForm.city" type="text" class="form-control mpesd-input" />
                        </div>
                      </div>
                      <div class="col-5">
                        <div class="mpesd-field-row">
                          <label for="mpesd-sc-postcode" class="mpesd-field-label">{{ t('postcode') }} <span class="mpesd-required">*</span></label>
                          <input id="mpesd-sc-postcode" v-model="supplierCreateForm.postcode" type="text" class="form-control mpesd-input" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Sites -->
                  <div v-if="availableSpaces.length > 0" class="mpesd-sc-section">
                    <div class="mpesd-sc-section__header">
                      <div class="mpesd-sc-section__label mb-0">
                        {{ t('sites') }} <span class="mpesd-required">*</span>
                        <span class="mpesd-sc-site-count">({{ supplierCreateForm.spaceIds.length }}/{{ availableSpaces.length }})</span>
                      </div>
                      <button class="mpesd-sc-toggle-all" @click="toggleAllSpaces">
                        {{ isAllSpacesChecked ? t('unselectAll') : t('selectAll') }}
                      </button>
                    </div>
                    <div class="mpesd-pill-grid">
                      <label
                        v-for="space in availableSpaces"
                        :key="space.id"
                        class="mpesd-check-pill"
                        :class="{ 'mpesd-check-pill--active': supplierCreateForm.spaceIds.includes(space.id) }"
                      >
                        <input type="checkbox" :value="space.id" v-model="supplierCreateForm.spaceIds" class="visually-hidden" />
                        <Check :size="12" class="mpesd-check-pill__check" />
                        {{ space.name }}
                      </label>
                    </div>
                  </div>

                  <!-- Notes -->
                  <div class="mpesd-sc-section">
                    <div class="mpesd-sc-section__label">{{ t('notes') }}</div>
                    <textarea id="mpesd-sc-notes" v-model="supplierCreateForm.notes" class="form-control mpesd-input" rows="3" :placeholder="t('addNotes')"></textarea>
                  </div>
                </div>
                <div class="mpesd-mini-dialog__footer">
                  <button class="mpesd-btn mpesd-btn--cancel" :disabled="supplierCreateLoading" @click="supplierCreateOpen = false">{{ t('cancel') }}</button>
                  <button class="mpesd-btn mpesd-btn--save" :disabled="!supplierCreateForm.name.trim() || supplierCreateLoading" @click="submitSupplierCreate">
                    <span v-if="supplierCreateLoading" class="spinner-border spinner-border-sm me-2"></span>
                    <Check v-else :size="14" class="me-1" />
                    {{ t('create') }}
                  </button>
                </div>
              </div>
            </v-dialog>

            <!-- Good Type -->
            <div class="mpesd-field-row" style="margin-bottom: 14px;">
              <label class="mpesd-field-label">{{ t('goodType') }} <span class="mpesd-required">*</span></label>
              <v-select
                v-model="form.goodType"
                :items="localGoodTypeOptions"
                density="compact"
                variant="outlined"
                hide-details
                clearable
                :menu-props="{ attach: 'body', zIndex: 10001 }"
                class="mpesd-item-select"
              >
                <template #prepend-item>
                  <v-list-item style="color:#ff3131; font-weight:600;" @click.stop="goodTypeCreateOpen = true">
                    <template #prepend><PlusCircle :size="16" class="me-2" style="color:#ff3131" /></template>
                    <v-list-item-title>{{ t('addGoodType') }}</v-list-item-title>
                  </v-list-item>
                  <v-divider class="my-1" />
                </template>
              </v-select>
            </div>

            <!-- Dialog partagé « Add Good Type » (extrait — voir composant) -->
            <MarketPriceNewTypeDialog
              v-model="goodTypeCreateOpen"
              :is-dark="isDark"
              @created="onGoodTypeCreated"
            />

            <!-- Good Category -->
            <div class="mpesd-field-row" style="margin-bottom: 14px;">
              <label class="mpesd-field-label">{{ t('goodCategory') }}</label>
              <v-select
                v-model="form.category"
                :items="goodCategoryOptions"
                density="compact"
                variant="outlined"
                hide-details
                clearable
                :disabled="!form.goodType"
                :menu-props="{ attach: 'body', zIndex: 10001 }"
                class="mpesd-item-select"
              >
                <template #prepend-item>
                  <v-list-item style="color:#ff3131; font-weight:600;" @click.stop="goodCategoryCreateOpen = true">
                    <template #prepend><PlusCircle :size="16" class="me-2" style="color:#ff3131" /></template>
                    <v-list-item-title>{{ t('addCategory') }}</v-list-item-title>
                  </v-list-item>
                  <v-divider class="my-1" />
                </template>
              </v-select>
            </div>

            <!-- Dialog partagé « Add Category » (extrait — voir composant) -->
            <MarketPriceNewCategoryDialog
              v-model="goodCategoryCreateOpen"
              :is-dark="isDark"
              :type-id="selectedTypeId"
              @created="onGoodCategoryCreated"
            />

            <!-- Industrial -->
            <div class="mpesd-field-row" style="margin-bottom: 14px;">
              <label class="mpesd-field-label">Industrial</label>
              <v-select
                v-model="form.industrialId"
                :items="industrialsOptions"
                item-title="name"
                item-value="id"
                density="compact"
                variant="outlined"
                hide-details
                clearable
                :menu-props="{ attach: 'body', zIndex: 10001 }"
                class="mpesd-item-select"
              >
                <template #prepend-item>
                  <v-list-item style="color:#ff3131; font-weight:600;" @click.stop="industrialCreateOpen = true">
                    <template #prepend><PlusCircle :size="16" class="me-2" style="color:#ff3131" /></template>
                    <v-list-item-title>Add an Industrial</v-list-item-title>
                  </v-list-item>
                  <v-divider class="my-1" />
                </template>
              </v-select>
            </div>

            <!-- Dialog partagé « Add an Industrial » (extrait — voir composant) -->
            <MarketPriceNewIndustrialDialog
              v-model="industrialCreateOpen"
              :is-dark="isDark"
              @created="onIndustrialCreated"
            />

            <!-- Purchase Information -->
            <div class="mpesd-section">
              <div class="mpesd-section-title">{{ t('purchaseInfo') }}</div>
              <div class="mpesd-sentence" style="flex-wrap: wrap;">
                <span class="mpesd-sentence-chip">{{ form.supplierItem || '…' }}</span>
                <span class="mpesd-sentence-text">{{ t('isPurchasedIn') }}</span>
                <select v-model="form.purchasePackaging" class="mpesd-inline-select" style="min-width: 120px;" @change="onPackagingSelectChange('purchasePackaging', $event)">
                  <option value="">—</option>
                  <option value="__add_packaging__" style="color:#ff3131; font-weight:600;">{{ t('addPackaging') }}</option>
                  <option v-for="opt in localPackagingOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <span class="mpesd-sentence-text">{{ t('of') }}</span>
                <NumberField v-model="form.unitsPerPurchase" :decimals="3" :step="1" :min="0" :empty-value="0" class="mpesd-inline-input" style="width: 70px;" @change="recomputePricePerUnit" />
                <select v-model="form.unit" class="mpesd-inline-select" style="width: 80px;">
                  <option value="">—</option>
                  <option value="Kg">Kg</option>
                  <option value="L">L</option>
                  <option value="Pc">Pc</option>
                </select>
                <span class="mpesd-sentence-text">{{ t('forTheAmountOf') }}</span>
                <NumberField v-model="form.price" :decimals="2" :step="0.01" :min="0" steppers pad :empty-value="0" class="mpesd-inline-input" style="width: 90px;" @change="recomputePricePerUnit" />
                <span class="mpesd-sentence-text">.</span>
              </div>
            </div>

            <!-- Inventory Information -->
            <div class="mpesd-section">
              <div class="mpesd-section-title">{{ t('inventoryInfo') }}</div>
              <div class="mpesd-sentence" style="flex-wrap: wrap;">
                <span class="mpesd-sentence-chip">{{ form.supplierItem || '…' }}</span>
                <span class="mpesd-sentence-text">{{ t('isStoredIn') }}</span>
                <select v-model="form.inventoryPackaging" class="mpesd-inline-select" style="min-width: 120px;" @change="onPackagingSelectChange('inventoryPackaging', $event)">
                  <option value="">—</option>
                  <option value="__add_packaging__" style="color:#ff3131; font-weight:600;">{{ t('addPackaging') }}</option>
                  <option v-for="opt in localPackagingOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <span class="mpesd-sentence-text">{{ t('of') }}</span>
                <NumberField v-model="form.packedUnits" :decimals="3" :step="1" :min="0" :empty-value="0" class="mpesd-inline-input" style="width: 80px;" />
                <span class="mpesd-sentence-text">{{ form.unit || '…' }} .</span>
              </div>
            </div>

            <!-- Dialog partagé « Add a packaging » (extrait — voir composant) -->
            <MarketPriceNewPackagingDialog
              v-model="packagingCreateOpen"
              :is-dark="isDark"
              @created="onPackagingCreated"
            />

            <!-- Packing Information -->
            <div class="mpesd-section mpesd-section--light">
              <div class="mpesd-section-title">{{ t('packingInfo') }} <span style="font-weight:400; color:#9ca3af; text-transform:none; letter-spacing:0;">({{ t('optional') }})</span></div>
              <div class="row g-2 mt-1">
                <div class="col-6">
                  <div class="mpesd-field-row">
                    <label for="mpesd-packedUnits" class="mpesd-field-label">{{ t('packedUnits') }} ({{ form.unit || 'unit' }})</label>
                    <NumberField id="mpesd-packedUnits" v-model="form.packedUnits" :decimals="3" :step="1" :min="0" :empty-value="0" class="form-control mpesd-input" />
                  </div>
                </div>
                <div class="col-6">
                  <div class="mpesd-field-row">
                    <label for="mpesd-numberOfUnits" class="mpesd-field-label">{{ t('numberOfUnits') }}</label>
                    <NumberField id="mpesd-numberOfUnits" v-model="form.numberOfUnits" :decimals="3" :step="1" :min="0" :empty-value="0" class="form-control mpesd-input" />
                  </div>
                </div>
              </div>
              <div class="row g-2 mt-2">
                <div class="col-4">
                  <div class="mpesd-field-row">
                    <label for="mpesd-length" class="mpesd-field-label">{{ t('lengthCm') }}</label>
                    <NumberField id="mpesd-length" v-model="form.packingLength" :decimals="3" :step="1" :min="0" :empty-value="0" class="form-control mpesd-input" />
                  </div>
                </div>
                <div class="col-4">
                  <div class="mpesd-field-row">
                    <label for="mpesd-width" class="mpesd-field-label">{{ t('widthCm') }}</label>
                    <NumberField id="mpesd-width" v-model="form.packingWidth" :decimals="3" :step="1" :min="0" :empty-value="0" class="form-control mpesd-input" />
                  </div>
                </div>
                <div class="col-4">
                  <div class="mpesd-field-row">
                    <label for="mpesd-height" class="mpesd-field-label">{{ t('heightCm') }}</label>
                    <NumberField id="mpesd-height" v-model="form.packingHeight" :decimals="3" :step="1" :min="0" :empty-value="0" class="form-control mpesd-input" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Price per Unit -->
            <div class="mpesd-section">
              <div class="d-flex justify-space-between align-center">
                <div>
                  <div style="font-weight:600;">{{ t('pricePerUnitCalc') }}</div>
                  <div style="font-size:0.8125rem; color:#6b7280; margin-top:2px;">
                    {{ form.price || 0 }} ÷ {{ form.unitsPerPurchase || 0 }} {{ form.unit || '' }}
                  </div>
                </div>
                <div style="font-size:1.5rem; font-weight:700;">
                  {{ formatPrice(form.pricePerUnit) }}
                </div>
              </div>
            </div>

          </div>

          <!-- Footer -->
          <div class="mpesd__footer">
            <button class="mpesd-btn mpesd-btn--cancel" :disabled="loading" @click="close">{{ t('cancel') }}</button>
            <button class="mpesd-btn mpesd-btn--save" :disabled="loading" @click="submit">
              <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              <Save v-else :size="16" class="me-1" />
              {{ t('saveChanges') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { AlertCircle, Check, ImagePlus, Package, Pencil, PlusCircle, Save, Tag, Truck, X } from 'lucide-vue-next';
import { updateMarketPrice, createSupplier } from '@/api/endpoints/menu.api';
import MarketPriceNewTypeDialog from '../dialogs/MarketPriceNewTypeDialog.vue';
import MarketPriceNewCategoryDialog from '../dialogs/MarketPriceNewCategoryDialog.vue';
import MarketPriceNewIndustrialDialog from '../dialogs/MarketPriceNewIndustrialDialog.vue';
import MarketPriceNewPackagingDialog from '../dialogs/MarketPriceNewPackagingDialog.vue';
import NumberField from '@/components/common/NumberField.vue';
import { formatCurrencyDetailed } from '@/composables/useFormatters';

export default {
  name: 'MarketPriceEditSupplierDrawer',
  components: { AlertCircle, Check, ImagePlus, Package, Pencil, PlusCircle, Save, Tag, Truck, X, MarketPriceNewTypeDialog, MarketPriceNewCategoryDialog, MarketPriceNewIndustrialDialog, MarketPriceNewPackagingDialog, NumberField },
  props: {
    modelValue: { type: Boolean, default: false },
    item: { type: Object, default: null },
    row: { type: Object, default: null },
    suppliers: { type: Array, default: () => [] },
    goodTypeOptions: { type: Array, default: () => [] },
    productCategories: { type: Array, default: () => [] },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved'],
  data() {
    return {
      locale: localStorage.getItem('appLocale') || 'en',
      loading: false,
      error: '',
      isHydratingForm: false,
      targetId: '',
      localSuppliers: [],
      supplierCreateOpen: false,
      supplierCreateLoading: false,
      supplierCreateError: '',
      supplierImagePreview: '',
      supplierCreateForm: { name: '', email: '', phone: '', contactName: '', address: '', city: '', postcode: '', spaceIds: [], notes: '', picture: '' },
      unitOptions: ['kg', 'g', 'l', 'ml', 'cl', 'pcs', 'unit', 'box', 'bag', 'can'],
      localGoodTypeOptions: [],
      goodTypeCreateOpen: false,
      localGoodCategoryOptions: [],
      goodCategoryCreateOpen: false,
      industrialCreateOpen: false,
      localPackagingOptions: [],
      packagingCreateOpen: false,
      packagingTargetField: 'purchasePackaging',
      form: {
        itemName: '',
        supplierItem: '',
        supplierId: '',
        goodType: '',
        category: '',
        industrialId: '',
        purchasePackaging: '',
        unit: '',
        recipeUnit: '',
        inventoryPackaging: '',
        unitsPerPurchase: 0,
        price: 0,
        pricePerUnit: 0,
        packedUnits: 0,
        numberOfUnits: 0,
        packingLength: 0,
        packingWidth: 0,
        packingHeight: 0,
      },
      translations: {
        en: {
          editSupplierItem: 'Edit Supplier Item',
          editSupplierSubtitle: 'Update supplier, pricing and packaging',
          supplierItemName: 'Supplier Item Name',
          itemName: 'Item Name',
          supplier: 'Supplier',
          addSupplier: 'Add a supplier',
          supplierName: 'Supplier name',
          email: 'Email',
          phone: 'Phone',
          supplierContactName: 'Contact Name',
          supplierSpaces: 'Sites',
          uploadPicture: 'Upload supplier photo',
          fileFormat: 'PNG, JPG up to 5MB',
          sectionIdentity: 'Identity',
          sectionContact: 'Contact',
          sectionLocation: 'Location',
          sites: 'Sites',
          selectAll: 'Select all',
          unselectAll: 'Unselect all',
          addNotes: 'Add any additional notes…',
          address: 'Address',
          city: 'City',
          postcode: 'Postcode',
          notes: 'Notes',
          required: 'Required field',
          cancel: 'Cancel',
          create: 'Create',
          goodType: 'Good Type',
          addGoodType: 'Add a Good Type',
          goodTypeName: 'Good Type name',
          goodCategory: 'Good Category',
          addCategory: 'Add a Category',
          categoryName: 'Category name',
          purchaseInfo: 'Purchase Information',
          isPurchasedIn: 'is purchased in',
          addPackaging: '+ Add packaging',
          of: 'of',
          forTheAmountOf: 'for the amount of €',
          inventoryInfo: 'Inventory Information',
          isStoredIn: 'is stored in',
          addPackagingTitle: 'Add a packaging',
          packagingName: 'Packaging name',
          add: 'Add',
          packingInfo: 'Packing Information',
          optional: 'Optional',
          packedUnits: 'Packed Units',
          numberOfUnits: 'Number of Units',
          lengthCm: 'Length (cm)',
          widthCm: 'Width (cm)',
          heightCm: 'Height (cm)',
          pricePerUnitCalc: 'Price per Unit (Calculated)',
          saveChanges: 'Save Changes',
        },
        fr: {
          editSupplierItem: "Modifier l'article fournisseur",
          editSupplierSubtitle: 'Mettre à jour fournisseur, prix et emballage',
          supplierItemName: "Nom de l'article fournisseur",
          itemName: "Nom de l'article",
          supplier: 'Fournisseur',
          addSupplier: 'Ajouter un fournisseur',
          supplierName: 'Nom du fournisseur',
          email: 'Email',
          phone: 'Téléphone',
          supplierContactName: 'Nom du contact',
          supplierSpaces: 'Sites',
          uploadPicture: 'Photo du fournisseur',
          fileFormat: "PNG, JPG jusqu'à 5MB",
          sectionIdentity: 'Identité',
          sectionContact: 'Contact',
          sectionLocation: 'Localisation',
          sites: 'Sites',
          selectAll: 'Tout sélectionner',
          unselectAll: 'Tout désélectionner',
          addNotes: "Notes supplémentaires sur ce fournisseur…",
          address: 'Adresse',
          city: 'Ville',
          postcode: 'Code postal',
          notes: 'Notes',
          required: 'Champ requis',
          cancel: 'Annuler',
          create: 'Créer',
          goodType: 'Type de produit',
          addGoodType: 'Ajouter un type de produit',
          goodTypeName: 'Nom du type de produit',
          goodCategory: 'Catégorie',
          addCategory: 'Ajouter une catégorie',
          categoryName: 'Nom de la catégorie',
          purchaseInfo: "Informations d'achat",
          isPurchasedIn: 'est acheté en',
          addPackaging: '+ Ajouter un emballage',
          of: 'de',
          forTheAmountOf: 'pour un montant de €',
          inventoryInfo: 'Informations de stock',
          isStoredIn: 'est stocké en',
          addPackagingTitle: 'Ajouter un emballage',
          packagingName: "Nom de l'emballage",
          add: 'Ajouter',
          packingInfo: "Informations d'emballage",
          optional: 'Optionnel',
          packedUnits: 'Unités emballées',
          numberOfUnits: "Nombre d'unités",
          lengthCm: 'Longueur (cm)',
          widthCm: 'Largeur (cm)',
          heightCm: 'Hauteur (cm)',
          pricePerUnitCalc: 'Prix par unité (Calculé)',
          saveChanges: 'Enregistrer les modifications',
        },
      },
    };
  },
  computed: {
    localOpen: {
      get() { return this.modelValue; },
      set(val) { this.$emit('update:modelValue', val); },
    },
    availableSpaces() {
      return this.$store.getters['spaces/spaces'] || [];
    },
    isAllSpacesChecked() {
      return this.availableSpaces.length > 0
        && this.supplierCreateForm.spaceIds.length === this.availableSpaces.length;
    },
    packagingCategoryItems() {
      const storePackingTypes = this.$store.getters['packingTypes/packingTypes'] || [];
      return storePackingTypes.map(p => p.name).filter(Boolean);
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
    goodCategoryOptions() {
      const goodType = (this.form.goodType || '').toLowerCase();
      const base = goodType
        ? (this.productCategories || [])
            .filter((c) => (c.typeName || '').toLowerCase() === goodType)
            .map((c) => c?.name)
            .filter(Boolean)
        : [];
      const extra = this.localGoodCategoryOptions.filter((o) => !base.includes(o));
      return [...base, ...extra];
    },
  },
  watch: {
    'form.goodType'() {
      if (this.isHydratingForm) return;
      this.form.category = '';
    },
    modelValue(val) {
      if (val && this.item && this.row) {
        this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes', { forceRefresh: true });
        this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true });
        this.$store.dispatch('packingTypes/fetchPackingTypes', { forceRefresh: true });
        this.$store.dispatch('industrials/fetchIndustrials', { forceRefresh: true });
        this.localSuppliers = [...(this.suppliers || [])];
        this.localGoodTypeOptions = [...(this.goodTypeOptions || [])];
        this.localGoodCategoryOptions = [];
        this.localPackagingOptions = [...this.packagingCategoryItems];
        this.supplierCreateOpen = false;
        this.supplierCreateError = '';
        this.supplierCreateForm = { name: '', email: '', phone: '', contactName: '', address: '', city: '', postcode: '', spaceIds: [], notes: '', picture: '' };
        this.clearSupplierPicture();
        this.goodTypeCreateOpen = false;
        this.goodCategoryCreateOpen = false;
        this.industrialCreateOpen = false;
        this.packagingCreateOpen = false;
        const id = this.row?.id || this.row?._id;
        this.targetId = id ? String(id) : '';
        this.isHydratingForm = true;
        this.form = {
          itemName: String(this.item?.name || this.item?.itemName || '').trim(),
          supplierItem: this.row?.supplierItemName || this.row?.supplierItem || '',
          supplierId: this.row?.supplierId || '',
          goodType: this.item?.goodType || this.item?.type || '',
          category: this.row?.category || this.item?.category || '',
          industrialId: this.row?.industrialId || this.row?.industrial?.id || '',
          unit: this.row?.unit || '',
          recipeUnit: this.item?.recipeUnit || this.row?.recipeUnit || '',
          purchasePackaging: this.row?.purchasePackaging || '',
          inventoryPackaging: this.row?.inventoryPackaging || '',
          unitsPerPurchase: Number(this.row?.unitsPerPurchase) || 0,
          price: Number(this.row?.price) || 0,
          pricePerUnit: Number(this.row?.pricePerUnit) || 0,
          packedUnits: Number(this.row?.packedUnits) || 0,
          numberOfUnits: Number(this.row?.numberOfUnits) || 0,
          packingLength: Number(this.row?.packingLength) || 0,
          packingWidth: Number(this.row?.packingWidth) || 0,
          packingHeight: Number(this.row?.packingHeight) || 0,
        };
        this.recomputePricePerUnit();
        this.error = '';
        this.loading = false;
        this.$nextTick(() => {
          this.isHydratingForm = false;
        });
      }
    },
    packagingCategoryItems(newVal) {
      this.localPackagingOptions = Array.from(new Set([...newVal, ...this.localPackagingOptions]));
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
    onPackagingSelectChange(field, e) {
      if (e.target.value === '__add_packaging__') {
        this.form[field] = '';
        this.packagingTargetField = field;
        this.packagingCreateOpen = true;
      }
    },
    // Le dialog partagé a créé le packing type (API + store) ; ici on l'affecte au
    // champ ciblé mémorisé par onPackagingSelectChange (purchase/inventory packaging).
    onPackagingCreated(name) {
      if (!this.localPackagingOptions.includes(name)) {
        this.localPackagingOptions = [...this.localPackagingOptions, name];
      }
      this.form[this.packagingTargetField] = name;
    },
    // Les dialogs partagés ont créé le type/catégorie (API + refetch store) ; ici on
    // ne fait que refléter la sélection dans le formulaire + l'affichage immédiat.
    onGoodTypeCreated(name) {
      if (!this.localGoodTypeOptions.includes(name)) {
        this.localGoodTypeOptions = [...this.localGoodTypeOptions, name];
      }
      this.form.goodType = name;
    },
    onGoodCategoryCreated(name) {
      if (!this.localGoodCategoryOptions.includes(name)) {
        this.localGoodCategoryOptions = [...this.localGoodCategoryOptions, name];
      }
      this.form.category = name;
    },
    // Le dialog partagé a créé l'industriel (API + store) ; ici on ne fait que le
    // sélectionner dans le formulaire (champ par id).
    onIndustrialCreated(industrial) {
      this.form.industrialId = industrial?.id || industrial?._id || null;
    },
    async submitSupplierCreate() {
      const f = this.supplierCreateForm;
      // Mêmes champs requis que SupplierFormDrawer.
      const required = [
        { key: 'name', label: this.t('supplierName') },
        { key: 'contactName', label: this.t('supplierContactName') },
        { key: 'email', label: this.t('email') },
        { key: 'phone', label: this.t('phone') },
        { key: 'address', label: this.t('address') },
        { key: 'city', label: this.t('city') },
        { key: 'postcode', label: this.t('postcode') },
      ];
      for (const field of required) {
        if (!String(f[field.key] || '').trim()) {
          this.supplierCreateError = `${field.label} — ${this.t('required')}`;
          return;
        }
      }
      if (!f.spaceIds.length) {
        this.supplierCreateError = this.locale === 'fr'
          ? 'Veuillez sélectionner au moins un site *'
          : 'Please select at least one site *';
        return;
      }
      this.supplierCreateLoading = true;
      this.supplierCreateError = '';
      try {
        const resp = await createSupplier({
          name: f.name.trim(),
          email: f.email.trim(),
          phone: f.phone.trim(),
          contactName: f.contactName.trim(),
          address: f.address.trim(),
          city: f.city.trim(),
          postcode: f.postcode.trim(),
          picture: f.picture || undefined,
          spaceIds: f.spaceIds,
          notes: f.notes.trim() || undefined,
        });
        const name = f.name.trim();
        const newSupplier = { id: resp?.data?.id || resp?.id || resp?.data?._id, name };
        this.localSuppliers = [...this.localSuppliers, newSupplier];
        this.form.supplierId = newSupplier.id;
        this.supplierCreateOpen = false;
        this.supplierCreateForm = { name: '', email: '', phone: '', contactName: '', address: '', city: '', postcode: '', spaceIds: [], notes: '', picture: '' };
        this.clearSupplierPicture();
      } catch (e) {
        this.supplierCreateError = e?.response?.data?.message || e?.message || 'Failed to create supplier';
      } finally {
        this.supplierCreateLoading = false;
      }
    },
    toggleAllSpaces() {
      this.supplierCreateForm.spaceIds = this.isAllSpacesChecked
        ? []
        : this.availableSpaces.map((s) => s.id);
    },
    // ── Upload photo du fournisseur (dialog création) ──
    triggerSupplierPicture() {
      this.$refs?.supplierPictureInput?.click();
    },
    async onSupplierPictureSelected(e) {
      const file = e?.target?.files?.[0] || null;
      this.clearSupplierPicture();
      if (!file) return;
      this.supplierImagePreview = URL.createObjectURL(file);
      try {
        this.supplierCreateForm.picture = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('FileReader error'));
          reader.readAsDataURL(file);
        });
      } catch {
        this.supplierCreateForm.picture = '';
      }
    },
    clearSupplierPicture() {
      if (this.supplierImagePreview && String(this.supplierImagePreview).startsWith('blob:')) {
        URL.revokeObjectURL(this.supplierImagePreview);
      }
      this.supplierImagePreview = '';
      this.supplierCreateForm.picture = '';
      if (this.$refs?.supplierPictureInput) this.$refs.supplierPictureInput.value = '';
    },
    recomputePricePerUnit() {
      const price = Number(this.form.price) || 0;
      const upp = Number(this.form.unitsPerPurchase) || 0;
      this.form.pricePerUnit = upp > 0 ? price / upp : 0;
    },
    formatPrice(value) {
      // Prix en euros — formatage locale-aware (fr → "12,50 €", en → "€12.50").
      if (value === null || value === undefined || value === '') return '-';
      if (typeof value === 'number') return formatCurrencyDetailed(value);
      return String(value);
    },
    close() {
      this.$emit('update:modelValue', false);
    },
    async submit() {
      this.loading = true;
      this.error = '';
      try {
        if (!this.targetId) {
          this.error = 'Missing market price id';
          return;
        }
        const itemName = String(this.form.itemName || '').trim();
        if (!itemName) {
          this.error = 'Item Name is required';
          return;
        }
        const supplierId = String(this.form.supplierId || '').trim();
        if (!supplierId) {
          this.error = 'Supplier is required';
          return;
        }

        this.recomputePricePerUnit();

        const patch = {
          itemName,
          supplierId,
          supplierItem: String(this.form.supplierItem || '').trim(),
          goodType: this.form.goodType || '',
          marketPriceTypeId: this.selectedTypeId,
          category: this.form.category || '',
          marketPriceCategoryId: this.selectedCategoryId,
          industrialId: this.form.industrialId || null,
          purchasePackaging: this.form.packaging || '',
          unit: this.form.unit || '',
          recipeUnit: this.form.recipeUnit || '',
          purchasePackaging: this.form.purchasePackaging || '',
          inventoryPackaging: this.form.inventoryPackaging || '',
          unitsPerPurchase: Number(this.form.unitsPerPurchase) || 0,
          price: Number(this.form.price) || 0,
          pricePerUnit: Number(this.form.pricePerUnit) || 0,
          packedUnits: Number(this.form.packedUnits) || 0,
          numberOfUnits: Number(this.form.numberOfUnits) || 0,
          packingLength: Number(this.form.packingLength) || 0,
          packingWidth: Number(this.form.packingWidth) || 0,
          packingHeight: Number(this.form.packingHeight) || 0,
        };

        await updateMarketPrice(this.targetId, patch);
        this.$store.dispatch('marketPriceIngredients/invalidate');
        this.$emit('saved');
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || 'Failed to update supplier item';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* === Overlay & Panel === */
.mpesd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}

.mpesd-panel {
  position: relative;
  width: 520px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

/* === Transitions === */
.mpesd-enter-active,
.mpesd-leave-active {
  transition: opacity 0.25s ease;
}
.mpesd-enter-active .mpesd-panel,
.mpesd-leave-active .mpesd-panel {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.mpesd-enter-from {
  opacity: 0;
}
.mpesd-enter-from .mpesd-panel {
  transform: translateX(100%);
}
.mpesd-leave-to {
  opacity: 0;
}
.mpesd-leave-to .mpesd-panel {
  transform: translateX(100%);
}

/* === Gradient Header === */
.mpesd__grad-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: #ff3131;
  flex-shrink: 0;
}

.mpesd__header-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mpesd__header-titles {
  flex: 1;
  min-width: 0;
}

.mpesd__header-title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.mpesd__header-subtitle {
  font-size: 12px;
  color: rgba(255,255,255,.72);
  margin-top: 3px;
}

.mpesd__close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(255,255,255,.18);
  color: rgba(255,255,255,.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .18s;
  flex-shrink: 0;
  margin-left: auto;
}
.mpesd__close-btn:hover:not(:disabled) { background: rgba(255,255,255,.3); }
.mpesd__close-btn:disabled { opacity: .4; cursor: not-allowed; }

/* === Error === */
.mpesd__error {
  display: flex;
  align-items: center;
  padding: 10px 24px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  font-size: 13px;
  color: #ff3131;
  flex-shrink: 0;
}

/* === Layout === */
.mpesd-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.mpesd__footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}

/* === Footer Buttons === */
.mpesd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 24px;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s;
  border: none;
  line-height: 1.4;
}
.mpesd-btn:disabled { opacity: .45; cursor: not-allowed; }

.mpesd-btn--cancel {
  background: transparent;
  border: 1.5px solid #e5e7eb;
  color: #6b7280;
}
.mpesd-btn--cancel:hover:not(:disabled) {
  border-color: #9ca3af;
  background: #f3f4f6;
  color: #374151;
}

.mpesd-btn--save {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49,.3);
}
.mpesd-btn--save:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 49, 49,.4);
  transform: translateY(-1px);
}

/* === Bootstrap inputs === */
.mpesd-input.form-control,
.mpesd-select.form-select {
  border-radius: 11px;
  border: 1.5px solid #e5e7eb;
  font-size: 13.5px;
  color: #374151;
  padding: .65rem .8rem;
  background: #fafafa;
  transition: border-color .2s, box-shadow .2s;
}
.mpesd-input.form-control:focus,
.mpesd-select.form-select:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1);
  background: #fff;
  outline: none;
}
.mpesd-input--readonly {
  background: #f3f4f6 !important;
  color: #6b7280 !important;
  cursor: default;
}
.mpesd-required { color: #ff3131; }

/* === Static field label pattern === */
.mpesd-field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.mpesd-field-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #374151;
}
.mpesd-item-select :deep(.v-field) {
  border-radius: 11px !important; border: 1.5px solid #e5e7eb !important;
  background: #fafafa !important; box-shadow: none !important;
}
.mpesd-item-select :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1) !important;
  background: #fff !important;
}
.mpesd-item-select :deep(.v-field__outline) { display: none !important; }
.mpesd-item-select :deep(.v-field__input) { font-size: 13.5px !important; color: #374151 !important; }
.mpesd-item-select :deep(.v-select__selection-text) { font-size: 13.5px !important; }

/* === Mini dialog (supplier creation) === */
.mpesd-mini-dialog {
  background: #fff; border-radius: 16px;
  overflow: hidden; box-shadow: 0 24px 64px rgba(0,0,0,.14);
  display: flex; flex-direction: column; max-height: 90vh;
}
.mpesd-mini-dialog__header {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 20px;
  background: #ff3131;
  color: #fff; font-size: 14px; font-weight: 700;
  flex-shrink: 0;
}
.mpesd-mini-dialog__close {
  margin-left: auto; background: rgba(255,255,255,.18);
  border: none; border-radius: 6px; width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(255,255,255,.85);
}
.mpesd-mini-dialog__close:hover { background: rgba(255,255,255,.3); }
.mpesd-mini-dialog__error {
  padding: 10px 20px; background: #fef2f2;
  font-size: 13px; color: #ff3131; border-bottom: 1px solid #fecaca;
}
.mpesd-mini-dialog__body { padding: 20px 20px 16px; flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.mpesd-mini-dialog__footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 12px 20px; border-top: 1px solid #f0f0f0; background: #fafafa;
}

/* === Inline inputs (sentence style) === */
.mpesd-inline-input,
.mpesd-inline-select {
  border: 1.5px solid #dbeafe;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 13px;
  color: #1e3a5f;
  background: #fff;
  transition: border-color .15s, box-shadow .15s;
}
.mpesd-inline-input:focus,
.mpesd-inline-select:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37,99,235,.1);
  outline: none;
}
/* Dark : inputs inline (sections Purchase/Inventory Information) — fond bleu sombre, valeur claire. */
.mpesd-panel--dark .mpesd-inline-input,
.mpesd-panel--dark .mpesd-inline-select {
  background: #1a2332;
  border-color: rgba(37, 99, 235, .4);
  color: #e2e8f0;
}
.mpesd-panel--dark .mpesd-inline-input:focus,
.mpesd-panel--dark .mpesd-inline-select:focus {
  border-color: #3b82f6;
  background: #1a2332;
}

/* === Sections === */
.mpesd-section {
  border: 1.5px solid #DBEAFE;
  border-radius: 12px;
  background: #EFF6FF;
  padding: 16px;
  margin-bottom: 14px;
}

.mpesd-section--light {
  background: #f9fafb;
  border-color: #e5e7eb;
}

.mpesd-section--price {
  background: #f0f9ff;
  border-color: #bae6fd;
}

.mpesd-section-title {
  font-weight: 700;
  font-size: 0.9375rem;
  color: #1e3a5f;
  margin-bottom: 10px;
}

.mpesd-section--light .mpesd-section-title {
  color: #374151;
}

.mpesd-section--price .mpesd-section-title {
  color: #0369a1;
}

/* === Sentence layout === */
.mpesd-sentence {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.mpesd-sentence-text {
  font-size: 0.875rem;
  color: #374151;
  white-space: nowrap;
}

.mpesd-sentence-chip {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 6px;
  padding: 2px 10px;
  white-space: nowrap;
}

.mpesd-inline-field :deep(.v-field) {
  border-radius: 8px;
}

.mpesd-inline-field :deep(input) {
  font-size: 0.875rem;
  padding: 6px 10px;
  min-height: unset;
}

/* === Row / Field helpers === */
.mpesd-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.mpesd-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mpesd-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.mpesd-label-sm {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #6b7280;
}

/* === Dark mode === */
.mpesd-panel--dark {
  background: #1f2937;
  color: #e5e7eb;
}
.mpesd-panel--dark .mpesd__footer {
  background: #1f2937;
  border-color: #374151;
}
.mpesd-panel--dark .mpesd-section {
  background: #1e3a5f;
  border-color: #1d4ed8;
}
.mpesd-panel--dark .mpesd-section--light {
  background: #263548;
  border-color: #374151;
}
.mpesd-panel--dark .mpesd-section-title {
  color: #93c5fd;
}
.mpesd-panel--dark .mpesd-sentence-text {
  color: #d1d5db;
}
.mpesd-panel--dark .mpesd-label {
  color: #e5e7eb;
}
.mpesd-panel--dark .mpesd-label-sm {
  color: #9ca3af;
}
/* Champs du corps du drawer (les mini-dialogs de création, téléportés hors racine, restent clairs). */
.mpesd-panel--dark .mpesd-field-label {
  color: #e5e7eb;
}
.mpesd-panel--dark .mpesd-input.form-control,
.mpesd-panel--dark .mpesd-select.form-select {
  background: #111827;
  border-color: #374151;
  color: #e5e7eb;
}
.mpesd-panel--dark .mpesd-input.form-control:focus,
.mpesd-panel--dark .mpesd-select.form-select:focus {
  background: #111827;
}
.mpesd-panel--dark .mpesd-input--readonly {
  background: #263548 !important;
  color: #9ca3af !important;
}
.mpesd-panel--dark .mpesd-item-select :deep(.v-field) {
  background: #111827 !important;
  border-color: #374151 !important;
}
.mpesd-panel--dark .mpesd-item-select :deep(.v-field--focused) {
  background: #111827 !important;
}
.mpesd-panel--dark .mpesd-item-select :deep(.v-field__input) {
  color: #e5e7eb !important;
}

/* Zone d'upload photo (dialogue de création fournisseur) */
.mpesd-sc-photo {
  position: relative;
  width: 100%;
  min-height: 150px;
  border-radius: 16px;
  border: 2px dashed #e5e7eb;
  background: #fafafa;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color .18s, background .18s;
  margin-bottom: 4px;
}
.mpesd-sc-photo:hover { border-color: #ff3131; background: #fff5f5; }
.mpesd-sc-photo__img { width: 100%; height: 100%; max-height: 220px; object-fit: cover; }
.mpesd-sc-photo__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  padding: 22px;
}
.mpesd-sc-photo__icon {
  width: 56px; height: 56px; border-radius: 50%;
  background: #fef2f2;
  display: flex; align-items: center; justify-content: center;
}
.mpesd-sc-photo__label { font-size: 14px; font-weight: 700; color: #111827; }
.mpesd-sc-photo__hint { font-size: 12px; color: #9ca3af; }
.mpesd-sc-photo__remove {
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

/* Sections (dialogue de création fournisseur) */
.mpesd-sc-section { margin-top: 18px; }
.mpesd-sc-section:first-of-type { margin-top: 0; }
.mpesd-sc-section__label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: #9ca3af;
  margin-bottom: 12px;
}
.mpesd-sc-section__header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.mpesd-sc-site-count { font-weight: 500; color: #9ca3af; }
.mpesd-sc-toggle-all {
  background: none; border: none; color: #ff3131;
  font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.mpesd-sc-toggle-all:hover { text-decoration: underline; }
.mpesd-pill-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.mpesd-check-pill {
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
.mpesd-check-pill--active {
  border-color: #ff3131;
  background: #fef2f2;
  color: #ff3131;
  font-weight: 600;
  box-shadow: 0 0 0 2px rgba(255, 49, 49, 0.12);
}
.mpesd-check-pill__check { opacity: 0; transition: opacity 0.15s; }
.mpesd-check-pill--active .mpesd-check-pill__check { opacity: 1; }

/* ── Mini-dialogs « Add a supplier » / « Add a packaging » (v-dialog téléportés) — dark mode.
   Classe portée sur la racine `.mpesd-mini-dialog` (elle suit l'élément même téléporté). ── */
.mpesd-mini-dialog--dark { background: #1f2937; }
.mpesd-mini-dialog--dark .mpesd-mini-dialog__error { background: rgba(255,49,49,.15); border-bottom-color: rgba(255,49,49,.3); color: #fca5a5; }
.mpesd-mini-dialog--dark .mpesd-mini-dialog__footer { background: #1a2332; border-top-color: #374151; }
.mpesd-mini-dialog--dark .mpesd-field-label { color: #cbd5e1; }
.mpesd-mini-dialog--dark .mpesd-input.form-control { background: #263548; border-color: #374151; color: #e5e7eb; }
.mpesd-mini-dialog--dark .mpesd-input.form-control:focus { background: #263548; }
.mpesd-mini-dialog--dark .mpesd-sc-photo { background: #263548; border-color: #374151; }
.mpesd-mini-dialog--dark .mpesd-sc-photo:hover { background: #2a2022; }
.mpesd-mini-dialog--dark .mpesd-sc-photo__label { color: #e5e7eb; }
.mpesd-mini-dialog--dark .mpesd-check-pill { background: #263548; border-color: #374151; color: #cbd5e1; }
.mpesd-mini-dialog--dark .mpesd-check-pill--active { background: rgba(255,49,49,.15); border-color: #ff3131; color: #fca5a5; }
.mpesd-mini-dialog--dark .mpesd-btn--cancel { border-color: #374151; color: #cbd5e1; }
.mpesd-mini-dialog--dark .mpesd-btn--cancel:hover:not(:disabled) { border-color: rgba(255,255,255,.24); background: rgba(255,255,255,.06); color: #e5e7eb; }
</style>
