<template>
  <div class="ctl-root" :class="{'ctl--dark': isDark}">
    <!-- Sticky gradient header -->
    <div class="ctl-header">
      <div class="ctl-header__inner">
        <div class="d-flex align-center gap-3">
          <div class="ctl-header__icon">
            <Tag :size="22" color="#fff" />
          </div>
          <div>
            <p class="ctl-header__title">{{ t('componentTypeList.title') }}</p>
            <p class="ctl-header__subtitle">{{ t('componentTypeList.subtitle') }}</p>
          </div>
        </div>

        <div class="d-flex align-center gap-3 flex-wrap">
          <button class="ctl-add-btn" @click="openCreateDialog">
            <Plus :size="16" />
            {{ t('componentTypeList.addType') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Sticky searchbar -->
    <div class="ctl-searchbar">
      <div class="ctl-searchbar__inner">
        <Search :size="16" class="ctl-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="ctl-searchbar__input"
          :placeholder="t('componentTypeList.searchPlaceholder')"
        />
        <span class="ctl-searchbar__count">{{ filteredTypes.length }} {{ t('componentTypeList.totalTypes') }}</span>
      </div>
    </div>

    <!-- Content -->
    <div class="ctl-content">
      <v-progress-linear
        v-if="loading"
        indeterminate
        color="#ff3131"
        height="3"
        rounded
        class="mb-4"
      />

      <v-alert v-if="loadError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">
        {{ loadError }}
      </v-alert>

      <div class="ctl-table-wrap">
        <v-data-table
          :headers="tableHeaders"
          :items="filteredTypes"
          :loading="loading"
          item-value="id"
          density="compact"
          class="ctl-table"
        >
          <template #item.categories="{ item }">
            <div v-if="item.categoryList && item.categoryList.length > 0">
              <v-chip
                size="small"
                color="primary"
                variant="tonal"
                rounded="lg"
                @click="openCategoriesDialog(item)"
                style="cursor: pointer;"
              >
                {{ item.categoryList.length }} {{ item.categoryList.length === 1 ? t('componentTypeList.category') : t('componentTypeList.categories') }}
              </v-chip>
            </div>
            <span v-else class="text-medium-emphasis text-caption">{{ t('componentTypeList.noCategories') }}</span>
          </template>

          <template #item.createdAt="{ item }">
            {{ formatDate(item.createdAt) }}
          </template>

          <template #item.actions="{ item }">
            <div class="ctl-actions">
              <div class="ctl-abtn ctl-abtn--edit" @click.stop="openEditDialog(item)">
                <Pencil :size="15" />
              </div>
              <div class="ctl-abtn ctl-abtn--del" @click.stop="openDeleteDialog(item)">
                <Trash2 :size="15" />
              </div>
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <ComponentTypeFormDrawer
      v-model="typeDialog"
      :mode="typeMode"
      :initial-data="selectedType"
      :is-dark="isDark"
      @saved="loadTypes"
    />

    <ComponentTypeCategoriesDrawer
      v-model="categoriesDialog"
      :component-type="selectedTypeForCategories"
      :is-dark="isDark"
    />

    <ProductDeleteDialog
      v-model="deleteDialog"
      :item-name="deleteTarget?.name"
      :loading="deleteLoading"
      :error="deleteError"
      :is-dark="isDark"
      :title="t('componentTypeList.deleteTitle')"
      :subtitle="t('componentTypeList.deleteSubtitle')"
      :message="t('componentTypeList.deleteConfirm')"
      :cancel-label="t('componentTypeList.cancel')"
      :confirm-label="t('componentTypeList.delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Pencil, Trash2, Plus, Tag, Search } from "lucide-vue-next";
import { deleteComponentType } from "@/api/endpoints/menu.api";
import ComponentTypeFormDrawer from "@/components/menu-fb/views/component-library/drawers/ComponentTypeFormDrawer.vue";
import ComponentTypeCategoriesDrawer from "@/components/menu-fb/views/component-library/drawers/ComponentTypeCategoriesDrawer.vue";
import ProductDeleteDialog from "@/components/products/dialogs/ProductDeleteDialog.vue";

export default {
  name: "ComponentTypeList",
  components: {
    Pencil,
    Trash2,
    Plus,
    Tag,
    Search,
    ComponentTypeFormDrawer,
    ComponentTypeCategoriesDrawer,
    ProductDeleteDialog,
  },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      loading: false,
      loadError: "",
      searchQuery: "",

      typeDialog: false,
      typeMode: "create",
      selectedType: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: "",
      deleteTarget: null,

      categoriesDialog: false,
      selectedTypeForCategories: null,
    };
  },
  computed: {
    types() {
      return this.$store.getters['componentTypes/componentTypes'].map((t) => ({
        ...t,
        id: t?.id || t?._id,
        categoryList: Array.isArray(t?.categories) ? t.categories : [],
      }))
    },
    tableHeaders() {
      return [
        { title: this.t('componentTypeList.colName'), key: "name" },
        { title: this.t('componentTypeList.colCategories'), key: "categories", sortable: false, width: 300 },
        { title: this.t('componentTypeList.colCreated'), key: "createdAt" },
        { title: this.t('componentTypeList.colActions'), key: "actions", sortable: false, align: "end", width: 120 },
      ];
    },
    filteredTypes() {
      const query = (this.searchQuery || "").toLowerCase().trim();
      if (!query) return this.types;
      return this.types.filter(type => {
        const name = (type.name || "").toLowerCase();
        return name.includes(query);
      });
    },
  },
  mounted() {
    this.$store.dispatch('componentTypes/fetchComponentTypes');
  },
  methods: {
    async loadTypes() {
      this.loading = true;
      this.loadError = "";
      try {
        await this.$store.dispatch('componentTypes/fetchComponentTypes', { forceRefresh: true })
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || "Failed to load types";
      } finally {
        this.loading = false;
      }
    },
    formatDate(value) {
      if (!value) return "-";
      try {
        return new Date(value).toLocaleString();
      } catch {
        return String(value);
      }
    },

    openCreateDialog() {
      this.typeMode = "create";
      this.selectedType = null;
      this.typeDialog = true;
    },
    openEditDialog(item) {
      const raw = item && item.raw ? item.raw : item;
      this.typeMode = "edit";
      this.selectedType = raw;
      this.typeDialog = true;
    },

    openDeleteDialog(item) {
      const raw = item && item.raw ? item.raw : item;
      this.deleteError = "";
      this.deleteLoading = false;
      this.deleteTarget = raw;
      this.deleteDialog = true;
    },
    closeDeleteDialog() {
      this.deleteDialog = false;
      this.deleteLoading = false;
      this.deleteError = "";
      this.deleteTarget = null;
    },

    openCategoriesDialog(type) {
      this.selectedTypeForCategories = type;
      this.categoriesDialog = true;
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = "";
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) {
          this.deleteError = "Identifiant manquant";
          return;
        }
        // Pré-vérification : le type a des catégories liées (suppression en
        // cascade côté backend, on préfère avertir plutôt que supprimer en silence).
        if (this.deleteTarget?.categoryList?.length > 0) {
          this.deleteError = "Impossible de supprimer un Component Type lié à des catégories.";
          return;
        }
        await deleteComponentType(id);
        await this.$store.dispatch('componentTypes/removeComponentType', id);
        this.closeDeleteDialog();
      } catch (e) {
        const msg = String(e?.response?.data?.message || e?.message || '').toLowerCase();
        if (msg.includes('cannot delete global component type') || msg.includes('categor') || msg.includes('linked') || msg.includes('used') || msg.includes('in use')) {
          this.deleteError = "Impossible de supprimer un Component Type lié à des catégories.";
        } else {
          this.deleteError = e?.response?.data?.message || e?.message || "Échec de la suppression";
        }
      } finally {
        this.deleteLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.ctl-root {
  background: #f6f7fb;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Sticky gradient header ── */
.ctl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, .25);
  position: sticky;
  top: 0;
  z-index: 100;
  flex-shrink: 0;
}
.ctl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.ctl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ctl-header__title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
}
.ctl-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin: 3px 0 0;
}

/* add button */
.ctl-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 18px;
  border-radius: 100px;
  border: 2px solid rgba(255, 255, 255, .85);
  background: transparent;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .2s;
}
.ctl-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Sticky searchbar ── */
.ctl-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 81px;
  z-index: 99;
}
.ctl-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
  flex-wrap: wrap;
}
.ctl-searchbar__icon {
  color: #9ca3af;
  flex-shrink: 0;
}
.ctl-searchbar__input {
  flex: 1;
  min-width: 140px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
}
.ctl-searchbar__input::placeholder {
  color: #9ca3af;
}
.ctl-searchbar__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* ── Content ── */
.ctl-content {
  padding: 24px 28px;
}

/* ── Table wrap ── */
.ctl-table-wrap {
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}
.ctl--dark .ctl-table-wrap {
  background: #1e293b;
  border-color: rgba(255, 255, 255, .08);
}

/* ── Table ── */
.ctl-table :deep(.v-data-table__th),
.ctl-table :deep(.v-data-table__td) {
  font-size: 13px;
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 16px;
  padding-right: 16px;
}
.ctl-table :deep(.v-data-table__td) { vertical-align: middle; }
.ctl-table :deep(.v-data-table__th) {
  font-size: 11px !important;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #9ca3af !important;
  background: #fafafa !important;
}
.ctl-table :deep(tbody tr:hover td) { background: #fafafa !important; }
.ctl--dark .ctl-table :deep(.v-data-table__th) { background: #1a2332 !important; }
.ctl--dark .ctl-table :deep(tbody tr:hover td) { background: #1a2332 !important; }

/* ── Table action buttons ── */
.ctl-actions { display: flex; gap: 4px; justify-content: flex-end; }
.ctl-abtn {
  width: 28px; height: 28px;
  border-radius: 8px;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0;
}
.ctl-abtn--edit:hover { background: #e5e7eb; color: #374151; }
.ctl-abtn--del:hover { background: #fef2f2; color: #ff3131; }

/* ── Dark mode ── */
.ctl--dark.ctl-root {
  background: #111827;
}
.ctl--dark .ctl-searchbar {
  background: #1a2332;
  border-bottom-color: #374151;
}
.ctl--dark .ctl-searchbar__input {
  color: #f9fafb;
}
</style>
