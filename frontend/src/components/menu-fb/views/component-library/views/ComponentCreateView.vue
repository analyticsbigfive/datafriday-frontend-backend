<template>
  <v-app id="component-create-page" :class="{ 'cc--dark': isDark }">
    <v-container fluid class="pa-0" style="height: 100%; overflow: hidden; display: flex; flex-direction: column;">
      <!-- ── Gradient Header ── -->
      <div class="cc-header">
        <div class="cc-header__icon">
          <Boxes :size="22" color="white" />
        </div>
        <div class="cc-header__text">
          <h1 class="cc-header__title">{{ isEditMode ? t('compCreateTitleEdit') : t('compCreateTitleCreate') }}</h1>
          <p class="cc-header__sub">
            {{ isEditMode ? t('compCreateSubtitleEdit') : t('compCreateSubtitleCreate') }}
          </p>
        </div>
        <div class="cc-header__actions">
          <button class="cc-back-btn" @click="onCancel">
            <ChevronDown :size="15" style="transform:rotate(90deg)" /> {{ t('compCreateBack') }}
          </button>
        </div>
      </div>

      <v-container fluid class="cc-content">
        <v-row dense class="cc-row">

          <!-- ── Left: Sub-items ── -->
          <v-col cols="12" md="8" class="cc-left-col">
            <div class="cc-left-card">

              <!-- Card header -->
              <div class="cc-card-head">
                <div>
                  <div class="cc-card-title">{{ t('compCreateSubItemsTitle') }}</div>
                  <div class="cc-card-sub">{{ isEditMode ? t('compCreateSubItemsSubtitleEdit') : t('compCreateSubItemsSubtitleCreate') }}</div>
                </div>
                <div class="cc-add-btns">
                  <button class="cc-add-btn cc-add-btn--primary" type="button" @click="onAddIngredient">
                    <Plus :size="14" /> {{ t('compCreateAddIngredient') }}
                  </button>
                  <button class="cc-add-btn cc-add-btn--outline" type="button" @click="onAddSubComponent">
                    <Plus :size="14" /> {{ t('compCreateAddComponent') }}
                  </button>
                </div>
              </div>

              <!-- Stats -->
              <div class="cc-stats">
                <div class="cc-stat">
                  <span class="cc-stat__label">{{ t('compCreateStatTotalItems') }}</span>
                  <span class="cc-stat__value">{{ totalItems }}</span>
                </div>
                <div class="cc-stat">
                  <span class="cc-stat__label">{{ t('compCreateStatSubItemsCost') }}</span>
                  <span class="cc-stat__value cc-stat__value--blue">{{ formatCurrency(subItemsCost) }}</span>
                </div>
                <div class="cc-stat">
                  <span class="cc-stat__label">{{ t('compCreateStatFinalUnitCost') }}</span>
                  <span class="cc-stat__value cc-stat__value--green">{{ formatCurrency(finalUnitCost) }}</span>
                </div>
              </div>

              <!-- Table or empty -->
              <div class="cc-table-wrap">
                <div v-if="totalItems === 0" class="cc-empty">
                  <div class="cc-empty__icon">
                    <Package :size="36" color="#9ca3af" />
                  </div>
                  <div class="cc-empty__title">{{ t('compCreateEmptyTitle') }}</div>
                  <div class="cc-empty__sub">{{ t('compCreateEmptySubtitle') }}</div>
                </div>

                <v-data-table v-else
                  :headers="subItemsHeaders"
                  :items="subItemsTableItems"
                  item-value="rowKey"
                  density="comfortable"
                  class="cc-table"
                >
                  <template #item.type="{ item }">
                    <span class="ccv-badge" :class="(item?.raw?.itemType || item?.itemType) === 'Ingredient' ? 'ccv-badge--ingredient' : 'ccv-badge--component'">
                      {{ item?.raw?.itemType || item?.itemType || "Item" }}
                    </span>
                  </template>

                  <template #item.itemName="{ item }">
                    <div class="cc-row-name">
                      <span class="cc-row-name__dot" :style="{ background: (item?.raw?.itemType || item?.itemType) === 'Ingredient' ? '#10b981' : '#3b82f6' }"></span>
                      <div>
                        <div class="cc-row-name__text">{{ item?.raw?.supplierItemName || item?.supplierItemName || item?.raw?.itemName || item?.itemName || "-" }}</div>
                        <div v-if="(item?.raw?.supplierItemName || item?.supplierItemName) && (item?.raw?.itemName || item?.itemName)" class="cc-row-name__sub">
                          {{ item?.raw?.itemName || item?.itemName }}
                        </div>
                      </div>
                    </div>
                  </template>

                  <template #item.category="{ item }">
                    <span v-if="(item?.raw?.category || item?.category) || (item?.raw?.goodType || item?.goodType)" class="ccv-badge ccv-badge--category">
                      {{ item?.raw?.category || item?.category || item?.raw?.goodType || item?.goodType }}
                    </span>
                  </template>

                  <template #item.numberOfUnits="{ item }">
                    <input
                      type="text"
                      inputmode="decimal"
                      class="cc-qty-input"
                      :value="getSubItemQtyDisplay(item?.raw || item)"
                      @input="(e) => onSubItemQtyInput(item?.raw || item, e.target.value)"
                      @blur="(e) => onSubItemQtyBlur(item?.raw || item, e.target.value)"
                    />
                  </template>

                  <template #item.unit="{ item }">
                    <span class="ccv-badge ccv-badge--unit">{{ item?.raw?.unit || item?.raw?.recipeUnit || item?.unit || item?.recipeUnit || "-" }}</span>
                  </template>

                  <template #item.cost="{ item }">
                    <span class="cc-cost">{{ formatCurrency(Number(item?.raw?.cost ?? item?.cost ?? 0)) }}</span>
                  </template>

                  <template #item.storage="{ item }">
                    <span class="ccv-badge ccv-badge--storage">{{ item?.raw?.storageType || item?.storageType || "Dry" }}</span>
                  </template>

                  <template #item.supplierName="{ item }">
                    <span class="cc-muted">{{ item?.raw?.supplierName || item?.supplierName || "-" }}</span>
                  </template>

                  <template #item.addedAt="{ item }">
                    <span class="cc-muted">{{ formatAddedAt(item?.raw?.addedAt || item?.addedAt) }}</span>
                  </template>

                  <template #item.actions="{ item }">
                    <button class="cc-del-btn" type="button" @click.stop="onRemoveSubItem(item?.raw || item)">
                      <Trash2 :size="14" />
                    </button>
                  </template>
                </v-data-table>
              </div>

            </div>
          </v-col>

          <!-- ── Right: Form ── -->
          <v-col cols="12" md="4">
            <div class="cc-right-panel">

              <!-- Sticky header -->
              <div class="cc-form-head">
                <div>
                  <div class="cc-form-title">{{ t('compCreateDetailsTitle') }}</div>
                  <div class="cc-form-sub">{{ t('compCreateDetailsSubtitle') }}</div>
                </div>
              </div>

              <!-- Scrollable body -->
              <v-form v-model="formValid" class="cc-form-body">

                <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">{{ error }}</v-alert>
                <v-alert v-if="loadingError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">{{ loadingError }}</v-alert>
                <div v-if="loadingComponent" class="d-flex justify-center align-center py-8">
                  <v-progress-circular indeterminate color="#ff3131" size="32" />
                </div>

                <!-- Section: Général -->
                <div class="ccf-section-label">Général</div>

                <div class="ccf-field-wrap mb-3">
                  <label class="ccf-field-label">{{ t('compCreateFieldName') }} <span class="ccf-required">*</span></label>
                  <v-text-field
                    v-model="form.name"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    :rules="[rules.required]"
                    class="ccf-field"
                  />
                </div>

                <div class="ccf-field-wrap mb-3">
                  <label class="ccf-field-label">{{ t('compCreateFieldType') }} <span class="ccf-required">*</span></label>
                  <v-select
                    v-model="form.type"
                    :items="typeOptions"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    :rules="[rules.required]"
                    class="ccf-field"
                    :menu-props="{ zIndex: 10000 }"
                  >
                    <template #item="{ item, props }">
                      <v-list-item v-bind="props" :style="item.raw === t('compCreateNewTypeOption') ? 'color:#ff3131;font-weight:600' : ''" />
                    </template>
                  </v-select>
                </div>

                <div class="ccf-field-wrap mb-3">
                  <label class="ccf-field-label">{{ t('compCreateFieldCategory') }} <span class="ccf-required">*</span></label>
                  <v-select
                    v-model="form.category"
                    :items="categoryOptions"
                    :disabled="!form.type"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    :rules="[rules.required]"
                    class="ccf-field"
                    :menu-props="{ zIndex: 10000 }"
                  >
                    <template #item="{ item, props }">
                      <v-list-item v-bind="props" :style="item.raw === t('compCreateNewCategoryOption') ? 'color:#ff3131;font-weight:600' : ''" />
                    </template>
                  </v-select>
                </div>

                <!-- Section: Configuration -->
                <div class="ccf-section-label mt-1">Configuration</div>

                <div class="ccf-field-wrap mb-3">
                  <label class="ccf-field-label">{{ t('compCreateFieldUnit') }} <span class="ccf-required">*</span></label>
                  <v-select
                    v-model="form.unit"
                    :items="unitOptions"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    :rules="[rules.required]"
                    class="ccf-field"
                    :menu-props="{ zIndex: 10000 }"
                  />
                </div>

                <div class="ccf-field-wrap mb-3">
                  <label class="ccf-field-label">{{ t('compCreateFieldUnitsPerRecipe') }}</label>
                  <v-text-field
                    v-model.number="form.numberOfUnitsRecipe"
                    type="number"
                    min="1"
                    step="1"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    :rules="[rules.positive]"
                    class="ccf-field"
                  />
                </div>

                <!-- Inventory Information -->
                <div class="cc-info-card mb-3">
                  <div class="cc-info-card__title">{{ t('inventoryInfo') }}</div>
                  <div class="cc-info-card__row">
                    <span class="cc-info-card__chip">{{ form.name || '…' }}</span>
                    <span class="cc-info-label">{{ t('isStoredIn') }}</span>
                    <select v-model="form.inventoryPackaging" class="cc-inline-select cc-info-card__select" @change="onPackagingSelectChange($event)">
                      <option value="">—</option>
                      <option value="__add_packaging__" style="color:#ff3131; font-weight:600;">+ {{ locale === 'fr' ? 'Ajouter un packaging type' : 'Add packaging type' }}</option>
                      <option v-for="opt in packagingCategoryOptions" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                    <span class="cc-info-label">{{ t('of') }}</span>
                    <input v-model.number="form.packedUnits" type="number" min="0" step="0.001" class="cc-inline-input" style="width:80px;" />
                    <span class="cc-info-card__unit-badge">{{ form.unit || '—' }}</span>
                    <span class="cc-info-label cc-info-label--dot">.</span>
                  </div>

                  <!-- Storage Type (dans la card) -->
                  <div class="cc-info-card__field">
                    <label class="cc-info-card__field-label">{{ t('compCreateFieldStorageType') }} <span class="ccf-required">*</span></label>
                    <v-select
                      v-model="form.storageType"
                      :items="storageTypeOptions"
                      variant="outlined"
                      density="compact"
                      hide-details="auto"
                      :rules="[rules.required]"
                      class="ccf-field"
                      :menu-props="{ zIndex: 10000 }"
                    />
                  </div>
                </div>

                <div class="ccf-field-wrap mb-3">
                  <label class="ccf-field-label">{{ t('compCreateFieldReadyForSale') }}</label>
                  <v-select
                    v-model="form.readyForSale"
                    :items="readyForSaleOptions"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    class="ccf-field"
                    :menu-props="{ zIndex: 10000 }"
                  />
                </div>

                <div v-if="form.readyForSale === 'Yes'" class="ccf-field-wrap mb-3">
                  <label class="ccf-field-label">{{ t('compCreateFieldKitchenType') }}</label>
                  <v-select
                    v-model="form.kitchenType"
                    :items="kitchenTypeOptions"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    clearable
                    class="ccf-field"
                    :menu-props="{ zIndex: 10000 }"
                  />
                </div>

                <!-- Calc card -->
                <div class="cc-calc-card">
                  <div class="cc-calc-card__label">{{ t('compCreateCalcTitle') }}</div>
                  <div class="cc-calc-card__amount">{{ formatCurrency(finalUnitCost) }}</div>
                  <div class="cc-calc-card__divider"></div>
                  <div class="cc-calc-card__row">
                    <span>{{ t('compCreateCalcSubItems') }}</span>
                    <span>{{ formatCurrency(subItemsCost) }}</span>
                  </div>
                  <div class="cc-calc-card__row">
                    <span>÷ {{ Number(form.numberOfUnitsRecipe || 1).toFixed(2) }} {{ t('compCreateCalcUnits') }}</span>
                    <span class="cc-calc-card__result">= {{ formatCurrency(finalUnitCost) }}</span>
                  </div>
                </div>

                <!-- Section: Extra -->
                <div class="ccf-section-label mt-1">Extra</div>

                <div class="ccf-field-wrap mb-3">
                  <label class="ccf-field-label">{{ t('compCreateFieldAllergens') }}</label>
                  <v-combobox
                    v-model="form.allergens"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    multiple
                    chips
                    closable-chips
                    class="ccf-field"
                    :menu-props="{ zIndex: 10000 }"
                  />
                </div>

                <div class="ccf-field-wrap">
                  <label class="ccf-field-label">{{ t('compCreateFieldDescription') }}</label>
                  <v-textarea
                    v-model="form.description"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    rows="4"
                    auto-grow
                    class="ccf-field"
                  />
                </div>

              </v-form>

              <!-- Sticky footer -->
              <div class="cc-form-footer">
                <button class="cc-pill-btn cc-pill-btn--outline" type="button" @click="onCancel">
                  {{ t('compCreateCancel') }}
                </button>
                <button
                  class="cc-pill-btn cc-pill-btn--primary"
                  type="button"
                  :disabled="saving || !formValid"
                  @click="onSave"
                >
                  <Save :size="15" /> {{ saving ? 'Sauvegarde…' : (isEditMode ? t('compCreateSaveEdit') : t('compCreateSaveCreate')) }}
                </button>
              </div>

            </div>
          </v-col>

        </v-row>
      </v-container>
    </v-container>

    <IngredientPickerDrawer v-model="ingredientDrawer" :is-dark="isDark" @add="onIngredientsAdded" />
    <ComponentPickerDrawer v-model="componentDrawer" :is-dark="isDark" @add="onComponentsAdded" />
    <NewCategoryDialog v-model="newCategoryDialog" :is-dark="isDark" :type-id="selectedComponentTypeId" :type-name="form.type" @created="onCategoryCreated" />
    <NewTypeDialog v-model="newTypeDialog" :is-dark="isDark" @created="onTypeCreated" />

    <!-- Création d'un packaging type (depuis le select « stored in ») -->
    <v-dialog v-model="packagingCreateOpen" max-width="420" :persistent="packagingCreateLoading">
      <div class="cc-pk-dialog" :class="{ 'cc-pk-dialog--dark': isDark }">
        <div class="cc-pk-dialog__header">
          <Package :size="18" color="#fff" />
          <span style="flex:1">{{ locale === 'fr' ? 'Ajouter un packaging type' : 'Add packaging type' }}</span>
          <button class="cc-pk-dialog__close" :disabled="packagingCreateLoading" @click="packagingCreateOpen = false"><X :size="16" /></button>
        </div>
        <div v-if="packagingCreateError" class="cc-pk-dialog__error">{{ packagingCreateError }}</div>
        <div class="cc-pk-dialog__body">
          <label class="cc-info-card__field-label" for="cc-pk-name">{{ locale === 'fr' ? 'Nom du packaging' : 'Packaging name' }} <span class="ccf-required">*</span></label>
          <input id="cc-pk-name" v-model="packagingCreateForm.name" type="text" class="cc-inline-input" style="width:100%; margin-top:6px;" :disabled="packagingCreateLoading" @keyup.enter="submitPackagingCreate" />
        </div>
        <div class="cc-pk-dialog__footer">
          <button class="cc-pk-btn cc-pk-btn--cancel" :disabled="packagingCreateLoading" @click="packagingCreateOpen = false">{{ locale === 'fr' ? 'Annuler' : 'Cancel' }}</button>
          <button class="cc-pk-btn cc-pk-btn--primary" :disabled="!packagingCreateForm.name.trim() || packagingCreateLoading" @click="submitPackagingCreate">
            {{ locale === 'fr' ? 'Ajouter' : 'Add' }}
          </button>
        </div>
      </div>
    </v-dialog>
  </v-app>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { Boxes, ChevronDown, Plus, Save, Trash2, X, Package } from "lucide-vue-next";
import { useI18n } from '@/i18n/useI18n';
import { createMenuComponent, getMenuComponent, updateMenuComponent } from "@/api/endpoints/menu.api";
import { getIngredient } from "@/api/endpoints/ingredient.api";
import { createPackingType } from "@/api/endpoints/packing-type.api";
import IngredientPickerDrawer from '../drawers/IngredientPickerDrawer.vue';
import ComponentPickerDrawer from '../drawers/ComponentPickerDrawer.vue';
import NewCategoryDialog from '../dialogs/NewCategoryDialog.vue';
import NewTypeDialog from '../dialogs/NewTypeDialog.vue';

export default {
  name: "ComponentCreateView",
  components: {
    Boxes,
    ChevronDown,
    Plus,
    Save,
    Trash2,
    X,
    Package,
    IngredientPickerDrawer,
    ComponentPickerDrawer,
    NewCategoryDialog,
    NewTypeDialog,
  },
  setup() {
    const { t, locale } = useI18n();
    const theme = useTheme();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, locale, isDark };
  },
  data() {
    return {
      componentId: null,
      isEditMode: false,
      loadingComponent: false,
      loadingError: "",

      saving: false,
      formValid: false,
      error: "",

      ingredientDrawer: false,
      _qtyDraft: {},  // rowKey → string en cours de saisie

      componentDrawer: false,
      _prefillingForm: false,
      // Lien FK taxonomie (componentTypeId/componentCategoryId) tel que chargé depuis le
      // backend en mode édition — préservé tant que form.type/form.category ne changent pas
      // (voir selectedComponentTypeId/selectedComponentCategoryId).
      _loadedTaxonomy: { typeId: "", categoryId: "", typeName: "", categoryName: "" },
      form: {
        name: "",
        category: "",
        type: "",
        unit: "",
        numberOfUnitsRecipe: 1,
        storageType: "",
        readyForSale: "No",
        kitchenType: null,
        description: "",
        allergens: [],
        ingredients: [],
        children: [],
        inventoryPackaging: "",
        packedUnits: 0,
      },

      unitOptions: ["Kg", "L", "Pc"],
      storageTypeOptions: ["Dry Storage", "Cold", "Frozen"],
      readyForSaleOptions: ["Yes", "No"],
      rules: {
        required: (v) => !!String(v ?? "").trim() || "Required",
        positive: (v) => Number(v) > 0 || "Must be > 0",
      },

      newCategoryDialog: false,
      newTypeDialog: false,

      packagingCreateOpen: false,
      packagingCreateLoading: false,
      packagingCreateError: "",
      packagingCreateForm: { name: "" },
    };
  },
  computed: {
    kitchenTypeOptions() {
      return [
        { title: this.t('compKitchenCentral'), value: 'Central' },
        { title: this.t('compKitchenLocal'), value: 'Local' },
      ];
    },
    // Données depuis le store (avec cache TTL) — taxonomie Component dédiée,
    // indépendante de Product Type/Category (Menu Item).
    componentTypesList() {
      return this.$store.getters['componentTypes/componentTypes']
    },
    componentCategoriesList() {
      return this.$store.getters['componentCategories/componentCategories']
    },
    typeOptions() {
      const existing = this.componentTypesList
        .map(t => String(t?.name ?? '').trim()).filter(Boolean)
      return [this.t('compCreateNewTypeOption'), ...existing]
    },
    // Cascade : la Category est filtrée par le Type sélectionné (une Category
    // appartient toujours à un Type, cf. ComponentCategory.typeId côté backend).
    categoryOptions() {
      const type = String(this.form.type ?? '').trim()
      const existing = this.componentCategoriesList
        .filter(c => !type || String(c?.typeName ?? '').trim() === type)
        .map(c => String(c?.name ?? '').trim()).filter(Boolean)
      return [this.t('compCreateNewCategoryOption'), ...existing]
    },
    // Options du select « stored in » : les Packaging Types (store packingTypes).
    packagingCategoryOptions() {
      return (this.$store.getters['packingTypes/packingTypes'] || [])
        .map(p => String(p?.name ?? '').trim())
        .filter(Boolean)
    },
    selectedComponentTypeId() {
      const type = String(this.form.type ?? '').trim()
      if (this._loadedTaxonomy.typeId && type === String(this._loadedTaxonomy.typeName ?? '').trim()) {
        return this._loadedTaxonomy.typeId
      }
      return this.componentTypesList.find(t => String(t?.name ?? '').trim() === type)?.id || ''
    },
    selectedComponentCategoryId() {
      const category = String(this.form.category ?? '').trim()
      if (this._loadedTaxonomy.categoryId && category === String(this._loadedTaxonomy.categoryName ?? '').trim()) {
        return this._loadedTaxonomy.categoryId
      }
      const typeId = this.selectedComponentTypeId
      return this.componentCategoriesList.find(c =>
        String(c?.name ?? '').trim() === category && (!typeId || c?.typeId === typeId)
      )?.id || ''
    },
    subItemsHeaders() {
      return [
        { title: 'Type',       key: 'type',          sortable: false, width: 90 },
        { title: 'Name',       key: 'itemName',      width: 130 },
        { title: 'Category',   key: 'category',      width: 100 },
        { title: 'Quantity',    key: 'numberOfUnits', sortable: false, width: 110 },
        { title: 'Unit',       key: 'unit',          sortable: false, width: 70 },
        { title: 'Cost (€)',   key: 'cost',          sortable: false, width: 90 },
        { title: 'Storage',    key: 'storage',       sortable: false, width: 90 },
        { title: 'Supplier',   key: 'supplierName',  sortable: false, width: 100 },
        { title: 'Added',      key: 'addedAt',       sortable: false, width: 90 },
        { title: '',           key: 'actions',       sortable: false, width: 50 },
      ];
    },
    subItemsTableItems() {
      const ingredients = Array.isArray(this.form.ingredients) ? this.form.ingredients : [];
      const children = Array.isArray(this.form.children) ? this.form.children : [];

      const ingRows = ingredients.map((i) => ({
        ...i,
        rowKey: `ing-${i?.marketPriceId || i?.itemName || Math.random().toString(36).slice(2)}`,
        itemType: "Ingredient",
        numberOfUnits: Number(i?.quantity ?? i?.numberOfUnits ?? 0) || 0,
        unit: i?.unit ?? i?.recipeUnit,
        cost: Number(i?.cost ?? i?.totalCost ?? 0) || 0,
        supplierName: i?.supplierName || "-",
        addedAt: i?.addedAt || new Date().toISOString(),
      }));

      const childRows = children.map((c) => ({
        ...c,
        rowKey: `comp-${c?.childId || c?.componentId || c?.id || c?.itemName || Math.random().toString(36).slice(2)}`,
        itemType: "Component",
        numberOfUnits: Number(c?.quantity ?? c?.numberOfUnits ?? 1) || 1,
        cost: Number(c?.totalCost ?? c?.cost ?? c?.unitCost ?? 0) || 0,
        supplierName: c?.supplierName || "-",
        addedAt: c?.addedAt || new Date().toISOString(),
      }));

      return [...ingRows, ...childRows];
    },
    totalItems() {
      const ingredients = Array.isArray(this.form.ingredients) ? this.form.ingredients.length : 0;
      const children = Array.isArray(this.form.children) ? this.form.children.length : 0;
      return ingredients + children;
    },
    subItemsCost() {
      const ingredients = Array.isArray(this.form.ingredients) ? this.form.ingredients : [];
      const children = Array.isArray(this.form.children) ? this.form.children : [];
      const ingCost = ingredients.reduce((sum, i) => sum + (Number(i?.cost ?? i?.totalCost ?? 0) || 0), 0);
      const childCost = children.reduce((sum, c) => sum + (Number(c?.totalCost ?? 0) || 0), 0);
      return ingCost + childCost;
    },
    finalUnitCost() {
      const units = Number(this.form.numberOfUnitsRecipe);
      const cost = Number(this.subItemsCost);
      if (!Number.isFinite(units) || units <= 0) return 0;
      if (!Number.isFinite(cost) || cost <= 0) return 0;
      return cost / units;
    },
  },
  watch: {
    'form.category'(v) {
      if (v === this.t('compCreateNewCategoryOption')) {
        this.form.category = ''
        this.newCategoryDialog = true
      }
    },
    'form.type'(v) {
      if (v === this.t('compCreateNewTypeOption')) {
        this.form.type = ''
        this.newTypeDialog = true
        return
      }
      // Cascade : changer de Type invalide la Category déjà choisie (elle
      // appartenait à l'ancien Type). Ignoré pendant le préremplissage du
      // formulaire en mode édition (loadComponentData).
      if (!this._prefillingForm) {
        this.form.category = ''
      }
    },
  },
  methods: {
    getStorageTypeForCategory(category) {
      const c = String(category || "").trim();
      if (!c) return "Dry";
      const coldCategories = ["Fish", "Meat", "Cheese", "Dairy"];
      const freezerCategories = ["Ice Cream", "Frozen"];
      if (coldCategories.includes(c)) return "Cold";
      if (freezerCategories.includes(c)) return "Frozen";
      return "Dry";
    },

    formatCurrency(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return "€0.00";
      return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
    },
    // Colonne « Added » au format dd/mm/yyyy hh:mm.
    formatAddedAt(value) {
      if (!value || value === "-") return "-";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return "-";
      const pad = (n) => String(n).padStart(2, "0");
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    onAddIngredient() {
      this.ingredientDrawer = true;
    },
    onAddSubComponent() {
      this.componentDrawer = true;
    },

    onIngredientsAdded(items) {
      // Si un ingrédient déjà présent est resélectionné, on remplace sa ligne au lieu de la
      // dupliquer (un doublon aurait causé une suppression groupée involontaire, cf. BUG-058).
      const incomingIds = new Set(items.map((i) => i?.marketPriceId || i?.ingredientId));
      const existing = (this.form.ingredients || []).filter((i) => !incomingIds.has(i?.marketPriceId || i?.ingredientId));
      this.form.ingredients = [...existing, ...items];
    },
    onComponentsAdded(items) {
      const incomingIds = new Set(items.map((c) => c?.childId || c?.componentId));
      const existing = (this.form.children || []).filter((c) => !incomingIds.has(c?.childId || c?.componentId));
      this.form.children = [...existing, ...items];
    },
    onCategoryCreated(name) {
      this.form.category = name;
    },
    onTypeCreated(name) {
      this.form.type = name;
    },

    // Select « stored in » : ouvre le dialog de création si l'option dédiée est choisie.
    onPackagingSelectChange(e) {
      if (e.target.value === '__add_packaging__') {
        this.form.inventoryPackaging = '';
        this.packagingCreateError = '';
        this.packagingCreateForm = { name: '' };
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
        this.$store.dispatch('packingTypes/addPackingType', { ...res, id, name });
        this.$store.dispatch('packingTypes/fetchPackingTypes', { forceRefresh: true });
        this.form.inventoryPackaging = name;
        this.packagingCreateOpen = false;
        this.packagingCreateForm = { name: '' };
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '';
        const msgStr = Array.isArray(msg) ? msg.join(', ') : String(msg);
        this.packagingCreateError = msgStr.includes('Unique constraint')
          ? (this.locale === 'fr' ? `Un packaging type "${name}" existe déjà.` : `A packaging type "${name}" already exists.`)
          : msgStr || (this.locale === 'fr' ? 'Échec de la création.' : 'Creation failed.');
      } finally {
        this.packagingCreateLoading = false;
      }
    },

    // Helpers pour la saisie décimale de la quantité
    _rowKey(row) {
      return row?.rowKey || row?.marketPriceId || row?.componentId || '';
    },
    getSubItemQtyDisplay(row) {
      const key = this._rowKey(row);
      if (Object.prototype.hasOwnProperty.call(this._qtyDraft, key)) {
        return this._qtyDraft[key];
      }
      const val = row?.numberOfUnits ?? row?.quantity ?? 1;
      return String(Number(val) || 0);
    },
    onSubItemQtyInput(row, rawValue) {
      // Autoriser chiffres, point, virgule, signe moins
      if (/^-?[\d]*[.,]?\d*$/.test(rawValue)) {
        const key = this._rowKey(row);
        this._qtyDraft = { ...this._qtyDraft, [key]: rawValue };
      }
    },
    onSubItemQtyBlur(row, rawValue) {
      const key = this._rowKey(row);
      // Nettoyer le draft
      const draft = { ...this._qtyDraft };
      delete draft[key];
      this._qtyDraft = draft;
      // Parser et appliquer
      const parsed = parseFloat(String(rawValue).replace(',', '.'));
      const units = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      this.onUpdateSubItemUnits(row, units);
    },

    onUpdateSubItemUnits(row, value) {
      const units = Math.max(0, Number(value) || 0);
      const type = String(row?.itemType || "");

      if (type === "Component") {
        const targetId = row?.childId || row?.componentId;
        if (!targetId) return;
        this.form.children = (this.form.children || []).map((c) => {
          if ((c?.childId || c?.componentId) !== targetId) return c;
          const unitCost = Number(c?.unitCost) || 0;
          return { ...c, quantity: units, totalCost: unitCost * units };
        });
        return;
      }

      const targetId = row?.marketPriceId;
      if (!targetId) return;
      this.form.ingredients = (this.form.ingredients || []).map((i) => {
        if (i?.marketPriceId !== targetId) return i;
        const unitCost = Number(i?.unitCost ?? i?.costPerRecipeUnit ?? 0) || 0;
        const cost = unitCost * units;
        return { ...i, quantity: units, unitCost, cost };
      });
    },

    onRemoveSubItem(row) {
      const type = String(row?.itemType || "");
      if (type === "Component") {
        const targetId = row?.childId || row?.componentId;
        if (!targetId) return;
        this.form.children = (this.form.children || []).filter((c) => (c?.childId || c?.componentId) !== targetId);
        return;
      }
      const targetId = row?.marketPriceId;
      if (!targetId) return;
      this.form.ingredients = (this.form.ingredients || []).filter((i) => i?.marketPriceId !== targetId);
    },
    onCancel() {
      this.$router.push({ path: "/components" });
    },

    async loadComponentData() {
      if (!this.componentId) return;

      this.loadingComponent = true;
      this.loadingError = "";

      try {
        const response = await getMenuComponent(this.componentId);
        const component = response?.data || response;

        // Pré-remplir le formulaire avec les données existantes
        // (_prefillingForm évite que le watcher 'form.type' n'efface la
        // category qu'on est justement en train de préremplir ci-dessous)
        this._prefillingForm = true;
        this.form.name = component.name || "";
        this.form.category = component.category || "";
        this.form.type = component.componentCategory || component.type || "";
        this.$nextTick(() => { this._prefillingForm = false; });
        this.form.unit = component.unit || "";
        this.form.numberOfUnitsRecipe = component.numberOfUnitsRecipe || 1;
        this.form.storageType = component.storageType || "";
        this.form.readyForSale = component.readyForSale || "No";
        this.form.kitchenType = component.kitchenType || null;
        this.form.description = component.description || "";
        this.form.allergens = Array.isArray(component.allergens) ? component.allergens : [];
        // BUG-053 : ces deux champs n'étaient jamais restaurés ici, donc une sauvegarde après
        // édition les écrasait silencieusement (inventoryPackaging → undefined, packedUnits → 0).
        this.form.inventoryPackaging = component.inventoryPackaging || "";
        this.form.packedUnits = component.packedUnits || 0;

        this._loadedTaxonomy = {
          typeId: component.componentTypeId || "",
          categoryId: component.componentCategoryId || "",
          typeName: this.form.type,
          categoryName: this.form.category,
        };

        // Charger les ingredients avec récupération des détails via API
        if (Array.isArray(component.ingredients) && component.ingredients.length > 0) {
          const ingredientPromises = component.ingredients.map(async (ing) => {
            const ingredientId = ing.ingredientId || ing.ingredient_id;

            // Essayer de récupérer les détails complets de l'ingrédient
            if (ingredientId) {
              try {
                const ingredientDetails = await getIngredient(ingredientId);
                const marketPrice = ingredientDetails?.marketPrice || {};

                return {
                  ingredientId: ingredientId,
                  marketPriceId: ingredientId,
                  itemName: marketPrice.supplierItem || ingredientDetails.name || ing.itemName || ing.name || "-",
                  category: marketPrice.category || ing.category || "-",
                  quantity: Number(ing.quantity || ing.numberOfUnits || 0),
                  unit: ing.unit || ing.recipeUnit || ingredientDetails.unit || "-",
                  unitCost: Number(ing.unitCost || ing.costPerRecipeUnit || 0),
                  cost: Number(ing.cost || ing.totalCost || (ing.quantity * ing.unitCost) || 0),
                  storageType: ing.storage || ing.storageType || this.getStorageTypeForCategory(ingredientDetails.category) || "-",
                };
              } catch (error) {
                console.error(`Error fetching ingredient details for ${ingredientId}:`, error);
                // Fallback sur les données existantes
                return {
                  ingredientId: ingredientId,
                  marketPriceId: ingredientId,
                  itemName: ing.itemName || ing.name || "-",
                  category: ing.category || "-",
                  quantity: Number(ing.quantity || ing.numberOfUnits || 0),
                  unit: ing.unit || ing.recipeUnit || "-",
                  unitCost: Number(ing.unitCost || ing.costPerRecipeUnit || 0),
                  cost: Number(ing.cost || ing.totalCost || (ing.quantity * ing.unitCost) || 0),
                  storageType: ing.storage || ing.storageType || "-",
                };
              }
            } else {
              // Pas d'ID, utiliser les données brutes
              return {
                ingredientId: "",
                marketPriceId: "",
                itemName: ing.itemName || ing.name || "-",
                category: ing.category || "-",
                quantity: Number(ing.quantity || ing.numberOfUnits || 0),
                unit: ing.unit || ing.recipeUnit || "-",
                unitCost: Number(ing.unitCost || ing.costPerRecipeUnit || 0),
                cost: Number(ing.cost || ing.totalCost || 0),
                storageType: ing.storage || ing.storageType || "-",
              };
            }
          });

          this.form.ingredients = await Promise.all(ingredientPromises);
        }

        // Charger les children (sub-components)
        if (Array.isArray(component.children)) {
          this.form.children = component.children.map(child => ({
            componentId: child.componentId || child.id,
            itemName: child.itemName || child.name || "-",
            category: child.category || "-",
            numberOfUnits: Number(child.numberOfUnits || 0),
            unit: child.unit || "-",
            unitCost: Number(child.unitCost || 0),
            totalCost: Number(child.totalCost || child.cost || 0),
            storageType: child.storage || child.storageType || "-",
          }));
        }

      } catch (error) {
        console.error('Error loading component:', error);
        this.loadingError = error?.userMessage || error?.message || "Failed to load component";
      } finally {
        this.loadingComponent = false;
      }
    },

    async onSave() {
      if (this.isEditMode) {
        await this.onUpdate();
      } else {
        await this.onCreate();
      }
    },

    async onUpdate() {
      if (!this.formValid) return;
      if (!this.componentId) return;

      this.saving = true;
      this.error = "";
      try {
        const ingredientsPayload = Array.isArray(this.form.ingredients)
          ? this.form.ingredients
              .map((i) => ({
                ingredientId: String(i?.ingredientId || i?.marketPriceId || "").trim(),
                quantity: Number(i?.quantity ?? i?.numberOfUnits ?? 0) || 0,
                unit: String(i?.unit ?? i?.recipeUnit ?? "").trim(),
                unitCost: Number(i?.unitCost ?? i?.costPerRecipeUnit ?? 0) || 0,
                cost: Number(i?.cost ?? i?.totalCost ?? 0) || 0,
              }))
              .filter((i) => i.ingredientId)
          : [];

        const childrenPayload = Array.isArray(this.form.children)
          ? this.form.children.map((c) => ({
              childId: String(c?.childId || c?.componentId || "").trim(),
              quantity: Number(c?.quantity ?? c?.numberOfUnits ?? 0) || 0,
              unit: String(c?.unit || "").trim(),
            }))
            .filter((c) => c.childId)
          : [];

        const payload = {
          name: String(this.form.name || "").trim(),
          unit: String(this.form.unit || "").trim(),
          category: String(this.form.category || "").trim(),
          unitCost: Number(this.finalUnitCost) || 0,
          allergens: Array.isArray(this.form.allergens) ? this.form.allergens.map((a) => String(a || "").trim()).filter(Boolean) : [],
          description: String(this.form.description || "").trim(),
          storageType: String(this.form.storageType || "").trim(),
          readyForSale: String(this.form.readyForSale || "No").trim(),
          kitchenType: this.form.readyForSale === "Yes" ? (this.form.kitchenType || null) : null,
          ingredients: ingredientsPayload,
          children: childrenPayload,
          componentCategory: String(this.form.type || "").trim(),
          numberOfUnitsRecipe: Number(this.form.numberOfUnitsRecipe) || 0,
          componentTypeId: this.selectedComponentTypeId || undefined,
          componentCategoryId: this.selectedComponentCategoryId || undefined,
          inventoryPackaging: this.form.inventoryPackaging || undefined,
          packedUnits: Number(this.form.packedUnits) || 0,
        };

        await updateMenuComponent(this.componentId, payload);
        this.$store.dispatch('menuComponents/invalidate');
        this.$router.push({ path: "/components" });
      } catch (e) {
        this.error = e?.userMessage || e?.message || "Failed to update component";
      } finally {
        this.saving = false;
      }
    },

    async onCreate() {
      if (!this.formValid) return;
      this.saving = true;
      this.error = "";
      try {
        const ingredientsPayload = Array.isArray(this.form.ingredients)
          ? this.form.ingredients
              .map((i) => ({
                ingredientId: String(i?.ingredientId || i?.marketPriceId || "").trim(),
                quantity: Number(i?.quantity ?? i?.numberOfUnits ?? 0) || 0,
                unit: String(i?.unit ?? i?.recipeUnit ?? "").trim(),
                unitCost: Number(i?.unitCost ?? i?.costPerRecipeUnit ?? 0) || 0,
                cost: Number(i?.cost ?? i?.totalCost ?? 0) || 0,
              }))
              .filter((i) => i.ingredientId)
          : [];

        const childrenPayload = Array.isArray(this.form.children)
          ? this.form.children
              .map((c) => ({
                childId: String(c?.childId || c?.componentId || c?.id || "").trim(),
                quantity: Number(c?.quantity ?? c?.numberOfUnits ?? 0) || 0,
                unit: c?.unit ? String(c.unit).trim() : undefined,
              }))
              .filter((c) => c.childId)
          : [];

        const payload = {
          name: String(this.form.name || "").trim(),
          unit: String(this.form.unit || "").trim(),
          category: String(this.form.category || "").trim(),
          unitCost: Number(this.finalUnitCost) || 0,
          allergens: Array.isArray(this.form.allergens) ? this.form.allergens.map((a) => String(a || "").trim()).filter(Boolean) : [],
          description: String(this.form.description || "").trim(),
          storageType: String(this.form.storageType || "").trim(),
          readyForSale: String(this.form.readyForSale || "No").trim(),
          kitchenType: this.form.readyForSale === "Yes" ? (this.form.kitchenType || null) : null,
          ingredients: ingredientsPayload,
          children: childrenPayload,
          componentCategory: String(this.form.type || "").trim(),
          numberOfUnitsRecipe: Number(this.form.numberOfUnitsRecipe) || 0,
          componentTypeId: this.selectedComponentTypeId || undefined,
          componentCategoryId: this.selectedComponentCategoryId || undefined,
          inventoryPackaging: this.form.inventoryPackaging || undefined,
          packedUnits: Number(this.form.packedUnits) || 0,
        };

        await createMenuComponent(payload);
        this.$store.dispatch('menuComponents/invalidate');
        this.$router.push({ path: "/components" });
      } catch (e) {
        this.error = e?.userMessage || e?.message || "Failed to create component";
      } finally {
        this.saving = false;
      }
    },
  },
  mounted() {
    // Détecter le mode édition via la route
    const routeId = this.$route.params.id;
    if (routeId) {
      this.componentId = routeId;
      this.isEditMode = true;
    }

    this.$store.dispatch('componentCategories/fetchComponentCategories');
    this.$store.dispatch('componentTypes/fetchComponentTypes');
    this.$store.dispatch('packingTypes/fetchPackingTypes', { forceRefresh: true });

    // Charger les données du composant si en mode édition
    if (this.isEditMode) {
      this.loadComponentData();
    }

    // Bloquer le scroll de la page (v-main)
    const mainWrap = document.querySelector('.v-main');
    if (mainWrap) { this._mainWrap = mainWrap; mainWrap.style.overflow = 'hidden'; }
    document.documentElement.style.overflow = 'hidden';
  },

  beforeUnmount() {
    // Restaurer le scroll
    if (this._mainWrap) { this._mainWrap.style.overflow = ''; }
    document.documentElement.style.overflow = '';
  },
};
</script>

<style scoped>
#component-create-page {
  background: rgb(var(--v-theme-background));
  height: 100vh;
  overflow: hidden;
}

/* ── Gradient Header ── */
.cc-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 28px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25);
  position: sticky;
  top: 0;
  z-index: 10;
  flex-shrink: 0;
}

.cc-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cc-header__text { flex: 1; }

.cc-header__title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  margin: 0;
  line-height: 1.2;
}

.cc-header__sub {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.72);
  margin: 3px 0 0;
}

.cc-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cc-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  border-radius: 100px;
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.cc-back-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: #fff;
}

/* ── Layout ── */
/* Mêmes 28px horizontaux que .cc-header au-dessus (référence MarketPriceListView.vue) — un
   padding différent créait un décalage gauche/droite visible entre le bandeau et le contenu. */
.cc-content { padding: 20px 28px; }
.cc-row { align-items: flex-start; }
.cc-left-col { height: calc(100vh - 90px); display: flex; flex-direction: column; }

/* ── Left card ── */
.cc-left-card {
  height: 100%;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cc-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.cc-card-title { font-size: 1rem; font-weight: 700; color: #111827; }
.cc-card-sub   { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }

/* Add buttons */
.cc-add-btns { display: flex; gap: 7px; flex-shrink: 0; }
.cc-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 50px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.cc-add-btn--primary {
  background: #ff3131;
  color: #fff;
  border: none;
}
.cc-add-btn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49,.35); transform: translateY(-1px); }
.cc-add-btn--outline { background: #fff; color: #374151; border: 1.5px solid #e5e7eb; }
.cc-add-btn--outline:hover { background: #f9fafb; border-color: #d1d5db; }

/* Stats strip */
.cc-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
}
.cc-stat {
  display: flex;
  flex-direction: column;
  padding: 14px 22px;
  border-right: 1px solid #f3f4f6;
}
.cc-stat:last-child { border-right: none; }
.cc-stat__label { font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
.cc-stat__value { font-size: 1.25rem; font-weight: 700; color: #111827; margin-top: 4px; }
.cc-stat__value--blue  { color: #2563eb; }
.cc-stat__value--green { color: #059669; }

/* Table wrap */
.cc-table-wrap { flex: 1; overflow-y: auto; min-height: 0; }

/* Empty state */
.cc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  gap: 10px;
  text-align: center;
}
.cc-empty__icon {
  width: 76px; height: 76px;
  border-radius: 18px;
  background: #f9fafb;
  border: 1.5px dashed #e5e7eb;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 6px;
}
.cc-empty__title { font-size: 1rem; font-weight: 700; color: #374151; }
.cc-empty__sub   { font-size: 0.8125rem; color: #9ca3af; max-width: 360px; }

/* Table */
.cc-table :deep(.v-data-table__th) {
  background: #f9fafb !important;
  color: #6b7280 !important;
  font-size: 0.75rem !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: .06em;
  padding: 10px 14px !important;
  border-bottom: 1.5px solid #e5e7eb !important;
  white-space: nowrap;
}
.cc-table :deep(.v-data-table__td) {
  padding: 11px 14px !important;
  vertical-align: middle;
  border-bottom: 1px solid #f3f4f6 !important;
}
.cc-table :deep(.v-data-table__tr:last-child .v-data-table__td) { border-bottom: none !important; }
.cc-table :deep(.v-data-table__tr:hover .v-data-table__td) { background: #fff8f8 !important; }

/* Row name */
.cc-row-name { display: flex; align-items: flex-start; gap: 9px; }
.cc-row-name__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
.cc-row-name__text { font-weight: 600; font-size: 0.8125rem; color: #111827; }
.cc-row-name__sub  { font-size: 0.75rem; color: #9ca3af; margin-top: 1px; }

/* Badges */
.ccv-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 50px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.ccv-badge--category   { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
.ccv-badge--ingredient { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.ccv-badge--component  { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.ccv-badge--storage    { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
.ccv-badge--unit       { background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; }

/* Cost & muted */
.cc-cost  { font-weight: 700; font-size: 0.8125rem; color: #059669; }
.cc-muted { font-size: 0.75rem; color: #9ca3af; }

/* Qty input */
.cc-qty-input {
  width: 70px;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1.5px solid #e5e7eb;
  background: #fafafa;
  font-size: 0.8125rem;
  color: #111827;
  text-align: center;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.cc-qty-input:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1); background: #fff; }

/* Delete button */
.cc-del-btn {
  width: 28px; height: 28px;
  border-radius: 8px;
  background: #fef2f2;
  color: #ff3131;
  border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all .15s;
}
.cc-del-btn:hover { background: #fee2e2; box-shadow: 0 2px 8px rgba(255,49,49,.2); }

/* ── Right panel ── */
.cc-right-panel {
  position: sticky;
  top: 0;
  height: calc(100vh - 90px);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Sticky header */
.cc-form-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 16px;
  border-bottom: 1px solid #f3f4f6;
}
.cc-form-title { font-size: 1rem; font-weight: 700; color: #111827; }
.cc-form-sub   { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }

/* Scrollable body */
.cc-form-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 18px 22px;
}

/* Sticky footer */
.cc-form-footer {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  padding: 14px 22px;
  border-top: 1px solid #f3f4f6;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .05);
}
.cc-form-footer .cc-pill-btn--outline { flex: 0 0 auto; }
.cc-form-footer .cc-pill-btn--primary { flex: 1 1 auto; }

/* ── Section labels (supplier style) ── */
.ccf-section-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .9px;
  color: #9ca3af;
  margin-bottom: 12px;
}

.ccf-required { color: #ff3131; }

/* Champ : label statique visible AU-DESSUS du champ (plus de label flottant). */
.ccf-field-wrap { display: flex; flex-direction: column; gap: 6px; }
.ccf-field-label { font-size: 0.75rem; font-weight: 600; color: #374151; }

/* ── Vuetify select/combobox (supplier style) ── */
.ccf-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  background: #fafafa !important;
  box-shadow: none !important;
}
.ccf-field :deep(.v-field__outline) { display: none !important; }
.ccf-field :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1) !important;
  background: #fff !important;
}
.ccf-field :deep(.v-label) {
  font-size: 0.875rem !important;
  color: #9ca3af !important;
  opacity: 1 !important;
}
.ccf-field :deep(.v-label.v-field-label--floating) {
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  color: #ff3131 !important;
  opacity: 1 !important;
}
.ccf-field :deep(.v-field__input) {
  font-size: 0.875rem !important;
  color: #111827 !important;
}

/* Calc card */
.cc-calc-card {
  background: linear-gradient(135deg, #f8faff 0%, #eff6ff 100%);
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 16px;
}
.cc-calc-card__label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #3b82f6;
}
.cc-calc-card__amount {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1d4ed8;
  line-height: 1.1;
  margin: 7px 0 12px;
}
.cc-calc-card__divider { border-top: 1px solid #bfdbfe; margin-bottom: 9px; }
.cc-calc-card__row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #3b82f6;
  padding: 2px 0;
}
.cc-calc-card__result { font-weight: 700; }

/* ── Inventory Information card (phrase « Component is stored in … ») ── */
.cc-info-card {
  background: linear-gradient(135deg, #eff6ff 0%, #e0effe 100%);
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  padding: 16px 18px;
}
.cc-info-card__title {
  font-size: 0.8125rem;
  font-weight: 700;
  margin-bottom: 14px;
  color: #1e40af;
}
.cc-info-card__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  row-gap: 10px;
  line-height: 1.6;
}
.cc-info-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
}
/* Champ Storage Type intégré à la card */
.cc-info-card__field {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cc-info-card__field-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #1e40af;
}

/* Dialog de création de packaging type */
.cc-pk-dialog { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.18); }
.cc-pk-dialog__header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px; background: #ff3131; color: #fff;
  font-size: 1rem; font-weight: 700;
}
.cc-pk-dialog__close {
  width: 28px; height: 28px; border: none; border-radius: 8px;
  background: rgba(255,255,255,.18); color: #fff;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.cc-pk-dialog__close:hover { background: rgba(255,255,255,.3); }
.cc-pk-dialog__error {
  padding: 10px 18px; background: #fef2f2; color: #ff3131; font-size: 0.8125rem;
}
.cc-pk-dialog__body { padding: 18px; }
.cc-pk-dialog__footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 18px; background: #f9fafb; border-top: 1px solid #f3f4f6;
}
.cc-pk-btn {
  padding: 8px 18px; border-radius: 50px; font-size: 0.875rem; font-weight: 600;
  border: none; cursor: pointer; transition: all .15s;
}
.cc-pk-btn:disabled { opacity: .5; cursor: not-allowed; }
.cc-pk-btn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.cc-pk-btn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255,49,49,.3); }
.cc-pk-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255,49,49,.4); transform: translateY(-1px); }
/* ── Dark : dialog « Add packaging type » (v-dialog téléporté → classe portée sur sa racine) ── */
.cc-pk-dialog--dark { background: #1e293b; }
.cc-pk-dialog--dark .cc-pk-dialog__error { background: rgba(255,49,49,.15); color: #fca5a5; }
.cc-pk-dialog--dark .cc-info-card__field-label { color: #93c5fd; }
.cc-pk-dialog--dark .cc-inline-input { background: #1a2332; border-color: rgba(37,99,235,.3); color: #e2e8f0; }
.cc-pk-dialog--dark .cc-pk-dialog__footer { background: #1a2332; border-top-color: rgba(255,255,255,.06); }
.cc-pk-dialog--dark .cc-pk-btn--cancel { background: rgba(255,255,255,.08); color: #cbd5e1; border-color: rgba(255,255,255,.14); }
.cc-info-label--dot {
  font-size: 1rem;
  font-weight: 700;
  color: #6b7280;
  line-height: 1;
}
.cc-inline-input,
.cc-inline-select {
  border: 1.5px solid #dbeafe;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 0.8125rem;
  color: #1e3a5f;
  background: #fff;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.cc-inline-input:focus,
.cc-inline-select:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .12);
}
.cc-info-card__select { min-width: 148px; max-width: 168px; flex-shrink: 0; }
.cc-info-card__unit-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #bfdbfe;
  border-radius: 20px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #1e40af;
  white-space: nowrap;
}
/* Chip du nom du composant (« <nom> is stored in … ») */
.cc-info-card__chip {
  display: inline-flex;
  align-items: center;
  max-width: 180px;
  padding: 4px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 20px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #1e40af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Pill buttons (save/cancel) ── */
.cc-pill-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  padding: 0 20px;
  border-radius: 50px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all .2s;
}
.cc-pill-btn--outline { background: transparent; border: 1.5px solid #e5e7eb; color: #374151; }
.cc-pill-btn--outline:hover { background: #f3f4f6; border-color: #d1d5db; }
.cc-pill-btn--primary { background: #ff3131; color: #fff; border: none; }
.cc-pill-btn--primary:hover { box-shadow: 0 4px 14px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.cc-pill-btn--primary:disabled { opacity: .6; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

@media (max-width: 768px) {
  .cc-content { padding: 12px 16px; }
  .cc-left-col { height: auto; }
  .cc-right-panel { position: static; height: auto; }
  .cc-add-btns { flex-wrap: wrap; }
}

/* ── Dark mode (classe racine .cc--dark, aligné sur ComponentTypeList) ── */
/* Cartes & structure */
.cc--dark .cc-left-card,
.cc--dark .cc-right-panel { background: #1e293b; border-color: rgba(255,255,255,.08); }
.cc--dark .cc-card-head,
.cc--dark .cc-form-head,
.cc--dark .cc-stats,
.cc--dark .cc-stat { border-color: rgba(255,255,255,.06) !important; }
.cc--dark .cc-card-title,
.cc--dark .cc-form-title,
.cc--dark .cc-stat__value,
.cc--dark .cc-row-name__text { color: #e2e8f0; }
.cc--dark .cc-card-sub,
.cc--dark .cc-form-sub { color: #94a3b8; }
.cc--dark .cc-add-btn--outline { background: rgba(255,255,255,.06); color: #cbd5e1; border-color: rgba(255,255,255,.14); }
.cc--dark .cc-add-btn--outline:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.24); }
.cc--dark .cc-empty__icon { background: rgba(255,255,255,.03); border-color: rgba(255,255,255,.12); }
.cc--dark .cc-empty__title { color: #e2e8f0; }
/* Table */
.cc--dark .cc-table :deep(.v-data-table__th) { background: #1a2332 !important; color: #94a3b8 !important; border-bottom-color: rgba(255,255,255,.08) !important; }
.cc--dark .cc-table :deep(.v-data-table__td) { color: #e2e8f0; border-bottom-color: rgba(255,255,255,.06) !important; }
.cc--dark .cc-table :deep(.v-data-table__tr:hover .v-data-table__td) { background: rgba(255,49,49,.08) !important; }
/* Badges */
.cc--dark .ccv-badge--category { background: rgba(255,255,255,.08); color: #cbd5e1; border-color: rgba(255,255,255,.12); }
.cc--dark .ccv-badge--ingredient { background: rgba(21,128,61,.18); color: #86efac; border-color: rgba(21,128,61,.35); }
.cc--dark .ccv-badge--component { background: rgba(37,99,235,.15); color: #93c5fd; border-color: rgba(37,99,235,.3); }
.cc--dark .ccv-badge--storage { background: rgba(234,88,12,.15); color: #fdba74; border-color: rgba(234,88,12,.3); }
.cc--dark .ccv-badge--unit { background: rgba(139,92,246,.15); color: #c4b5fd; border-color: rgba(139,92,246,.3); }
/* Qty input & delete */
.cc--dark .cc-qty-input { border-color: rgba(255,255,255,.14); background: #1a2332; color: #e2e8f0; }
.cc--dark .cc-qty-input:focus { background: #1a2332; }
.cc--dark .cc-del-btn { background: rgba(255,49,49,.15); }
/* Formulaire droit */
.cc--dark .cc-form-footer { background: #1e293b; border-top-color: rgba(255,255,255,.06); }
.cc--dark .ccf-field-label { color: #94a3b8; }
.cc--dark .ccf-field :deep(.v-field) { border-color: rgba(255,255,255,.12) !important; background: #1a2332 !important; }
.cc--dark .ccf-field :deep(.v-field--focused) { background: #1a2332 !important; }
.cc--dark .ccf-field :deep(.v-field__input) { color: #e2e8f0 !important; }
/* Calc card & info card (teintes bleues sombres) */
.cc--dark .cc-calc-card { background: linear-gradient(135deg, #0f1e33 0%, #12233b 100%); border-color: rgba(37,99,235,.3); }
.cc--dark .cc-calc-card__amount { color: #93c5fd; }
.cc--dark .cc-calc-card__divider { border-top-color: rgba(37,99,235,.25); }
.cc--dark .cc-info-card { background: linear-gradient(135deg, #12233b 0%, #0f1e33 100%); border-color: rgba(37,99,235,.3); }
.cc--dark .cc-info-card__title,
.cc--dark .cc-info-card__field-label { color: #93c5fd; }
.cc--dark .cc-info-label { color: #cbd5e1; }
.cc--dark .cc-info-label--dot { color: #94a3b8; }
.cc--dark .cc-info-card__unit-badge,
.cc--dark .cc-info-card__chip { background: rgba(37,99,235,.2); color: #93c5fd; border-color: rgba(37,99,235,.3); }
.cc--dark .cc-inline-input,
.cc--dark .cc-inline-select { border-color: rgba(37,99,235,.3); color: #e2e8f0; background: #1a2332; }
/* Dialog packaging type */
.cc--dark .cc-pk-dialog { background: #1e293b; }
.cc--dark .cc-pk-dialog__error { background: rgba(255,49,49,.15); }
.cc--dark .cc-pk-dialog__footer { background: #1a2332; border-top-color: rgba(255,255,255,.06); }
.cc--dark .cc-pk-btn--cancel { background: rgba(255,255,255,.08); color: #cbd5e1; border-color: rgba(255,255,255,.14); }
/* Pills */
.cc--dark .cc-pill-btn--outline { border-color: rgba(255,255,255,.14); color: #cbd5e1; }
.cc--dark .cc-pill-btn--outline:hover { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.24); }
</style>
