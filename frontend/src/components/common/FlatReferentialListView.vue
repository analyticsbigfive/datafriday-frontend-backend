<template>
  <div class="frlv-root" :class="{'frlv--dark': isDark}">

    <!-- ── Gradient sticky header ── -->
    <div class="frlv-header sticky-header">
      <div class="frlv-header__inner">
        <div class="frlv-header__left">
          <div class="frlv-header__icon">
            <component :is="icon" :size="22" color="white" />
          </div>
          <div>
            <h1 class="frlv-header__title">{{ t(`${i18nPrefix}.title`) }}</h1>
            <p class="frlv-header__subtitle">{{ t(`${i18nPrefix}.subtitle`) }}</p>
          </div>
        </div>
        <div class="frlv-header__right">
          <div class="frlv-header__actions">
            <button class="frlv-add-btn" @click="openCreateDrawer">
              <Plus :size="17" /> {{ t(addButtonKey) }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Sticky searchbar ── -->
    <div class="frlv-searchbar">
      <div class="frlv-searchbar__inner">
        <Search :size="17" class="frlv-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="frlv-searchbar__input"
          type="search"
          :placeholder="t(`${i18nPrefix}.searchPlaceholder`)"
        />
        <span class="frlv-searchbar__count">{{ searchCount }} {{ t(totalCountKey) }}</span>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="frlv-content">
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

      <v-card rounded="xl" elevation="0" class="frlv-table-card">
        <!-- BUG-171: pagination + recherche SERVEUR — remplace le v-data-table client-side qui
             téléchargeait la liste complète juste pour en afficher 10 lignes à la fois. -->
        <v-data-table
          :headers="tableHeaders"
          :items="serverRawItems"
          item-value="id"
          density="comfortable"
          :items-length="serverTotal"
          :items-per-page="serverItemsPerPage"
          @update:options="onUpdateOptions"
          class="frlv-table"
        >
          <template #item.createdAt="{ item }">
            {{ formatDate(item.createdAt) }}
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex justify-end" style="gap: 6px;">
              <v-btn variant="text" density="compact" size="small" icon @click.stop="openEditDrawer(item)">
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

    <FlatReferentialFormDrawer
      v-model="formDrawer"
      :mode="formMode"
      :initial-data="selectedItem"
      :is-dark="isDark"
      :i18n-prefix="i18nPrefix"
      :icon="icon"
      :store-module="storeModule"
      :add-action="addAction"
      :update-action="updateAction"
      :create-fn="createFn"
      :update-fn="updateFn"
      @saved="onSaved"
    />

    <FlatReferentialDeleteDialog
      v-model="deleteDialog"
      :item-name="deleteTarget?.name"
      :loading="deleteLoading"
      :error="deleteError"
      :is-dark="isDark"
      :i18n-prefix="i18nPrefix"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useI18n } from '@/i18n/useI18n';
import { Plus, Pencil, Trash2, Search } from 'lucide-vue-next';
import FlatReferentialFormDrawer from './FlatReferentialFormDrawer.vue';
import FlatReferentialDeleteDialog from './FlatReferentialDeleteDialog.vue';

// BUG-165: generic replacement for BrandNameListView / DisplayNameListView / IndustrialListView /
// PackingTypeListView, which were byte-for-byte identical apart from CSS class prefix, header
// icon, i18n namespace, Vuex module/action names and api client. Those 4 components now wrap this
// one.
//
// One real (not accidental) behavioral divergence found across the 4 originals is preserved via a
// prop rather than unified: PackingTypeListView.vue's searchbar count showed the *unfiltered* total
// (`packingTypes.length`) while the other 3 showed the filtered count — see `searchCountMode`.
//
// `loadErrorFallback` used to also carry a real divergence (Industrial/PackingType had a hardcoded
// English load-error string left over from BUG-166, while Brand/DisplayName went through
// `t('<prefix>.loadError')`) — closed as a BUG-165 follow-up: `industrialListLoadError`/
// `packingTypeListLoadError` now exist in en/fr, so all 4 screens go through `t()` uniformly. The
// prop itself is kept as a generic escape hatch (default `null`), just unused by all 4 today.
export default {
  name: 'FlatReferentialListView',
  components: { Plus, Pencil, Trash2, Search, FlatReferentialFormDrawer, FlatReferentialDeleteDialog },
  props: {
    // i18n key prefix for this entity's screen, e.g. 'brandNameList'.
    i18nPrefix: { type: String, required: true },
    // Header/drawer icon component, e.g. Tag / Factory / Box (lucide-vue-next).
    icon: { type: [Object, Function], required: true },
    // Vuex module namespace, e.g. 'brandNames'. Its list getter is assumed to be registered under
    // the same name as the namespace itself (true for all 4 flat referential modules today, e.g.
    // getters['brandNames/brandNames']).
    storeModule: { type: String, required: true },
    // Vuex action names within `storeModule`.
    fetchAction: { type: String, required: true },
    addAction: { type: String, required: true },
    updateAction: { type: String, required: true },
    removeAction: { type: String, required: true },
    // api/endpoints/*.api.js CRUD functions for this entity.
    createFn: { type: Function, required: true },
    updateFn: { type: Function, required: true },
    deleteFn: { type: Function, required: true },
    // BUG-171: paginated GET function for this entity (getBrandNames/getDisplayNames/
    // getIndustrials/getPackingTypes), accepting { page, limit, search }. Drives THIS screen's
    // v-data-table via real server-side pagination + search, separate from `fetchAction` above
    // (which still loops through every page to reconstitute the full list for dropdown/picker
    // consumers elsewhere in the app — untouched by this change).
    getFn: { type: Function, required: true },
    // Full dotted i18n keys for the two strings whose suffix isn't a fixed convention across the
    // 4 entities (e.g. 'brandNameList.addBrand', 'brandNameList.totalBrands').
    addButtonKey: { type: String, required: true },
    totalCountKey: { type: String, required: true },
    // Literal fallback string for the load-error message. When set, used verbatim instead of
    // `t('<i18nPrefix>.loadError')` — reproduces the still-hardcoded-English fallback on the
    // Industrial/PackingType screens (see class doc comment above).
    loadErrorFallback: { type: String, default: null },
    // 'filtered' (default, matches Brand/DisplayName/Industrial) or 'total' (matches PackingType).
    searchCountMode: { type: String, default: 'filtered' },
  },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },
  data() {
    return {
      loadError: '',
      searchQuery: '',
      searchDebounceTimer: null,

      // BUG-171: server-side pagination state for THIS screen's table — replaces the previous
      // "download the full store list, paginate/filter client-side" approach (wasteful once a
      // tenant has hundreds of rows). `serverItemsPerPage` defaults to 10 to match Vuetify's
      // default / what this screen showed before.
      serverPage: 1,
      serverItemsPerPage: 10,
      serverTotal: 0,
      serverLoading: false,
      serverRawItems: [],
      // Unfiltered grand total, only fetched/used when searchCountMode === 'total' (PackingType):
      // `serverTotal` reflects the current SEARCH-filtered count, which isn't what that mode wants.
      serverGrandTotal: 0,

      formDrawer: false,
      formMode: 'create',
      selectedItem: null,

      deleteDialog: false,
      deleteLoading: false,
      deleteError: '',
      deleteTarget: null,
    };
  },
  computed: {
    tableHeaders() {
      return [
        { title: this.t(`${this.i18nPrefix}.colName`), key: 'name' },
        { title: this.t(`${this.i18nPrefix}.colCreated`), key: 'createdAt' },
        { title: this.t(`${this.i18nPrefix}.colActions`), key: 'actions', sortable: false, align: 'end', width: 120 },
      ];
    },
    searchCount() {
      return this.searchCountMode === 'total' ? this.serverGrandTotal : this.serverTotal;
    },
  },
  watch: {
    // Debounced server-side search (300ms) — same pattern as MenuItemView.vue.
    searchQuery() {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => this.reloadServerFirstPage(), 300);
    },
  },
  mounted() {
    this.loadServerPage();
    if (this.searchCountMode === 'total') this.loadGrandTotal();
  },
  methods: {
    async loadServerPage() {
      this.serverLoading = true;
      this.loadError = '';
      try {
        const res = await this.getFn({
          page: this.serverPage,
          limit: this.serverItemsPerPage,
          search: this.searchQuery,
        });
        this.serverRawItems = res?.data || [];
        this.serverTotal = res?.meta?.total || 0;
      } catch (e) {
        this.serverRawItems = [];
        this.serverTotal = 0;
        this.loadError = e?.response?.data?.message || e?.message || this.loadErrorFallback || this.t(`${this.i18nPrefix}.loadError`);
      } finally {
        this.serverLoading = false;
      }
    },
    reloadServerFirstPage() {
      this.serverPage = 1;
      this.loadServerPage();
    },
    // Lightweight unfiltered-total fetch (limit=1, no search) for `searchCountMode: 'total'` —
    // avoids pulling the full list just to know its length.
    async loadGrandTotal() {
      try {
        const res = await this.getFn({ page: 1, limit: 1 });
        this.serverGrandTotal = res?.meta?.total || 0;
      } catch (e) {
        // non-blocking: le compteur "total" garde sa dernière valeur connue en cas d'erreur
      }
    },
    // v-data-table emits :update:options on mount too — guard against a duplicate initial
    // fetch (exact same guard as MenuItemView.vue's onUpdateOptions).
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
    formatDate(value) {
      if (!value) return '-';
      try { return new Date(value).toLocaleString(); } catch { return String(value); }
    },
    openCreateDrawer() {
      this.formMode = 'create';
      this.selectedItem = null;
      this.formDrawer = true;
    },
    openEditDrawer(item) {
      const raw = item?.raw ?? item;
      this.formMode = 'edit';
      this.selectedItem = raw;
      this.formDrawer = true;
    },
    openDeleteDialog(item) {
      const raw = item?.raw ?? item;
      this.deleteError = '';
      this.deleteLoading = false;
      this.deleteTarget = raw;
      this.deleteDialog = true;
    },
    // BUG-171: FlatReferentialFormDrawer already keeps the store's full-list cache in sync
    // itself (dispatches addAction/updateAction — ADD_ITEM/UPDATE_ITEM, no network call). This
    // used to ALSO force a full re-fetch of every server page (`fetchAction, {forceRefresh:
    // true}`) just so THIS screen's client-side-paginated table would pick up the change — that
    // full re-fetch is exactly the wasteful download this bug removes. Refresh only what this
    // screen displays instead: page 1 after a create (new row could sort anywhere, most likely
    // to want it visible), the current page after an edit (row stays put, only its name changes).
    onSaved() {
      if (this.formMode === 'create') {
        this.reloadServerFirstPage();
        if (this.searchCountMode === 'total') this.loadGrandTotal();
      } else {
        this.loadServerPage();
      }
    },
    async confirmDelete() {
      this.deleteLoading = true;
      this.deleteError = '';
      try {
        const id = this.deleteTarget?.id || this.deleteTarget?._id;
        if (!id) { this.deleteError = this.t(`${this.i18nPrefix}.missingId`); return; }
        await this.deleteFn(id);
        await this.$store.dispatch(`${this.storeModule}/${this.removeAction}`, id);
        this.deleteDialog = false;
        this.deleteTarget = null;
        this.loadServerPage();
        if (this.searchCountMode === 'total') this.loadGrandTotal();
      } catch (e) {
        this.deleteError = e?.response?.data?.message || e?.message || this.t(`${this.i18nPrefix}.deleteError`);
      } finally {
        this.deleteLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.frlv-root {
  width: 100%;
  min-height: 100%;
  background: #f6f7fb;
}

/* ── Header ── */
.sticky-header { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.frlv-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, .25);
}
.frlv-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.frlv-header__left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.frlv-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.frlv-header__title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  line-height: 1.2;
}
.frlv-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin: 3px 0 0;
}
.frlv-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.frlv-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.frlv-add-btn {
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
  white-space: nowrap;
}
.frlv-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Searchbar ── */
.frlv-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 81px;
  z-index: 99;
  flex-shrink: 0;
}
.frlv-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
}
.frlv-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.frlv-searchbar__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #111827;
}
.frlv-searchbar__input::placeholder { color: #9ca3af; }
.frlv-searchbar__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* ── Content ── */
.frlv-content {
  padding: 24px 28px;
}
.frlv-table-card {
  border: 1px solid #e5e7eb;
}

.frlv-table :deep(.v-data-table__td) {
  vertical-align: middle;
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
.frlv-table :deep(.v-data-table__th) {
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
.frlv--dark.frlv-root { background: #111827; }
.frlv--dark .frlv-searchbar { background: #1a2332; border-bottom-color: #374151; }
.frlv--dark .frlv-searchbar__input { color: #f9fafb; }
.frlv--dark .frlv-content { background: #111827; }
.frlv--dark .frlv-table-card { border-color: #374151; background: #1a2332; }
.frlv--dark .frlv-table :deep(.v-data-table__th) { color: #9ca3af !important; background: #1a2332 !important; }
.frlv--dark .frlv-table :deep(.v-data-table__td) { color: #e2e8f0; }
.frlv--dark .frlv-searchbar__count { color: #94a3b8; }
</style>
