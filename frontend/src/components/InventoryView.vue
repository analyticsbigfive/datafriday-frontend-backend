<template>
  <div class="h-full flex flex-col bg-white dark:bg-gray-950">
    <!-- If countingShop is set AND on desktop (not mobile), show counting interface inline -->
    <template v-if="countingShop && !isMobile">
      <InventoryCountingInterface
        :shop="countingShop"
        :counts="inventoryCounts[countingShop.element.id] || {}"
        :onUpdateCount="(itemId, updates) => handleUpdateCount(countingShop.element.id, itemId, updates)"
        :onClose="() => { countingShop = null }"
        :spaceId="currentSpace?.id"
        :lastEventId="lastEventId || null"
        :lastEventName="lastEventName || null"
        :isInline="true"
      />
    </template>

    <!-- Regular view -->
    <template v-else>
      <!-- Empty state / Loading -->
      <template v-if="shopsWithInventory.length === 0 && storagesWithInventory.length === 0">
        <div class="h-full flex items-center justify-center bg-white dark:bg-gray-950">
          <div v-if="marketPricesLoading" class="text-center space-y-3">
            <Loader2 class="w-16 h-16 mx-auto text-blue-500 animate-spin" />
            <h3 class="text-lg dark:text-gray-100">Loading Inventory...</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 max-w-md">
              Fetching market prices and inventory data
            </p>
          </div>

          <div v-else class="text-center space-y-3">
            <Package class="w-16 h-16 mx-auto text-gray-400" />
            <h3 class="text-lg dark:text-gray-100">No Inventory Data</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 max-w-md">
              Configure menu items for your shops in Space Menus to see inventory data here.
            </p>
          </div>
        </div>
      </template>

      <template v-else>
        <!-- Tabs (simple) -->
        <div class="px-6 pt-4">
          <div class="inline-flex rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
            <button
              type="button"
              class="px-3 py-2 text-sm flex items-center gap-2"
              :class="activeTab === 'shops' ? 'bg-gray-100 dark:bg-gray-900' : 'bg-transparent'"
              @click="activeTab = 'shops'"
            >
              <Package class="w-4 h-4" />
              F&amp;B Shops
              <span class="ml-1 text-xs opacity-70">
                ({{ countingStatusTab === 'to-count' ? shopsToCount.length : shopsCounted.length }})
              </span>
            </button>

            <button
              type="button"
              class="px-3 py-2 text-sm flex items-center gap-2 border-l border-gray-200 dark:border-gray-800"
              :class="activeTab === 'storage' ? 'bg-gray-100 dark:bg-gray-900' : 'bg-transparent'"
              @click="activeTab = 'storage'"
            >
              <Warehouse class="w-4 h-4" />
              Storage
              <span class="ml-1 text-xs opacity-70">
                ({{ countingStatusTab === 'to-count' ? storagesToCount.length : storagesCounted.length }})
              </span>
            </button>
          </div>
        </div>

        <!-- Shops tab -->
        <div v-if="activeTab === 'shops'" class="flex-1 overflow-hidden flex flex-col">
          <div class="flex-1 overflow-y-auto px-6 py-4">
            <template v-if="countingStatusTab === 'to-count'">
              <template v-if="shopsToCount.length === 0">
                <div class="text-center py-12">
                  <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                    <Check class="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                    All Shops Counted!
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Every shop has been fully counted. Great work!
                  </p>
                </div>
              </template>

              <template v-else>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div
                    v-for="shop in shopsToCount"
                    :key="shop.element.id"
                    class="border border-orange-200 dark:border-orange-800 rounded-lg overflow-hidden bg-white dark:bg-gray-950 flex flex-col"
                  >
                    <div class="p-4 border-b border-orange-200 dark:border-orange-800 flex items-center justify-between bg-orange-50 dark:bg-orange-900/10">
                      <h3 class="text-lg font-medium dark:text-gray-100">
                        {{ shop.element.name || 'Untitled Shop' }}
                      </h3>
                      <button
                        type="button"
                        class="h-8 w-8 rounded bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center"
                        @click="handleStartCounting(shop)"
                      >
                        <Play class="w-4 h-4" />
                      </button>
                    </div>

                    <div v-if="shop.element.image" class="relative h-32">
                      <img
                        :src="shop.element.image"
                        :alt="shop.element.name || 'Shop'"
                        class="w-full h-full object-cover"
                      />
                    </div>

                    <div class="p-4 bg-orange-50 dark:bg-orange-900/10 border-t border-orange-200 dark:border-orange-800">
                      <p class="text-sm text-orange-700 dark:text-orange-300 text-center font-medium">
                        {{ getShopCountedItems(shop.element.id) }} out of {{ shop.consolidatedInventory.length }} inventory items
                      </p>
                    </div>
                  </div>
                </div>
              </template>
            </template>

            <template v-else>
              <template v-if="shopsCounted.length === 0">
                <div class="text-center py-12">
                  <Package class="w-16 h-16 mx-auto text-gray-400 mb-3" />
                  <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                    No Counted Shops Yet
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Shops will appear here once all their items are counted.
                  </p>
                </div>
              </template>

              <template v-else>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div
                    v-for="shop in shopsCounted"
                    :key="shop.element.id"
                    class="border border-green-200 dark:border-green-800 rounded-lg overflow-hidden bg-white dark:bg-gray-950 flex flex-col"
                  >
                    <div class="p-4 border-b border-green-200 dark:border-green-800 flex items-center justify-between bg-green-50 dark:bg-green-900/10">
                      <div class="flex items-center gap-2">
                        <Check class="w-5 h-5 text-green-600 dark:text-green-400" />
                        <h3 class="text-lg font-medium dark:text-gray-100">
                          {{ shop.element.name || 'Untitled Shop' }}
                        </h3>
                      </div>
                      <button
                        type="button"
                        class="h-8 w-8 rounded bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center"
                        @click="handleStartCounting(shop)"
                      >
                        <Play class="w-4 h-4" />
                      </button>
                    </div>

                    <div v-if="shop.element.image" class="relative h-32">
                      <img
                        :src="shop.element.image"
                        :alt="shop.element.name || 'Shop'"
                        class="w-full h-full object-cover"
                      />
                      <div class="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                        <Check class="w-3 h-3" />
                        Counted
                      </div>
                    </div>

                    <div class="p-4 bg-green-50 dark:bg-green-900/10 border-t border-green-200 dark:border-green-800">
                      <p class="text-sm text-green-700 dark:text-green-300 text-center font-medium">
                        ✓ All {{ shop.consolidatedInventory.length }} items counted
                      </p>
                    </div>
                  </div>
                </div>
              </template>
            </template>
          </div>
        </div>

        <!-- Storage tab -->
        <div v-else class="flex-1 overflow-y-auto px-6 pb-4 pt-4">
          <template v-if="storagesToShow.length === 0">
            <template v-if="countingStatusTab === 'to-count'">
              <div class="text-center py-12">
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                  <Check class="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                  All Storage Counted!
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Every storage unit has been fully counted. Great work!
                </p>
              </div>
            </template>

            <template v-else>
              <div class="text-center py-12">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  No storage units have been fully counted yet.
                </p>
              </div>
            </template>
          </template>

          <template v-else>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div
                v-for="storage in storagesToShow"
                :key="storage.element.id"
                class="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900"
              >
                <div class="relative h-32 bg-gradient-to-br from-blue-500 to-purple-600">
                  <img
                    v-if="storage.element.image"
                    :src="storage.element.image"
                    :alt="storage.element.name || 'Storage'"
                    class="w-full h-full object-cover"
                  />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                    <div class="text-white">
                      <h3 class="text-lg">
                        {{ storage.element.name || 'Untitled Storage' }}
                      </h3>
                      <p class="text-xs opacity-90">
                        {{ storage.storageInventory.length + storage.merchInventory.length }} inventory items
                      </p>
                    </div>
                  </div>
                </div>

                <div class="p-4 space-y-3">
                  <div
                    v-for="inventoryItem in getStorageItemsToRender(storage)"
                    :key="inventoryItem.id"
                    class="bg-white dark:bg-gray-950 rounded p-3 space-y-2 border border-gray-200 dark:border-gray-800"
                  >
                    <div class="flex items-center gap-2">
                      <span class="text-sm flex-1 dark:text-gray-100">
                        {{ inventoryItem.name }}
                      </span>

                      <input
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        class="w-20 h-8 border border-gray-200 dark:border-gray-800 rounded bg-transparent px-2 text-sm"
                        :value="getExistingInventoryQuantity(storage.element, inventoryItem.name)"
                        @input="(e) => handleUpdateInventoryQuantity(storage.element.id, inventoryItem.id, inventoryItem.name, parseFloat(e.target.value) || 0)"
                      />
                    </div>

                    <template v-if="hasExistingInventoryItem(storage.element, inventoryItem.name)">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-600 dark:text-gray-400 w-12">
                          {{ getCurrentStock(storage.element, inventoryItem.name) }}
                        </span>
                        <div
                          class="flex-1 h-3 rounded-full overflow-hidden"
                          :style="{ background: 'linear-gradient(to right, #ef4444, #f97316, #22c55e)' }"
                        >
                          <div
                            class="h-full bg-gray-200 dark:bg-gray-700"
                            :style="{
                              marginLeft: `${getStockPercentage(storage.element, inventoryItem.name)}%`,
                              transition: 'margin-left 0.3s ease'
                            }"
                          />
                        </div>
                      </div>
                    </template>

                    <template v-if="inventoryItem.usedIn && inventoryItem.usedIn.length > 0">
                      <div class="pt-1">
                        <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Used in:</p>
                        <div class="flex flex-wrap gap-1">
                          <span
                            v-for="(usage, idx) in inventoryItem.usedIn"
                            :key="idx"
                            class="text-xs bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded"
                          >
                            {{ usage.fbElementName }} - {{ usage.menuItemName }}
                          </span>
                        </div>
                      </div>
                    </template>
                  </div>

                  <button
                    v-if="storage.storageInventory.length > 3"
                    type="button"
                    class="w-full h-9 border border-gray-200 dark:border-gray-800 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-sm flex items-center justify-center"
                    @click="toggleShopExpansion(storage.element.id)"
                  >
                    <template v-if="isExpanded(storage.element.id)">
                      <ChevronUp class="w-4 h-4 mr-1" />
                      Show Less
                    </template>
                    <template v-else>
                      <ChevronDown class="w-4 h-4 mr-1" />
                      Show All ({{ storage.storageInventory.length }} items)
                    </template>
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Counting Interface for Mobile (overlay) -->
        <div
          v-if="countingShop && isMobile"
          class="fixed inset-0 z-50 bg-black/50"
        >
          <div class="absolute inset-0 bg-white dark:bg-gray-950">
            <InventoryCountingInterface
              :shop="countingShop"
              :counts="inventoryCounts[countingShop.element.id] || {}"
              :onUpdateCount="(itemId, updates) => handleUpdateCount(countingShop.element.id, itemId, updates)"
              :onClose="() => { countingShop = null }"
              :spaceId="currentSpace?.id"
              :lastEventId="lastEventId || null"
              :lastEventName="lastEventName || null"
              :isInline="false"
            />
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script>
import * as api from '../utils/api'
/*import {
  buildConsolidatedInventory,
  buildStorageInventory,
  buildMerchStorageInventory,
  enrichInventoryItemsWithImages,
} from '../utils/inventoryUtils'*/
//import { InventoryCountingInterface } from './InventoryCountingInterface'
import {
  Search,
  Package,
  ChevronDown,
  ChevronUp,
  Warehouse,
  Play,
  X,
  Check,
  Loader2,
} from 'lucide-vue-next'

export default {
  name: 'InventoryView',
  components: {
    //InventoryCountingInterface,
    Search,
    Package,
    ChevronDown,
    ChevronUp,
    Warehouse,
    Play,
    X,
    Check,
    Loader2,
  },
  props: {
    floors: { type: Array, required: true, default: () => [] },
    forecourt: { type: Object, default: null },
    externalMerch: { type: Object, default: null },
    spaceMenuConfig: { type: Object, default: null },
    currentSpace: { type: Object, default: null },
    currentConfigId: { type: String, default: null },
    onUpdateElement: { type: Function, required: true },
    searchQuery: { type: String, required: true, default: '' },
    onSearchChange: { type: Function, required: true },
    lastEventId: { type: String, default: null },
    lastEventName: { type: String, default: null },
    onInventoryDataChange: { type: Function, default: null },
    onStatusCountsChange: { type: Function, default: null },
    allMenuItems: { type: Array, default: () => [] },
    countingStatusTab: { type: String, required: true, default: 'to-count' }, // 'to-count' | 'counted'
    onCountingStatusChange: { type: Function, required: true },
  },

  data() {
    return {
      isMobile: false,
      _mql: null,
      _mqlHandler: null,

      expandedShops: {},

      countingShop: null,

      inventoryCounts: {},

      marketPrices: [],
      marketPricesLoading: true,

      activeTab: 'shops', // 'shops' | 'storage'
    }
  },

  computed: {
    shopsWithInventory() {
      const shops = []

      if (this.marketPricesLoading) return shops
      if (!this.spaceMenuConfig || (this.allMenuItems || []).length === 0) return shops

      const processElement = (element) => {
        if (!element) return
        if (element.type !== 'shop' && element.type !== 'merchshop') return

        let availableMenuItems = []

        if (this.spaceMenuConfig[element.id]) {
          const elementMenuItems = this.spaceMenuConfig[element.id]
          const checkedMenuItemIds = Object.entries(elementMenuItems)
            .filter(([_, isChecked]) => !!isChecked)
            .map(([menuItemId]) => menuItemId)

          availableMenuItems = checkedMenuItemIds
            .map((id) => (this.allMenuItems || []).find((item) => item.id === id))
            .filter(Boolean)
        }

        if (availableMenuItems.length > 0) {
          const consolidatedInventory = buildConsolidatedInventory(
            availableMenuItems,
            this.allMenuItems || [],
            this.marketPrices || [],
            true
          )

          shops.push({
            element,
            availableMenuItems,
            consolidatedInventory,
          })
        }
      }

      ;(this.floors || []).forEach((floor) => {
        ;(floor.elements || []).forEach(processElement)
      })

      if (this.forecourt) {
        ;(this.forecourt.elements || []).forEach(processElement)
      }

      if (this.externalMerch) {
        ;(this.externalMerch.elements || []).forEach(processElement)
      }

      shops.sort((a, b) => String(a.element?.name || '').localeCompare(String(b.element?.name || '')))
      return shops
    },

    storagesWithInventory() {
      const storages = []
      if ((this.allMenuItems || []).length === 0) return storages

      const allFBElements = (this.shopsWithInventory || []).map((shop) => ({
        id: shop.element.id,
        name: shop.element.name || 'Untitled Shop',
        availableMenuItems: shop.availableMenuItems,
      }))

      const allMerchElements = (this.shopsWithInventory || [])
        .filter((shop) => shop.element.type === 'merchshop')
        .map((shop) => ({
          id: shop.element.id,
          name: shop.element.name || 'Untitled Merch Shop',
          merchItems: shop.element.menuItems || [],
        }))

      const processStorageElement = (element) => {
        if (!element || element.type !== 'storage') return

        const storageInventory = buildStorageInventory(
          element.storageType || [],
          allFBElements,
          this.allMenuItems || [],
          element.selectedShops
        )

        let merchInventory = []
        if ((element.storageType || []).some((t) => t === 'merch' || t === 'material')) {
          merchInventory = buildMerchStorageInventory(allMerchElements)
        }

        if ((storageInventory || []).length > 0 || (merchInventory || []).length > 0) {
          storages.push({
            element,
            storageInventory,
            merchInventory,
          })
        }
      }

      ;(this.floors || []).forEach((floor) => {
        ;(floor.elements || []).forEach(processStorageElement)
      })

      if (this.forecourt) {
        ;(this.forecourt.elements || []).forEach(processStorageElement)
      }

      if (this.externalMerch) {
        ;(this.externalMerch.elements || []).forEach(processStorageElement)
      }

      storages.sort((a, b) => String(a.element?.name || '').localeCompare(String(b.element?.name || '')))
      return storages
    },

    filteredShops() {
      const q = String(this.searchQuery || '').trim()
      if (!q) return this.shopsWithInventory
      const lowerQuery = q.toLowerCase()

      return (this.shopsWithInventory || []).filter((shop) => {
        if (String(shop.element?.name || '').toLowerCase().includes(lowerQuery)) return true

        if ((shop.consolidatedInventory || []).some((item) => String(item.name || '').toLowerCase().includes(lowerQuery))) return true

        if (
          (shop.consolidatedInventory || []).some((item) =>
            (item.usedIn || []).some((menuItem) => String(menuItem.name || '').toLowerCase().includes(lowerQuery))
          )
        ) {
          return true
        }

        return false
      })
    },

    filteredStorages() {
      const q = String(this.searchQuery || '').trim()
      if (!q) return this.storagesWithInventory
      const lowerQuery = q.toLowerCase()

      return (this.storagesWithInventory || []).filter((storage) => {
        if (String(storage.element?.name || '').toLowerCase().includes(lowerQuery)) return true

        if ((storage.storageInventory || []).some((item) => String(item.name || '').toLowerCase().includes(lowerQuery))) return true
        if ((storage.merchInventory || []).some((item) => String(item.name || '').toLowerCase().includes(lowerQuery))) return true

        if (
          (storage.storageInventory || []).some((item) =>
            (item.usedIn || []).some(
              (usage) =>
                String(usage.fbElementName || '').toLowerCase().includes(lowerQuery) ||
                String(usage.menuItemName || '').toLowerCase().includes(lowerQuery)
            )
          )
        ) {
          return true
        }

        if (
          (storage.merchInventory || []).some((item) =>
            (item.usedIn || []).some((usage) => String(usage.merchShopName || '').toLowerCase().includes(lowerQuery))
          )
        ) {
          return true
        }

        return false
      })
    },

    shopsToCount() {
      const toCount = []
      ;(this.filteredShops || []).forEach((shop) => {
        const shopCounts = this.inventoryCounts[shop.element.id] || {}
        const totalItems = (shop.consolidatedInventory || []).length

        const allItemsCounted =
          totalItems > 0 &&
          (shop.consolidatedInventory || []).every((item) => shopCounts[item.id]?.isCounted === true)

        if (!allItemsCounted) toCount.push(shop)
      })
      return toCount
    },

    shopsCounted() {
      const counted = []
      ;(this.filteredShops || []).forEach((shop) => {
        const shopCounts = this.inventoryCounts[shop.element.id] || {}
        const totalItems = (shop.consolidatedInventory || []).length

        const allItemsCounted =
          totalItems > 0 &&
          (shop.consolidatedInventory || []).every((item) => shopCounts[item.id]?.isCounted === true)

        if (allItemsCounted) counted.push(shop)
      })
      return counted
    },

    storagesToCount() {
      const toCount = []
      ;(this.filteredStorages || []).forEach((storage) => {
        const storageCounts = this.inventoryCounts[storage.element.id] || {}
        const allItems = [...(storage.storageInventory || []), ...(storage.merchInventory || [])]
        const countedItems = allItems.filter((item) => storageCounts[item.id]?.isCounted).length

        if (!(countedItems === allItems.length && allItems.length > 0)) toCount.push(storage)
      })
      return toCount
    },

    storagesCounted() {
      const counted = []
      ;(this.filteredStorages || []).forEach((storage) => {
        const storageCounts = this.inventoryCounts[storage.element.id] || {}
        const allItems = [...(storage.storageInventory || []), ...(storage.merchInventory || [])]
        const countedItems = allItems.filter((item) => storageCounts[item.id]?.isCounted).length

        if (countedItems === allItems.length && allItems.length > 0) counted.push(storage)
      })
      return counted
    },

    storagesToShow() {
      return this.countingStatusTab === 'to-count' ? this.storagesToCount : this.storagesCounted
    },
  },

  watch: {
    lastEventId: {
      immediate: true,
      handler() {
        this.loadInventory()
      },
    },
    currentSpace: {
      deep: true,
      immediate: true,
      handler() {
        this.loadInventory()
      },
    },

    inventoryCounts: {
      deep: true,
      handler() {
        if (this.onInventoryDataChange) {
          this.onInventoryDataChange(this.inventoryCounts, this.shopsWithInventory)
        }
      },
    },

    shopsWithInventory: {
      deep: true,
      handler() {
        if (this.onInventoryDataChange) {
          this.onInventoryDataChange(this.inventoryCounts, this.shopsWithInventory)
        }
      },
    },

    shopsToCount() {
      this.notifyStatusCounts()
    },
    shopsCounted() {
      this.notifyStatusCounts()
    },
    storagesToCount() {
      this.notifyStatusCounts()
    },
    storagesCounted() {
      this.notifyStatusCounts()
    },
  },

  mounted() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mql = window.matchMedia('(max-width: 768px)')
      const handler = (e) => {
        this.isMobile = !!e.matches
      }
      this._mql = mql
      this._mqlHandler = handler
      handler(mql)
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', handler)
      else if (typeof mql.addListener === 'function') mql.addListener(handler)
    }

    this.loadMarketPrices()
  },

  beforeUnmount() {
    const mql = this._mql
    const handler = this._mqlHandler
    if (mql && handler) {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', handler)
      else if (typeof mql.removeListener === 'function') mql.removeListener(handler)
    }
  },

  methods: {
    async loadMarketPrices() {
      try {
        this.marketPricesLoading = true
        console.log('[INVENTORY] Loading market prices for image lookup...')
        const prices = await api.getAllMarketPrices()
        this.marketPrices = prices || []
        console.log('[INVENTORY] Loaded', (prices || []).length, 'market price items for image lookup')
      } catch (error) {
        console.warn('[INVENTORY] Could not load market prices for images:', error)
        this.marketPrices = []
      } finally {
        this.marketPricesLoading = false
      }
    },

    async loadInventory() {
      const spaceId = this.currentSpace?.id
      const eventId = this.lastEventId

      if (!eventId || !spaceId) {
        console.log('[INVENTORY] Cannot load - no event ID or space ID available')
        return
      }

      try {
        console.log('[INVENTORY] Loading inventory for space:', spaceId, 'event:', eventId)
        const response = await api.getInventory(spaceId, eventId)

        if (response && response.inventoryItems) {
          console.log(
            '[INVENTORY] Loaded inventory from database with',
            Object.keys(response.inventoryItems).length,
            'shops'
          )

          const loadedCounts = {}

          Object.entries(response.inventoryItems).forEach(([shopId, items]) => {
            loadedCounts[shopId] = {}
            Object.entries(items || {}).forEach(([itemId, item]) => {
              loadedCounts[shopId][itemId] = {
                itemId: item.itemId,
                packedUnits: item.packedUnits || 0,
                looseUnits: item.looseUnits || 0,
                isCounted: item.isCounted || false,
              }
            })
          })

          this.inventoryCounts = loadedCounts
          console.log('[INVENTORY] Successfully loaded', Object.keys(loadedCounts).length, 'shops from saved inventory')
        }
      } catch (error) {
        if (error instanceof Error && !String(error.message || '').includes('404')) {
          console.error('[INVENTORY] Error loading inventory:', error)
        } else {
          console.log('[INVENTORY] No saved inventory found for this event - starting fresh')
        }
      }
    },

    notifyStatusCounts() {
      if (!this.onStatusCountsChange) return
      const totalToCount = this.shopsToCount.length + this.storagesToCount.length
      const totalCounted = this.shopsCounted.length + this.storagesCounted.length
      this.onStatusCountsChange(totalToCount, totalCounted)
    },

    isExpanded(id) {
      return !!this.expandedShops[id]
    },

    toggleShopExpansion(id) {
      this.expandedShops = { ...this.expandedShops, [id]: !this.expandedShops[id] }
    },

    handleStartCounting(shop) {
      const enrichedInventory = enrichInventoryItemsWithImages(
        shop.consolidatedInventory,
        this.allMenuItems || [],
        this.marketPrices || []
      )

      const enrichedShop = {
        ...shop,
        consolidatedInventory: enrichedInventory,
      }

      if (!this.inventoryCounts[enrichedShop.element.id]) {
        const initialCounts = {}
        ;(enrichedShop.consolidatedInventory || []).forEach((item) => {
          initialCounts[item.id] = {
            itemId: item.id,
            packedUnits: 0,
            looseUnits: 0,
            isCounted: false,
          }
        })

        this.inventoryCounts = {
          ...this.inventoryCounts,
          [enrichedShop.element.id]: initialCounts,
        }
      }

      this.countingShop = enrichedShop
    },

    handleUpdateCount(shopId, itemId, updates) {
      const prevShopCounts = this.inventoryCounts[shopId] || {}
      const prevItemCount = prevShopCounts[itemId] || { itemId, packedUnits: 0, looseUnits: 0, isCounted: false }

      const newCounts = {
        ...this.inventoryCounts,
        [shopId]: {
          ...prevShopCounts,
          [itemId]: {
            ...prevItemCount,
            itemId,
            ...updates,
          },
        },
      }

      this.inventoryCounts = newCounts
      this.saveInventoryToDatabase(newCounts)
    },

    async saveInventoryToDatabase(counts) {
      if (!this.lastEventId || !this.lastEventName) {
        console.log('[INVENTORY] Cannot save - no event ID/name available')
        return
      }

      if (!this.currentSpace?.id) {
        console.log('[INVENTORY] Cannot save - no space ID available')
        return
      }

      try {
        const inventoryItems = {}

        Object.entries(counts || {}).forEach(([shopId, shopCounts]) => {
          inventoryItems[shopId] = {}
          Object.entries(shopCounts || {}).forEach(([itemId, count]) => {
            const shop = (this.shopsWithInventory || []).find((s) => s.element.id === shopId)
            const item = shop?.consolidatedInventory?.find((i) => i.id === itemId)

            inventoryItems[shopId][itemId] = {
              itemId,
              itemName: item?.name || 'Unknown Item',
              packedUnits: count.packedUnits,
              looseUnits: count.looseUnits,
              totalUnits: (count.packedUnits || 0) + (count.looseUnits || 0),
              isCounted: !!count.isCounted,
              picture: item?.picture,
            }
          })
        })

        const inventoryData = {
          spaceId: this.currentSpace.id,
          eventId: this.lastEventId,
          eventName: this.lastEventName,
          inventoryItems,
          lastUpdated: new Date().toISOString(),
        }

        await api.saveInventory(inventoryData)
        console.log('[INVENTORY] Saved inventory to database for event:', this.lastEventName)
      } catch (error) {
        console.error('[INVENTORY] Error saving inventory to database:', error)
      }
    },

    handleUpdateInventoryQuantity(elementId, inventoryItemId, inventoryItemName, quantity) {
      const shop = (this.shopsWithInventory || []).find((s) => s.element.id === elementId)
      if (!shop) return

      const inventoryItems = shop.element.inventoryItems || []
      const existingItem = inventoryItems.find((item) => item.name === inventoryItemName)

      if (existingItem) {
        const updatedInventoryItems = inventoryItems.map((item) =>
          item.name === inventoryItemName ? { ...item, quantity } : item
        )
        this.onUpdateElement(elementId, { inventoryItems: updatedInventoryItems })
      } else {
        const newItem = {
          id: inventoryItemId,
          name: inventoryItemName,
          quantity,
          initialQuantity: quantity,
        }
        this.onUpdateElement(elementId, { inventoryItems: [...inventoryItems, newItem] })
      }
    },

    getShopCountedItems(shopId) {
      const shopCounts = this.inventoryCounts[shopId] || {}
      return Object.values(shopCounts).filter((c) => c && c.isCounted).length
    },

    getStorageItemsToRender(storage) {
      const expanded = this.isExpanded(storage.element.id)
      const list = storage.storageInventory || []
      return expanded ? list : list.slice(0, 3)
    },

    findExistingInventoryItem(element, inventoryItemName) {
      const items = element?.inventoryItems || []
      return items.find((i) => i.name === inventoryItemName) || null
    },

    hasExistingInventoryItem(element, inventoryItemName) {
      const it = this.findExistingInventoryItem(element, inventoryItemName)
      return !!(it && it.quantity)
    },

    getExistingInventoryQuantity(element, inventoryItemName) {
      const it = this.findExistingInventoryItem(element, inventoryItemName)
      return it ? it.quantity : ''
    },

    getCurrentStock(element, inventoryItemName) {
      const it = this.findExistingInventoryItem(element, inventoryItemName)
      const qty = it?.quantity || 0
      return Math.floor(qty * 0.6)
    },

    getStockPercentage(element, inventoryItemName) {
      const it = this.findExistingInventoryItem(element, inventoryItemName)
      const qty = it?.quantity || 0
      if (!qty) return 0
      const currentStock = this.getCurrentStock(element, inventoryItemName)
      return (currentStock / qty) * 100
    },
  },
}
</script>