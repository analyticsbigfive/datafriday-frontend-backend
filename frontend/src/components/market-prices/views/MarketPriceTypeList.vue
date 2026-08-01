<template>
  <div class="ptl-root" :class="{'ptl--dark': isDark}">
    <!-- Sticky gradient header -->
    <div class="ptl-header">
      <div class="ptl-header__inner">
        <div class="d-flex align-center gap-3">
          <div class="ptl-header__icon">
            <Tag :size="22" color="#fff" />
          </div>
          <div>
            <p class="ptl-header__title">{{ t('marketPriceTypeList.title') }}</p>
            <p class="ptl-header__subtitle">{{ t('marketPriceTypeList.subtitle') }}</p>
          </div>
        </div>

        <div class="d-flex align-center gap-3 flex-wrap">
          <button class="ptl-add-btn" @click="openCreateDialog">
            <Plus :size="16" />
            {{ t('marketPriceTypeList.addType') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Sticky searchbar -->
    <div class="ptl-searchbar">
      <div class="ptl-searchbar__inner">
        <Search :size="16" class="ptl-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="ptl-searchbar__input"
          :placeholder="t('marketPriceTypeList.searchPlaceholder')"
        />
        <span class="ptl-searchbar__count">{{ serverTotal }} {{ t('marketPriceTypeList.totalTypes') }}</span>
      </div>
    </div>

    <!-- Content -->
    <div class="ptl-content">
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

      <div v-if="bulkSelected.length" class="bulk-bar">
        <span class="bulk-bar__info">{{ bulkSelected.length }} {{ t('bulkSelected') }}</span>
        <div class="bulk-bar__actions">
          <button type="button" class="bulk-bar__clear" @click="bulkSelected = []">{{ t('bulkDeselect') }}</button>
          <button type="button" class="bulk-bar__del" @click="openBulkDelete"><Trash2 :size="15" /> {{ t('delete') }}</button>
        </div>
      </div>

      <div class="ptl-table-wrap">
        <!-- v-data-table-SERVER : `items-length` n'est une prop QUE de ce composant.
             Sur un `v-data-table` ordinaire elle est ignorée et la pagination se fait
             côté client sur `items.length` — soit la page serveur courante, d'où des
             pages 2+ inatteignables (BUG-246-01). -->
        <v-data-table-server
          v-model="bulkSelected"
          show-select
          :headers="tableHeaders"
          :items="types"
          :items-length="serverTotal"
          :page="serverPage"
          :items-per-page="serverItemsPerPage"
          @update:options="onUpdateOptions"
          item-value="id"
          density="compact"
          class="ptl-table"
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
                {{ item.categoryList.length }} {{ item.categoryList.length === 1 ? t('marketPriceTypeList.category') : t('marketPriceTypeList.categories') }}
              </v-chip>
            </div>
            <span v-else class="text-medium-emphasis text-caption">{{ t('marketPriceTypeList.noCategories') }}</span>
          </template>

          <template #item.createdAt="{ item }">
            {{ formatDate(item.createdAt) }}
          </template>

          <template #item.actions="{ item }">
            <div class="ptl-actions">
              <div class="ptl-abtn ptl-abtn--edit" @click.stop="openEditDialog(item)">
                <Pencil :size="15" />
              </div>
              <div class="ptl-abtn ptl-abtn--del" @click.stop="openDeleteDialog(item)">
                <Trash2 :size="15" />
              </div>
            </div>
          </template>
        </v-data-table-server>
      </div>
    </div>

    <MarketPriceTypeFormDrawer
      v-model="typeDialog"
      :mode="typeMode"
      :initial-data="selectedType"
      :is-dark="isDark"
      @saved="loadTypes"
    />

    <MarketPriceTypeCategoriesDrawer
      v-model="categoriesDialog"
      :market-price-type="selectedTypeForCategories"
      :is-dark="isDark"
    />

    <ProductDeleteDialog
      v-model="deleteDialog"
      :item-name="deleteTarget?.name"
      :loading="deleteLoading"
      :error="deleteError"
      :action-link="deleteActionLink"
      :is-dark="isDark"
      :title="t('marketPriceTypeList.deleteTitle')"
      :subtitle="t('marketPriceTypeList.deleteSubtitle')"
      :message="t('marketPriceTypeList.deleteConfirm')"
      :cancel-label="t('marketPriceTypeList.cancel')"
      :confirm-label="t('marketPriceTypeList.delete')"
      @confirm="confirmDelete"
    />

    <BulkDeleteDialog
      v-model="bulkOpen"
      :title="t('bulkDeleteTitle')"
      :message="`${t('bulkDeletePrefix')} ${bulkSelected.length} ${t('bulkItems')} ?`"
      :progress="bulkProgress" :total="bulkTotal" :progress-label="t('bulkDeleted')"
      :confirm-label="t('delete')" :cancel-label="t('cancel')" :deleting-label="t('bulkDeleting')"
      :loading="bulkLoading" :error="bulkError" :is-dark="isDark"
      @confirm="confirmBulkDelete"
    />
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Pencil, Trash2, Plus, Tag, Search } from "lucide-vue-next";
import { getMarketPriceTypes, deleteMarketPriceType } from "@/api/endpoints/market.price.api";
import MarketPriceTypeFormDrawer from "@/components/market-prices/drawers/MarketPriceTypeFormDrawer.vue";
import MarketPriceTypeCategoriesDrawer from "@/components/market-prices/drawers/MarketPriceTypeCategoriesDrawer.vue";
import ProductDeleteDialog from "@/components/products/dialogs/ProductDeleteDialog.vue";
import BulkDeleteDialog from "@/components/common/BulkDeleteDialog.vue";

export default {
  name: "MarketPriceTypeList",
  components: {
    Pencil,
    Trash2,
    Plus,
    Tag,
    Search,
    MarketPriceTypeFormDrawer,
    MarketPriceTypeCategoriesDrawer,
    ProductDeleteDialog,
    BulkDeleteDialog,
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
      // The Vuex store's full-list cache (marketPriceTypes/marketPriceTypes) is left
      // untouched — it still backs dropdown/picker consumers elsewhere in the app.
      serverPage: 1,
      serverItemsPerPage: 10,
      serverTotal: 0,
      serverLoading: false,
      serverRawItems: [],
      searchDebounceTimer: null,

      typeDialog: false,
      typeMode: "create",
      selectedType: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: "",
      deleteActionLink: null,
      deleteTarget: null,

      categoriesDialog: false,
      selectedTypeForCategories: null,

      bulkSelected: [],
      bulkOpen: false,
      bulkLoading: false,
      bulkError: "",
      bulkProgress: 0,
      bulkTotal: 0,
    };
  },
  computed: {
    types() {
      return this.serverRawItems.map((t) => ({
        ...t,
        id: t?.id || t?._id,
        categoryList: Array.isArray(t?.categories) ? t.categories : [],
      }))
    },
    // Tri désactivé sur toutes les colonnes : le backend ordonne TOUJOURS par
    // `name: 'asc'` et n'accepte aucun paramètre de tri. En pagination serveur un
    // en-tête cliquable ne trierait donc rien ; avant ce correctif il ne triait que
    // les lignes de la page courante — un tri qui ment sur son périmètre.
    tableHeaders() {
      return [
        { title: this.t('marketPriceTypeList.colName'), key: "name", sortable: false },
        { title: this.t('marketPriceTypeList.colCategories'), key: "categories", sortable: false, width: 300 },
        { title: this.t('marketPriceTypeList.colCreated'), key: "createdAt", sortable: false },
        { title: this.t('marketPriceTypeList.colActions'), key: "actions", sortable: false, align: "end", width: 120 },
      ];
    },
  },
  watch: {
    searchQuery() {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => this.reloadServerFirstPage(), 300);
    },
  },
  mounted() {
    this.loadServerPage();
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
        const res = await getMarketPriceTypes({
          page: this.serverPage,
          limit: this.serverItemsPerPage,
          search: this.searchQuery,
        });
        this.serverRawItems = res.data;
        this.serverTotal = res.meta?.total || 0;
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || this.t('marketPriceTypeList.loadError');
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
    // Handler for MarketPriceTypeFormDrawer's @saved (fires for both create and edit).
    // Create jumps back to page 1 (alpha sort may place the new row anywhere); edit
    // just refreshes the current page since the edited row stays put.
    loadTypes() {
      return this.typeMode === 'create' ? this.reloadServerFirstPage() : this.loadServerPage();
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

    openCategoriesDialog(type) {
      this.selectedTypeForCategories = type;
      this.categoriesDialog = true;
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = "";
      this.deleteActionLink = null;
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) {
          this.deleteError = this.t('marketPriceTypeList.missingId');
          return;
        }
        // Pré-vérification : le type a des catégories liées
        if (this.deleteTarget?.categoryList?.length > 0) {
          this.deleteError = this.t('marketPriceTypeList.deleteBlockedCategories');
          return;
        }
        await deleteMarketPriceType(id);
        await this.$store.dispatch('marketPriceTypes/removeMarketPriceType', id);
        await this.loadServerPage();
        this.closeDeleteDialog();
      } catch (e) {
        const data = e?.response?.data;
        if (data?.blockedBy === 'marketPrices' && data?.filterField && data?.filterValue) {
          this.deleteError = data.message || this.t('marketPriceTypeList.deleteError');
          this.deleteActionLink = {
            label: `${this.t('marketPriceTypeList.viewLinkedItems')} (${data.count ?? '?'})`,
            to: { path: '/menu-fb/market-prices', query: { [data.filterField]: data.filterValue } },
          };
          return;
        }
        const msg = String(data?.message || e?.message || '').toLowerCase();
        if (msg.includes('cannot delete global market price type') || msg.includes('categor')) {
          this.deleteError = this.t('marketPriceTypeList.deleteBlockedCategories');
        } else {
          this.deleteError = data?.message || e?.message || this.t('marketPriceTypeList.deleteError');
        }
      } finally {
        this.deleteLoading = false;
      }
    },
    openBulkDelete() { this.bulkError=''; this.bulkProgress=0; this.bulkTotal=0; this.bulkOpen=true; },
    async confirmBulkDelete() {
      const ids=[...this.bulkSelected]; if(!ids.length) return;
      this.bulkLoading=true; this.bulkError=''; this.bulkTotal=ids.length; this.bulkProgress=0;
      const failed=[];
      for (const id of ids){ try{ await deleteMarketPriceType(id); await this.$store.dispatch('marketPriceTypes/removeMarketPriceType', id); }catch(e){ failed.push(id); } this.bulkProgress+=1; }
      await this.loadServerPage();
      this.bulkLoading=false; this.bulkSelected=failed;
      if(failed.length) this.bulkError=`${failed.length} ${this.t('bulkItems')} ${this.t('bulkDeleteFailed')}`;
      else this.bulkOpen=false;
    },
  },
};
</script>

<style scoped>
.ptl-root {
  background: #f6f7fb;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Sticky gradient header ── */
.ptl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, .25);
  position: sticky;
  top: 0;
  z-index: 100;
  flex-shrink: 0;
}
.ptl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.ptl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ptl-header__title {
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
  color: #fff;
  margin: 0;
}
.ptl-header__subtitle {
  font-size: var(--fs-sm);
  color: rgba(255, 255, 255, .72);
  margin: 3px 0 0;
}

/* add button */
.ptl-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 18px;
  border-radius: 100px;
  border: 2px solid rgba(255, 255, 255, .85);
  background: transparent;
  color: #fff;
  font-size: var(--fs-base);
  font-weight: 700;
  cursor: pointer;
  transition: all .2s;
}
.ptl-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Sticky searchbar ── */
.ptl-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 81px;
  z-index: 99;
}
.ptl-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
  flex-wrap: wrap;
}
.ptl-searchbar__icon {
  color: #9ca3af;
  flex-shrink: 0;
}
.ptl-searchbar__input {
  flex: 1;
  min-width: 140px;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--fs-md);
  color: #111827;
}
.ptl-searchbar__input::placeholder {
  color: #9ca3af;
}
.ptl-searchbar__count {
  font-size: var(--fs-sm);
  color: #9ca3af;
  white-space: nowrap;
}

/* ── Content ── */
.ptl-content {
  padding: 24px 28px;
}

/* ── Bulk bar ── */
.bulk-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 16px; margin-bottom:12px; background:#fff5f5; border:1px solid #fecaca; border-radius:12px; }
.bulk-bar__info { font-size:var(--fs-base); font-weight:700; color:#ff3131; }
.bulk-bar__actions { display:flex; align-items:center; gap:8px; }
.bulk-bar__clear { background:none; border:none; color:#6b7280; font-size:var(--fs-sm); font-weight:600; cursor:pointer; padding:6px 10px; border-radius:8px; }
.bulk-bar__clear:hover { background:rgba(0,0,0,.05); color:#374151; }
.bulk-bar__del { display:inline-flex; align-items:center; gap:6px; background:#ff3131; color:#fff; border:none; border-radius:100px; padding:7px 16px; font-size:var(--fs-sm); font-weight:700; cursor:pointer; }
.bulk-bar__del:hover { box-shadow:0 4px 14px rgba(255,49,49,.35); transform:translateY(-1px); }
.ptl--dark .bulk-bar { background:rgba(255,49,49,.1); border-color:rgba(255,49,49,.3); }
.ptl--dark .bulk-bar__clear { color:#94a3b8; }
.ptl--dark .bulk-bar__clear:hover { background:rgba(255,255,255,.06); color:#e2e8f0; }

/* ── Table wrap ── */
.ptl-table-wrap {
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}
.ptl--dark .ptl-table-wrap {
  background: #1e293b;
  border-color: rgba(255, 255, 255, .08);
}

/* ── Table (reference: MarketPriceListView) ── */
.ptl-table :deep(.v-data-table__th),
.ptl-table :deep(.v-data-table__td) {
  font-size: var(--fs-base);
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 16px;
  padding-right: 16px;
}
.ptl-table :deep(.v-data-table__td) { vertical-align: middle; }
.ptl-table :deep(.v-data-table__th) {
  font-size: var(--fs-xs)!important;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #9ca3af !important;
  background: #fafafa !important;
}
.ptl-table :deep(tbody tr:hover td) { background: #fafafa !important; }
.ptl--dark .ptl-table :deep(.v-data-table__th) { background: #1a2332 !important; }
.ptl--dark .ptl-table :deep(tbody tr:hover td) { background: #1a2332 !important; }

/* ── Table action buttons ── */
.ptl-actions { display: flex; gap: 4px; justify-content: flex-end; }
.ptl-abtn {
  width: 28px; height: 28px;
  border-radius: 8px;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0;
}
.ptl-abtn--edit { background: #eff6ff; color: #2563eb; }
.ptl-abtn--edit:hover { background: #dbeafe; }
.ptl-abtn--del { background: #fef2f2; color: #ff3131; }
.ptl-abtn--del:hover { background: #fee2e2; }

/* ── Dark mode ── */
.ptl--dark.ptl-root {
  background: #111827;
}
.ptl--dark .ptl-searchbar {
  background: #1a2332;
  border-bottom-color: #374151;
}
.ptl--dark .ptl-searchbar__input {
  color: #f9fafb;
}
.ptl--dark .ptl-searchbar__count { color: #94a3b8; }
.ptl--dark .ptl-table :deep(.v-data-table__td) { color: #e2e8f0; }
.ptl--dark .ptl-abtn { background: #1f2937; color: #cbd5e1; }
.ptl--dark .ptl-abtn--edit { background: rgba(37, 99, 235, .15); color: #93c5fd; }
.ptl--dark .ptl-abtn--del { background: rgba(255, 49, 49, .14); color: #fca5a5; }
</style>
