<template>
  <div class="pcl-root" :class="{'pcl--dark': isDark}">
    <!-- Header + searchbar regroupés dans un bloc fixe unique (collés) -->
    <div class="pcl-sticky-top">
    <div class="pcl-header">
      <div class="pcl-header__inner">
        <div class="d-flex align-center gap-3">
          <div class="pcl-header__icon">
            <Shapes :size="22" color="#fff" />
          </div>
          <div>
            <p class="pcl-header__title">{{ t('marketPriceCategoryList.title') }}</p>
            <p class="pcl-header__subtitle">{{ t('marketPriceCategoryList.subtitle') }}</p>
          </div>
        </div>

        <div class="d-flex align-center gap-3 flex-wrap">
          <button class="pcl-add-btn" @click="openCreateDialog">
            <Plus :size="16" />
            {{ t('marketPriceCategoryList.addCategory') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Sticky searchbar -->
    <div class="pcl-searchbar">
      <div class="pcl-searchbar__inner">
        <Search :size="16" class="pcl-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="pcl-searchbar__input"
          :placeholder="t('marketPriceCategoryList.searchPlaceholder')"
        />
        <span class="pcl-searchbar__count">{{ serverTotal }} {{ t('marketPriceCategoryList.totalCategories') }}</span>
      </div>
    </div>
    </div><!-- /pcl-sticky-top -->

    <!-- Content -->
    <div class="pcl-content">
      <v-progress-linear
        v-if="serverLoading"
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
          :items="categories"
          :items-length="serverTotal"
          :items-per-page="serverItemsPerPage"
          item-value="id"
          density="compact"
          @update:options="onUpdateOptions"
          class="pcl-table"
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
            <span v-else class="text-medium-emphasis text-caption">{{ t('marketPriceCategoryList.noType') }}</span>
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

    <MarketPriceCategoryFormDrawer
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
      :action-link="deleteActionLink"
      :is-dark="isDark"
      :title="t('marketPriceCategoryList.deleteTitle')"
      :subtitle="t('marketPriceCategoryList.deleteSubtitle')"
      :message="t('marketPriceCategoryList.deleteConfirm')"
      :cancel-label="t('marketPriceCategoryList.cancel')"
      :confirm-label="t('marketPriceCategoryList.delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Pencil, Trash2, Plus, Shapes, Search } from "lucide-vue-next";
import { getMarketPriceCategories, deleteMarketPriceCategory } from "@/api/endpoints/market.price.api";
import MarketPriceCategoryFormDrawer from "@/components/market-prices/drawers/MarketPriceCategoryFormDrawer.vue";
import ProductDeleteDialog from "@/components/products/dialogs/ProductDeleteDialog.vue";

export default {
  name: "MarketPriceCategoryList",
  components: {
    Pencil,
    Trash2,
    Plus,
    Shapes,
    Search,
    MarketPriceCategoryFormDrawer,
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
      loadError: "",
      searchQuery: "",

      // Real server-side pagination + search for THIS screen only (BUG-169 follow-up).
      // The Vuex store's full-list cache (marketPriceCategories/marketPriceCategories)
      // is left untouched — it still backs dropdown/picker consumers elsewhere in the
      // app. `types` below still reads that store cache too, since the type-select in
      // the create/edit drawer needs the full type list, not this screen's own page.
      serverPage: 1,
      serverItemsPerPage: 10,
      serverTotal: 0,
      serverLoading: false,
      serverRawItems: [],
      searchDebounceTimer: null,

      categoryDialog: false,
      categoryMode: "create",
      selectedCategory: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: "",
      deleteActionLink: null,
      deleteTarget: null,
    };
  },
  computed: {
    categories() {
      return this.serverRawItems.map((c) => {
        const typeId = c?.typeId || c?.type?.id || c?.marketPriceTypeId;
        const typeName = c?.typeName || c?.type?.name || c?.marketPriceType?.name || '';
        return {
          ...c,
          id: c?.id || c?._id,
          typeId,
          typeName,
        };
      });
    },
    types() {
      return this.$store.getters['marketPriceTypes/marketPriceTypes']
    },
    tableHeaders() {
      return [
        { title: this.t('marketPriceCategoryList.colName'), key: "name" },
        { title: this.t('marketPriceCategoryList.colType'), key: "typeName" },
        { title: this.t('marketPriceCategoryList.colCreated'), key: "createdAt" },
        { title: this.t('marketPriceCategoryList.colActions'), key: "actions", sortable: false, align: "end", width: 120 },
      ];
    },
  },
  watch: {
    searchQuery() {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => this.reloadServerFirstPage(), 300);
    },
  },
  async mounted() {
    await Promise.all([
      this.loadServerPage(),
      this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes'),
    ]);
  },
  methods: {
    reloadServerFirstPage() {
      this.serverPage = 1;
      return this.loadServerPage();
    },
    async loadServerPage() {
      this.serverLoading = true;
      this.loadError = "";
      try {
        const res = await getMarketPriceCategories({
          page: this.serverPage,
          limit: this.serverItemsPerPage,
          search: this.searchQuery,
        });
        this.serverRawItems = res.data;
        this.serverTotal = res.meta?.total || 0;
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || this.t('marketPriceCategoryList.loadError');
        this.serverRawItems = [];
        this.serverTotal = 0;
      } finally {
        this.serverLoading = false;
      }
    },
    // Called by v-data-table on page/page-size change — guarded against the duplicate
    // emission v-data-table fires on mount (same idiom as MenuItemView.vue).
    onUpdateOptions(options) {
      const page = options?.page || 1;
      const itemsPerPage = options?.itemsPerPage || this.serverItemsPerPage;
      if (page === this.serverPage && itemsPerPage === this.serverItemsPerPage && this.serverRawItems.length) {
        return;
      }
      this.serverPage = page;
      this.serverItemsPerPage = itemsPerPage;
      this.loadServerPage();
    },
    // Handler for MarketPriceCategoryFormDrawer's @saved (fires for both create and
    // edit). Create jumps back to page 1 (alpha sort may place the new row anywhere);
    // edit just refreshes the current page since the edited row stays put.
    loadCategories() {
      return this.categoryMode === 'create' ? this.reloadServerFirstPage() : this.loadServerPage();
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
      await this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes');
      this.categoryDialog = true;
    },
    async openEditDialog(item) {
      const raw = item && item.raw ? item.raw : item;
      this.categoryMode = "edit";
      this.selectedCategory = raw;
      await this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes');
      this.categoryDialog = true;
    },

    openDeleteDialog(item) {
      const raw = item && item.raw ? item.raw : item;
      this.deleteError = "";
      this.deleteActionLink = null;
      this.deleteLoading = false;
      this.deleteTarget = raw;
      this.deleteDialog = true;
    },
    closeDeleteDialog() {
      this.deleteDialog = false;
      this.deleteLoading = false;
      this.deleteError = "";
      this.deleteActionLink = null;
      this.deleteTarget = null;
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = "";
      this.deleteActionLink = null;
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) {
          this.deleteError = this.t('marketPriceCategoryList.missingId');
          return;
        }
        await deleteMarketPriceCategory(id);
        await this.$store.dispatch('marketPriceCategories/removeMarketPriceCategory', id);
        await this.loadServerPage();
        this.closeDeleteDialog();
      } catch (e) {
        const data = e?.response?.data;
        if (data?.blockedBy === 'marketPrices' && data?.filterField && data?.filterValue) {
          this.deleteError = data.message || this.t('marketPriceCategoryList.deleteError');
          this.deleteActionLink = {
            label: `${this.t('marketPriceCategoryList.viewLinkedItems')} (${data.count ?? '?'})`,
            to: { path: '/menu-fb/market-prices', query: { [data.filterField]: data.filterValue } },
          };
          return;
        }
        const msg = String(data?.message || e?.message || '').toLowerCase();
        if (msg.includes('cannot delete global market price category')) {
          this.deleteError = this.t('marketPriceCategoryList.deleteBlockedUsed');
        } else {
          this.deleteError = data?.message || e?.message || this.t('marketPriceCategoryList.deleteError');
        }
      } finally {
        this.deleteLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.pcl-root {
  background: #f6f7fb;
  min-height: 100%;
}

/* ── Header + searchbar : bloc fixe unique (collés) ── */
.pcl-sticky-top {
  position: fixed;
  top: var(--v-layout-top, 64px);
  left: var(--v-layout-left, 0px);
  right: 0;
  z-index: 200;
}
.pcl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, .25);
}
.pcl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.pcl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pcl-header__title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
}
.pcl-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin: 3px 0 0;
}

/* add button */
.pcl-add-btn {
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
.pcl-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Searchbar (collée au header dans le bloc fixe) ── */
.pcl-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.pcl-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
  flex-wrap: wrap;
}
.pcl-searchbar__icon {
  color: #9ca3af;
  flex-shrink: 0;
}
.pcl-searchbar__input {
  flex: 1;
  min-width: 140px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
}
.pcl-searchbar__input::placeholder {
  color: #9ca3af;
}
.pcl-searchbar__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* ── Content ── */
.pcl-content {
  padding: 148px 28px 24px;
}

/* ── Table ── */
.pcl-table :deep(.v-data-table__td) {
  vertical-align: middle;
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
.pcl-table :deep(.v-data-table__th) {
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
.pcl--dark.pcl-root {
  background: #111827;
}
.pcl--dark .pcl-searchbar {
  background: #1a2332;
  border-bottom-color: #374151;
}
.pcl--dark .pcl-searchbar__input {
  color: #f9fafb;
}
.pcl--dark .pcl-table :deep(.v-data-table__th) {
  color: #9ca3af !important;
  background: #1a2332 !important;
}
</style>
