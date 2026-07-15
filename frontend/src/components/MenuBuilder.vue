<template>
  <div class="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-900 border-b px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <!-- Burger gauche : navigation principale -->
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ouvrir la navigation"
          @click="mainNavOpen = true"
        >
          <Menu class="w-5 h-5" />
        </Button>
        <!-- Mobile Burger Menu Button (sidebar interne de la page) -->
        <Button
          v-if="isMobile"
          variant="ghost"
          size="icon"
          @click="setMobileMenuOpen(true)"
        >
          <Menu class="w-5 h-5" />
        </Button>
        <h1 class="text-xl">Menu Builder</h1>
      </div>

      <div class="flex items-center gap-2">
        <!-- Close Button -->
        <Button
          variant="ghost"
          size="icon"
          @click="onClose && onClose()"
        >
          <X class="w-5 h-5" />
        </Button>

        <!-- Notification Icon -->
        <Button
          variant="ghost"
          size="icon"
          class="relative"
          @click="onOpenNotifications && onOpenNotifications()"
        >
          <Bell class="w-5 h-5" />
          <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </Button>

        <!-- User Menu (avatar) -->
        <UserMenu />
      </div>
    </header>

    <!-- Navigation principale (drawer gauche) -->
    <MainNav
      v-model="mainNavOpen"
      :onOpenMenu="view => { if (view) activeMenu = view }"
      :onOpenEvents="view => { if (onOpenEvents) { onOpenEvents(view); onClose && onClose() } }"
      :onOpenHR="view => { if (onOpenHR) { onOpenHR(view); onClose && onClose() } }"
      :onOpenFBIntegration="() => { if (onOpenFBIntegration) { onOpenFBIntegration(); onClose && onClose() } }"
    />

    <!-- Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Component Builder Panel full screen -->
      <div
        v-if="showComponentBuilder"
        class="flex-1 w-full h-full"
      >
        <ComponentBuilderPanel
          :component="editingComponent"
          :components="components"
          :ingredients="ingredients"
          :market-prices="marketPrices"
          :onSave="handleSaveComponent"
          :onCancel="handleCancelComponentBuilder"
        />
      </div>

      <div
        v-else-if="showMenuItemBuilder"
        class="flex-1 w-full h-full"
      >
        <MenuItemBuilderPanel
          :menu-item="editingMenuItem"
          :components="components"
          :ingredients="ingredients"
          :market-prices="marketPrices"
          :menu-items="menuItems"
          :spaces="spaces"
          :onSave="handleSaveMenuItem"
          :onCancel="handleCancelMenuItemBuilder"
        />
      </div>

      <template v-else>
        <!-- Left Sidebar Menu (desktop) -->
        <aside
          v-if="!isMobile"
          class="w-64 bg-white dark:bg-gray-900 border-r overflow-y-auto"
        >
          <nav class="p-4 space-y-4">
            <div
              v-for="section in sidebarMenuSections"
              :key="section.title"
            >
              <h3 class="px-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {{ section.title }}
              </h3>
              <div class="space-y-1">
                <button
                  v-for="item in section.items"
                  :key="item.id"
                  class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
                  :class="activeMenu === item.id
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'"
                  @click="activeMenu = item.id"
                >
                  <component
                    :is="item.icon"
                    class="w-5 h-5"
                  />
                  <span>{{ item.label }}</span>
                </button>
              </div>
            </div>
          </nav>
        </aside>

        <!-- Main Content -->
        <main
          class="flex-1"
          :class="showImportWizard && activeMenu === 'market-prices'
            ? 'overflow-hidden'
            : 'overflow-y-auto p-6'"
        >
          <!-- Market Prices -->
          <template v-if="activeMenu === 'market-prices'">
            <div
              v-if="showImportWizard && importWizardData"
              class="h-full"
            >
              <MarketPriceImportPage
                :csv-headers="importWizardData.headers"
                :csv-rows="importWizardData.rows"
                :suppliers="suppliers"
                :existing-item-names="existingItemNamesForImport"
                :existing-market-prices="marketPrices"
                :onConfirm="handleImportCSV"
                :onCancel="() => { 
                  showImportWizard = false
                  importWizardData = null
                }"
                :saved-mapping="savedMarketPriceMapping || undefined"
              />
            </div>
            <NewMarketPriceView
              v-else
              :items="filteredMarketPrices"
              :all-items="marketPrices"
              :suppliers="suppliers"
              :spaces="spaces"
              :is-loading="marketPricesLoading"
              :onAdd="() => handleAddItem()"
              :onAddSupplierItem="handleAddItem"
              :onEditItemName="handleEditItemName"
              :onDeleteItemName="handleDeleteItemName"
              :onEditSupplierItem="handleEditSupplierItem"
              :onDeleteSupplierItem="handleDeleteSupplierItem"
              :onImport="(headers, rows) => {
                importWizardData = { headers, rows }
                showImportWizard = true
              }"
              :onDeduplicate="handleDeduplicateMarketPrices"
              :searchQuery="searchQuery"
              :onSearchChange="setSearchQuery"
              :filterGoodType="filterGoodType"
              :onFilterChange="setFilterGoodType"
              :filterSupplier="filterSupplier"
              :onSupplierFilterChange="setFilterSupplier"
              :filterCategory="filterCategory"
              :onCategoryFilterChange="setFilterCategory"
              :filterSpace="filterSpace"
              :onSpaceFilterChange="setFilterSpace"
            />
          </template>

          <!-- Components -->
          <ComponentsLibraryPanel
            v-else-if="activeMenu === 'components'"
            :components="components"
            :ingredients="ingredients"
            :onEdit="handleEditComponent"
            :onDelete="handleDeleteComponent"
            :onAddNew="handleAddNewComponent"
            :onEditInBuilder="handleEditComponentInBuilder"
          />

          <!-- Menu Items -->
          <MenuItemsLibraryPanel
            v-else-if="activeMenu === 'menu-items'"
            :menu-items="menuItems"
            :spaces="spaces"
            :suppliers="suppliers"
            :ingredients="ingredients"
            :components="components"
            :onEdit="handleEditMenuItem"
            :onDelete="handleDeleteMenuItem"
            :onAddNew="handleAddNewMenuItem"
            :onEditInBuilder="handleEditMenuItemInBuilder"
            :onRefreshCosts="handleRefreshMenuItemCosts"
          />

          <!-- Suppliers -->
          <SuppliersList
            v-else-if="activeMenu === 'suppliers'"
            :suppliers="suppliers"
            :spaces="spaces"
            :onSave="handleSaveSupplier"
            :onDelete="handleDeleteSupplier"
          />

          <!-- Space Menus -->
          <SpaceMenusPanel
            v-else-if="activeMenu === 'space-menus'"
            :spaces="spaces"
            :suppliers="suppliers"
            :menu-items="menuItems"
            :onUpdate="onSpaceMenuSaved"
          />

          <!-- Margin Report -->
          <MenuItemMarginReport
            v-else-if="activeMenu === 'margin-report'"
            :spaces="spaces"
          />

          <!-- Cost Tracking -->
          <template v-else-if="activeMenu === 'cost-tracking'">
            <div
              v-if="marketPricesLoading"
              class="flex flex-col items-center justify-center h-full gap-4"
            >
              <Loader2 class="w-12 h-12 text-blue-600 animate-spin" />
              <div class="text-center">
                <div class="font-semibold text-lg mb-1">Loading Cost Tracking...</div>
                <div class="text-sm text-gray-600">Preparing data</div>
              </div>
            </div>
            <CostTrackingChart
              v-else
              :market-prices="marketPrices"
              :suppliers="suppliers"
            />
          </template>
        </main>
      </template>
    </div>

    <!-- Add/Edit Supplier Item Dialog -->
    <MarketPriceAddDialog
      v-if="showAddEditDialog && !editingItem"
      :open="showAddEditDialog"
      :suppliers="suppliers"
      :existing-item-names="existingItemNamesForImport"
      :existing-market-prices="marketPrices"
      :onSave="handleSaveItem"
      :preselected-item-name="preselectedItemNameForAdd"
      :onOpenChange="open => {
        showAddEditDialog = open
        if (!open) {
          editingItem = null
          preselectedItemNameForAdd = undefined
        }
      }"
    />

    <!-- Edit Supplier Item Dialog (legacy) -->
    <MarketPriceDialog
      v-if="showAddEditDialog && editingItem"
      :item="editingItem"
      :suppliers="suppliers"
      :onSave="handleSaveItem"
      :onCancel="() => {
        showAddEditDialog = false
        editingItem = null
      }"
    />

    <!-- Edit Item Name Dialog -->
    <ItemNameEditDialog
      v-if="showItemNameEditDialog && editingItemName"
      :open="showItemNameEditDialog"
      :itemName="editingItemName.itemName"
      :goodType="editingItemName.goodType"
      :category="editingItemName.category"
      :recipeUnit="editingItemName.recipeUnit"
      :purchaseUnitConversion="editingItemName.purchaseUnitConversion"
      :image="editingItemName.image"
      :lastSupplierUnit="marketPrices.find(item => item.itemName === editingItemName.itemName)?.unit"
      :onSave="handleSaveItemName"
      :onOpenChange="val => (showItemNameEditDialog = val)"
    />

    <!-- Mobile Menu Sheet -->
    <Sheet
      v-if="isMobile"
      :open="mobileMenuOpen"
      :onOpenChange="setMobileMenuOpen"
    >
      <SheetContent
        side="left"
        class="w-64 p-0"
        aria-describedby="mobile-menu-description"
      >
        <SheetHeader class="px-4 pt-4 pb-2">
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription id="mobile-menu-description">
            Navigate between different sections
          </SheetDescription>
        </SheetHeader>
        <nav class="p-4 space-y-4">
          <div
            v-for="section in sidebarMenuSections"
            :key="section.title"
          >
            <h3 class="px-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {{ section.title }}
            </h3>
            <div class="space-y-1">
              <button
                v-for="item in section.items"
                :key="item.id"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
                :class="activeMenu === item.id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-50'"
                @click="() => {
                  activeMenu = item.id
                  setMobileMenuOpen(false)
                }"
              >
                <component
                  :is="item.icon"
                  class="w-5 h-5"
                />
                <span>{{ item.label }}</span>
              </button>
            </div>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  </div>
</template>

<script>
import SuppliersList from './SuppliersList.vue'
import UserMenu from './UserMenu.vue';
import MainNav from './MainNav.vue';
import ComponentsLibraryPanel from './ComponentsLibraryPanel.vue';
import NewMarketPriceView from './NewMarketPriceView.vue';
import MenuItemsLibraryPanel from './MenuItemsLibraryPanel.vue';
import Button from '../ui/button.vue';
import Sheet from '../ui/sheet.vue';
import * as api from '../utils/api.js'
import SheetContent from '../ui/sheetContent.vue';
import SheetHeader from '../ui/sheetHeader.vue';
import SheetTitle from '../ui/sheetTitle.vue';
import SheetDescription from '../ui/sheetDescription.vue';
import SpaceMenusPanel from './SpaceMenusPanel.vue';
import ComponentBuilderPanel from './ComponentBuilderPanel.vue';
import MenuItemBuilderPanel from './MenuItemBuilderPanel.vue';
import { X, Bell, Menu, Loader2 } from 'lucide-vue-next'
import MarketPriceAddDialog from './MarketPriceAddDialog.vue';
import MarketPriceImportPage from './MarketPriceImportPage.vue';
import MenuItemMarginReport from './MenuItemMarginReport.vue';
import MarketPriceDialog from './MarketPriceDialog.vue';
import ItemNameEditDialog from './ItemNameEditDialog.vue';
import CostTrackingChart from './CostTrackingChart.vue';

export default {
  name: 'MenuBuilder',

  components: {
    SuppliersList,UserMenu,MainNav,NewMarketPriceView,Button,X,Bell,Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,ComponentsLibraryPanel,
    MenuItemsLibraryPanel,SpaceMenusPanel,ComponentBuilderPanel,MenuItemBuilderPanel,Loader2,Menu,MarketPriceAddDialog, MarketPriceImportPage,MenuItemMarginReport,MarketPriceDialog,ItemNameEditDialog,
    CostTrackingChart
  },

  props: {
    initialView: {
      type: String,
      default: 'market-prices',
    },
    onClose: {
      type: Function,
      default: null,
    },
    onOpenNotifications: {
      type: Function,
      default: null,
    },
    onOpenSpace: {
      type: Function,
      default: null,
    },
    onSpaceMenuSaved: {
      type: Function,
      default: null,
    },
    onOpenEvents: {
      type: Function,
      default: null,
    },
    onOpenHR: {
      type: Function,
      default: null,
    },
    onOpenFBIntegration: {
      type: Function,
      default: null,
    },
    suppliers: {
      type: Array,
      default: () => [],
    },
    onSaveSupplier: {
      type: Function,
      default: null,
    },
    onDeleteSupplier: {
      type: Function,
      default: null,
    },
  },

  data() {
    return {
      // responsive
      isMobile: false,
      mobileMenuOpen: false,

      // vue active
      activeMenu: this.initialView || 'market-prices',

      // états minimaux utilisés par le template
      showComponentBuilder: false,
      showMenuItemBuilder: false,
      showImportWizard: false,
      importWizardData: null,

      marketPricesLoading: false,

      marketPrices: [],
      spaces: [],
      components: [],
      ingredients: [],
      menuItems: [],

      // filtres / recherche
      searchQuery: '',
      filterGoodType: 'all',
      filterSupplier: 'all',
      filterCategory: 'all',
      filterSpace: 'all',

      // dialogs
      showAddEditDialog: false,
      editingItem: null,
      preselectedItemNameForAdd: undefined,

      showItemNameEditDialog: false,
      editingItemName: null,

      savedMarketPriceMapping: null,

      // sidebar (simplifié pour l’instant)
      sidebarMenuSections: [
        {
          title: 'Supply',
          items: [
            { id: 'suppliers', label: 'Suppliers', icon: 'span' },
            { id: 'market-prices', label: 'Market Prices', icon: 'span' },
          ],
        },
        {
          title: 'Menu',
          items: [
            { id: 'components', label: 'Components', icon: 'span' },
            { id: 'menu-items', label: 'Menu Items', icon: 'span' },
            { id: 'space-menus', label: 'Space Menus', icon: 'span' },
          ],
        },
        {
          title: 'Reports',
          items: [
            { id: 'cost-tracking', label: 'Cost Tracking', icon: 'span' },
            { id: 'margin-report', label: 'Margin Report', icon: 'span' },
          ],
        },
      ],
    }
  },


  computed: {
    filteredMarketPrices() {
      return this.marketPrices.filter((item) => {
        const matchesSearch =
          item.itemName.toLowerCase().includes(this.searchQuery.toLowerCase()) ||this.suppliers.find((s) => s.id === item.supplier_id)
          ?.name.toLowerCase()
          .includes(this.searchQuery.toLowerCase());

        const matchesFilter =
          this.filterGoodType === 'all' || item.goodType === this.filterGoodType;

        const matchesSupplier =
          this.filterSupplier === 'all' || item.supplier_id === this.filterSupplier;

        const matchesCategory =
          this.filterCategory === 'all' || item.category === this.filterCategory;

        return (
          matchesSearch && matchesFilter && matchesSupplier && matchesCategory
        );
      });
    },

    existingItemNamesForImport() {
      // TODO: reproduire la vraie logique de regroupement depuis MenuBuilder.tsx
      return []
    },
  },

  watch: {
    initialView(newVal) {
      this.activeMenu = newVal || 'market-prices'
    },

    activeMenu: {
    immediate: true,
      handler(val) {
        if (val === 'components' || val === 'menu-items') {
          this.loadComponents()
        }
      },
    },

    dataLoadKey() {
      if (this.activeMenu === 'components' || this.activeMenu === 'menu-items') {
        this.loadComponents()
      }
    },
  },

  mounted() {
    const updateIsMobile = () => {
      this.isMobile = window.matchMedia('(max-width: 768px)').matches
    }
    updateIsMobile()
    window.addEventListener('resize', updateIsMobile)
    this._removeResize = () =>
      window.removeEventListener('resize', updateIsMobile)
    this.loadSpaces();
    this.loadMarketPrices();
  },

  beforeUnmount() {
    if (this._removeResize) this._removeResize()
  },

  methods: {
    setMobileMenuOpen(val) {
      this.mobileMenuOpen = val
    },

    async loadMarketPrices() {
      

      // Skip si déjà chargé et pas de reload forcé
      if (this.marketPrices.length > 0 && this.dataLoadKey === 0) {
        console.log('Market prices already loaded, skipping API call');
        this.marketPricesLoading = false
        return
      }

      this.marketPricesLoading = true
      console.log('Loading market prices from API...')
      try {
        const prices = await api.getAllMarketPrices()
        console.log("Apres appel Api")
        this.marketPrices = prices || []
      } catch (error) {
        console.log("Nous avons une erreur");
        console.error('Error loading market prices:', error)
      } finally {
        this.marketPricesLoading = false
      }
      console.log('Finished loading market prices:', this.marketPrices);
    },

    async loadComponents() {
      try {
        // optionnel : repairMenuComponents
        const comps = await api.getAllMenuComponents()
        this.components = comps
      } catch (error) {
      // toast / console.error
      }
    },

    async loadSpaces() {
      try {
        const spacesData = await api.getAllSpaces()
        this.spaces = spacesData || []
      } catch (error) {
        console.error('Error loading spaces:', error)
      }
    },


    // Handlers pour SuppliersList (délégués au parent App.vue)
    handleSaveSupplier(supplier) {
      if (this.onSaveSupplier) this.onSaveSupplier(supplier)
    },

    handleDeleteSupplier(id) {
      if (this.onDeleteSupplier) this.onDeleteSupplier(id)
    },

    // Stubs pour les autres callbacks utilisés par le template
    handleManualMigration() {},
    handleSaveComponent() {},
    handleCancelComponentBuilder() {
      this.showComponentBuilder = false
      this.editingComponent = null
    },
    handleSaveMenuItem() {},
    handleCancelMenuItemBuilder() {
      this.showMenuItemBuilder = false
      this.editingMenuItem = null
    },
    handleAddItem() {},
    handleEditItemName() {},
    handleDeleteItemName() {},
    handleEditSupplierItem() {},
    handleDeleteSupplierItem() {},
    handleImportCSV() {},
    handleDeduplicateMarketPrices() {},
    setSearchQuery(val) {
      this.searchQuery = val
    },
    setFilterGoodType(val) {
      this.filterGoodType = val
    },
    setFilterSupplier(val) {
      this.filterSupplier = val
    },
    setFilterCategory(val) {
      this.filterCategory = val
    },
    setFilterSpace(val) {
      this.filterSpace = val
    },
    handleSaveItem() {},
    handleSaveItemName() {},
    handleEditComponent() {},
    handleDeleteComponent() {},
    handleAddNewComponent() {},
    handleEditComponentInBuilder() {},
    handleEditMenuItem() {},
    handleDeleteMenuItem() {},
    handleAddNewMenuItem() {},
    handleEditMenuItemInBuilder() {},
    handleRefreshMenuItemCosts() {},
  },
}
</script>