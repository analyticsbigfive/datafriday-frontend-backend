<template>
  <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
    <div class="p-4 border-b border-gray-200 dark:border-gray-800">
      <div class="flex items-center justify-between">
        <div class="text-base font-semibold text-gray-900 dark:text-gray-100">
          {{ title }}
        </div>

        <div class="flex items-center gap-2">
          <button
            v-if="isMobile"
            type="button"
            class="h-8 px-2 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-1.5 text-xs whitespace-nowrap"
            @click="tableView = tableView === 'shops' ? 'items' : 'shops'"
          >
            <ArrowLeftRight class="h-3.5 w-3.5" />
            {{ tableView === 'shops' ? 'By Items' : 'By Shops' }}
          </button>

          <button
            type="button"
            class="h-8 w-8 p-0 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center"
            @click="showExportDialog = true"
          >
            <Download class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Mobile filter row -->
      <div v-if="isMobile" class="flex items-center gap-2 mt-3">
        <button
          type="button"
          class="h-8 w-8 p-0 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center"
          @click="showSearchOnMobile = !showSearchOnMobile"
        >
          <Search class="h-4 w-4" />
        </button>

        <div v-if="availableMenuItemTypes.length > 0" class="flex-1">
          <select
            class="h-8 w-full border border-gray-200 dark:border-gray-700 rounded-md bg-transparent px-2 text-xs"
            :value="selectedMenuItemType"
            @change="handleTypeChange($event.target.value)"
          >
            <option value="all">All Types</option>
            <option v-for="type in availableMenuItemTypes" :key="type" :value="type">
              {{ type }}
            </option>
          </select>
        </div>

        <div v-if="availableMenuItemCategories.length > 0" class="flex-1">
          <select
            class="h-8 w-full border border-gray-200 dark:border-gray-700 rounded-md bg-transparent px-2 text-xs"
            :value="selectedMenuItemCategory"
            @change="handleCategoryChange($event.target.value)"
          >
            <option value="all">All Categories</option>
            <option v-for="category in availableMenuItemCategories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
        </div>
      </div>

      <div v-if="!isMobile || showSearchOnMobile" class="flex items-center gap-3 mt-4">
        <div class="relative flex-1 mibs-search">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            class="mibs-search-input"
            :placeholder="searchPlaceholder"
            v-model="searchText"
          />
          <select
            v-model="searchScope"
            class="mibs-search-scope"
            :title="'Périmètre de recherche'"
          >
            <option value="all">All</option>
            <option value="shop">Shop</option>
            <option value="type">Type</option>
            <option value="category">Category</option>
            <option value="item">Menu item</option>
          </select>
          <button
            v-if="searchText"
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            @click="searchText = ''"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <template v-if="!isMobile">
          <button
            type="button"
            class="mibs-pill"
            @click="tableView = tableView === 'shops' ? 'items' : 'shops'"
          >
            <ArrowLeftRight class="h-4 w-4" />
            {{ tableView === 'shops' ? 'Group by Items' : 'Group by Shops' }}
          </button>

          <div v-if="availableMenuItemTypes.length > 0" class="mibs-pill mibs-pill-select">
            <Filter class="h-4 w-4 text-gray-400" />
            <select
              :value="selectedMenuItemType"
              @change="handleTypeChange($event.target.value)"
            >
              <option value="all">All Types</option>
              <option v-for="type in availableMenuItemTypes" :key="type" :value="type">
                {{ type }}
              </option>
            </select>
          </div>

          <div v-if="availableMenuItemCategories.length > 0" class="mibs-pill mibs-pill-select">
            <Filter class="h-4 w-4 text-gray-400" />
            <select
              :value="selectedMenuItemCategory"
              @change="handleCategoryChange($event.target.value)"
            >
              <option value="all">All Categories</option>
              <option v-for="category in availableMenuItemCategories" :key="category" :value="category">
                {{ category }}
              </option>
            </select>
          </div>
        </template>
      </div>
    </div>

    <div class="p-4">
      <!-- Charts section (Menu only) - Recharts -> Doughnut -->
      <div v-if="viewMode === 'menu' && menuTypeMetrics" class="mb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div
            v-for="card in menuMetricCards"
            :key="card.key"
            class="border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900"
          >
            <div class="p-3 border-b border-gray-200 dark:border-gray-800">
              <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {{ card.label }}
              </div>
            </div>

            <div class="p-3">
              <div class="w-full aspect-square">
                <Doughnut :data="card.chartData" :options="doughnutOptions" :style="{ width: '100%', height: '100%' }" />
              </div>

              <div class="mt-2 space-y-1 text-xs">
                <div class="flex justify-between">
                  <span class="text-gray-500">Cost:</span>
                  <span>${{ card.cost.toFixed(2) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Price:</span>
                  <span>${{ card.price.toFixed(2) }}</span>
                </div>
                <div class="flex justify-between font-medium">
                  <span class="text-gray-500">Margin:</span>
                  <span>{{ card.marginPercent.toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Conditional rendering based on table view -->
      <template v-if="tableView === 'shops'">
        <div v-if="filteredShops.length === 0" class="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          {{ searchText.trim() ? 'No shops or menu items match your search' : 'No data available for the selected filters' }}
        </div>

        <div v-else class="space-y-2">
          <div v-for="shop in filteredShops" :key="shop.shopId" class="border border-gray-200 dark:border-gray-800 rounded-lg">
            <button
              type="button"
              class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-t-lg"
              @click="toggleShop(shop.shopId)"
            >
              <div class="flex items-center gap-2">
                <ChevronDown v-if="expandedShops[shop.shopId]" class="h-4 w-4" />
                <ChevronRight v-else class="h-4 w-4" />
                <span class="font-medium">{{ shop.shopName }}</span>
              </div>

              <div v-if="viewMode === 'menu'" class="flex items-center gap-4 text-sm">
                <span class="text-gray-500 dark:text-gray-400">Cost: ${{ Number(shop.totalCost || 0).toFixed(2) }}</span>
                <span class="text-gray-500 dark:text-gray-400">Price: ${{ Number(shop.totalPrice || 0).toFixed(2) }}</span>
                <span class="text-gray-500 dark:text-gray-400">Margin: {{ Number(shop.averageMargin || 0).toFixed(1) }}%</span>
              </div>
              <div v-else-if="viewMode !== 'inventory'" class="flex items-center gap-4 text-sm">
                <span class="text-gray-500 dark:text-gray-400">Avg: {{ Math.ceil(shop.totalAverageQuantity || 0) }}</span>
                <span class="text-gray-500 dark:text-gray-400">Total: {{ Math.floor(shop.totalQuantity || 0) }}</span>
                <span class="text-gray-500 dark:text-gray-400">Events: {{ shop.totalEventCount || 0 }}</span>
              </div>
            </button>

            <div v-if="expandedShops[shop.shopId]" class="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <table class="w-full">
                <thead class="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium w-16"></th>
                    <th class="px-4 py-2 text-left text-xs font-medium">Menu Item</th>
                    <template v-if="viewMode === 'menu'">
                      <th class="px-4 py-2 text-right text-xs font-medium">Cost</th>
                      <th class="px-4 py-2 text-right text-xs font-medium">Price</th>
                      <th class="px-4 py-2 text-right text-xs font-medium">Margin</th>
                    </template>
                    <template v-else-if="viewMode !== 'inventory'">
                      <th class="px-4 py-2 text-right text-xs font-medium">Avg Qty</th>
                      <th class="px-4 py-2 text-right text-xs font-medium">Total Qty</th>
                      <th class="px-4 py-2 text-right text-xs font-medium">Events</th>
                    </template>
                  </tr>
                </thead>

                <tbody>
                  <template v-for="type in shop.types" :key="type.typeName">
                    <template v-for="category in type.categories" :key="category.categoryName">
                      <tr
                        v-for="item in category.menuItems"
                        :key="item.menuItemId"
                        class="border-t border-gray-100 dark:border-gray-800"
                      >
                        <td class="px-4 py-2 text-sm">
                          <img
                            :src="getMenuItemPicture(item.menuItemId)"
                            :alt="item.menuItemName"
                            class="h-12 w-12 rounded object-cover"
                            @error="onMenuItemImageError(item.menuItemId)"
                          />
                        </td>

                        <td class="px-4 py-2 text-sm">
                          {{ item.menuItemName }}
                        </td>

                        <template v-if="viewMode === 'menu'">
                          <td class="px-4 py-2 text-sm text-right">
                            ${{ Number(getMenuItemDetails(item.menuItemId)?.cost ?? 0).toFixed(2) }}
                          </td>
                          <td class="px-4 py-2 text-sm text-right font-medium">
                            ${{
                              Number(
                                getMenuItemDetails(item.menuItemId)?.averagePrice ??
                                  getMenuItemDetails(item.menuItemId)?.basePrice ??
                                  0
                              ).toFixed(2)
                            }}
                          </td>
                          <td class="px-4 py-2 text-sm text-right">
                            {{ Number(getMenuItemDetails(item.menuItemId)?.averageMargin ?? 0).toFixed(1) }}%
                          </td>
                        </template>

                        <template v-else-if="viewMode !== 'inventory'">
                          <td class="px-4 py-2 text-sm text-right font-medium">
                            {{ Math.ceil(item.averageQuantity || 0) }}
                          </td>
                          <td class="px-4 py-2 text-sm text-right">
                            {{ Math.floor(item.totalQuantity || 0) }}
                          </td>
                          <td
                            class="px-4 py-2 text-sm text-right text-gray-500 dark:text-gray-400 cursor-pointer hover:text-purple-600 dark:hover:text-purple-400 hover:underline transition-colors"
                            @click.stop="handleEventsClick({ shopId: shop.shopId, shopName: shop.shopName }, { menuItemId: item.menuItemId, menuItemName: item.menuItemName })"
                          >
                            {{ item.eventCount || 0 }}
                          </td>
                        </template>
                      </tr>
                    </template>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div v-if="filteredMenuItems.length === 0" class="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          {{ searchText.trim() ? 'No menu items or shops match your search' : 'No data available for the selected filters' }}
        </div>

        <div v-else class="space-y-2">
          <div v-for="menuItem in filteredMenuItems" :key="menuItem.menuItemId" class="border border-gray-200 dark:border-gray-800 rounded-lg">
            <button
              type="button"
              class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-t-lg"
              @click="toggleMenuItem(menuItem.menuItemId)"
            >
              <div class="flex items-center gap-3">
                <ChevronDown v-if="expandedMenuItems[menuItem.menuItemId]" class="h-4 w-4 flex-shrink-0" />
                <ChevronRight v-else class="h-4 w-4 flex-shrink-0" />

                <img
                  :src="getMenuItemPicture(menuItem.menuItemId)"
                  :alt="menuItem.menuItemName"
                  class="h-10 w-10 rounded object-cover flex-shrink-0"
                  @error="onMenuItemImageError(menuItem.menuItemId)"
                />
                <span class="font-medium">{{ menuItem.menuItemName }}</span>
              </div>

              <div v-if="viewMode === 'menu'" class="flex items-center gap-4 text-sm">
                <span class="text-gray-500 dark:text-gray-400">Cost: ${{ Number(menuItem.totalCost || 0).toFixed(2) }}</span>
                <span class="text-gray-500 dark:text-gray-400">Price: ${{ Number(menuItem.totalPrice || 0).toFixed(2) }}</span>
                <span class="text-gray-500 dark:text-gray-400">Margin: {{ Number(menuItem.averageMargin || 0).toFixed(1) }}%</span>
              </div>
              <div v-else-if="viewMode !== 'inventory'" class="flex items-center gap-4 text-sm">
                <span class="text-gray-500 dark:text-gray-400">Avg: {{ Math.ceil(menuItem.totalAverageQuantity || 0) }}</span>
                <span class="text-gray-500 dark:text-gray-400">Total: {{ Math.floor(menuItem.totalQuantity || 0) }}</span>
                <span class="text-gray-500 dark:text-gray-400">Events: {{ menuItem.totalEventCount || 0 }}</span>
              </div>
            </button>

            <div v-if="expandedMenuItems[menuItem.menuItemId]" class="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <table class="w-full">
                <thead class="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium">Shop</th>
                    <template v-if="viewMode !== 'menu' && viewMode !== 'inventory'">
                      <th class="px-4 py-2 text-right text-xs font-medium">Avg Qty</th>
                      <th class="px-4 py-2 text-right text-xs font-medium">Total Qty</th>
                      <th class="px-4 py-2 text-right text-xs font-medium">Events</th>
                    </template>
                  </tr>
                </thead>

                <tbody>
                  <tr
                    v-for="shop in menuItem.shops"
                    :key="shop.shopId"
                    class="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td class="px-4 py-2 text-sm">{{ shop.shopName }}</td>

                    <template v-if="viewMode !== 'menu' && viewMode !== 'inventory'">
                      <td class="px-4 py-2 text-sm text-right font-medium">{{ Math.ceil(shop.averageQuantity || 0) }}</td>
                      <td class="px-4 py-2 text-sm text-right">{{ Math.floor(shop.totalQuantity || 0) }}</td>
                      <td
                        class="px-4 py-2 text-sm text-right text-gray-500 dark:text-gray-400 cursor-pointer hover:text-purple-600 dark:hover:text-purple-400 hover:underline transition-colors"
                        @click.stop="handleEventsClick({ shopId: shop.shopId, shopName: shop.shopName }, { menuItemId: menuItem.menuItemId, menuItemName: menuItem.menuItemName })"
                      >
                        {{ shop.eventCount || 0 }}
                      </td>
                    </template>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Export Dialog (Dialog radix -> simple overlay Vue) -->
    <div
      v-if="showExportDialog"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      @click.self="showExportDialog = false"
    >
      <div class="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800">
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">Export Table</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Choose your preferred export format</div>
        </div>

        <div class="p-4 flex flex-col gap-3">
          <button
            type="button"
            class="w-full h-10 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-start gap-2 px-3 text-sm"
            @click="handleExportToExcel"
          >
            <Download class="h-4 w-4" />
            Export to Excel (.xlsx)
          </button>

          <button
            type="button"
            class="w-full h-10 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-start gap-2 px-3 text-sm"
            @click="handleExportToGoogleSheets"
          >
            <Download class="h-4 w-4" />
            Export to Google Sheets
          </button>
        </div>

        <div class="px-4 pb-4 text-xs text-gray-500 dark:text-gray-400">
          <strong>Note:</strong> For Google Sheets export, the file will be downloaded and a new Google Sheets tab will open. You can then drag and drop the file into Google Sheets or use File → Import.
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import * as XLSX from 'xlsx'
import { ChevronDown, ChevronRight, Search, X, ArrowLeftRight, Filter, Download } from 'lucide-vue-next'

ChartJS.register(ArcElement, Tooltip, Legend)

const FALLBACK_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjxwYXRoIGQ9Ik04NSA3NWgzMHYxMEg4NXptMCAyMGgzMHYxMEg4NXoiIGZpbGw9IiNkMWQyZDQiLz48Y2lyY2xlIGN4PSI3MCIgY3k9IjgwIiByPSI4IiBmaWxsPSIjZDFkMmQ0Ii8+PHBhdGggZD0iTTYwIDEyMGw0MC00MCAzMCAzMCAzMC00MCIgc3Ryb2tlPSIjZDFkMmQ0IiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiLz48L3N2Zz4='

export default {
  name: 'MenuItemsByShopTable',
  components: {
    Doughnut,
    ChevronDown,
    ChevronRight,
    Search,
    X,
    ArrowLeftRight,
    Filter,
    Download,
  },
  props: {
    menuItemsByShop: {
      type: Array,
      required: true,
      default: () => [],
    },
    viewMode: {
      type: String,
      default: 'analyse', // 'analyse' | 'menu' | 'inventory'
    },
    onEventsClick: {
      type: Function,
      default: null,
    },
    allMenuItems: {
      type: Array,
      default: null,
    },
    selectedTypeFilter: {
      type: Array,
      default: () => [],
    },
    selectedCategoryFilter: {
      type: Array,
      default: () => [],
    },
    onTypeFilterChange: {
      type: Function,
      default: null,
    },
    onCategoryFilterChange: {
      type: Function,
      default: null,
    },
  },

  data() {
    return {
      // expansions (sets in React -> plain object maps in Vue)
      expandedShops: {},
      expandedTypes: {},
      expandedCategories: {},
      expandedMenuItems: {},

      searchText: '',
      // Lot 0.5 — Périmètre de la recherche : 'all' (défaut) ou un champ dédié
      // (shop, type, category, item). Selon le filtre choisi, la chaîne saisie
      // ne matchera que sur ce champ.
      searchScope: 'all',
      tableView: 'shops', // 'shops' | 'items'
      showExportDialog: false,
      showSearchOnMobile: false,

      // mobile
      isMobile: false,
      _mql: null,
      _mqlHandler: null,

      // local single-select filters
      selectedMenuItemType: 'all',
      selectedMenuItemCategory: 'all',

      // img fallback per id
      failedImages: {},
    }
  },

  computed: {
    title() {
      if (this.viewMode === 'menu') return 'Menu'
      if (this.viewMode === 'inventory') return 'Inventory'
      return 'Menu Items by Shop'
    },

    searchPlaceholder() {
      const map = {
        all: 'Search by shop, type, category, or menu item…',
        shop: 'Search by shop…',
        type: 'Search by type…',
        category: 'Search by category…',
        item: 'Search by menu item…',
      }
      return map[this.searchScope] || map.all
    },

    // React useMemo -> computed
    menuItemDetailsMap() {
      const map = new Map()
      ;(this.allMenuItems || []).forEach((item) => {
        map.set(item.id, item)
      })
      return map
    },

    // -------- Grouping (shops -> types -> categories -> items)
    groupedShops() {
      return (this.menuItemsByShop || []).map((shop) => {
        const typeMap = new Map()

        ;(shop.menuItems || []).forEach((item) => {
          const typeName = item.type || 'Uncategorized'
          const categoryName = item.category || 'Uncategorized'

          if (!typeMap.has(typeName)) typeMap.set(typeName, new Map())
          const categoryMap = typeMap.get(typeName)

          if (!categoryMap.has(categoryName)) categoryMap.set(categoryName, [])
          categoryMap.get(categoryName).push(item)
        })

        const types = []

        typeMap.forEach((categoryMap, typeName) => {
          const categories = []
          let typeAvgQty = 0
          let typeTotalQty = 0
          let typeTotalCost = 0
          let typeTotalPrice = 0
          let typeUniqueEventIds = null

          categoryMap.forEach((menuItems, categoryName) => {
            const categoryAvgQty = menuItems.reduce((sum, i) => sum + (i.averageQuantity || 0), 0)
            const categoryTotalQty = menuItems.reduce((sum, i) => sum + (i.totalQuantity || 0), 0)

            const uniqueEventIds = new Set()
            menuItems.forEach((i) => {
              ;(i.eventIds || []).forEach((eventId) => uniqueEventIds.add(eventId))
            })
            const categoryEventCount = uniqueEventIds.size

            const categoryTotalCost = menuItems.reduce((sum, i) => {
              const details = this.getMenuItemDetails(i.menuItemId)
              return sum + (details?.cost ?? 0)
            }, 0)

            const categoryTotalPrice = menuItems.reduce((sum, i) => {
              const details = this.getMenuItemDetails(i.menuItemId)
              return sum + (details?.averagePrice ?? details?.basePrice ?? 0)
            }, 0)

            const categoryAverageMargin =
              categoryTotalPrice > 0 ? ((categoryTotalPrice - categoryTotalCost) / categoryTotalPrice) * 100 : 0

            categories.push({
              categoryName,
              menuItems,
              averageQuantity: categoryAvgQty,
              totalQuantity: categoryTotalQty,
              eventCount: categoryEventCount,
              totalCost: categoryTotalCost,
              totalPrice: categoryTotalPrice,
              averageMargin: categoryAverageMargin,
            })

            typeAvgQty += categoryAvgQty
            typeTotalQty += categoryTotalQty
            typeTotalCost += categoryTotalCost
            typeTotalPrice += categoryTotalPrice

            uniqueEventIds.forEach((eventId) => {
              if (!typeUniqueEventIds) typeUniqueEventIds = new Set()
              typeUniqueEventIds.add(eventId)
            })
          })

          categories.sort((a, b) => String(a.categoryName).localeCompare(String(b.categoryName)))

          const typeEventCount = typeUniqueEventIds ? typeUniqueEventIds.size : 0
          const typeMargin = typeTotalPrice > 0 ? ((typeTotalPrice - typeTotalCost) / typeTotalPrice) * 100 : 0

          types.push({
            typeName,
            categories,
            averageQuantity: typeAvgQty,
            totalQuantity: typeTotalQty,
            eventCount: typeEventCount,
            totalCost: typeTotalCost,
            totalPrice: typeTotalPrice,
            averageMargin: typeMargin,
          })
        })

        types.sort((a, b) => String(a.typeName).localeCompare(String(b.typeName)))

        const totalAverageQuantity = types.reduce((sum, t) => sum + (t.averageQuantity || 0), 0)
        const totalQuantity = types.reduce((sum, t) => sum + (t.totalQuantity || 0), 0)

        const shopUniqueEventIds = new Set()
        ;(shop.menuItems || []).forEach((i) => {
          ;(i.eventIds || []).forEach((eventId) => shopUniqueEventIds.add(eventId))
        })
        const totalEventCount = shopUniqueEventIds.size

        const totalCost = types.reduce((sum, t) => sum + (t.totalCost || 0), 0)
        const totalPrice = types.reduce((sum, t) => sum + (t.totalPrice || 0), 0)
        const shopMargin = totalPrice > 0 ? ((totalPrice - totalCost) / totalPrice) * 100 : 0

        return {
          shopId: shop.shopId,
          shopName: shop.shopName,
          types,
          totalAverageQuantity,
          totalQuantity,
          totalEventCount,
          totalCost,
          totalPrice,
          averageMargin: shopMargin,
        }
      })
    },

    // -------- Inverted grouping (items -> shops)
    groupedMenuItems() {
      const menuItemMap = new Map()

      ;(this.menuItemsByShop || []).forEach((shop) => {
        ;(shop.menuItems || []).forEach((item) => {
          if (!menuItemMap.has(item.menuItemId)) {
            const details = this.getMenuItemDetails(item.menuItemId)
            const cost = details?.cost ?? 0
            const price = details?.averagePrice ?? details?.basePrice ?? 0
            const margin = details?.averageMargin ?? 0

            menuItemMap.set(item.menuItemId, {
              menuItemId: item.menuItemId,
              menuItemName: item.menuItemName,
              shops: [],
              totalAverageQuantity: 0,
              totalQuantity: 0,
              totalEventCount: 0,
              totalCost: cost,
              totalPrice: price,
              averageMargin: margin,
            })
          }

          const group = menuItemMap.get(item.menuItemId)
          group.shops.push({
            shopId: shop.shopId,
            shopName: shop.shopName,
            averageQuantity: item.averageQuantity,
            totalQuantity: item.totalQuantity,
            eventCount: item.eventCount,
          })

          group.totalAverageQuantity += item.averageQuantity || 0
          group.totalQuantity += item.totalQuantity || 0
          group.totalEventCount += item.eventCount || 0
        })
      })

      return Array.from(menuItemMap.values()).sort((a, b) => String(a.menuItemName).localeCompare(String(b.menuItemName)))
    },

    // -------- Filters lists
    availableMenuItemTypes() {
      const typesSet = new Set()
      ;(this.menuItemsByShop || []).forEach((shop) => {
        ;(shop.menuItems || []).forEach((item) => {
          if (item.type) typesSet.add(item.type)
        })
      })
      return Array.from(typesSet).sort()
    },

    availableMenuItemCategories() {
      const categoriesSet = new Set()
      ;(this.menuItemsByShop || []).forEach((shop) => {
        ;(shop.menuItems || []).forEach((item) => {
          if (this.selectedMenuItemType === 'all' || item.type === this.selectedMenuItemType) {
            if (item.category) categoriesSet.add(item.category)
          }
        })
      })
      return Array.from(categoriesSet).sort()
    },

    // -------- Filtered views
    filteredShops() {
      let shopsToFilter = this.groupedShops

      // type filter
      if (this.selectedMenuItemType !== 'all') {
        shopsToFilter = shopsToFilter
          .map((shop) => {
            const filteredTypes = (shop.types || []).filter((t) => t.typeName === this.selectedMenuItemType)
            if (!filteredTypes.length) return null

            const totalAverageQuantity = filteredTypes.reduce((sum, t) => sum + (t.averageQuantity || 0), 0)
            const totalQuantity = filteredTypes.reduce((sum, t) => sum + (t.totalQuantity || 0), 0)
            const totalCost = filteredTypes.reduce((sum, t) => sum + (t.totalCost || 0), 0)
            const totalPrice = filteredTypes.reduce((sum, t) => sum + (t.totalPrice || 0), 0)
            const totalEventCount = filteredTypes.reduce((sum, t) => sum + (t.eventCount || 0), 0)
            const shopMargin = totalPrice > 0 ? ((totalPrice - totalCost) / totalPrice) * 100 : 0

            return {
              ...shop,
              types: filteredTypes,
              totalAverageQuantity,
              totalQuantity,
              totalEventCount,
              totalCost,
              totalPrice,
              averageMargin: shopMargin,
            }
          })
          .filter(Boolean)
      }

      // category filter
      if (this.selectedMenuItemCategory !== 'all') {
        shopsToFilter = shopsToFilter
          .map((shop) => {
            const filteredTypes = (shop.types || [])
              .map((type) => {
                const filteredCategories = (type.categories || []).filter((cat) => cat.categoryName === this.selectedMenuItemCategory)
                if (!filteredCategories.length) return null

                const typeAvgQty = filteredCategories.reduce((sum, cat) => sum + (cat.averageQuantity || 0), 0)
                const typeTotalQty = filteredCategories.reduce((sum, cat) => sum + (cat.totalQuantity || 0), 0)
                const typeTotalCost = filteredCategories.reduce((sum, cat) => sum + (cat.totalCost || 0), 0)
                const typeTotalPrice = filteredCategories.reduce((sum, cat) => sum + (cat.totalPrice || 0), 0)
                const typeEventCount = filteredCategories.reduce((sum, cat) => sum + (cat.eventCount || 0), 0)
                const typeMargin = typeTotalPrice > 0 ? ((typeTotalPrice - typeTotalCost) / typeTotalPrice) * 100 : 0

                return {
                  ...type,
                  categories: filteredCategories,
                  averageQuantity: typeAvgQty,
                  totalQuantity: typeTotalQty,
                  eventCount: typeEventCount,
                  totalCost: typeTotalCost,
                  totalPrice: typeTotalPrice,
                  averageMargin: typeMargin,
                }
              })
              .filter(Boolean)

            if (!filteredTypes.length) return null

            const totalAverageQuantity = filteredTypes.reduce((sum, t) => sum + (t.averageQuantity || 0), 0)
            const totalQuantity = filteredTypes.reduce((sum, t) => sum + (t.totalQuantity || 0), 0)
            const totalCost = filteredTypes.reduce((sum, t) => sum + (t.totalCost || 0), 0)
            const totalPrice = filteredTypes.reduce((sum, t) => sum + (t.totalPrice || 0), 0)
            const totalEventCount = filteredTypes.reduce((sum, t) => sum + (t.eventCount || 0), 0)
            const shopMargin = totalPrice > 0 ? ((totalPrice - totalCost) / totalPrice) * 100 : 0

            return {
              ...shop,
              types: filteredTypes,
              totalAverageQuantity,
              totalQuantity,
              totalEventCount,
              totalCost,
              totalPrice,
              averageMargin: shopMargin,
            }
          })
          .filter(Boolean)
      }

      // search filter
      if (!String(this.searchText || '').trim()) return shopsToFilter

      const searchLower = String(this.searchText).toLowerCase()
      // Lot 0.5 — Selon `searchScope`, la chaîne ne matche que sur le champ
      // sélectionné (shop / type / category / item). En mode 'all' elle
      // matche partout (comportement legacy).
      const scope = this.searchScope || 'all'
      const matchShop = (s) => (scope === 'all' || scope === 'shop')
        && String(s).toLowerCase().includes(searchLower)
      const matchType = (s) => (scope === 'all' || scope === 'type')
        && String(s).toLowerCase().includes(searchLower)
      const matchCat = (s) => (scope === 'all' || scope === 'category')
        && String(s).toLowerCase().includes(searchLower)
      const matchItem = (s) => (scope === 'all' || scope === 'item')
        && String(s).toLowerCase().includes(searchLower)

      return shopsToFilter
        .map((shop) => {
          const shopNameMatch = matchShop(shop.shopName || '')

          const filteredTypes = (shop.types || [])
            .map((type) => {
              const typeNameMatch = matchType(type.typeName || '')

              const filteredCategories = (type.categories || [])
                .map((category) => {
                  const categoryNameMatch = matchCat(category.categoryName || '')

                  const filteredMenuItems = (category.menuItems || []).filter((item) =>
                    matchItem(item.menuItemName || '')
                  )

                  if (shopNameMatch || typeNameMatch || categoryNameMatch || filteredMenuItems.length) {
                    const menuItems = shopNameMatch || typeNameMatch || categoryNameMatch ? category.menuItems : filteredMenuItems
                    return {
                      ...category,
                      menuItems,
                      averageQuantity: menuItems.reduce((sum, i) => sum + (i.averageQuantity || 0), 0),
                      totalQuantity: menuItems.reduce((sum, i) => sum + (i.totalQuantity || 0), 0),
                      eventCount: menuItems.reduce((sum, i) => sum + (i.eventCount || 0), 0),
                    }
                  }
                  return null
                })
                .filter(Boolean)

              if (shopNameMatch || typeNameMatch || filteredCategories.length) {
                return {
                  ...type,
                  categories: filteredCategories,
                  averageQuantity: filteredCategories.reduce((sum, cat) => sum + (cat.averageQuantity || 0), 0),
                  totalQuantity: filteredCategories.reduce((sum, cat) => sum + (cat.totalQuantity || 0), 0),
                  eventCount: filteredCategories.reduce((sum, cat) => sum + (cat.eventCount || 0), 0),
                }
              }
              return null
            })
            .filter(Boolean)

          if (shopNameMatch || filteredTypes.length) {
            return {
              ...shop,
              types: filteredTypes,
              totalAverageQuantity: filteredTypes.reduce((sum, t) => sum + (t.averageQuantity || 0), 0),
              totalQuantity: filteredTypes.reduce((sum, t) => sum + (t.totalQuantity || 0), 0),
              totalEventCount: filteredTypes.reduce((sum, t) => sum + (t.eventCount || 0), 0),
            }
          }

          return null
        })
        .filter(Boolean)
    },

    filteredMenuItems() {
      let itemsToFilter = this.groupedMenuItems

      // type filter
      if (this.selectedMenuItemType !== 'all') {
        itemsToFilter = itemsToFilter.filter((menuItem) => {
          return (this.menuItemsByShop || []).some((shop) =>
            (shop.menuItems || []).some((i) => i.menuItemId === menuItem.menuItemId && i.type === this.selectedMenuItemType)
          )
        })
      }

      // category filter
      if (this.selectedMenuItemCategory !== 'all') {
        itemsToFilter = itemsToFilter.filter((menuItem) => {
          return (this.menuItemsByShop || []).some((shop) =>
            (shop.menuItems || []).some((i) => i.menuItemId === menuItem.menuItemId && i.category === this.selectedMenuItemCategory)
          )
        })
      }

      // search filter
      if (!String(this.searchText || '').trim()) return itemsToFilter

      const searchLower = String(this.searchText).toLowerCase()
      const scope = this.searchScope || 'all'

      return itemsToFilter
        .map((menuItem) => {
          const menuItemNameMatch = (scope === 'all' || scope === 'item')
            && String(menuItem.menuItemName || '').toLowerCase().includes(searchLower)

          const filteredShops = (menuItem.shops || []).filter((shop) =>
            (scope === 'all' || scope === 'shop')
              && String(shop.shopName || '').toLowerCase().includes(searchLower)
          )

          if (menuItemNameMatch || filteredShops.length) {
            const shops = menuItemNameMatch ? menuItem.shops : filteredShops
            return {
              ...menuItem,
              shops,
              totalAverageQuantity: shops.reduce((sum, s) => sum + (s.averageQuantity || 0), 0),
              totalQuantity: shops.reduce((sum, s) => sum + (s.totalQuantity || 0), 0),
              totalEventCount: shops.reduce((sum, s) => sum + (s.eventCount || 0), 0),
            }
          }

          return null
        })
        .filter(Boolean)
    },

    // -------- CHART (Recharts -> Chart.js Doughnut)
    menuTypeMetrics() {
      if (this.viewMode !== 'menu' || !(this.allMenuItems && this.allMenuItems.length)) return null

      const metrics = {
        Food: { cost: 0, price: 0 },
        Beverage: { cost: 0, price: 0 },
        Combo: { cost: 0, price: 0 },
        Overall: { cost: 0, price: 0 },
      }

      ;(this.menuItemsByShop || []).forEach((shop) => {
        ;(shop.menuItems || []).forEach((item) => {
          const details = this.getMenuItemDetails(item.menuItemId)
          if (!details) return

          const cost = details.cost ?? 0
          const price = details.averagePrice ?? details.basePrice ?? 0
          const type = item.type || 'Uncategorized'

          if (type === 'Food') {
            metrics.Food.cost += cost
            metrics.Food.price += price
          } else if (type === 'Beverage') {
            metrics.Beverage.cost += cost
            metrics.Beverage.price += price
          } else if (type === 'Combo') {
            metrics.Combo.cost += cost
            metrics.Combo.price += price
          }

          metrics.Overall.cost += cost
          metrics.Overall.price += price
        })
      })

      return metrics
    },

    menuMetricCards() {
      if (!this.menuTypeMetrics) return []

      const build = (key, label) => {
        const cost = this.menuTypeMetrics[key].cost
        const price = this.menuTypeMetrics[key].price
        const costPct = price > 0 ? (cost / price) * 100 : 0
        const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0

        return {
          key,
          label,
          cost,
          price,
          marginPercent: marginPct,
          chartData: {
            labels: ['Cost', 'Margin'],
            datasets: [
              {
                data: [costPct, marginPct],
                backgroundColor: ['#ef4444', '#10b981'],
                borderWidth: 0,
              },
            ],
          },
        }
      }

      return [build('Food', 'Food'), build('Beverage', 'Beverage'), build('Combo', 'Combo'), build('Overall', 'Overall')]
    },

    doughnutOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '40%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = typeof ctx.raw === 'number' ? ctx.raw : 0
                return `${ctx.label}: ${v.toFixed(1)}%`
              },
            },
          },
        },
      }
    },
  },

  watch: {
    // React useEffect -> Vue watch
    selectedTypeFilter: {
      immediate: true,
      handler(newVal) {
        const arr = Array.isArray(newVal) ? newVal : []
        if (arr.length === 1) this.selectedMenuItemType = arr[0]
        else if (arr.length === 0) this.selectedMenuItemType = 'all'
      },
    },
    selectedCategoryFilter: {
      immediate: true,
      handler(newVal) {
        const arr = Array.isArray(newVal) ? newVal : []
        if (arr.length === 1) this.selectedMenuItemCategory = arr[0]
        else if (arr.length === 0) this.selectedMenuItemCategory = 'all'
      },
    },
  },

  mounted() {
    // useIsMobile -> matchMedia
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mql = window.matchMedia('(max-width: 768px)')
    const handler = (e) => {
      this.isMobile = !!e.matches
    }

    this._mql = mql
    this._mqlHandler = handler

    handler(mql)
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', handler)
    else if (typeof mql.addListener === 'function') mql.addListener(handler)
  },

  beforeUnmount() {
    const mql = this._mql
    const handler = this._mqlHandler
    if (!mql || !handler) return

    if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', handler)
    else if (typeof mql.removeListener === 'function') mql.removeListener(handler)
  },

  methods: {
    // map lookup
    getMenuItemDetails(menuItemId) {
      return this.menuItemDetailsMap.get(menuItemId) || null
    },

    // local filters (single-select) + sync to parent callbacks
    handleTypeChange(newType) {
      this.selectedMenuItemType = newType
      this.selectedMenuItemCategory = 'all'

      if (this.onTypeFilterChange) this.onTypeFilterChange(newType === 'all' ? [] : [newType])
      if (this.onCategoryFilterChange) this.onCategoryFilterChange([])
    },

    handleCategoryChange(newCategory) {
      this.selectedMenuItemCategory = newCategory
      if (this.onCategoryFilterChange) this.onCategoryFilterChange(newCategory === 'all' ? [] : [newCategory])
    },

    // expansions
    toggleShop(shopId) {
      this.expandedShops = { ...this.expandedShops, [shopId]: !this.expandedShops[shopId] }
    },
    toggleType(shopId, typeName) {
      const key = `${shopId}-${typeName}`
      this.expandedTypes = { ...this.expandedTypes, [key]: !this.expandedTypes[key] }
    },
    toggleCategory(shopId, typeName, categoryName) {
      const key = `${shopId}-${typeName}-${categoryName}`
      this.expandedCategories = { ...this.expandedCategories, [key]: !this.expandedCategories[key] }
    },
    toggleMenuItem(menuItemId) {
      this.expandedMenuItems = { ...this.expandedMenuItems, [menuItemId]: !this.expandedMenuItems[menuItemId] }
    },

    // images
    getMenuItemPicture(menuItemId) {
      if (this.failedImages[menuItemId]) return FALLBACK_IMAGE
      const details = this.getMenuItemDetails(menuItemId)
      return details?.picture || FALLBACK_IMAGE
    },
    onMenuItemImageError(menuItemId) {
      this.failedImages = { ...this.failedImages, [menuItemId]: true }
    },

    // export
    createWorkbookData() {
      const workbook = XLSX.utils.book_new()

      if (this.tableView === 'shops') {
        ;(this.filteredShops || []).forEach((shop) => {
          const worksheetData = []

          if (this.viewMode === 'menu') worksheetData.push(['Menu Item', 'Cost', 'Price', 'Margin'])
          else if (this.viewMode === 'inventory') worksheetData.push(['Menu Item'])
          else worksheetData.push(['Menu Item', 'Avg Qty', 'Total Qty', 'Events'])

          ;(shop.types || []).forEach((type) => {
            ;(type.categories || []).forEach((category) => {
              ;(category.menuItems || []).forEach((item) => {
                if (this.viewMode === 'menu') {
                  const details = this.getMenuItemDetails(item.menuItemId)
                  const cost = details?.cost ?? 0
                  const price = details?.averagePrice ?? details?.basePrice ?? 0
                  const margin = details?.averageMargin ?? 0
                  worksheetData.push([item.menuItemName, cost.toFixed(2), price.toFixed(2), margin.toFixed(1) + '%'])
                } else if (this.viewMode === 'inventory') {
                  worksheetData.push([item.menuItemName])
                } else {
                  worksheetData.push([
                    item.menuItemName,
                    Math.ceil(item.averageQuantity || 0),
                    Math.floor(item.totalQuantity || 0),
                    item.eventCount || 0,
                  ])
                }
              })
            })
          })

          const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
          worksheet['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]

          const sheetName = String(shop.shopName || '').substring(0, 31).replace(/[:\\/?*\[\]]/g, '_')
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
        })
      } else {
        ;(this.filteredMenuItems || []).forEach((menuItem) => {
          const worksheetData = []

          if (this.viewMode === 'menu') worksheetData.push(['Shop'])
          else if (this.viewMode === 'inventory') worksheetData.push(['Shop'])
          else worksheetData.push(['Shop', 'Avg Qty', 'Total Qty', 'Events'])

          ;(menuItem.shops || []).forEach((shop) => {
            if (this.viewMode === 'menu') worksheetData.push([shop.shopName])
            else if (this.viewMode === 'inventory') worksheetData.push([shop.shopName])
            else
              worksheetData.push([
                shop.shopName,
                Math.ceil(shop.averageQuantity || 0),
                Math.floor(shop.totalQuantity || 0),
                shop.eventCount || 0,
              ])
          })

          const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
          worksheet['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]

          const sheetName = String(menuItem.menuItemName || '').substring(0, 31).replace(/[:\\/?*\[\]]/g, '_')
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
        })
      }

      return workbook
    },

    handleExportToExcel() {
      const workbook = this.createWorkbookData()

      const timestamp = new Date().toISOString().split('T')[0]
      const filename =
        this.tableView === 'shops' ? `menu-items-by-shop-${timestamp}.xlsx` : `shops-by-menu-item-${timestamp}.xlsx`

      XLSX.writeFile(workbook, filename)
      this.showExportDialog = false
    },

    handleExportToGoogleSheets() {
      const workbook = this.createWorkbookData()

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

      const timestamp = new Date().toISOString().split('T')[0]
      const filename = this.tableView === 'shops' ? `menu-items-by-shop-${timestamp}` : `shops-by-menu-item-${timestamp}`

      const downloadLink = document.createElement('a')
      downloadLink.href = URL.createObjectURL(blob)
      downloadLink.download = filename + '.xlsx'
      downloadLink.click()

      setTimeout(() => {
        window.open('https://docs.google.com/spreadsheets/create', '_blank')
      }, 500)

      this.showExportDialog = false
    },

    // passthrough click handler
    handleEventsClick(shopInfo, menuItemInfo) {
      if (this.onEventsClick) this.onEventsClick(shopInfo, menuItemInfo)
    },
  },
}
</script>
<style scoped>
/* Lot 0.5 � Toolbar Menu Items by Shop : pills blanches arrondies, recherche
   en pilule grise avec s�lecteur de p�rim�tre int�gr� (cf. capture d'�cran). */
.mibs-search {
  display: flex;
  align-items: center;
  height: 38px;
  background-color: #F3F4F6;
  border: 1px solid #E5E7EB;
  border-radius: 9999px;
  padding-right: 4px;
}
.mibs-search-input {
  flex: 1;
  height: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  padding: 0 8px 0 36px;
  font-size: 14px;
  color: #111827;
}
.mibs-search-input::placeholder {
  color: #6B7280;
}
.mibs-search-scope {
  height: 28px;
  border: 0;
  background-color: #ffffff;
  border-radius: 9999px;
  padding: 0 26px 0 10px;
  font-size: 12px;
  color: #111827;
  margin-right: 8px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236B7280'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  background-size: 14px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.mibs-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  background-color: #ffffff;
  border: 1px solid #E5E7EB;
  border-radius: 9999px;
  font-size: 14px;
  color: #111827;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.mibs-pill:hover {
  background-color: #F9FAFB;
  border-color: #D1D5DB;
}
.mibs-pill-select {
  padding-right: 12px;
}
.mibs-pill-select select {
  border: 0;
  background: transparent;
  outline: 0;
  font-size: 14px;
  color: #111827;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  padding-right: 18px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236B7280'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0 center;
  background-size: 14px;
}
</style>
