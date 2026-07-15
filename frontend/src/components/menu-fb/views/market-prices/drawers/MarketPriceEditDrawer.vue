<template>
  <Teleport to="body">
  <Transition name="mped">
  <div v-if="localOpen" class="mped-overlay" @mousedown.self="close">
    <div class="d-flex flex-column mped-panel mped" :class="{ 'mped--dark': isDark }">
      <!-- Header -->
      <div class="mped__grad-header">
        <div class="mped__header-icon"><Pencil :size="22" color="white" /></div>
        <div class="mped__header-titles">
          <div class="mped__header-title">{{ t('editItemName') }}</div>
          <div class="mped__header-subtitle">{{ t('updateItemInfo') }}</div>
        </div>
        <button class="mped__close-btn" :disabled="loading" @click="close"><X :size="18" /></button>
      </div>

      <!-- Error -->
      <div v-if="error" class="mped__error">
        <AlertCircle :size="14" class="me-2" style="flex-shrink:0" />{{ error }}
      </div>

      <!-- Content -->
      <div class="mped__content">

        <!-- Photo -->
        <div class="mped-section">
          <div class="mped-section__label">
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

        <!-- Item Information -->
        <div class="mped-section">
          <div class="mped-section__label">{{ t('itemInformation') }}</div>
          <div class="mped-field-row mb-3">
            <label class="mped-field-label" for="mped-itemName">{{ t('itemName') }} <span class="mped-required">*</span></label>
            <input id="mped-itemName" v-model="form.itemName" type="text" class="form-control mped-input" />
          </div>
          <div class="mped-field-row mb-3">
            <label class="mped-field-label">{{ t('goodType') }} <span class="mped-required">*</span></label>
            <v-select
              v-model="form.goodType"
              :items="allGoodTypeOptions"
              density="compact"
              variant="outlined"
              hide-details="auto"
              :menu-props="{ zIndex: 10000 }"
              class="mped-item-select"
            >
              <template #prepend-item>
                <v-list-item style="color:#ff3131; font-weight:600;" @click.stop="newTypeOpen = true">
                  <template #prepend><PlusCircle :size="16" class="me-2" style="color:#ff3131" /></template>
                  <v-list-item-title>{{ t('addGoodType') }}</v-list-item-title>
                </v-list-item>
                <v-divider class="my-1" />
              </template>
            </v-select>
          </div>
          <div class="mped-field-row">
            <label class="mped-field-label">{{ t('goodCategory') }}</label>
            <v-select
              v-model="form.category"
              :items="goodCategoryOptions"
              density="compact"
              variant="outlined"
              hide-details="auto"
              clearable
              :disabled="!form.goodType"
              :menu-props="{ zIndex: 10000 }"
              class="mped-item-select"
            >
              <template #prepend-item>
                <v-list-item style="color:#ff3131; font-weight:600;" @click.stop="newCategoryOpen = true">
                  <template #prepend><PlusCircle :size="16" class="me-2" style="color:#ff3131" /></template>
                  <v-list-item-title>{{ t('addCategory') }}</v-list-item-title>
                </v-list-item>
                <v-divider class="my-1" />
              </template>
            </v-select>
          </div>

          <!-- Dialog — Nouveau type -->
          <v-dialog v-model="newTypeOpen" max-width="420" :z-index="11000" :persistent="newTypeLoading">
            <div class="mped-mini-dialog">
              <div class="mped-mini-dialog__header">
                <Shapes :size="18" color="white" />
                <span>{{ locale === 'fr' ? 'Nouveau type de produit' : 'New Good Type' }}</span>
                <button class="mped-mini-dialog__close" :disabled="newTypeLoading" @click="newTypeOpen = false"><X :size="16" /></button>
              </div>
              <div class="mped-mini-dialog__body">
                <v-alert v-if="newTypeError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3" style="font-size:13px;">
                  {{ newTypeError }}
                </v-alert>
                <div class="mped-field-row">
                  <label class="mped-field-label" for="mped-nt-name">{{ locale === 'fr' ? 'Nom du type' : 'Type name' }} <span class="mped-required">*</span></label>
                  <input id="mped-nt-name" v-model="newTypeValue" type="text" class="form-control mped-input" :disabled="newTypeLoading" @keyup.enter="confirmNewType" />
                </div>
              </div>
              <div class="mped-mini-dialog__footer">
                <button class="mped-btn mped-btn--cancel" :disabled="newTypeLoading" @click="newTypeOpen = false">{{ t('cancel') }}</button>
                <button class="mped-btn mped-btn--save" :disabled="!newTypeValue.trim() || newTypeLoading" @click="confirmNewType">
                  <v-progress-circular v-if="newTypeLoading" indeterminate size="14" width="2" color="white" class="me-1" />
                  <Check v-else :size="14" class="me-1" />
                  {{ locale === 'fr' ? 'Ajouter' : 'Add' }}
                </button>
              </div>
            </div>
          </v-dialog>

          <!-- Dialog — Nouvelle catégorie -->
          <v-dialog v-model="newCategoryOpen" max-width="420" :z-index="11000" :persistent="newCategoryLoading">
            <div class="mped-mini-dialog">
              <div class="mped-mini-dialog__header">
                <Tag :size="18" color="white" />
                <span>{{ locale === 'fr' ? 'Nouvelle catégorie' : 'New Category' }}</span>
                <button class="mped-mini-dialog__close" :disabled="newCategoryLoading" @click="newCategoryOpen = false"><X :size="16" /></button>
              </div>
              <div class="mped-mini-dialog__body">
                <v-alert v-if="newCategoryError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3" style="font-size:13px;">
                  {{ newCategoryError }}
                </v-alert>
                <div class="mped-field-row">
                  <label class="mped-field-label" for="mped-nc-name">{{ locale === 'fr' ? 'Nom de la catégorie' : 'Category name' }} <span class="mped-required">*</span></label>
                  <input id="mped-nc-name" v-model="newCategoryValue" type="text" class="form-control mped-input" :disabled="newCategoryLoading" @keyup.enter="confirmNewCategory" />
                </div>
              </div>
              <div class="mped-mini-dialog__footer">
                <button class="mped-btn mped-btn--cancel" :disabled="newCategoryLoading" @click="newCategoryOpen = false">{{ t('cancel') }}</button>
                <button class="mped-btn mped-btn--save" :disabled="!newCategoryValue.trim() || newCategoryLoading" @click="confirmNewCategory">
                  <v-progress-circular v-if="newCategoryLoading" indeterminate size="14" width="2" color="white" class="me-1" />
                  <Check v-else :size="14" class="me-1" />
                  {{ locale === 'fr' ? 'Ajouter' : 'Add' }}
                </button>
              </div>
            </div>
          </v-dialog>
        </div>

        <!-- Unit & Conversion -->
        <div class="mped-section">
          <div class="mped-section__label">
            <Scale :size="13" style="color:#ff3131" class="me-1" />
            {{ t('unitConversion') }}
          </div>
          <div class="mped-field-row mb-3">
            <label class="mped-field-label" for="mped-recipeUnit">{{ t('recipeUnit') }}</label>
            <select id="mped-recipeUnit" v-model="form.recipeUnit" class="form-select mped-select">
              <option value="">—</option>
              <option value="Kg">Kg</option>
              <option value="L">L</option>
              <option value="Pc">Pc</option>
            </select>
          </div>
          <div class="mped-field-row">
            <label class="mped-field-label" for="mped-conversion">{{ t('purchaseUnitConversion') }}</label>
            <div class="mped-field-subtitle">{{ conversionSubtitle }}</div>
            <input id="mped-conversion" v-model.number="form.purchaseUnitConversion" type="number" min="0" step="0.001" class="form-control mped-input" />
          </div>
        </div>


      </div>

      <!-- Footer -->
      <div class="mped__footer">
        <button class="mped-btn mped-btn--cancel" :disabled="loading" @click="close">{{ t('cancel') }}</button>
        <button class="mped-btn mped-btn--save" :disabled="loading" @click="submit">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status"></span>
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
import { AlertCircle, Apple, ArrowLeftRight, Camera, Check, Image, ImagePlus, Pencil, PlusCircle, Save, Scale, Shapes, Tag, X } from 'lucide-vue-next';
import { updateMarketPrice } from '@/api/endpoints/menu.api';
import { createMarketPriceType, createMarketPriceCategory } from '@/api/endpoints/market.price.api';

export default {
  name: 'MarketPriceEditDrawer',
  components: {
    AlertCircle, Apple, ArrowLeftRight, Camera, Check, Image, ImagePlus,
    Pencil, PlusCircle, Save, Scale, Shapes, Tag, X,
  },
  props: {
    modelValue: { type: Boolean, default: false },
    // Full item object (including supplierRows for patch)
    initialItem: { type: Object, default: null },
    goodTypeOptions: { type: Array, default: () => [] },
    productCategoryOptions: { type: Array, default: () => [] },
    productCategories: { type: Array, default: () => [] },
    recipeUnitOptions: { type: Array, default: () => [] },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved'],
  data() {
    return {
      locale: localStorage.getItem('appLocale') || 'en',
      loading: false,
      error: '',
      isHydratingForm: false,
      imageFile: null,
      imagePreview: '',
      localGoodTypeOptions: [],
      localGoodCategoryOptions: [],
      newTypeOpen: false,
      newTypeValue: '',
      newTypeLoading: false,
      newTypeError: '',
      newCategoryOpen: false,
      newCategoryValue: '',
      newCategoryLoading: false,
      newCategoryError: '',
      form: {
        originalItemName: '',
        itemName: '',
        goodType: '',
        category: '',
        recipeUnit: '',
        purchaseUnitConversion: 0,
        image: '',
        unit: '',
        inventoryPackaging: '',
        packedUnits: 0,
        numberOfUnits: 0,
        packingLength: 0,
        packingWidth: 0,
        packingHeight: 0,
      },
      translations: {
        en: {
          editItemName: 'Edit Item Name',
          updateItemInfo: 'Update the item name, good type, and image',
          imageOptional: 'Image (Optional)',
          clickToUpload: 'Click to upload image',
          fileFormat: 'PNG, JPG up to 5MB',
          clickToChange: 'Click to change',
          itemName: 'Item Name',
          goodType: 'Good Type',
          goodCategory: 'Good Category (Optional)',
          recipeUnit: 'Recipe Unit (Optional)',
          recipeUnitQuestion: 'What is the unit in the recipe?',
          purchaseUnitConversion: 'Purchase Unit Conversion (Optional)',
          conversionQuestion: 'How many kg do you need to make one kg?',
          inventoryInfo: 'Inventory Information',
          itemIsStoredIn: 'Item is stored in',
          selectPackaging: 'Select packaging',
          packingInfo: 'Packing Information',
          optional: 'Optional',
          packedUnits: 'Packed Units',
          numberOfUnits: 'Number of Units',
          packingDimensions: 'Packing Dimensions (L/W/H in cm)',
          length: 'Length',
          width: 'Width',
          height: 'Height',
          cancel: 'Cancel',
          saveChanges: 'Save Changes',
          itemInformation: 'Item Information',
          addGoodType: 'Add Good Type',
          addCategory: 'Add Category',
          newGoodType: 'New Good Type',
          typeNameLabel: 'Type name',
          categoryNameLabel: 'Category name',
          newCategory: 'New Category',
          add: 'Add',
          unitConversion: 'Unit & Conversion',
        },
        fr: {
          editItemName: "Modifier le nom de l'article",
          updateItemInfo: "Mettre à jour le nom, le type et l'image de l'article",
          imageOptional: 'Image (Optionnel)',
          clickToUpload: "Cliquez pour télécharger l'image",
          fileFormat: "PNG, JPG jusqu'à 5MB",
          clickToChange: 'Cliquez pour changer',
          itemName: "Nom de l'article",
          goodType: 'Type de produit',
          goodCategory: 'Bonne catégorie (Optionnel)',
          recipeUnit: 'Unité de recette (Optionnel)',
          recipeUnitQuestion: "Quelle est l'unité dans la recette ?",
          purchaseUnitConversion: "Conversion d'unité d'achat (Optionnel)",
          conversionQuestion: "Combien de kg faut-il pour faire un kg ?",
          inventoryInfo: 'Informations de stock',
          itemIsStoredIn: "L'article est stocké en",
          selectPackaging: 'Sélectionner emballage',
          packingInfo: "Informations d'emballage",
          optional: 'Optionnel',
          packedUnits: 'Unités emballées',
          numberOfUnits: "Nombre d'unités",
          packingDimensions: "Dimensions d'emballage (L/l/H en cm)",
          length: 'Longueur',
          width: 'Largeur',
          height: 'Hauteur',
          cancel: 'Annuler',
          saveChanges: 'Enregistrer les modifications',
          itemInformation: 'Informations article',
          addGoodType: 'Ajouter un type',
          addCategory: 'Ajouter une catégorie',
          newGoodType: 'Nouveau type de produit',
          typeNameLabel: 'Nom du type',
          categoryNameLabel: 'Nom de la catégorie',
          newCategory: 'Nouvelle catégorie',
          add: 'Ajouter',
          unitConversion: 'Unité & Conversion',
        },
      },
    };
  },
  computed: {
    localOpen: {
      get() { return this.modelValue; },
      set(val) { this.$emit('update:modelValue', val); },
    },
    // Sous-titre dynamique sous « Purchase Unit Conversion » : reprend l'unité de
    // recette sélectionnée (Kg / L / Pc).
    conversionSubtitle() {
      const unit = this.form.recipeUnit || (this.locale === 'fr' ? 'unité' : 'unit');
      return this.locale === 'fr'
        ? `Combien de l faut-il pour faire un ${unit} ?`
        : `How many l do you need to make one ${unit}?`;
    },
    storeGoodTypeOptions() {
      const types = this.$store.getters['marketPriceTypes/marketPriceTypes'] || [];
      return types.map((t) => t?.name).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
    },
    allGoodTypeOptions() {
      const base = this.storeGoodTypeOptions.length ? this.storeGoodTypeOptions : (this.goodTypeOptions || []);
      const extra = this.localGoodTypeOptions.filter((o) => !base.includes(o));
      return [...base, ...extra];
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
        : this.productCategoryOptions;
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
      if (val) {
        this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes', { forceRefresh: true });
        this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true });
      }
      if (val && this.initialItem) {
        this.localGoodTypeOptions = [...(this.goodTypeOptions || [])];
        this.localGoodCategoryOptions = [];
        this.newTypeOpen = false;
        this.newTypeValue = '';
        this.newCategoryOpen = false;
        this.newCategoryValue = '';
        const raw = this.initialItem;
        this.isHydratingForm = true;
        this.form = {
          originalItemName: String(raw.name || raw.itemName || '').trim(),
          itemName: String(raw.name || raw.itemName || '').trim(),
          goodType: raw.goodType || raw.type || '',
          category: raw.category || '',
          recipeUnit: raw.recipeUnit || '',
          purchaseUnitConversion: Number(raw.purchaseUnitConversion) || 0,
          image: raw.image || '',
          unit: raw.unit || '',
          inventoryPackaging: raw.inventoryPackaging || '',
          packedUnits: Number(raw.packedUnits) || 0,
          numberOfUnits: Number(raw.numberOfUnits) || 0,
          packingLength: Number(raw.packingLength) || 0,
          packingWidth: Number(raw.packingWidth) || 0,
          packingHeight: Number(raw.packingHeight) || 0,
        };
        this.imageFile = null;
        this.imagePreview = raw.image || '';
        this.error = '';
        this.loading = false;
        this.$nextTick(() => {
          this.isHydratingForm = false;
        });
      }
    },
  },
  mounted() {
    window.addEventListener('locale-changed', this.handleLocaleChange);
    this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes', { forceRefresh: true });
    this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true });
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
    async confirmNewType() {
      const name = this.newTypeValue.trim();
      if (!name) return;
      this.newTypeLoading = true;
      this.newTypeError = '';
      try {
        await createMarketPriceType({ name });
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
          // Le type existe déjà (créé entre-temps) : on le récupère quand même.
          await this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes', { forceRefresh: true });
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
    close() {
      this.$emit('update:modelValue', false);
    },
    async submit() {
      this.loading = true;
      this.error = '';
      try {
        const itemName = String(this.form.itemName || '').trim();
        if (!itemName) {
          this.error = 'Item Name is required';
          return;
        }
        if (!this.form.goodType) {
          this.error = 'Good Type is required';
          return;
        }

        const rows = (this.initialItem?.supplierRows || []).filter((r) => r && (r.id || r._id));
        if (!rows.length) {
          this.error = 'No supplier items found to update';
          return;
        }

        // Édition au niveau ITEM : on n'envoie QUE les attributs communs à l'item.
        // Les champs par ligne fournisseur (unit, prix, packaging, packed/packing*)
        // sont gérés par l'EditSupplierDrawer — ne pas les ré-envoyer ici, sinon on
        // écrase la donnée par ligne avec la valeur agrégée de l'item.
        const patch = {
          itemName,
          goodType: this.form.goodType,
          marketPriceTypeId: this.selectedTypeId,
          category: this.form.category || '',
          marketPriceCategoryId: this.selectedCategoryId,
          recipeUnit: this.form.recipeUnit || '',
          purchaseUnitConversion: Number(this.form.purchaseUnitConversion) || 0,
          image: this.form.image || '',
        };

        await Promise.all(rows.map((r) => updateMarketPrice(r.id || r._id, patch)));
        this.$store.dispatch('marketPriceIngredients/invalidate');
        this.$emit('saved');
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || 'Failed to update market price';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.mped-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}

.mped-panel {
  width: 520px;
  height: 100%;
  background: #ffffff;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.mped-enter-active,
.mped-leave-active {
  transition: opacity 0.25s ease;
}
.mped-enter-active .mped-panel,
.mped-leave-active .mped-panel {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.mped-enter-from,
.mped-leave-to {
  opacity: 0;
}
.mped-enter-from .mped-panel,
.mped-leave-to .mped-panel {
  transform: translateX(100%);
}

/* === Gradient Header === */
.mped__grad-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: #ff3131;
  flex-shrink: 0;
}

.mped__header-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mped__header-titles {
  flex: 1;
  min-width: 0;
}

.mped__header-title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.mped__header-subtitle {
  font-size: 12px;
  color: rgba(255,255,255,.72);
  margin-top: 3px;
}

.mped__close-btn {
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
.mped__close-btn:hover:not(:disabled) { background: rgba(255,255,255,.3); }
.mped__close-btn:disabled { opacity: .4; cursor: not-allowed; }

/* === Error === */
.mped__error {
  display: flex;
  align-items: center;
  padding: 10px 24px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  font-size: 13px;
  color: #ff3131;
  flex-shrink: 0;
}

/* === Content === */
.mped__content {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

/* === Sections === */
.mped-section {
  padding: 20px 24px;
  border-bottom: 1px solid #f3f4f6;
}
.mped-section:last-child { border-bottom: none; padding-bottom: 28px; }

.mped-section__label {
  display: flex;
  align-items: center;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .9px;
  color: #9ca3af;
  margin-bottom: 14px;
}

.mped-optional-tag {
  font-size: 10.5px;
  font-weight: 500;
  color: #9ca3af;
  text-transform: none;
  letter-spacing: 0;
  margin-left: 6px;
}

/* === Bootstrap inputs === */
.mped-input.form-control,
.mped-select.form-select {
  border-radius: 11px;
  border: 1.5px solid #e5e7eb;
  font-size: 13.5px;
  color: #111827;
  padding: .65rem .8rem;
  background: #fafafa;
  transition: border-color .2s, box-shadow .2s;
}
.mped-input.form-control:focus,
.mped-select.form-select:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1);
  background: #fff;
  outline: none;
}
.mped-required { color: #ff3131; }

/* === Static field rows === */
.mped-field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.mped-field-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #374151;
}
.mped-field-subtitle {
  font-size: 11.5px;
  color: #9ca3af;
  margin: 2px 0 6px;
}
.mped--dark .mped-field-subtitle { color: #9ca3af; }
.mped-item-select :deep(.v-field) {
  border-radius: 11px !important;
  border: 1.5px solid #e5e7eb !important;
  background: #fafafa !important;
  box-shadow: none !important;
}
.mped-item-select :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1) !important;
  background: #fff !important;
}
.mped-item-select :deep(.v-field__outline) { display: none !important; }
.mped-item-select :deep(.v-field__input) { font-size: 13.5px !important; color: #111827 !important; }
.mped-item-select :deep(.v-select__selection-text) { font-size: 13.5px !important; }

/* === Mini dialog (type / category creation) === */
.mped-mini-dialog {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0,0,0,.14);
}
.mped-mini-dialog__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  background: #ff3131;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}
.mped-mini-dialog__close {
  margin-left: auto;
  background: rgba(255,255,255,.18);
  border: none; border-radius: 6px;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(255,255,255,.85);
}
.mped-mini-dialog__close:hover { background: rgba(255,255,255,.3); }
.mped-mini-dialog__body { padding: 20px 20px 16px; }
.mped-mini-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}

/* === Footer === */
.mped__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
  flex-shrink: 0;
}

.mped-btn {
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
.mped-btn:disabled { opacity: .45; cursor: not-allowed; }

.mped-btn--cancel {
  background: transparent;
  border: 1.5px solid #e5e7eb;
  color: #6b7280;
}
.mped-btn--cancel:hover:not(:disabled) {
  border-color: #9ca3af;
  background: #f3f4f6;
  color: #374151;
}

.mped-btn--save {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49,.3);
}
.mped-btn--save:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 49, 49,.4);
  transform: translateY(-1px);
}

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

/* Dark mode */
.mped--dark.mped-panel {
  background: #111827;
}
.mped--dark .mped-section { border-bottom-color: #1e2d3d; }
.mped--dark .mped-section__label { color: #4b6280; }
.mped--dark .mped-optional-tag { color: #4b6280; }
.mped--dark .mped-input.form-control,
.mped--dark .mped-select.form-select {
  background: #1e2a38;
  border-color: rgba(255,255,255,.12);
  color: #e5e7eb;
}
.mped--dark .mped-input.form-control:focus,
.mped--dark .mped-select.form-select:focus {
  background: #263548;
  border-color: #ff3131;
}
.mped--dark .mped-field-label { color: #cbd5e1; }

.mped--dark .mped__content {
  background: #111827;
}

.mped--dark .mped__footer {
  background: #1f2937 !important;
  border-color: #2d3f55 !important;
}

.mped--dark .market-picture-upload {
  border-color: #2d3f55;
  background: #1f2937;
}

.mped--dark .market-picture-upload:hover {
  border-color: #ff3131;
  background: #1a1a2e;
}

.mped--dark .market-picture-upload.has-image {
  background: #263548;
  border-color: #2d3f55;
}

.mped--dark .picture-placeholder p {
  color: #e5e7eb !important;
}

.mped--dark :deep(.v-field) {
  background-color: #263548 !important;
}

.mped--dark :deep(.v-field__input),
.mped--dark :deep(input),
.mped--dark :deep(textarea) {
  color: #e5e7eb !important;
}

.mped--dark :deep(.v-select__selection-text) {
  color: #e5e7eb !important;
}
</style>
