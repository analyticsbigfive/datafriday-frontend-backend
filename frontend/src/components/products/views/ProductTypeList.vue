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
            <p class="ptl-header__title">{{ t('productTypeList.title') }}</p>
            <p class="ptl-header__subtitle">{{ t('productTypeList.subtitle') }}</p>
          </div>
        </div>

        <div class="d-flex align-center gap-3 flex-wrap">
          <button class="ptl-add-btn" @click="openCreateDialog">
            <Plus :size="16" />
            {{ t('productTypeList.addType') }}
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
          :placeholder="t('productTypeList.searchPlaceholder')"
        />
        <span class="ptl-searchbar__count">{{ serverTotal }} {{ t('productTypeList.totalTypes') }}</span>
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

      <v-card rounded="xl" elevation="0" style="border: 1px solid #e5e7eb; overflow: hidden;">
        <v-data-table
          :headers="tableHeaders"
          :items="serverRows"
          item-value="id"
          density="comfortable"
          :items-length="serverTotal"
          :items-per-page="serverItemsPerPage"
          @update:options="onUpdateOptions"
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
                {{ item.categoryList.length }} {{ item.categoryList.length === 1 ? t('productTypeList.category') : t('productTypeList.categories') }}
              </v-chip>
            </div>
            <span v-else class="text-medium-emphasis text-caption">{{ t('productTypeList.noCategories') }}</span>
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

    <ProductTypeFormDrawer
      v-model="typeDialog"
      :mode="typeMode"
      :initial-data="selectedType"
      :is-dark="isDark"
      @saved="onTypeSaved"
    />

    <ProductTypeCategoriesDrawer
      v-model="categoriesDialog"
      :product-type="selectedTypeForCategories"
      :is-dark="isDark"
    />

    <ProductDeleteDialog
      v-model="deleteDialog"
      :item-name="deleteTarget?.name"
      :loading="deleteLoading"
      :error="deleteError"
      :action-link="deleteActionLink"
      :is-dark="isDark"
      :title="t('productTypeList.deleteTitle')"
      :subtitle="t('productTypeList.deleteSubtitle')"
      :message="t('productTypeList.deleteConfirm')"
      :cancel-label="t('productTypeList.cancel')"
      :confirm-label="t('productTypeList.delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { Pencil, Trash2, Plus, Tag, Search } from "lucide-vue-next";
import { deleteProductType, getProductType } from "@/api/endpoints/product.api";
import ProductTypeFormDrawer from "@/components/products/drawers/ProductTypeFormDrawer.vue";
import ProductTypeCategoriesDrawer from "@/components/products/drawers/ProductTypeCategoriesDrawer.vue";
import ProductDeleteDialog from "@/components/products/dialogs/ProductDeleteDialog.vue";

export default {
  name: "ProductTypeList",
  components: {
    Pencil,
    Trash2,
    Plus,
    Tag,
    Search,
    ProductTypeFormDrawer,
    ProductTypeCategoriesDrawer,
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

      // BUG-170 : pagination + recherche REELLES côté serveur pour cet écran (au lieu de
      // télécharger la liste complète du store pour ne montrer que 10 lignes côté client) —
      // même pattern que MenuItemView.vue (serverPage/serverItemsPerPage/serverTotal/
      // serverLoading/serverRawItems + loadServerPage/reloadServerFirstPage/onUpdateOptions).
      // Le store `productTypes` (liste complète en mémoire) reste utilisé ailleurs (dropdowns,
      // wizards CSV, etc.) et n'est pas touché ici.
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
    };
  },
  computed: {
    // Lignes de la page serveur courante, déjà filtrées par le backend (search).
    // Le backend inclut `categories` (getProductTypes: include: { categories }) donc le chip
    // "N catégories" / ProductTypeCategoriesDrawer continuent de fonctionner à l'identique.
    serverRows() {
      return this.serverRawItems.map((t) => ({
        ...t,
        id: t?.id || t?._id,
        categoryList: Array.isArray(t?.categories) ? t.categories : [],
      }));
    },
    tableHeaders() {
      return [
        { title: this.t('productTypeList.colName'), key: "name" },
        { title: this.t('productTypeList.colCategories'), key: "categories", sortable: false, width: 300 },
        { title: this.t('productTypeList.colCreated'), key: "createdAt" },
        { title: this.t('productTypeList.colActions'), key: "actions", sortable: false, align: "end", width: 120 },
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
      this.loadServerPage();
    },
    async loadServerPage() {
      this.serverLoading = true;
      this.loadError = "";
      try {
        const res = await getProductType({
          page: this.serverPage,
          limit: this.serverItemsPerPage,
          search: this.searchQuery,
        });
        this.serverRawItems = Array.isArray(res?.data) ? res.data : [];
        this.serverTotal = res?.meta?.total || 0;
      } catch (e) {
        console.error('[ProductTypeList] loadServerPage error:', e);
        this.loadError = e?.response?.data?.message || e?.message || this.t('productTypeList.loadError');
        this.serverRawItems = [];
        this.serverTotal = 0;
      } finally {
        this.serverLoading = false;
      }
    },
    // Cf. MenuItemView.vue : ignore l'émission initiale en double de v-data-table au montage.
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
    // Appelé par ProductTypeFormDrawer après un create/edit réussi. La drawer dispatch déjà
    // productTypes/addProductType ou updateProductType (garde le cache store à jour pour les
    // autres consommateurs) — ici on rafraîchit uniquement ce que CET écran affiche.
    onTypeSaved() {
      if (this.typeMode === 'create') {
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
          this.deleteError = this.t('productTypeList.missingId');
          return;
        }
        // Pré-vérification : le type a des catégories liées
        if (this.deleteTarget?.categoryList?.length > 0) {
          this.deleteError = this.t('productTypeList.deleteBlockedCategories');
          return;
        }
        await deleteProductType(id);
        await this.$store.dispatch('productTypes/removeProductType', id);
        this.closeDeleteDialog();
        this.loadServerPage();
      } catch (e) {
        // BUG-79 fournit un payload structuré (blockedBy/filterField/filterValue) quand le blocage
        // vient de MenuItem dépendants — on l'utilise pour proposer un lien direct vers la liste déjà
        // filtrée, plutôt que de laisser l'utilisateur chercher la bonne ligne parmi potentiellement
        // des milliers de Menu Items.
        const data = e?.response?.data;
        if (data?.blockedBy === 'menuItems' && data?.filterField && data?.filterValue) {
          this.deleteError = data.message || this.t('productTypeList.deleteError');
          this.deleteActionLink = {
            label: `${this.t('productTypeList.viewLinkedItems')} (${data.count ?? '?'})`,
            to: { path: '/menu-fb/menu-items', query: { [data.filterField]: data.filterValue } },
          };
          return;
        }
        const msg = String(data?.message || e?.message || '').toLowerCase();
        if (msg.includes('cannot delete global product type') || msg.includes('categor')) {
          this.deleteError = this.t('productTypeList.deleteBlockedCategories');
        } else {
          this.deleteError = data?.message || e?.message || this.t('productTypeList.deleteError');
        }
      } finally {
        this.deleteLoading = false;
      }
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
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
}
.ptl-header__subtitle {
  font-size: 12.5px;
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
  font-size: 13px;
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
  font-size: 14px;
  color: #111827;
}
.ptl-searchbar__input::placeholder {
  color: #9ca3af;
}
.ptl-searchbar__count {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}

/* ── Content ── */
.ptl-content {
  padding: 24px 28px;
}

/* ── Table ── */
.ptl-table :deep(.v-data-table__td) {
  vertical-align: middle;
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
.ptl-table :deep(.v-data-table__th) {
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
.ptl--dark .ptl-table :deep(.v-data-table__th) {
  color: #9ca3af !important;
  background: #1a2332 !important;
}
/* Retire la bordure blanche (inline #e5e7eb) de la carte du tableau en dark. */
.ptl--dark .ptl-content :deep(.v-card) { border-color: transparent !important; }
</style>
