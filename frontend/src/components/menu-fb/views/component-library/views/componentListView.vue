
<template>
  <div id="component-library-page" :class="{ 'cl--dark': isDark }">
    <!-- ── Header ── -->
    <div class="cl-header cl-header--sticky">
      <div class="cl-header__inner">
        <div class="cl-header__left">
          <div class="cl-header__icon">
            <Boxes :size="22" color="white" />
          </div>
          <div>
            <h1 class="cl-header__title">{{ t('compListTitle') }}</h1>
            <p class="cl-header__subtitle">{{ t('compListSubtitle') }}</p>
          </div>
        </div>
        <div class="cl-header__right">
          <div class="cl-header__actions">
            <button class="cl-action-hbtn" @click="onExportCsv">
              <Download :size="15" /> {{ t('compListExportCsv') }}
            </button>
            <button class="cl-action-hbtn" @click="onExportCsvPacked">
              <Download :size="15" /> {{ t('compListExportCsvPacked') }}
            </button>
            <button class="cl-action-hbtn" @click="importDrawer = true">
              <Upload :size="15" /> {{ t('compListImportCsv') }}
            </button>
            <button class="cl-add-btn" @click="onAddComponent">
              <Plus :size="17" /> {{ t('compListAddComponent') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Search bar ── -->
    <div class="cl-searchbar cl-searchbar--sticky">
      <div class="cl-searchbar__inner">
        <Search :size="17" class="cl-searchbar__icon" />
        <input v-model="searchQuery" class="cl-searchbar__input" type="search" :placeholder="t('compListSearchPlaceholder')" />
        <div class="cl-filter-pills">
          <v-select
            v-model="selectedCategory"
            :items="categoryOptions"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="compact"
            hide-details
            class="cl-filter-sel"
          />
          <v-select
            v-model="selectedType"
            :items="typeOptions"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="compact"
            hide-details
            class="cl-filter-sel"
          />
        </div>
        <span class="cl-searchbar__count">{{ filteredComponents.length }} composants</span>
      </div>
    </div>

    <div class="cl-content">

      <!-- Loading -->
      <v-progress-linear
        v-if="loading"
        indeterminate
        color="#ff3131"
        height="3"
        rounded
        class="mb-4"
      />

      <!-- Error -->
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        density="compact"
        rounded="lg"
        class="mb-4"
      >
        {{ error }}
      </v-alert>

      <!-- Empty State -->
      <div v-if="!loading && !error && filteredComponents.length === 0" class="empty-state">
        <v-icon icon="mdi-package-variant-closed" size="72" color="#d1d5db" class="mb-4" />
        <h3 class="text-h6 font-weight-bold mb-2 text-medium-emphasis">{{ t('compListNoComponentsFound') }}</h3>
        <p class="text-body-2 text-medium-emphasis mb-4">
          {{ searchQuery || selectedCategory !== null || selectedType !== null ? t('compListTryAdjusting') : t('compListNoComponentsMessage') }}
        </p>
        <v-btn
          v-if="!searchQuery && selectedCategory === null && selectedType === null"
          color="#ff3131"
          rounded="lg"
          variant="flat"
          class="text-white text-none"
          @click="onAddComponent"
        >
          <Plus :size="18" class="mr-2" />
          {{ t('compListAddComponent') }}
        </v-btn>
      </div>

      <!-- Table Section -->
      <template v-else-if="!loading">
        <!-- Bulk delete bar -->
        <div v-if="bulkSelected.length" class="bulk-bar">
          <span class="bulk-bar__info">{{ bulkSelected.length }} {{ t('bulkSelected') }}</span>
          <div class="bulk-bar__actions">
            <button type="button" class="bulk-bar__clear" @click="bulkSelected = []">{{ t('bulkDeselect') }}</button>
            <button type="button" class="bulk-bar__del" @click="openBulkDelete"><Trash2 :size="15" /> {{ t('delete') }}</button>
          </div>
        </div>

        <div class="table-card">
        <v-data-table
          v-model="bulkSelected"
          show-select
          :headers="tableHeaders"
          :items="filteredComponents"
          item-value="id"
          density="compact"
          class="cl-table"
          hover
        >
          <template #item.name="{ item }">
            <div class="cl-row-name">
              <span class="cl-row-name__dot"></span>
              <span class="cl-row-name__text">{{ (item?.raw ? item.raw.name : item.name) || '-' }}</span>
            </div>
          </template>

          <template #item.category="{ item }">
            <span class="cl-badge cl-badge--category">
              {{ (item?.raw ? item.raw.category : item.category) || "-" }}
            </span>
          </template>

          <template #item.type="{ item }">
            <span class="cl-badge cl-badge--type">
              {{ (item?.raw ? item.raw.type : item.type) || "-" }}
            </span>
          </template>

          <template #item.updatedAt="{ item }">
            <span class="cl-date">{{ formatDate(item?.raw ? item.raw.updatedAt : item.updatedAt) }}</span>
          </template>

          <template #item.unitCost="{ item }">
            <span class="cl-cost">{{ formatCurrency(item?.raw ? item.raw.unitCost : item.unitCost) }}</span>
          </template>

          <template #item.subItems="{ item }">
            <button class="cl-subitems-btn" @click.stop="onViewSubComponents(item?.raw || item)" type="button">
              <Boxes :size="13" />
              {{ (item?.raw ? item.raw.subItemsCount : item.subItemsCount) || 0 }} {{ t('compListItems') }}
            </button>
          </template>

          <template #item.actions="{ item }">
            <div class="cl-actions">
              <button class="cl-act-btn cl-act-btn--edit" type="button" @click.stop="onEditComponent(item?.raw || item)">
                <Pencil :size="14" />
              </button>
              <button class="cl-act-btn cl-act-btn--delete" type="button" @click.stop="onDeleteComponent(item?.raw || item)">
                <Trash2 :size="14" />
              </button>
            </div>
          </template>
        </v-data-table>
        </div>
      </template>
    </div>

    <ComponentDeleteDialog
      v-model="deleteDialog"
      :is-dark="isDark"
      :title="t('compListDeleteTitle')"
      :subtitle="t('compListDeleteSubtitle')"
      :message="t('compListDeleteConfirm')"
      :item-name="deleteTarget?.name || t('compListDeleteThisComponent')"
      :loading="deleteLoading"
      :error="deleteError"
      :cancel-label="t('cancel')"
      :confirm-label="t('delete')"
      @confirm="confirmDelete"
    />

    <BulkDeleteDialog
      v-model="bulkOpen"
      :title="t('bulkDeleteTitle')"
      :message="`${t('bulkDeletePrefix')} ${bulkSelected.length} ${t('bulkItems')} ?`"
      :progress="bulkProgress"
      :total="bulkTotal"
      :progress-label="t('bulkDeleted')"
      :confirm-label="t('delete')"
      :cancel-label="t('cancel')"
      :deleting-label="t('bulkDeleting')"
      :loading="bulkLoading"
      :error="bulkError"
      :is-dark="isDark"
      @confirm="confirmBulkDelete"
    />

    <ComponentCsvImportDrawer
      v-model="importDrawer"
      :is-dark="isDark"
      @imported="loadComponents(true)"
    />

    <!-- Sub-Items Drawer -->
    <v-navigation-drawer
      v-model="subItemsDrawer"
      location="right"
      temporary
      width="700"
      class="sub-items-drawer"
    >
      <div class="cl-drawer-header">
        <div class="cl-drawer-header__icon">
          <Boxes :size="20" color="white" />
        </div>
        <div class="cl-drawer-header__text">
          <div class="cl-drawer-header__title">{{ subItemsComponent?.name || t('compListSubItemsTitle') }}</div>
          <div class="cl-drawer-header__sub">{{ t('compListSubItemsSubtitle') }}</div>
        </div>
        <button class="cl-drawer-close" type="button" @click="closeSubItemsDrawer">
          <X :size="16" />
        </button>
      </div>

      <div class="drawer-body">
        <v-alert v-if="subItemsError" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">
          {{ subItemsError }}
        </v-alert>
        <div v-if="subItemsLoading" class="d-flex justify-center align-center py-12">
          <v-progress-circular indeterminate color="#ff3131" size="48" />
        </div>
        <div v-else class="sub-items-card">
          <v-data-table
            :headers="subItemsHeaders"
            :items="subItemsData"
            item-value="id"
            density="comfortable"
            class="cl-sub-table"
          >
            <template #item.itemName="{ item }">
              <div class="cl-row-name">
                <span class="cl-row-name__dot" :style="{ background: item.itemType === 'Ingredient' ? '#10b981' : '#3b82f6' }"></span>
                <span class="cl-row-name__text">{{ item.itemName || '-' }}</span>
              </div>
            </template>
            <template #item.itemType="{ item }">
              <span class="cl-badge" :class="item.itemType === 'Ingredient' ? 'cl-badge--ingredient' : 'cl-badge--component'">
                {{ item.itemType }}
              </span>
            </template>
            <template #item.category="{ item }">
              <span class="cl-badge cl-badge--category">{{ item.category || "-" }}</span>
            </template>
            <template #item.cost="{ item }">
              <span class="cl-cost">{{ formatCurrency(item.cost) }}</span>
            </template>
          </v-data-table>
        </div>
      </div>

      <div class="drawer-footer">
        <button class="cl-drawer-foot-btn" type="button" @click="closeSubItemsDrawer">
          {{ t('close') }}
        </button>
      </div>
    </v-navigation-drawer>
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { Boxes, Download, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-vue-next";
import { useI18n } from '@/i18n/useI18n';
import { deleteMenuComponent } from "@/api/endpoints/menu.api";
import { getIngredient } from "@/api/endpoints/ingredient.api";
import ComponentDeleteDialog from '../dialogs/ComponentDeleteDialog.vue';
import ComponentCsvImportDrawer from '../drawers/ComponentCsvImportDrawer.vue';
import BulkDeleteDialog from '@/components/common/BulkDeleteDialog.vue';

export default {
  name: "ComponentListView",
  components: {
    Boxes,
    Download,
    Pencil,
    Plus,
    Search,
    Trash2,
    Upload,
    X,
    ComponentDeleteDialog,
    ComponentCsvImportDrawer,
    BulkDeleteDialog,
  },
  setup() {
    const { t, locale } = useI18n();
    const theme = useTheme();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, locale, isDark };
  },
  data() {
    return {
      searchQuery: "",
      selectedCategory: null,
      selectedType: null,

      loading: false,
      error: "",

      importDrawer: false,

      deleteDialog: false,
      deleteTarget: null,
      deleteLoading: false,
      deleteError: "",

      bulkSelected: [],
      bulkOpen: false,
      bulkLoading: false,
      bulkError: "",
      bulkProgress: 0,
      bulkTotal: 0,

      subItemsDrawer: false,
      subItemsComponent: null,
      subItemsLoading: false,
      subItemsError: "",
      subItemsData: [],
    };
  },
  computed: {
    // Données depuis le store (avec cache TTL)
    rawCategoryOptions() {
      return this.$store.getters['componentCategories/componentCategories']
        .map(c => String(c?.name ?? '').trim()).filter(Boolean)
    },
    rawTypeOptions() {
      return this.$store.getters['componentTypes/componentTypes']
        .map(t => String(t?.name ?? '').trim()).filter(Boolean)
    },
    componentsList() {
      return this.$store.getters['menuComponents/rows']
        .map(c => this.normalizeComponent(c))
        .filter(c => !!c.id)
    },
    categoryOptions() {
      return [
        { value: null, title: this.t('compListAllCategories') },
        ...this.rawCategoryOptions.map(c => ({ value: c, title: c })),
      ];
    },
    typeOptions() {
      return [
        { value: null, title: this.t('compListAllTypes') },
        ...this.rawTypeOptions.map(tp => ({ value: tp, title: tp })),
      ];
    },
    tableHeaders() {
      return [
        { title: this.t('compListColName'), key: 'name' },
        { title: this.t('compListColCategory'), key: 'category' },
        { title: this.t('compListColType'), key: 'type' },
        { title: this.t('compListColUnit'), key: 'unit' },
        { title: this.t('compListColUnitsRecipe'), key: 'unitsPerRecipe' },
        { title: this.t('compListColLastModified'), key: 'updatedAt' },
        { title: this.t('compListColUnitCost'), key: 'unitCost' },
        { title: this.t('compListColSubItems'), key: 'subItems' },
        { title: this.t('compListColActions'), key: 'actions', sortable: false, align: 'end', width: 120 },
      ];
    },
    subItemsHeaders() {
      return [
        { title: this.t('compListSubColItemName'), key: 'itemName' },
        { title: this.t('compListSubColType'), key: 'itemType' },
        { title: this.t('compListSubColCategory'), key: 'category' },
        { title: this.t('compListSubColUnits'), key: 'numberOfUnits' },
        { title: this.t('compListSubColUnit'), key: 'unit' },
        { title: this.t('compListSubColCost'), key: 'cost' },
      ];
    },
    filteredComponents() {
      const q = (this.searchQuery || "").trim().toLowerCase();
      let list = this.componentsList;

      if (this.selectedCategory !== null) {
        list = list.filter((c) => c.category === this.selectedCategory);
      }

      if (this.selectedType !== null) {
        list = list.filter((c) => c.type === this.selectedType);
      }

      if (q) {
        list = list.filter((c) => (c.name || "").toLowerCase().includes(q));
      }

      return list;
    },
  },
  methods: {
    normalizeComponent(raw) {
      const id = raw?.id ?? raw?._id ?? raw?.uuid ?? "";
      const name = raw?.name ?? raw?.componentName ?? raw?.title ?? "";
      const category = raw?.category ?? raw?.goodType ?? raw?.typeCategory ?? "";
      const type = raw?.componentCategory ?? raw?.type ?? raw?.componentType ?? raw?.subType ?? "";
      const unit = raw?.unit ?? raw?.recipeUnit ?? raw?.baseUnit ?? "";
      const unitsPerRecipe = raw?.unitsPerRecipe ?? raw?.numberOfUnitsRecipe ?? raw?.numberOfUnits ?? raw?.yield ?? 0;
      const storageType = raw?.storageType ?? raw?.storage ?? "";
      const unitCost = raw?.unitCost ?? raw?.costPerUnit ?? raw?.cost ?? 0;
      const description = raw?.description ?? "";

      // Calculer le nombre total d'items (ingredients + children)
      const ingredientsCount = Array.isArray(raw?.ingredients) ? raw.ingredients.length : 0;
      const childrenCount = Array.isArray(raw?.children) ? raw.children.length : 0;
      const calculatedCount = ingredientsCount + childrenCount;

      let subItemsCount = raw?.subItemsCount ?? raw?.sub_items_count ?? raw?.itemsCount ?? null;
      if (subItemsCount === null || subItemsCount === undefined) {
        subItemsCount = calculatedCount > 0 ? calculatedCount : (raw?.items?.length ?? raw?.subItems?.length ?? 0);
      }

      return {
        id: String(id),
        name: String(name || ""),
        category: String(category || ""),
        type: String(type || ""),
        unit: String(unit || ""),
        unitsPerRecipe: Number(unitsPerRecipe) || 0,
        storageType: String(storageType || ""),
        updatedAt: raw?.updatedAt ?? raw?.updated_at ?? raw?.modifiedAt ?? null,
        unitCost: Number(unitCost) || 0,
        subItemsCount: Number(subItemsCount) || 0,
        description: String(description || ""),
        _raw: raw,
      };
    },

    async loadComponents(forceRefresh = false) {
      this.loading = true;
      this.error = "";
      try {
        await this.$store.dispatch('menuComponents/fetchComponents', { forceRefresh });
      } catch (e) {
        this.error = e?.userMessage || e?.message || "Failed to load components";
      } finally {
        this.loading = false;
      }
    },

    formatCurrency(value) {
      if (value === null || value === undefined || value === "") return "-";
      if (typeof value !== "number") return String(value);
      return value.toLocaleString("fr-FR", {
        style: "currency",
        currency: "EUR",
      });
    },
    formatDate(value) {
      if (!value) return "-";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return "-";
      return d.toLocaleDateString(this.locale === 'fr' ? 'fr-FR' : 'en-US', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    },
    onExportCsv() {
      try {
        // Préparer les données pour l'export CSV
        const csvData = [];

        // Headers
        const headers = [
          'Name',
          'Category',
          'Type',
          'Unit',
          'Unit Cost (€)',
          'Number of Units Recipe',
          'Storage Type',
          'Description',
        ];
        csvData.push(headers);

        // Data rows
        for (const component of this.componentsList || []) {
          const row = [
            String(component?.name || ''),
            String(component?.category || ''),
            String(component?.type || ''),
            String(component?.unit || ''),
            String(component?.unitCost || ''),
            String(component?.unitsPerRecipe || ''),
            String(component?.storageType || ''),
            String(component?.description || ''),
          ];
          csvData.push(row);
        }

        // Convertir en CSV string
        const csvContent = csvData.map(row =>
          row.map(cell => {
            // Échapper les guillemets et entourer de guillemets si nécessaire
            const cellStr = String(cell || '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
              return '"' + cellStr.replace(/"/g, '""') + '"';
            }
            return cellStr;
          }).join(',')
        ).join('\n');

        // Créer un blob et télécharger
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `components-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        console.error('Error exporting to CSV:', error);
        alert('Failed to export CSV. Please try again.');
      }
    },
    // Export "par recette" — coexiste avec onExportCsv() (format plat, inchangé). Encode
    // ingredients[]/children[] dans la colonne Recipe avec les VRAIS cuids de cette base (pas les
    // anciens ids legacy) : permet un cycle export → édition → réimport en upsert sans avoir
    // besoin du fichier compagnon Market Prices (uniquement nécessaire pour un tout premier
    // import d'un fichier historique). Même format packé que ComponentCsvImportDrawer.vue attend.
    onExportCsvPacked() {
      try {
        const headers = [
          'Component ID', 'Component Name', 'Category', 'Component Type', 'Unit',
          'Number of Units per Recipe', 'Packaging Type', 'Number of units', 'Storage Type',
          'Description', 'Recipe',
        ];
        const csvData = [headers];

        for (const component of this.componentsList || []) {
          const raw = component._raw || {};
          const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
          const children = Array.isArray(raw.children) ? raw.children : [];
          const segments = [];
          let seq = 0;
          for (const ing of ingredients) {
            const ingredientId = ing?.ingredientId || ing?.ingredient?.id;
            const qty = Number(ing?.quantity);
            if (ingredientId && qty > 0) segments.push(`${++seq}>Ingredient>>${ingredientId}>${qty}`);
          }
          for (const child of children) {
            const childId = child?.childId || child?.child?.id;
            const qty = Number(child?.quantity);
            if (childId && qty > 0) segments.push(`${++seq}>Component>${childId}>${qty}`);
          }
          const row = [
            String(component?.id || ''),
            String(component?.name || ''),
            String(component?.category || ''),
            String(component?.type || ''),
            String(component?.unit || ''),
            String(component?.unitsPerRecipe || ''),
            String(raw?.inventoryPackaging || ''),
            String(raw?.packedUnits ?? ''),
            String(component?.storageType || ''),
            String(component?.description || ''),
            segments.join('|'),
          ];
          csvData.push(row);
        }

        const csvContent = csvData.map(row =>
          row.map(cell => {
            const cellStr = String(cell || '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
              return '"' + cellStr.replace(/"/g, '""') + '"';
            }
            return cellStr;
          }).join(',')
        ).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `components-recipe-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        console.error('Error exporting packed CSV:', error);
        alert('Failed to export CSV. Please try again.');
      }
    },
    onAddComponent() {
      this.$router.push({ path: "/menu-fb/components/new" });
    },
    async onViewSubComponents(component) {
      const c = component?._raw || component?.raw || component;
      this.subItemsComponent = c;
      this.subItemsDrawer = true;
      await this.loadSubItemsData();
    },

    closeSubItemsDrawer() {
      this.subItemsDrawer = false;
      this.subItemsComponent = null;
      this.subItemsData = [];
      this.subItemsError = "";
    },

    async loadSubItemsData() {
      if (!this.subItemsComponent) return;

      this.subItemsLoading = true;
      this.subItemsError = "";
      this.subItemsData = [];

      try {
        const ingredients = Array.isArray(this.subItemsComponent.ingredients)
          ? this.subItemsComponent.ingredients
          : [];
        const children = Array.isArray(this.subItemsComponent.children)
          ? this.subItemsComponent.children
          : [];

        // Récupérer les détails complets des ingrédients via l'API
        const ingredientPromises = ingredients.map(async (ing, idx) => {
          const ingredientId = ing.ingredientId || ing.ingredient_id || ing.id;

          if (ingredientId) {
            try {

              const ingredientDetails = await getIngredient(ingredientId);
              return {
                id: `ing-${idx}-${ingredientId}`,
                itemName: ingredientDetails?.marketPrice?.supplierItem || ing.itemName || ing.ingredientName || "-",
                itemType: "Ingredient",
                category: ingredientDetails?.category || ing.category || "-",
                numberOfUnits: Number(ing.quantity || ing.numberOfUnits || 0).toFixed(3),
                unit: ing.unit || ing.recipeUnit || ingredientDetails?.unit || "-",
                cost: Number(ing.cost || ing.totalCost || 0),
                _details: ingredientDetails,
              };
            } catch (error) {
              console.error(`Error fetching ingredient ${ingredientId}:`, error);
              // Fallback sur les données existantes si l'API échoue
              return {
                id: `ing-${idx}-${ingredientId}`,
                itemName: ing.itemName || ing.ingredientName || ing.name || "-",
                itemType: "Ingredient",
                category: ing.category || "-",
                numberOfUnits: Number(ing.quantity || ing.numberOfUnits || 0).toFixed(3),
                unit: ing.unit || ing.recipeUnit || "-",
                cost: Number(ing.cost || ing.totalCost || 0),
              };
            }
          } else {
            // Pas d'ID, utiliser les données existantes
            return {
              id: `ing-${idx}-${ing.marketPriceId || idx}`,
              itemName: ing.itemName || ing.ingredientName || ing.name || "-",
              itemType: "Ingredient",
              category: ing.category || "-",
              numberOfUnits: Number(ing.quantity || ing.numberOfUnits || 0).toFixed(3),
              unit: ing.unit || ing.recipeUnit || "-",
              cost: Number(ing.cost || ing.totalCost || 0),
            };
          }
        });

        const allComponents = this.$store.getters['menuComponents/rows'] || [];
        const componentById = Object.fromEntries(allComponents.map(c => [c.id ?? c._id, c]));

        const childrenRows = children.map((child, idx) => {
          const refId = child.childId || child.componentId || child.id || '';
          const ref = componentById[refId] || {};
          return {
            id: `child-${idx}-${refId || idx}`,
            itemName: child.itemName || child.name || ref.name || refId || "-",
            itemType: "Component",
            category: child.category || ref.category || "-",
            numberOfUnits: Number(child.quantity ?? child.numberOfUnits ?? 0).toFixed(3),
            unit: child.unit || ref.unit || "-",
            cost: Number(child.totalCost || child.cost || 0),
          };
        });

        // Attendre que tous les ingrédients soient chargés
        const ingredientRows = await Promise.all(ingredientPromises);

        this.subItemsData = [...ingredientRows, ...childrenRows];
      } catch (error) {
        console.error('Error loading sub-items:', error);
        this.subItemsError = error?.userMessage || error?.message || "Failed to load sub-items";
      } finally {
        this.subItemsLoading = false;
      }
    },
    onEditComponent(component) {
      const c = component?._raw || component?.raw || component;
      const id = c?.id ?? c?._id ?? c?.uuid;
      if (id) {
        this.$router.push({ path: `/menu-fb/components/edit/${id}` });
      }
    },
    onDeleteComponent(component) {
      const c = component?._raw || component?.raw || component;
      this.deleteTarget = c || null;
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
      const raw = this.deleteTarget?._raw || this.deleteTarget;
      const id = raw?.id ?? raw?._id ?? raw?.uuid;
      if (!id) {
        this.deleteError = "Missing component id";
        return;
      }

      this.deleteLoading = true;
      this.deleteError = "";
      try {
        await deleteMenuComponent(String(id));
        this.closeDeleteDialog();
        await this.loadComponents(true);
      } catch (e) {
        this.deleteError = e?.userMessage || e?.message || "Failed to delete component";
      } finally {
        this.deleteLoading = false;
      }
    },

    openBulkDelete() {
      this.bulkError = '';
      this.bulkProgress = 0;
      this.bulkTotal = 0;
      this.bulkOpen = true;
    },
    async confirmBulkDelete() {
      const ids = [...this.bulkSelected];
      if (!ids.length) return;
      this.bulkLoading = true;
      this.bulkError = '';
      this.bulkTotal = ids.length;
      this.bulkProgress = 0;
      const failed = [];
      for (const id of ids) {
        try {
          await deleteMenuComponent(id);
        } catch (e) {
          failed.push(id);
        }
        this.bulkProgress += 1;
      }
      await this.loadComponents(true);
      this.bulkLoading = false;
      this.bulkSelected = failed;
      if (failed.length) this.bulkError = `${failed.length} composant(s) n'ont pas pu être supprimés.`;
      else this.bulkOpen = false;
    },
  },
  mounted() {
    this.$store.dispatch('componentCategories/fetchComponentCategories');
    this.$store.dispatch('componentTypes/fetchComponentTypes');
    // Préremplissage du filtre depuis l'URL (?type=&category=) — permet aux écrans de taxonomie
    // (suppression bloquée par des MenuComponent dépendants) de lier directement vers la liste déjà
    // filtrée, plutôt que de chercher la bonne ligne à la main.
    if (this.$route.query.type) this.selectedType = String(this.$route.query.type);
    if (this.$route.query.category) this.selectedCategory = String(this.$route.query.category);
    this.loadComponents();
  },
};
</script>

<style scoped>
#component-library-page {
  background: rgb(var(--v-theme-background));
  min-height: 100%;
}

/* ── Gradient Header ── */
.cl-header--sticky { position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.cl-searchbar--sticky { position: sticky; top: 81px; z-index: 99; flex-shrink: 0; }

.cl-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25);
}

/* Fil d'Ariane : mini-liens blancs translucides sur le bandeau rouge. */
.cl-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  gap: 16px;
  flex-wrap: wrap;
}

.cl-header__left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.cl-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cl-header__title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  margin: 0;
  line-height: 1.2;
}

.cl-header__subtitle {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.72);
  margin: 3px 0 0;
}

.cl-header__right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.cl-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cl-action-hbtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 100px;
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.cl-action-hbtn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: #fff;
}

.cl-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 18px;
  border-radius: 100px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  background: transparent;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.cl-add-btn:hover {
  background: #fff;
  color: #ff3131;
}

/* ── Search bar ── */
.cl-searchbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.cl-searchbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 28px;
  flex-wrap: wrap;
}

.cl-searchbar__icon {
  color: #9ca3af;
  flex-shrink: 0;
}

.cl-searchbar__input {
  flex: 1;
  min-width: 140px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.875rem;
  color: #111827;
}

.cl-searchbar__input::placeholder { color: #9ca3af; }

.cl-searchbar__count {
  font-size: 0.75rem;
  color: #9ca3af;
  white-space: nowrap;
}

.cl-filter-pills {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.cl-filter-sel {
  min-width: 120px;
  max-width: 180px;
}

.cl-filter-sel :deep(.v-field) {
  border-radius: 50px !important;
  border: 1.5px solid #e5e7eb !important;
  background: #f9fafb !important;
  box-shadow: none !important;
}

.cl-filter-sel :deep(.v-field__outline) { display: none; }

.cl-filter-sel :deep(.v-field--focused) { border-color: #ff3131 !important; }

.cl-filter-sel :deep(.v-field__input) {
  font-size: 0.75rem !important;
  min-height: 36px;
}

/* Contenu : mêmes 28px horizontaux que le header/searchbar sticky au-dessus (référence
   MarketPriceListView.vue) — un padding différent ici créait un décalage gauche/droite visible
   entre le bandeau et le tableau. */
.cl-content { padding: 24px 28px; }

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  text-align: center;
}

/* ── Bulk delete bar ── */
.bulk-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 16px; margin-bottom:12px; background:#fff5f5; border:1px solid #fecaca; border-radius:12px; }
.bulk-bar__info { font-size:var(--fs-base); font-weight:700; color:#ff3131; }
.bulk-bar__actions { display:flex; align-items:center; gap:8px; }
.bulk-bar__clear { background:none; border:none; color:#6b7280; font-size:var(--fs-sm); font-weight:600; cursor:pointer; padding:6px 10px; border-radius:8px; }
.bulk-bar__clear:hover { background:rgba(0,0,0,.05); color:#374151; }
.bulk-bar__del { display:inline-flex; align-items:center; gap:6px; background:#ff3131; color:#fff; border:none; border-radius:100px; padding:7px 16px; font-size:var(--fs-sm); font-weight:700; cursor:pointer; }
.bulk-bar__del:hover { box-shadow:0 4px 14px rgba(255,49,49,.35); transform:translateY(-1px); }
.cl--dark .bulk-bar { background:rgba(255,49,49,.1); border-color:rgba(255,49,49,.3); }
.cl--dark .bulk-bar__clear { color:#94a3b8; }
.cl--dark .bulk-bar__clear:hover { background:rgba(255,255,255,.06); color:#e2e8f0; }

/* ── Table ── */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  overflow: hidden;
  animation: fadeIn 0.3s ease-out;
}

.cl-table :deep(.v-data-table__th),
.cl-table :deep(.v-data-table__td) {
  font-size: var(--fs-base);
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 16px;
  padding-right: 16px;
}
.cl-table :deep(.v-data-table__td) { vertical-align: middle; }
.cl-table :deep(.v-data-table__th) {
  font-size: var(--fs-xs) !important;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #9ca3af !important;
  background: #fafafa !important;
}
.cl-table :deep(tbody tr:hover td) { background: #fafafa !important; }

/* Name */
.cl-row-name {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cl-row-name__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  flex-shrink: 0;
}
.cl-row-name__text {
  font-weight: 600;
  font-size: 0.8125rem;
  color: #111827;
}

/* Badges */
.cl-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 50px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.cl-badge--category  { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
.cl-badge--type      { background: #fef2f2; color: #ff3131; border: 1px solid #fecaca; }
.cl-badge--storage   { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.cl-badge--ingredient { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.cl-badge--component  { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.cl-date { color: var(--fb-muted, #6b7280); font-size: 0.85rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cl--dark .cl-date { color: #94a3b8; }

/* Cost */
.cl-cost {
  font-weight: 700;
  font-size: 0.8125rem;
  color: #059669;
}

/* Sub-items button */
.cl-subitems-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 50px;
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.cl-subitems-btn:hover {
  background: #dbeafe;
  box-shadow: 0 2px 8px rgba(37, 99, 235, .15);
}

/* Action buttons */
.cl-actions { display: flex; gap: 4px; justify-content: flex-end; }
.cl-act-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: background .15s, color .15s;
  flex-shrink: 0;
}
.cl-act-btn--edit   { background: #eff6ff; color: #2563eb; }
.cl-act-btn--edit:hover   { background: #dbeafe; }
.cl-act-btn--delete { background: #fef2f2; color: #ff3131; }
.cl-act-btn--delete:hover { background: #fee2e2; }

/* ── Sub-items drawer ── */
.sub-items-drawer :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
}

.cl-drawer-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.cl-drawer-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cl-drawer-header__text { flex: 1; min-width: 0; }
.cl-drawer-header__title {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cl-drawer-header__sub { font-size: 0.75rem; color: rgba(255, 255, 255, .72); margin-top: 2px; }
.cl-drawer-close {
  background: rgba(255, 255, 255, .15);
  border: none;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  transition: background .15s;
}
.cl-drawer-close:hover { background: rgba(255, 255, 255, .25); }

.drawer-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background: #f6f7fb;
}

.sub-items-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
}

.cl-sub-table :deep(.v-data-table__th) {
  background: #f9fafb !important;
  color: #6b7280 !important;
  font-size: 0.75rem !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 10px 14px !important;
  border-bottom: 1.5px solid #e5e7eb !important;
}
.cl-sub-table :deep(.v-data-table__td) {
  padding: 11px 14px !important;
  vertical-align: middle;
  border-bottom: 1px solid #f3f4f6 !important;
}
.cl-sub-table :deep(.v-data-table__tr:last-child .v-data-table__td) {
  border-bottom: none !important;
}

.drawer-footer {
  flex-shrink: 0;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  display: flex;
  justify-content: flex-end;
}
.cl-drawer-foot-btn {
  display: inline-flex;
  align-items: center;
  padding: 0 24px;
  height: 38px;
  border-radius: 50px;
  background: #f3f4f6;
  color: #374151;
  border: none;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s;
}
.cl-drawer-foot-btn:hover { background: #e5e7eb; }

/* ── Dark mode (classe racine .cl--dark, aligné sur ComponentTypeList) ── */
.cl--dark .cl-searchbar { background: #1e293b; border-bottom-color: rgba(255, 255, 255, .08); }
.cl--dark .cl-searchbar__input { color: #e2e8f0; }
.cl--dark .cl-filter-sel :deep(.v-field) {
  border-color: rgba(255, 255, 255, .12) !important;
  background: #1a2332 !important;
}
.cl--dark .table-card { background: #1e293b; border-color: rgba(255, 255, 255, .08); }
.cl--dark .cl-table :deep(.v-data-table__th) {
  background: #1a2332 !important;
  color: #94a3b8 !important;
  border-bottom-color: rgba(255, 255, 255, .08) !important;
}
.cl--dark .cl-table :deep(.v-data-table__td) {
  color: #e2e8f0;
  border-bottom-color: rgba(255, 255, 255, .06) !important;
}
.cl--dark .cl-table :deep(tbody tr:hover td) {
  background: #1a2332 !important;
}
.cl--dark .cl-row-name__text { color: #e2e8f0; }
.cl--dark .cl-badge--category { background: rgba(255, 255, 255, .08); color: #cbd5e1; border-color: rgba(255, 255, 255, .12); }
.cl--dark .cl-badge--type { background: rgba(255, 49, 49, .15); color: #fca5a5; border-color: rgba(255, 49, 49, .3); }
.cl--dark .cl-badge--storage,
.cl--dark .cl-badge--component { background: rgba(37, 99, 235, .15); color: #93c5fd; border-color: rgba(37, 99, 235, .3); }
.cl--dark .cl-badge--ingredient { background: rgba(21, 128, 61, .18); color: #86efac; border-color: rgba(21, 128, 61, .35); }
.cl--dark .cl-subitems-btn { background: rgba(37, 99, 235, .15); color: #93c5fd; border-color: rgba(37, 99, 235, .3); }
.cl--dark .cl-subitems-btn:hover { background: rgba(37, 99, 235, .25); }
.cl--dark .cl-act-btn--edit { background: rgba(37, 99, 235, .15); color: #93c5fd; }
.cl--dark .cl-act-btn--edit:hover { background: rgba(37, 99, 235, .28); }
.cl--dark .cl-act-btn--delete { background: rgba(255, 49, 49, .15); color: #fca5a5; }
.cl--dark .cl-act-btn--delete:hover { background: rgba(255, 49, 49, .28); }
/* Sub-items drawer */
.cl--dark .drawer-body { background: #111827; }
.cl--dark .sub-items-card { background: #1e293b; border-color: rgba(255, 255, 255, .08); }
.cl--dark .cl-sub-table :deep(.v-data-table__th) {
  background: #1a2332 !important;
  color: #94a3b8 !important;
  border-bottom-color: rgba(255, 255, 255, .08) !important;
}
.cl--dark .cl-sub-table :deep(.v-data-table__td) {
  color: #e2e8f0;
  border-bottom-color: rgba(255, 255, 255, .06) !important;
}
.cl--dark .drawer-footer { background: #1e293b; border-top-color: rgba(255, 255, 255, .08); }
.cl--dark .cl-drawer-foot-btn { background: rgba(255, 255, 255, .08); color: #cbd5e1; }
.cl--dark .cl-drawer-foot-btn:hover { background: rgba(255, 255, 255, .14); }
</style>
