<script>
import Button from "../ui/button.vue";
import Input from "../ui/input.vue";
import Label from "../ui/label.vue";
import Select from "../ui/select.vue";
import SelectContent from "../ui/selectContent.vue";
import SelectItem from "../ui/selectItem.vue";
import SelectTrigger from "../ui/selectTrigger.vue";
import SelectValue from "../ui/selectValue.vue";
import ImageWithFallback from "../figma/ImageWithFallBack.vue";
import { X, Upload, AlertCircle, ArrowLeft, Loader2 } from "lucide-vue-next";
import Badge from "../ui/badge.vue";
import { toast } from "vue-sonner";


// Simple similarity check - case insensitive includes
function getSimilarityScore(str1, str2) {
  const s1 = (str1 || "").toLowerCase();
  const s2 = (str2 || "").toLowerCase();

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const overlap = words1.filter((w) => words2.includes(w)).length;
  const maxWords = Math.max(words1.length, words2.length);

  return overlap / maxWords;
}

export default {
  name: "MarketPriceImportPage",
  components: {
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Badge,
    X,
    Upload,
    AlertCircle,
    ArrowLeft,
    Loader2,
    ImageWithFallback,
  },

  props: {
    csvHeaders: { type: Array, required: true },
    csvRows: { type: Array, required: true },
    suppliers: { type: Array, required: true },
    existingItemNames: { type: Array, required: true },
    existingMarketPrices: { type: Array, required: true },
    onConfirm: { type: Function, required: true },
    onCancel: { type: Function, required: true },
    savedMapping: { type: Object, required: false, default: undefined },
  },

  data() {
    return {
      step: 1, // 1 | 2
      columnMapping: {},
      selectedSupplierId: "__none__",
      supplierItemMappings: [],
      showCreateDialog: false,
      creatingIndex: null,
      newItemForm: {
        itemName: "",
        goodType: "Food", 
        image: undefined,
      },
      imagePreview: "",
      isImporting: false,
      importProgress: { current: 0, total: 0 },
      isCalculating: false,
    };
  },

  watch: {
    // Initialize column mapping with saved mapping or defaults
    csvHeaders: {
      handler() {
        this.initColumnMapping();
      },
      immediate: true,
    },
    savedMapping: {
      handler() {
        this.initColumnMapping();
      },
      deep: true,
      immediate: true,
    },
  },

  computed: {
    // Calculate import stats
    importStats() {
      const toMap = this.supplierItemMappings.filter(
        (m) => m.selectedOption !== "__create__" && m.selectedOption !== "__ignore__",
      ).length;

      const toCreate = this.supplierItemMappings.filter(
        (m) => m.selectedOption === "__create__" && m.newItemName,
      ).length;

      const toIgnore = this.supplierItemMappings.filter(
        (m) => m.selectedOption === "__ignore__",
      ).length;

      return { toMap, toCreate, toIgnore, total: toMap + toCreate };
    },
  },

  methods: {
    initColumnMapping() {
      if (this.savedMapping && Object.keys(this.savedMapping).length > 0) {
        this.columnMapping = this.savedMapping;
        return;
      }

      const autoMapping = {};
      (this.csvHeaders || []).forEach((header) => {
        const lowerHeader = String(header).toLowerCase().trim();

        if (lowerHeader.includes("supplier item") || lowerHeader === "supplier item") {
          autoMapping.supplierItem = header;
        } else if (lowerHeader.includes("supplier") && !lowerHeader.includes("item")) {
          autoMapping.supplier = header;
        } else if (lowerHeader.includes("good type") || lowerHeader.includes("type")) {
          autoMapping.goodType = header;
        } else if (lowerHeader.includes("unit") && !lowerHeader.includes("per")) {
          autoMapping.unit = header;
        } else if (lowerHeader.includes("units") && lowerHeader.includes("purchase")) {
          autoMapping.unitsPerPurchase = header;
        } else if (lowerHeader.includes("price") && !lowerHeader.includes("per")) {
          autoMapping.price = header;
        } else if (lowerHeader.includes("packed units")) {
          autoMapping.packedUnits = header;
        } else if (lowerHeader.includes("number of units")) {
          autoMapping.numberOfUnits = header;
        } else if (lowerHeader.includes("dimension")) {
          autoMapping.dimensions = header;
        }
      });

      this.columnMapping = autoMapping;
    },

    handleNext() {
      const requiredFields = [
        "supplierItem",
        "supplier",
        "goodType",
        "unit",
        "unitsPerPurchase",
        "price",
      ];
      const missingFields = requiredFields.filter((field) => !this.columnMapping[field]);

      if (missingFields.length > 0) {
        toast.error(
          `Please map the following required fields: ${missingFields.join(", ")}`,
        );
        return;
      }

      const mappings = [];
      let skippedCount = 0;
      let emptyRowCount = 0;

      (this.csvRows || []).forEach((row, index) => {
        try {
          const isEmptyRow = (row || []).every((cell) => !cell || String(cell).trim() === "");
          if (isEmptyRow) {
            emptyRowCount++;
            return;
          }

          const getCell = (field) => {
            const headerIndex = (this.csvHeaders || []).indexOf(this.columnMapping[field]);
            return headerIndex >= 0 ? String(row[headerIndex] || "").trim() : "";
          };

          const supplierItem = getCell("supplierItem");
          const supplier = getCell("supplier");
          const goodType = getCell("goodType");
          const unit = getCell("unit");
          const unitsPerPurchaseStr = getCell("unitsPerPurchase");
          const priceStr = getCell("price");
          const packedUnitsStr = getCell("packedUnits");
          const numberOfUnitsStr = getCell("numberOfUnits");
          const dimensionsStr = getCell("dimensions");

          if (!supplierItem || !supplier || !goodType || !unit) {
            skippedCount++;
            if (skippedCount <= 5) {
              console.warn(
                `Row ${index + 2}: Missing fields - supplierItem: "${supplierItem}", supplier: "${supplier}", goodType: "${goodType}", unit: "${unit}"`,
              );
            }
            return;
          }

          const unitsPerPurchase = parseFloat(unitsPerPurchaseStr);
          const price = parseFloat(priceStr);

          if (isNaN(unitsPerPurchase) || unitsPerPurchase <= 0 || isNaN(price) || price < 0) {
            skippedCount++;
            if (skippedCount <= 5) {
              console.warn(
                `Row ${index + 2}: Invalid numeric values - unitsPerPurchase: "${unitsPerPurchaseStr}", price: "${priceStr}"`,
              );
            }
            return;
          }

          if (!["Food", "Beverage", "Packaging"].includes(goodType)) {
            skippedCount++;
            if (skippedCount <= 5) {
              console.warn(`Row ${index + 2}: Invalid good type "${goodType}"`);
            }
            return;
          }

          let packedUnits;
          let numberOfUnits;

          if (packedUnitsStr) {
            const parsed = parseFloat(packedUnitsStr);
            if (!isNaN(parsed)) packedUnits = parsed;
          }

          if (numberOfUnitsStr) {
            const parsed = parseInt(numberOfUnitsStr, 10);
            if (!isNaN(parsed)) numberOfUnits = parsed;
          }

          let packingLength;
          let packingWidth;
          let packingHeight;

          if (dimensionsStr) {
            const parts = dimensionsStr.split("/");
            if (parts.length === 3) {
              packingLength = parseFloat(parts[0]);
              packingWidth = parseFloat(parts[1]);
              packingHeight = parseFloat(parts[2]);

              if (isNaN(packingLength) || isNaN(packingWidth) || isNaN(packingHeight)) {
                packingLength = undefined;
                packingWidth = undefined;
                packingHeight = undefined;
              }
            }
          }

          const supplierId =
            this.selectedSupplierId && this.selectedSupplierId !== "__none__"
              ? this.selectedSupplierId
              : (this.suppliers.find((s) => s.name === supplier)?.id || "");

          let suggestedOption = "__create__";
          let maxScore = 0;

          (this.existingItemNames || []).forEach((item) => {
            const score = getSimilarityScore(supplierItem, item.itemName);
            if (score > maxScore && score > 0.6) {
              maxScore = score;
              suggestedOption = item.itemName;
            }
          });

          mappings.push({
            supplierItem,
            supplier,
            goodType,
            unit,
            unitsPerPurchase,
            price,
            pricePerUnit: price / unitsPerPurchase,
            packedUnits,
            numberOfUnits,
            packingLength,
            packingWidth,
            packingHeight,
            selectedOption: suggestedOption,
            supplierId,
          });
        } catch (err) {
          console.error(`Error parsing row ${index + 2}:`, err);
        }
      });

      const uniqueMappings = [];
      const seen = new Set();

      mappings.forEach((mapping) => {
        const key = mapping.supplierItem.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueMappings.push(mapping);
        }
      });

      const totalRows = (this.csvRows || []).length;
      const validRows = uniqueMappings.length;

      console.log(
        `CSV Import Summary: ${totalRows} total rows, ${emptyRowCount} empty rows, ${skippedCount} rows with errors, ${validRows} valid items found`,
      );

      if (validRows === 0) {
        toast.error(
          "No valid items found in CSV. Please check your column mapping and ensure the required fields are filled.",
        );
        return;
      }

      if (skippedCount > 0) {
        toast.warning(
          `Found ${validRows} valid items. Skipped ${skippedCount} rows with missing or invalid data, and ${emptyRowCount} empty rows.`,
        );
      } else if (emptyRowCount > 0) {
        toast.success(`Found ${validRows} valid items. Skipped ${emptyRowCount} empty rows.`);
      } else {
        toast.success(`Found ${validRows} valid items.`);
      }

      this.supplierItemMappings = uniqueMappings;
      this.step = 2;
    },

    handleOptionChange(index, option) {
      const updated = [...this.supplierItemMappings];
      updated[index].selectedOption = option;

      if (option === "__create__") {
        this.creatingIndex = index;
        this.newItemForm = {
          itemName: updated[index].supplierItem,
          goodType: updated[index].goodType,
          image: undefined,
        };
        this.imagePreview = "";
        this.showCreateDialog = true;
      } else if (option !== "__ignore__") {
        const existingItem = (this.existingItemNames || []).find((item) => item.itemName === option);
        if (existingItem && updated[index].goodType !== existingItem.goodType) {
          toast.error(
            `Warning: Good Type mismatch. "${option}" is ${existingItem.goodType}, but your CSV has ${updated[index].goodType}`,
          );
        }
      }

      this.supplierItemMappings = updated;
    },

    handleImageUpload(e) {
      const file = e?.target?.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          this.imagePreview = result;
          this.newItemForm = { ...this.newItemForm, image: result };
        };
        reader.readAsDataURL(file);
      }
    },

    handleRemoveImage() {
      this.imagePreview = "";
      this.newItemForm = { ...this.newItemForm, image: undefined };
    },

    handleCreateConfirm() {
      if (!String(this.newItemForm.itemName || "").trim()) {
        toast.error("Please enter an item name");
        return;
      }

      if (this.creatingIndex !== null) {
        const updated = [...this.supplierItemMappings];
        updated[this.creatingIndex].newItemName = String(this.newItemForm.itemName).trim();
        updated[this.creatingIndex].newItemImage = this.newItemForm.image;
        updated[this.creatingIndex].newItemGoodType = this.newItemForm.goodType;
        this.supplierItemMappings = updated;
      }

      this.showCreateDialog = false;
      this.creatingIndex = null;
      this.newItemForm = { itemName: "", goodType: "Food", image: undefined };
      this.imagePreview = "";
    },

    async handleImport() {
      const invalidMappings = this.supplierItemMappings.filter((mapping) => {
        if (mapping.selectedOption === "__ignore__") return false;
        if (mapping.selectedOption === "__create__" && !mapping.newItemName) return true;
        return false;
      });

      if (invalidMappings.length > 0) {
        toast.error('Please complete all mappings or set them to "Ignore"');
        return;
      }

      const newItems = [];
      const errors = [];
      const itemsToProcess = this.supplierItemMappings.filter((m) => m.selectedOption !== "__ignore__");

      this.isImporting = true;
      this.importProgress = { current: 0, total: itemsToProcess.length };

      await new Promise((resolve) => setTimeout(resolve, 100));

      const batchSize = 10;
      for (let batchStart = 0; batchStart < this.supplierItemMappings.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, this.supplierItemMappings.length);

        for (let i = batchStart; i < batchEnd; i++) {
          const mapping = this.supplierItemMappings[i];
          if (mapping.selectedOption === "__ignore__") continue;

          const isCreate = mapping.selectedOption === "__create__";
          const itemName = isCreate ? mapping.newItemName : mapping.selectedOption;

          const goodType = isCreate
            ? mapping.newItemGoodType
            : ((this.existingItemNames.find((item) => item.itemName === itemName)?.goodType) ||
              mapping.goodType);

          const image = isCreate
            ? mapping.newItemImage
            : (this.existingItemNames.find((item) => item.itemName === itemName)?.image);

          const existingWithDifferentName = (this.existingMarketPrices || []).find(
            (item) => item.supplierItem === mapping.supplierItem && item.itemName !== itemName,
          );

          if (existingWithDifferentName) {
            errors.push(
              `Supplier Item "${mapping.supplierItem}" already exists under Item Name "${existingWithDifferentName.itemName}"`,
            );
            continue;
          }

          const duplicate = newItems.find(
            (item) =>
              item.supplierItem === mapping.supplierItem &&
              item.supplier_id === mapping.supplierId &&
              item.unit === mapping.unit &&
              item.unitsPerPurchase === mapping.unitsPerPurchase &&
              item.price === mapping.price,
          );

          if (duplicate) {
            console.log(`Skipping duplicate: ${mapping.supplierItem}`);
            continue;
          }

          newItems.push({
            id: `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            supplier_id: mapping.supplierId,
            itemName,
            supplierItem: mapping.supplierItem,
            goodType,
            unit: mapping.unit,
            unitsPerPurchase: mapping.unitsPerPurchase,
            price: mapping.price,
            pricePerUnit: mapping.price / mapping.unitsPerPurchase,
            image,
            timestamp: new Date().toISOString(),
            packedUnits: mapping.packedUnits,
            numberOfUnits: mapping.numberOfUnits,
            packingLength: mapping.packingLength,
            packingWidth: mapping.packingWidth,
            packingHeight: mapping.packingHeight,
          });
        }

        this.importProgress = { current: newItems.length, total: itemsToProcess.length };

        if (batchEnd < this.supplierItemMappings.length) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      this.isImporting = false;

      if (errors.length > 0) {
        // Note: en Vue on évite JSX dans toast; ici version texte simple
        toast.error(`Import failed:\n${errors.join("\n")}`, { duration: 10000 });
        return;
      }

      this.isCalculating = true;
      await new Promise((resolve) => setTimeout(resolve, 300));

      this.onConfirm(newItems);
    },

    handleBack() {
      this.step = 1;
      this.supplierItemMappings = [];
    },
  },
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="border-b bg-white p-4">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="sm" :onClick="onCancel">
            <ArrowLeft class="w-4 h-4 mr-2" />
            Cancel Import
          </Button>

          <div class="h-6 w-px bg-gray-300" />

          <h2 class="text-lg font-semibold">
            Import Market Prices - Step {{ step }} of 2
          </h2>
        </div>

        <div v-if="step === 2" class="flex items-center gap-4 text-sm">
          <span class="text-gray-600">
            Map: <strong>{{ importStats.toMap }}</strong>
          </span>
          <span class="text-gray-600">
            Create: <strong>{{ importStats.toCreate }}</strong>
          </span>
          <span class="text-gray-600">
            Ignore: <strong>{{ importStats.toIgnore }}</strong>
          </span>
          <span class="text-gray-600">
            Total to import:
            <strong class="text-blue-600">{{ importStats.total }}</strong>
          </span>
        </div>
      </div>

      <p class="text-sm text-gray-600">
        {{ step === 1 ? "Map CSV columns to fields" : "Map Supplier Items to Item Names" }}
      </p>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden">
      <div v-if="step === 1" class="h-full flex flex-col bg-gray-50">
        <ScrollArea class="flex-1">
          <div class="p-6">
            <div class="max-w-4xl mx-auto w-full space-y-6">
              <!-- Supplier selector -->
              <div class="bg-white p-4 rounded-lg border">
                <Label>Default Supplier (Optional)</Label>
                <Select v-model="selectedSupplierId">
                  <SelectTrigger class="mt-2">
                    <SelectValue placeholder="Select supplier or use CSV data" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Use supplier from CSV</SelectItem>
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

              <!-- Note about required fields -->
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <div class="flex items-start gap-2">
                  <AlertCircle class="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    Fields marked with
                    <span class="text-red-500 font-semibold">*</span>
                    are required for import.
                  </div>
                </div>
              </div>

              <!-- Column mapping -->
              <div class="bg-white rounded-lg border">
                <ScrollArea class="h-[400px]">
                  <div class="p-4 space-y-4">
                    <div
                      v-for="field in [
                        { key: 'supplierItem', label: 'Supplier Item', required: true },
                        { key: 'supplier', label: 'Supplier', required: true },
                        { key: 'goodType', label: 'Good Type', required: true },
                        { key: 'unit', label: 'Unit', required: true },
                        { key: 'unitsPerPurchase', label: 'Units Per Purchase', required: true },
                        { key: 'price', label: 'Price', required: true },
                        { key: 'packedUnits', label: 'Packed Units', required: false },
                        { key: 'numberOfUnits', label: 'Number of Units', required: false },
                        { key: 'dimensions', label: 'Dimensions (L/W/H)', required: false },
                      ]"
                      :key="field.key"
                      class="grid grid-cols-2 gap-4 items-center"
                    >
                      <Label class="flex items-center gap-1">
                        {{ field.label }}
                        <span v-if="field.required" class="text-red-500">*</span>
                      </Label>

                      <Select
                        :modelValue="columnMapping[field.key] || ''"
                        @update:modelValue="
                          (value) => (columnMapping = { ...columnMapping, [field.key]: value })
                        "
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select column..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">-- None --</SelectItem>
                          <SelectItem
                            v-for="header in csvHeaders"
                            :key="header"
                            :value="header"
                          >
                            {{ header }}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      <div v-else class="h-full flex flex-col bg-gray-50">
        <div class="p-4 bg-blue-50 border-b border-blue-200">
          <div class="flex items-start gap-2 text-sm text-blue-800">
            <AlertCircle class="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              For each Supplier Item, select an existing Item Name to map to, choose
              <strong>Create New...</strong>
              to create a new item, or select
              <strong>Ignore</strong>
              to skip it.
            </div>
          </div>
        </div>

        <ScrollArea class="flex-1">
          <div class="p-6 max-h-[calc(100vh-300px)] overflow-y-auto">
            <div class="max-w-6xl mx-auto space-y-3">
              <div
                v-for="(mapping, index) in supplierItemMappings"
                :key="index"
                class="bg-white rounded-lg border p-4"
              >
                <div class="flex items-start gap-4">
                  <!-- Supplier Item Info -->
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm mb-1">
                      {{ mapping.supplierItem }}
                    </div>
                    <div class="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      <span>{{ mapping.supplier }}</span>
                      <span>•</span>
                      <Badge variant="outline" class="text-xs">
                        {{ mapping.goodType }}
                      </Badge>
                      <span>•</span>
                      <span>{{ mapping.unit }}</span>
                      <span>•</span>
                      <span>€{{ mapping.price.toFixed(2) }}</span>
                    </div>
                  </div>

                  <!-- Mapping Selector -->
                  <div class="w-80 flex-shrink-0">
                    <Select
                      :modelValue="mapping.selectedOption"
                      @update:modelValue="(value) => handleOptionChange(index, value)"
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__create__">
                          <span class="text-blue-600 font-medium">+ Create New...</span>
                        </SelectItem>
                        <SelectItem value="__ignore__">
                          <span class="text-gray-500">Ignore</span>
                        </SelectItem>

                        <template v-if="existingItemNames.length > 0">
                          <div class="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50">
                            Map to existing:
                          </div>
                          <SelectItem
                            v-for="item in existingItemNames"
                            :key="item.itemName"
                            :value="item.itemName"
                          >
                            <div class="flex items-center gap-2">
                              <span>{{ item.itemName }}</span>
                              <span class="text-xs text-gray-500">({{ item.goodType }})</span>
                            </div>
                          </SelectItem>
                        </template>
                      </SelectContent>
                    </Select>

                    <!-- Show created item preview -->
                    <div
                      v-if="mapping.selectedOption === '__create__' && mapping.newItemName"
                      class="mt-2 flex items-center gap-2 text-sm text-green-600"
                    >
                      <ImageWithFallback
                        v-if="mapping.newItemImage"
                        :src="mapping.newItemImage"
                        :alt="mapping.newItemName"
                        class="w-6 h-6 object-cover rounded"
                      />
                      <span>Will create: {{ mapping.newItemName }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>

    <!-- Footer -->
    <div class="border-t bg-white p-4">
      <div v-if="isImporting" class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-gray-600">
            Importing items... {{ importProgress.current }} / {{ importProgress.total }}
          </span>
          <span class="text-sm text-gray-600">
            {{ Math.round((importProgress.current / importProgress.total) * 100) }}%
          </span>
        </div>

        <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            class="bg-blue-600 h-2 transition-all duration-300 ease-out"
            :style="{ width: `${(importProgress.current / importProgress.total) * 100}%` }"
          />
        </div>
      </div>

      <div class="flex justify-end gap-3">
        <Button v-if="step === 1" size="lg" @click="handleNext">
          Next: Map Items
        </Button>

        <template v-else>
          <Button variant="outline" :disabled="isImporting" @click="handleBack">
            Back
          </Button>

          <Button
            size="lg"
            :disabled="importStats.total === 0 || isImporting"
            @click="handleImport"
          >
            {{
              isImporting
                ? "Importing..."
                : `Import ${importStats.total} Item${importStats.total !== 1 ? "s" : ""}`
            }}
          </Button>
        </template>
      </div>
    </div>

    <!-- Create New Item Dialog (unchanged from original) -->
    <div
      v-if="showCreateDialog"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div class="p-6 border-b">
          <h3 class="text-lg font-semibold">Create New Item Name</h3>
          <p class="text-sm text-gray-600 mt-1">
            Add a new item name with image and good type
          </p>
        </div>

        <div class="p-6 space-y-4">
          <!-- Image upload -->
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
              placeholder="Enter item name"
              class="mt-1"
              :value="newItemForm.itemName"
              @input="newItemForm = { ...newItemForm, itemName: $event?.target?.value }"
            />
          </div>

          <!-- Good Type -->
          <div>
            <Label>Good Type *</Label>
            <Select
              :modelValue="newItemForm.goodType"
              @update:modelValue="(value) => (newItemForm = { ...newItemForm, goodType: value })"
            >
              <SelectTrigger class="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Food">Food</SelectItem>
                <SelectItem value="Beverage">Beverage</SelectItem>
                <SelectItem value="Packaging">Packaging</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="p-6 border-t flex justify-end gap-3">
          <Button variant="outline" @click="showCreateDialog = false">
            Cancel
          </Button>
          <Button @click="handleCreateConfirm">
            Create
          </Button>
        </div>
      </div>
    </div>

    <!-- Calculating Overlay -->
    <div
      v-if="isCalculating"
      class="fixed inset-0 bg-black/60 flex flex-col items-center justify-center z-50"
    >
      <div class="bg-white rounded-lg shadow-2xl p-8 flex flex-col items-center gap-4">
        <Loader2 class="w-12 h-12 text-blue-600 animate-spin" />
        <div class="text-center">
          <div class="font-semibold text-lg mb-1">Processing Import...</div>
          <div class="text-sm text-gray-600">Updating Market Price List</div>
        </div>
      </div>
    </div>
  </div>
</template>