<script>
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
import ImageWithFallback from "@/figma/ImageWithFallBack.vue";
import { X, Upload } from "lucide-vue-next";
import { toast } from "vue-sonner";

const INGREDIENT_CATEGORIES = [
  "Fish",
  "Meat",
  "Cheese",
  "Dairy",
  "Bread",
  "Vegetable",
  "Fruit",
  "Spice",
  "Condiment",
  "Soft Drink",
  "Wine",
  "Champagne",
  "Sparkling Wine",
  "Liquor",
  "Beer",
  "Water",
  "Juice",
  "Cereals",
  "Seed",
  "Starchy",
];

const PACKAGING_CATEGORIES = [
  "Cup",
  "Bottle",
  "Box",
  "Bag",
  "Container",
  "Wrap",
  "Utensils",
  "Napkin",
  "Straw",
  "Lid",
];

export default {
  name: "ItemNameEditDialog",
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
    ImageWithFallback,
  },
  props: {
    open: { type: Boolean, required: true },
    onOpenChange: { type: Function, required: true },

    itemName: { type: String, required: true },
    goodType: { type: String, required: true }, // "Food" | "Beverage" | "Packaging"
    category: { type: String, default: undefined },
    recipeUnit: { type: String, default: undefined }, // "kg" | "l" | "pc"
    purchaseUnitConversion: { type: Number, default: undefined },
    image: { type: String, default: undefined },
    lastSupplierUnit: { type: String, default: undefined },

    onSave: { type: Function, required: true },
  },

  data() {
    return {
      INGREDIENT_CATEGORIES,
      PACKAGING_CATEGORIES,

      formData: {
        itemName: this.itemName,
        goodType: this.goodType,
        category: this.category || "",
        recipeUnit: this.recipeUnit || "kg",
        purchaseUnitConversion: this.purchaseUnitConversion || 1,
        image: this.image || "",
      },

      imagePreview: this.image || "",
    };
  },

  watch: {
    open: {
      handler() {
        this._syncFromPropsWhenOpen();
      },
      immediate: true,
    },

    itemName() {
      this._syncFromPropsWhenOpen();
    },
    goodType() {
      this._syncFromPropsWhenOpen();
    },
    category() {
      this._syncFromPropsWhenOpen();
    },
    recipeUnit() {
      this._syncFromPropsWhenOpen();
    },
    purchaseUnitConversion() {
      this._syncFromPropsWhenOpen();
    },
    image() {
      this._syncFromPropsWhenOpen();
    },
  },

  methods: {
    _syncFromPropsWhenOpen() {
      if (!this.open) return;

      this.formData = {
        itemName: this.itemName,
        goodType: this.goodType,
        category: this.category || "",
        recipeUnit: this.recipeUnit || "kg",
        purchaseUnitConversion: this.purchaseUnitConversion || 1,
        image: this.image || "",
      };

      this.imagePreview = this.image || "";
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
        this.formData = { ...this.formData, image: asString };
      };
      reader.readAsDataURL(file);
    },

    handleRemoveImage() {
      this.imagePreview = "";
      this.formData = { ...this.formData, image: "" };
    },

    handleSave() {
      if (!this.formData.itemName.trim()) {
        toast.error("Please enter an item name");
        return;
      }

      this.onSave({
        itemName: this.formData.itemName.trim(),
        goodType: this.formData.goodType,
        category: this.formData.category || undefined,
        recipeUnit: this.formData.recipeUnit || undefined,
        purchaseUnitConversion:
          this.formData.purchaseUnitConversion || undefined,
        image: this.formData.image || undefined,
      });

      this.onOpenChange(false);
    },
  },
};
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent class="max-w-md" aria-describedby="edit-item-name-description">
      <DialogHeader>
        <DialogTitle>Edit Item Name</DialogTitle>
        <DialogDescription id="edit-item-name-description">
          Update the item name, good type, and image
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Image Upload -->
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

        <!-- Item Name -->
        <div>
          <Label>Item Name *</Label>
          <Input
            :value="formData.itemName"
            placeholder="Enter item name"
            @input="formData = { ...formData, itemName: $event.target.value }"
          />
        </div>

        <!-- Good Type -->
        <div>
          <Label>Good Type *</Label>

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

        <!-- Category -->
        <div>
          <Label>
            {{
              formData.goodType === "Food" || formData.goodType === "Beverage"
                ? "Ingredient Category (Optional)"
                : "Packaging Category (Optional)"
            }}
          </Label>

          <Select
            :modelValue="formData.category"
            @update:modelValue="formData = { ...formData, category: $event }"
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>

            <SelectContent>
              <template v-if="formData.goodType === 'Food' || formData.goodType === 'Beverage'">
                <SelectItem
                  v-for="cat in INGREDIENT_CATEGORIES"
                  :key="cat"
                  :value="cat"
                >
                  {{ cat }}
                </SelectItem>
              </template>

              <template v-else>
                <SelectItem
                  v-for="cat in PACKAGING_CATEGORIES"
                  :key="cat"
                  :value="cat"
                >
                  {{ cat }}
                </SelectItem>
              </template>
            </SelectContent>
          </Select>
        </div>

        <!-- Recipe Unit -->
        <div>
          <Label>Recipe Unit (Optional)</Label>
          <p class="text-sm text-gray-500 mb-2">What is the unit in the recipe?</p>

          <Select
            :modelValue="formData.recipeUnit"
            @update:modelValue="formData = { ...formData, recipeUnit: $event }"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="kg">Kg</SelectItem>
              <SelectItem value="l">l</SelectItem>
              <SelectItem value="pc">pc</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Purchase Unit Conversion -->
        <div>
          <Label>Purchase Unit Conversion (Optional)</Label>

          <p class="text-sm text-gray-500 mb-2">
            {{
              lastSupplierUnit
                ? `How many ${lastSupplierUnit} do you need to make one ${formData.recipeUnit}?`
                : `How many purchase unit do you need to make one ${formData.recipeUnit}?`
            }}
          </p>

          <Input
            type="number"
            step="0.001"
            :value="formData.purchaseUnitConversion"
            placeholder="Enter conversion factor"
            @input="
              formData = {
                ...formData,
                purchaseUnitConversion: parseFloat($event.target.value) || 0,
              }
            "
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="onOpenChange(false)">
          Cancel
        </Button>

        <Button @click="handleSave">
          Save Changes
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
