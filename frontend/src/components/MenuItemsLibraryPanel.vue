<template>
  <div class="h-full flex flex-col">
    <Card class="h-full overflow-auto">
      <CardHeader class="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b dark:border-gray-800 shadow-sm">
        <template v-if="isMobile">
          <!-- Mobile Layout -->

          <!-- Row 1: Title + View Toggle -->
          <div class="flex items-center justify-between">
            <CardTitle>Menu Items Library</CardTitle>
            <div class="flex border dark:border-gray-700 rounded-md">
              <Button
                :variant="viewMode === 'table' ? 'default' : 'ghost'"
                size="sm"
                class="rounded-r-none"
                @click="setViewMode('table')"
              >
                <LayoutList class="w-4 h-4" />
              </Button>
              <Button
                :variant="viewMode === 'card' ? 'default' : 'ghost'"
                size="sm"
                class="rounded-l-none"
                @click="setViewMode('card')"
              >
                <LayoutGrid class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <!-- Row 2: Export CSV + Refresh + Add Menu Item -->
          <div class="flex gap-2 mt-4">
            <Button variant="outline" class="flex-1" @click="handleExportCSV">
              <Download class="w-4 h-4 mr-2" />Export CSV</Button>

            <TooltipProvider v-if="onRefreshCosts">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="outline"
                    class="flex-1"
                    @click="onRefreshCosts"
                  >
                    <RefreshCw class="w-4 h-4 mr-2" />
                    Refresh Costs
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Update menu item costs based on current ingredient prices</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              class="flex-1"
              @click="onAddNew"
            >
              <Plus class="w-4 h-4 mr-2" />
              Add Menu Item
            </Button>
          </div>

          <!-- Row 2.5: Calculate metrics -->
          <div
            v-if="typeAggregations.size === 0 || categoryAggregations.size === 0"
            class="mt-2"
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="outline"
                    class="w-full border-orange-500 text-orange-600 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-500 dark:hover:bg-orange-950"
                    :disabled="isRecalculating"
                    @click="handleRecalculateMetrics"
                  >
                    <TrendingUp
                      class="w-4 h-4 mr-2"
                      :class="isRecalculating ? 'animate-pulse' : ''"
                    />
                    {{ isRecalculating ? 'Calculating...' : 'Calculate Financial Metrics' }}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Calculate Total Cost, Total Base Price, and Average Margin for all Types and
                    Categories
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <!-- Row 3: Search Field (Full Width) -->
          <div class="mt-4">
            <div class="relative">
              <Search
                class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
              />
              <Input
                placeholder="Search by name..."
                :value="searchQuery"
                @input="e => (searchQuery = e.target.value)"
                class="pl-9"
              />
            </div>
          </div>

          <!-- Row 4: Spaces + Filters -->
          <div class="flex gap-2 mt-3">
            <!-- Spaces Dropdown -->
            <DropdownMenu
              :open="showSpaceFilter"
              :onOpenChange="val => (showSpaceFilter = val)"
            >
              <DropdownMenuTrigger as-child>
                <Button variant="outline" class="flex-1">
                  <MapPin class="w-4 h-4 mr-2" />
                  Spaces
                  <span v-if="selectedSpaces.length > 0">
                    ({{ selectedSpaces.length }})
                  </span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" class="w-56">
                <DropdownMenuLabel>Filter by Spaces</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <div
                  v-if="spaces.length === 0"
                  class="px-2 py-2 text-sm text-gray-500 dark:text-gray-400"
                >
                  No spaces available
                </div>
                <template v-else>
                  <div class="px-2 py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="w-full justify-start text-xs"
                      @click="selectedSpaces = []"
                    >
                      Clear All
                    </Button>
                  </div>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    v-for="space in spaces"
                    :key="space.id"
                    class="cursor-pointer"
                    @select.prevent
                  >
                    <div class="flex items-center space-x-2 w-full">
                      <Checkbox
                        :id="`space-mobile-${space.id}`"
                        :checked="selectedSpaces.includes(space.id)"
                        @update:checked="checked => {
                          if (checked) {
                            selectedSpaces = [...selectedSpaces, space.id]
                          } else {
                            selectedSpaces = selectedSpaces.filter(id => id !== space.id)
                          }
                        }"
                      />
                      <label
                        :for="`space-mobile-${space.id}`"
                        class="text-sm cursor-pointer flex-1"
                      >
                        {{ space.name }}
                      </label>
                    </div>
                  </DropdownMenuItem>
                </template>
              </DropdownMenuContent>
            </DropdownMenu>

            <!-- Filters (Categories + Status) -->
            <DropdownMenu
              :open="showCategoryStatusFilter"
              :onOpenChange="val => (showCategoryStatusFilter = val)"
            >
              <DropdownMenuTrigger as-child>
                <Button variant="outline" class="flex-1">
                  <Filter class="w-4 h-4 mr-2" />
                  Filters
                  <span v-if="selectedCategories.length + selectedStatuses.length > 0">
                    ({{ selectedCategories.length + selectedStatuses.length }})
                  </span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" class="w-56">
                <!-- Clear All Filters -->
                <template
                  v-if="selectedCategories.length > 0 || selectedStatuses.length > 0"
                >
                  <div class="px-2 py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="w-full justify-start text-xs"
                      @click="() => {
                        selectedCategories = []
                        selectedStatuses = []
                      }"
                    >
                      Clear All
                    </Button>
                  </div>
                  <DropdownMenuSeparator />
                </template>

                <DropdownMenuLabel>Categories</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem
                  v-for="categoryObj in allCategories"
                  :key="categoryObj.id"
                  class="cursor-pointer"
                  @select.prevent
                >
                  <div class="flex items-center space-x-2 w-full">
                    <Checkbox
                      :id="`category-mobile-${categoryObj.id}`"
                      :checked="selectedCategories.includes(categoryObj.id)"
                      @update:checked="checked => {
                        if (checked) {
                          selectedCategories = [...selectedCategories, categoryObj.id]
                        } else {
                          selectedCategories = selectedCategories.filter(c => c !== categoryObj.id)
                        }
                      }"
                    />
                    <label
                      :for="`category-mobile-${categoryObj.id}`"
                      class="text-sm cursor-pointer flex-1"
                    >
                      {{ categoryObj.name }}
                    </label>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem
                  v-for="status in ['Yes', 'No']"
                  :key="status"
                  class="cursor-pointer"
                  @select.prevent
                >
                  <div class="flex items-center space-x-2 w-full">
                    <Checkbox
                      :id="`status-mobile-${status}`"
                      :checked="selectedStatuses.includes(status)"
                      @update:checked="checked => {
                        if (checked) {
                          selectedStatuses = [...selectedStatuses, status]
                        } else {
                          selectedStatuses = selectedStatuses.filter(s => s !== status)
                        }
                      }"
                    />
                    <label
                      :for="`status-mobile-${status}`"
                      class="text-sm cursor-pointer flex-1"
                    >
                      {{ status === 'Yes' ? 'Ready for Sale' : 'Not Ready' }}
                    </label>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <!-- Settings Button -->
            <Button
              variant="outline"
              class="flex-1"
              @click="() => {
                tempTypeThresholds = { ...marginThresholds }
                expandedTypes = new Set()
                showMarginSettings = true
              }"
            >
              <Settings class="w-4 h-4 mr-2" />
              Settings
            </Button>

            <!-- ici viendra la partie Filters (Categories + Status) + Settings, qu’on peut faire ensuite -->
          </div>

          <!-- ici on continuera le header mobile (Row 2, Row 2.5, Row 3, Row 4) -->
        </template>
          
        <template v-else>

          <div class="flex items-center justify-between">

            <CardTitle>Menu Items Library</CardTitle>

              <div div class="flex gap-2">
                <!-- View Toggle -->
                <div class="flex border dark:border-gray-700 rounded-md">
                  <Button
                    :variant="viewMode === 'table' ? 'default' : 'ghost'"
                    size="sm"
                    class="rounded-r-none"
                    @click="setViewMode('table')"
                  >
                    <LayoutList class="w-4 h-4" />
                  </Button>
                  <Button
                    :variant="viewMode === 'card' ? 'default' : 'ghost'"
                    size="sm"
                    class="rounded-l-none"
                    @click="setViewMode('card')"
                  >
                    <LayoutGrid class="w-4 h-4" />
                  </Button>
                </div>

                <!-- CSV Export -->
                <Button
                  variant="outline"
                  @click="handleExportCSV"
                >
                  <Download class="w-4 h-4 mr-2" />
                  Export CSV
                </Button>

                <!-- Refresh Costs Button -->
                <!-- Refresh Costs Button -->
                <TooltipProvider v-if="onRefreshCosts">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        variant="outline"
                        @click="onRefreshCosts"
                      >
                        <RefreshCw class="w-4 h-4 mr-2" />
                        Refresh Costs
                      </Button>
                    </TooltipTrigger>
                  </Tooltip>
                </TooltipProvider>


                <!-- Calculate Financial Metrics Button -->
              <TooltipProvider
                v-if="typeAggregations.size === 0 || categoryAggregations.size === 0"
              >
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      variant="outline"
                      :class="[
                        'border-orange-500 text-orange-600 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-500 dark:hover:bg-orange-950',
                      ]"
                      :disabled="isRecalculating"
                      @click="handleRecalculateMetrics"
                    >
                      <TrendingUp
                        class="w-4 h-4 mr-2"
                        :class="{ 'animate-pulse': isRecalculating }"
                      />
                      {{ isRecalculating ? 'Calculating...' : 'Calculate Financial Metrics' }}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Calculate Total Cost, Total Base Price, and Average Margin for all
                      Types and Categories
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

                

              <!-- Add Button -->
              <Button @click="onAddNew">
                <Plus class="w-4 h-4 mr-2" />
                Add Menu Item
              </Button>
          </div>
        </div>

          
        </template>
      </CardHeader>

      <!-- ici viendra CardContent et le reste -->
    </Card>
  </div>
</template>
<script>
import Card from '../ui/card.vue'
import CardContent from '../ui/cardContent.vue'
import CardHeader from '../ui/cardHeader.vue'
import CardTitle from '../ui/cardTitle.vue'
import Button from '../ui/button.vue'
import Input from '../ui/input.vue'
import Label from '../ui/label.vue'
import Table from '../ui/table.vue'
import TableBody from '../ui/tableBody.vue'
import TableCell from '../ui/tableCell.vue'
import TableHead from '../ui/tableHead.vue'
import TableHeader from '../ui/tableHeader.vue'
import TableRow from '../ui/tableRow.vue'
import Select from '../ui/select.vue'
import SelectContent from '../ui/selectContent.vue'
import SelectItem from '../ui/selectItem.vue'
import SelectTrigger from '../ui/selectTrigger.vue'
import SelectValue from '../ui/selectValue.vue'
import Badge from '../ui/badge.vue'
import DropdownMenu from '../ui/dropdownMenu.vue'
import DropdownMenuContent from '../ui/dropdownMenuContent.vue'
import DropdownMenuItem from '../ui/dropdownMenuItem.vue'
import DropdownMenuLabel from '../ui/dropdownMenuLabel.vue'
import DropdownMenuSeparator from '../ui/dropdownMenuSeparator.vue'
import DropdownMenuTrigger from '../ui/dropdownMenuTrigger.vue'
import Dialog from '../ui/dialog.vue'
import DialogContent from '../ui/dialogContent.vue'
import DialogDescription from '../ui/dialogDescription.vue'
import DialogFooter from '../ui/dialogFooter.vue'
import DialogHeader from '../ui/dialogHeader.vue'
import DialogTitle from '../ui/dialogTitle.vue'
import TooltipProvider from '../ui/tooltipProvider.vue'
import Tooltip from '../ui/tooltip.vue'
import TooltipContent from '../ui/tooltipContent.vue'
import TooltipTrigger from '../ui/tooltipTrigger.vue'
import Checkbox from '../ui/checkbox.vue'
import SpaceSelectionDialog from './SpaceSelectionDialog.vue'
import TypeCategorySelector from './TypeCategorySelector.vue'
//import ImageWithFallback from './figma/ImageWithFallback.vue'

import {
  Search,
  Plus,
  Trash2,
  Edit2,
  Download,
  Filter,
  ImageIcon,
  LayoutGrid,
  LayoutList,
  MapPin,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  Settings,
  AlertCircle,
} from 'lucide-vue-next'

import * as api from '../utils/api'

export default {
  name: 'MenuItemsLibraryPanel',

  components: {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Input,
    Label,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Badge,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    TooltipProvider,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    Checkbox,
    SpaceSelectionDialog,
    TypeCategorySelector,
    //ImageWithFallback,
    Search,
    Plus,
    Trash2,
    Edit2,
    Download,
    Filter,
    ImageIcon,
    LayoutGrid,
    LayoutList,
    MapPin,
    RefreshCw,
    ChevronRight,
    ChevronDown,
    TrendingUp,
    Settings,
    AlertCircle,
  },

  props: {
    menuItems: {
      type: Array,
      required: true,
    },
    spaces: {
      type: Array,
      required: true,
    },
    suppliers: {
      type: Array,
      required: true,
    },
    ingredients: {
      type: Array,
      required: true,
    },
    components: {
      type: Array,
      default: () => [],
    },
    onEdit: {
      type: Function,
      required: true,
    },
    onDelete: {
      type: Function,
      required: true,
    },
    onAddNew: {
      type: Function,
      required: true,
    },
    onEditInBuilder: {
      type: Function,
      required: true,
    },
    onRefreshCosts: {
      type: Function,
      default: null,
    },
    // tu peux aussi passer isMobile en prop comme pour les autres composants
    isMobile: {
      type: Boolean,
      default: false,
    },
  },

  data() {
    return {
      // filtres et vue
      searchQuery: '',
      selectedCategories: [],
      selectedStatuses: [],
      selectedSpaces: [],
      viewMode: 'card', // 'table' | 'card'
      showSpaceFilter: false,
      showCategoryStatusFilter: false,

      // delete dialog
      deleteDialogOpen: false,
      itemToDelete: null,
      deleteConfirmText: '',

      // quick edit
      quickEditingItemId: null,
      quickEditData: {},
      showQuickEditSpaceSelector: false,
      // on ne peut pas avoir de ref d'input ici, ce sera via ref dans le template
      // quickEditImageInputRef géré côté template si besoin

      // card view space selector
      showCardSpaceSelector: false,
      cardSpaceEditingItemId: null,

      // margin thresholds
      marginThresholds: {
        default: { lowThreshold: 68, highThreshold: 75 },
      },
      tempTypeThresholds: {
        default: { lowThreshold: 68, highThreshold: 75 },
      },
      expandedTypes: new Set(),

      // catégories / types
      allCategories: [],
      allTypes: [],

      // aggregations
      typeAggregations: new Map(),
      categoryAggregations: new Map(),

      // sections expand
      expandedTypeCategories: new Set(),
      expandedCategories: new Set(),

      // recalculation
      isRecalculating: false,
    }
  },

  computed: {
    filteredMenuItems() {
      return this.menuItems.filter(item => {
        const matchesSearch = item.name
          .toLowerCase()
          .includes(this.searchQuery.toLowerCase())

        const matchesCategory =
          this.selectedCategories.length === 0 ||
          this.selectedCategories.includes(item.categoryId || '') ||
          this.selectedCategories.includes(item.category)

        const matchesReady =
          this.selectedStatuses.length === 0 ||
          this.selectedStatuses.includes(item.readyForSale)

        const matchesSpace =
          this.selectedSpaces.length === 0 ||
          this.selectedSpaces.some(spaceId => item.spaceIds?.includes(spaceId))

        return matchesSearch && matchesCategory && matchesReady && matchesSpace
      })
    },
  },

  mounted() {
    this.loadCategoriesTypesAndAggregations()
    this.loadMarginSettings()
    window.addEventListener('menuItemsChanged', this.handleMenuItemsChanged)
  },

  beforeUnmount() {
    window.removeEventListener('menuItemsChanged', this.handleMenuItemsChanged)
  },

  watch: {
    // auto-expand sections quand filtres / recherche changent
    searchQuery: 'autoExpandSections',
    selectedCategories: 'autoExpandSections',
    selectedStatuses: 'autoExpandSections',
    selectedSpaces: 'autoExpandSections',
    menuItems: {
      handler: 'autoExpandSections',
      deep: true,
    },
  },

  methods: {
    async loadMarginSettings() {
      try {
        const settings = await api.getMarginThresholdSettings()
        const initialized = { ...settings }

        this.allTypes.forEach(type => {
          if (!initialized[type.id]) {
            initialized[type.id] = { ...settings.default }
          }
        })

        this.marginThresholds = initialized
        this.tempTypeThresholds = initialized
      } catch (error) {
        console.error('Error loading margin threshold settings:', error)
      }
    },

    async loadCategoriesTypesAndAggregations() {
      try {
        const [categories, types] = await Promise.all([
          api.getAllCategories(),
          api.getAllTypes(),
        ])

        this.allCategories = categories
        this.allTypes = types

        let categoryAggs = []
        let typeAggs = []

        try {
          const catResp = await api.getAllCategoryAggregations()
          categoryAggs = catResp || []
        } catch (error) {
          console.warn('Failed to load category aggregations:', error)
          toast.warning?.('Could not load category financial metrics')
        }

        try {
          const typeResp = await api.getAllTypeAggregations()
          typeAggs = typeResp || []
        } catch (error) {
          console.warn('Failed to load type aggregations:', error)
          toast.warning?.('Could not load type financial metrics')
        }

        const categoryAggMap = new Map()
        categoryAggs.forEach(agg => {
          categoryAggMap.set(agg.categoryId, agg)
        })
        this.categoryAggregations = categoryAggMap

        const typeAggMap = new Map()
        typeAggs.forEach(agg => {
          typeAggMap.set(agg.typeId, agg)
        })
        this.typeAggregations = typeAggMap

        this.expandedTypes = new Set()
        this.expandedCategories = new Set()
      } catch (error) {
        console.error('Error loading categories and types:', error)
        toast.error?.('Failed to load menu item library data')
      }
    },

    handleMenuItemsChanged() {
      this.loadCategoriesTypesAndAggregations()
    },

    getAveragePrice(menuItem) {
      if (
        menuItem.averagePrice !== undefined &&
        menuItem.averagePrice !== null
      ) {
        return menuItem.averagePrice
      }
      return menuItem.basePrice ?? 0
    },

    getMarginColorClasses(margin, typeId) {
      if (margin === undefined || margin === null) return ''
      const thresholds =
        this.marginThresholds[typeId || 'default'] ||
        this.marginThresholds.default || {
          lowThreshold: 68,
          highThreshold: 75,
        }
      const { lowThreshold, highThreshold } = thresholds

      if (margin < lowThreshold) {
        return 'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-200'
      } else if (margin <= highThreshold) {
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-200'
      } else {
        return 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-200'
      }
    },

    async handleSaveMarginSettings() {
      try {
        await api.saveMarginThresholdSettings(this.tempTypeThresholds)
        this.marginThresholds = { ...this.tempTypeThresholds }
        this.showMarginSettings = false
        toast.success?.('Margin threshold settings saved successfully')
      } catch (error) {
        console.error('Error saving margin threshold settings:', error)
        toast.error?.('Failed to save margin threshold settings')
      }
    },

    handleApplyToAllTypes(sourceTypeId) {
      const sourceThresholds = this.tempTypeThresholds[sourceTypeId]
      if (!sourceThresholds) return

      const updated = { ...this.tempTypeThresholds }
      Object.keys(updated).forEach(typeId => {
        updated[typeId] = { ...sourceThresholds }
      })
      this.tempTypeThresholds = updated
      toast.success?.('Applied settings to all types')
    },

    async handleRecalculateMetrics() {
      this.isRecalculating = true
      try {
        toast.info?.(
          'Calculating financial metrics for all types and categories...',
        )
        await api.recalculateAllAggregations()

        const [categoryAggs, typeAggs] = await Promise.all([
          api.getAllCategoryAggregations(),
          api.getAllTypeAggregations(),
        ])

        const categoryAggMap = new Map()
        categoryAggs.forEach(agg => {
          categoryAggMap.set(agg.categoryId, agg)
        })
        this.categoryAggregations = categoryAggMap

        const typeAggMap = new Map()
        typeAggs.forEach(agg => {
          typeAggMap.set(agg.typeId, agg)
        })
        this.typeAggregations = typeAggMap

        toast.success?.(
          `Financial metrics calculated successfully! ${categoryAggs.length} categories, ${typeAggs.length} types`,
        )
      } catch (error) {
        console.error('Error recalculating metrics:', error)
        toast.error?.('Failed to calculate financial metrics')
      } finally {
        this.isRecalculating = false
      }
    },

    autoExpandSections() {
      if (
        this.searchQuery.trim() === '' &&
        this.selectedCategories.length === 0 &&
        this.selectedStatuses.length === 0 &&
        this.selectedSpaces.length === 0
      ) {
        this.expandedTypeCategories = new Set()
        this.expandedCategories = new Set()
        return
      }

      const matchingTypeIds = new Set()
      const matchingCategoryIds = new Set()

      this.menuItems.forEach(item => {
        const matchesSearch =
          this.searchQuery.trim() === '' ||
          item.name.toLowerCase().includes(this.searchQuery.toLowerCase())

        const matchesCategory =
          this.selectedCategories.length === 0 ||
          this.selectedCategories.includes(item.categoryId || '') ||
          this.selectedCategories.includes(item.category)

        const matchesReady =
          this.selectedStatuses.length === 0 ||
          this.selectedStatuses.includes(item.readyForSale)

        const matchesSpace =
          this.selectedSpaces.length === 0 ||
          this.selectedSpaces.some(spaceId => item.spaceIds?.includes(spaceId))

        if (matchesSearch && matchesCategory && matchesReady && matchesSpace) {
          if (item.typeId) matchingTypeIds.add(item.typeId)
          if (item.categoryId) matchingCategoryIds.add(item.categoryId)
        }
      })

      this.expandedTypeCategories = matchingTypeIds
      this.expandedCategories = matchingCategoryIds
    },

    handleDeleteClick(item) {
      this.itemToDelete = item
      this.deleteConfirmText = ''
      this.deleteDialogOpen = true
    },

    handleConfirmDelete() {
      if (
        this.itemToDelete &&
        this.deleteConfirmText.toLowerCase() === 'delete'
      ) {
        this.onDelete && this.onDelete(this.itemToDelete.id)
        this.deleteDialogOpen = false
        this.itemToDelete = null
        this.deleteConfirmText = ''
        toast.success?.('Menu item deleted successfully')
      }
    },

    handleCancelDelete() {
      this.deleteDialogOpen = false
      this.itemToDelete = null
      this.deleteConfirmText = ''
    },

    handleExportCSV() {
      if (!this.menuItems.length) {
        toast.error?.('No data to export')
        return
      }

      const headers = [
        'Name',
        'Category',
        'Ready for Sale',
        'Number of Pieces',
        'Base Price (€)',
        'Total Cost (€)',
        'Margin (%)',
        'Diet',
        'Storage Type',
        'Combo Item',
        'Description',
      ]

      const rows = this.menuItems.map(item => [
        item.name,
        item.category,
        item.readyForSale,
        item.numberOfPiecesRecipe != null
          ? item.numberOfPiecesRecipe.toFixed(3)
          : '0.000',
        item.basePrice != null ? item.basePrice.toFixed(2) : '0.00',
        item.totalCost != null ? item.totalCost.toFixed(2) : '0.00',
        item.margin != null ? item.margin.toFixed(2) : '0.00',
        item.diet?.join(', ') || '',
        item.storageType?.join(', ') || '',
        item.comboItem || 'No',
        item.description || '',
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map(row =>
          row
            .map(cell => {
              const cellStr = String(cell)
              return cellStr.includes(',') ? `"${cellStr}"` : cellStr
            })
            .join(','),
        ),
      ].join('\n')

      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute(
        'download',
        `menu-items-${new Date().toISOString().split('T')[0]}.csv`,
      )
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success?.('Menu items exported successfully')
    },

    handleQuickEditStart(item, e) {
      if (e) e.stopPropagation()
      this.quickEditingItemId = item.id
      this.quickEditData = {
        name: item.name,
        type: item.type,
        category: item.category,
        typeId: item.typeId,
        categoryId: item.categoryId,
        diet: item.diet,
        spaceIds: item.spaceIds || [],
        storageType: item.storageType || [],
        picture: item.picture,
        basePrice: item.basePrice,
        spaceSpecificPrices: item.spaceSpecificPrices,
      }
    },

    handleQuickEditSave() {
      if (!this.quickEditingItemId) return
      const originalItem = this.menuItems.find(
        item => item.id === this.quickEditingItemId,
      )
      if (!originalItem) return

      const updatedItem = {
        ...originalItem,
        ...this.quickEditData,
      }

      this.onEdit && this.onEdit(updatedItem)
      this.quickEditingItemId = null
      this.quickEditData = {}
      toast.success?.('Menu item updated successfully')
    },

    handleQuickEditCancel() {
      this.quickEditingItemId = null
      this.quickEditData = {}
    },

    handleCardSpaceClick(item, e) {
      e.stopPropagation()
      this.cardSpaceEditingItemId = item.id
      this.showCardSpaceSelector = true
    },

    handleCardSpaceSave(spaceIds) {
      if (!this.cardSpaceEditingItemId) return
      const originalItem = this.menuItems.find(
        item => item.id === this.cardSpaceEditingItemId,
      )
      if (!originalItem) return

      const updatedItem = {
        ...originalItem,
        spaceIds,
      }

      this.onEdit && this.onEdit(updatedItem)
      this.showCardSpaceSelector = false
      this.cardSpaceEditingItemId = null
      toast.success?.('Space selection updated successfully')
    },

    handleStorageTypeToggle(storageType) {
      const currentTypes = this.quickEditData.storageType || []
      const newTypes = currentTypes.includes(storageType)
        ? currentTypes.filter(t => t !== storageType)
        : [...currentTypes, storageType]
      this.quickEditData = {
        ...this.quickEditData,
        storageType: newTypes,
      }
    },

    handleQuickEditImageUpload(e) {
      const file = e.target.files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onloadend = () => {
          this.quickEditData = {
            ...this.quickEditData,
            picture: reader.result,
          }
        }
        reader.readAsDataURL(file)
      }
    },

    toggleType(typeId) {
      const next = new Set(this.expandedTypeCategories)
      if (next.has(typeId)) {
        next.delete(typeId)
      } else {
        next.add(typeId)
      }
      this.expandedTypeCategories = next
    },

    toggleCategory(categoryId) {
      const next = new Set(this.expandedCategories)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      this.expandedCategories = next
    },

    formatCurrency(value) {
      if (value === undefined || value === null) return '€0.00'
      return `€${value.toFixed(2)}`
    },

    formatPercentage(value) {
      if (value === undefined || value === null) return '0.0%'
      return `${value.toFixed(1)}%`
    },
  },
}
</script>