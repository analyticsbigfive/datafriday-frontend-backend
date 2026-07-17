<template>
  <div id="menu-items-library-page" :class="{ 'mil--dark': isDark }">

    <!-- ── Gradient Header ── -->
    <div class="mil-header">
      <div class="mil-header__inner">
        <div class="mil-header__left">
          <div class="mil-header__icon">
            <UtensilsCrossed :size="22" color="white" />
          </div>
          <div>
            <h1 class="mil-header__title">{{ t("menuItemLib.title") }}</h1>
            <p class="mil-header__subtitle">{{ t("menuItemLib.subtitle") }}</p>
          </div>
        </div>
        <div class="mil-header__right">
          <div class="mil-view-toggle">
            <button class="mil-view-btn" :class="{ 'mil-view-btn--active': viewMode === 'table' }" @click="viewMode = 'table'">
              <LayoutList :size="15" />
            </button>
            <button class="mil-view-btn" :class="{ 'mil-view-btn--active': viewMode === 'grid' }" @click="viewMode = 'grid'">
              <LayoutGrid :size="15" />
            </button>
          </div>
          <button
            v-if="viewMode === 'table'"
            class="mil-action-hbtn"
            :class="{ 'mil-view-btn--active': groupByEnabled }"
            @click="groupByEnabled = !groupByEnabled"
            :title="t('menuItemLib.groupByToggle')"
          >
            {{ t('menuItemLib.groupByToggle') }}
          </button>
          <div class="mil-header__sep"></div>
          <div class="mil-header__actions">
            <button class="mil-action-hbtn" @click="onExportCsv" :disabled="exportLoading">
              <Download :size="15" /> {{ t("menuItemLib.exportCsv") }}
            </button>
            <button class="mil-action-hbtn" @click="importDrawer = true">
              <Upload :size="15" /> {{ t('menuItemLib.importCsv') }}
            </button>
            <button class="mil-action-hbtn" @click="onRefreshCosts" :disabled="refreshing">
              <RefreshCw :size="15" /> {{ t("menuItemLib.refreshCosts") }}
            </button>
            <button class="mil-add-btn" @click="onAddMenuItem">
              <Plus :size="17" /> {{ t("menuItemLib.addMenuItem") }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Filter bar ── -->
    <div class="mil-filterbar">
      <div class="mil-filterbar__row1">
        <div class="mil-filterbar__search-wrap">
          <Search :size="17" class="mil-filterbar__search-icon" />
          <input v-model="searchQuery" class="mil-filterbar__search-input" type="search" :placeholder="t('menuItemLib.searchPlaceholder')" />
        </div>
        <div class="mil-filterbar__selects">
          <v-select
            v-model="spaceFilter"
            :items="spaceOptions"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
            :menu-props="{ contentClass: 'mil-filter-menu' }"
            class="mil-filter-sel"
          />

          <v-select
            v-model="typeFilter"
            :items="typeOptions"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
            :menu-props="{ contentClass: 'mil-filter-menu' }"
            class="mil-filter-sel"
          />

          <v-select
            v-model="categoryFilter"
            :items="categoryOptions"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
            :menu-props="{ contentClass: 'mil-filter-menu' }"
            class="mil-filter-sel"
          />

          <v-select
            v-model="readyFilter"
            :items="readyOptions"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
            :menu-props="{ contentClass: 'mil-filter-menu' }"
            class="mil-filter-sel"
          />
        </div>
        <span class="mil-filterbar__count">
          {{ tableTotalCount }} {{ tableTotalCount === 1 ? t('menuItemLib.menuItem') : t('menuItemLib.menuItems') }}
        </span>
      </div>

      <!-- Active filter chips -->
      <div v-if="spaceFilter !== 'All Spaces' || typeFilter !== 'All Types' || categoryFilter !== 'All Categories' || readyFilter !== 'All'" class="mil-filterbar__chips">
        <span v-if="spaceFilter !== 'All Spaces'" class="mil-chip mil-chip--blue">
          {{ (spaceOptions.find(o => o.value === spaceFilter) || {}).title || spaceFilter }}
          <button class="mil-chip__x" @click="spaceFilter = 'All Spaces'"><X :size="10" /></button>
        </span>
        <span v-if="typeFilter !== 'All Types'" class="mil-chip mil-chip--purple">
          {{ typeFilter }}
          <button class="mil-chip__x" @click="typeFilter = 'All Types'"><X :size="10" /></button>
        </span>
        <span v-if="categoryFilter !== 'All Categories'" class="mil-chip mil-chip--orange">
          {{ categoryFilter }}
          <button class="mil-chip__x" @click="categoryFilter = 'All Categories'"><X :size="10" /></button>
        </span>
        <span v-if="readyFilter !== 'All'" class="mil-chip mil-chip--green">
          {{ readyFilter }}
          <button class="mil-chip__x" @click="readyFilter = 'All'"><X :size="10" /></button>
        </span>
        <button class="mil-chip-clear" @click="resetFilters">{{ t('menuItemLib.clearFilters') }}</button>
      </div>
    </div>

    <!-- ── Bulk selection bar ── -->
    <div v-if="selectedItems.length > 0" class="mil-bulk-bar" :class="{ 'mil-bulk-bar--dark': isDark }">
      <div class="mil-bulk-bar__left">
        <span class="mil-bulk-badge">{{ selectedItems.length }}</span>
        <span class="mil-bulk-text">{{ selectedItems.length > 1 ? t('menuItemLib.itemsSelected') : t('menuItemLib.itemSelected') }}</span>
      </div>
      <div class="mil-bulk-bar__right">
        <button class="mil-bulk-cancel" @click="selectedItems = []">{{ t('menuItemLib.deselect') }}</button>
        <button class="mil-bulk-delete" @click="onBulkDelete">
          <Trash2 :size="14" /> {{ t('menuItemLib.deleteSelectedBtn') }} ({{ selectedItems.length }})
        </button>
      </div>
    </div>

    <v-container fluid class="px-6 pt-4 pb-6 mil-scroll-area">
      <!-- Table View -->
      <v-card v-if="viewMode === 'table'" rounded="xl" class="data-table-card overflow-hidden" elevation="0">
        <v-data-table
          :headers="tableHeaders"
          :items="tableItems"
          item-value="id"
          density="compact"
          :group-by="groupByColumns"
          fixed-header
          :items-per-page="needsFullCatalog ? -1 : serverItemsPerPage"
          :items-length="needsFullCatalog ? undefined : serverTotal"
          :hide-default-footer="needsFullCatalog"
          :loading="isTableLoading ? 'primary' : false"
          @update:options="onUpdateOptions"
          class="menu-items-table"
        >
          <template #header.select>
            <v-checkbox-btn
              :model-value="selectedItems.length > 0 && selectedItems.length === tableItems.length"
              :indeterminate="selectedItems.length > 0 && selectedItems.length < tableItems.length"
              density="compact"
              @update:model-value="toggleSelectAll"
            />
          </template>

          <template #item.select="{ item }">
            <v-checkbox-btn
              :model-value="selectedItems.includes(item.id)"
              density="compact"
              @update:model-value="toggleSelection(item.id)"
              @click.stop
            />
          </template>

          <template #no-data>
            <div class="pa-16 text-center">
              <div class="mb-4">
                <ImageOff :size="64" class="text-medium-emphasis" />
              </div>
              <div class="text-h6 font-weight-bold mb-2">{{ t('menuItemLib.noDataFound') }}</div>
              <div class="text-body-2 text-medium-emphasis">
                {{ t('menuItemLib.noDataSubtitle') }}
              </div>
            </div>
          </template>

          <template #group-header="{ item, columns, toggleGroup, isGroupOpen }">
            <tr class="group-header-row" :class="item.depth === 1 ? 'group-level-2' : 'group-level-1'">
              <td :colspan="columns.length" class="group-header-cell">
                <div class="d-flex align-center justify-space-between" :style="{ paddingLeft: item.depth === 1 ? '48px' : '0' }">
                  <div class="d-flex align-center" style="gap: 8px">
                    <v-btn variant="text" density="compact" icon @click="toggleGroup(item)" class="group-toggle-btn">
                      <ChevronDown v-if="isGroupOpen(item)" :size="16" />
                      <ChevronRight v-else :size="16" />
                    </v-btn>
                    <div class="text-body-2 font-weight-bold">{{ item.value }}</div>
                    <v-chip size="x-small" color="primary" variant="tonal">
                      {{ item.items?.length || 0 }} items
                    </v-chip>
                  </div>

                  <div class="d-flex align-center" style="gap: 12px">
                    <div class="group-stat">
                      <div class="text-caption text-medium-emphasis">{{ t('menuItemLib.totalCost') }}</div>
                      <div class="text-subtitle-2 font-weight-bold">{{ formatCurrency(groupTotals(item.items).totalCost) }}</div>
                    </div>
                    <v-divider vertical />
                    <div class="group-stat">
                      <div class="text-caption text-medium-emphasis">{{ t('menuItemLib.totalPrice') }}</div>
                      <div class="text-subtitle-2 font-weight-bold">{{ formatCurrency(groupTotals(item.items).totalPrice) }}</div>
                    </div>
                    <v-divider vertical />
                    <div class="group-stat">
                      <div class="text-caption text-medium-emphasis">{{ t('menuItemLib.avgMargin') }}</div>
                      <v-chip size="small" :color="groupTotals(item.items).avgMargin >= 60 ? 'success' : 'error'" variant="flat">
                        {{ `${groupTotals(item.items).avgMargin.toFixed(1)}%` }}
                      </v-chip>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>

          <template #item.picture="{ item }">
            <v-avatar size="32" rounded="lg" class="item-avatar">
              <v-img v-if="item.picture || item._raw?.picture" :src="item.picture || item._raw?.picture" cover />
              <ImageOff v-else :size="20" class="text-medium-emphasis" />
            </v-avatar>
          </template>

          <template #item.readyForSale="{ item }">
            <v-chip size="small" :color="item.readyForSale === 'Yes' ? 'success' : 'grey'" variant="flat" rounded="lg">
              {{ item.readyForSale }}
            </v-chip>
          </template>

          <template #item.comboItem="{ item }">
            <v-chip size="small" :color="item.comboItem === 'Yes' ? 'success' : 'grey'" variant="flat" rounded="lg">
              {{ item.comboItem }}
            </v-chip>
          </template>

          <template #item.spaceCount="{ item }">
            <v-chip v-if="item.spaceCount > 0" size="small" variant="tonal" color="primary" rounded="lg">
              {{ item.spaceCount }} {{ item.spaceCount > 1 ? 'espaces' : 'espace' }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </template>

          <template #item.price="{ item }">
            {{ formatCurrency(item.price) }}
          </template>

          <template #item.priceHt="{ item }">
            <span v-if="item.priceHt != null">{{ formatCurrency(item.priceHt) }}</span>
            <span v-else class="text-medium-emphasis">—</span>
          </template>

          <template #item.totalCost="{ item }">
            {{ formatCurrency(item.totalCost) }}
          </template>

          <template #item.margin="{ item }">
            <v-chip
              size="small"
              :color="Number(item.margin) >= 60 ? 'success' : 'error'"
              variant="flat"
              rounded="lg"
              class="font-weight-bold"
            >
              {{ `${Number(item.margin).toFixed(1)}%` }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex justify-end" style="gap: 8px">
              <v-btn icon variant="tonal" size="small" @click="onEditItem(item)" class="action-btn">
                <Pencil :size="18" />
              </v-btn>
              <v-btn icon variant="tonal" size="small" color="error" @click="onDeleteItem(item)" class="action-btn">
                <Trash2 :size="18" />
              </v-btn>
            </div>
          </template>
        </v-data-table>
      </v-card>

      <!-- Grid View -->
      <div v-if="viewMode === 'grid'">
        <v-row v-if="filteredItems.length > 0">
          <v-col v-for="item in filteredItems" :key="item.id" cols="12" sm="6" md="4" lg="3">
            <v-card rounded="xl" elevation="0" hover class="menu-item-card h-100">
              <div class="pa-4">
                <!-- Image -->
                <div class="mb-3">
                  <v-img
                    v-if="item.picture || item._raw?.picture"
                    :src="item.picture || item._raw?.picture"
                    height="140"
                    cover
                    rounded="lg"
                    class="menu-item-image"
                  >
                    <template #placeholder>
                      <div class="d-flex align-center justify-center fill-height">
                        <v-progress-circular indeterminate color="grey-lighten-2"></v-progress-circular>
                      </div>
                    </template>
                  </v-img>
                  <div v-else class="no-image-placeholder d-flex align-center justify-center" style="height: 140px; border-radius: 8px;">
                    <ImageOff :size="48" class="text-medium-emphasis" />
                  </div>
                </div>

                <!-- Content -->
                <div class="mb-3">
                  <h3 class="text-subtitle-1 font-weight-bold mb-1 text-truncate">{{ item.name }}</h3>
                  <div class="text-caption text-medium-emphasis mb-2">
                    <div>{{ item.type }}</div>
                    <div>{{ item.category }}</div>
                  </div>
                  
                  <!-- Badges -->
                  <div class="d-flex align-center mb-2" style="gap: 6px; flex-wrap: wrap;">
                    <v-chip v-if="item.spaceCount > 0" size="x-small" color="primary" variant="tonal">
                      {{ item.spaceCount }} {{ item.spaceCount > 1 ? 'espaces' : 'espace' }}
                    </v-chip>
                    <v-chip size="x-small" :color="item.readyForSale === 'Yes' ? 'success' : 'grey'" variant="flat">
                      {{ item.readyForSale === 'Yes' ? t('menuItemLib.ready') : t('menuItemLib.notReady') }}
                    </v-chip>
                    <v-chip v-if="item.comboItem === 'Yes'" size="x-small" color="primary" variant="flat">
                      {{ t('menuItemLib.combo') }}
                    </v-chip>
                    <v-chip v-if="item.diet" size="x-small" variant="outlined">
                      {{ item.diet }}
                    </v-chip>
                  </div>
                </div>

                <!-- Price & Cost -->
                <div class="mb-3">
                  <div class="d-flex align-center justify-space-between mb-1">
                    <span class="text-caption text-medium-emphasis">{{ t('menuItemLib.colPrice') }}</span>
                    <span class="text-subtitle-2 font-weight-bold">{{ formatCurrency(item.price) }}</span>
                  </div>
                  <div class="d-flex align-center justify-space-between mb-1">
                    <span class="text-caption text-medium-emphasis">{{ t('menuItemLib.colTotalCost') }}</span>
                    <span class="text-subtitle-2">{{ formatCurrency(item.totalCost) }}</span>
                  </div>
                  <v-divider class="my-2"></v-divider>
                  <div class="d-flex align-center justify-space-between">
                    <span class="text-caption text-medium-emphasis">{{ t('menuItemLib.colMargin') }}</span>
                    <v-chip
                      size="small"
                      :color="Number(item.margin) >= 60 ? 'success' : 'error'"
                      variant="flat"
                      class="font-weight-bold"
                    >
                      {{ `${Number(item.margin).toFixed(1)}%` }}
                    </v-chip>
                  </div>
                </div>

                <!-- Actions -->
                <div class="d-flex" style="gap: 8px;">
                  <v-btn variant="tonal" class="flex-grow-1" rounded="lg" @click="onEditItem(item)">
                    <Pencil :size="16" class="mr-2" />
                    {{ t('menuItemLib.edit') }}
                  </v-btn>
                  <v-btn variant="tonal" color="error" icon rounded="lg" @click="onDeleteItem(item)">
                    <Trash2 :size="16" />
                  </v-btn>
                </div>
              </div>
            </v-card>
          </v-col>
        </v-row>

        <!-- No Data State -->
        <v-card v-else rounded="xl" elevation="0" class="pa-16">
          <div class="text-center">
            <div class="mb-4">
              <ImageOff :size="64" class="text-medium-emphasis" />
            </div>
            <div class="text-h6 font-weight-bold mb-2">{{ t('menuItemLib.noDataFound') }}</div>
            <div class="text-body-2 text-medium-emphasis">
              {{ t('menuItemLib.noDataSubtitle') }}
            </div>
          </div>
        </v-card>
      </div>
    </v-container>

    <!-- Recipe Import Drawer -->
    <RecipeImportDrawer v-model="recipeImportOpen" :is-dark="isDark" @imported="onRecipesImported" />

    <!-- Delete Dialog (single) -->
    <MenuItemDeleteDialog
      v-model="deleteDialog"
      :title="t('menuItemLib.deleteTitle')"
      :subtitle="t('menuItemLib.deleteSubtitle')"
      :message="t('menuItemLib.deleteConfirm')"
      :item-name="deleteTarget?.name || t('menuItemLib.thisMenuItem')"
      :loading="deleteLoading"
      :error="deleteError"
      :cancel-label="t('cancel')"
      :confirm-label="t('menuItemLib.deleteBtn')"
      @confirm="confirmDelete"
    />

    <!-- Bulk Delete Dialog -->
    <MenuItemDeleteDialog
      v-model="bulkDeleteDialog"
      :title="t('menuItemLib.deleteSelectedTitle')"
      :subtitle="t('menuItemLib.deleteSubtitle')"
      :message="`${t('menuItemLib.deleteSelectedMessagePrefix')} ${selectedItems.length} ${t('menuItemLib.itemsSelected')}`"
      item-name=""
      :loading="bulkDeleteLoading"
      :error="bulkDeleteError"
      :cancel-label="t('cancel')"
      :confirm-label="t('menuItemLib.deleteAllConfirm')"
      @confirm="confirmBulkDelete"
    />

    <!-- CSV Import Drawer -->
    <MenuItemCsvImportDrawer
      v-model="importDrawer"
      :product-types="productTypes"
      :product-categories="productCategories"
      @imported="onImported"
    />

  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { formatCurrency } from "@/composables/useFormatters";
import { refreshMenuItemsCosts, deleteMenuItem, getMenuItemsPage } from "@/api/endpoints/menu-item.api";
import { getProductMappings, deleteProductMapping } from "@/api/endpoints/mapping.api";
import MenuItemDeleteDialog from '../dialogs/MenuItemDeleteDialog.vue';
import MenuItemCsvImportDrawer from '../drawers/MenuItemCsvImportDrawer.vue';
import RecipeImportDrawer from '../drawers/RecipeImportDrawer.vue';
import {
  ChevronDown,
  ChevronRight,
  Download,
  ImageOff,
  LayoutGrid,
  LayoutList,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UtensilsCrossed,
  X,
} from "lucide-vue-next";

export default {
  name: "MenuItemView",
  components: {
    ChevronDown,
    ChevronRight,
    Download,
    ImageOff,
    LayoutGrid,
    LayoutList,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    Upload,
    UtensilsCrossed,
    X,
    MenuItemDeleteDialog,
    MenuItemCsvImportDrawer,
    RecipeImportDrawer,
  },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark, formatCurrency };
  },
  data() {
    return {
      viewMode: "table",
      refreshing: false,
      searchQuery: "",
      spaceFilter: "All Spaces",
      typeFilter: "All Types",
      categoryFilter: "All Categories",
      readyFilter: "All",

      // Regroupement par type+catégorie (avec totaux) : ACTIVÉ PAR DÉFAUT — design validé
      // client, comportement historique inchangé (chevrons d'expansion par groupe + totaux).
      // Décocher le toggle bascule sur une vue tableau à plat en pagination serveur (plus
      // rapide sur un gros catalogue), en option seulement, jamais par défaut.
      groupByEnabled: true,
      serverLoading: false,
      serverPage: 1,
      serverItemsPerPage: 25,
      serverTotal: 0,
      serverRawItems: [],
      searchDebounceTimer: null,

      selectedItems: [],

      deleteDialog: false,
      deleteTarget: null,
      deleteLoading: false,
      deleteError: "",

      bulkDeleteDialog: false,
      bulkDeleteLoading: false,
      bulkDeleteError: "",

      importDrawer: false,
      exportLoading: false,
      recipeImportOpen: false,
    };
  },
  mounted() {
    this.$store.dispatch('spaces/fetchSpaces');
    this.$store.dispatch('productTypes/fetchProductTypes', { forceRefresh: true });
    this.$store.dispatch('productCategories/fetchProductCategories', { forceRefresh: true });
    this.ensureDataLoaded();
  },
  activated() {
    this.$store.dispatch('productTypes/fetchProductTypes', {});
    this.$store.dispatch('productCategories/fetchProductCategories', {});
    this.ensureDataLoaded();
  },
  watch: {
    searchQuery() {
      if (this.needsFullCatalog) return;
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => this.reloadServerFirstPage(), 300);
    },
    spaceFilter() { if (!this.needsFullCatalog) this.reloadServerFirstPage(); },
    typeFilter() { if (!this.needsFullCatalog) this.reloadServerFirstPage(); },
    categoryFilter() { if (!this.needsFullCatalog) this.reloadServerFirstPage(); },
    readyFilter() { if (!this.needsFullCatalog) this.reloadServerFirstPage(); },
    viewMode() { this.ensureDataLoaded(); },
    groupByEnabled() { this.ensureDataLoaded(); },
  },
  computed: {
    // Données depuis le store (avec cache TTL)
    spaces() {
      return this.$store.getters['spaces/spaces']
    },
    productTypes() {
      return this.$store.getters['productTypes/productTypes']
    },
    productCategories() {
      return this.$store.getters['productCategories/productCategories']
    },
    items() {
      // UNE LIGNE PAR ARTICLE, à partir du catalogue COMPLET en mémoire (store). Utilisé par
      // la vue grille et par la vue tableau REGROUPÉE (voir tableItems ci-dessous) — les deux
      // ont besoin de voir tous les articles pour calculer des totaux/filtres corrects.
      return (this.$store.getters['menuItems/rows'] || []).map((item) => this.mapItemToRow(item));
    },
    // true si l'écran a besoin du catalogue COMPLET en mémoire (vue grille, ou tableau
    // regroupé par type/catégorie avec totaux) plutôt que d'une simple page côté serveur.
    needsFullCatalog() {
      return this.viewMode === 'grid' || this.groupByEnabled;
    },
    groupByColumns() {
      return this.groupByEnabled
        ? [{ key: "type", order: "asc" }, { key: "category", order: "asc" }]
        : [];
    },
    // Lignes affichées dans le v-data-table : catalogue complet filtré côté client en mode
    // "regroupé", ou juste la page courante déjà filtrée côté serveur en mode "paginé".
    tableItems() {
      return this.needsFullCatalog ? this.filteredItems : this.serverRows;
    },
    serverRows() {
      return this.serverRawItems.map((item) => this.mapItemToRow(item));
    },
    tableTotalCount() {
      return this.needsFullCatalog ? this.filteredItems.length : this.serverTotal;
    },
    isTableLoading() {
      return this.needsFullCatalog ? !!this.$store.state.menuItems.isFetching : this.serverLoading;
    },
    tableHeaders() {
      return [
        { title: '', key: 'select', sortable: false, width: 48 },
        { title: this.t("menuItemLib.colPicture"), key: "picture", sortable: false, width: 90 },
        { title: this.t("menuItemLib.colName"), key: "name" },
        { title: this.t("menuItemLib.colCategory"), key: "category" },
        { title: this.t("menuItemLib.colSpace"), key: "spaceCount", width: 150 },
        { title: this.t("menuItemLib.colReady"), key: "readyForSale", sortable: false, width: 90 },
        { title: this.t("menuItemLib.colCombo"), key: "comboItem", sortable: false, width: 90 },
        { title: `${this.t("menuItemLib.colPrice")} ${this.t("menuItemLib.ttcSuffix")}`, key: "price", width: 110 },
        { title: this.t("menuItemLib.colPriceHt"), key: "priceHt", width: 100 },
        { title: this.t("menuItemLib.colTotalCost"), key: "totalCost", width: 120 },
        { title: this.t("menuItemLib.colMargin"), key: "margin", width: 120 },
        { title: this.t("menuItemLib.colDiet"), key: "diet", sortable: false, width: 90 },
        { title: this.t("menuItemLib.colStorage"), key: "storage", sortable: false, width: 110 },
        { title: this.t("menuItemLib.colActions"), key: "actions", sortable: false, align: "end", width: 110 },
      ];
    },
    spaceOptions() {
      const list = (this.spaces || [])
        .map((s) => ({
          title: String(s?.name || s?.title || s?.label || "").trim(),
          value: String(s?.id || s?._id || "").trim(),
        }))
        .filter((s) => s.title && s.value)
        .sort((a, b) => String(a.title).localeCompare(String(b.title)));
      return [{ title: this.t("menuItemLib.allSpaces"), value: "All Spaces" }, ...list];
    },
    typeOptions() {
      const types = (this.productTypes || [])
        .map((t) => String(t?.name || t?.type || "").trim())
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)));
      return [
        { title: this.t("menuItemLib.allTypes"), value: "All Types" },
        ...types.map(type => ({ title: type, value: type })),
      ];
    },
    categoryOptions() {
      const cats = (this.productCategories || [])
        .map((c) => String(c?.name || c?.category || "").trim())
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)));
      return [
        { title: this.t("menuItemLib.allCategories"), value: "All Categories" },
        ...cats.map(cat => ({ title: cat, value: cat })),
      ];
    },
    readyOptions() {
      return [
        { title: this.t("menuItemLib.readyAll"), value: "All" },
        { title: this.t("menuItemLib.readyYes"), value: "Yes" },
        { title: this.t("menuItemLib.readyNo"), value: "No" },
      ];
    },
    filteredItems() {
      const q = String(this.searchQuery || "").trim().toLowerCase();
      const list = Array.isArray(this.items) ? this.items : [];
      return list.filter((i) => {
        const name = String(i?.name || "").toLowerCase();
        const matchesSearch = !q || name.includes(q);
        const matchesSpace = this.spaceFilter === "All Spaces"
          || (Array.isArray(i?.spaceIds) && i.spaceIds.some((sid) => String(sid) === this.spaceFilter));
        const matchesType = this.typeFilter === "All Types" || String(i?.type || "") === this.typeFilter;
        const matchesCategory = this.categoryFilter === "All Categories" || String(i?.category || "") === this.categoryFilter;
        const matchesReady = this.readyFilter === "All" || String(i?.readyForSale || "") === this.readyFilter;
        return matchesSearch && matchesSpace && matchesType && matchesCategory && matchesReady;
      });
    },
  },
  methods: {
    resetFilters() {
      this.searchQuery = "";
      this.spaceFilter = "All Spaces";
      this.typeFilter = "All Types";
      this.categoryFilter = "All Categories";
      this.readyFilter = "All";
    },
    // Charge soit le catalogue complet (vue grille / tableau regroupé), soit la page
    // serveur courante (vue tableau à plat) — à appeler à chaque fois que l'écran doit
    // (re)synchroniser ses données avec le backend (montage, retour sur la page, mutation).
    ensureDataLoaded() {
      if (this.needsFullCatalog) {
        this.$store.dispatch('menuItems/fetchMenuItems', {});
      } else {
        this.reloadServerFirstPage();
      }
    },
    reloadServerFirstPage() {
      this.serverPage = 1;
      this.loadServerPage();
    },
    resolveTypeId(name) {
      if (!name || name === 'All Types') return null;
      const found = (this.productTypes || []).find((t) => String(t?.name || t?.type || '') === name);
      return found?.id || null;
    },
    resolveCategoryId(name) {
      if (!name || name === 'All Categories') return null;
      const found = (this.productCategories || []).find((c) => String(c?.name || c?.category || '') === name);
      return found?.id || null;
    },
    async loadServerPage() {
      this.serverLoading = true;
      try {
        const res = await getMenuItemsPage({
          page: this.serverPage,
          limit: this.serverItemsPerPage,
          spaceId: this.spaceFilter !== 'All Spaces' ? this.spaceFilter : null,
          search: this.searchQuery,
          typeId: this.resolveTypeId(this.typeFilter),
          categoryId: this.resolveCategoryId(this.categoryFilter),
          readyForSale: this.readyFilter !== 'All' ? this.readyFilter : null,
        });
        this.serverRawItems = res.data;
        this.serverTotal = res.meta?.total || 0;
      } catch (e) {
        console.error('[MenuItemView] loadServerPage error:', e);
        this.serverRawItems = [];
        this.serverTotal = 0;
      } finally {
        this.serverLoading = false;
      }
    },
    // Appelé par v-data-table (props items-per-page/page en mode paginé serveur) à chaque
    // changement de page/taille de page — ignoré en mode "catalogue complet".
    onUpdateOptions(options) {
      if (this.needsFullCatalog) return;
      const page = options?.page || 1;
      const itemsPerPage = options?.itemsPerPage || this.serverItemsPerPage;
      if (page === this.serverPage && itemsPerPage === this.serverItemsPerPage && this.serverRawItems.length) {
        return; // évite un fetch en double sur l'émission initiale de v-data-table au montage
      }
      this.serverPage = page;
      this.serverItemsPerPage = itemsPerPage;
      this.loadServerPage();
    },
    mapItemToRow(item) {
      // UNE LIGNE PAR ARTICLE. Un même article vendu dans N espaces reste UNE seule ligne :
      // on affiche le NOMBRE d'espaces, et le prix le PLUS ÉLEVÉ parmi les espaces
      // (TTC + HT/TVA/marge de ce même espace le plus cher, pour garder une ligne cohérente).
      const menuItemId = item?.id || item?._id;
      // On affiche le coût PAR PIÈCE (cohérent avec le drawer et le prix de vente d'une portion),
      // pas le coût total de la recette. Le backend le fournit déjà (costPerPiece) ; repli local
      // = totalCost / nombre de pièces.
      const recipeTotalCost = Number(item?.totalCost || 0);
      const pieces = Math.max(Number(item?.numberOfPiecesRecipe) || 1, 1);
      const totalCost = item?.costPerPiece != null
        ? Number(item.costPerPiece)
        : recipeTotalCost / pieces;
      const spaceIds = Array.isArray(item?.spaceIds) ? item.spaceIds : (item?.spaceId ? [item.spaceId] : []);

      // Prix de chaque espace (ou prix global si aucun espace), puis on retient l'espace le plus cher.
      const priced = (spaceIds.length ? spaceIds : [null]).map((sid) => {
        const p = this.rowPrice(item, sid);
        const margin = p.margin != null
          ? p.margin
          : (p.ttc > 0 ? ((p.ttc - totalCost) / p.ttc) * 100 : 0);
        return { ...p, margin: Number(margin) };
      });
      const top = priced.reduce(
        (best, cur) => (cur.ttc > (best?.ttc ?? -Infinity) ? cur : best),
        priced[0],
      );

      return {
        id: menuItemId, // clé de ligne = l'article (plus de couple article×espace)
        menuItemId,
        name: item?.name || "-",
        category: item?.productCategory?.name || "-",
        type: item?.productType?.name || "-",
        picture: item?.picture || item?.image || null,
        readyForSale: item?.readyForSale === "Yes" ? "Yes" : "No",
        comboItem: item?.comboItem === "Yes" ? "Yes" : "No",
        totalCost,
        diet: item?.diet?.join(", ") || "-",
        storage: item?.storageType?.join(", ") || "-",
        spaceIds,
        spaceCount: spaceIds.length,
        spaceNames: spaceIds.map((sid) => this.getSpaceName(sid)),
        price: top.ttc,
        priceHt: top.ht,
        vatRate: top.vatRate,
        margin: Number(top.margin).toFixed(1),
        _raw: item,
      };
    },
    getSpaceName(spaceId) {
      const s = (this.spaces || []).find(x => String(x?.id || x?._id) === String(spaceId));
      return s ? String(s.name || s.title || s.label || spaceId) : String(spaceId);
    },
    /**
     * Prix (TTC/HT/TVA/marge) d'un article DANS un espace : décomposition `spacePricing[spaceId]`
     * renvoyée par le backend, sinon repli sur le prix global (`pricing` / `basePrice`).
     */
    rowPrice(item, spaceId) {
      const sp = item?.spacePricing && typeof item.spacePricing === 'object' ? item.spacePricing : null;
      const entry = sp && spaceId ? sp[spaceId] : null;
      if (entry) {
        return {
          ttc: Number(entry.gross?.ttc ?? 0),
          ht: entry.gross?.ht != null ? Number(entry.gross.ht) : null,
          vatRate: entry.vatRate != null ? Number(entry.vatRate) : null,
          margin: entry.margin != null ? Number(entry.margin) : null,
        };
      }
      const g = item?.pricing?.gross || {};
      return {
        ttc: Number(item?.basePrice ?? g.ttc ?? 0),
        ht: g.ht != null ? Number(g.ht) : null,
        vatRate: item?.pricing?.vatRate != null ? Number(item.pricing.vatRate)
          : (item?.vatRate != null ? Number(item.vatRate) : null),
        margin: item?.pricing?.margin != null ? Number(item.pricing.margin) : null,
      };
    },
    groupTotals(items) {
      const list = Array.isArray(items) ? items : [];
      if (!list.length) return { totalCost: 0, totalPrice: 0, avgMargin: 0 };
      
      // Flatten nested groups to get actual menu items
      const flattenItems = (arr) => {
        const result = [];
        for (const item of arr) {
          if (item.type === 'group' && item.items) {
            // It's a group, recurse into its items
            result.push(...flattenItems(item.items));
          } else {
            // It's an item - use raw data if available, otherwise use item directly
            const actualItem = item.raw || item;
            if (actualItem.price !== undefined || actualItem.totalCost !== undefined) {
              result.push(actualItem);
            }
          }
        }
        return result;
      };
      
      const menuItems = flattenItems(list);
      if (!menuItems.length) return { totalCost: 0, totalPrice: 0, avgMargin: 0 };
      
      const totalCost = menuItems.reduce((sum, i) => {
        const cost = Number(i?.totalCost) || 0;
        return sum + cost;
      }, 0);
      
      const totalPrice = menuItems.reduce((sum, i) => {
        const price = Number(i?.price) || 0;
        return sum + price;
      }, 0);
      
      const avgMargin = menuItems.reduce((sum, i) => {
        const margin = Number(i?.margin) || 0;
        return sum + margin;
      }, 0) / menuItems.length;
      
      return { totalCost, totalPrice, avgMargin };
    },

    async onExportCsv() {
      this.exportLoading = true
      try {
        // L'export porte sur le catalogue COMPLET filtré, pas juste la page visible à l'écran
        // (mode tableau paginé) — s'assure que le store est peuplé avant de lire filteredItems.
        // Note perf : PAS de getMenuItemById() par article ici — findAll() (donc fetchMenuItems)
        // inclut déjà ingredients/components/packagings avec leurs entités liées (même
        // `includeRelations` que le détail unitaire), item._raw les contient donc déjà.
        // L'ancienne version refaisait un appel réseau par article (N+1), c'était l'essentiel
        // de la lenteur avant le lancement du téléchargement.
        await this.$store.dispatch('menuItems/fetchMenuItems', {})
        const source = this.filteredItems.length ? this.filteredItems : (this.items || [])
        if (!source.length) { this.exportLoading = false; return }

        const headers = [
          // "Display Name Ref" (pas "Display Name" tout court) : évite une collision avec
          // l'alias historique 'display name' → name du menu item lui-même côté import CSV.
          'Name', 'Type', 'Category', 'Brand', 'Display Name Ref',
          'Ready for Sale', 'Kitchen Type', 'Combo Item', 'Number of Pieces (Recipe)',
          'Price TTC', 'Price HT', 'VAT %', 'Discount Type', 'Discount Value',
          'Storage Type', 'Diet', 'Space', 'Description',
          // Une ligne par ingrédient/composant/packaging de la recette — identifiés par NOM
          // (pas par ID interne, qui n'a aucun sens d'un compte à l'autre) pour que le fichier
          // reste lisible et exploitable en dehors de ce tenant précis.
          'Line Type', 'Line Item Name', 'Line Quantity', 'Line Unit Cost', 'Line Total Cost',
        ]

        const rows = []
        for (const item of source) {
          const raw = item._raw || {}
          const lines = [
            ...(raw.ingredients || []).map((l) => ({ type: 'Ingredient', name: l.ingredient?.name || '', qty: l.numberOfUnits, unitCost: l.unitCost, totalCost: l.totalCost })),
            ...(raw.components || []).map((l) => ({ type: 'Component', name: l.component?.name || '', qty: l.numberOfUnits, unitCost: l.unitCost, totalCost: l.totalCost })),
            ...(raw.packagings || []).map((l) => ({ type: 'Packaging', name: l.packaging?.name || '', qty: l.numberOfUnits, unitCost: l.unitCost, totalCost: l.totalCost })),
          ]
          // Un article sans aucune ligne de recette garde quand même UNE ligne dans l'export
          // (sinon il disparaîtrait silencieusement du fichier).
          if (!lines.length) lines.push({ type: '', name: '', qty: '', unitCost: '', totalCost: '' })

          const itemColumns = [
            String(raw.name || item.name || ''),
            String(raw.productType?.name || item.type || ''),
            String(raw.productCategory?.name || item.category || ''),
            String(raw.brand?.name || ''),
            String(raw.displayName?.name || ''),
            String(raw.readyForSale ?? ''),
            String(raw.kitchenType || ''),
            String(raw.comboItem ?? ''),
            String(raw.numberOfPiecesRecipe ?? ''),
            String(item.price ?? ''),
            String(item.priceHt ?? ''),
            String(item.vatRate ?? ''),
            String(raw.discountType || ''),
            String(raw.discountValue ?? ''),
            String((raw.storageType || []).join('; ')),
            String((raw.diet || []).join('; ')),
            String((item.spaceNames || []).join('; ')),
            String(raw.description || ''),
          ]

          for (const line of lines) {
            rows.push([
              ...itemColumns,
              String(line.type),
              String(line.name),
              String(line.qty ?? ''),
              String(line.unitCost ?? ''),
              String(line.totalCost ?? ''),
            ])
          }
        }

        const escape = cell => {
          const s = String(cell ?? '')
          return (s.includes(',') || s.includes('"') || s.includes('\n'))
            ? '"' + s.replace(/"/g, '""') + '"'
            : s
        }

        const csvContent = [headers, ...rows]
          .map(row => row.map(escape).join(','))
          .join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.setAttribute('href', URL.createObjectURL(blob))
        link.setAttribute('download', `menu-items-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } catch (error) {
        console.error('Error exporting to CSV:', error)
        alert('Failed to export CSV. Please try again.')
      } finally {
        this.exportLoading = false
      }
    },
    async onRecipesImported() {
      try {
        await this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true });
      } catch (e) { /* noop */ }
      this.ensureDataLoaded();
    },
    async onRefreshCosts() {
      this.refreshing = true;
      try {
        await refreshMenuItemsCosts();
        await this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true });
        this.ensureDataLoaded();
      } catch (e) {
        console.error('Error refreshing costs:', e);
        alert(e?.userMessage || e?.message || 'Failed to refresh costs. Please try again.');
      } finally {
        this.refreshing = false;
      }
    },
    onAddMenuItem() {
      this.$router.push({ path: '/menu-items/create' });
    },
    onEditItem(item) {
      const id = item?.menuItemId || item?.id;
      if (!id) return;
      this.$router.push({ path: `/menu-items/edit/${id}` });
    },
    onDeleteItem(item) {
      this.deleteTarget = item || null;
      this.deleteError = "";
      this.deleteLoading = false;
      this.deleteDialog = true;
    },
    closeDeleteDialog() {
      this.deleteDialog = false;
      this.deleteTarget = null;
      this.deleteError = "";
    },
    async confirmDelete() {
      const id = this.deleteTarget?.menuItemId || this.deleteTarget?.id;
      if (!id) return;
      this.deleteLoading = true;
      this.deleteError = "";
      try {
        await deleteMenuItem(id);
        await this.cleanWeezMappings([id]);
        this.$store.dispatch('menuItems/removeRows', [id]);
        this.selectedItems = this.selectedItems.filter(sid => String(sid) !== String(id));
        this.closeDeleteDialog();
        this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true });
        this.ensureDataLoaded();
      } catch (e) {
        console.error('Error deleting menu item:', e);
        this.deleteError = e?.userMessage || e?.message || "Failed to delete menu item";
      } finally {
        this.deleteLoading = false;
      }
    },

    async cleanWeezMappings(menuItemIds) {
      try {
        const allMappings = await getProductMappings();
        const toDelete = allMappings.filter(m => menuItemIds.includes(m.menuItemId));
        await Promise.allSettled(toDelete.map(m => deleteProductMapping(m.weezeventProductId)));
      } catch (e) {
        console.warn('[MenuItemView] cleanWeezMappings error (non-bloquant):', e);
      }
    },

    toggleSelection(id) {
      if (this.selectedItems.includes(id)) {
        this.selectedItems = this.selectedItems.filter(s => s !== id);
      } else {
        this.selectedItems = [...this.selectedItems, id];
      }
    },
    toggleSelectAll(val) {
      // Mode paginé : "tout sélectionner" ne porte que sur la page visible (les autres
      // pages ne sont pas chargées en mémoire) — cohérent avec le compteur affiché.
      this.selectedItems = val ? this.tableItems.map(i => i.id) : [];
    },

    onBulkDelete() {
      this.bulkDeleteError = "";
      this.bulkDeleteDialog = true;
    },
    async confirmBulkDelete() {
      if (!this.selectedItems.length) return;
      this.bulkDeleteLoading = true;
      this.bulkDeleteError = "";
      // La sélection contient des ids d'articles (une ligne = un article).
      const menuItemIds = [...new Set(this.selectedItems.map(id => String(id)))];
      const failed = [];
      let firstErrorMessage = "";
      for (const id of menuItemIds) {
        try {
          await deleteMenuItem(id);
        } catch (e) {
          console.error(`Error deleting menu item ${id}:`, e);
          if (!firstErrorMessage) firstErrorMessage = e?.userMessage || e?.message || "";
          failed.push(id);
        }
      }
      const deleted = menuItemIds.filter(id => !failed.includes(id));

      // Fermer le dialogue et mettre à jour la sélection quoi qu'il arrive
      this.bulkDeleteDialog = false;
      // Garder sélectionnés seulement les articles en échec.
      this.selectedItems = this.selectedItems.filter(sid => failed.includes(String(sid)));
      this.bulkDeleteLoading = false;

      if (deleted.length) {
        this.$store.dispatch('menuItems/removeRows', deleted);
        this.cleanWeezMappings(deleted);
        this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true });
        this.ensureDataLoaded();
      }

      if (failed.length > 0) {
        this.bulkDeleteError = firstErrorMessage
          ? `${failed.length} article(s) n'ont pas pu être supprimés : ${firstErrorMessage}`
          : `${failed.length} article(s) n'ont pas pu être supprimés.`;
      }
    },

    async onImported() {
      await refreshMenuItemsCosts();
      await this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true });
      this.ensureDataLoaded();
    },
  },
};
</script>

<style scoped>
#menu-items-library-page {
  position: fixed;
  top: var(--v-layout-top, 64px);
  left: var(--v-layout-left, 0px);
  right: 0;
  bottom: var(--v-layout-bottom, 0px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f6f7fb;
}

.mil-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* ── Gradient Header ── */
.mil-header {
  flex-shrink: 0;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
  z-index: 100;
}
.mil-header__inner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px; gap: 16px; flex-wrap: wrap;
}
.mil-header__left { display: flex; align-items: center; gap: 14px; }
.mil-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.mil-header__title { font-size: 19px; font-weight: 800; color: #fff; margin: 0; line-height: 1.2; }
.mil-header__subtitle { font-size: 12px; color: rgba(255,255,255,.72); margin: 2px 0 0; }
.mil-header__right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.mil-header__sep { width: 1px; height: 32px; background: rgba(255,255,255,.25); }
.mil-view-toggle {
  display: flex; background: rgba(255,255,255,.15);
  border-radius: 10px; padding: 3px; gap: 2px;
}
.mil-view-btn {
  width: 30px; height: 30px; border: none;
  background: transparent; color: rgba(255,255,255,.75);
  border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all .2s;
}
.mil-view-btn--active { background: rgba(255,255,255,.25); color: #fff; }
.mil-view-btn:hover:not(.mil-view-btn--active) { background: rgba(255,255,255,.1); color: #fff; }
.mil-header__actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mil-action-hbtn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 100px;
  border: 1.5px solid rgba(255,255,255,.6);
  background: transparent; color: rgba(255,255,255,.9);
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.mil-action-hbtn:hover { background: rgba(255,255,255,.15); border-color: #fff; }
.mil-action-hbtn:disabled { opacity: .5; cursor: not-allowed; }
.mil-add-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 8px 16px; border-radius: 100px;
  border: 2px solid rgba(255,255,255,.85);
  background: transparent; color: #fff;
  font-size: 12.5px; font-weight: 700; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.mil-add-btn:hover { background: #fff; color: #ff3131; }

/* ── Filter bar ── */
.mil-filterbar {
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  z-index: 99;
}
.mil--dark .mil-filterbar { background: #1e293b; border-bottom-color: rgba(255,255,255,.08); }
.mil-filterbar__row1 {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 28px; flex-wrap: wrap;
}
/* Search sans bordure (icône + input inline dans la barre), style MarketPriceListView. */
.mil-filterbar__search-wrap { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 160px; }
.mil-filterbar__search-icon { color: #9ca3af; flex-shrink: 0; }
.mil-filterbar__search-input {
  flex: 1; min-width: 0; border: none; background: transparent;
  padding: 0; font-size: 14px; outline: none; color: #111827;
}
.mil-filterbar__search-input::placeholder { color: #9ca3af; }
.mil--dark .mil-filterbar__search-input { color: #e5e7eb; }
.mil-filterbar__selects { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.mil-filter-sel { min-width: 150px; max-width: 210px; }
.mil-filter-sel :deep(.v-field) { border-radius: 100px !important; border: 1.5px solid #e5e7eb !important; background: #f9fafb !important; box-shadow: none !important; }
.mil-filter-sel :deep(.v-field__outline) { display: none; }
.mil-filter-sel :deep(.v-field--focused) { border-color: #ff3131 !important; }
.mil-filter-sel :deep(.v-field__input) { font-size: 12.5px !important; font-weight: 500 !important; color: #374151 !important; padding-top: 0 !important; padding-bottom: 0 !important; min-height: 34px; justify-content: center; align-items: center; align-content: center; }
/* Multi-selects (checkboxes) : le wrapper et la sélection centrés verticalement,
   exactement comme les single-selects — sinon le contenu remonte en haut. */
.mil-filter-sel :deep(.v-field__field) { align-items: center; }
.mil-filter-sel :deep(.v-select__selection) { margin: 0 auto; align-items: center; align-self: center; margin-top: 0; margin-bottom: 0; }
/* Centre le libellé de sélection (multi) et l'input. */
.mil-filter-sel :deep(input) { text-align: center; align-self: center; }
/* Placeholder affiché comme une valeur (foncé), pas grisé. */
.mil-filter-sel :deep(input::placeholder) { color: #374151 !important; opacity: 1 !important; font-weight: 500; }
.mil--dark .mil-filter-sel :deep(input::placeholder) { color: #e5e7eb !important; }
.mil--dark .mil-filter-sel :deep(.v-field) { background: #0f172a !important; border-color: rgba(255,255,255,.12) !important; }
.mil--dark .mil-filter-sel :deep(.v-field__input) { color: #e5e7eb !important; }
.mil-filterbar__count { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.mil-count-badge {
  display: inline-flex; align-items: center; justify-content: center;
  background: #f3f4f6; color: #6b7280; font-size: 11px; font-weight: 700;
  border-radius: 50px; padding: 1px 8px; border: 1.5px solid #e5e7eb; min-width: 28px;
}
.mil--dark .mil-count-badge {
  background: rgba(255,255,255,.06); color: #cbd5e1; border-color: rgba(255,255,255,.14);
}

/* Active chips */
.mil-filterbar__chips {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 0 24px 10px;
}
.mil-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 500;
}
.mil-chip--blue { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.mil-chip--purple { background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; }
.mil-chip--orange { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
.mil-chip--green { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.mil-chip__x {
  background: none; border: none; cursor: pointer; padding: 0;
  display: flex; align-items: center; color: inherit; opacity: .6;
}
.mil-chip__x:hover { opacity: 1; }
.mil-chip-clear {
  background: none; border: none; cursor: pointer; padding: 3px 10px;
  font-size: 12px; color: #9ca3af; border-radius: 100px;
  transition: color .15s, background .15s;
}
.mil-chip-clear:hover { color: #374151; background: #f3f4f6; }

/* ── Bulk bar ── */
.mil-bulk-bar {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 24px;
  background: #fff3f3; border-bottom: 1px solid rgba(255, 49, 49,.15);
  z-index: 98;
}
.mil-bulk-bar--dark { background: rgba(255, 49, 49,.08); border-bottom-color: rgba(255, 49, 49,.2); }
.mil-bulk-bar__left { display: flex; align-items: center; gap: 8px; }
.mil-bulk-badge {
  display: inline-flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  color: #fff; font-size: 12px; font-weight: 700;
  border-radius: 50px; padding: 2px 10px; min-width: 28px;
}
.mil-bulk-text { font-size: 13.5px; color: #374151; }
.mil-bulk-bar--dark .mil-bulk-text { color: #f3f4f6; }
.mil-bulk-bar__right { display: flex; align-items: center; gap: 8px; }
.mil-bulk-cancel {
  background: none; border: none; cursor: pointer;
  padding: 6px 14px; border-radius: 50px;
  font-size: 13px; color: #6b7280;
  transition: color .15s, background .15s;
}
.mil-bulk-cancel:hover { color: #374151; background: rgba(0,0,0,.05); }
.mil-bulk-delete {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 16px; border-radius: 50px; border: none;
  background: #ff3131;
  color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all .2s;
}
.mil-bulk-delete:hover { box-shadow: 0 4px 12px rgba(255, 49, 49,.4); transform: translateY(-1px); }

/* ── Dark mode ── */
.mil--dark#menu-items-library-page,
.mil--dark {
  background: linear-gradient(135deg, #0b1220 0%, #0f172a 100%) !important;
}

.mil--dark .data-table-card,
.mil--dark .menu-item-card {
  background: #111827 !important;
  border-color: #374151 !important;
}

.mil--dark :deep(.v-data-table),
.mil--dark :deep(.v-data-table .v-table__wrapper),
.mil--dark :deep(.v-data-table .v-table) {
  background: #111827 !important;
  color: #e2e8f0 !important;
}

.mil--dark :deep(thead),
.mil--dark :deep(thead tr),
.mil--dark :deep(.menu-items-table thead) {
  background: #1e293b !important;
}

.mil--dark :deep(thead th),
.mil--dark :deep(thead th .v-data-table-header__content),
.mil--dark :deep(thead th span) {
  color: #e2e8f0 !important;
  -webkit-text-fill-color: #e2e8f0 !important;
  border-bottom-color: #374151 !important;
}

.mil--dark :deep(tbody tr) {
  border-bottom-color: #1e293b !important;
}

.mil--dark :deep(tbody tr:hover),
.mil--dark :deep(tbody tr:hover td),
.mil--dark :deep(.v-data-table__tr--hover),
.mil--dark :deep(.v-data-table__tr--hover td),
.mil--dark :deep(.group-header-row:hover),
.mil--dark :deep(.group-header-row:hover td),
.mil--dark :deep(tr.group-header-row:hover) {
  background: transparent !important;
  --v-hover-opacity: 0 !important;
}

/* Désactiver globalement le hover overlay Vuetify en dark */
.mil--dark :deep(.v-table) {
  --v-hover-opacity: 0 !important;
}

.mil--dark :deep(tbody td) {
  color: #e2e8f0 !important;
  border-bottom-color: #1e293b !important;
}

.mil--dark .group-header-row {
  background: #1e293b !important;
  border-top-color: #374151 !important;
  border-bottom-color: #374151 !important;
}

.mil--dark :deep(.v-field) {
  background: #1e293b !important;
  border-color: #374151 !important;
}

.mil--dark :deep(.v-field__input),
.mil--dark :deep(.v-select__selection-text),
.mil--dark :deep(.v-field-label) {
  color: #e2e8f0 !important;
  opacity: 1 !important;
}

.mil--dark :deep(.v-btn-toggle) {
  border-color: #374151 !important;
  background: #1e293b !important;
}

.mil--dark :deep(.v-btn:not(.v-btn--active)) {
  color: #94a3b8 !important;
  border-color: #374151 !important;
}

.mil--dark .text-medium-emphasis {
  color: #94a3b8 !important;
}

.mil--dark :deep(.v-data-table-footer) {
  background: #111827 !important;
  color: #94a3b8 !important;
  border-top-color: #374151 !important;
}

.mil--dark :deep(.v-data-table-footer .v-select) {
  color: #e2e8f0 !important;
}

.mil--dark .no-image-placeholder {
  background: #1e293b !important;
}

/* Data Table Card */
.data-table-card {
  background: white;
  border: 1px solid #e5e7eb;
  /* Remplit la zone de scroll : le corps du tableau scrolle en interne,
     l'entête de colonnes reste fixe (fixed-header). */
  display: flex;
  flex-direction: column;
  max-height: 100%;
  min-height: 0;
}
.menu-items-table {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.menu-items-table :deep(.v-table) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Group Header Styles */
.group-level-1 {
  background: #f9fafb;
}

.group-level-2 {
  background: #ffffff;
}

/* Table Styles */
.menu-items-table :deep(.v-table__wrapper) {
  border-radius: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* Grid View Styles */
.menu-item-card {
  background: white;
  border: 1px solid #e5e7eb;
  transition: all 0.3s ease;
}

.menu-item-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1) !important;
  border-color: #d1d5db;
}

.menu-item-image {
  transition: all 0.3s ease;
}

.menu-item-card:hover .menu-item-image {
  transform: scale(1.05);
}

.no-image-placeholder {
  background: #f3f4f6;
  transition: all 0.3s ease;
}

.menu-item-card:hover .no-image-placeholder {
  background: #e5e7eb;
}

.menu-items-table :deep(thead) {
  background: #f9fafb;
}

.menu-items-table :deep(thead th),
.menu-items-table :deep(thead th .v-data-table-header__content),
.menu-items-table :deep(thead th span) {
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 0.68rem !important;
  letter-spacing: 0.025em;
  color: #374151 !important;
  border-bottom: 1px solid #e5e7eb !important;
  white-space: nowrap;
}

.menu-items-table :deep(tbody tr) {
  transition: all 0.2s ease;
}

.menu-items-table :deep(tbody tr:hover) {
  background: #f9fafb !important;
  transition: background-color 0.2s ease;
}

.menu-items-table :deep(tbody td) {
  padding-top: 6px !important;
  padding-bottom: 6px !important;
  font-size: 0.75rem !important;
}

.menu-items-table :deep(tbody td span),
.menu-items-table :deep(tbody td div) {
  font-size: 0.75rem !important;
}

.menu-items-table :deep(tbody td .v-chip),
.menu-items-table :deep(tbody td .v-chip__content) {
  font-size: 0.68rem !important;
}

.menu-items-table :deep(tbody tr[data-item-type="item"]) {
  margin-left: 24px;
}

/* Group Header */
.group-header-row {
  background: #f9fafb !important;
  border-top: 1px solid #e5e7eb !important;
  border-bottom: 1px solid #e5e7eb !important;
}

.group-header-cell {
  padding: 6px 12px !important;
}

.group-toggle-btn {
  transition: transform 0.3s ease;
}

.group-toggle-btn:hover {
  transform: rotate(90deg);
}

.group-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.72rem;
}

/* Item Avatar */
.item-avatar {
  border: 1px solid #e5e7eb;
  transition: all 0.3s ease;
}

.item-avatar:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Action Buttons */
.action-btn {
  transition: all 0.2s ease;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

/* Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

<!-- Dropdown des filtres : le menu Vuetify est téléporté hors du composant,
     donc styles non-scopés ciblés via contentClass="mil-filter-menu". -->
<style>
.mil-filter-menu {
  border-radius: 14px !important;
  box-shadow: 0 10px 34px rgba(17, 24, 39, .14) !important;
  overflow: hidden;
  margin-top: 6px;
}
.mil-filter-menu .v-list {
  padding: 6px !important;
  background: #fff;
}
.mil-filter-menu .v-list-item {
  border-radius: 9px !important;
  min-height: 36px !important;
  margin-bottom: 2px;
}
.mil-filter-menu .v-list-item:last-child { margin-bottom: 0; }
.mil-filter-menu .v-list-item-title {
  font-size: 13px !important;
  font-weight: 500;
  color: #374151;
}
.mil-filter-menu .v-list-item:hover .v-list-item-title { color: #111827; }
.mil-filter-menu .v-list-item--active .v-list-item-title {
  color: #ff3131 !important;
  font-weight: 600;
}
.mil-filter-menu .v-list-item--active { background: rgba(255, 49, 49, .08) !important; }
/* Neutralise l'overlay de survol Vuetify pour un fond hover net. */
.mil-filter-menu .v-list-item__overlay { opacity: 0 !important; }
.mil-filter-menu .v-list-item:hover { background: #f4f5f7; }
</style>