<template>
  <Card class="h-full flex flex-col">
    <CardHeader>
      <CardTitle>Cost Tracking</CardTitle>

      <div class="flex flex-col gap-4 mt-4">
        <!-- Price Field Selector -->
        <div class="flex items-center gap-3">
          <Label for="price-field" class="whitespace-nowrap">Price Field:</Label>

          <Select :modelValue="priceField" @update:modelValue="priceField = $event">
            <SelectTrigger id="price-field" class="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pricePerUnit">Price per Unit</SelectItem>
              <SelectItem value="recipeUnitCost">Recipe Unit Cost</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Filters -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <!-- Items Filter -->
          <div class="relative" @mouseleave="showItemsFilter = false">
            <Button
              variant="outline"
              size="sm"
              class="gap-2 w-full"
              @click="showItemsFilter = !showItemsFilter"
            >
              Items <template v-if="selectedItems.length > 0">({{ selectedItems.length }})</template>
              <ChevronUp v-if="showItemsFilter" class="w-4 h-4" />
              <ChevronDown v-else class="w-4 h-4" />
            </Button>

            <Card v-if="showItemsFilter" class="absolute top-full mt-1 z-10 w-64 shadow-lg">
              <CardContent class="p-3">
                <div class="flex gap-2 mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-7 text-xs"
                    @click="selectAllItems"
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-7 text-xs"
                    @click="clearAllItems"
                  >
                    None
                  </Button>
                </div>

                <ScrollArea class="h-48">
                  <div class="space-y-2">
                    <div v-for="item in uniqueItems" :key="item" class="flex items-center gap-2">
                      <Checkbox
                        :id="`item-${item}`"
                        :checked="selectedItems.includes(item)"
                        @update:checked="toggleItem(item)"
                      />
                      <label :for="`item-${item}`" class="text-sm cursor-pointer">{{ item }}</label>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <!-- Suppliers Filter -->
          <div class="relative" @mouseleave="showSuppliersFilter = false">
            <Button
              variant="outline"
              size="sm"
              class="gap-2 w-full"
              @click="showSuppliersFilter = !showSuppliersFilter"
            >
              Suppliers <template v-if="selectedSuppliers.length > 0">({{ selectedSuppliers.length }})</template>
              <ChevronUp v-if="showSuppliersFilter" class="w-4 h-4" />
              <ChevronDown v-else class="w-4 h-4" />
            </Button>

            <Card v-if="showSuppliersFilter" class="absolute top-full mt-1 z-10 w-64 shadow-lg">
              <CardContent class="p-3">
                <div class="flex gap-2 mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-7 text-xs"
                    @click="selectAllSuppliers"
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-7 text-xs"
                    @click="clearAllSuppliers"
                  >
                    None
                  </Button>
                </div>

                <ScrollArea class="h-48">
                  <div class="space-y-2">
                    <div
                      v-for="supplier in availableSuppliers"
                      :key="supplier.id"
                      class="flex items-center gap-2"
                    >
                      <Checkbox
                        :id="`supplier-${supplier.id}`"
                        :checked="selectedSuppliers.includes(supplier.id)"
                        @update:checked="toggleSupplier(supplier.id)"
                      />
                      <label :for="`supplier-${supplier.id}`" class="text-sm cursor-pointer">{{ supplier.name }}</label>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <!-- Good Types Filter -->
          <div class="relative" @mouseleave="showGoodTypesFilter = false">
            <Button
              variant="outline"
              size="sm"
              class="gap-2 w-full"
              @click="showGoodTypesFilter = !showGoodTypesFilter"
            >
              Good Types <template v-if="selectedGoodTypes.length > 0">({{ selectedGoodTypes.length }})</template>
              <ChevronUp v-if="showGoodTypesFilter" class="w-4 h-4" />
              <ChevronDown v-else class="w-4 h-4" />
            </Button>

            <Card v-if="showGoodTypesFilter" class="absolute top-full mt-1 z-10 w-64 shadow-lg">
              <CardContent class="p-3">
                <div class="flex gap-2 mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-7 text-xs"
                    @click="selectAllGoodTypes"
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-7 text-xs"
                    @click="clearAllGoodTypes"
                  >
                    None
                  </Button>
                </div>

                <ScrollArea class="h-48">
                  <div class="space-y-2">
                    <div v-for="type in availableGoodTypes" :key="type" class="flex items-center gap-2">
                      <Checkbox
                        :id="`goodtype-${type}`"
                        :checked="selectedGoodTypes.includes(type)"
                        @update:checked="toggleGoodType(type)"
                      />
                      <label :for="`goodtype-${type}`" class="text-sm cursor-pointer">{{ type }}</label>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <!-- Categories Filter -->
          <div class="relative" @mouseleave="showCategoriesFilter = false">
            <Button
              variant="outline"
              size="sm"
              class="gap-2 w-full"
              @click="showCategoriesFilter = !showCategoriesFilter"
            >
              Categories <template v-if="selectedCategories.length > 0">({{ selectedCategories.length }})</template>
              <ChevronUp v-if="showCategoriesFilter" class="w-4 h-4" />
              <ChevronDown v-else class="w-4 h-4" />
            </Button>

            <Card v-if="showCategoriesFilter" class="absolute top-full mt-1 z-10 w-64 shadow-lg">
              <CardContent class="p-3">
                <div class="flex gap-2 mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-7 text-xs"
                    @click="selectAllCategories"
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-7 text-xs"
                    @click="clearAllCategories"
                  >
                    None
                  </Button>
                </div>

                <ScrollArea class="h-48">
                  <div class="space-y-2">
                    <div
                      v-for="category in availableCategories"
                      :key="category"
                      class="flex items-center gap-2"
                    >
                      <Checkbox
                        :id="`category-${category}`"
                        :checked="selectedCategories.includes(category)"
                        @update:checked="toggleCategory(category)"
                      />
                      <label :for="`category-${category}`" class="text-sm cursor-pointer">{{ category }}</label>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </CardHeader>

    <CardContent class="flex-1 min-h-0 flex flex-col">
      <div
        v-if="chartData.length === 0"
        class="flex items-center justify-center h-full text-gray-500"
      >
        No data available for the selected filters
      </div>

      <template v-else>
        <div class="flex-1 min-h-0">
          <Line
            :data="chartJsData"
            :options="chartJsOptions"
            :style="{ height: '100%', width: '100%' }"
          />
        </div>

        <!-- Expandable Legend -->
        <div class="border-t mt-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            class="w-full flex items-center justify-center gap-2 h-8"
            @click="showLegend = !showLegend"
          >
            <span class="text-sm">Legend</span>
            <ChevronUp v-if="showLegend" class="w-4 h-4" />
            <ChevronDown v-else class="w-4 h-4" />
          </Button>

          <div
            v-if="showLegend"
            class="flex flex-wrap gap-4 mt-2 px-2 py-2 bg-gray-50 dark:bg-gray-800 rounded"
          >
            <div
              v-for="(itemName, index) in itemNamesForLines"
              :key="itemName"
              class="flex items-center gap-2"
            >
              <div
                class="w-4 h-4 rounded"
                :style="{ backgroundColor: colors[index % colors.length] }"
              />
              <span class="text-sm text-gray-900 dark:text-gray-100">{{ itemName }}</span>
            </div>
          </div>
        </div>
      </template>
    </CardContent>
  </Card>
</template>

<script>
import { Line } from "vue-chartjs";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import Card from "../ui/card.vue";
import CardContent from "../ui/cardContent.vue";
import CardHeader from "../ui/cardHeader.vue";
import CardTitle from "../ui/cardTitle.vue";
import Select from "../ui/select.vue";
import SelectContent from "../ui/selectContent.vue";
import SelectItem from "../ui/selectItem.vue";
import SelectTrigger from "../ui/selectTrigger.vue";
import SelectValue from "../ui/selectValue.vue";
import Label from "../ui/label.vue";
import Button from "../ui/button.vue";
import Checkbox from "../ui/checkbox.vue";
import ScrollArea from "../ui/scrollArea.vue";


// NOTE: adapte ces imports selon ta lib d'icônes Vue.
import { ChevronDown, ChevronUp } from "lucide-vue-next";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default {
  name: "CostTrackingChart",

  components: {
    Line,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Label,
    Button,
    Checkbox,
    ScrollArea,
    ChevronDown,
    ChevronUp,
  },

  props: {
    marketPrices: { type: Array, required: true },
    suppliers: { type: Array, required: true },
  },

  data() {
    return {
      priceField: "pricePerUnit", // 'pricePerUnit' | 'recipeUnitCost'
      selectedItems: [],
      selectedSuppliers: [],
      selectedGoodTypes: [],
      selectedCategories: [],

      showItemsFilter: false,
      showSuppliersFilter: false,
      showGoodTypesFilter: false,
      showCategoriesFilter: false,
      showLegend: true,

      colors: [
        "#3b82f6",
        "#ef4444",
        "#10b981",
        "#f59e0b",
        "#8b5cf6",
        "#ec4899",
        "#14b8a6",
        "#f97316",
        "#6366f1",
        "#84cc16",
        "#06b6d4",
        "#f43f5e",
        "#22c55e",
        "#eab308",
        "#a855f7",
      ],
    };
  },

  computed: {
    uniqueItems() {
      const items = new Set();
      this.marketPrices.forEach((item) => items.add(item.itemName));
      return Array.from(items).sort();
    },

    availableSuppliers() {
      if (this.selectedItems.length === 0) {
        return this.suppliers;
      }

      const supplierIds = new Set();
      this.marketPrices.forEach((item) => {
        if (this.selectedItems.includes(item.itemName)) {
          supplierIds.add(item.supplier_id);
        }
      });

      return this.suppliers.filter((s) => supplierIds.has(s.id));
    },

    availableGoodTypes() {
      const types = new Set();

      this.marketPrices.forEach((item) => {
        if (this.selectedItems.length === 0 || this.selectedItems.includes(item.itemName)) {
          if (item.goodType) types.add(item.goodType);
        }
      });

      return Array.from(types).sort();
    },

    availableCategories() {
      const categories = new Set();

      this.marketPrices.forEach((item) => {
        if (this.selectedItems.length === 0 || this.selectedItems.includes(item.itemName)) {
          if (item.category) categories.add(item.category);
        }
      });

      return Array.from(categories).sort();
    },

    filteredMarketPrices() {
      return this.marketPrices.filter((item) => {
        if (this.selectedItems.length > 0 && !this.selectedItems.includes(item.itemName)) {
          return false;
        }

        if (this.selectedSuppliers.length > 0 && !this.selectedSuppliers.includes(item.supplier_id)) {
          return false;
        }

        if (this.selectedGoodTypes.length > 0) {
          if (!item.goodType || !this.selectedGoodTypes.includes(item.goodType)) {
            return false;
          }
        }

        if (this.selectedCategories.length > 0) {
          if (!item.category || !this.selectedCategories.includes(item.category)) {
            return false;
          }
        }

        return true;
      });
    },

    chartData() {
      const allDataPoints = [];

      this.filteredMarketPrices.forEach((item) => {
        const dateStr = item.timestamp || item.added;
        if (!dateStr) return;

        const timestamp = new Date(dateStr).getTime();
        const itemKey = item.itemName;
        const value =
          this.priceField === "pricePerUnit"
            ? item.pricePerUnit
            : item.recipeUnitCost || 0;

        let dataPoint = allDataPoints.find((dp) => dp.timestamp === timestamp);
        if (!dataPoint) {
          const date = new Date(timestamp);
          dataPoint = {
            timestamp,
            dateStr: date.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            fullDateStr: date.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
          };
          allDataPoints.push(dataPoint);
        }

        dataPoint[itemKey] = value;
      });

      allDataPoints.sort((a, b) => a.timestamp - b.timestamp);
      return allDataPoints;
    },

    itemNamesForLines() {
      const names = new Set();
      this.chartData.forEach((data) => {
        Object.keys(data).forEach((key) => {
          if (key !== "dateStr" && key !== "timestamp" && key !== "fullDateStr") names.add(key);
        });
      });
      return Array.from(names);
    },

    chartJsData() {
      return {
        labels: this.chartData.map((dp) => dp.dateStr),
        datasets: this.itemNamesForLines.map((itemName, index) => {
          return {
            label: itemName,
            data: this.chartData.map((dp) => (dp[itemName] !== undefined ? dp[itemName] : null)),
            borderColor: this.colors[index % this.colors.length],
            backgroundColor: "transparent",
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.35,
            spanGaps: true,
          };
        }),
      };
    },

    chartJsOptions() {
      const self = this;

      return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(context) {
                const idx = context && context[0] ? context[0].dataIndex : 0;
                const dp = self.chartData[idx];
                return (dp && dp.fullDateStr) || (context && context[0] ? context[0].label : "");
              },
              label(context) {
                const label = context.dataset && context.dataset.label ? context.dataset.label : "";
                const val = context.parsed && context.parsed.y !== null && context.parsed.y !== undefined ? context.parsed.y : null;
                const formatted = typeof val === "number" ? `$${val.toFixed(2)}` : "$0.00";
                return `${label}: ${formatted}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { font: { size: 12 } },
            grid: { display: true },
          },
          y: {
            title: {
              display: true,
              text:
                self.priceField === "pricePerUnit"
                  ? "Price per Unit ($)"
                  : "Recipe Unit Cost ($)",
            },
            grid: { display: true },
          },
        },
      };
    },
  },

  methods: {
    toggleItem(item) {
      this.selectedItems = this.selectedItems.includes(item)
        ? this.selectedItems.filter((i) => i !== item)
        : [...this.selectedItems, item];
    },

    toggleSupplier(supplierId) {
      this.selectedSuppliers = this.selectedSuppliers.includes(supplierId)
        ? this.selectedSuppliers.filter((s) => s !== supplierId)
        : [...this.selectedSuppliers, supplierId];
    },

    toggleGoodType(type) {
      this.selectedGoodTypes = this.selectedGoodTypes.includes(type)
        ? this.selectedGoodTypes.filter((t) => t !== type)
        : [...this.selectedGoodTypes, type];
    },

    toggleCategory(category) {
      this.selectedCategories = this.selectedCategories.includes(category)
        ? this.selectedCategories.filter((c) => c !== category)
        : [...this.selectedCategories, category];
    },

    selectAllItems() {
      this.selectedItems = this.uniqueItems;
    },

    clearAllItems() {
      this.selectedItems = [];
    },

    selectAllSuppliers() {
      this.selectedSuppliers = this.availableSuppliers.map((s) => s.id);
    },

    clearAllSuppliers() {
      this.selectedSuppliers = [];
    },

    selectAllGoodTypes() {
      this.selectedGoodTypes = this.availableGoodTypes;
    },

    clearAllGoodTypes() {
      this.selectedGoodTypes = [];
    },

    selectAllCategories() {
      this.selectedCategories = this.availableCategories;
    },

    clearAllCategories() {
      this.selectedCategories = [];
    },
  },

  mounted() {
    
  },
};
</script>
