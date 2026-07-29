
<template>
  <div id="market-price-page" :class="{ 'mpl--dark': isDark }">

    <!-- ── Header ── -->
    <div class="mpl-header sticky-header">
      <div class="mpl-header__inner">
        <div class="mpl-header__left">
          <div class="mpl-header__icon">
            <ShoppingBasket :size="22" color="white" />
          </div>
          <div>
            <h1 class="mpl-header__title">{{ t('marketPrices') }}</h1>
            <p class="mpl-header__subtitle">{{ t('marketPriceListSubtitle') }}</p>
          </div>
        </div>
        <div class="mpl-header__right">
          <div class="mpl-header__actions">
            <button class="mpl-action-btn" @click="exportToCSV">
              <Download :size="15" class="me-1" />
              CSV
            </button>
            <button
              class="mpl-action-btn"
              :title="locale === 'fr' ? 'Export groupé par article, avec IDs (pour réimport)' : 'Export grouped by item, with IDs (for reimport)'"
              @click="exportToCSVPacked"
            >
              <Download :size="15" class="me-1" />
              CSV ({{ locale === 'fr' ? 'par article' : 'by item' }})
            </button>
            <button class="mpl-action-btn" @click="onImportCsv">
              <Upload :size="15" class="me-1" />
              {{ locale === 'fr' ? 'Importer' : 'Import' }}
            </button>
            <button class="mpl-add-btn" @click="onCreateItem">
              <Plus :size="17" class="me-1" />
              {{ t('marketPriceListNewPrice') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Search / filter bar ── -->
    <div class="mpl-searchbar sticky-search">
      <div class="mpl-searchbar__inner">
        <Search :size="17" class="mpl-searchbar__icon" />
        <input
          v-model="searchQuery"
          class="mpl-searchbar__input"
          type="search"
          :placeholder="locale === 'fr' ? 'Rechercher un article…' : 'Search items…'"
        />
        <div class="mpl-filter-pills">
          <select v-model="selectedType" class="mpl-filter-select">
            <option v-for="opt in typeOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <select v-model="selectedCategory" class="mpl-filter-select">
            <option v-for="opt in categoryOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <select v-model="selectedSupplier" class="mpl-filter-select">
            <option v-for="opt in supplierOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>
        <span class="mpl-searchbar__count">{{ filteredItems.length }} {{ locale === 'fr' ? 'articles' : 'items' }}</span>
        <button
          v-if="searchQuery || selectedType !== 'All Types' || selectedCategory !== 'All Categories' || selectedSupplier !== 'All Suppliers'"
          class="mpl-searchbar__clear"
          @click="clearFilters"
        >
          <X :size="15" />
        </button>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="mpl-content">
      <v-progress-linear v-if="marketPricesLoading" indeterminate color="#ff3131" height="3" rounded class="mpl-loader" />

      <div v-if="debugError" class="mpl-alert">
        <AlertCircle :size="15" class="me-2" style="flex-shrink:0" />
        {{ debugError }}
      </div>

      <!-- List view -->
      <div class="mpl-table-wrap">
        <MarketPriceTable
          :is-dark="isDark"
          :headers="tableHeaders"
          :items="filteredItems"
          :loading="marketPricesLoading"
          :expanded="expanded"
          :supplier-headers="supplierHeaders"
          @update:expanded="expanded = $event"
          @toggle-expand="toggleExpand"
          @add-supplier="onAddSupplier"
          @edit-item="onEditItem"
          @delete-item="onDeleteItem"
          @edit-supplier-row="onEditSupplierRow"
          @delete-supplier-row="onDeleteSupplierRow"
        />
      </div>
    </div>

    <!-- Drawers / Dialogs -->
    <MarketPriceCsvImportDrawer v-model="csvImportDrawer" :is-dark="isDark" :suppliers="suppliers" :industrials="industrials" @imported="loadMarketPrices(true)" />
    <MarketPriceCreateDrawer v-model="createDialog" :initial-data="createInitialData" :existing-item-names="existingItemNames" :suppliers="suppliers" :good-type-options="goodTypeOptions" :product-categories="productCategories" :is-dark="isDark" @created="onCreated" />
    <MarketPriceEditDrawer v-model="editDialog" :initial-item="editTargetItem" :good-type-options="goodTypeOptions" :product-category-options="productCategoryOptions" :product-categories="productCategories" :recipe-unit-options="recipeUnitOptions" :is-dark="isDark" @saved="onSaved" />
    <MarketPriceDeleteItemDialog v-model="deleteItemDialog" :item-name="deleteItemName" :is-dark="isDark" @deleted="onDeleted" />
    <MarketPriceDeleteSupplierDialog v-model="deleteSupplierDialog" :target-row="deleteSupplierTarget" :item-name="deleteSupplierItemName" :is-dark="isDark" @deleted="onDeleted" />
    <MarketPriceEditSupplierDrawer v-model="editSupplierDialog" :item="editSupplierItem" :row="editSupplierRowData" :suppliers="suppliers" :good-type-options="goodTypeOptions" :product-categories="productCategories" :is-dark="isDark" @saved="onSaved" />
  </div>
</template>
<script>
import {
  AlertCircle,
  Download,
  PackageX,
  Pencil,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
  Upload,
  X,
} from "lucide-vue-next";
import MarketPriceFilters from '../components/MarketPriceFilters.vue';
import MarketPriceTable from '../components/MarketPriceTable.vue';
import MarketPriceCsvImportDrawer from '../drawers/MarketPriceCsvImportDrawer.vue';
import MarketPriceCreateDrawer from '../drawers/MarketPriceCreateDrawer.vue';
import MarketPriceEditDrawer from '../drawers/MarketPriceEditDrawer.vue';
import MarketPriceDeleteItemDialog from '../dialogs/MarketPriceDeleteItemDialog.vue';
import MarketPriceDeleteSupplierDialog from '../dialogs/MarketPriceDeleteSupplierDialog.vue';
import MarketPriceEditSupplierDrawer from '../drawers/MarketPriceEditSupplierDrawer.vue';

import { setAccessToken } from "@/api/client";
import { supabase } from "@/lib/supabase";
import { useI18n } from '@/i18n/useI18n';

export default {
  name: "MarketPriceListView",
  components: {
    AlertCircle, Download, PackageX, Pencil, Plus,
    Search, ShoppingBasket, Trash2, Upload, X,
    MarketPriceFilters,
    MarketPriceTable,
    MarketPriceCsvImportDrawer,
    MarketPriceCreateDrawer,
    MarketPriceEditDrawer,
    MarketPriceDeleteItemDialog,
    MarketPriceDeleteSupplierDialog,
    MarketPriceEditSupplierDrawer,
  },
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      locale: localStorage.getItem('appLocale') || 'en',
      theme: (() => { const s = localStorage.getItem('datafriday:theme') || localStorage.getItem('appTheme') || 'dataFridayLight'; return (s === 'light' ? 'dataFridayLight' : s === 'dark' ? 'dataFridayDark' : s); })(),
      expanded: [],
      searchQuery: "",
      selectedType: "All Types",
      selectedCategory: "All Categories",
      selectedSupplier: "All Suppliers",
      selectedSpace: "All Spaces",

      marketPricesLoading: true,
      marketPricesError: "",

      debouncedSearchQuery: "",
      searchDebounceTimer: null,

      csvImportDrawer: false,

      createDialog: false,
      createInitialData: null,

      editDialog: false,
      editTargetItem: null,

      deleteItemDialog: false,
      deleteItemName: "",

      deleteSupplierDialog: false,
      deleteSupplierTarget: null,
      deleteSupplierItemName: "",

      editSupplierDialog: false,
      editSupplierItem: null,
      editSupplierRowData: null,

      debugError: "",
      debugResult: null,

      tableHeaders: [
        { title: "", key: "expand", sortable: false, width: 44 },
        { title: "Image", key: "image", sortable: false, width: 80 },
        { title: "Item Name", key: "name" },
        { title: "Recipe Unit", key: "recipeUnit" },
        { title: "Purchase Unit Conversion", key: "purchaseUnitConversion" },
        { title: "Good Type", key: "goodType" },
        { title: "Category", key: "category" },
        { title: "Actions", key: "actions", sortable: false, align: "end", width: 140 },
      ],

      supplierHeaders: [
        { title: "Supplier", key: "supplierName" },
        { title: "Supplier Item", key: "supplierItemName" },
        { title: "Unit", key: "unit" },
        { title: "Units/Purchase", key: "unitsPerPurchase" },
        { title: "Price", key: "price" },
        { title: "Price/Unit", key: "pricePerUnit" },
        { title: "Recipe Unit Cost", key: "recipeUnitCost" },
        { title: "Packaging", key: "purchasePackaging" },
        { title: "Added", key: "addedAt" },
        { title: "Actions", key: "actions" },
      ],

    };
  },
  async mounted() {
    this.$store.dispatch('suppliers/fetchSuppliers');
    this.$store.dispatch('industrials/fetchIndustrials');
    this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes');
    this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories');
    this.$store.dispatch('spaces/fetchSpaces');
    // Préremplissage du filtre depuis l'URL (?type=&category=) — permet aux écrans de taxonomie
    // (suppression bloquée par des MarketPrice dépendants) de lier directement vers la liste déjà
    // filtrée, plutôt que de chercher la bonne ligne à la main.
    if (this.$route.query.type) this.selectedType = String(this.$route.query.type);
    if (this.$route.query.category) this.selectedCategory = String(this.$route.query.category);
    await this.loadMarketPrices();
    this.openFromQuery();
    window.addEventListener('theme-changed', this.handleThemeChange);
    window.addEventListener('locale-changed', this.handleLocaleChange);
    const resizeObserverErr = window.ResizeObserver;
    window.ResizeObserver = class ResizeObserver extends resizeObserverErr {
      constructor(callback) {
        callback = ((entries, observer) => {
          window.requestAnimationFrame(() => { callback(entries, observer); });
        });
        super(callback);
      }
    };
  },
  beforeUnmount() {
    window.removeEventListener('theme-changed', this.handleThemeChange);
    window.removeEventListener('locale-changed', this.handleLocaleChange);
    clearTimeout(this.searchDebounceTimer);
  },
  computed: {
    isDark() {
      return this.theme === 'dark' || this.theme === 'dataFridayDark';
    },
    suppliers() {
      return this.$store.getters['suppliers/suppliers'];
    },
    industrials() {
      return this.$store.getters['industrials/industrials'];
    },
    productTypes() {
      return this.$store.getters['marketPriceTypes/marketPriceTypes'];
    },
    productCategories() {
      return this.$store.getters['marketPriceCategories/marketPriceCategories'];
    },
    spaces() {
      return this.$store.getters['spaces/spaces'];
    },
    marketPriceRows() {
      return this.$store.getters['marketPrices/rows'];
    },
    items() {
      const rows = this.marketPriceRows;
      const supplierNameById = new Map((this.suppliers || []).map((s) => [s.id, s.name]));
      const industrialNameById = new Map((this.industrials || []).map((ind) => [ind.id, ind.name]));
      const map = new Map();

      for (const r of rows) {
        const itemName = String(r?.itemName || r?.name || '').trim();
        if (!itemName) continue;

        const id = r?.id || r?._id || itemName;
        const goodType = r?.goodType || '';
        const category = r?.category || '';
        const marketPriceTypeId = r?.marketPriceTypeId || '';
        const marketPriceCategoryId = r?.marketPriceCategoryId || '';
        const recipeUnit = r?.recipeUnit || '';
        const purchaseUnitConversion = r?.purchaseUnitConversion ?? '';
        const image = r?.image || '';
        const unit = r?.unit || '';
        const inventoryPackaging = r?.inventoryPackaging || '';
        const packedUnits = r?.packedUnits ?? 0;
        const numberOfUnits = r?.numberOfUnits ?? 0;
        const packingLength = r?.packingLength ?? 0;
        const packingWidth = r?.packingWidth ?? 0;
        const packingHeight = r?.packingHeight ?? 0;

        const supplierId = r?.supplierId || '';
        // supplierRel.name = relation API ; supplierNameById = lookup par FK ;
        // r.supplier = nom brut (lignes importées par CSV sans FK fournisseur).
        const supplierName =
          r?.supplierName ||
          r?.supplierRel?.name ||
          (supplierId ? supplierNameById.get(supplierId) : '') ||
          r?.supplier || '';

        const computedRecipeUnitCost = (() => {
          const ppu = Number(r?.pricePerUnit);
          const rawConv = Number(r?.purchaseUnitConversion);
          const conv = Number.isFinite(rawConv) && rawConv > 0 ? rawConv : 1;
          if (!Number.isFinite(ppu)) return null;
          const val = ppu * conv;
          return Number.isFinite(val) && val > 0 ? val : null;
        })();

        const supplierRow = {
          id,
          supplierId,
          supplierName,
          supplierItemName: r?.supplierItem || '',
          unit: r?.unit || '',
          unitsPerPurchase: r?.unitsPerPurchase ?? null,
          price: r?.price ?? null,
          pricePerUnit: r?.pricePerUnit ?? null,
          purchaseUnitConversion: r?.purchaseUnitConversion ?? null,
          recipeUnitCost:
            r?.recipeUnitCost ??
            r?.costPerRecipeUnit ??
            r?.cost_per_recipe_unit ??
            computedRecipeUnitCost,
          purchasePackaging: r?.purchasePackaging || '',
          addedAt: r?.createdAt || r?.updatedAt || '-',
          inventoryPackaging: r?.inventoryPackaging || '',
          packedUnits: r?.packedUnits ?? 0,
          numberOfUnits: r?.numberOfUnits ?? 0,
          packingLength: r?.packingLength ?? 0,
          packingWidth: r?.packingWidth ?? 0,
          packingHeight: r?.packingHeight ?? 0,
          industrialId: r?.industrialId || r?.industrial?.id || '',
          industrialName:
            r?.industrial?.name ||
            (r?.industrialId ? industrialNameById.get(r.industrialId) : '') || '',
        };

        if (!map.has(itemName)) {
          map.set(itemName, {
            id: itemName,
            name: itemName,
            suppliersCount: 0,
            recipeUnit,
            purchaseUnitConversion,
            goodType,
            category,
            marketPriceTypeId,
            marketPriceCategoryId,
            type: goodType,
            image,
            unit,
            inventoryPackaging,
            packedUnits,
            numberOfUnits,
            packingLength,
            packingWidth,
            packingHeight,
            supplierRows: [],
            supplierNames: [],
          });
        }

        const agg = map.get(itemName);
        agg.supplierRows.push(supplierRow);
        if (image && !agg.image) agg.image = image;
        if (goodType && !agg.goodType) agg.goodType = goodType;
        if (category && !agg.category) agg.category = category;
        if (marketPriceTypeId && !agg.marketPriceTypeId) agg.marketPriceTypeId = marketPriceTypeId;
        if (marketPriceCategoryId && !agg.marketPriceCategoryId) agg.marketPriceCategoryId = marketPriceCategoryId;
        if (recipeUnit && !agg.recipeUnit) agg.recipeUnit = recipeUnit;
        if (purchaseUnitConversion !== '' && agg.purchaseUnitConversion === '') {
          agg.purchaseUnitConversion = purchaseUnitConversion;
        }
        if (unit && !agg.unit) agg.unit = unit;
        if (inventoryPackaging && !agg.inventoryPackaging) agg.inventoryPackaging = inventoryPackaging;
        if (packedUnits && !agg.packedUnits) agg.packedUnits = packedUnits;
        if (numberOfUnits && !agg.numberOfUnits) agg.numberOfUnits = numberOfUnits;
        if (packingLength && !agg.packingLength) agg.packingLength = packingLength;
        if (packingWidth && !agg.packingWidth) agg.packingWidth = packingWidth;
        if (packingHeight && !agg.packingHeight) agg.packingHeight = packingHeight;
        if (supplierName) agg.supplierNames.push(supplierName);
      }

      return Array.from(map.values()).map((i) => {
        const uniqueSupplierNames = Array.from(new Set(i.supplierNames.filter(Boolean)));
        return {
          ...i,
          supplierNames: uniqueSupplierNames,
          suppliersCount: uniqueSupplierNames.length || (i.supplierRows || []).length,
        };
      }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    },
    goodTypeOptions() {
      const list = (this.productTypes || []).map((t) => t?.name).filter(Boolean);
      return Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b)));
    },
    productCategoryOptions() {
      const list = (this.productCategories || []).map((c) => c?.name).filter(Boolean);
      return Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b)));
    },
    typeOptions() {
      const list = (this.items || []).map((i) => i?.type).filter(Boolean);
      return ["All Types", ...Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b)))];
    },
    categoryOptions() {
      const list = (this.items || []).map((i) => i?.category).filter(Boolean);
      return [
        "All Categories",
        ...Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b))),
      ];
    },
    supplierOptions() {
      const list = (this.suppliers || []).map((s) => s?.name).filter(Boolean);
      return [
        "All Suppliers",
        ...Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b))),
      ];
    },
    spaceOptions() {
      const list = (this.spaces || []).map((s) => s?.name).filter(Boolean);
      return [
        "All Spaces",
        ...Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b))),
      ];
    },
    recipeUnitOptions() {
      const fromItems = (this.items || []).map((i) => i?.recipeUnit).filter(Boolean);
      const common = ["g", "kg", "ml", "l", "pcs"];
      return Array.from(new Set([...fromItems, ...common])).sort((a, b) => String(a).localeCompare(String(b)));
    },
    existingItemNames() {
      const names = (this.items || []).map((i) => i?.name).filter(Boolean);
      return Array.from(new Set(names)).sort((a, b) => String(a).localeCompare(String(b)));
    },
    totalSuppliers() {
      const supplierNames = new Set();
      (this.items || []).forEach(item => {
        if (Array.isArray(item.supplierNames)) {
          item.supplierNames.forEach(name => { if (name) supplierNames.add(name); });
        }
      });
      return supplierNames.size;
    },
    foodCount() {
      return (this.items || []).filter(i => i?.goodType === 'Food').length;
    },
    beverageCount() {
      return (this.items || []).filter(i => i?.goodType === 'Beverage').length;
    },
    filteredItems() {
      const q = (this.debouncedSearchQuery || "").trim().toLowerCase();
      let list = this.items;
      if (this.selectedType && this.selectedType !== "All Types") {
        list = list.filter((i) => i.type === this.selectedType);
      }
      if (this.selectedCategory && this.selectedCategory !== "All Categories") {
        list = list.filter((i) => i.category === this.selectedCategory);
      }
      if (this.selectedSupplier && this.selectedSupplier !== "All Suppliers") {
        list = list.filter((i) => (i.supplierNames || []).includes(this.selectedSupplier));
      }
      if (q) {
        list = list.filter((i) => {
          const hay = [i.name, i.goodType, i.category, i.recipeUnit]
            .filter(Boolean).join(" ").toLowerCase();
          return hay.includes(q);
        });
      }
      return list;
    },
  },
  watch: {
    searchQuery(value) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.debouncedSearchQuery = value;
      }, 150);
    },
  },
  methods: {
    handleThemeChange(event) { this.theme = event.detail?.theme || 'light'; },
    handleLocaleChange(event) { this.locale = event.detail?.locale || 'en'; },

    clearFilters() {
      clearTimeout(this.searchDebounceTimer);
      this.searchQuery = '';
      this.debouncedSearchQuery = '';
      this.selectedType = 'All Types';
      this.selectedCategory = 'All Categories';
      this.selectedSupplier = 'All Suppliers';
    },
    async ensureAuthToken() {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) setAccessToken(token);
      } catch (e) {
        // ignore
      }
    },
    async loadMarketPrices(forceRefresh = false) {
      this.marketPricesLoading = true;
      this.marketPricesError = "";
      try {
        await this.$store.dispatch('marketPrices/fetchRows', { forceRefresh });
      } catch (e) {
        this.marketPricesError = e?.response?.data?.message || e?.message || "Failed to load market prices";
      } finally {
        this.marketPricesLoading = false;
      }
    },
    /**
     * Deep-link depuis la carte Logistic (« Pack non configuré ») : ?openId=
     * ouvre directement la fiche « Edit Supplier Item » (Purchase/Inventory
     * Information, seul endroit où packedUnits est éditable) — PAS le drawer
     * « Modifier le nom de l'article » (onEditItem, rename only, sans ces champs).
     * ?search= (repli quand la denrée n'a aucun Market Price lié) pré-remplit
     * la recherche.
     */
    openFromQuery() {
      const openId = this.$route?.query?.openId;
      if (openId) {
        for (const item of this.items) {
          const row = (item.supplierRows || []).find((r) => r.id === openId);
          if (row) {
            this.onEditSupplierRow(item, row);
            return;
          }
        }
      }
      const search = this.$route?.query?.search;
      if (search) this.searchQuery = String(search);
    },
    unwrapItem(item) {
      return item && item.raw ? item.raw : item;
    },
    isExpanded(item) {
      const raw = this.unwrapItem(item);
      return this.expanded.includes(raw?.id);
    },
    toggleExpand(item) {
      const raw = this.unwrapItem(item);
      if (!raw || !raw.id) return;
      const idx = this.expanded.indexOf(raw.id);
      if (idx === -1) this.expanded = [...this.expanded, raw.id];
      else this.expanded = this.expanded.filter((x) => x !== raw.id);
    },
    onImportCsv() {
      this.csvImportDrawer = true;
    },
    onCreateItem() {
      this.createInitialData = null;
      if (!this.suppliers.length) this.$store.dispatch('suppliers/fetchSuppliers', { forceRefresh: true });
      this.createDialog = true;
    },
    onAddSupplier(item) {
      const raw = this.unwrapItem(item);
      this.createInitialData = raw;
      if (!this.suppliers.length) this.$store.dispatch('suppliers/fetchSuppliers', { forceRefresh: true });
      this.createDialog = true;
    },
    onEditItem(item) {
      this.editTargetItem = this.unwrapItem(item);
      this.editDialog = true;
    },
    onDeleteItem(item) {
      const raw = this.unwrapItem(item);
      this.deleteItemName = String(raw?.name || raw?.itemName || '').trim();
      this.deleteItemDialog = true;
    },
    onEditSupplierRow(item, row) {
      this.editSupplierItem = this.unwrapItem(item);
      this.editSupplierRowData = row;
      this.editSupplierDialog = true;
    },
    onDeleteSupplierRow(item, row) {
      const raw = this.unwrapItem(item);
      this.deleteSupplierTarget = row || null;
      this.deleteSupplierItemName = String(raw?.name || raw?.itemName || '').trim();
      this.deleteSupplierDialog = true;
    },
    onCreated() {
      this.loadMarketPrices(true);
    },
    onSaved() {
      this.loadMarketPrices(true);
    },
    onDeleted() {
      this.loadMarketPrices(true);
    },
    exportToCSV() {
      try {
        const csvData = [];
        // "Price (Package Total) (EUR)" = champ `price` brut (montant payé pour le
        // conditionnement d'achat) — PAS un prix par unité malgré l'ancien libellé "Price Per
        // Unit". `pricePerUnit` reste dérivé (price / Units Per Purchase), jamais réimporté en
        // direct, cf. `MarketPriceCsvImportDrawer.vue`.
        const headers = [
          'Item Name', 'Good Type', 'Category', 'Image URL',
          'Supplier Name', 'Supplier Item', 'Industrial',
          'Recipe Unit', 'Purchase Unit', 'Purchase Unit Conversion', 'Units Per Purchase',
          'Price (Package Total) (EUR)', 'Cost Per Recipe Unit (EUR)',
          'Purchased In (Packaging)', 'Stored In (Packaging)',
          'Packed Units', 'Number of Units',
          'Packing Length (cm)', 'Packing Width (cm)', 'Packing Height (cm)',
        ];
        csvData.push(headers);

        const escape = (val) => {
          const s = String(val ?? '');
          return (s.includes(',') || s.includes('"') || s.includes('\n'))
            ? '"' + s.replace(/"/g, '""') + '"'
            : s;
        };

        for (const item of this.items || []) {
          const itemName  = String(item?.name || item?.itemName || '');
          const goodType  = String(item?.goodType || item?.type || '');
          const category  = String(item?.category || '');
          const recipeUnit = String(item?.recipeUnit || '');
          const imageUrl  = String(item?.image || '');

          const rows = item?.supplierRows || [];
          if (rows.length > 0) {
            for (const sr of rows) {
              csvData.push([
                itemName,
                goodType,
                category,
                imageUrl,
                String(sr?.supplierName || ''),
                String(sr?.supplierItemName || ''),
                String(sr?.industrialName || ''),
                recipeUnit,
                String(sr?.unit || ''),
                String(sr?.purchaseUnitConversion ?? ''),
                String(sr?.unitsPerPurchase ?? ''),
                String(sr?.price ?? ''),
                String(sr?.recipeUnitCost ?? ''),
                String(sr?.purchasePackaging || ''),
                String(sr?.inventoryPackaging || ''),
                String(sr?.packedUnits ?? ''),
                String(sr?.numberOfUnits ?? ''),
                String(sr?.packingLength ?? ''),
                String(sr?.packingWidth ?? ''),
                String(sr?.packingHeight ?? ''),
              ]);
            }
          } else {
            csvData.push([itemName, goodType, category, imageUrl, '', '', '', recipeUnit, '', '', '', '', '', '', '', '', '', '', '', '']);
          }
        }

        const csvContent = '\uFEFF' + csvData.map(row => row.map(escape).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `market-prices-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Error exporting to CSV:', error);
        alert('Failed to export CSV. Please try again.');
      }
    },

    // Export « packé » : 1 ligne CSV = 1 Item, tous ses prix fournisseurs empilés dans une colonne
    // « Market Prices » (segments séparés par « | », sous-champs séparés par « > »). Réutilise le
    // même computed `items()` (déjà groupé par itemName) que exportToCSV() — permet le cycle
    // export → édition externe → réimport en upsert (MarketPriceCsvImportDrawer.vue lit `id`/
    // `supplierId` réels de cette base dans cet export, contrairement à un fichier legacy externe).
    exportToCSVPacked() {
      try {
        const csvData = [];
        const headers = [
          'Item ID', 'Item Name', 'Good Type', 'Ingredient Category',
          'Recipe Unit', 'Purchase Unit', 'Purchase Unit Conversion', 'Market Prices',
        ];
        csvData.push(headers);

        const escape = (val) => {
          const s = String(val ?? '');
          return (s.includes(',') || s.includes('"') || s.includes('\n'))
            ? '"' + s.replace(/"/g, '""') + '"'
            : s;
        };

        // Ordre des 16 sous-champs — doit rester identique à PACKED_SUBFIELD_ORDER dans
        // MarketPriceCsvImportDrawer.vue. La position "Inventory > Number of units" (11e) reflète
        // volontairement la même valeur que "Packing > Packed Units" (12e) : en base actuelle
        // c'est le même champ `packedUnits` (cf. MarketPriceEditSupplierDrawer.vue), pas deux
        // valeurs distinctes — pas de perte d'info réelle.
        const buildSegment = (item, sr) => [
          sr?.id || '',
          sr?.supplierItemName || '',
          sr?.supplierId || '',
          sr?.supplierName || '',
          item?.goodType || item?.type || '',
          sr?.purchasePackaging || '',
          sr?.unitsPerPurchase ?? '',
          sr?.unit || '',
          sr?.price ?? '',
          sr?.inventoryPackaging || '',
          sr?.packedUnits ?? '',
          sr?.packedUnits ?? '',
          sr?.numberOfUnits ?? '',
          sr?.packingLength ?? '',
          sr?.packingWidth ?? '',
          sr?.packingHeight ?? '',
        ].map((v) => String(v)).join('>');

        for (const item of this.items || []) {
          const itemName = String(item?.name || item?.itemName || '');
          const marketPrices = (item?.supplierRows || []).map((sr) => buildSegment(item, sr)).join('|');
          csvData.push([
            itemName,
            itemName,
            String(item?.goodType || item?.type || ''),
            String(item?.category || ''),
            String(item?.recipeUnit || ''),
            String(item?.unit || ''),
            String(item?.purchaseUnitConversion ?? ''),
            marketPrices,
          ]);
        }

        const csvContent = '\uFEFF' + csvData.map(row => row.map(escape).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `market-prices-by-item-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Error exporting packed CSV:', error);
        alert('Failed to export CSV. Please try again.');
      }
    },
  },
};
</script>

<style scoped>
/* ── Page ── */
#market-price-page {
  background: #f4f5f7;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.mpl--dark#market-price-page { background: #0f172a; }

/* ── Header ── */
.mpl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  flex-shrink: 0;
}
.mpl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}
.mpl-header__left { display: flex; align-items: center; gap: 14px; }
.mpl-header__icon {
  width: 44px; height: 44px;
  border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.mpl-header__title { font-size: 20px; font-weight: 800; color: #fff; margin: 0; line-height: 1.2; }
.mpl-header__subtitle { font-size: 12.5px; color: rgba(255,255,255,.72); margin: 3px 0 0; }
.mpl-header__right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.mpl-header__actions { display: flex; align-items: center; gap: 8px; }
.mpl-action-btn {
  display: inline-flex; align-items: center;
  padding: 7px 14px; border-radius: 100px;
  border: 1.5px solid rgba(255,255,255,.6);
  background: transparent; color: rgba(255,255,255,.9);
  font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.mpl-action-btn:hover { background: rgba(255,255,255,.15); border-color: #fff; }
.mpl-add-btn {
  display: inline-flex; align-items: center;
  padding: 9px 18px; border-radius: 100px;
  border: 2px solid rgba(255,255,255,.85);
  background: transparent; color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: all .2s; white-space: nowrap;
}
.mpl-add-btn:hover { background: #fff; color: #ff3131; }

/* ── Search bar ── */
.mpl-searchbar {
  background: #fff; border-bottom: 1px solid #e5e7eb;
  position: sticky; top: 81px; z-index: 99; flex-shrink: 0;
}
.mpl--dark .mpl-searchbar { background: #1e293b; border-bottom-color: rgba(255,255,255,.08); }
.mpl-searchbar__inner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 28px; flex-wrap: wrap;
}
.mpl-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.mpl-searchbar__input {
  flex: 1; min-width: 140px; border: none; outline: none;
  background: transparent; font-size: 14px; color: #111827;
}
.mpl--dark .mpl-searchbar__input { color: #e5e7eb; }
.mpl-searchbar__input::placeholder { color: #9ca3af; }
.mpl-filter-pills { display: flex; gap: 8px; flex-wrap: wrap; }
.mpl-filter-select {
  appearance: none; border: 1.5px solid #e5e7eb;
  border-radius: 100px; padding: 5px 12px;
  font-size: 12.5px; font-weight: 500; color: #374151;
  background: #f9fafb; cursor: pointer; outline: none;
  transition: border-color .18s;
}
.mpl-filter-select:focus { border-color: #ff3131; }
.mpl--dark .mpl-filter-select { background: #0f172a; border-color: rgba(255,255,255,.12); color: #e5e7eb; }
.mpl-searchbar__count { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.mpl-searchbar__clear {
  background: none; border: none; padding: 2px;
  cursor: pointer; color: #9ca3af;
  display: flex; align-items: center; border-radius: 4px;
}
.mpl-searchbar__clear:hover { color: #ff3131; }

/* ── Content ── */
.mpl-content { padding: 24px 28px; flex: 1; }
.mpl-loader { margin-bottom: 16px; }
.mpl-alert {
  display: flex; align-items: center;
  padding: 10px 14px;
  background: #fef2f2; border: 1px solid #fecaca;
  border-radius: 10px; font-size: 13px; color: #ff3131;
  margin-bottom: 16px;
}

/* ── Table view ── */
.mpl-table-wrap {
  background: #fff; border-radius: 16px;
  border: 1px solid #e5e7eb; overflow: hidden;
}
.mpl--dark .mpl-table-wrap { background: #1e293b; border-color: rgba(255,255,255,.08); }

</style>
