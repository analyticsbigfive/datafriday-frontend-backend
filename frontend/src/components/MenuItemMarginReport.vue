<script>
// Vue 3 Options API (JS) - script équivalent pour MenuItemMarginReport
import Card from "../ui/card.vue";
import CardContent from "../ui/card.vue";
import CardHeader from "../ui/card.vue";
import CardTitle from "../ui/card.vue";
import Button from "../ui/button.vue";
import Input from "../ui/input.vue";
import Select from "../ui/select.vue";
import SelectContent from "../ui/select.vue";
import SelectItem from "../ui/select.vue";
import SelectTrigger from "../ui/select.vue";
import SelectValue from "../ui/select.vue";

import {
  Filter,
  Download,
  RefreshCw,
  Check,
  ChevronsUpDown,
  Search,
} from "lucide-vue-next";
import * as api from "../utils/api";
import { toast } from "vue-sonner";
import Checkbox from "../ui/checkbox.vue";
import Popover from "../ui/popover.vue";
import PopoverContent from "../ui/popover.vue";
import PopoverTrigger from "../ui/popover.vue";

import Command from "../ui/Command.vue";
import CommandEmpty from "../ui/CommandEmpty.vue";
import CommandGroup from "../ui/CommandGroup.vue";
import CommandInput from "../ui/CommandInput.vue";
import CommandItem from "../ui/CommandItem.vue";
import CommandList from "../ui/CommandList.vue";

import Badge from "../ui/badge.vue";

export default {
  name: "MenuItemMarginReport",

  components: {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Filter,
    Download,
    RefreshCw,
    Check,
    ChevronsUpDown,
    Search,
    Checkbox,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    Badge,
  },

  props: {
    spaces: {
      type: Array,
      required: true,
    },
  },

  data() {
    return {
      snapshots: [],
      loading: true,
      searchQuery: "",
      selectedTypes: [],
      selectedCategories: [],
      selectedSpaces: [],
      selectedMenuItem: "all",
      showFilters: false,

      // Get all menu items for space filtering
      allMenuItems: [],
    };
  },

  mounted() {
    this.loadData();
  },

  computed: {
    // Get unique values for filters
    uniqueTypes() {
      return Array.from(
        new Set((this.allMenuItems || []).map((mi) => mi.type).filter(Boolean)),
      );
    },

    uniqueCategories() {
      return Array.from(
        new Set((this.allMenuItems || []).map((mi) => mi.category)),
      );
    },

    // Filter snapshots based on selected filters
    filteredSnapshots() {
      return (this.snapshots || []).filter((snapshot) => {
        const q = (this.searchQuery || "").toLowerCase();

        const matchesSearch =
          this.searchQuery === "" ||
          (snapshot.menuItemName || "").toLowerCase().includes(q);

        const matchesType =
          this.selectedTypes.length === 0 ||
          (snapshot.type && this.selectedTypes.includes(snapshot.type));

        const matchesCategory =
          this.selectedCategories.length === 0 ||
          this.selectedCategories.includes(snapshot.category);

        const matchesSpace =
          this.selectedSpaces.length === 0 ||
          this.selectedSpaces.some((spaceId) =>
            this.getAvailableSpacesForMenuItem(snapshot.menuItemId).includes(
              spaceId,
            ),
          );

        const matchesMenuItem =
          this.selectedMenuItem === "all" ||
          snapshot.menuItemId === this.selectedMenuItem;

        return (
          matchesSearch &&
          matchesType &&
          matchesCategory &&
          matchesSpace &&
          matchesMenuItem
        );
      });
    },

    // Prepare chart data
    chartData() {
      return this.prepareChartData();
    },

    // Deduplicate menu items by ID using a Map
    uniqueMenuItems() {
      const map = new Map();
      (this.filteredSnapshots || []).forEach((s) => {
        if (!map.has(s.menuItemId)) {
          map.set(s.menuItemId, { id: s.menuItemId, name: s.menuItemName });
        }
      });
      return Array.from(map.values());
    },
  },

  methods: {
    async loadData() {
      try {
        this.loading = true;

        const [snapshotsData, menuItemsData] = await Promise.all([
          api.getAllMenuItemSnapshots(),
          api.getAllMenuItems(),
        ]);

        this.snapshots = snapshotsData;
        this.allMenuItems = menuItemsData;
      } catch (error) {
        console.error("Error loading margin report data:", error);
        toast.error("Failed to load margin report data");
      } finally {
        this.loading = false;
      }
    },

    // Get available spaces for a menu item (simplified version)
    getAvailableSpacesForMenuItem(menuItemId) {
      const menuItem = (this.allMenuItems || []).find(
        (mi) => mi.id === menuItemId,
      );
      if (!menuItem) return [];

      const ingredientIds =
        menuItem.components
          ?.filter((c) => c.itemType === "Ingredient")
          .map((c) => c.sourceId) || [];

      if (ingredientIds.length === 0) {
        return (this.spaces || []).map((s) => s.id);
      }

      return (this.spaces || []).map((s) => s.id);
    },

    prepareChartData() {
      if (this.filteredSnapshots.length === 0) return [];

      const sorted = [...this.filteredSnapshots].sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      const dataByDate = sorted.reduce((acc, snapshot) => {
        const date = new Date(snapshot.timestamp).toLocaleDateString();

        if (!acc[date]) {
          acc[date] = {
            date,
            timestamp: snapshot.timestamp,
            totalCost: 0,
            totalPrice: 0,
            count: 0,
            items: new Set(),
          };
        }

        acc[date].items.add(snapshot.menuItemId);
        acc[date].totalCost += snapshot.totalCost;
        acc[date].totalPrice += snapshot.basePrice;
        acc[date].count++;

        return acc;
      }, {});

      const chartData = Object.values(dataByDate).map((item) => {
        const avgCost = item.count > 0 ? item.totalCost / item.count : 0;
        const avgPrice = item.count > 0 ? item.totalPrice / item.count : 0;
        const margin =
          avgPrice > 0 ? ((avgPrice - avgCost) / avgPrice) * 100 : 0;

        return {
          date: item.date,
          timestamp: item.timestamp,
          totalCost: parseFloat(avgCost.toFixed(2)),
          totalPrice: parseFloat(avgPrice.toFixed(2)),
          margin: parseFloat(margin.toFixed(2)),
        };
      });

      return chartData;
    },

    handleExportCSV() {
      if (this.chartData.length === 0) {
        toast.error("No data to export");
        return;
      }

      const headers = [
        "Date",
        "Total Cost (€)",
        "Total Price (€)",
        "Margin (%)",
      ];
      const rows = this.chartData.map((d) => [
        d.date,
        d.totalCost.toFixed(2),
        d.totalPrice.toFixed(2),
        d.margin.toFixed(2),
      ]);

      const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
        "\n",
      );

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `menu-margin-report-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Report exported successfully");
    },

    handleToggleType(type) {
      this.selectedTypes = this.selectedTypes.includes(type)
        ? this.selectedTypes.filter((t) => t !== type)
        : [...this.selectedTypes, type];
    },

    handleToggleCategory(category) {
      this.selectedCategories = this.selectedCategories.includes(category)
        ? this.selectedCategories.filter((c) => c !== category)
        : [...this.selectedCategories, category];
    },

    handleToggleSpace(spaceId) {
      this.selectedSpaces = this.selectedSpaces.includes(spaceId)
        ? this.selectedSpaces.filter((s) => s !== spaceId)
        : [...this.selectedSpaces, spaceId];
    },
  },
};
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center h-64">
    <RefreshCw class="w-8 h-8 animate-spin text-gray-400" />
  </div>

   <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl">Menu Item Margin Report</h2>
        <p class="text-gray-600 text-sm mt-1">
          Track cost, price, and margin changes over time
        </p>
      </div>
 
      <div class="flex gap-2">
        <Button variant="outline" @click="showFilters = !showFilters">
          <Filter class="w-4 h-4 mr-2" />
          Filters
        </Button>
 
        <Button variant="outline" @click="handleExportCSV">
          <Download class="w-4 h-4 mr-2" />
          Export CSV
        </Button>
 
        <Button variant="outline" @click="loadData">
          <RefreshCw class="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
    </div>
 
    <!-- Filters -->
    <Card v-if="showFilters">
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
 
      <CardContent class="space-y-4">
        <!-- All dropdowns in one row -->
        <div class="grid grid-cols-4 gap-4">
          <!-- Specific Menu Item with Search -->
          <div>
            <label class="text-sm mb-2 block">Specific Menu Item</label>
 
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between"
                >
                  {{
                    selectedMenuItem === "all"
                      ? "All menu items"
                      : uniqueMenuItems.find((item) => item.id === selectedMenuItem)?.name ||
                        "Select..."
                  }}
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
 
              <PopoverContent class="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Search menu items..." />
                  <CommandList>
                    <CommandEmpty>No menu item found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="all" @select="selectedMenuItem = 'all'">
                        <Check
                          :class="[
                            'mr-2 h-4 w-4',
                            selectedMenuItem === 'all' ? 'opacity-100' : 'opacity-0',
                          ]"
                        />
                        All menu items
                      </CommandItem>
 
                      <CommandItem
                        v-for="item in uniqueMenuItems"
                        :key="item.id"
                        :value="item.name"
                        @select="selectedMenuItem = item.id"
                      >
                        <Check
                          :class="[
                            'mr-2 h-4 w-4',
                            selectedMenuItem === item.id ? 'opacity-100' : 'opacity-0',
                          ]"
                        />
                        {{ item.name }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
 
          <!-- Menu Item Type - Multiselect -->
          <div>
            <label class="text-sm mb-2 block">Menu Item Type</label>
 
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between"
                >
                  {{ selectedTypes.length === 0 ? "All types" : `${selectedTypes.length} selected` }}
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
 
              <PopoverContent class="w-[200px] p-0">
                <Command>
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        v-for="type in uniqueTypes"
                        :key="type"
                        @select="handleToggleType(type)"
                      >
                        <Checkbox
                          :checked="selectedTypes.includes(type)"
                          class="mr-2"
                        />
                        {{ type }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
 
          <!-- Category - Multiselect -->
          <div>
            <label class="text-sm mb-2 block">Category</label>
 
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between"
                >
                  {{
                    selectedCategories.length === 0
                      ? "All categories"
                      : `${selectedCategories.length} selected`
                  }}
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
 
              <PopoverContent class="w-[200px] p-0">
                <Command>
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        v-for="category in uniqueCategories"
                        :key="category"
                        @select="handleToggleCategory(category)"
                      >
                        <Checkbox
                          :checked="selectedCategories.includes(category)"
                          class="mr-2"
                        />
                        {{ category }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
 
          <!-- Space - Multiselect -->
          <div>
            <label class="text-sm mb-2 block">Space</label>
 
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between"
                >
                  {{ selectedSpaces.length === 0 ? "All spaces" : `${selectedSpaces.length} selected` }}
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
 
              <PopoverContent class="w-[200px] p-0">
                <Command>
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        v-for="space in spaces"
                        :key="space.id"
                        @select="handleToggleSpace(space.id)"
                      >
                        <Checkbox
                          :checked="selectedSpaces.includes(space.id)"
                          class="mr-2"
                        />
                        {{ space.name }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
 
    <!-- Chart -->
    <Card>
      <CardHeader>
        <CardTitle>
          {{
            selectedMenuItem && selectedMenuItem !== "all"
              ? `Margin Trend: ${
                  uniqueMenuItems.find((i) => i.id === selectedMenuItem)?.name || "Selected Item"
                }`
              : "Aggregated Menu Margin Trend"
          }}
        </CardTitle>
      </CardHeader>
 
      <CardContent>
        <div
          v-if="chartData.length === 0"
          class="flex items-center justify-center h-64 text-gray-500"
        >
          No data available for the selected filters
        </div>
 
        <div v-else class="space-y-4">
          <!-- Summary Stats -->
          <div class="grid grid-cols-3 gap-4">
            <div class="bg-blue-50 dark:bg-blue-900/30 p-4 rounded">
              <div class="text-sm text-gray-600 dark:text-gray-300">Avg Total Cost</div>
              <div class="text-2xl text-gray-900 dark:text-white">
                €{{
                  (
                    chartData.reduce((sum, d) => sum + d.totalCost, 0) / chartData.length
                  ).toFixed(2)
                }}
              </div>
            </div>
 
            <div class="bg-green-50 dark:bg-green-900/30 p-4 rounded">
              <div class="text-sm text-gray-600 dark:text-gray-300">Avg Total Price</div>
              <div class="text-2xl text-gray-900 dark:text-white">
                €{{
                  (
                    chartData.reduce((sum, d) => sum + d.totalPrice, 0) / chartData.length
                  ).toFixed(2)
                }}
              </div>
            </div>
 
            <div class="bg-purple-50 dark:bg-purple-900/30 p-4 rounded">
              <div class="text-sm text-gray-600 dark:text-gray-300">Avg Margin</div>
              <div class="text-2xl text-gray-900 dark:text-white">
                {{
                  (
                    chartData.reduce((sum, d) => sum + d.margin, 0) / chartData.length
                  ).toFixed(2)
                }}%
              </div>
            </div>
          </div>
 
          <!-- Line Chart -->
          <div class="w-full h-[400px]">
            <div class="flex items-center justify-center h-full text-gray-500">
              Chart component goes here
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
 
    <!-- Snapshots Summary -->
    <Card>
      <CardHeader>
        <CardTitle>Recent Changes</CardTitle>
      </CardHeader>
 
      <CardContent>
        <div
          v-if="filteredSnapshots.length === 0"
          class="text-center text-gray-500 dark:text-gray-400 py-8"
        >
          No snapshots recorded yet
        </div>
 
        <div v-else class="space-y-2">
          <div
            v-for="snapshot in filteredSnapshots
              .slice()
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 10)"
            :key="snapshot.id"
            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded"
          >
            <div>
              <div class="text-gray-900 dark:text-white">
                {{ snapshot.menuItemName }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                {{ snapshot.changeReason }} • {{ new Date(snapshot.timestamp).toLocaleString() }}
              </div>
            </div>
 
            <div class="text-right">
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Cost: €{{ snapshot.totalCost.toFixed(2) }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Price: €{{ snapshot.basePrice.toFixed(2) }}
              </div>
              <div
                :class="[
                  'text-sm',
                  snapshot.margin >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                ]"
              >
                Margin: {{ snapshot.margin.toFixed(2) }}%
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
