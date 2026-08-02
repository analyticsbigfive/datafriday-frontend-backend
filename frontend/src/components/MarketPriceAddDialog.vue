<script>
import { toast } from "vue-sonner";
import Dialog from "../ui/dialog.vue";
import DialogContent from "../ui/dialogContent.vue";
import DialogDescription from "../ui/dialogDescription.vue";
import DialogFooter from "../ui/dialogFooter.vue";
import DialogHeader from "../ui/dialogHeader.vue";
import DialogTitle from "../ui/dialogTitle.vue";

import Button from "../ui/button.vue";
import Input from "../ui/input.vue";
import Label from "../ui/label.vue";
import Select from "../ui/select.vue";
import SelectContent from "../ui/selectContent.vue";
import SelectItem from "../ui/selectItem.vue";
import SelectTrigger from "../ui/selectTrigger.vue";
import SelectValue from "../ui/selectValue.vue";

import { X, Upload, Image as ImageIcon, Plus } from "lucide-vue-next";

import ImageWithFallback from "../figma/ImageWithFallBack.vue";
import NumberField from "@/components/common/NumberField.vue";
import { formatCurrencyDetailed } from "@/composables/useFormatters";
export default {
  name: "MarketPriceAddDialog",
  components: {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    X,
    Upload,
    ImageIcon,
    Plus,
    ImageWithFallback,
    NumberField,
  },
  props: {
    open: { type: Boolean, required: true },
    onOpenChange: { type: Function, required: true },
    suppliers: { type: Array, required: true },
    existingItemNames: { type: Array, required: true },
    existingMarketPrices: { type: Array, required: true },
    onSave: { type: Function, required: true },
    preselectedItemName: { type: String, default: undefined },
  },

  data() {
    return {
      step: 1, // 1 | 2
      itemNameMode: "select", // "select" | "create"

      // Step 1
      selectedItemName: "",
      newItemName: "",
      newItemGoodType: "Food", // "Food" | "Beverage" | "Packaging"
      newItemImage: "",
      imagePreview: "",

      // Step 2
      supplierItemData: {
        supplier_id: "",
        supplierItem: "",
        unit: "kg",
        unitsPerPurchase: 1,
        price: 0,
        pricePerUnit: 0,
        // packedUnits?: number;
        // numberOfUnits?: number;
        // packingLength?: number;
        // packingWidth?: number;
        // packingHeight?: number;
      },
    };
  },

  watch: {
    preselectedItemName: {
      handler() {
        this._syncStepFromProps();
      },
      immediate: true,
    },

    open: {
      handler() {
        this._syncStepFromProps();
      },
      immediate: true,
    },

    existingItemNames: {
      handler() {
        this._syncStepFromProps();
      },
      deep: false,
      immediate: true,
    },

    "supplierItemData.price": {
      handler() {
        this._recalcPricePerUnit();
      },
      immediate: true,
    },

    "supplierItemData.unitsPerPurchase": {
      handler() {
        this._recalcPricePerUnit();
      },
      immediate: true,
    },
  },

  methods: {
    formatCurrencyDetailed,

    _syncStepFromProps() {
      if (this.preselectedItemName && this.open) {
        this.selectedItemName = this.preselectedItemName;
        this.itemNameMode = "select";
        this.step = 2;
      } else if (this.open) {
        this.step = 1;
        this.itemNameMode =
          this.existingItemNames.length > 0 ? "select" : "create";
      }
    },

    _recalcPricePerUnit() {
      const units = this.supplierItemData.unitsPerPurchase;
      const price = this.supplierItemData.price;

      const pricePerUnit = units && units > 0 ? price / units : 0;

      this.supplierItemData = {
        ...this.supplierItemData,
        pricePerUnit,
      };
    },

    handleImageUpload(e) {
      const file =
        e && e.target && e.target.files ? e.target.files[0] : undefined;
      if (!file) return;

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        const asString = typeof result === "string" ? result : "";
        this.imagePreview = asString;
        this.newItemImage = asString;
      };
      reader.readAsDataURL(file);
    },

    handleRemoveImage() {
      this.imagePreview = "";
      this.newItemImage = "";
    },

    handleStep1Next() {
      if (this.itemNameMode === "select") {
        if (!this.selectedItemName) {
          toast.error("Please select an item name");
          return;
        }
      } else {
        if (!this.newItemName.trim()) {
          toast.error("Please enter an item name");
          return;
        }
      }

      this.step = 2;
    },

    handleBack() {
      this.step = 1;
    },

    handleSave() {
      // Validate supplier item data
      if (!this.supplierItemData.supplier_id) {
        toast.error("Please select a supplier");
        return;
      }
      if (!this.supplierItemData.supplierItem.trim()) {
        toast.error("Please enter a supplier item name");
        return;
      }
      if (this.supplierItemData.unitsPerPurchase <= 0) {
        toast.error("Units per purchase must be greater than 0");
        return;
      }
      if (this.supplierItemData.price < 0) {
        toast.error("Price cannot be negative");
        return;
      }

      // Determine final item name and good type
      const finalItemName =
        this.itemNameMode === "select"
          ? this.selectedItemName
          : this.newItemName.trim();

      let finalGoodType;
      let finalImage;

      if (this.itemNameMode === "select") {
        const existingItem = this.existingItemNames.find(
          (item) => item.itemName === finalItemName,
        );
        finalGoodType = existingItem.goodType;
        finalImage = existingItem.image;
      } else {
        finalGoodType = this.newItemGoodType;
        finalImage = this.newItemImage || undefined;
      }

      // Check if this exact supplier item already exists under a DIFFERENT item name
      const existingWithDifferentName = this.existingMarketPrices.find(
        (item) =>
          item.supplierItem === this.supplierItemData.supplierItem &&
          item.itemName !== finalItemName,
      );

      if (existingWithDifferentName) {
        toast.error(
          `Supplier Item "${this.supplierItemData.supplierItem}" already exists under Item Name "${existingWithDifferentName.itemName}"`,
        );
        return;
      }

      // Check for exact duplicate
      const duplicate = this.existingMarketPrices.find(
        (item) =>
          item.itemName === finalItemName &&
          item.supplierItem === this.supplierItemData.supplierItem &&
          item.supplier_id === this.supplierItemData.supplier_id &&
          item.unit === this.supplierItemData.unit &&
          item.unitsPerPurchase === this.supplierItemData.unitsPerPurchase &&
          item.price === this.supplierItemData.price,
      );

      if (duplicate) {
        toast.error("This exact market price entry already exists");
        return;
      }

      const newItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        itemName: finalItemName,
        goodType: finalGoodType,
        image: finalImage,
        timestamp: new Date().toISOString(),
        ...this.supplierItemData,
      };

      this.onSave(newItem);
      this.handleClose();
    },

    handleClose() {
      this.onOpenChange(false);

      // Reset state
      setTimeout(() => {
        this.step = 1;
        this.itemNameMode = "select";
        this.selectedItemName = "";
        this.newItemName = "";
        this.newItemGoodType = "Food";
        this.newItemImage = "";
        this.imagePreview = "";

        this.supplierItemData = {
          supplier_id: "",
          supplierItem: "",
          unit: "kg",
          unitsPerPurchase: 1,
          price: 0,
          pricePerUnit: 0,
        };
      }, 200);
    },
  },
};
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      class="max-w-2xl max-h-[90vh] overflow-y-auto"
      aria-describedby="add-market-price-description"
    >
      <DialogHeader>
        <DialogTitle>
          Add Market Price - Step {{ step }} of 2
        </DialogTitle>

        <DialogDescription id="add-market-price-description">
          {{ step === 1 ? "Select or create an Item Name" : "Add Supplier Item details" }}
        </DialogDescription>
      </DialogHeader>

      <template v-if="step === 1">
        <div class="space-y-4">
          <div
            v-if="!preselectedItemName && existingItemNames.length > 0"
            class="flex gap-2"
          >
            <Button
              :variant="itemNameMode === 'select' ? 'default' : 'outline'"
              class="flex-1"
              @click="itemNameMode = 'select'"
            >
              Select Existing
            </Button>

            <Button
              :variant="itemNameMode === 'create' ? 'default' : 'outline'"
              class="flex-1"
              @click="itemNameMode = 'create'"
            >
              Create New
            </Button>
          </div>

          <template v-if="itemNameMode === 'select'">
            <div>
              <Label>Item Name *</Label>

              <Select
                :modelValue="selectedItemName"
                @update:modelValue="selectedItemName = $event"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select item name..." />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem
                    v-for="item in existingItemNames"
                    :key="item.itemName"
                    :value="item.itemName"
                  >
                    {{ item.itemName }} ({{ item.goodType }})
                  </SelectItem>
                </SelectContent>
              </Select>

              <div
                v-if="selectedItemName"
                class="mt-3 p-3 bg-gray-50 rounded-lg"
              >
                <div class="flex items-center gap-3">
                  <ImageWithFallback
                    v-if="existingItemNames.find((i) => i.itemName === selectedItemName)?.image"
                    :src="existingItemNames.find((i) => i.itemName === selectedItemName).image"
                    :alt="selectedItemName"
                    class="w-16 h-16 object-cover rounded"
                  />

                  <div>
                    <div class="font-medium">
                      {{ selectedItemName }}
                    </div>

                    <div class="text-sm text-gray-600">
                      {{
                        existingItemNames.find((i) => i.itemName === selectedItemName)?.goodType
                      }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <div>
              <Label>Image (Optional)</Label>

              <div class="mt-2">
                <div v-if="imagePreview" class="relative inline-block">
                  <ImageWithFallback
                    :src="imagePreview"
                    alt="Preview"
                    class="w-32 h-32 object-cover rounded border"
                  />

                  <Button
                    variant="destructive"
                    size="icon"
                    class="absolute -top-2 -right-2 w-6 h-6"
                    @click="handleRemoveImage"
                  >
                    <X class="w-4 h-4" />
                  </Button>
                </div>

                <label
                  v-else
                  class="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-gray-300 rounded cursor-pointer hover:border-gray-400"
                >
                  <Upload class="w-8 h-8 text-gray-400" />
                  <span class="text-xs text-gray-500 mt-2">Upload</span>

                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleImageUpload"
                  />
                </label>
              </div>
            </div>

            <div>
              <Label>Item Name *</Label>
              <Input
                :value="newItemName"
                placeholder="Enter item name"
                @input="newItemName = $event.target.value"
              />
            </div>

            <div>
              <Label>Good Type *</Label>

              <Select
                :modelValue="newItemGoodType"
                @update:modelValue="newItemGoodType = $event"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="Food">Food</SelectItem>
                  <SelectItem value="Beverage">Beverage</SelectItem>
                  <SelectItem value="Packaging">Packaging</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </template>
        </div>
      </template>

      <template v-else>
        <div class="space-y-4">
          <div class="p-3 bg-blue-50 rounded-lg">
            <div class="text-sm font-medium text-blue-900">
              Adding supplier item to:
              <span class="font-bold">
                {{ itemNameMode === "select" ? selectedItemName : newItemName }}
              </span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <Label>Supplier *</Label>

              <Select
                :modelValue="supplierItemData.supplier_id"
                @update:modelValue="
                  supplierItemData = { ...supplierItemData, supplier_id: $event }
                "
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem
                    v-for="supplier in suppliers"
                    :key="supplier.id"
                    :value="supplier.id"
                  >
                    {{ supplier.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="col-span-2">
              <Label>Supplier Item *</Label>
              <Input
                :value="supplierItemData.supplierItem"
                placeholder="Supplier's item name or code"
                @input="
                  supplierItemData = {
                    ...supplierItemData,
                    supplierItem: $event.target.value,
                  }
                "
              />
            </div>

            <div>
              <Label>Unit *</Label>
              <Input
                :value="supplierItemData.unit"
                placeholder="e.g., kg, liter, piece"
                @input="
                  supplierItemData = { ...supplierItemData, unit: $event.target.value }
                "
              />
            </div>

            <div>
              <Label>Units Per Purchase *</Label>
              <NumberField
                v-model="supplierItemData.unitsPerPurchase"
                :decimals="2"
                :min="0"
                :empty-value="0"
              />
            </div>

            <div>
              <Label>Price *</Label>
              <NumberField
                v-model="supplierItemData.price"
                :decimals="2"
                :min="0"
                pad
                grouping
                :empty-value="0"
              />
            </div>

            <div>
              <Label>Price Per Unit</Label>
              <Input
                :value="formatCurrencyDetailed(supplierItemData.pricePerUnit || 0)"
                disabled
                class="bg-gray-100"
              />
            </div>

            <div>
              <Label>Packed Units (Optional)</Label>
              <NumberField
                v-model="supplierItemData.packedUnits"
                :decimals="2"
                :min="0"
                placeholder="e.g., 10"
              />
            </div>

            <div>
              <Label>Number of Units (Optional)</Label>
              <NumberField
                v-model="supplierItemData.numberOfUnits"
                :decimals="2"
                :min="0"
                placeholder="e.g., 5"
              />
            </div>

            <div class="col-span-2">
              <Label>Packing Dimensions (L/W/H in cm) - Optional</Label>

              <div class="grid grid-cols-3 gap-2">
                <NumberField
                  v-model="supplierItemData.packingLength"
                  :decimals="2"
                  :min="0"
                  placeholder="Length"
                />

                <NumberField
                  v-model="supplierItemData.packingWidth"
                  :decimals="2"
                  :min="0"
                  placeholder="Width"
                />

                <NumberField
                  v-model="supplierItemData.packingHeight"
                  :decimals="2"
                  :min="0"
                  placeholder="Height"
                />
              </div>
            </div>
          </div>
        </div>
      </template>

      <DialogFooter>
        <template v-if="step === 1">
          <Button variant="outline" @click="handleClose">
            Cancel
          </Button>
          <Button @click="handleStep1Next">
            Next
          </Button>
        </template>

        <template v-else>
          <Button
            v-if="!preselectedItemName"
            variant="outline"
            @click="handleBack"
          >
            Back
          </Button>

          <Button variant="outline" @click="handleClose">
            Cancel
          </Button>

          <Button @click="handleSave">
            Add Supplier Item
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
