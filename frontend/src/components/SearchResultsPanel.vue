<template>
  <Card class="p-4 h-full overflow-auto">
    <div class="space-y-4">
      <div class="flex items-center gap-2">
        <SearchIcon class="w-5 h-5 text-gray-500" />
        <div class="flex-1">
          <h3 class="text-lg">Search Results</h3>
          <p class="text-sm text-gray-500">
            {{ matchedElements.length }} result
            <span v-if="matchedElements.length !== 1">s</span>
            for "{{ searchQuery }}"
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          @click="onClose && onClose()"
          class="shrink-0"
        >
          <X class="w-4 h-4" />
        </Button>
      </div>

      <!-- Sort Controls -->
      <div v-if="matchedElements.length > 0" class="flex items-center gap-2">
        <ArrowUpDown class="w-4 h-4 text-gray-500" />
        <span class="text-sm text-gray-600">Sort by:</span>
        <Select v-model="sortBy">
          <SelectTrigger class="w-32 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="area">Area</SelectItem>
            <SelectItem value="element">Element</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <!-- Display matched elements -->
      <div v-if="matchedElements.length === 0" class="text-center py-8 text-gray-500">
        <SearchIcon class="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p>No results found for "{{ searchQuery }}"</p>
        <p class="text-sm mt-2">Try a different search term</p>
      </div>

      <div v-else class="space-y-6">
        <div
          v-for="(items, groupName) in groupedElements"
          :key="groupName"
          class="space-y-3"
        >
          <!-- Group Title -->
          <div class="sticky top-0 bg-white z-10 pb-2">
            <h4 class="font-semibold text-gray-900">{{ groupName }}</h4>
            <div class="h-0.5 bg-gray-200 mt-1" />
          </div>

          <!-- Group Items -->
          <div class="space-y-3">
            <Card
              v-for="item in items"
              :key="`${item.floorId}-${item.element.id}`"
              class="p-3 cursor-pointer hover:shadow-md transition-shadow border-2"
              :class="getTypeColor(item.element.type)"
              @click="handleSelectElement(item)"
            >
              <div class="space-y-2">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span
                        class="text-xs px-2 py-0.5 bg-white rounded-full border"
                      >
                        {{ getElementTypeName(item.element.type) }}
                      </span>
                      <span
                        v-if="getElementSubtitle(item.element)"
                        class="text-xs text-gray-600"
                      >
                        {{ getElementSubtitle(item.element) }}
                      </span>
                    </div>
                    <h4 class="font-medium mt-1">
                      {{ item.element.name }}
                    </h4>
                  </div>
                </div>

                <div
                  v-if="sortBy === 'element'"
                  class="flex items-center gap-1 text-xs text-gray-600"
                >
                  <MapPin class="w-3 h-3" />
                  <span>{{ item.floorName }}</span>
                </div>

                <!-- Inventory information -->
                <div
                  v-if="getInventoryItems(item.element).length > 0"
                  class="mt-2 pt-2 border-t space-y-2"
                >
                  <div class="text-xs">
                    <span class="font-medium">Inventory:</span>
                    <span class="text-gray-600 ml-1">
                      {{ getInventoryItems(item.element).length }}
                      item<span
                        v-if="getInventoryItems(item.element).length !== 1"
                        >s</span
                      >
                    </span>
                    <span class="text-gray-400 mx-1">•</span>
                    <span class="text-gray-600">
                      {{ getTotalQuantity(item.element) }}
                      /
                      {{ getTotalInitialQuantity(item.element) }} units
                    </span>
                  </div>

                  <!-- Individual items with stock levels -->
                  <div class="space-y-1.5">
                    <div
                      v-for="(invItem, index) in getInventoryItems(item.element).slice(0, 5)"
                      :key="`${item.element.id}-${invItem.id || invItem.name}-${index}`"
                      class="space-y-0.5"
                    >
                      <div class="flex items-center justify-between text-xs">
                        <span class="text-gray-700">{{ invItem.name }}</span>
                        <span class="text-gray-500">
                          {{ invItem.quantity || 0 }} /
                          {{ invItem.initialQuantity || 0 }}
                        </span>
                      </div>
                      <div class="flex items-center gap-2">
                        <div
                          class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"
                        >
                          <div
                            class="h-full transition-all"
                            :class="getStockLevelColor(getStockLevel(invItem))"
                            :style="{ width: `${getStockLevel(invItem)}%` }"
                          />
                        </div>
                        <span class="text-xs text-gray-400 w-10 text-right">
                          {{ Math.round(getStockLevel(invItem)) }}%
                        </span>
                      </div>
                    </div>

                    <div
                      v-if="getInventoryItems(item.element).length > 5"
                      class="text-xs text-gray-500 italic"
                    >
                      +{{ getInventoryItems(item.element).length - 5 }}
                      more item<span
                        v-if="getInventoryItems(item.element).length - 5 !== 1"
                        >s</span
                      >
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

<script>
import Card from '../ui/card.vue';
import Button from '../ui/button.vue';
import Separator from '../ui/separator.vue';
import Select from '../ui/select.vue';
import SelectContent from '../ui/selectContent.vue';
import SelectItem from '../ui/selectItem.vue';
import SelectTrigger from '../ui/selectTrigger.vue';
import SelectValue from '../ui/selectValue.vue';
import { Search as SearchIcon, MapPin,X,ArrowUpDown } from 'lucide-vue-next';
import { expandInventoryItems } from '../utils/inventoryUtils';
import * as api from '../utils/api';

export default {
  name: 'SearchResultsPanel',
  components: {
    Card,
    Button,
    Separator,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    SearchIcon,
    MapPin,
    X,
    ArrowUpDown,
  },
  props: {
    searchQuery: {
      type: String,
      required: true,
    },
    matchedElements: {
      type: Array,
      required: true,
    },
    allShopMenuItems: {
      type: Array,
      default: () => [],
    },
    allMerchShopItems: {
      type: Array,
      default: () => [],
    },
    onSelectElement: {
      type: Function,
      required: true,
    },
    onClose: {
      type: Function,
      required: true,
    },
  },
  data() {
    return {
      sortBy: 'area', // 'area' | 'element'
      allMenuItems: [],
    };
  },
  computed: {
    groupedElements() {
      const groups = {};

      if (this.sortBy === 'area') {
        // Group by floor/area
        this.matchedElements.forEach(item => {
          const key = item.floorName;
          if (!groups[key]) {
            groups[key] = [];
          }
          groups[key].push(item);
        });

        // Sort groups by floor level
        const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
          const aItem = groups[a][0];
          const bItem = groups[b][0];

          if (aItem.isForecourt && !bItem.isForecourt) return 1;
          if (!aItem.isForecourt && bItem.isForecourt) return -1;
          if (aItem.isExternalMerch && !bItem.isExternalMerch) return 1;
          if (!aItem.isExternalMerch && bItem.isExternalMerch) return -1;

          return bItem.floorLevel - aItem.floorLevel; // Higher floors first
        });

        const sortedGroups = {};
        sortedGroupKeys.forEach(key => {
          sortedGroups[key] = groups[key];
        });
        return sortedGroups;
      } else {
        // Group by element type
        this.matchedElements.forEach(item => {
          const key = this.getElementTypeName(item.element.type);
          if (!groups[key]) {
            groups[key] = [];
          }
          groups[key].push(item);
        });

        const typeOrder = [
          'F&B',
          'Storage',
          'Ticketing',
          'Hospitality',
          'Merch',
          'Access',
          'Entertainment',
        ];
        const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
          const aIndex = typeOrder.indexOf(a);
          const bIndex = typeOrder.indexOf(b);
          return aIndex - bIndex;
        });

        const sortedGroups = {};
        sortedGroupKeys.forEach(key => {
          sortedGroups[key] = groups[key];
        });
        return sortedGroups;
      }
    },
  },
  mounted() {
    this.loadMenuItems();

    const handleMenuItemsChanged = () => {
      console.log('SearchResultsPanel: Menu items changed, reloading...');
      this.loadMenuItems();
    };

    window.addEventListener('menuItemsChanged', handleMenuItemsChanged);
    this._handleMenuItemsChanged = handleMenuItemsChanged;
  },
  beforeUnmount() {
    if (this._handleMenuItemsChanged) {
      window.removeEventListener('menuItemsChanged', this._handleMenuItemsChanged);
    }
  },
  methods: {
    async loadMenuItems() {
      try {
        const items = await api.getAllMenuItems();
        this.allMenuItems = items || [];
      } catch (error) {
        console.error(
          'Error loading menu items for inventory expansion:',
          error,
        );
      }
    },

    getElementTypeName(type) {
      const names = {
        shop: 'F&B',
        storage: 'Storage',
        entrance: 'Ticketing',
        hospitality: 'Hospitality',
        merchshop: 'Merch',
        access: 'Access',
        entertainment: 'Entertainment',
      };
      return names[type] || type;
    },

    getTypeColor(type) {
      const colors = {
        shop: 'bg-amber-100 border-amber-300',
        storage: 'bg-gray-100 border-gray-300',
        entrance: 'bg-blue-100 border-blue-300',
        hospitality: 'bg-purple-100 border-purple-300',
        merchshop: 'bg-pink-100 border-pink-300',
        access: 'bg-green-100 border-green-300',
        entertainment: 'bg-red-100 border-red-300',
      };
      return colors[type] || 'bg-gray-100 border-gray-300';
    },

    getElementSubtitle(element) {
      const capitalize = t => t.charAt(0).toUpperCase() + t.slice(1);

      if (element.storageType && element.storageType.length > 0) {
        return element.storageType.map(capitalize).join(', ');
      }
      if (element.shopType && element.shopType.length > 0) {
        return element.shopType
          .map(t => {
            if (t === 'gppremium') return 'GP Premium';
            if (t === 'drinkee') return 'Drinkee';
            return capitalize(t);
          })
          .join(', ');
      }
      if (element.hospitalityType && element.hospitalityType.length > 0) {
        return element.hospitalityType.map(capitalize).join(', ');
      }
      if (element.merchType && element.merchType.length > 0) {
        return element.merchType.map(capitalize).join(', ');
      }
      if (element.accessType && element.accessType.length > 0) {
        return element.accessType
          .map(t => {
            if (t === 'venueentrance') return 'Venue Entrance';
            if (t === 'servicelift') return 'Service Lift';
            return capitalize(t);
          })
          .join(', ');
      }
      if (element.entertainmentType && element.entertainmentType.length > 0) {
        return element.entertainmentType
          .map(t => {
            if (t === 'sportground') return 'Sport Ground';
            if (t === 'mice') return 'MICE';
            return capitalize(t);
          })
          .join(', ');
      }
      if (element.entranceType && element.entranceType.length > 0) {
        return element.entranceType.map(capitalize).join(', ');
      }
      return '';
    },

    getInventoryItems(element) {
      const query = this.searchQuery.toLowerCase();
      let items = [];

      if (element.type === 'storage') {
        const customItems = element.menuItems || [];
        const shopItems = this.allShopMenuItems || [];
        const merchItems = element.storageType?.includes('merch')
          ? this.allMerchShopItems || []
          : [];

        const itemMap = new Map();
        [...customItems, ...shopItems, ...merchItems].forEach(item => {
          if (!itemMap.has(item.name)) {
            itemMap.set(item.name, item);
          }
        });
        items = Array.from(itemMap.values());
      } else if (element.type === 'shop' && element.menuItems) {
        const expandedItems = expandInventoryItems(element.menuItems, this.allMenuItems);
        items = expandedItems.map(item => {
          const originalItem = element.menuItems.find(mi => mi.name === item.name);
          return {
            id: item.id,
            name: item.name,
            quantity: originalItem?.quantity,
            initialQuantity: originalItem?.initialQuantity,
          };
        });
      } else if (element.type === 'merchshop' && element.menuItems) {
        items = element.menuItems;
      } else if (element.type === 'hospitality' && element.menuItems) {
        items = element.menuItems;
      }

      return items.filter(it => it.name.toLowerCase().includes(query));
    },

    getStockLevel(item) {
      if (!item.initialQuantity || item.initialQuantity === 0) return 0;
      const currentQuantity = item.quantity || 0;
      return (currentQuantity / item.initialQuantity) * 100;
    },

    getStockLevelColor(percentage) {
      if (percentage >= 70) return 'bg-green-500';
      if (percentage >= 40) return 'bg-yellow-500';
      return 'bg-red-500';
    },

    getTotalQuantity(element) {
      return this.getInventoryItems(element).reduce(
        (sum, item) => sum + (item.quantity || 0),
        0,
      );
    },

    getTotalInitialQuantity(element) {
      return this.getInventoryItems(element).reduce(
        (sum, item) => sum + (item.initialQuantity || 0),
        0,
      );
    },

    handleSelectElement(item) {
      if (!this.onSelectElement) return;
      this.onSelectElement(
        item.element.id,
        item.floorId,
        item.isForecourt,
        item.isExternalMerch,
      );
    },
  },
};
</script>