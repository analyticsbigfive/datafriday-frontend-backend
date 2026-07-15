<template>
  <div class="space-y-6">
    <Card class="p-6 dark:bg-gray-800 dark:border-gray-700">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold dark:text-gray-100">Menu Item Revenue Analysis</h3>

        <div class="flex gap-2">
          <template v-if="menuRevenueStatus === 'complete'">
            <Button
              variant="outline"
              size="sm"
              :disabled="isDeleting"
              class="dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
              @click="handleDeleteOldData"
            >
              <Loader2 v-if="isDeleting" class="h-4 w-4 mr-2 animate-spin" />
              <Trash2 v-else class="h-4 w-4 mr-2" />
              Delete Old Data
            </Button>

            <Button
              variant="outline"
              size="sm"
              :disabled="isDeleting"
              class="dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
              @click="onCalculateMenuRevenue"
            >
              <RefreshCw class="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </template>
        </div>
      </div>

      <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Calculate revenue breakdown for each mapped menu item across shops and events. Process one menu item at a time
        to see detailed results.
      </p>

      <!-- Idle State -->
      <div v-if="menuRevenueStatus === 'idle'" class="text-center py-12">
        <Package class="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
        <p class="text-gray-600 dark:text-gray-400 mb-4">Ready to calculate menu item revenue</p>
        <Button
          class="dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white"
          @click="onCalculateMenuRevenue"
        >
          Start
        </Button>
      </div>

      <!-- Loading State -->
      <div v-else-if="menuRevenueStatus === 'loading'" class="text-center py-12">
        <Loader2 class="h-12 w-12 text-blue-600 dark:text-blue-400 mx-auto mb-4 animate-spin" />
        <p class="text-gray-600 dark:text-gray-400">Loading menu revenue data...</p>
      </div>

      <!-- Processing State -->
      <div v-else-if="menuRevenueStatus === 'processing'" class="space-y-6">
        <div
          v-if="allMenuItems.length > 0"
          class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold dark:text-gray-100">Processing Menu Items</p>
              <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {{
                  currentMenuItemIndex >= 0
                    ? `Processed ${currentMenuItemIndex + 1} of ${allMenuItems.length} menu items`
                    : `Ready to process ${allMenuItems.length} menu items`
                }}
              </p>
            </div>

            <div class="text-right">
              <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {{ currentMenuItemIndex >= 0 ? currentMenuItemIndex + 1 : 0 }}/{{ allMenuItems.length }}
              </p>

              <p
                v-if="processedMenuItemsData.length > 0"
                class="text-sm font-semibold text-green-600 dark:text-green-500 mt-1"
              >
                {{
                  formatCurrency(
                    processedMenuItemsData.reduce((sum, item) => sum + (item.totalRevenue || 0), 0)
                  )
                }}
              </p>
            </div>
          </div>
        </div>

        <!-- Current Menu Item Being Processed -->
        <Card
          v-if="currentMenuItemIndex >= 0 && currentMenuItemIndex < allMenuItems.length"
          :class="[
            'p-4',
            currentMenuItemProcessing
              ? 'bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800'
              : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          ]"
        >
          <div class="flex items-center gap-3">
            <Loader2
              v-if="currentMenuItemProcessing"
              class="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin"
            />
            <CheckCircle v-else class="h-5 w-5 text-green-600 dark:text-green-500" />

            <div>
              <p class="font-semibold dark:text-gray-100">
                {{ currentMenuItemProcessing ? 'Processing' : 'Processed' }}:
                {{ allMenuItems[currentMenuItemIndex].name }}
              </p>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{
                  currentMenuItemProcessing
                    ? 'Calculating revenue across all shops and events...'
                    : 'Revenue calculation complete'
                }}
              </p>
            </div>
          </div>
        </Card>

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <Button
            v-if="currentMenuItemIndex < 0 && allMenuItems.length > 0"
            :disabled="currentMenuItemProcessing"
            class="dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white"
            @click="onStartProcessing"
          >
            Start Processing
          </Button>

          <Button
            v-if="currentMenuItemIndex >= 0 && currentMenuItemIndex < allMenuItems.length - 1 && !currentMenuItemProcessing"
            class="dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white"
            @click="onProcessNextMenuItem"
          >
            <ArrowRight class="h-4 w-4 mr-2" />
            Process Next Menu Item
          </Button>

          <Button
            v-if="currentMenuItemIndex >= allMenuItems.length - 1 && processedMenuItemsData.length === allMenuItems.length"
            :disabled="currentMenuItemProcessing"
            class="dark:bg-green-600 dark:hover:bg-green-700 dark:text-white"
            @click="onFinishProcessing"
          >
            <CheckCircle class="h-4 w-4 mr-2" />
            Finish Processing
          </Button>
        </div>

        <!-- Processed Menu Items - Nested Collapsible Structure -->
        <div v-if="processedMenuItemsData.length > 0" class="space-y-3 mt-6">
          <Card
            v-for="item in processedMenuItemsData"
            :key="item.menuItemId"
            class="dark:bg-gray-900 dark:border-gray-700"
          >
            <button
              class="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="toggleProcessedItem(item.menuItemId)"
            >
              <div class="flex items-center gap-3">
                <Package class="h-5 w-5 text-green-600 dark:text-green-500" />
                <div class="text-left">
                  <p class="font-semibold dark:text-gray-100">{{ item.menuItemName }}</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    {{ item.shopBreakdowns?.length || 0 }} shops • {{ item.totalQuantity?.toLocaleString() || 0 }} qty •
                    {{ item.totalTransactions }} transactions
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-4">
                <div class="text-right">
                  <p class="text-lg font-bold text-green-600 dark:text-green-500">
                    {{ formatCurrency(item.totalRevenue) }}
                  </p>
                  <p class="text-xs text-blue-600 dark:text-blue-400">
                    {{ item.totalQuantity?.toLocaleString() || 0 }} items
                  </p>
                </div>

                <ChevronDown
                  v-if="expandedProcessedItems.has(item.menuItemId)"
                  class="h-5 w-5 text-gray-400 dark:text-gray-500"
                />
                <ChevronRight
                  v-else
                  class="h-5 w-5 text-gray-400 dark:text-gray-500"
                />
              </div>
            </button>

            <!-- Expanded Shop Breakdown -->
            <div
              v-if="expandedProcessedItems.has(item.menuItemId) && item.shopBreakdowns && item.shopBreakdowns.length > 0"
              class="px-4 pb-4 space-y-3"
            >
              <div
                v-for="(shop, shopIndex) in item.shopBreakdowns"
                :key="`${item.menuItemId}-${shop.shopName}-${shopIndex}`"
                class="border-l-2 border-blue-200 dark:border-blue-800 pl-4"
              >
                <button
                  class="w-full flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded p-2 transition-colors"
                  @click="toggleShop(`${item.menuItemId}-${shop.shopName}`)"
                >
                  <div class="flex items-center gap-2">
                    <Store class="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <p class="font-semibold text-sm dark:text-gray-200">{{ shop.shopName }}</p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        {{ shop.totalQuantity?.toLocaleString() || 0 }} items
                      </p>
                    </div>

                    <ChevronDown
                      v-if="expandedShops.has(`${item.menuItemId}-${shop.shopName}`)"
                      class="h-4 w-4 text-gray-400 dark:text-gray-500"
                    />
                    <ChevronRight
                      v-else
                      class="h-4 w-4 text-gray-400 dark:text-gray-500"
                    />
                  </div>

                  <div class="text-right">
                    <p class="text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {{ formatCurrency(shop.totalRevenue) }}
                    </p>
                  </div>
                </button>

                <!-- Events for this shop -->
                <div
                  v-if="expandedShops.has(`${item.menuItemId}-${shop.shopName}`) && shop.events && shop.events.length > 0"
                  class="ml-4 space-y-1"
                >
                  <div
                    v-for="(event, eventIndex) in [...shop.events].sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())"
                    :key="eventIndex"
                    class="flex items-center justify-between text-sm py-2 px-3 border-l-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/30 rounded transition-colors"
                  >
                    <div class="flex items-center gap-2">
                      <Calendar class="h-3 w-3 text-gray-400 dark:text-gray-500" />
                      <div>
                        <span class="text-gray-700 dark:text-gray-300">{{ event.eventName }}</span>
                        <span class="text-gray-500 dark:text-gray-500 ml-2 text-xs">({{ event.eventDate }})</span>
                        <span class="text-blue-500 dark:text-blue-400 ml-2 text-xs">
                          - {{ event.quantity?.toLocaleString() || 0 }} qty
                        </span>
                      </div>
                    </div>

                    <div class="text-right">
                      <div class="text-gray-600 dark:text-gray-400">
                        {{ formatCurrency(event.revenue) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <!-- Complete State -->
      <div v-else-if="menuRevenueStatus === 'complete' && menuRevenueData.length > 0" class="space-y-4">
        <!-- Summary Card -->
        <div class="grid grid-cols-4 gap-4 mb-6">
          <Card class="p-4 dark:bg-gray-900 dark:border-gray-700">
            <p class="text-sm text-gray-600 dark:text-gray-400">Menu Items</p>
            <p class="text-2xl font-bold dark:text-gray-100">{{ menuRevenueData.length }}</p>
          </Card>

          <Card class="p-4 dark:bg-gray-900 dark:border-gray-700">
            <p class="text-sm text-gray-600 dark:text-gray-400">Total Revenue</p>
            <p class="text-2xl font-bold text-green-600 dark:text-green-500">
              {{
                formatCurrency(
                  menuRevenueData.reduce((sum, item) => sum + (item.totalRevenue || 0), 0)
                )
              }}
            </p>
          </Card>

          <Card class="p-4 dark:bg-gray-900 dark:border-gray-700">
            <p class="text-sm text-gray-600 dark:text-gray-400">Total Quantity</p>
            <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {{
                menuRevenueData
                  .reduce((sum, item) => sum + (item.totalQuantity || 0), 0)
                  .toLocaleString()
              }}
            </p>
          </Card>

          <Card class="p-4 dark:bg-gray-900 dark:border-gray-700">
            <p class="text-sm text-gray-600 dark:text-gray-400">Total Transactions</p>
            <p class="text-2xl font-bold dark:text-gray-100">
              {{
                menuRevenueData
                  .reduce((sum, item) => sum + (item.totalTransactions || 0), 0)
                  .toLocaleString()
              }}
            </p>
          </Card>
        </div>

        <!-- Menu Items List -->
        <div class="space-y-2">
          <h4 class="font-semibold dark:text-gray-100">Revenue by Menu Item</h4>

          <Card
            v-for="item in menuRevenueData"
            :key="item.menuItemId"
            class="dark:bg-gray-900 dark:border-gray-700"
          >
            <button
              class="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              @click="onToggleExpansion(item.menuItemId)"
            >
              <div class="flex items-center gap-3">
                <Package class="h-5 w-5 text-gray-400 dark:text-gray-500" />
                <div class="text-left">
                  <p class="font-semibold dark:text-gray-100">{{ item.menuItemName }}</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    {{ item.shopBreakdowns?.length || 0 }} shops • {{ item.totalQuantity?.toLocaleString() || 0 }} qty •
                    {{ item.totalTransactions }} transactions
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-4">
                <div class="text-right">
                  <p class="text-lg font-bold text-green-600 dark:text-green-500">
                    {{ formatCurrency(item.totalRevenue) }}
                  </p>
                  <p class="text-xs text-blue-600 dark:text-blue-400">
                    {{ item.totalQuantity?.toLocaleString() || 0 }} items
                  </p>
                </div>

                <ChevronDown
                  v-if="expandedMenuItems.has(item.menuItemId)"
                  class="h-5 w-5 text-gray-400 dark:text-gray-500"
                />
                <ChevronRight
                  v-else
                  class="h-5 w-5 text-gray-400 dark:text-gray-500"
                />
              </div>
            </button>

            <!-- Expanded Shop Breakdown -->
            <div v-if="expandedMenuItems.has(item.menuItemId) && item.shopBreakdowns" class="px-4 pb-4 space-y-3">
              <div
                v-for="(shop, shopIndex) in item.shopBreakdowns"
                :key="shopIndex"
                class="border-l-2 border-blue-200 dark:border-blue-800 pl-4"
              >
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <Store class="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <p class="font-semibold text-sm dark:text-gray-200">{{ shop.shopName }}</p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        {{ shop.totalQuantity?.toLocaleString() || 0 }} items
                      </p>
                    </div>
                  </div>

                  <p class="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {{ formatCurrency(shop.totalRevenue) }}
                  </p>
                </div>

                <!-- Events for this shop -->
                <div v-if="shop.events && shop.events.length > 0" class="ml-4 space-y-1">
                  <div
                    v-for="(event, eventIndex) in [...shop.events].sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())"
                    :key="eventIndex"
                    class="flex items-center justify-between text-sm py-1 border-l-2 border-gray-200 dark:border-gray-700 pl-3"
                  >
                    <div>
                      <span class="text-gray-700 dark:text-gray-300">{{ event.eventName }}</span>
                      <span class="text-gray-500 dark:text-gray-500 ml-2 text-xs">({{ event.eventDate }})</span>
                      <span class="text-blue-500 dark:text-blue-400 ml-2 text-xs">
                        - {{ event.quantity?.toLocaleString() || 0 }} qty
                      </span>
                    </div>

                    <div class="text-gray-600 dark:text-gray-400">
                      {{ formatCurrency(event.revenue) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <!-- Error State -->
      <div
        v-else-if="menuRevenueStatus === 'error'"
        class="text-center py-8 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
      >
        <p class="font-semibold">Error calculating menu revenue</p>
        <p class="text-sm">{{ menuRevenueError }}</p>
      </div>
    </Card>
  </div>
</template>

<script>
import Button from "../ui/button.vue";
import Card from "../ui/card.vue";
import {
  Package,
  RefreshCw,
  Loader2,
  CheckCircle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Store,
  Calendar,
  Trash2,
} from "lucide-vue-next";
import { formatCurrency } from "../utils/formatCurrency";

export default {
  name: "MenuRevenueStep",

  components: {
    Button,
    Card,
    Package,
    RefreshCw,
    Loader2,
    CheckCircle,
    ArrowRight,
    ChevronDown,
    ChevronRight,
    Store,
    Calendar,
    Trash2,
  },

  props: {
    menuRevenueStatus: { type: String, required: true },
    menuRevenueData: { type: Array, required: true },
    menuRevenueError: { type: String, required: true },
    allMenuItems: { type: Array, required: true },
    currentMenuItemIndex: { type: Number, required: true },
    currentMenuItemProcessing: { type: Boolean, required: true },
    processedMenuItemsData: { type: Array, required: true },
    expandedMenuItems: { type: Object, required: true }, // Set
    location: { type: String, required: true },

    onCalculateMenuRevenue: { type: Function, required: true },
    onStartProcessing: { type: Function, required: true },
    onProcessNextMenuItem: { type: Function, required: true },
    onFinishProcessing: { type: Function, required: true },
    onToggleExpansion: { type: Function, required: true },
    onDeleteOldData: { type: Function, required: true },
  },

  data() {
    return {
      expandedProcessedItems: new Set(),
      expandedShops: new Set(),
      isDeleting: false,
    };
  },

  methods: {
    formatCurrency,

    async handleDeleteOldData() {
      this.isDeleting = true;
      try {
        await this.onDeleteOldData();
      } finally {
        this.isDeleting = false;
      }
    },

    toggleProcessedItem(menuItemId) {
      const newExpanded = new Set(this.expandedProcessedItems);
      if (newExpanded.has(menuItemId)) {
        newExpanded.delete(menuItemId);
      } else {
        newExpanded.add(menuItemId);
      }
      this.expandedProcessedItems = newExpanded;
    },

    toggleShop(shopKey) {
      const newExpanded = new Set(this.expandedShops);
      if (newExpanded.has(shopKey)) {
        newExpanded.delete(shopKey);
      } else {
        newExpanded.add(shopKey);
      }
      this.expandedShops = newExpanded;
    },
  },
};
</script>
