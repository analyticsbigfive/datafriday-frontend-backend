<script>
import { toast } from "vue-sonner";
import { X, Upload } from "lucide-vue-next";
import ImageWithFallback from "../figma/ImageWithFallBack.vue";
import Label from "../ui/label.vue";
import Input from "../ui/input.vue";
import Button from "../ui/button.vue";
import Select from "../ui/select.vue";
import SelectContent from "../ui/selectContent.vue";
import SelectItem from "../ui/selectItem.vue";
import SelectTrigger from "../ui/selectTrigger.vue";
import Dialog from "../ui/dialog.vue"; 
import DialogContent from "../ui/dialogContent.vue";
import DialogDescription from "../ui/dialogDescription.vue";
import DialogFooter from "../ui/dialogFooter.vue";
import DialogHeader from "../ui/dialogHeader.vue";
import DialogTitle from "../ui/dialogTitle.vue";
import NumberField from "@/components/common/NumberField.vue";
import { formatCurrencyDetailed } from "@/composables/useFormatters";
export default {
  name: "MarketPriceDialog",
  components:{
    Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,
    Label,Input,Button,Select,SelectContent,SelectItem,SelectTrigger,ImageWithFallback,X,Upload,NumberField
  },
  props: {
    item: { type: Object, default: null }, // MarketPriceItem | null
    suppliers: { type: Array, required: true }, // SupplierItem[]
    onSave: { type: Function, required: true },
    onCancel: { type: Function, required: true },
  },

  data() {
    return {
      formData: {
        supplier_id: "",
        itemName: "",
        goodType: "Food",
        unit: "kg",
        unitsPerPurchase: 1,
        price: 0,
        pricePerUnit: 0,
        image: "",
        packingLength: undefined,
        packingWidth: undefined,
        packingHeight: undefined,
        packedUnits: undefined,
        numberOfUnits: undefined,
        ...(this.item || {}),
      },

      imagePreview: (this.item && this.item.image) || "",
    };
  },

  watch: {
    "formData.price": {
      handler() {
        this._recalcPricePerUnit();
      },
      immediate: true,
    },

    "formData.unitsPerPurchase": {
      handler() {
        this._recalcPricePerUnit();
      },
      immediate: true,
    },
  },

  methods: {
    formatCurrencyDetailed,

    _recalcPricePerUnit() {
      const units = this.formData.unitsPerPurchase;
      const price = this.formData.price;

      const pricePerUnit = units && units > 0 ? price / units : 0;

      this.formData = {
        ...this.formData,
        pricePerUnit,
      };
    },

    handleImageUpload(e) {
      const file = e && e.target && e.target.files ? e.target.files[0] : undefined;
      if (!file) return;

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        const asString = typeof result === "string" ? result : "";

        this.imagePreview = asString;
        this.formData = { ...this.formData, image: asString };
      };
      reader.readAsDataURL(file);
    },

    handleRemoveImage() {
      this.imagePreview = "";
      this.formData = { ...this.formData, image: "" };
    },

    handleSave() {
      if (!this.formData.itemName || !this.formData.supplier_id) {
        toast.error("Please fill in item name and supplier");
        return;
      }

      this.onSave(this.formData);
    },
  },
};
</script>

<template>
  <Dialog :open="true" @update:open="onCancel">
    <DialogContent
      class="max-w-2xl max-h-[90vh] overflow-y-auto"
      aria-describedby="market-price-form-description"
    >
      <DialogHeader>
        <DialogTitle>
          {{ item ? "Edit Market Price" : "Add Market Price" }}
        </DialogTitle>

        <DialogDescription id="market-price-form-description">
          Enter the market price details for this item
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Image Upload -->
        <div>
          <Label>Item Image (Optional)</Label>

          <div v-if="imagePreview" class="relative w-32 h-32 mt-2">
            <ImageWithFallback
              :src="imagePreview"
              alt="Preview"
              class="w-32 h-32 object-cover rounded border"
            />

            <button
              class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
              @click="handleRemoveImage"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <div v-else class="mt-2">
            <label
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

        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <Label>Item Name *</Label>
            <Input
              :value="formData.itemName"
              placeholder="e.g., Chicken Breast"
              @input="formData = { ...formData, itemName: $event.target.value }"
            />
          </div>

          <div class="col-span-2">
            <Label>Supplier Item</Label>
            <Input
              :value="formData.supplierItem || ''"
              placeholder="Supplier's item name or code"
              @input="formData = { ...formData, supplierItem: $event.target.value }"
            />
          </div>

          <div class="col-span-2">
            <Label>Supplier *</Label>

            <Select
              :modelValue="formData.supplier_id"
              @update:modelValue="formData = { ...formData, supplier_id: $event }"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a supplier" />
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

          <div>
            <Label>Good Type</Label>

            <Select
              :modelValue="formData.goodType"
              @update:modelValue="formData = { ...formData, goodType: $event }"
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

          <div>
            <Label>Unit</Label>
            <Input
              :value="formData.unit"
              placeholder="e.g., kg, liter, piece"
              @input="formData = { ...formData, unit: $event.target.value }"
            />
          </div>

          <div>
            <Label>Units per Purchase</Label>
            <NumberField
              v-model="formData.unitsPerPurchase"
              :decimals="2"
              :min="0"
              :empty-value="0"
              placeholder="0"
            />
          </div>

          <div>
            <Label>Price (Total)</Label>
            <NumberField
              v-model="formData.price"
              :decimals="2"
              :min="0"
              pad
              grouping
              :empty-value="0"
              placeholder="0.00"
            />
          </div>
        </div>

        <!-- Packing Information -->
        <div>
          <Label>Packing Information (Optional)</Label>

          <div class="grid grid-cols-2 gap-4 mt-2">
            <div>
              <Label class="text-xs text-gray-500">
                Packed Units ({{ formData.unit || "unit" }})
              </Label>

              <NumberField
                v-model="formData.packedUnits"
                :decimals="2"
                :min="0"
                placeholder="e.g., 10"
              />
            </div>

            <div>
              <Label class="text-xs text-gray-500">Number of Units</Label>

              <NumberField
                v-model="formData.numberOfUnits"
                :decimals="2"
                :min="0"
                placeholder="e.g., 5"
              />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4 mt-4">
            <div>
              <Label class="text-xs text-gray-500">Length (cm)</Label>
              <NumberField
                v-model="formData.packingLength"
                :decimals="2"
                :min="0"
                placeholder="0"
              />
            </div>

            <div>
              <Label class="text-xs text-gray-500">Width (cm)</Label>
              <NumberField
                v-model="formData.packingWidth"
                :decimals="2"
                :min="0"
                placeholder="0"
              />
            </div>

            <div>
              <Label class="text-xs text-gray-500">Height (cm)</Label>
              <NumberField
                v-model="formData.packingHeight"
                :decimals="2"
                :min="0"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <!-- Calculated Price Per Unit -->
        <div class="p-4 bg-blue-50 rounded-lg">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600">Price per Unit (Calculated)</span>
            <span class="text-xl">
              {{ formatCurrencyDetailed(formData.pricePerUnit || 0) }}
            </span>
          </div>

          <p class="text-xs text-gray-500 mt-1">
            {{ formatCurrencyDetailed(formData.price || 0) }}
            ÷
            {{ formData.unitsPerPurchase || 0 }}
            {{ formData.unit }}
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="onCancel">
          Cancel
        </Button>

        <Button @click="handleSave">
          {{ item ? "Save Changes" : "Add Item" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>