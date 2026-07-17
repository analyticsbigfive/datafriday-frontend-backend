<template>
  <div class="ecl-root" :class="{'ecl--dark': isDark}">

    <!-- ── Header ── -->
    <div class="ecl-header sticky-header">
      <div class="ecl-header__inner">
        <div class="ecl-header__left">
          <div class="ecl-header__icon">
            <Shapes :size="22" color="white" />
          </div>
          <div>
            <h1 class="ecl-header__title">{{ t('eventCategoryList.title') }}</h1>
            <p class="ecl-header__subtitle">{{ t('eventCategoryList.subtitle') }}</p>
          </div>
        </div>
        <div class="ecl-header__right">
          <div class="ecl-header__sep"></div>
          <div class="ecl-header__actions">
            <button class="ecl-action-hbtn" @click="exportToCSV">
              <Download :size="15" /> {{ t('eventCategoryList.exportCsv') }}
            </button>
            <button class="ecl-action-hbtn" @click="taxonomyImportDrawer = true">
              <Upload :size="15" /> {{ t('eventCategoryList.importCsv') }}
            </button>
            <button class="ecl-add-btn" @click="openCreateDialog">
              <Plus :size="17" /> {{ t('eventCategoryList.newCategory') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Search bar ── -->
    <div class="ecl-searchbar sticky-search">
      <div class="ecl-searchbar__inner">
        <Search :size="17" class="ecl-searchbar__icon" />
        <input v-model="search" class="ecl-searchbar__input" type="search" :placeholder="t('eventCategoryList.searchPlaceholder')" />
        <span class="ecl-searchbar__count">
          <Shapes :size="13" />
          {{ categories.length }} catégorie{{ categories.length !== 1 ? 's' : '' }}
        </span>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="ecl-content">

      <!-- Error -->
      <div v-if="error" class="ecl-error-bar mb-4">
        <AlertCircle :size="14" /> {{ error }}
      </div>

      <!-- Table card -->
      <div class="ecl-table-wrap">
        <v-data-table
          v-model:search="search"
          :filter-keys="['name']"
          :headers="tableHeaders"
          :items="categories"
          :loading="loading"
          :items-per-page="25"
          :items-per-page-options="[10, 25, 50, 100]"
          density="compact"
          class="ecl-table"
        >
          <template #item.eventType="{ item }">
            <span class="ecl-type-pill">
              {{ item?.eventType?.name || item?.eventTypeName || eventTypeNameById[item?.eventTypeId] || item?.eventType || '—' }}
            </span>
          </template>
          <template #item.hasHomeTeam="{ item }">
            <span v-if="item?.hasHomeTeam" class="ecl-yes-badge">Oui</span>
            <span v-else class="ecl-no-badge">Non</span>
          </template>
          <template #item.actions="{ item }">
            <div class="ecl-actions">
              <div class="ecl-abtn ecl-abtn--edit" @click.stop="openEditDialog(item)">
                <Pencil :size="15" />
              </div>
              <div class="ecl-abtn ecl-abtn--del" @click.stop="openDeleteDialog(item)">
                <Trash2 :size="15" />
              </div>
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <!-- Category Drawer -->
    <v-navigation-drawer v-model="categoryDialog" location="right" temporary :persistent="categoryLoading" width="560" class="ecl-cat-drawer">
      <!-- Gradient header -->
      <div class="ecl-drawer-header">
        <div class="ecl-drawer-header__icon">
          <Shapes :size="20" color="white" />
        </div>
        <div class="ecl-drawer-header__text">
          <div class="ecl-drawer-header__title">{{ categoryDialogMode === 'edit' ? t('eventCategoryList.drawerEditTitle') : t('eventCategoryList.drawerCreateTitle') }}</div>
          <div class="ecl-drawer-header__sub">{{ categoryDialogMode === 'edit' ? t('eventCategoryList.drawerEditSubtitle') : t('eventCategoryList.drawerCreateSubtitle') }}</div>
        </div>
        <button class="ecl-drawer-header__close" @click="closeCategoryDialog"><X :size="18" /></button>
      </div>

      <!-- Body -->
      <div class="ecl-drawer-body">
        <div v-if="categoryError" class="ecl-drawer-error">
          <AlertCircle :size="14" /> {{ categoryError }}
        </div>

        <v-form ref="categoryForm" v-model="categoryFormValid" validate-on="submit">
          <!-- Name field -->
          <v-text-field
            v-model="categoryFormData.name"
            :label="t('eventCategoryList.labelName')"
            :placeholder="t('eventCategoryList.namePlaceholder')"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
            :rules="[rules.required]"
            class="ecl-drawer-input mb-5"
          />

          <!-- Event Type select (with __create__ option) -->
          <div class="ecl-select-wrap mb-5">
            <label class="ecl-select-label">{{ t('eventCategoryList.labelEventType') }}</label>
            <v-select
              v-model="categoryFormData.eventTypeId"
              :items="eventTypesWithCreate"
              item-title="name"
              item-value="id"
              density="comfortable"
              variant="outlined"
              :placeholder="t('eventCategoryList.selectType')"
              hide-details="auto"
              :rules="[rules.required]"
              class="ecl-drawer-select"
              @update:modelValue="handleEventTypeChange"
            >
              <template #item="{ props, item }">
                <v-list-item
                  v-bind="props"
                  :class="item.raw.id === '__create__' ? 'ecl-create-option' : ''"
                  @click="item.raw.id === '__create__' ? handleCreateTypeClick() : null"
                >
                  <template #prepend v-if="item.raw.id === '__create__'">
                    <Plus :size="16" class="mr-2" />
                  </template>
                </v-list-item>
              </template>
            </v-select>
          </div>

          <!-- Has home team -->
          <label class="ecl-checkbox">
            <input type="checkbox" v-model="categoryFormData.hasHomeTeam" class="ecl-checkbox__input" />
            <span class="ecl-checkbox__label">{{ t('eventCategoryList.labelHasHomeTeam') }}</span>
          </label>
        </v-form>
      </div>

      <!-- Footer -->
      <div class="ecl-drawer-footer">
        <button class="ecl-fbtn ecl-fbtn--cancel" @click="closeCategoryDialog">{{ t('eventCategoryList.cancel') }}</button>
        <button class="ecl-fbtn ecl-fbtn--primary" :disabled="categoryLoading" @click="submitCategory">
          <Save :size="14" />
          {{ categoryLoading ? 'Enregistrement…' : t('eventCategoryList.save') }}
        </button>
      </div>
    </v-navigation-drawer>

    <EventTypeDialog v-model="typeDialog" @created="handleTypeCreated" />

    <!-- Delete dialog -->
    <v-dialog v-model="deleteDialog" max-width="440" :persistent="deleteLoading">
      <div class="ecl-modal">
        <div class="ecl-modal__head">
          <div class="ecl-modal__icon-wrap"><Trash2 :size="18" color="#ff3131" /></div>
          <div class="ecl-modal__headtext">
            <div class="ecl-modal__title">{{ t('eventCategoryList.deleteTitle') }}</div>
            <div class="ecl-modal__sub">{{ t('eventCategoryList.deleteSubtitle') }}</div>
          </div>
          <button class="ecl-modal__close" @click="closeDeleteDialog"><X :size="16" /></button>
        </div>
        <div class="ecl-modal__body">
          <div v-if="deleteError" class="ecl-modal__error"><AlertCircle :size="14" /> {{ deleteError }}</div>
          <p class="ecl-modal__text">
            {{ t('eventCategoryList.deleteText') }} <strong>{{ deleteCategoryName }}</strong> ?
          </p>
        </div>
        <div class="ecl-modal__foot">
          <button class="ecl-mbtn ecl-mbtn--cancel" @click="closeDeleteDialog">{{ t('eventCategoryList.deleteCancel') }}</button>
          <button class="ecl-mbtn ecl-mbtn--danger" :disabled="deleteLoading" @click="confirmDelete">
            <Trash2 :size="14" />
            {{ deleteLoading ? t('eventCategoryList.deleteConfirming') : t('eventCategoryList.deleteConfirm') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <TaxonomyImportDrawer
      v-model="taxonomyImportDrawer"
      entity="category"
      :is-dark="isDark"
      @imported="loadCategories"
    />
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Upload, Download, Pencil, Plus, Save, Trash2, X, Search, Shapes, AlertCircle } from "lucide-vue-next";
import { downloadCSV } from "@/utils/csv";
import {
  createEventCategory,
  deleteEventCategory,
  updateEventCategory,
} from "@/api/endpoints/event.api";
import TaxonomyImportDrawer from '../drawers/TaxonomyImportDrawer.vue';
import EventTypeDialog from '../dialogs/EventTypeDialog.vue';

export default {
  name: "EventsCategorieListView",
  components: {
    Upload,
    Download,
    Pencil,
    Plus,
    Save,
    Trash2,
    X,
    Search,
    Shapes,
    AlertCircle,
    TaxonomyImportDrawer,
    EventTypeDialog,
  },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      search: "",
      taxonomyImportDrawer: false,
      loading: false,
      error: "",

      categoryDialog: false,
      categoryDialogMode: "create",
      categoryLoading: false,
      categoryError: "",
      categoryFormValid: false,
      categoryId: null,
      categoryFormData: {
        name: "",
        eventTypeId: null,
        hasHomeTeam: false,
      },

      typeDialog: false,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: "",
      deleteCategoryId: null,
      deleteCategoryName: "",

      rules: {
        required: (v) => (!!String(v || "").trim() ? true : "Required"),
      },
    };
  },

  methods: {
    normalizeId(value) {
      if (!value) return null;
      if (typeof value === 'string' || typeof value === 'number') return value;
      if (typeof value === 'object') return value.id || value._id || null;
      return null;
    },

    async loadEventTypes() {
      try {
        await this.$store.dispatch('eventTypes/fetchEventTypes')
      } catch (e) {
        // silent — store handles fallback
      }
    },
    async loadCategories() {
      this.loading = true;
      this.error = "";
      try {
        await this.$store.dispatch('eventCategories/fetchEventCategories')
      } catch (e) {
        this.error = e?.userMessage || e?.message || "Impossible de charger les catégories";
      } finally {
        this.loading = false;
      }
    },

    openCreateDialog() {
      this.categoryDialogMode = "create";
      this.categoryId = null;
      this.categoryError = "";
      this.categoryFormValid = false;
      this.categoryFormData = {
        name: "",
        eventTypeId: null,
        hasHomeTeam: false,
      };
      this.categoryDialog = true;
    },
    openEditDialog(category) {
      this.categoryDialogMode = "edit";
      this.categoryId = category?.id || category?._id || null;
      this.categoryError = "";
      this.categoryFormValid = false;

      const eventTypeId =
        category?.eventTypeId ||
        category?.eventType?._id ||
        category?.eventType?.id ||
        null;

      this.categoryFormData = {
        name: category?.name || "",
        eventTypeId: this.normalizeId(eventTypeId),
        hasHomeTeam: !!category?.hasHomeTeam,
      };
      this.categoryDialog = true;
    },
    closeCategoryDialog() {
      this.categoryDialog = false;
      this.categoryLoading = false;
      this.categoryError = "";
      this.categoryFormValid = false;
      this.categoryId = null;
    },
    async submitCategory() {
      const form = this.$refs?.categoryForm;
      if (form && typeof form.validate === "function") {
        const result = await form.validate();
        const valid = typeof result === "boolean" ? result : !!result?.valid;
        if (!valid) return;
      }

      this.categoryLoading = true;
      this.categoryError = "";

      try {
        if (this.categoryDialogMode === "edit") {
          if (!this.categoryId) throw new Error("Missing category id");
          const payload = {
            name: this.categoryFormData.name,
            eventTypeId: this.categoryFormData.eventTypeId,
            hasHomeTeam: this.categoryFormData.hasHomeTeam,
          };
          await updateEventCategory(this.categoryId, payload);
          await this.$store.dispatch('eventCategories/updateEventCategory', {
            id: this.categoryId,
            ...payload,
          });
        } else {
          const payload = {
            name: this.categoryFormData.name,
            eventTypeId: this.categoryFormData.eventTypeId,
            hasHomeTeam: this.categoryFormData.hasHomeTeam,
          };
          const response = await createEventCategory(payload);
          const created = response?.data || response;
          await this.$store.dispatch('eventCategories/addEventCategory', created);
        }

        this.closeCategoryDialog();
      } catch (e) {
        this.categoryError = e?.response?.data?.message || e?.message || "Impossible d'enregistrer la catégorie";
      } finally {
        this.categoryLoading = false;
      }
    },

    openDeleteDialog(category) {
      this.deleteCategoryId = category?.id || category?._id || null;
      this.deleteCategoryName = category?.name || "this category";
      this.deleteError = "";
      this.deleteLoading = false;
      this.deleteDialog = true;
    },
    closeDeleteDialog() {
      this.deleteDialog = false;
      this.deleteLoading = false;
      this.deleteError = "";
      this.deleteCategoryId = null;
      this.deleteCategoryName = "";
    },
    async confirmDelete() {
      if (!this.deleteCategoryId) {
        this.deleteError = "Missing category id";
        return;
      }

      this.deleteLoading = true;
      this.deleteError = "";

      try {
        await deleteEventCategory(this.deleteCategoryId);
        await this.$store.dispatch('eventCategories/removeEventCategory', this.deleteCategoryId);
        this.closeDeleteDialog();
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || "Failed to delete category";
      } finally {
        this.deleteLoading = false;
      }
    },

    handleEventTypeChange(value) {
      if (value === "__create__") {
        this.categoryFormData.eventTypeId = null;
        this.typeDialog = true;
      }
    },
    handleCreateTypeClick() {
      this.categoryFormData.eventTypeId = null;
      this.typeDialog = true;
    },
    handleTypeCreated(newType) {
      this.categoryFormData.eventTypeId = newType.id;
    },

    exportToCSV() {
      const rows = [
        ['Name', 'Event Type', 'Has Home Team'],
        ...(this.categories || []).map(c => [
          c?.name || '',
          this.eventTypeNameById[c?.eventTypeId] || '',
          c?.hasHomeTeam ? 'Yes' : 'No',
        ]),
      ];
      downloadCSV(rows, 'event-categories');
    },
  },

  computed: {
    categories() {
      return this.$store.getters['eventCategories/eventCategories']
    },
    eventTypes() {
      return this.$store.getters['eventTypes/eventTypes'].map((t) => ({
        ...t,
        id: t?.id || t?._id,
      })).filter((t) => !!t.id)
    },
    tableHeaders() {
      return [
        { title: this.t('eventCategoryList.colName'), key: 'name' },
        { title: this.t('eventCategoryList.colType'), key: 'eventType' },
        { title: this.t('eventCategoryList.colHomeTeam'), key: 'hasHomeTeam' },
        { title: this.t('eventCategoryList.colActions'), key: 'actions', sortable: false, align: 'end' },
      ];
    },
    eventTypesWithCreate() {
      const createOption = {
        id: "__create__",
        name: "Créer un nouveau type",
      };
      return [createOption, ...this.eventTypes];
    },
    eventTypeNameById() {
      const map = {};
      const types = Array.isArray(this.eventTypes) ? this.eventTypes : [];
      for (const t of types) {
        const id = t?.id || t?._id;
        if (!id) continue;
        map[String(id)] = t?.name || "";
      }
      return map;
    },
  },

  mounted() {
    this.loadEventTypes();
    this.loadCategories();
  },
};
</script>

<style scoped>
.ecl-root { width: 100%; min-height: 100%; background: #f5f5f5; }
.ecl--dark.ecl-root { background: #111827; }

/* ── Header ── */
.ecl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.ecl-header__inner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 28px; gap: 16px; flex-wrap: wrap;
}
.ecl-header__left { display: flex; align-items: center; gap: 14px; }
.ecl-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ecl-header__title { font-size: 20px; font-weight: 800; color: #fff; margin: 0; line-height: 1.2; }
.ecl-header__subtitle { font-size: 12.5px; color: rgba(255,255,255,.72); margin: 3px 0 0; }
.ecl-header__right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.ecl-header__sep { width: 1px; height: 32px; background: rgba(255,255,255,.25); }
.ecl-header__actions { display: flex; align-items: center; gap: 8px; }
.ecl-action-hbtn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 14px; border-radius: 100px;
  border: 1.5px solid rgba(255,255,255,.6);
  background: transparent; color: rgba(255,255,255,.9);
  font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.ecl-action-hbtn:hover { background: rgba(255,255,255,.15); border-color: #fff; }
.ecl-add-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 9px 18px; border-radius: 100px;
  border: 2px solid rgba(255,255,255,.85);
  background: transparent; color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.ecl-add-btn:hover { background: #fff; color: #ff3131; }

/* ── Search bar ── */
.ecl-searchbar {
  background: #fff; border-bottom: 1px solid #e5e7eb;
  position: sticky; top: 81px; z-index: 99; flex-shrink: 0;
}
.ecl--dark .ecl-searchbar { background: #1e293b; border-bottom-color: rgba(255,255,255,.08); }
.ecl-searchbar__inner { display: flex; align-items: center; gap: 10px; padding: 10px 28px; flex-wrap: wrap; }
.ecl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.ecl-searchbar__input {
  flex: 1; min-width: 140px; border: none; outline: none;
  background: transparent; font-size: 14px; color: #111827;
}
.ecl--dark .ecl-searchbar__input { color: #e5e7eb; }
.ecl-searchbar__input::placeholder { color: #9ca3af; }
.ecl-searchbar__count { font-size: 12px; color: #9ca3af; white-space: nowrap; display: flex; align-items: center; gap: 4px; }

/* ── Content ── */
.ecl-content { padding: 24px 28px; }

/* Error */
.ecl-error-bar {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 12px; padding: 12px 16px; font-size: 13.5px;
}

/* Table */
.ecl-table-wrap {
  background: #fff; border-radius: 16px;
  border: 1px solid #e5e7eb; overflow: hidden;
}
.ecl--dark .ecl-table-wrap { background: #1e293b; border-color: rgba(255,255,255,.08); }

.ecl-table :deep(.v-data-table__th),
.ecl-table :deep(.v-data-table__td) {
  font-size: 13px; padding-top: 10px; padding-bottom: 10px;
  padding-left: 16px; padding-right: 16px;
}
.ecl-table :deep(.v-data-table__td) { vertical-align: middle; }
.ecl-table :deep(.v-data-table__th) {
  font-size: 11px !important; font-weight: 600;
  text-transform: uppercase; letter-spacing: .06em;
  color: #9ca3af !important; background: #fafafa !important;
}
.ecl-table :deep(tbody tr:hover td) { background: #fafafa !important; }
.ecl--dark .ecl-table :deep(.v-data-table__th) { background: #1a2332 !important; }
.ecl--dark .ecl-table :deep(tbody tr:hover td) { background: #1a2332 !important; }

.ecl-type-pill {
  display: inline-flex; align-items: center;
  background: #f3f4f6; color: #374151; border-radius: 50px;
  padding: 2px 10px; font-size: 12.5px;
}
.ecl-yes-badge {
  display: inline-flex; background: #f0fdf4; color: #15803d;
  border: 1px solid #bbf7d0; border-radius: 50px; padding: 2px 10px; font-size: 12px; font-weight: 600;
}
.ecl-no-badge {
  display: inline-flex; background: #f9fafb; color: #9ca3af;
  border: 1px solid #e5e7eb; border-radius: 50px; padding: 2px 10px; font-size: 12px;
}
.ecl-actions { display: flex; gap: 4px; justify-content: flex-end; }
.ecl-abtn {
  width: 28px; height: 28px; border-radius: 8px;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0;
}
.ecl-abtn--edit { background: #eff6ff; color: #2563eb; }
.ecl-abtn--edit:hover { background: #dbeafe; }
.ecl-abtn--del { background: #fef2f2; color: #ff3131; }
.ecl-abtn--del:hover { background: #fee2e2; }

/* Drawer */
.ecl-cat-drawer :deep(.v-navigation-drawer__content) { display: flex; flex-direction: column; }
.ecl-drawer-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  flex-shrink: 0;
}
.ecl-drawer-header__icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ecl-drawer-header__text { flex: 1; }
.ecl-drawer-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.ecl-drawer-header__sub { font-size: 12.5px; color: rgba(255,255,255,.75); margin-top: 2px; }
.ecl-drawer-header__close {
  width: 30px; height: 30px; border-radius: 8px; border: none;
  background: rgba(255,255,255,.15);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(255,255,255,.85); transition: background .2s;
}
.ecl-drawer-header__close:hover { background: rgba(255,255,255,.25); }
.ecl-drawer-body { flex: 1; overflow-y: auto; padding: 24px 20px; background: #f9fafb; }
.ecl--dark .ecl-drawer-body { background: #111827; }
.ecl-drawer-error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}

/* Styled v-text-field */
.ecl-drawer-input :deep(.v-field) { border: 1.5px solid #e5e7eb; border-radius: 11px; box-shadow: none; }
.ecl-drawer-input :deep(.v-field--focused) { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.10); }
.ecl-drawer-input :deep(.v-field__outline) { display: none; }
.ecl-drawer-input :deep(.v-label.v-field-label--floating) { color: #ff3131; }

/* v-select styling */
.ecl-select-wrap { display: flex; flex-direction: column; gap: 6px; }
.ecl-select-label { font-size: 12.5px; font-weight: 600; color: #374151; }
.ecl--dark .ecl-select-label { color: #d1d5db; }
.ecl-drawer-select :deep(.v-field) { border: 1.5px solid #e5e7eb; border-radius: 11px; box-shadow: none; }
.ecl-drawer-select :deep(.v-field--focused) { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.10); }
.ecl-drawer-select :deep(.v-field__outline) { display: none; }
.ecl-drawer-select :deep(.v-field__input) { font-size: 14px; }
.ecl--dark .ecl-drawer-select :deep(.v-field) { background: #1f2937; border-color: #4b5563; }

/* Create option */
:deep(.ecl-create-option) { color: #ff3131; font-weight: 600; }

/* Checkbox */
.ecl-checkbox { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.ecl-checkbox__input { width: 18px; height: 18px; accent-color: #ff3131; cursor: pointer; flex-shrink: 0; }
.ecl-checkbox__label { font-size: 14px; color: #374151; user-select: none; }
.ecl--dark .ecl-checkbox__label { color: #d1d5db; }

/* Drawer footer */
.ecl-drawer-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 16px 20px; background: #fff; border-top: 1px solid #e5e7eb; flex-shrink: 0;
}
.ecl--dark .ecl-drawer-footer { background: #1f2937; border-color: #374151; }
.ecl-fbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 40px; border-radius: 50px;
  font-size: 13.5px; font-weight: 500; border: none; cursor: pointer; transition: all .2s;
}
.ecl-fbtn:disabled { opacity: .5; cursor: not-allowed; }
.ecl-fbtn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.ecl-fbtn--cancel:hover { background: #e9ecef; }
.ecl-fbtn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3); }
.ecl-fbtn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }

/* Delete modal */
.ecl-modal {
  background: #fff; border-radius: 20px; overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.15);
}
.ecl-modal__head { display: flex; align-items: flex-start; gap: 14px; padding: 22px 22px 16px; }
.ecl-modal__icon-wrap {
  width: 42px; height: 42px; border-radius: 12px; background: #fef2f2;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ecl-modal__headtext { flex: 1; }
.ecl-modal__title { font-size: 16px; font-weight: 700; color: #111827; }
.ecl-modal__sub { font-size: 13px; color: #6b7280; margin-top: 2px; }
.ecl-modal__close {
  width: 28px; height: 28px; border-radius: 8px; border: none;
  background: #f3f4f6; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #6b7280;
}
.ecl-modal__close:hover { background: #e5e7eb; }
.ecl-modal__body { padding: 0 22px 18px; }
.ecl-modal__error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px;
}
.ecl-modal__text { font-size: 14px; color: #374151; line-height: 1.6; margin: 0; }
.ecl-modal__foot {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 22px; background: #f9fafb; border-top: 1px solid #f3f4f6;
}
.ecl-mbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 18px; height: 38px; border-radius: 50px;
  font-size: 13.5px; font-weight: 500; border: none; cursor: pointer; transition: all .2s;
}
.ecl-mbtn:disabled { opacity: .5; cursor: not-allowed; }
.ecl-mbtn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.ecl-mbtn--cancel:hover { background: #e9ecef; }
.ecl-mbtn--danger { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3); }
.ecl-mbtn--danger:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
</style>
