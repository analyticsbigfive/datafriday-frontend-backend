<script>
import Button from "../ui/button.vue";
import Input from "../ui/input.vue";
import Dialog from "../ui/dialog.vue";
import DialogContent from "../ui/dialogContent.vue";
import DialogDescription from "../ui/dialogDescription.vue";
import DialogHeader from "../ui/dialogHeader.vue";
import DialogTitle from "../ui/dialogTitle.vue";
import Table from "../ui/table.vue";
import TableBody from "../ui/tableBody.vue";
import TableCell from "../ui/tableCell.vue";
import TableHead from "../ui/tableHead.vue";
import TableHeader from "../ui/tableHeader.vue";
import TableRow from "../ui/tableRow.vue";
import Badge from "../ui/badge.vue";

import { Search } from "lucide-vue-next";

import Select from "../ui/select.vue";
import SelectContent from "../ui/selectContent.vue";
import SelectGroup from "../ui/selectGroup.vue";
import SelectItem from "../ui/selectItem.vue";
import SelectLabel from "../ui/selectLabel.vue";
import SelectTrigger from "../ui/selectTrigger.vue";
import SelectValue from "../ui/selectValue.vue";
import Checkbox from "../ui/checkbox.vue";

import * as api from "../utils/api";

import { toast } from "vue-sonner";

export default {
  name: "PackagingSelectorDialog",
  components: {
    Button,
    Input,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Badge,
    Search,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
    Checkbox,
  },
  props: {
    onSelect: {
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
      searchQuery: "",
      categoryFilter: "all",
      selectedItems: new Set(),
      packaging: [],
      marketPrices: [],
      suppliers: [],
      loading: true,
    };
  },
  computed: {
    packagingCategories() {
      return Array.from(new Set(this.packaging.map((item) => item.ingredientCategory))).sort();
    },
    filteredPackaging() {
      return this.packaging.filter((item) => {
        const matchesSearch =
          item.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          this.getSupplier(item).toLowerCase().includes(this.searchQuery.toLowerCase());

        const matchesCategory =
          this.categoryFilter === "all" || item.ingredientCategory === this.categoryFilter;

        return matchesSearch && matchesCategory;
      });
    },
  },
  mounted() {
    this.fetchPackaging();
  },
  methods: {
    // Helper function to get supplier from market price
    getSupplier(item) {
      const marketPrice = this.marketPrices.find((mp) => mp.id === item.marketPriceId);
      if (!marketPrice || !marketPrice.supplier_id) return "-";

      const supplier = this.suppliers.find((s) => s.id === marketPrice.supplier_id);
      return (supplier && supplier.name) || "-";
    },

    // Helper function to get packaging category from market price
    getPackagingCategory(item) {
      const marketPrice = this.marketPrices.find((mp) => mp.id === item.marketPriceId);
      // Return the packaging category from market price metadata
      // For now, we'll extract it from the ingredient category
      return item.ingredientCategory || "-";
    },

    // Fetch packaging items from database
    async fetchPackaging() {
      try {
        this.loading = true;

        // First, cleanup any invalid entries in the database
        try {
          const cleanupResult = await api.cleanupInvalidPackaging();
          if (cleanupResult && cleanupResult.message) {
            console.log("Database cleanup:", cleanupResult.message);
          }
        } catch (cleanupError) {
          console.error("Error during cleanup:", cleanupError);
          // Continue even if cleanup fails
        }

        // Fetch market prices, packaging, and suppliers
        const [marketPricesData, packagingData, suppliersData] = await Promise.all([
          api.getAllMarketPrices(),
          api.getAllPackaging(),
          api.getAllSuppliers(),
        ]);

        this.marketPrices = marketPricesData;
        this.suppliers = suppliersData;
        const data = packagingData;

        // Filter out any invalid entries
        const validPackaging = data.filter((item) => {
          const isValid =
            item &&
            typeof item.id === "string" &&
            typeof item.marketPriceId === "string" &&
            item.marketPriceId.trim() !== "" &&
            typeof item.name === "string" &&
            item.name.trim() !== "" &&
            typeof item.ingredientCategory === "string" &&
            typeof item.purchaseUnit === "string" &&
            typeof item.recipeUnit === "string" &&
            typeof item.purchaseUnitsPerRecipeUnit === "number" &&
            typeof item.costPerPurchaseUnit === "number" &&
            typeof item.costPerRecipeUnit === "number" &&
            typeof item.storageType === "string";

          if (!isValid && item && item.name) {
            console.warn("Filtered out invalid packaging item:", item.name);
          }

          return isValid;
        });

        this.packaging = validPackaging;
      } catch (error) {
        console.error("Error fetching packaging:", error);
        toast.error("Failed to load packaging items");
      } finally {
        this.loading = false;
      }
    },

    // Toggle single item selection
    toggleItem(id) {
      const newSelected = new Set(this.selectedItems);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      this.selectedItems = newSelected;
    },

    // Toggle all items selection
    toggleAll() {
      if (
        this.selectedItems.size === this.filteredPackaging.length &&
        this.filteredPackaging.length > 0
      ) {
        this.selectedItems = new Set();
      } else {
        this.selectedItems = new Set(this.filteredPackaging.map((item) => item.id));
      }
    },

    // Handle add selected items
    handleAddSelected() {
      const selected = this.packaging.filter((item) => this.selectedItems.has(item.id));
      if (selected.length === 0) {
        toast.error("Please select at least one packaging item");
        return;
      }

      const suppliersMap = new Map();
      selected.forEach((item) => {
        suppliersMap.set(item.id, this.getSupplier(item));
      });

      this.onSelect(selected, suppliersMap);
    },
  },
};
</script>

<template>
  <Dialog open :onOpenChange="onClose">
    <DialogContent
      className="max-w-6xl max-h-[90vh] flex flex-col"
      aria-describedby="packaging-selector-description"
    >
      <DialogHeader>
        <DialogTitle>Select Packaging Items</DialogTitle>
        <DialogDescription id="packaging-selector-description">
          Choose one or more packaging items to add to your menu item
        </DialogDescription>
      </DialogHeader>

      <!-- Search and Filters -->
      <div className="flex gap-4 py-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search packaging items..."
            className="pl-10"
            :value="searchQuery"
            @input="searchQuery = $event?.target?.value"
          />
        </div>

        <Select v-model="categoryFilter">
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem
              v-for="category in packagingCategories"
              :key="category"
              :value="category"
            >
              {{ category }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Table -->
      <div className="flex-1 overflow-auto border rounded-lg">
        <Table>
          <TableHeader className="sticky top-0 bg-white dark:bg-gray-900 z-10">
            <TableRow>
              <TableHead className="w-12 dark:bg-gray-900">
                <Checkbox
                  :checked="selectedItems.size === filteredPackaging.length && filteredPackaging.length > 0"
                  @update:checked="toggleAll"
                />
              </TableHead>
              <TableHead className="dark:bg-gray-900">Name</TableHead>
              <TableHead className="dark:bg-gray-900">Packaging Category</TableHead>
              <TableHead className="dark:bg-gray-900">Supplier</TableHead>
              <TableHead className="dark:bg-gray-900">Recipe Unit</TableHead>
              <TableHead className="text-right dark:bg-gray-900">Cost/Unit</TableHead>
              <TableHead className="dark:bg-gray-900">Storage</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow v-if="loading">
              <TableCell :colSpan="7" className="text-center py-8">
                Loading packaging items...
              </TableCell>
            </TableRow>

            <TableRow v-else-if="filteredPackaging.length === 0">
              <TableCell
                :colSpan="7"
                className="text-center text-gray-500 dark:text-gray-400 py-8"
              >
                No packaging items found
              </TableCell>
            </TableRow>

            <TableRow
              v-else
              v-for="item in filteredPackaging"
              :key="item.id"
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
              @click="toggleItem(item.id)"
            >
              <TableCell @click.stop>
                <Checkbox
                  :checked="selectedItems.has(item.id)"
                  @update:checked="() => toggleItem(item.id)"
                />
              </TableCell>

              <TableCell>{{ item.name }}</TableCell>

              <TableCell>
                <Badge variant="outline">{{ item.ingredientCategory }}</Badge>
              </TableCell>

              <TableCell>{{ getSupplier(item) }}</TableCell>

              <TableCell>{{ item.recipeUnit }}</TableCell>

              <TableCell className="text-right">
                €{{ item.costPerRecipeUnit.toFixed(2) }}
              </TableCell>

              <TableCell>
                <Badge variant="secondary">{{ item.storageType }}</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Footer -->
      <div className="flex justify-between items-center pt-4 border-t">
        <div className="text-sm text-gray-500">
          {{ selectedItems.size }} item{{ selectedItems.size !== 1 ? "s" : "" }} selected
        </div>
        <div className="flex gap-2">
          <Button variant="outline" :onClick="onClose">
            Cancel
          </Button>
          <Button
            :onClick="handleAddSelected"
            :disabled="selectedItems.size === 0"
          >
            Add Selected ({{ selectedItems.size }})
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>