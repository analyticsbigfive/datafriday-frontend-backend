<template>
  <div class="mpip" :class="{ 'mpip--dark': isDark }">
    <div v-if="loading" class="mpip__state">{{ txt('loading') }}</div>
    <div v-else-if="error" class="mpip__state mpip__state--error">{{ error }}</div>

    <template v-else>
      <MarketPriceTable
        v-if="items.length"
        :is-dark="isDark"
        :headers="tableHeaders"
        :items="items"
        :expanded="expanded"
        :supplier-headers="supplierHeaders"
        :selectable="false"
        hide-footer
        @update:expanded="expanded = $event"
        @toggle-expand="toggleExpand"
        @add-supplier="onAddSupplier"
        @edit-item="onEditItem"
        @delete-item="onDeleteItem"
        @edit-supplier-row="onEditSupplierRow"
        @delete-supplier-row="onDeleteSupplierRow"
      />
      <div v-else class="mpip__state">
        <p class="mb-3">{{ txt('empty') }}</p>
        <v-btn color="#ff3131" variant="flat" size="small" @click="onAddFirst">{{ txt('addPrice') }}</v-btn>
      </div>
    </template>

    <MarketPriceCreateDrawer v-model="createDialog" :initial-data="createInitialData" :existing-item-names="existingItemNames" :suppliers="suppliers" :good-type-options="goodTypeOptions" :product-categories="productCategories" :is-dark="isDark" @created="onChanged" />
    <MarketPriceEditDrawer v-model="editDialog" :initial-item="editTargetItem" :good-type-options="goodTypeOptions" :product-category-options="productCategoryOptions" :product-categories="productCategories" :recipe-unit-options="recipeUnitOptions" :is-dark="isDark" @saved="onChanged" />
    <MarketPriceDeleteItemDialog v-model="deleteItemDialog" :item-name="deleteItemName" :is-dark="isDark" @deleted="onChanged" />
    <MarketPriceDeleteSupplierDialog v-model="deleteSupplierDialog" :target-row="deleteSupplierTarget" :item-name="deleteSupplierItemName" :is-dark="isDark" @deleted="onChanged" />
    <MarketPriceEditSupplierDrawer v-model="editSupplierDialog" :item="editSupplierItem" :row="editSupplierRowData" :suppliers="suppliers" :good-type-options="goodTypeOptions" :product-categories="productCategories" :is-dark="isDark" @saved="onChanged" />
  </div>
</template>

<script>
import MarketPriceTable from './MarketPriceTable.vue';
import MarketPriceCreateDrawer from '../drawers/MarketPriceCreateDrawer.vue';
import MarketPriceEditDrawer from '../drawers/MarketPriceEditDrawer.vue';
import MarketPriceEditSupplierDrawer from '../drawers/MarketPriceEditSupplierDrawer.vue';
import MarketPriceDeleteItemDialog from '../dialogs/MarketPriceDeleteItemDialog.vue';
import MarketPriceDeleteSupplierDialog from '../dialogs/MarketPriceDeleteSupplierDialog.vue';
import { groupMarketPriceRows, MARKET_PRICE_TABLE_HEADERS, MARKET_PRICE_SUPPLIER_HEADERS } from '../utils/groupMarketPriceRows';

const TEXTS = {
  en: {
    loading: 'Loading market prices...',
    empty: 'No market price for this item yet.',
    addPrice: 'Add a market price',
    loadError: 'Failed to load market prices',
  },
  fr: {
    loading: 'Chargement des prix du marché...',
    empty: "Aucun prix du marché pour cet article pour l'instant.",
    addPrice: 'Ajouter un prix du marché',
    loadError: 'Échec du chargement des prix du marché',
  },
};

/**
 * Bloc « Prix du marché » d'un article, identique à la Market Price List mais limité à UN article
 * (celui d'un ingrédient de recette) : lignes par fournisseur, modification, suppression et ajout
 * d'un nouveau prix. Émet `changed` après chaque écriture pour que la fiche recette rafraîchisse
 * ses coûts (le backend a déjà répercuté le prix sur les recettes).
 */
export default {
  name: 'MarketPriceItemPanel',
  components: {
    MarketPriceTable,
    MarketPriceCreateDrawer,
    MarketPriceEditDrawer,
    MarketPriceEditSupplierDrawer,
    MarketPriceDeleteItemDialog,
    MarketPriceDeleteSupplierDialog,
  },
  props: {
    itemName: { type: String, required: true },
    isDark: { type: Boolean, default: false },
  },
  emits: ['changed'],
  data() {
    return {
      locale: localStorage.getItem('appLocale') || 'en',
      loading: true,
      error: '',
      expanded: [],
      tableHeaders: MARKET_PRICE_TABLE_HEADERS,
      supplierHeaders: MARKET_PRICE_SUPPLIER_HEADERS,
      createDialog: false,
      createInitialData: null,
      editDialog: false,
      editTargetItem: null,
      deleteItemDialog: false,
      deleteItemName: '',
      deleteSupplierDialog: false,
      deleteSupplierTarget: null,
      deleteSupplierItemName: '',
      editSupplierDialog: false,
      editSupplierItem: null,
      editSupplierRowData: null,
    };
  },
  computed: {
    suppliers() { return this.$store.getters['suppliers/suppliers']; },
    industrials() { return this.$store.getters['industrials/industrials']; },
    productTypes() { return this.$store.getters['marketPriceTypes/marketPriceTypes']; },
    productCategories() { return this.$store.getters['marketPriceCategories/marketPriceCategories']; },
    rows() {
      const wanted = String(this.itemName || '').trim().toLowerCase();
      if (!wanted) return [];
      return (this.$store.getters['marketPrices/rows'] || []).filter(
        (r) => String(r?.itemName || r?.name || '').trim().toLowerCase() === wanted,
      );
    },
    items() {
      return groupMarketPriceRows(this.rows, { suppliers: this.suppliers, industrials: this.industrials });
    },
    existingItemNames() {
      return [String(this.itemName || '').trim()].filter(Boolean);
    },
    goodTypeOptions() {
      const list = (this.productTypes || []).map((t) => t?.name).filter(Boolean);
      return Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b)));
    },
    productCategoryOptions() {
      const list = (this.productCategories || []).map((c) => c?.name).filter(Boolean);
      return Array.from(new Set(list)).sort((a, b) => String(a).localeCompare(String(b)));
    },
    recipeUnitOptions() {
      const fromItems = (this.items || []).map((i) => i?.recipeUnit).filter(Boolean);
      return Array.from(new Set([...fromItems, 'g', 'kg', 'ml', 'l', 'pcs'])).sort((a, b) => String(a).localeCompare(String(b)));
    },
  },
  watch: {
    itemName() { this.syncExpanded(); },
    items() { this.syncExpanded(); },
  },
  async mounted() {
    this.$store.dispatch('suppliers/fetchSuppliers');
    this.$store.dispatch('industrials/fetchIndustrials');
    this.$store.dispatch('marketPriceTypes/fetchMarketPriceTypes');
    this.$store.dispatch('marketPriceCategories/fetchMarketPriceCategories');
    await this.load(false);
  },
  methods: {
    txt(key) {
      return (TEXTS[this.locale] || TEXTS.en)[key];
    },
    syncExpanded() {
      // Le détail par fournisseur est ouvert d'emblée : c'est ce que l'utilisateur vient voir.
      const id = this.items[0]?.id;
      if (id && !this.expanded.includes(id)) this.expanded = [id];
    },
    async load(forceRefresh) {
      this.loading = !this.rows.length || forceRefresh;
      this.error = '';
      try {
        await this.$store.dispatch('marketPrices/fetchRows', { forceRefresh });
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.txt('loadError');
      } finally {
        this.loading = false;
      }
    },
    unwrapItem(item) {
      return item && item.raw ? item.raw : item;
    },
    toggleExpand(item) {
      const raw = this.unwrapItem(item);
      if (!raw?.id) return;
      this.expanded = this.expanded.includes(raw.id)
        ? this.expanded.filter((x) => x !== raw.id)
        : [...this.expanded, raw.id];
    },
    ensureSuppliers() {
      if (!this.suppliers.length) this.$store.dispatch('suppliers/fetchSuppliers', { forceRefresh: true });
    },
    onAddFirst() {
      this.createInitialData = { id: this.itemName, name: this.itemName, itemName: this.itemName, supplierRows: [] };
      this.ensureSuppliers();
      this.createDialog = true;
    },
    onAddSupplier(item) {
      this.createInitialData = this.unwrapItem(item);
      this.ensureSuppliers();
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
    async onChanged() {
      this.$store.dispatch('marketPriceIngredients/invalidate');
      await this.load(true);
      this.$emit('changed');
    },
  },
};
</script>

<style scoped>
.mpip__state {
  padding: 32px 16px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
}
.mpip__state--error { color: #dc2626; }
.mpip--dark .mpip__state { color: #94a3b8; }
</style>
