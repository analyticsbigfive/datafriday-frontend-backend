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
        <span class="ccl-searchbar__count">{{ serverTotal }} {{ t('componentCategoryList.totalCategories') }}</span>
      </div>
    </div>
    </div><!-- /ccl-sticky-top -->

    <!-- Content -->
    <div class="ccl-content">
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

      <div class="ccl-table-wrap">
        <!-- v-data-table-SERVER : `items-length` n'est une prop QUE de ce composant.
             Sur un `v-data-table` ordinaire elle est ignorée et la pagination se fait
             côté client sur `items.length` — soit la page serveur courante, d'où des
             pages 2+ inatteignables (BUG-246-01). -->
        <v-data-table-server
          :headers="tableHeaders"
          :items="serverRows"
          :items-length="serverTotal"
          :page="serverPage"
          :items-per-page="serverItemsPerPage"
          item-value="id"
          density="compact"
          class="ccl-table"
          @update:options="onUpdateOptions"
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
            <div class="ccl-actions">
              <div class="ccl-abtn ccl-abtn--edit" @click.stop="openEditDialog(item)">
                <Pencil :size="15" />
              </div>
              <div class="ccl-abtn ccl-abtn--del" @click.stop="openDeleteDialog(item)">
                <Trash2 :size="15" />
              </div>
            </div>
          </template>
        </v-data-table-server>
      </div>
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
      :action-link="deleteActionLink"
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
import { getComponentCategories, deleteComponentCategory } from "@/api/endpoints/menu.api";
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
      serverLoading: false,
      loadError: "",
      searchQuery: "",

      // BUG-170 : pagination + recherche RÉELLES côté serveur pour cet écran (contrairement
      // au store componentCategories.js, qui reste utilisé tel quel par les autres
      // consommateurs — dropdowns/pickers — et boucle sur les pages pour reconstituer la
      // liste complète). `types` reste alimenté par le store componentTypes (dropdown du
      // formulaire de création/édition), inchangé.
      serverPage: 1,
      serverItemsPerPage: 10,
      serverTotal: 0,
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
    // Page courante uniquement (pas le catalogue complet). Le backend inclut déjà
    // `type: true` (getCategories) donc `typeName` est dérivable directement de la ligne,
    // sans dépendre du store componentCategories (dont le cross-référencement avec le
    // store componentTypes n'est utile qu'à la reconstitution de la liste complète).
    serverRows() {
      return this.serverRawItems.map((c) => ({
        ...c,
        id: c?.id || c?._id,
        typeId: c?.typeId || c?.type?.id || c?.componentTypeId,
        typeName: c?.typeName || c?.type?.name || c?.componentType?.name || '',
      }))
    },
    types() {
      return this.$store.getters['componentTypes/componentTypes']
    },
    // Tri désactivé sur toutes les colonnes : le backend ordonne TOUJOURS par
    // `name: 'asc'` et n'accepte aucun paramètre de tri. En pagination serveur un
    // en-tête cliquable ne trierait donc rien ; avant ce correctif il ne triait que
    // les lignes de la page courante — un tri qui ment sur son périmètre.
    tableHeaders() {
      return [
        { title: this.t('componentCategoryList.colName'), key: "name", sortable: false },
        { title: this.t('componentCategoryList.colType'), key: "typeName", sortable: false },
        { title: this.t('componentCategoryList.colCreated'), key: "createdAt", sortable: false },
        { title: this.t('componentCategoryList.colActions'), key: "actions", sortable: false, align: "end", width: 120 },
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
      this.$store.dispatch('componentTypes/fetchComponentTypes'),
    ]);
  },
  methods: {
    async loadServerPage() {
      this.serverLoading = true;
      this.loadError = "";
      try {
        const res = await getComponentCategories({
          page: this.serverPage,
          limit: this.serverItemsPerPage,
          search: this.searchQuery,
        });
        this.serverRawItems = res?.data || [];
        this.serverTotal = res?.meta?.total || 0;
      } catch (e) {
        this.loadError = e?.response?.data?.message || e?.message || this.t('componentCategoryList.loadError');
        this.serverRawItems = [];
        this.serverTotal = 0;
      } finally {
        this.serverLoading = false;
      }
    },
    reloadServerFirstPage() {
      this.serverPage = 1;
      this.loadServerPage();
    },
    // Appelé par v-data-table à chaque changement de page/taille de page.
    onUpdateOptions(options) {
      const page = options?.page || 1;
      const itemsPerPage = options?.itemsPerPage || this.serverItemsPerPage;
      if (page === this.serverPage && itemsPerPage === this.serverItemsPerPage && this.serverRawItems.length) {
        return; // évite un fetch en double sur l'émission initiale de v-data-table au montage
      }
      this.serverPage = page;
      this.serverItemsPerPage = itemsPerPage;
      this.loadServerPage();
    },
    // Déclenché par @saved du drawer de création/édition (celui-ci a déjà fait l'appel API
    // et le dispatch Vuex addComponentCategory/updateComponentCategory — on ne fait ici que
    // rafraîchir la page affichée par CET écran depuis le serveur).
    loadCategories() {
      if (this.categoryMode === 'create') {
        this.reloadServerFirstPage();
      } else {
        this.loadServerPage();
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
          this.deleteError = this.t('componentCategoryList.missingId');
          return;
        }
        await deleteComponentCategory(id);
        await this.$store.dispatch('componentCategories/removeComponentCategory', id);
        this.closeDeleteDialog();
        this.loadServerPage();
      } catch (e) {
        const data = e?.response?.data;
        if (data?.blockedBy === 'menuComponents' && data?.filterField && data?.filterValue) {
          this.deleteError = data.message || this.t('componentCategoryList.deleteError');
          this.deleteActionLink = {
            label: `${this.t('componentCategoryList.viewLinkedItems')} (${data.count ?? '?'})`,
            to: { path: '/components', query: { [data.filterField]: data.filterValue } },
          };
          return;
        }
        const msg = String(data?.message || e?.message || '').toLowerCase();
        if (msg.includes('cannot delete global component category')) {
          this.deleteError = this.t('componentCategoryList.deleteBlockedUsed');
        } else {
          this.deleteError = data?.message || e?.message || this.t('componentCategoryList.deleteError');
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

/* ── Table wrap ── */
.ccl-table-wrap {
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}
.ccl--dark .ccl-table-wrap {
  background: #1e293b;
  border-color: rgba(255,255,255,.08);
}

/* ── Table ── */
.ccl-table :deep(.v-data-table__th),
.ccl-table :deep(.v-data-table__td) {
  font-size: var(--fs-base);
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 16px;
  padding-right: 16px;
}
.ccl-table :deep(.v-data-table__td) { vertical-align: middle; }
.ccl-table :deep(.v-data-table__th) {
  font-size: var(--fs-xs) !important;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #9ca3af !important;
  background: #fafafa !important;
}
.ccl-table :deep(tbody tr:hover td) { background: #fafafa !important; }

/* ── Table action buttons ── */
.ccl-actions { display: flex; gap: 4px; justify-content: flex-end; }
.ccl-abtn {
  width: 28px; height: 28px;
  border-radius: 8px;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0;
}
.ccl-abtn--edit { background: #eff6ff; color: #2563eb; }
.ccl-abtn--edit:hover { background: #dbeafe; }
.ccl-abtn--del { background: #fef2f2; color: #ff3131; }
.ccl-abtn--del:hover { background: #fee2e2; }

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
.ccl--dark .ccl-table :deep(.v-data-table__th) { background: #1a2332 !important; }
.ccl--dark .ccl-table :deep(tbody tr:hover td) { background: #1a2332 !important; }
.ccl--dark .ccl-table :deep(.v-data-table__td) { color: #e2e8f0; }
.ccl--dark .ccl-abtn { background: #1f2937; color: #cbd5e1; }
.ccl--dark .ccl-abtn--edit { background: rgba(37,99,235,.15); color: #93c5fd; }
.ccl--dark .ccl-abtn--del { background: rgba(255,49,49,.14); color: #fca5a5; }
</style>
