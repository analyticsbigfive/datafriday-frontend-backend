<template>
  <Teleport to="body">
    <Transition name="mifd">
      <div v-if="modelValue" class="mifd-overlay" @mousedown.self="close">
        <div class="mifd-panel" :class="{ 'mifd--dark': isDark }">

          <!-- Drawer Header -->
          <div class="mifd-header">
            <div class="mifd-header__icon">
              <UtensilsCrossed :size="20" color="white" />
            </div>
            <div class="mifd-header__text">
              <div class="mifd-header__title">{{ isEditMode ? t('menuItemCreate.editTitle') : t('menuItemCreate.title') }}</div>
              <div class="mifd-header__sub">{{ isEditMode ? 'Modifier les informations' : 'Nouveau menu item' }}</div>
            </div>
            <button class="mifd-header__close" @click="close"><X :size="16" /></button>
          </div>

          <!-- Body: left table + right form -->
          <div class="mifd-body">

            <!-- Left: Ingredients / Components table -->
            <div class="mifd-left">
              <div class="mifd-left-header">
                <span class="text-body-2 font-weight-bold mifd-title">{{ t('menuItemCreate.componentsTitle') }}</span>
                <div class="d-flex align-center" style="gap: 6px; flex-wrap: wrap">
                  <v-btn variant="outlined" rounded="lg" size="x-small" @click="ingredientDrawer = true" class="text-none">
                    <Plus :size="13" class="mr-1" />{{ t('menuItemCreate.addIngredient') }}
                  </v-btn>
                  <v-btn variant="flat" rounded="lg" size="x-small" @click="componentDrawer = true" class="text-none" color="#111827">
                    <Plus :size="13" class="mr-1" />{{ t('menuItemCreate.addComponent') }}
                  </v-btn>
                  <v-btn variant="outlined" rounded="lg" size="x-small" @click="packagingDrawer = true" class="text-none">
                    <Plus :size="13" class="mr-1" />{{ t('menuItemCreate.addPackaging') }}
                  </v-btn>
                </div>
              </div>

              <v-card rounded="xl" elevation="0" class="mifd-table-card">
                <v-skeleton-loader v-if="loading" type="table-row@4" />
                <v-data-table
                  v-else
                  :headers="tableHeaders"
                  :items="items"
                  item-value="id"
                  density="compact"
                  class="mifd-table"
                  hide-default-footer
                  :items-per-page="-1"
                >
                  <template #no-data>
                    <div class="pa-8 text-center">
                      <div class="text-body-2 text-medium-emphasis">{{ t('menuItemCreate.noItems') }}</div>
                    </div>
                  </template>
                  <template #item.name="{ item }">
                    <div class="font-weight-medium mifd-title">{{ item.supplierItemName || item.name }}</div>
                  </template>
                  <template #item.type="{ item }">
                    <v-chip size="small" variant="tonal" rounded="lg" :color="item.type === 'Ingredient' ? '#10b981' : '#3b82f6'">
                      {{ item.type }}
                    </v-chip>
                  </template>
                  <template #item.category="{ item }">
                    <v-chip size="small" color="dark" rounded="lg">{{ item.category || '-' }}</v-chip>
                  </template>
                  <template #item.quantity="{ item }">
                    <v-text-field v-model="item.quantity" type="number" variant="outlined" density="compact" hide-details style="max-width: 90px;" />
                  </template>
                  <template #item.unitCost="{ item }">{{ formatCurrency(item.unitCost) }}</template>
                  <template #item.totalCost="{ item }">
                    <span class="font-weight-bold">{{ formatCurrency(item.quantity * item.unitCost) }}</span>
                  </template>
                  <template #item.storage="{ item }">
                    <v-chip size="small" variant="tonal" rounded="lg" :color="getStorageColor(item.storage)">{{ item.storage }}</v-chip>
                  </template>
                  <template #item.actions="{ item }">
                    <v-btn icon variant="text" size="small" color="error" @click="onRemoveItem(item)">
                      <Trash2 :size="14" />
                    </v-btn>
                  </template>
                </v-data-table>
              </v-card>
            </div>

            <!-- Right: Form -->
            <div class="mifd-right">
              <div class="mifd-right-scroll">

                <!-- Picture Upload -->
                <div class="mb-3">
                  <label class="mifd-field-label">{{ t('menuItemCreate.labelPicture') }}</label>
                  <v-card rounded="lg" elevation="0" class="mifd-picture-upload" @click="triggerFileInput">
                    <div v-if="!form.picturePreview" class="d-flex flex-column align-center justify-center pa-3">
                      <ImageIcon :size="22" class="text-medium-emphasis mb-1" />
                      <v-btn variant="outlined" rounded="lg" size="x-small" class="text-none">
                        <Upload :size="12" class="mr-1" />{{ t('menuItemCreate.uploadPicture') }}
                      </v-btn>
                    </div>
                    <div v-else class="mifd-picture-preview">
                      <img :src="form.picturePreview" alt="Menu item" />
                      <v-btn icon variant="text" size="small" class="mifd-picture-remove" @click.stop="removePicture">
                        <X :size="14" />
                      </v-btn>
                    </div>
                  </v-card>
                  <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFileSelected" />
                </div>

                <!-- Name -->
                <div class="mb-3">
                  <label class="mifd-field-label">{{ t('menuItemCreate.labelName') }} <span class="mifd-required-star">*</span></label>
                  <v-text-field v-model="form.name" variant="outlined" density="compact" hide-details :placeholder="t('menuItemCreate.namePlaceholder')" rounded="lg" />
                </div>

                <div class="mifd-section-divider mb-3"><span>Classification</span></div>

                <!-- Space -->
                <div class="mb-3">
                  <label class="mifd-field-label">{{ t('menuItemCreate.labelSpace') }}</label>
                  <v-select v-model="form.spaces" :items="spaces" item-title="name" item-value="id" multiple chips closable-chips variant="outlined" density="compact" hide-details :placeholder="t('menuItemCreate.spacePlaceholder')" rounded="lg" :loading="spacesLoading" />
                </div>

                <!-- Type -->
                <div class="mb-3">
                  <label class="mifd-field-label">{{ t('menuItemCreate.labelType') }} <span class="mifd-required-star">*</span></label>
                  <v-select v-model="form.typeName" :items="productTypeNamesWithCreate" item-title="title" item-value="value" variant="outlined" density="compact" hide-details :placeholder="t('menuItemCreate.typePlaceholder')" rounded="lg" @update:model-value="onTypeSelectChange">
                    <template #item="{ item, props }">
                      <v-list-item v-bind="props" :class="item.raw.isCreate ? 'create-option' : ''" :style="item.raw.isCreate ? 'color:#ff3131;font-weight:600;' : ''" />
                    </template>
                  </v-select>
                </div>

                <!-- Category -->
                <div class="mb-3">
                  <label class="mifd-field-label">{{ t('menuItemCreate.labelCategory') }} <span class="mifd-required-star">*</span></label>
                  <v-select v-model="form.categoryName" :items="filteredCategoryNamesWithCreate" item-title="title" item-value="value" variant="outlined" density="compact" hide-details :placeholder="t('menuItemCreate.categoryPlaceholder')" rounded="lg" :disabled="!form.typeName" @update:model-value="onCategorySelectChange">
                    <template #item="{ item, props }">
                      <v-list-item v-bind="props" :class="item.raw.isCreate ? 'create-option' : ''" :style="item.raw.isCreate ? 'color:#ff3131;font-weight:600;' : ''" />
                    </template>
                  </v-select>
                </div>

                <div class="mifd-section-divider mb-3"><span>Configuration</span></div>

                <!-- Ready + Combo -->
                <div class="d-flex mb-3" style="gap: 8px;">
                  <div style="flex:1;min-width:0">
                    <label class="mifd-field-label">{{ t('menuItemCreate.labelReady') }}</label>
                    <v-select v-model="form.readyForSale" :items="['Yes','No']" variant="outlined" density="compact" hide-details placeholder="No" rounded="lg" />
                  </div>
                  <div style="flex:1;min-width:0">
                    <label class="mifd-field-label">{{ t('menuItemCreate.labelCombo') }}</label>
                    <v-select v-model="form.comboItem" :items="['Yes','No']" variant="outlined" density="compact" hide-details placeholder="No" rounded="lg" />
                  </div>
                </div>

                <!-- Base Price -->
                <div class="mb-3">
                  <label class="mifd-field-label">{{ t('menuItemCreate.labelBasePrice') }}</label>
                  <v-text-field v-model="form.basePrice" type="number" variant="outlined" density="compact" hide-details placeholder="0.00" rounded="lg" step="0.01" prefix="€" class="mb-2" />

                  <!-- Per-space price cards -->
                  <div v-for="spaceId in form.spaces" :key="spaceId" class="mifd-price-card mb-2">
                    <div class="mifd-price-row">
                      <v-text-field
                        :model-value="form.spacePrices[spaceId] ?? ''"
                        @update:model-value="v => setSpacePrice(spaceId, v)"
                        type="number" variant="outlined" density="compact" hide-details
                        placeholder="0.00" rounded="lg" step="0.01" prefix="€"
                        class="mifd-price-input"
                      />
                      <span class="mifd-space-badge">{{ getSpaceName(spaceId) }}</span>
                    </div>
                    <div class="mifd-price-summary">
                      <div class="mifd-price-summary-row">
                        <span class="mifd-price-summary-label">Total Cost / pièce</span>
                        <span class="mifd-price-summary-value">{{ formatCurrency(costPerPiece) }}</span>
                      </div>
                      <div class="mifd-price-summary-row">
                        <span class="mifd-price-summary-label">Prix</span>
                        <span class="mifd-price-summary-value">{{ formatCurrency(form.spacePrices[spaceId] || 0) }}</span>
                      </div>
                      <div class="mifd-price-divider" />
                      <div class="mifd-price-summary-row">
                        <div class="d-flex align-center" style="gap:6px">
                          <span class="mifd-price-summary-label">Marge</span>
                          <span :class="getSpaceMarginColor(spaceId)" class="mifd-margin-value">{{ getSpaceMargin(spaceId) }}</span>
                        </div>
                        <v-btn icon size="x-small" variant="text" color="error" @click="removeSpaceFromItem(spaceId)">
                          <Trash2 :size="13" />
                        </v-btn>
                      </div>
                    </div>
                  </div>

                  <p class="text-caption text-medium-emphasis mt-1 mb-0">{{ t('menuItemCreate.basePriceHint') }}</p>
                </div>

                <!-- Inventory -->
                <div v-if="form.readyForSale === 'Yes'" class="mb-3">
                  <div class="mifd-inventory-card">
                    <div class="mifd-inventory-title mb-2">{{ t('menuItemCreate.inventoryInfo') }}</div>
                    <div class="mb-2">
                      <label class="mifd-field-label">{{ t('menuItemCreate.packagingType') }}</label>
                      <v-select v-model="form.inventoryPackagingType" :items="packagingCategoryOptions" density="compact" variant="outlined" rounded="lg" hide-details :placeholder="t('menuItemCreate.none')" clearable :menu-props="{ zIndex: 10000 }" />
                    </div>
                    <div>
                      <label class="mifd-field-label">{{ t('menuItemCreate.numberOfUnits') }}</label>
                      <v-text-field v-model.number="form.inventoryNumberOfUnits" type="number" min="0" step="0.001" density="compact" variant="outlined" rounded="lg" hide-details placeholder="1.000" />
                    </div>
                  </div>
                </div>

                <div class="mifd-section-divider mb-2" :class="form.readyForSale === 'Yes' ? 'mt-1' : ''">
                  <span>Régime & Conservation</span>
                </div>

                <!-- Storage -->
                <div v-if="form.readyForSale === 'Yes'" class="mb-2">
                  <label class="mifd-field-label">{{ t('menuItemCreate.labelStorage') }}</label>
                  <div class="mifd-checkbox-grid">
                    <v-checkbox v-model="form.storageTypes" value="Dry" :label="t('menuItemCreate.storageDry')" hide-details density="compact" />
                    <v-checkbox v-model="form.storageTypes" value="Cold" :label="t('menuItemCreate.storageCold')" hide-details density="compact" />
                    <v-checkbox v-model="form.storageTypes" value="Freezer" :label="t('menuItemCreate.storageFreezer')" hide-details density="compact" />
                  </div>
                </div>

                <!-- Diet -->
                <div class="mb-3">
                  <label class="mifd-field-label">{{ t('menuItemCreate.labelDiet') }}</label>
                  <div class="mifd-checkbox-grid">
                    <v-checkbox v-model="form.dietTypes" value="Vegan" :label="t('menuItemCreate.dietVegan')" hide-details density="compact" />
                    <v-checkbox v-model="form.dietTypes" value="Vegetarian" :label="t('menuItemCreate.dietVegetarian')" hide-details density="compact" />
                    <v-checkbox v-model="form.dietTypes" value="Halal" :label="t('menuItemCreate.dietHalal')" hide-details density="compact" />
                    <v-checkbox v-model="form.dietTypes" value="Kosher" :label="t('menuItemCreate.dietKosher')" hide-details density="compact" />
                    <v-checkbox v-model="form.dietTypes" value="Hot" :label="t('menuItemCreate.dietHot')" hide-details density="compact" />
                  </div>
                </div>

                <div class="mifd-section-divider mb-3"><span>Description & Allergènes</span></div>

                <!-- Description -->
                <div class="mb-3">
                  <label class="mifd-field-label">{{ t('menuItemCreate.labelDescription') }}</label>
                  <v-textarea v-model="form.description" variant="outlined" density="compact" hide-details :placeholder="t('menuItemCreate.descriptionPlaceholder')" rounded="lg" rows="2" />
                </div>

                <!-- Allergens -->
                <div class="mb-3">
                  <label class="mifd-field-label">Allergènes</label>
                  <div class="mifd-checkbox-grid">
                    <v-checkbox v-model="form.allergens" value="GLUTEN" label="Gluten" hide-details density="compact" />
                    <v-checkbox v-model="form.allergens" value="LACTOSE" label="Lactose" hide-details density="compact" />
                    <v-checkbox v-model="form.allergens" value="EGGS" label="Œufs" hide-details density="compact" />
                    <v-checkbox v-model="form.allergens" value="NUTS" label="Noix" hide-details density="compact" />
                    <v-checkbox v-model="form.allergens" value="FISH" label="Poisson" hide-details density="compact" />
                    <v-checkbox v-model="form.allergens" value="SHELLFISH" label="Crustacés" hide-details density="compact" />
                    <v-checkbox v-model="form.allergens" value="SOY" label="Soja" hide-details density="compact" />
                  </div>
                </div>

                <!-- Cost Summary -->
                <v-card rounded="lg" class="mifd-cost-card" elevation="0">
                  <v-card-text class="pa-2">
                    <div class="d-flex align-center justify-space-between mb-1">
                      <span class="text-caption text-medium-emphasis">{{ t('menuItemCreate.summaryTotalCost') }}</span>
                      <span class="text-caption font-weight-bold">{{ formatCurrency(costPerPiece) }}</span>
                    </div>
                    <div class="d-flex align-center justify-space-between mb-1">
                      <span class="text-caption text-medium-emphasis">{{ t('menuItemCreate.summaryBasePrice') }}</span>
                      <span class="text-caption font-weight-bold">{{ formatCurrency(effectiveBasePrice) }}</span>
                    </div>
                    <v-divider class="my-1" />
                    <div class="d-flex align-center justify-space-between">
                      <span class="text-caption font-weight-bold">{{ t('menuItemCreate.summaryMargin') }}</span>
                      <span class="text-caption font-weight-bold" :class="marginColor">{{ marginPercentage }}</span>
                    </div>
                  </v-card-text>
                </v-card>

              </div>

              <!-- Sticky Footer -->
              <div class="mifd-right-footer">
                <v-alert v-if="saveError" type="error" variant="tonal" density="compact" closable class="mb-2" @click:close="saveError = null">
                  {{ saveError }}
                </v-alert>
                <v-btn color="#ff3131" variant="flat" rounded="lg" size="default" block @click="onCreate" class="text-white text-none" :loading="saving">
                  <Save :size="16" class="mr-2" />
                  {{ isEditMode ? t('menuItemCreate.saveEdit') : t('menuItemCreate.save') }}
                </v-btn>
              </div>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Sub-drawers & dialogs -->
  <IngredientPickerDrawer v-model="ingredientDrawer" @add="onIngredientsAdded" />
  <ComponentPickerDrawer v-model="componentDrawer" @add="onComponentsAdded" />
  <PackagingPickerDrawer v-model="packagingDrawer" :is-dark="isDark" @add="onPackagingAdded" />
  <CreateTypeDialog v-model="createTypeDialog" @created="onTypeCreated" />
  <CreateCategoryDialog v-model="createCategoryDialog" :type-name="form.typeName" :type-id="currentTypeId" @created="onCategoryCreated" />
</template>

<script>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useI18n } from '@/i18n/useI18n';
import { createMenuItem, getMenuItemById, updateMenuItem } from '@/api/endpoints/menu-item.api';
import { getIngredient } from '@/api/endpoints/ingredient.api';
import { createProductType, createProductCategory } from '@/api/endpoints/product.api';
import { Plus, X, Save, Trash2, Upload, ImageIcon, UtensilsCrossed } from 'lucide-vue-next';
import IngredientPickerDrawer from './IngredientPickerDrawer.vue';
import ComponentPickerDrawer from './ComponentPickerDrawer.vue';
import PackagingPickerDrawer from './PackagingPickerDrawer.vue';
import CreateTypeDialog from '../dialogs/CreateTypeDialog.vue';
import CreateCategoryDialog from '../dialogs/CreateCategoryDialog.vue';
import { notify } from '@/utils/notify';

const emptyForm = () => ({
  name: '',
  picture: null,
  picturePreview: null,
  spaces: [],
  spacePrices: {},
  typeName: '',
  categoryName: '',
  readyForSale: 'No',
  inventoryPackagingType: null,
  inventoryNumberOfUnits: 1,
  comboItem: 'No',
  basePrice: 0,
  storageTypes: [],
  dietTypes: [],
  allergens: [],
  description: '',
  numberOfPiecesRecipe: 1,
});

export default {
  name: 'MenuItemFormDrawer',
  components: { Plus, X, Save, Trash2, Upload, ImageIcon, UtensilsCrossed, IngredientPickerDrawer, ComponentPickerDrawer, PackagingPickerDrawer, CreateTypeDialog, CreateCategoryDialog },
  props: {
    modelValue: { type: Boolean, default: false },
    menuItemId: { type: String, default: null },
  },
  emits: ['update:modelValue', 'saved'],
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      loading: false,
      saving: false,
      saveError: null,
      form: emptyForm(),
      spacesLoading: false,
      createTypeDialog: false,
      createCategoryDialog: false,
      ingredientDrawer: false,
      componentDrawer: false,
      packagingDrawer: false,
      items: [],
    };
  },
  computed: {
    isEditMode() {
      return !!this.menuItemId;
    },
    spaces() { return this.$store.getters['spaces/spaces']; },
    productTypes() { return this.$store.getters['productTypes/productTypes']; },
    productCategories() { return this.$store.getters['productCategories/productCategories']; },
    packagingCategoryOptions() {
      const filtered = (this.productCategories || [])
        .filter(c => (c.typeName || '').toLowerCase().includes('packag'))
        .map(c => c.name).filter(Boolean);
      return filtered.length ? filtered : ['Bottle', 'Box', 'Bag', 'Crate', 'Can', 'Keg', 'Pouch', 'Carton'];
    },
    tableHeaders() {
      return [
        { title: this.t('menuItemCreate.colName'), key: 'name', width: 180, sortable: false },
        { title: this.t('menuItemCreate.colType'), key: 'type', sortable: false, width: 110 },
        { title: this.t('menuItemCreate.colCategory'), key: 'category', sortable: false, width: 120 },
        { title: this.t('menuItemCreate.colUnit'), key: 'unit', sortable: false, width: 80 },
        { title: this.t('menuItemCreate.colQuantity'), key: 'quantity', sortable: false, width: 110 },
        { title: this.t('menuItemCreate.colUnitCost'), key: 'unitCost', sortable: false, width: 100 },
        { title: this.t('menuItemCreate.colTotalCost'), key: 'totalCost', sortable: false, width: 100 },
        { title: this.t('menuItemCreate.colStorage'), key: 'storage', sortable: false, width: 100 },
        { title: this.t('menuItemCreate.colActions'), key: 'actions', sortable: false, align: 'end', width: 60 },
      ];
    },
    productTypeNamesWithCreate() {
      const existing = (this.productTypes || [])
        .map(t => String(t?.name || '').trim()).filter(Boolean).sort()
        .map(name => ({ title: name, value: name, isCreate: false }));
      return [{ title: this.t('menuItemCreateTypeCreateOption'), value: '__create_type__', isCreate: true }, ...existing];
    },
    filteredCategoryNamesWithCreate() {
      if (!this.form.typeName) return [{ title: this.t('menuItemCreateCategoryCreateOption'), value: '__create_category__', isCreate: true }];
      const type = (this.productTypes || []).find(t => t.name === this.form.typeName);
      const existing = type
        ? (this.productCategories || []).filter(c => c.typeId === (type.id || type._id))
            .map(c => String(c?.name || '').trim()).filter(Boolean).sort()
            .map(name => ({ title: name, value: name, isCreate: false }))
        : [];
      return [{ title: this.t('menuItemCreateCategoryCreateOption'), value: '__create_category__', isCreate: true }, ...existing];
    },
    effectiveBasePrice() {
      if (this.form.spaces && this.form.spaces.length > 0) {
        const prices = this.form.spaces.map(s => Number(this.form.spacePrices[s] ?? 0)).filter(p => p > 0);
        if (!prices.length) return 0;
        return prices.reduce((a, b) => a + b, 0) / prices.length;
      }
      return Number(this.form.basePrice) || 0;
    },
    currentTypeId() {
      const type = (this.productTypes || []).find(t => t.name === this.form.typeName);
      return type ? String(type.id || type._id || '') : '';
    },
    totalCost() {
      return this.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
    },
    costPerPiece() {
      const pieces = Number(this.form.numberOfPiecesRecipe) || 1;
      return this.totalCost / pieces;
    },
    marginPercentage() {
      const base = this.effectiveBasePrice;
      if (!base) return '0.0%';
      return `${(((base - this.costPerPiece) / base) * 100).toFixed(1)}%`;
    },
    marginColor() {
      const base = this.effectiveBasePrice;
      if (!base) return 'text-medium-emphasis';
      return ((base - this.costPerPiece) / base) * 100 >= 60 ? 'text-success' : 'text-error';
    },
  },
  watch: {
    modelValue(open) {
      if (open) this.init();
      else this.reset();
    },
  },
  methods: {
    close() { this.$emit('update:modelValue', false); },
    reset() {
      this.form = emptyForm();
      this.items = [];
      this.saveError = null;
      this.loading = false;
      this.saving = false;
    },
    async init() {
      this.reset();
      await Promise.all([
        this.$store.dispatch('spaces/fetchSpaces'),
        this.$store.dispatch('productTypes/fetchProductTypes', { forceRefresh: true }),
        this.$store.dispatch('productCategories/fetchProductCategories', { forceRefresh: true }),
      ]);
      if (this.isEditMode) await this.loadMenuItemData();
    },
    async onCreate() {
      this.saveError = null;
      if (!this.form.name?.trim()) { this.saveError = "Le nom de l'article est requis."; return; }
      if (!this.form.typeName?.trim()) { this.saveError = "Le type est requis."; return; }
      if (!this.form.categoryName?.trim()) { this.saveError = "La catégorie est requise."; return; }
      if (!this.effectiveBasePrice || Number(this.effectiveBasePrice) <= 0) { this.saveError = "Le prix de base doit être supérieur à 0."; return; }

      this.saving = true;
      try {
        const ingredients = (this.items || []).filter(i => i.type === 'Ingredient' && i.ingredientId)
          .map(i => ({ ingredientId: String(i.ingredientId).trim(), numberOfUnits: Number(i.quantity || 0) })).filter(i => i.ingredientId);
        const components = (this.items || []).filter(i => i.type === 'Component' && i.componentId)
          .map(i => ({ componentId: String(i.componentId).trim(), numberOfUnits: Number(i.quantity || 0) })).filter(i => i.componentId);
        const packagings = (this.items || []).filter(i => i.type === 'Packaging' && i.packagingId)
          .map(i => ({ packagingId: String(i.packagingId).trim(), numberOfUnits: Number(i.quantity || 0) })).filter(i => i.packagingId);

        let typeId = '';
        if (this.form.typeName) {
          const existing = (this.productTypes || []).find(t => t.name === this.form.typeName);
          if (existing) { typeId = String(existing.id || existing._id || ''); }
          else { try { const r = await createProductType({ name: this.form.typeName }); typeId = String(r?.data?.id || r?.id || ''); await this.$store.dispatch('productTypes/fetchProductTypes', { forceRefresh: true }); } catch (e) { console.error(e); } }
        }
        let categoryId = '';
        if (this.form.categoryName) {
          const existing = (this.productCategories || []).find(c => c.name === this.form.categoryName);
          if (existing) { categoryId = String(existing.id || existing._id || ''); }
          else { try { const r = await createProductCategory({ name: this.form.categoryName, typeId }); categoryId = String(r?.data?.id || r?.id || ''); await this.$store.dispatch('productCategories/fetchProductCategories', { forceRefresh: true }); } catch (e) { console.error(e); } }
        }

        const base = this.effectiveBasePrice;
        const cost = this.costPerPiece;
        const margin = base > 0 ? ((base - cost) / base) * 100 : 0;

        let pictureUrl = this.form.picturePreview || '';
        if (this.form.picture instanceof File) {
          const reader = new FileReader();
          pictureUrl = await new Promise(resolve => { reader.onload = e => resolve(e.target.result); reader.readAsDataURL(this.form.picture); });
        }

        const payload = {
          name: String(this.form.name || '').trim(), typeId, categoryId,
          basePrice: base, totalCost: cost, margin,
          description: String(this.form.description || '').trim(),
          picture: pictureUrl,
          allergens: this.form.allergens || [],
          diet: this.form.dietTypes || [],
          storageType: this.form.storageTypes || [],
          readyForSale: String(this.form.readyForSale || 'No'),
          comboItem: String(this.form.comboItem || 'No'),
          numberOfPiecesRecipe: Number(this.form.numberOfPiecesRecipe) || 1,
          inventoryPackagingType: this.form.inventoryPackagingType || null,
          inventoryNumberOfUnits: Number(this.form.inventoryNumberOfUnits) || 1,
          componentsData: {}, components, ingredients, packagings,
        };

        if (this.isEditMode) await updateMenuItem(this.menuItemId, payload);
        else await createMenuItem(payload);

        // Notif au site d'action UTILISATEUR (un seul article, save manuel). Le
        // rattachement en masse (StepMapMenuItems) passe par menu.api.js et n'émet
        // PAS ici → pas de flood.
        notify({
          type: 'menuitem',
          title: this.isEditMode ? 'Article mis à jour' : 'Article créé',
          message: payload.name ? `« ${payload.name} »` : 'Article enregistré',
          meta: { id: this.menuItemId || null },
        });

        await this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true });
        this.$emit('saved');
        this.close();
      } catch (e) {
        console.error(e);
        this.saveError = e?.response?.data?.message || e?.message || "Une erreur est survenue.";
      } finally {
        this.saving = false;
      }
    },
    triggerFileInput() { this.$refs.fileInput.click(); },
    onFileSelected(event) {
      const file = event.target.files[0];
      if (!file) return;
      this.form.picture = file;
      const reader = new FileReader();
      reader.onload = e => { this.form.picturePreview = e.target.result; };
      reader.readAsDataURL(file);
    },
    removePicture() {
      this.form.picture = null;
      this.form.picturePreview = null;
      if (this.$refs.fileInput) this.$refs.fileInput.value = '';
    },
    onTypeSelectChange(value) {
      if (value === '__create_type__') { this.form.typeName = ''; this.createTypeDialog = true; }
      else { this.form.categoryName = ''; }
    },
    onCategorySelectChange(value) {
      if (value === '__create_category__') { this.form.categoryName = ''; this.createCategoryDialog = true; }
    },
    setSpacePrice(spaceId, value) { this.form.spacePrices = { ...this.form.spacePrices, [spaceId]: Number(value) || 0 }; },
    getSpaceName(spaceId) { return (this.spaces || []).find(s => (s.id || s._id) === spaceId)?.name || spaceId; },
    getSpaceMargin(spaceId) {
      const price = Number(this.form.spacePrices[spaceId] || 0);
      if (!price) return '0.0%';
      return `${(((price - this.costPerPiece) / price) * 100).toFixed(1)}%`;
    },
    getSpaceMarginColor(spaceId) {
      const price = Number(this.form.spacePrices[spaceId] || 0);
      if (!price) return 'text-medium-emphasis';
      return ((price - this.costPerPiece) / price) * 100 >= 60 ? 'text-success' : 'text-error';
    },
    removeSpaceFromItem(spaceId) {
      this.form.spaces = this.form.spaces.filter(s => s !== spaceId);
      const prices = { ...this.form.spacePrices };
      delete prices[spaceId];
      this.form.spacePrices = prices;
    },
    onRemoveItem(item) { const i = this.items.indexOf(item); if (i > -1) this.items.splice(i, 1); },
    formatCurrency(v) { const n = Number(v); return Number.isFinite(n) ? `€${n.toFixed(2)}` : '-'; },
    getStorageColor(s) { return { Cold: 'blue', Dry: 'orange', Frozen: 'cyan' }[s] || 'grey'; },
    onIngredientsAdded(items) { this.items = [...this.items, ...items]; },
    onComponentsAdded(items) { this.items = [...this.items, ...items]; },
    onPackagingAdded(items) { this.items = [...this.items, ...items]; },
    onTypeCreated(n) { this.form.typeName = n; this.form.categoryName = ''; },
    onCategoryCreated(n) { this.form.categoryName = n; },
    async loadMenuItemData() {
      this.loading = true;
      try {
        const res = await getMenuItemById(this.menuItemId);
        const mi = res?.data || res;
        if (!mi) { this.close(); return; }
        this.form.name = mi.name || '';
        this.form.basePrice = Number(mi.basePrice) || 0;
        this.form.description = mi.description || '';
        this.form.readyForSale = mi.readyForSale || 'No';
        this.form.inventoryPackagingType = mi.inventoryPackagingType || null;
        this.form.inventoryNumberOfUnits = Number(mi.inventoryNumberOfUnits) || 1;
        this.form.comboItem = mi.comboItem || 'No';
        this.form.numberOfPiecesRecipe = Number(mi.numberOfPiecesRecipe) || 1;
        this.form.storageTypes = Array.isArray(mi.storageType) ? mi.storageType : [];
        this.form.dietTypes = Array.isArray(mi.diet) ? mi.diet : [];
        this.form.allergens = Array.isArray(mi.allergens) ? mi.allergens : [];
        this.form.spaces = Array.isArray(mi.spaceIds) ? mi.spaceIds : [];
        this.form.spacePrices = mi.spacePrices || {};
        if (mi.typeId) { const t = (this.productTypes || []).find(t => (t.id || t._id) === mi.typeId); this.form.typeName = t?.name || ''; }
        if (mi.categoryId) { const c = (this.productCategories || []).find(c => (c.id || c._id) === mi.categoryId); this.form.categoryName = c?.name || ''; }
        const pic = mi.picture || mi.imageUrl || mi.image;
        if (pic) this.form.picturePreview = pic;

        if (Array.isArray(mi.ingredients) && mi.ingredients.length > 0) {
          const promises = mi.ingredients.map(async ing => {
            const id = ing.ingredientId || ing.ingredient_id;
            if (id) {
              try {
                const d = await getIngredient(id);
                const mp = d?.marketPrice || {};
                return { id: `ing-${Date.now()}-${Math.random()}`, name: d.name || mp.itemName || '-', type: 'Ingredient', category: mp.category || '-', unit: d.unit || mp.recipeUnit || '-', quantity: Number(ing.numberOfUnits) || 1, unitCost: Number(ing.unitCost) || 0, totalCost: Number(ing.totalCost) || 0, storage: '-', ingredientId: id, supplierId: '', supplierName: '', supplierItemName: mp.supplierItem || '' };
              } catch { return { id: `ing-${Date.now()}-${Math.random()}`, name: '-', type: 'Ingredient', category: '-', unit: '-', quantity: Number(ing.numberOfUnits) || 1, unitCost: Number(ing.unitCost) || 0, totalCost: Number(ing.totalCost) || 0, storage: '-', ingredientId: id, supplierId: '', supplierName: '', supplierItemName: '' }; }
            }
            return null;
          });
          this.items = (await Promise.all(promises)).filter(Boolean);
        }
        if (Array.isArray(mi.components) && mi.components.length > 0) {
          this.items = [...this.items, ...mi.components.map(c => ({ id: `comp-${Date.now()}-${Math.random()}`, name: c.component?.name || '-', type: 'Component', category: c.component?.category || '-', unit: c.component?.unit || '-', quantity: Number(c.numberOfUnits) || 1, unitCost: Number(c.component?.unitCost) || 0, totalCost: Number(c.numberOfUnits || 0) * Number(c.component?.unitCost || 0), storage: '-', componentId: c.componentId, supplierId: '', supplierName: '', supplierItemName: '' }))];
        }
        if (Array.isArray(mi.packagings) && mi.packagings.length > 0) {
          this.items = [...this.items, ...mi.packagings.map(p => { const pkg = p.packaging || {}; const mp = pkg.marketPrice || {}; return { id: `pkg-${Date.now()}-${Math.random()}`, name: pkg.name || mp.itemName || '-', type: 'Packaging', category: pkg.ingredientCategory || '-', unit: pkg.recipeUnit || mp.unit || '-', quantity: Number(p.numberOfUnits) || 1, unitCost: Number(pkg.costPerRecipeUnit ?? mp.pricePerUnit) || 0, totalCost: Number(p.numberOfUnits || 0) * Number(pkg.costPerRecipeUnit ?? mp.pricePerUnit ?? 0), storage: '-', packagingId: p.packagingId, supplierId: '', supplierName: '', supplierItemName: '' }; })];
        }
      } catch (e) {
        console.error('Error loading menu item:', e);
        this.saveError = e?.message || 'Failed to load menu item';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* === Overlay & Panel === */
.mifd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
}

.mifd-panel {
  width: min(95vw, 1140px);
  height: 100%;
  background: #f6f7fb;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

/* === Transition === */
.mifd-enter-active, .mifd-leave-active { transition: opacity 0.25s ease; }
.mifd-enter-active .mifd-panel, .mifd-leave-active .mifd-panel { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.mifd-enter-from { opacity: 0; }
.mifd-enter-from .mifd-panel { transform: translateX(100%); }
.mifd-leave-to { opacity: 0; }
.mifd-leave-to .mifd-panel { transform: translateX(100%); }

/* === Header === */
.mifd-header {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px 14px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49,.25);
}
.mifd-header__icon {
  width: 38px; height: 38px; border-radius: 10px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.mifd-header__text { flex: 1; }
.mifd-header__title { font-size: 15px; font-weight: 700; color: #fff; }
.mifd-header__sub { font-size: 11.5px; color: rgba(255,255,255,.72); margin-top: 1px; }
.mifd-header__close {
  background: rgba(255,255,255,.15); border: none; cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; transition: background .15s; flex-shrink: 0;
}
.mifd-header__close:hover { background: rgba(255,255,255,.25); }

/* === Body: two columns === */
.mifd-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* Left: ingredients table */
.mifd-left {
  flex: 3;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e5e7eb;
  background: #f6f7fb;
  overflow: hidden;
}

.mifd-left-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  border-bottom: 1px solid #e5e7eb;
  background: #f6f7fb;
  flex-wrap: wrap;
  gap: 4px;
}

.mifd-table-card {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: white;
  border: 1px solid #e5e7eb;
  margin: 10px;
  border-radius: 12px;
}

/* Right: form */
.mifd-right {
  flex: 2;
  min-width: 280px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  background: white;
  overflow: hidden;
}

.mifd-right-scroll {
  flex: 1 1 0;
  overflow-y: auto;
  padding: 10px 12px;
  min-height: 0;
}

.mifd-right-footer {
  flex-shrink: 0;
  padding: 6px 12px 8px;
  background: white;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
}

/* === Form elements === */
.mifd-field-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 4px;
  letter-spacing: 0.01em;
}
.mifd-required-star { color: #ff3131; font-weight: 700; margin-left: 2px; }

.mifd-section-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #9ca3af;
  margin-top: 4px;
}

.mifd-section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e5e7eb;
}

.mifd-checkbox-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 4px;
}

.mifd-picture-upload {
  border: 2px dashed #e5e7eb;
  background: #f9fafb;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mifd-picture-upload:hover {
  border-color: #ff3131;
  background: #fef2f2;
}

.mifd-picture-preview {
  position: relative;
}

.mifd-picture-preview img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
}

.mifd-picture-remove {
  position: absolute;
  top: 4px;
  right: 4px;
}

.mifd-inventory-card {
  background: #eff6ff;
  border: 1.5px solid #dbeafe;
  border-radius: 10px;
  padding: 10px;
}

.mifd-inventory-title {
  font-size: 0.72rem;
  font-weight: 700;
  color: #1e40af;
}

.mifd-cost-card {
  background: #eff6ff;
  border: 1px solid #dbeafe;
  margin-bottom: 4px;
}

/* === Table styles === */
.mifd-table :deep(thead th),
.mifd-table :deep(thead th .v-data-table-header__content),
.mifd-table :deep(thead th span) {
  font-size: 0.68rem !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  white-space: nowrap;
  color: #374151 !important;
}

.mifd-table :deep(tbody td),
.mifd-table :deep(tbody td span),
.mifd-table :deep(tbody td div) {
  font-size: 0.75rem !important;
  padding-top: 5px !important;
  padding-bottom: 5px !important;
}

/* === Font reduction for form fields === */
.mifd-right :deep(.v-field__input),
.mifd-right :deep(.v-field-label),
.mifd-right :deep(.v-select__selection-text),
.mifd-right :deep(.v-field__input input),
.mifd-right :deep(.v-list-item-title) {
  font-size: 0.75rem !important;
}

.mifd-right :deep(.v-checkbox .v-label),
.mifd-right :deep(.v-checkbox-btn .v-label) {
  font-size: 0.72rem !important;
}

.mifd-right :deep(.v-chip) {
  font-size: 0.7rem !important;
}

/* === Price Cards === */
.mifd-price-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.mifd-price-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}

.mifd-price-input { flex: 1; }

.mifd-space-badge {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.mifd-price-summary {
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  padding: 7px 12px 6px;
}

.mifd-price-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}

.mifd-price-summary-label {
  font-size: 0.68rem;
  color: #64748b;
}

.mifd-price-summary-value {
  font-size: 0.7rem;
  font-weight: 600;
  color: #374151;
}

.mifd-price-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 5px 0;
}

.mifd-margin-value {
  font-size: 0.72rem;
  font-weight: 700;
}

/* === Dark mode === */
.mifd--dark .mifd-header { background: #ff3131; border-color: transparent; }
.mifd--dark .mifd-panel { background: #111827; }
.mifd--dark .mifd-left { background: #111827; border-color: #374151; }
.mifd--dark .mifd-left-header { background: #1f2937; border-color: #374151; }
.mifd--dark .mifd-right { background: #1f2937; }
.mifd--dark .mifd-right-footer { background: #1f2937; border-color: #374151; }
.mifd--dark .mifd-table-card { background: #1f2937; border-color: #374151; }
.mifd--dark .mifd-field-label { color: rgba(255,255,255,0.7); }
.mifd--dark .mifd-title { color: rgba(255,255,255,0.87); }
.mifd--dark .mifd-inventory-card { background: #1e3a5f; border-color: #2563eb; }
.mifd--dark .mifd-cost-card { background: #1e3a5f; border-color: #2563eb; }
.mifd--dark .mifd-section-divider { color: rgba(255,255,255,0.4); }
.mifd--dark .mifd-section-divider::after { background: #374151; }
.mifd--dark .mifd-price-card { border-color: #374151; }
.mifd--dark .mifd-space-badge { background: #1e3a5f; color: #93c5fd; border-color: #2563eb; }
.mifd--dark .mifd-price-summary { background: #0f172a; border-color: #374151; }
.mifd--dark .mifd-price-summary-value { color: rgba(255,255,255,0.87); }
.mifd--dark .mifd-price-divider { background: #374151; }

/* create-option highlight */
:deep(.create-option .v-list-item-title) { color: #ff3131; font-weight: 600; }
</style>
