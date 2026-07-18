<template>
  <div class="esl-root" :class="{'esl--dark': isDark}">

    <!-- ── Header ── -->
    <div class="esl-header sticky-header">
      <div class="esl-header__inner">
        <div class="esl-header__left">
          <div class="esl-header__icon">
            <Layers :size="22" color="white" />
          </div>
          <div>
            <h1 class="esl-header__title">{{ t('eventSubcategoryList.title') }}</h1>
            <p class="esl-header__subtitle">{{ t('eventSubcategoryList.subtitle') }}</p>
          </div>
        </div>
        <div class="esl-header__right">
          <div class="esl-header__sep"></div>
          <div class="esl-header__actions">
            <button class="esl-action-hbtn" @click="exportToCSV">
              <Download :size="15" /> {{ t('eventSubcategoryList.exportCsv') }}
            </button>
            <button class="esl-action-hbtn" @click="taxonomyImportDrawer = true">
              <Upload :size="15" /> {{ t('eventSubcategoryList.importCsv') }}
            </button>
            <button class="esl-add-btn" @click="openCreateDialog">
              <Plus :size="17" /> {{ t('eventSubcategoryList.newSubcategory') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Search bar ── -->
    <div class="esl-searchbar sticky-search">
      <div class="esl-searchbar__inner">
        <Search :size="17" class="esl-searchbar__icon" />
        <input v-model="search" class="esl-searchbar__input" type="search" :placeholder="t('eventSubcategoryList.searchPlaceholder')" />
        <span class="esl-searchbar__count">
          <Layers :size="13" />
          {{ subcategories.length }} sous-catégorie{{ subcategories.length !== 1 ? 's' : '' }}
        </span>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="esl-content">

      <!-- Error -->
      <div v-if="error" class="esl-error-bar mb-4">
        <AlertCircle :size="14" /> {{ error }}
      </div>

      <!-- Table card -->
      <div class="esl-table-wrap">
        <v-data-table
          v-model:search="search"
          :filter-keys="['name']"
          :headers="tableHeaders"
          :items="subcategories"
          :loading="loading"
          :items-per-page="25"
          :items-per-page-options="[10, 25, 50, 100]"
          density="compact"
          class="esl-table"
        >
          <template #item.category="{ item }">
            <span class="esl-cat-pill">
              {{
                item?.category?.name ||
                item?.eventCategory?.name ||
                categoryNameById[item?.categoryId] ||
                categoryNameById[item?.eventCategoryId] ||
                '—'
              }}
            </span>
          </template>
          <template #item.actions="{ item }">
            <div class="esl-actions">
              <div class="esl-abtn esl-abtn--edit" @click.stop="openEditDialog(item)">
                <Pencil :size="15" />
              </div>
              <div class="esl-abtn esl-abtn--del" @click.stop="openDeleteDialog(item)">
                <Trash2 :size="15" />
              </div>
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <!-- Subcategory Drawer -->
    <v-navigation-drawer v-model="subDialog" location="right" temporary :persistent="subLoading" width="560" class="esl-sub-drawer">
      <!-- Gradient header -->
      <div class="esl-drawer-header">
        <div class="esl-drawer-header__icon">
          <Layers :size="20" color="white" />
        </div>
        <div class="esl-drawer-header__text">
          <div class="esl-drawer-header__title">{{ subDialogMode === 'edit' ? t('eventSubcategoryList.drawerEditTitle') : t('eventSubcategoryList.drawerCreateTitle') }}</div>
          <div class="esl-drawer-header__sub">{{ subDialogMode === 'edit' ? t('eventSubcategoryList.drawerEditSubtitle') : t('eventSubcategoryList.drawerCreateSubtitle') }}</div>
        </div>
        <button class="esl-drawer-header__close" @click="closeSubDialog"><X :size="18" /></button>
      </div>

      <!-- Body -->
      <div class="esl-drawer-body">
        <div v-if="subError" class="esl-drawer-error">
          <AlertCircle :size="14" /> {{ subError }}
        </div>

        <v-form ref="subForm" v-model="subFormValid" validate-on="submit">
          <!-- Name field -->
          <v-text-field
            v-model="subFormData.name"
            :label="t('eventSubcategoryList.labelName')"
            :placeholder="t('eventSubcategoryList.namePlaceholder')"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
            :rules="[rules.required]"
            class="esl-drawer-input mb-5"
          />

          <!-- Category select (with __create__ option) -->
          <div class="esl-select-wrap">
            <label class="esl-select-label">{{ t('eventSubcategoryList.labelCategory') }}</label>
            <v-select
              v-model="subFormData.categoryId"
              :items="categoriesWithCreate"
              item-title="name"
              item-value="id"
              density="comfortable"
              variant="outlined"
              :placeholder="t('eventSubcategoryList.selectCategory')"
              hide-details="auto"
              :rules="[rules.required]"
              class="esl-drawer-select"
              @update:modelValue="handleCategoryChange"
            >
              <template #item="{ props, item }">
                <v-list-item
                  v-bind="props"
                  :class="item.raw.id === '__create__' ? 'esl-create-option' : ''"
                  @click="item.raw.id === '__create__' ? handleCreateCategoryClick() : null"
                >
                  <template #prepend v-if="item.raw.id === '__create__'">
                    <Plus :size="16" class="mr-2" />
                  </template>
                </v-list-item>
              </template>
            </v-select>
          </div>
        </v-form>
      </div>

      <!-- Footer -->
      <div class="esl-drawer-footer">
        <button class="esl-fbtn esl-fbtn--cancel" @click="closeSubDialog">{{ t('eventSubcategoryList.cancel') }}</button>
        <button class="esl-fbtn esl-fbtn--primary" :disabled="subLoading" @click="submitSubcategory">
          <Save :size="14" />
          {{ subLoading ? 'Enregistrement…' : t('eventSubcategoryList.save') }}
        </button>
      </div>
    </v-navigation-drawer>

    <EventCategoryDialog v-model="categoryDialog" :event-types="eventTypes" @created="handleCategoryCreated" />

    <!-- Delete dialog -->
    <v-dialog v-model="deleteDialog" max-width="440" :persistent="deleteLoading">
      <div class="esl-modal">
        <div class="esl-modal__head">
          <div class="esl-modal__icon-wrap"><Trash2 :size="18" color="#ff3131" /></div>
          <div class="esl-modal__headtext">
            <div class="esl-modal__title">{{ t('eventSubcategoryList.deleteTitle') }}</div>
            <div class="esl-modal__sub">{{ t('eventSubcategoryList.deleteSubtitle') }}</div>
          </div>
          <button class="esl-modal__close" @click="closeDeleteDialog"><X :size="16" /></button>
        </div>
        <div class="esl-modal__body">
          <div v-if="deleteError" class="esl-modal__error"><AlertCircle :size="14" /> {{ deleteError }}</div>
          <p class="esl-modal__text">
            {{ t('eventSubcategoryList.deleteText') }} <strong>{{ deleteSubName }}</strong> ?
          </p>
        </div>
        <div class="esl-modal__foot">
          <button class="esl-mbtn esl-mbtn--cancel" @click="closeDeleteDialog">{{ t('eventSubcategoryList.deleteCancel') }}</button>
          <button class="esl-mbtn esl-mbtn--danger" :disabled="deleteLoading" @click="confirmDelete">
            <Trash2 :size="14" />
            {{ deleteLoading ? t('eventSubcategoryList.deleteConfirming') : t('eventSubcategoryList.deleteConfirm') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <TaxonomyImportDrawer
      v-model="taxonomyImportDrawer"
      entity="subcategory"
      :is-dark="isDark"
      @imported="loadSubcategories"
    />
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Download, Pencil, Plus, Save, Trash2, Upload, X, Search, Layers, AlertCircle } from "lucide-vue-next";
import { downloadCSV } from "@/utils/csv";
import {
  createEventSubcategory,
  deleteEventSubcategory,
  updateEventSubcategory,
} from "@/api/endpoints/event.api";
import TaxonomyImportDrawer from '../drawers/TaxonomyImportDrawer.vue';
import EventCategoryDialog from '../dialogs/EventCategoryDialog.vue';

export default {
  name: "EventsSubcategorieListView",
  components: {
    Download,
    Pencil,
    Plus,
    Save,
    Trash2,
    Upload,
    X,
    Search,
    Layers,
    AlertCircle,
    TaxonomyImportDrawer,
    EventCategoryDialog,
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

      eventTypes: [],
      loading: false,
      error: "",

      subDialog: false,
      subDialogMode: "create",
      subLoading: false,
      subError: "",
      subFormValid: false,
      subId: null,
      subFormData: {
        name: "",
        categoryId: null,
      },

      categoryDialog: false,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: "",
      deleteSubId: null,
      deleteSubName: "",

      rules: {
        required: (v) => (!!String(v || "").trim() ? true : "Required"),
      },
    };
  },

  computed: {
    subcategories() {
      return this.$store.getters['eventSubcategories/eventSubcategories']
    },
    categories() {
      return this.$store.getters['eventCategories/eventCategories']
        .map((c) => ({ ...c, id: c?.id || c?._id }))
        .filter((c) => !!c.id)
    },
    tableHeaders() {
      return [
        { title: this.t('eventSubcategoryList.colName'), key: 'name' },
        { title: this.t('eventSubcategoryList.colCategory'), key: 'category' },
        { title: this.t('eventSubcategoryList.colActions'), key: 'actions', sortable: false, align: 'end' },
      ];
    },
    categoriesWithCreate() {
      const createOption = {
        id: "__create__",
        name: "Créer une nouvelle catégorie",
      };
      return [createOption, ...this.categories];
    },
    categoryNameById() {
      const map = {};
      const list = Array.isArray(this.categories) ? this.categories : [];
      for (const c of list) {
        const id = c?.id || c?._id;
        if (!id) continue;
        map[String(id)] = c?.name || "";
      }
      return map;
    },
  },

  methods: {
    normalizeId(value) {
      if (!value) return null;
      if (typeof value === "string" || typeof value === "number") return value;
      if (typeof value === "object") return value.id || value._id || null;
      return null;
    },

    async loadCategories() {
      try {
        await this.$store.dispatch('eventCategories/fetchEventCategories');
      } catch (e) {
        // silence — computed retournera []
      }
    },
    async loadSubcategories({ forceRefresh = false } = {}) {
      this.loading = true;
      this.error = "";
      try {
        await this.$store.dispatch('eventSubcategories/fetchEventSubcategories', { forceRefresh });
      } catch (e) {
        this.error =
          e?.response?.data?.message ||
          e?.message ||
          "Erreur lors du chargement des sous catégories";
      } finally {
        this.loading = false;
      }
    },

    async loadEventTypes() {
      try {
        await this.$store.dispatch('eventTypes/fetchEventTypes');
        const list = this.$store.getters['eventTypes/eventTypes'];
        this.eventTypes = list.map((t) => ({
          ...t,
          id: t?.id || t?._id,
        })).filter((t) => !!t.id);
      } catch (e) {
        this.eventTypes = [];
      }
    },

    openCreateDialog() {
      this.subDialogMode = "create";
      this.subId = null;
      this.subError = "";
      this.subFormValid = false;
      this.subFormData = {
        name: "",
        categoryId: null,
      };
      this.subDialog = true;
    },
    openEditDialog(sub) {
      this.subDialogMode = "edit";
      this.subId = sub?.id || sub?._id || null;
      this.subError = "";
      this.subFormValid = false;

      const categoryId =
        sub?.categoryId ||
        sub?.eventCategoryId ||
        sub?.category?._id ||
        sub?.category?.id ||
        sub?.eventCategory?._id ||
        sub?.eventCategory?.id ||
        null;

      this.subFormData = {
        name: sub?.name || "",
        categoryId: this.normalizeId(categoryId),
      };
      this.subDialog = true;
    },
    closeSubDialog() {
      this.subDialog = false;
      this.subLoading = false;
      this.subError = "";
      this.subFormValid = false;
      this.subId = null;
    },
    async submitSubcategory() {
      const form = this.$refs?.subForm;
      if (form && typeof form.validate === "function") {
        const result = await form.validate();
        const valid = typeof result === "boolean" ? result : !!result?.valid;
        if (!valid) return;
      }

      this.subLoading = true;
      this.subError = "";

      try {
        const payload = {
          name: this.subFormData.name,
          categoryId: this.subFormData.categoryId,
        };

        if (this.subDialogMode === "edit") {
          if (!this.subId) throw new Error("Missing subcategory id");
          const updated = await updateEventSubcategory(this.subId, payload);
          this.$store.dispatch('eventSubcategories/updateEventSubcategory', updated?.data ?? updated);
        } else {
          const created = await createEventSubcategory(payload);
          this.$store.dispatch('eventSubcategories/addEventSubcategory', created?.data ?? created);
        }

        this.closeSubDialog();
      } catch (e) {
        this.subError = e?.response?.data?.message || e?.message || "Impossible d'enregistrer la sous catégorie";
      } finally {
        this.subLoading = false;
      }
    },

    openDeleteDialog(sub) {
      this.deleteSubId = sub?.id || sub?._id || null;
      this.deleteSubName = sub?.name || "this subcategory";
      this.deleteError = "";
      this.deleteLoading = false;
      this.deleteDialog = true;
    },
    closeDeleteDialog() {
      this.deleteDialog = false;
      this.deleteLoading = false;
      this.deleteError = "";
      this.deleteSubId = null;
      this.deleteSubName = "";
    },
    async confirmDelete() {
      if (!this.deleteSubId) {
        this.deleteError = "Missing subcategory id";
        return;
      }

      this.deleteLoading = true;
      this.deleteError = "";

      try {
        await deleteEventSubcategory(this.deleteSubId);
        this.$store.dispatch('eventSubcategories/removeEventSubcategory', this.deleteSubId);
        this.closeDeleteDialog();
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || "Failed to delete subcategory";
      } finally {
        this.deleteLoading = false;
      }
    },

    handleCategoryChange(value) {
      if (value === "__create__") {
        this.subFormData.categoryId = null;
        this.categoryDialog = true;
      }
    },
    handleCreateCategoryClick() {
      this.subFormData.categoryId = null;
      this.categoryDialog = true;
    },
    handleCategoryCreated(newCat) {
      this.subFormData.categoryId = newCat.id;
    },

    exportToCSV() {
      const rows = [
        ['Name', 'Event Category'],
        ...(this.subcategories || []).map(s => [
          s?.name || '',
          this.categoryNameById[s?.categoryId] || this.categoryNameById[s?.eventCategoryId] || '',
        ]),
      ];
      downloadCSV(rows, 'event-subcategories');
    },
  },

  mounted() {
    this.loadEventTypes();
    this.loadCategories();
    this.loadSubcategories();
  },
};
</script>

<style scoped>
.esl-root { width: 100%; min-height: 100%; background: #f5f5f5; }
.esl--dark.esl-root { background: #111827; }

/* ── Header ── */
.esl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.esl-header__inner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 28px; gap: 16px; flex-wrap: wrap;
}
.esl-header__left { display: flex; align-items: center; gap: 14px; }
.esl-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.esl-header__title { font-size: 20px; font-weight: 800; color: #fff; margin: 0; line-height: 1.2; }
.esl-header__subtitle { font-size: 12.5px; color: rgba(255,255,255,.72); margin: 3px 0 0; }
.esl-header__right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.esl-header__sep { width: 1px; height: 32px; background: rgba(255,255,255,.25); }
.esl-header__actions { display: flex; align-items: center; gap: 8px; }
.esl-action-hbtn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 14px; border-radius: 100px;
  border: 1.5px solid rgba(255,255,255,.6);
  background: transparent; color: rgba(255,255,255,.9);
  font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.esl-action-hbtn:hover { background: rgba(255,255,255,.15); border-color: #fff; }
.esl-add-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 9px 18px; border-radius: 100px;
  border: 2px solid rgba(255,255,255,.85);
  background: transparent; color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.esl-add-btn:hover { background: #fff; color: #ff3131; }

/* ── Search bar ── */
.esl-searchbar {
  background: #fff; border-bottom: 1px solid #e5e7eb;
  position: sticky; top: 81px; z-index: 99; flex-shrink: 0;
}
.esl--dark .esl-searchbar { background: #1e293b; border-bottom-color: rgba(255,255,255,.08); }
.esl-searchbar__inner { display: flex; align-items: center; gap: 10px; padding: 10px 28px; flex-wrap: wrap; }
.esl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.esl-searchbar__input {
  flex: 1; min-width: 140px; border: none; outline: none;
  background: transparent; font-size: 14px; color: #111827;
}
.esl--dark .esl-searchbar__input { color: #e5e7eb; }
.esl-searchbar__input::placeholder { color: #9ca3af; }
.esl-searchbar__count { font-size: 12px; color: #9ca3af; white-space: nowrap; display: flex; align-items: center; gap: 4px; }

/* ── Content ── */
.esl-content { padding: 24px 28px; }

/* Error */
.esl-error-bar {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 12px; padding: 12px 16px; font-size: 13.5px;
}

/* Table */
.esl-table-wrap {
  background: #fff; border-radius: 16px;
  border: 1px solid #e5e7eb; overflow: hidden;
}
.esl--dark .esl-table-wrap { background: #1e293b; border-color: rgba(255,255,255,.08); }

.esl-table :deep(.v-data-table__th),
.esl-table :deep(.v-data-table__td) {
  font-size: 13px; padding-top: 10px; padding-bottom: 10px;
  padding-left: 16px; padding-right: 16px;
}
.esl-table :deep(.v-data-table__td) { vertical-align: middle; }
.esl-table :deep(.v-data-table__th) {
  font-size: 11px !important; font-weight: 600;
  text-transform: uppercase; letter-spacing: .06em;
  color: #9ca3af !important; background: #fafafa !important;
}
.esl-table :deep(tbody tr:hover td) { background: #fafafa !important; }
.esl--dark .esl-table :deep(.v-data-table__th) { background: #1a2332 !important; }
.esl--dark .esl-table :deep(tbody tr:hover td) { background: #1a2332 !important; }

.esl-cat-pill {
  display: inline-flex; align-items: center;
  background: #f3f4f6; color: #374151; border-radius: 50px;
  padding: 2px 10px; font-size: 12.5px;
}
.esl-actions { display: flex; gap: 4px; justify-content: flex-end; }
.esl-abtn {
  width: 28px; height: 28px; border-radius: 8px;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0;
}
.esl-abtn--edit { background: #eff6ff; color: #2563eb; }
.esl-abtn--edit:hover { background: #dbeafe; }
.esl-abtn--del { background: #fef2f2; color: #ff3131; }
.esl-abtn--del:hover { background: #fee2e2; }

/* Drawer */
.esl-sub-drawer :deep(.v-navigation-drawer__content) { display: flex; flex-direction: column; }
.esl-drawer-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  flex-shrink: 0;
}
.esl-drawer-header__icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.esl-drawer-header__text { flex: 1; }
.esl-drawer-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.esl-drawer-header__sub { font-size: 12.5px; color: rgba(255,255,255,.75); margin-top: 2px; }
.esl-drawer-header__close {
  width: 30px; height: 30px; border-radius: 8px; border: none;
  background: rgba(255,255,255,.15);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(255,255,255,.85); transition: background .2s;
}
.esl-drawer-header__close:hover { background: rgba(255,255,255,.25); }

.esl-drawer-body { flex: 1; overflow-y: auto; padding: 24px 20px; background: #f9fafb; }
.esl--dark .esl-drawer-body { background: #111827; }
.esl-drawer-error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}

/* Styled v-text-field */
.esl-drawer-input :deep(.v-field) { border: 1.5px solid #e5e7eb; border-radius: 11px; box-shadow: none; }
.esl-drawer-input :deep(.v-field--focused) { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.10); }
.esl-drawer-input :deep(.v-field__outline) { display: none; }
.esl-drawer-input :deep(.v-label.v-field-label--floating) { color: #ff3131; }

/* v-select */
.esl-select-wrap { display: flex; flex-direction: column; gap: 6px; }
.esl-select-label { font-size: 12.5px; font-weight: 600; color: #374151; }
.esl--dark .esl-select-label { color: #d1d5db; }
.esl-drawer-select :deep(.v-field) { border: 1.5px solid #e5e7eb; border-radius: 11px; box-shadow: none; }
.esl-drawer-select :deep(.v-field--focused) { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.10); }
.esl-drawer-select :deep(.v-field__outline) { display: none; }
.esl-drawer-select :deep(.v-field__input) { font-size: 14px; }
.esl--dark .esl-drawer-select :deep(.v-field) { background: #1f2937; border-color: #4b5563; }

:deep(.esl-create-option) { color: #ff3131; font-weight: 600; }

/* Drawer footer */
.esl-drawer-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 16px 20px; background: #fff; border-top: 1px solid #e5e7eb; flex-shrink: 0;
}
.esl--dark .esl-drawer-footer { background: #1f2937; border-color: #374151; }
.esl-fbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 40px; border-radius: 50px;
  font-size: 13.5px; font-weight: 500; border: none; cursor: pointer; transition: all .2s;
}
.esl-fbtn:disabled { opacity: .5; cursor: not-allowed; }
.esl-fbtn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.esl-fbtn--cancel:hover { background: #e9ecef; }
.esl-fbtn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3); }
.esl-fbtn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }

/* Delete modal */
.esl-modal { background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.15); }
.esl-modal__head { display: flex; align-items: flex-start; gap: 14px; padding: 22px 22px 16px; }
.esl-modal__icon-wrap { width: 42px; height: 42px; border-radius: 12px; background: #fef2f2; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.esl-modal__headtext { flex: 1; }
.esl-modal__title { font-size: 16px; font-weight: 700; color: #111827; }
.esl-modal__sub { font-size: 13px; color: #6b7280; margin-top: 2px; }
.esl-modal__close { width: 28px; height: 28px; border-radius: 8px; border: none; background: #f3f4f6; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #6b7280; }
.esl-modal__close:hover { background: #e5e7eb; }
.esl-modal__body { padding: 0 22px 18px; }
.esl-modal__error { display: flex; align-items: center; gap: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }
.esl-modal__text { font-size: 14px; color: #374151; line-height: 1.6; margin: 0; }
.esl-modal__foot { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px; background: #f9fafb; border-top: 1px solid #f3f4f6; }
.esl-mbtn { display: inline-flex; align-items: center; gap: 6px; padding: 0 18px; height: 38px; border-radius: 50px; font-size: 13.5px; font-weight: 500; border: none; cursor: pointer; transition: all .2s; }
.esl-mbtn:disabled { opacity: .5; cursor: not-allowed; }
.esl-mbtn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.esl-mbtn--cancel:hover { background: #e9ecef; }
.esl-mbtn--danger { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3); }
.esl-mbtn--danger:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
</style>
