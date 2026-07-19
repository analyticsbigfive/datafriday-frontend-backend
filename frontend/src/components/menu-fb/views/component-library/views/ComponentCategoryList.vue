<template>
  <div class="ccl-root" :class="{'ccl--dark': isDark}">
    <!-- Header + searchbar regroupés dans un bloc fixe unique (collés) -->
    <div class="ccl-sticky-top">
    <div class="ccl-header">
      <div class="ccl-header__inner">
        <div class="d-flex align-center gap-3">
          <div class="ccl-header__icon">
            <Shapes :size="22" color="#fff" />
          </div>
          <div>
            <p class="ccl-header__title">{{ t('componentCategoryList.title') }}</p>
            <p class="ccl-header__subtitle">{{ t('componentCategoryList.subtitle') }}</p>
          </div>
        </div>

        <div class="d-flex align-center gap-3 flex-wrap">
          <button class="ccl-add-btn" @click="openCreateDialog">
            <Plus :size="16" />
            {{ t('componentCategoryList.addCategory') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Sticky searchbar -->
    <div class="ccl-searchbar">
      <div class="ccl-searchbar__inner">
        <Search :size="16" class="ccl-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="ccl-searchbar__input"
          :placeholder="t('componentCategoryList.searchPlaceholder')"
        />
        <span class="ccl-searchbar__count">{{ filteredCategories.length }} {{ t('componentCategoryList.totalCategories') }}</span>
      </div>
    </div>
    </div><!-- /ccl-sticky-top -->

    <!-- Content -->
    <div class="ccl-content">
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

      <v-card rounded="xl" elevation="0" style="border: 1px solid #e5e7eb; overflow: hidden;">
        <v-data-table
          :headers="tableHeaders"
          :items="filteredCategories"
          item-value="id"
          density="compact"
          :loading="loading"
          class="ccl-table"
        >
          <template #item.typeName="{ item }">
            <v-chip
              v-if="item.typeName"
              size="small"
              color="primary"
              variant="tonal"
              rounded="lg"
            >
              {{ item.typeName }}
            </v-chip>
            <span v-else class="text-medium-emphasis text-caption">{{ t('componentCategoryList.noType') }}</span>
          </template>

          <template #item.createdAt="{ item }">
            {{ formatDate(item.createdAt) }}
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex justify-end" style="gap: 6px">
              <v-btn variant="text" density="compact" size="small" icon @click.stop="openEditDialog(item)">
                <Pencil :size="16" />
              </v-btn>
              <v-btn variant="text" density="compact" size="small" icon @click.stop="openDeleteDialog(item)">
                <Trash2 :size="16" />
              </v-btn>
            </div>
          </template>
        </v-data-table>
      </v-card>
    </div>

    <ComponentCategoryFormDrawer
      v-model="categoryDialog"
      :mode="categoryMode"
      :initial-data="selectedCategory"
      :types="types"
      :is-dark="isDark"
      @saved="loadCategories"
    />

    <ProductDeleteDialog
      v-model="deleteDialog"
      :item-name="deleteTarget?.name"
      :loading="deleteLoading"
      :error="deleteError"
      :is-dark="isDark"
      :title="t('componentCategoryList.deleteTitle')"
      :subtitle="t('componentCategoryList.deleteSubtitle')"
      :message="t('componentCategoryList.deleteConfirm')"
      :cancel-label="t('componentCategoryList.cancel')"
      :confirm-label="t('componentCategoryList.delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Pencil, Trash2, Plus, Shapes, Search } from "lucide-vue-next";
import { deleteComponentCategory } from "@/api/endpoints/menu.api";
import ComponentCategoryFormDrawer from "@/components/menu-fb/views/component-library/drawers/ComponentCategoryFormDrawer.vue";
import ProductDeleteDialog from "@/components/products/dialogs/ProductDeleteDialog.vue";

export default {
  name: "ComponentCategoryList",
  components: {
    Pencil,
    Trash2,
    Plus,
    Shapes,
    Search,
    ComponentCategoryFormDrawer,
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

      categoryDialog: false,
      categoryMode: "create",
      selectedCategory: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: "",
      deleteTarget: null,
    };
  },
  computed: {
    categories() {
      return this.$store.getters['componentCategories/componentCategories']
    },
    types() {
      return this.$store.getters['componentTypes/componentTypes']
    },
    tableHeaders() {
      return [
        { title: this.t('componentCategoryList.colName'), key: "name" },
        { title: this.t('componentCategoryList.colType'), key: "typeName" },
        { title: this.t('componentCategoryList.colCreated'), key: "createdAt" },
        { title: this.t('componentCategoryList.colActions'), key: "actions", sortable: false, align: "end", width: 120 },
      ];
    },
    filteredCategories() {
      const query = (this.searchQuery || "").toLowerCase().trim();
      if (!query) return this.categories;
      return this.categories.filter(cat => {
        const name = (cat.name || "").toLowerCase();
        const typeName = (cat.typeName || "").toLowerCase();
        return name.includes(query) || typeName.includes(query);
      });
    },
  },
  async mounted() {
    await Promise.all([
      this.loadCategories(),
      this.$store.dispatch('componentTypes/fetchComponentTypes'),
    ]);
  },
  methods: {
    async loadCategories() {
      this.loading = true;
      this.loadError = "";
      try {
        await this.$store.dispatch('componentCategories/fetchComponentCategories', { forceRefresh: true });
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || this.t('componentCategoryList.loadError');
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

    async openCreateDialog() {
      this.categoryMode = "create";
      this.selectedCategory = null;
      await this.$store.dispatch('componentTypes/fetchComponentTypes');
      this.categoryDialog = true;
    },
    async openEditDialog(item) {
      const raw = item && item.raw ? item.raw : item;
      this.categoryMode = "edit";
      this.selectedCategory = raw;
      await this.$store.dispatch('componentTypes/fetchComponentTypes');
      this.categoryDialog = true;
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
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = "";
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) {
          this.deleteError = this.t('componentCategoryList.missingId');
          return;
        }
        await deleteComponentCategory(id);
        await this.$store.dispatch('componentCategories/removeComponentCategory', id);
        this.closeDeleteDialog();
      } catch (e) {
        const msg = String(e?.response?.data?.message || e?.message || '').toLowerCase();
        if (msg.includes('cannot delete global component category') || msg.includes('linked') || msg.includes('used') || msg.includes('in use')) {
          this.deleteError = this.t('componentCategoryList.deleteBlockedUsed');
        } else {
          this.deleteError = e?.response?.data?.message || e?.message || this.t('componentCategoryList.deleteError');
        }
      } finally {
        this.deleteLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.ccl-root {
  background: #f6f7fb;
  min-height: 100%;
}

/* ── Header + searchbar : bloc fixe unique (collés) ── */
.ccl-sticky-top {
  position: fixed;
  top: var(--v-layout-top, 64px);
  left: var(--v-layout-left, 0px);
  right: 0;
  z-index: 200;
}
.ccl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, .25);
}
.ccl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.ccl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ccl-header__title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
}
.ccl-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin: 3px 0 0;
}

/* add button */
.ccl-add-btn {
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
.ccl-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Searchbar (collée au header dans le bloc fixe) ── */
.ccl-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.ccl-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
  flex-wrap: wrap;
}
.ccl-searchbar__icon {
  color: #9ca3af;
  flex-shrink: 0;
}
.ccl-searchbar__input {
  flex: 1;
  min-width: 140px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
}
.ccl-searchbar__input::placeholder {
  color: #9ca3af;
}
.ccl-searchbar__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* ── Content ── */
.ccl-content {
  padding: 148px 28px 24px;
}

/* ── Table ── */
.ccl-table :deep(.v-data-table__td) {
  vertical-align: middle;
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
.ccl-table :deep(.v-data-table__th) {
  padding-top: 16px !important;
  padding-bottom: 16px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.025em;
  color: #374151 !important;
  background: #f9fafb !important;
}

/* ── Dark mode ── */
.ccl--dark.ccl-root {
  background: #111827;
}
.ccl--dark .ccl-searchbar {
  background: #1a2332;
  border-bottom-color: #374151;
}
.ccl--dark .ccl-searchbar__input {
  color: #f9fafb;
}
.ccl--dark .ccl-table :deep(.v-data-table__th) {
  color: #9ca3af !important;
  background: #1a2332 !important;
}
</style>
