<script>
import Button from "../ui/button.vue";
import Label from "../ui/label.vue";
import { Plus, Trash2 } from "lucide-vue-next";
import NumberField from "@/components/common/NumberField.vue";
import { formatCurrencyDetailed, formatPercent } from "@/composables/useFormatters";
import SpacePricingDialog from "./SpacePricingDialog.vue";
import Separator from "../ui/separator.vue";


export default {
  name: "SpaceSpecificPricing",
  components: {
    Button,
    Label,
    Plus,
    Trash2,
    NumberField,
    SpacePricingDialog,
    Separator,
  },
  props: {
    menuItemSpaceIds: {
      type: Array,
      required: true,
    },
    spaces: {
      type: Array,
      required: true,
    },
    basePrice: {
      type: Number,
      required: true,
    },
    spaceSpecificPrices: {
      type: Array,
      required: true,
    },
    onChange: {
      type: Function,
      required: true,
    },
    onBasePriceChange: {
      type: Function,
      required: true,
    },
    totalCost: {
      type: Number,
      required: true,
    },
  },
  data() {
    return {
      dialogOpen: false,
      editingPriceId: null, // string | 'default' | null
    };
  },
  computed: {
    // Get spaces that are assigned to the menu item
    menuItemSpaces() {
      return (this.spaces || []).filter((space) => this.menuItemSpaceIds.includes(space.id));
    },

    // Get spaces that are already assigned to specific prices
    assignedSpaceIds() {
      return new Set(
        (this.spaceSpecificPrices || []).flatMap((price) => price.spaceIds)
      );
    },

    // Get spaces that use the default price (not assigned to any specific price)
    defaultPriceSpaceIds() {
      return (this.menuItemSpaceIds || []).filter((id) => !this.assignedSpaceIds.has(id));
    },

    // Group spaces by their price - consolidate prices that are the same
    consolidatedPrices() {
      if (!this.spaceSpecificPrices || this.spaceSpecificPrices.length === 0) return [];

      const priceGroups = new Map(); // Map<number, { ids: string[], spaceIds: string[] }>

      this.spaceSpecificPrices.forEach((price) => {
        const priceValue = price.price;
        const existing = priceGroups.get(priceValue);

        if (existing) {
          existing.ids.push(price.id);
          existing.spaceIds.push(...price.spaceIds);
        } else {
          priceGroups.set(priceValue, {
            ids: [price.id],
            spaceIds: [...price.spaceIds],
          });
        }
      });

      return Array.from(priceGroups.entries()).map(([priceValue, group]) => ({
        id: group.ids[0],
        allIds: group.ids,
        price: priceValue,
        spaceIds: group.spaceIds,
      }));
    },

    currentEditingPrice() {
      if (this.editingPriceId === "default") {
        return null;
      }
      return this.consolidatedPrices.find((cp) =>
        cp.allIds.includes(this.editingPriceId || "")
      );
    },
  },
  methods: {
    handleOpenDialog(priceId) {
      this.editingPriceId = priceId;
      this.dialogOpen = true;
    },

    handleCloseDialog() {
      this.dialogOpen = false;
      this.editingPriceId = null;
    },

    handleSaveSpaceSelection(selectedSpaceIds) {
      if (this.editingPriceId === "default") {
        const newPrices = this.spaceSpecificPrices
          .map((price) => ({
            ...price,
            spaceIds: price.spaceIds.filter((id) => !selectedSpaceIds.includes(id)),
          }))
          .filter((price) => price.spaceIds.length > 0);

        this.onChange(newPrices);
      } else if (this.editingPriceId) {
        const editingConsolidated = this.consolidatedPrices.find((cp) =>
          cp.allIds.includes(this.editingPriceId)
        );

        if (editingConsolidated) {
          const otherPrices = this.spaceSpecificPrices.filter(
            (price) => !editingConsolidated.allIds.includes(price.id)
          );

          if (selectedSpaceIds.length > 0) {
            const newPrice = {
              id: editingConsolidated.id,
              spaceIds: selectedSpaceIds,
              price: editingConsolidated.price,
            };
            this.onChange([...otherPrices, newPrice]);
          } else {
            this.onChange(otherPrices);
          }
        }
      } else {
        const newPrice = {
          id: `price_${Date.now()}`,
          spaceIds: selectedSpaceIds,
          price: 0,
        };
        this.onChange([...(this.spaceSpecificPrices || []), newPrice]);
      }

      this.handleCloseDialog();
    },

    handleAddPrice() {
      const newPrice = {
        id: `price_${Date.now()}`,
        spaceIds: [],
        price: 0,
      };
      this.onChange([...(this.spaceSpecificPrices || []), newPrice]);
    },

    handleDeletePrice(priceId) {
      const editingConsolidated = this.consolidatedPrices.find((cp) =>
        cp.allIds.includes(priceId)
      );

      if (editingConsolidated) {
        this.onChange(
          this.spaceSpecificPrices.filter(
            (price) => !editingConsolidated.allIds.includes(price.id)
          )
        );
      }
    },

    handlePriceChange(priceId, newPrice) {
      const editingConsolidated = this.consolidatedPrices.find((cp) =>
        cp.allIds.includes(priceId)
      );

      if (editingConsolidated) {
        this.onChange(
          this.spaceSpecificPrices.map((price) =>
            editingConsolidated.allIds.includes(price.id)
              ? { ...price, price: newPrice }
              : price
          )
        );
      }
    },

    getSpaceCountText(spaceIds) {
      const count = spaceIds.length;
      if (count === 0) return "0 Spaces";
      if (count === 1) return "1 Space";
      return `${count} Spaces`;
    },

    getAllSpacesText() {
      const count = this.defaultPriceSpaceIds.length;
      if (count === this.menuItemSpaceIds.length) return "All Spaces";
      if (count === 0) return "0 Spaces";
      if (count === 1) return "1 Space";
      return `${count} Spaces`;
    },

    // Get available spaces for a specific price (excluding spaces assigned to other prices)
    getAvailableSpacesForPrice(priceId) {
      const editingConsolidated = this.consolidatedPrices.find((cp) =>
        cp.allIds.includes(priceId)
      );

      const otherAssignedSpaceIds = new Set(
        this.spaceSpecificPrices
          .filter((price) => !editingConsolidated?.allIds.includes(price.id))
          .flatMap((price) => price.spaceIds)
      );

      return this.menuItemSpaceIds.filter((id) => !otherAssignedSpaceIds.has(id));
    },

    calculateMargin(price) {
      if (price === 0) return 0;
      return ((price - this.totalCost) / price) * 100;
    },

    formatCurrencyDetailed,
    formatPercent,
  },
};
</script>

<template>
  <div className="space-y-3">
    <!-- Default Price Row - Only show if there are spaces not assigned to specific prices -->
    <div v-if="defaultPriceSpaceIds.length > 0" className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Label for="base-price" className="mb-2 block">
            Base Price (€) *
          </Label>
          <NumberField
            id="base-price"
            :model-value="basePrice"
            :decimals="2"
            :min="0"
            pad
            grouping
            :empty-value="0"
            @change="(value) => onBasePriceChange(value)"
          />
        </div>

        <div className="flex-shrink-0 pt-7">
          <button
            type="button"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            @click="handleOpenDialog('default')"
          >
            {{ getAllSpacesText() }}
          </button>
        </div>
      </div>

      <!-- Cost & Margin Display for base price -->
      <div
        className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2"
      >
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Total Cost per Piece:</span>
          <span className="dark:text-gray-100">{{ formatCurrencyDetailed(totalCost) }}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Base Price:</span>
          <span className="dark:text-gray-100">{{ formatCurrencyDetailed(basePrice) }}</span>
        </div>

        <Separator />

        <div className="flex justify-between">
          <span className="dark:text-gray-100">Margin:</span>
          <span
            :class="
              calculateMargin(basePrice) < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400'
            "
          >
            {{ formatPercent(calculateMargin(basePrice), 1) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Space-Specific Price Rows -->
    <div v-for="price in consolidatedPrices" :key="price.id" className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <NumberField
            :model-value="price.price"
            :decimals="2"
            :min="0"
            pad
            grouping
            :empty-value="0"
            @change="(value) => handlePriceChange(price.id, value)"
          />
        </div>

        <div className="flex-shrink-0">
          <button
            type="button"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            @click="handleOpenDialog(price.id)"
          >
            {{ getSpaceCountText(price.spaceIds) }}
          </button>
        </div>
      </div>

      <!-- Cost & Margin Display for space-specific price -->
      <div
        className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2"
      >
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Total Cost per Piece:</span>
          <span className="dark:text-gray-100">{{ formatCurrencyDetailed(totalCost || 0) }}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Price:</span>
          <span className="dark:text-gray-100">{{ formatCurrencyDetailed(price.price || 0) }}</span>
        </div>

        <Separator />

        <div className="flex justify-between">
          <span className="dark:text-gray-100">Margin:</span>
          <span
            :class="
              calculateMargin(price.price || 0) < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400'
            "
          >
            {{ formatPercent(calculateMargin(price.price || 0), 1) }}
          </span>
        </div>

        <!-- Delete button in bottom left -->
        <div className="pt-2">
          <button
            type="button"
            className="p-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/30 rounded"
            @click="handleDeletePrice(price.id)"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Add Button -->
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-2"
      @click="handleAddPrice"
    >
      <Plus className="w-4 h-4" />
      Add Price
    </Button>

    <!-- Space Selection Dialog -->
    <SpacePricingDialog
      :open="dialogOpen"
      :onClose="handleCloseDialog"
      :spaces="menuItemSpaces"
      :selectedSpaceIds="
        editingPriceId === 'default'
          ? defaultPriceSpaceIds
          : currentEditingPrice?.spaceIds || []
      "
      :availableSpaceIds="
        editingPriceId === 'default'
          ? menuItemSpaceIds
          : getAvailableSpacesForPrice(editingPriceId || '')
      "
      :onSave="handleSaveSpaceSelection"
      :isDefaultPrice="editingPriceId === 'default'"
    />
  </div>
</template>