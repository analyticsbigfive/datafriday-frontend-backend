<script>
import Button from "../ui/button.vue";
import Input from "../ui/input.vue";
import Label from "../ui/label.vue";
//import Textarea from "../ui/textarea.vue";
import Select from "../ui/select.vue";
import SelectContent from "../ui/selectContent.vue";
import SelectItem from "../ui/selectItem.vue";
import SelectTrigger from "../ui/selectTrigger.vue";
import SelectValue from "../ui/selectValue.vue";
import Table from "../ui/table.vue";
import TableBody from "../ui/tableBody.vue";
import TableCell from "../ui/tableCell.vue";
import TableHead from "../ui/tableHead.vue";
import TableHeader from "../ui/tableHeader.vue";
import TableRow from "../ui/tableRow.vue";
import Badge from "../ui/badge.vue";
import Card from "../ui/card.vue";
import CardContent from "../ui/cardContent.vue";
import CardHeader from "../ui/cardHeader.vue";
import CardTitle from "../ui/cardTitle.vue";
import Separator from "../ui/separator.vue";
import Checkbox from "../ui/checkbox.vue";
import Dialog from "../ui/dialog.vue";
import DialogContent from "../ui/dialogContent.vue";
import DialogDescription from "../ui/dialogDescription.vue";
import DialogHeader from "../ui/dialogHeader.vue";
import DialogTitle from "../ui/dialogTitle.vue";
import DialogFooter from "../ui/dialogFooter.vue";

 
import { Plus, Trash2, Save, X, Edit, Upload, ImageIcon } from "lucide-vue-next";
 
import { toast } from "vue-sonner";
 
import ComponentSelectorDialog from "./ComponentSelectorDialog.vue";
import ComboItemSelectorDialog from "./ComboItemSelectorDialog.vue";
import PackagingSelectorDialog from "./PackagingSelectorDialog.vue";
import MarketPriceSelector from "./MarketPriceSelector.vue";
import ImageWithFallback from "../figma/ImageWithFallBack.vue";
import NumberField from "@/components/common/NumberField.vue";
import SpaceSelectionDialog from "./SpaceSelectionDialog.vue";
import SpaceSpecificPricing from "./SpaceSpecificPricing.vue";
import TypeCategorySelector from "./TypeCategorySelector.vue";

import useMobile from "../ui/useMobile";
 
export default {
  name: "MenuItemBuilderPanel",
  mixins: [useMobile],
  components: {
    Button,
    Input,
    Label,
    //Textarea,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Badge,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Separator,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Plus,
    Trash2,
    Save,
    X,
    Edit,
    Upload,
    ImageIcon,
    ComponentSelectorDialog,
    ComboItemSelectorDialog,
    PackagingSelectorDialog,
    MarketPriceSelector,
    ImageWithFallback,
    NumberField,
    SpaceSelectionDialog,
    SpaceSpecificPricing,
    TypeCategorySelector,
  },
 
  props: {
    menuItem: { type: Object, default: null },
    components: { type: Array, required: true },
    ingredients: { type: Array, required: true }, // legacy
    marketPrices: { type: Array, required: true },
    menuItems: { type: Array, required: true },
    spaces: { type: Array, required: true },
    onSave: { type: Function, required: true }, // (menuItem) => void
    onCancel: { type: Function, required: true }, // () => void
  },
 
  data() {
    const menuItem = this.menuItem;
 
    return {
      isMobile: false,
 
      // Basic fields
      name: (menuItem && menuItem.name) || "",
      type: (menuItem && menuItem.type) || "Food", // 'Food' | 'Beverage' | 'Combo'
      category: (menuItem && menuItem.category) || "Main",
      typeId: menuItem ? menuItem.typeId : undefined,
      categoryId: menuItem ? menuItem.categoryId : undefined,
      readyForSale: (menuItem && menuItem.readyForSale) || "No",
      comboItem: (menuItem && menuItem.comboItem) || "No",
      numberOfPiecesRecipe: (menuItem && menuItem.numberOfPiecesRecipe) || 1.0,
      basePrice: (menuItem && menuItem.basePrice) || 0.0,
      description: (menuItem && menuItem.description) || "",
      picture: (menuItem && menuItem.picture) || "",
 
      selectedSpaceIds: (menuItem && menuItem.spaceIds) || [],
      spaceSpecificPrices: (menuItem && menuItem.spaceSpecificPrices) || [],
 
      // Multi-select fields
      storageType: (menuItem && menuItem.storageType) || [], // ['Dry'|'Cold'|'Freezer'][]
      diet: (menuItem && menuItem.diet) || [], // ['Vegan'|'Vegetarian'|'Halal'|'Kosher'|'Hot'][]
 
      // Components table
      menuComponents: (menuItem && menuItem.components) || [],
 
      // Dialogs
      showComponentSelector: false,
      showIngredientSelector: false,
      showComboItemSelector: false,
      showPackagingSelector: false,
      showEditDetailsDialog: false,
      showSpaceSelector: false,
    };
  },
 
  mounted() {
    // équivalent simple à useIsMobile()
    this.isMobile = window.matchMedia("(max-width: 768px)").matches;
  },
 
  computed: {
    totalCost() {
      const total = (this.menuComponents || []).reduce(
        (sum, comp) => sum + (comp.totalCost || 0),
        0,
      );
      return total / (this.numberOfPiecesRecipe || 1);
    },
 
    margin() {
      const cost = this.totalCost;
      if (cost === 0) return 0;
      return this.basePrice > 0 ? ((this.basePrice - cost) / this.basePrice) * 100 : 0;
    },
  },
 
  methods: {
    // Helper function to get current storage type from library
    getCurrentStorageType(comp) {
      if (comp.itemType === "Ingredient") {
        const ingredient = (this.ingredients || []).find((i) => i.id === comp.sourceId);
        return (ingredient && ingredient.storageType) || comp.storageType || "N/A";
      } else if (comp.itemType === "Component") {
        const component = (this.components || []).find((c) => c.id === comp.sourceId);
        return (component && component.storageType) || comp.storageType || "N/A";
      }
      return comp.storageType || "N/A";
    },
 
    // Add component from selector
    handleAddComponent(component) {
      const newComponent = {
        id: `comp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        name: component.name,
        itemType: "Component",
        category: component.componentCategory,
        unit: component.unit,
        numberOfUnits: 1,
        unitCost: component.unitCost,
        totalCost: (component.unitCost || 0) * 1,
        storageType: component.storageType,
        sourceId: component.id,
      };
 
      this.menuComponents = [...this.menuComponents, newComponent];
      this.showComponentSelector = false;
    },
 
    // Add ingredient from selector - Market Price Selector
    handleAddIngredients(selectedItems) {
      const newComponents = [];
 
      selectedItems.forEach((item) => {
        let storageType = "Dry";
        if (item.category) {
          const coldCategories = ["Fish", "Meat", "Cheese", "Dairy"];
          const freezerCategories = ["Ice Cream", "Frozen"];
          if (coldCategories.includes(item.category)) storageType = "Cold";
          else if (freezerCategories.includes(item.category)) storageType = "Freezer";
        }
 
        newComponents.push({
          id: `ing-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          name: item.itemName,
          itemType: "Ingredient",
          category: item.category || "Other",
          unit: item.recipeUnit || item.unit,
          numberOfUnits: 1,
          unitCost: item.costPerRecipeUnit,
          totalCost: item.costPerRecipeUnit,
          storageType: storageType,
          supplier: item.supplierName,
          sourceId: item.marketPriceId,
          marketPriceId: item.marketPriceId,
          marketPriceItemName: item.itemName,
        });
      });
 
      this.menuComponents = [...this.menuComponents, ...newComponents];
      this.showIngredientSelector = false;
 
      if (newComponents.length === 1) {
        toast.success(`Added ${newComponents[0].name}`);
      } else {
        toast.success(`Added ${newComponents.length} ingredients`);
      }
    },
 
    // Add combo item (menu item) from selector
    handleAddComboItem(comboItem) {
      const newComponent = {
        id: `combo-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        name: comboItem.name,
        itemType: "Combo Item",
        category: comboItem.category,
        unit: "piece",
        numberOfUnits: 1,
        unitCost: comboItem.totalCost, // cost per piece
        totalCost: (comboItem.totalCost || 0) * 1,
        storageType: (comboItem.storageType && comboItem.storageType.join(", ")) || "N/A",
        sourceId: comboItem.id,
      };
 
      this.menuComponents = [...this.menuComponents, newComponent];
      this.showComboItemSelector = false;
      toast.success(`Added ${comboItem.name} to menu item`);
    },
 
    // Add packaging items from selector
    handleAddPackaging(packagingItems, suppliers) {
      const newComponents = (packagingItems || []).map((packaging) => ({
        id: `pkg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        name: packaging.name,
        itemType: "Packaging",
        category: packaging.ingredientCategory,
        unit: packaging.recipeUnit,
        numberOfUnits: 1,
        unitCost: packaging.costPerRecipeUnit,
        totalCost: (packaging.costPerRecipeUnit || 0) * 1,
        storageType: packaging.storageType,
        supplier: (suppliers && suppliers.get && suppliers.get(packaging.id)) || packaging.supplier || undefined,
        sourceId: packaging.id,
      }));
 
      this.menuComponents = [...this.menuComponents, ...newComponents];
      this.showPackagingSelector = false;
 
      toast.success(
        `Added ${packagingItems.length} packaging item${packagingItems.length !== 1 ? "s" : ""} to menu item`,
      );
    },
 
    // Update component quantity
    handleUpdateQuantity(id, newQuantity) {
      this.menuComponents = (this.menuComponents || []).map((comp) =>
        comp.id === id
          ? {
              ...comp,
              numberOfUnits: newQuantity,
              totalCost: (comp.unitCost || 0) * newQuantity,
            }
          : comp,
      );
    },
 
    // Remove component
    handleRemoveComponent(id) {
      this.menuComponents = (this.menuComponents || []).filter((comp) => comp.id !== id);
    },
 
    // Toggle storage type
    toggleStorageType(type) {
      if ((this.storageType || []).includes(type)) {
        this.storageType = this.storageType.filter((t) => t !== type);
      } else {
        this.storageType = [...this.storageType, type];
      }
    },
 
    // Toggle diet
    toggleDiet(dietType) {
      if ((this.diet || []).includes(dietType)) {
        this.diet = this.diet.filter((d) => d !== dietType);
      } else {
        this.diet = [...this.diet, dietType];
      }
    },
 
    // Handle picture upload
    handlePictureUpload(e) {
      const file = e?.target?.files?.[0];
      if (!file) return;
 
      const reader = new FileReader();
      reader.onloadend = () => {
        this.picture = reader.result;
      };
      reader.readAsDataURL(file);
    },
 
    // Helper function to calculate space pricing data
    calculateSpacePricingData() {
      try {
        if (!this.selectedSpaceIds || this.selectedSpaceIds.length === 0) return [];
 
        const spacePricingData = [];
 
        this.selectedSpaceIds.forEach((spaceId) => {
          const specificPrice = (this.spaceSpecificPrices || []).find((ssp) =>
            (ssp.spaceIds || []).includes(spaceId),
          );
 
          const spacePrice = specificPrice ? specificPrice.price : this.basePrice;
          const spaceMargin = spacePrice > 0 ? ((spacePrice - this.totalCost) / spacePrice) * 100 : 0;
 
          spacePricingData.push({
            spaceId,
            price: Number(spacePrice) || 0,
            margin: Number(spaceMargin) || 0,
          });
        });
 
        return spacePricingData;
      } catch (error) {
        console.error("Error calculating space pricing data:", error);
        return [];
      }
    },
 
    // Helper function to calculate average price and margin
    calculateAverages(spacePricingData) {
      try {
        if (!spacePricingData || spacePricingData.length === 0) {
          return {
            averagePrice: this.basePrice,
            averageMargin: this.margin,
          };
        }
 
        const totalPrice = spacePricingData.reduce((sum, spaceData) => sum + (spaceData.price || 0), 0);
        const averagePrice = totalPrice / spacePricingData.length;
        const averageMargin = averagePrice > 0 ? ((averagePrice - this.totalCost) / averagePrice) * 100 : 0;
 
        return {
          averagePrice: Number(averagePrice) || 0,
          averageMargin: Number(averageMargin) || 0,
        };
      } catch (error) {
        console.error("Error calculating averages:", error);
        return {
          averagePrice: this.basePrice,
          averageMargin: this.margin,
        };
      }
    },
 
    // Save menu item
    handleSave() {
      // Validation
      if (!String(this.name || "").trim()) {
        toast.error("Menu item name is required");
        return;
      }
 
      if (this.numberOfPiecesRecipe <= 0) {
        toast.error("Number of pieces must be greater than 0");
        return;
      }
 
      if (this.basePrice < 0) {
        toast.error("Base price must be a valid number");
        return;
      }
 
      if (!this.menuComponents || this.menuComponents.length === 0) {
        toast.error("Please add at least one ingredient or component");
        return;
      }
 
      // Calculate space-specific pricing data
      console.log("[MENU ITEM SAVE] Calculating pricing data...");
      console.log("[MENU ITEM SAVE] Selected spaces:", this.selectedSpaceIds);
      console.log("[MENU ITEM SAVE] Space specific prices:", this.spaceSpecificPrices);
      console.log("[MENU ITEM SAVE] Base price:", this.basePrice);
      console.log("[MENU ITEM SAVE] Total cost:", this.totalCost);
 
      const spacePricingData = this.calculateSpacePricingData();
      console.log("[MENU ITEM SAVE] Space pricing data:", spacePricingData);
 
      const { averagePrice, averageMargin } = this.calculateAverages(spacePricingData);
      console.log("[MENU ITEM SAVE] Average price:", averagePrice);
      console.log("[MENU ITEM SAVE] Average margin:", averageMargin);
 
      const newMenuItem = {
        id: (this.menuItem && this.menuItem.id) || Date.now().toString(),
        name: String(this.name || "").trim(),
        type: this.type,
        category: this.category,
        readyForSale: this.readyForSale,
        comboItem: this.comboItem,
        numberOfPiecesRecipe: this.numberOfPiecesRecipe,
        storageType: this.storageType,
        basePrice: this.basePrice,
        totalCost: this.totalCost,
        margin: this.margin, // backward compatibility
        averagePrice,
        averageMargin,
        diet: this.diet,
        allergens: (this.menuItem && this.menuItem.allergens) || [],
        components: this.menuComponents,
        description: String(this.description || "").trim(),
        picture: this.picture || undefined,
        spaceIds: this.selectedSpaceIds,
        spaceSpecificPrices: this.spaceSpecificPrices,
        spacePricingData,
        typeId: this.typeId,
        categoryId: this.categoryId,
      };
 
      console.log("[MENU ITEM SAVE] Final menu item:", newMenuItem);
      this.onSave(newMenuItem);
    },
  },
};
</script>

<template>
  <div className="h-full flex flex-col bg-gray-50">
    <!-- Header -->
    <template v-if="isMobile">
      <!-- Sticky Header -->
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b dark:border-gray-800">
        <div className="p-4 space-y-3">
          <h1 className="text-xl">
            {{ menuItem ? `Edit ${menuItem.name}` : 'Create New Menu Item' }}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Build a menu item from components and ingredients
          </p>
          <div className="flex gap-2">
            <Button variant="outline" :onClick="onCancel" className="flex-1">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button :onClick="handleSave" className="flex-1">
              <Save className="w-4 h-4 mr-2" />
              {{ menuItem ? 'Update' : 'Create' }} Menu Item
            </Button>
          </div>
        </div>
      </div>

      <!-- Scrollable Content -->
      <div>
        <Card className="rounded-none border-x-0 border-t-0 border-b-0">
          <CardHeader className="space-y-2 pb-4">
            <Button
              variant="outline"
              className="w-full"
              @click="showEditDetailsDialog = true"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Menu Item Details
            </Button>

            <!-- Summary Info - Always Visible -->
            <div className="grid grid-cols-3 gap-2 pt-2 border-t dark:border-gray-700">
              <div
                className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center"
              >
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Pieces</div>
                <div className="text-sm dark:text-gray-100">
                  {{ Number(numberOfPiecesRecipe).toFixed(3) }}
                </div>
              </div>

              <div
                className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-3 text-center"
              >
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Cost</div>
                <div className="text-sm dark:text-gray-100">
                  €{{ menuComponents.reduce((sum, comp) => sum + comp.totalCost, 0).toFixed(2) }}
                </div>
              </div>

              <div
                className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center"
              >
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Per Piece</div>
                <div className="text-sm dark:text-gray-100">
                  €{{ Number(totalCost).toFixed(2) }}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>
    </template>

    <header
      v-else
      className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-6 py-4 flex items-center justify-between"
    >
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-xl">
            {{ menuItem ? `Edit ${menuItem.name}` : 'Create New Menu Item' }}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Build a menu item from components and ingredients
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" :onClick="onCancel">
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
        <Button :onClick="handleSave">
          <Save className="w-4 h-4 mr-2" />
          {{ menuItem ? 'Update' : 'Create' }} Menu Item
        </Button>
      </div>
    </header>

    <!-- Main Content -->
    <div className="flex-1 flex overflow-hidden">
      <!-- Center - Components Table -->
      <div
        :class="`flex-1 flex flex-col ${isMobile ? '' : 'p-6'} overflow-y-auto bg-white dark:bg-gray-950`"
      >
        <Card :class="`flex-1 flex flex-col ${isMobile ? 'rounded-none border-x-0 border-b-0' : ''}`">
          <CardHeader v-if="!isMobile">
            <div className="flex items-center justify-between">
              <CardTitle>Components & Ingredients</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  @click="showIngredientSelector = true"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Ingredient
                </Button>
                <Button size="sm" @click="showComponentSelector = true">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Component
                </Button>
                <Button size="sm" @click="showComboItemSelector = true">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Combo Item
                </Button>
                <Button size="sm" @click="showPackagingSelector = true">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Packaging
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent :class="`flex flex-col flex-1 ${isMobile ? 'p-0' : ''}`">
            <!-- Mobile: Add buttons at top -->
            <div
              v-if="isMobile"
              className="sticky top-0 z-20 p-4 bg-white dark:bg-gray-900 border-b dark:border-gray-800 shadow-sm"
            >
              <!-- First Row -->
              <div className="flex gap-2 mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  @click="showIngredientSelector = true"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ingredient
                </Button>
                <Button size="sm" className="flex-1" @click="showComponentSelector = true">
                  <Plus className="w-4 h-4 mr-2" />
                  Component
                </Button>
              </div>

              <!-- Second Row -->
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" @click="showComboItemSelector = true">
                  <Plus className="w-4 h-4 mr-2" />
                  Combo Item
                </Button>
                <Button size="sm" className="flex-1" @click="showPackagingSelector = true">
                  <Plus className="w-4 h-4 mr-2" />
                  Packaging
                </Button>
              </div>
            </div>

            <!-- Table with sticky header and scrollable body -->
            <div
              :class="`flex-1 overflow-auto ${isMobile ? '' : 'border rounded-lg'} ${isMobile ? 'border-x-0 rounded-none' : ''}`"
            >
              <Table>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="bg-white dark:bg-gray-900">Name</TableHead>
                    <TableHead className="bg-white dark:bg-gray-900">Type</TableHead>
                    <TableHead className="bg-white dark:bg-gray-900">Category</TableHead>
                    <TableHead className="bg-white dark:bg-gray-900">Unit</TableHead>
                    <TableHead className="text-right bg-white dark:bg-gray-900">Quantity</TableHead>
                    <TableHead className="text-right bg-white dark:bg-gray-900">Unit Cost</TableHead>
                    <TableHead className="text-right bg-white dark:bg-gray-900">Total Cost</TableHead>
                    <TableHead className="bg-white dark:bg-gray-900">Storage</TableHead>
                    <TableHead className="text-right bg-white dark:bg-gray-900">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  <TableRow v-if="menuComponents.length === 0">
                    <TableCell
                      :colSpan="9"
                      className="text-center text-gray-500 dark:text-gray-400 py-8"
                    >
                      No components or ingredients added yet. Click "Add Component" or "Add
                      Ingredient" to get started.
                    </TableCell>
                  </TableRow>

                  <TableRow v-else v-for="comp in menuComponents" :key="comp.id">
                    <TableCell>{{ comp.name }}</TableCell>
                    <TableCell>
                      <Badge :variant="comp.itemType === 'Component' ? 'default' : 'secondary'">
                        {{ comp.itemType }}
                      </Badge>
                    </TableCell>
                    <TableCell>{{ comp.category }}</TableCell>
                    <TableCell>{{ comp.unit }}</TableCell>

                    <TableCell className="text-right">
                      <NumberField
                        :model-value="comp.numberOfUnits"
                        :decimals="3"
                        :step="1"
                        :min="0.001"
                        :empty-value="0.001"
                        class="w-24 text-right h-8"
                        @change="(val) => handleUpdateQuantity(comp.id, val)"
                      />
                    </TableCell>

                    <TableCell className="text-right">
                      €{{ Number(comp.unitCost).toFixed(2) }}
                    </TableCell>
                    <TableCell className="text-right">
                      €{{ Number(comp.totalCost).toFixed(2) }}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline">
                        {{ getCurrentStorageType(comp) }}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        @click="handleRemoveComponent(comp.id)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <!-- Cost Summary - Desktop Only (Mobile shows in header) -->
            <div
              v-if="!isMobile && menuComponents.length > 0"
              className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700"
            >
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-gray-600 dark:text-gray-400">Total Component Cost:</span>
                <span>
                  €
                  {{ menuComponents.reduce((sum, comp) => sum + comp.totalCost, 0).toFixed(2) }}
                </span>
              </div>

              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-gray-600 dark:text-gray-400">Number of Pieces:</span>
                <span>{{ parseFloat(numberOfPiecesRecipe).toFixed(3) }}</span>
              </div>

              <Separator className="my-2" />

              <div className="flex justify-between items-center">
                <span>Cost per Piece:</span>
                <span className="text-lg">€{{ Number(totalCost).toFixed(2) }}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Right Sidebar - Menu Item Details (Desktop Only) -->
      <aside
        v-if="!isMobile"
        className="w-96 bg-white dark:bg-gray-900 border-l dark:border-gray-700 p-6 overflow-y-auto"
      >
        <div className="space-y-6">
          <div>
            <h2 className="text-lg mb-4">Menu Item Details</h2>
            <Separator />
          </div>

          <!-- Picture -->
          <div className="space-y-2">
            <Label>Picture</Label>
            <div className="flex items-center gap-4 mt-2">
              <ImageWithFallback
                v-if="picture"
                :src="picture"
                :alt="name || 'Menu Item'"
                className="w-24 h-24 rounded object-cover"
              />
              <div
                v-else
                className="w-24 h-24 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
              >
                <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-500" />
              </div>

              <div className="flex-1">
                <input
                  id="picture-upload"
                  className="hidden"
                  type="file"
                  accept="image/*"
                  @change="handlePictureUpload"
                />

                <label for="picture-upload">
                  <Button type="button" variant="outline" asChild>
                    <span className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Picture
                    </span>
                  </Button>
                </label>

                <Button
                  v-if="picture"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-2"
                  @click="picture = ''"
                >
                  Remove
                </Button>
              </div>
            </div>
          </div>

          <!-- Name -->
          <div className="space-y-2">
            <Label for="name">Name *</Label>
            <Input
              id="name"
              :value="name"
              placeholder="e.g., Classic Burger"
              @input="name = $event?.target?.value"
            />
          </div>

          <!-- Space -->
          <div className="space-y-2">
            <Label>Space</Label>

            <Button
              v-if="selectedSpaceIds.length === 0"
              type="button"
              variant="outline"
              className="w-full justify-start"
              @click="showSpaceSelector = true"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>

            <div
              v-else
              className="flex items-center justify-between p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            >
              <span className="text-sm">
                {{ selectedSpaceIds.length }}
                space{{ selectedSpaceIds.length !== 1 ? 's' : '' }} selected
              </span>
              <Button type="button" variant="ghost" size="sm" @click="showSpaceSelector = true">
                <Edit className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <!-- Type & Category - New Cascading System -->
          <TypeCategorySelector
            :typeId="typeId"
            :categoryId="categoryId"
            :onTypeChange="setTypeId"
            :onCategoryChange="setCategoryId"
          />

          <!-- Ready for Sale -->
          <div className="space-y-2">
            <Label for="ready">Ready for Sale *</Label>
            <Select v-model="readyForSale">
              <SelectTrigger id="ready">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">Yes</SelectItem>
                <SelectItem value="No">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Combo Item -->
          <div className="space-y-2">
            <Label for="combo">Combo Item *</Label>
            <Select v-model="comboItem">
              <SelectTrigger id="combo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">Yes</SelectItem>
                <SelectItem value="No">No</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              If Yes, this item can be reused in Menu category items
            </p>
          </div>

          <!-- Number of Pieces -->
          <div className="space-y-2">
            <Label for="pieces">Number of Pieces (Recipe) *</Label>
            <NumberField
              :model-value="numberOfPiecesRecipe"
              :decimals="3"
              :step="1"
              :min="0.001"
              :empty-value="0.001"
              @change="(val) => (numberOfPiecesRecipe = val)"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              How many pieces this recipe makes (e.g., 1.000 for single serving)
            </p>
          </div>

          <!-- Base Price & Space-Specific Pricing -->
          <SpaceSpecificPricing
            v-if="selectedSpaceIds.length > 0"
            :menuItemSpaceIds="selectedSpaceIds"
            :spaces="spaces"
            :basePrice="basePrice"
            :spaceSpecificPrices="spaceSpecificPrices"
            :onChange="setSpaceSpecificPrices"
            :onBasePriceChange="setBasePrice"
            :totalCost="totalCost"
          />

          <div v-else className="space-y-2">
            <Label for="price">Base Price (€) *</Label>
            <NumberField
              id="price"
              :model-value="basePrice"
              :decimals="2"
              :step="0.01"
              :min="0"
              steppers
              pad
              :empty-value="0"
              @change="(val) => (basePrice = val)"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Please select spaces above to set space-specific pricing
            </p>
          </div>

          <!-- Cost Display - Only shown when no spaces selected -->
          <div
            v-if="selectedSpaceIds.length === 0"
            className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2"
          >
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Total Cost per Piece:</span>
              <span>€{{ Number(totalCost).toFixed(2) }}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Base Price:</span>
              <span>€{{ parseFloat(basePrice || '0').toFixed(2) }}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span>Margin:</span>
              <span
                :class="margin < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'"
              >
                {{ Number(margin).toFixed(1) }}%
              </span>
            </div>
          </div>

          <!-- Storage Type (Multi-select) -->
          <div className="space-y-2">
            <Label>Storage Type</Label>
            <div className="space-y-2">
              <div v-for="type in ['Dry', 'Cold', 'Freezer']" :key="type" className="flex items-center space-x-2">
                <Checkbox
                  :id="`storage-${type}`"
                  :checked="storageType.includes(type)"
                  @update:checked="toggleStorageType(type)"
                />
                <label :for="`storage-${type}`" className="text-sm cursor-pointer">
                  {{ type }}
                </label>
              </div>
            </div>
          </div>

          <!-- Diet (Multi-select) -->
          <div className="space-y-2">
            <Label>Diet</Label>
            <div className="space-y-2">
              <div
                v-for="dietType in ['Vegan', 'Vegetarian', 'Halal', 'Kosher', 'Hot']"
                :key="dietType"
                className="flex items-center space-x-2"
              >
                <Checkbox
                  :id="`diet-${dietType}`"
                  :checked="diet.includes(dietType)"
                  @update:checked="toggleDiet(dietType)"
                />
                <label :for="`diet-${dietType}`" className="text-sm cursor-pointer">
                  {{ dietType }}
                </label>
              </div>
            </div>
          </div>

          <!-- Description -->
          <div className="space-y-2">
            <Label for="description">Description</Label>
            <textarea id="description"
              :value="description"
              placeholder="Optional description of the menu item..."
              :rows="4"
              @input="description = $event?.target?.value"></textarea>
        
          </div>
        </div>
      </aside>
    </div>
  </div>

  <!-- Component Selector Dialog -->
  <ComponentSelectorDialog
    v-if="showComponentSelector"
    :components="components"
    :onSelect="handleAddComponent"
    :onClose="() => (showComponentSelector = false)"
  />

  <!-- Ingredient Selector Dialog -->
  <MarketPriceSelector
    :open="showIngredientSelector"
    :onSelect="handleAddIngredients"
    :onClose="() => (showIngredientSelector = false)"
    title="Select Ingredients"
    description="Choose ingredients from the Market Price List to add to your menu item"
  />

  <!-- Combo Item Selector Dialog -->
  <ComboItemSelectorDialog
    v-if="showComboItemSelector"
    :menuItems="menuItems"
    :excludeId="menuItem?.id"
    :onSelect="handleAddComboItem"
    :onClose="() => (showComboItemSelector = false)"
  />

  <!-- Packaging Selector Dialog -->
  <PackagingSelectorDialog
    v-if="showPackagingSelector"
    :onSelect="handleAddPackaging"
    :onClose="() => (showPackagingSelector = false)"
  />

  <!-- Edit Details Dialog -->
  <Dialog :open="showEditDetailsDialog" :onOpenChange="(val) => (showEditDetailsDialog = val)">
    <DialogContent
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
      aria-describedby="edit-menu-item-details-description"
    >
      <DialogHeader>
        <DialogTitle>Edit Menu Item Details</DialogTitle>
        <DialogDescription id="edit-menu-item-details-description">
          Update the basic information for this menu item
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <!-- Picture -->
        <div className="space-y-2">
          <Label>Picture</Label>
          <div className="flex items-center gap-4 mt-2">
            <ImageWithFallback
              v-if="picture"
              :src="picture"
              :alt="name || 'Menu Item'"
              className="w-24 h-24 rounded object-cover"
            />
            <div
              v-else
              className="w-24 h-24 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
            >
              <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-500" />
            </div>

            <div className="flex-1">
              <input
                id="picture-upload-mobile"
                className="hidden"
                type="file"
                accept="image/*"
                @change="handlePictureUpload"
              />

              <label for="picture-upload-mobile">
                <Button type="button" variant="outline" asChild>
                  <span className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Picture
                  </span>
                </Button>
              </label>

              <Button
                v-if="picture"
                type="button"
                variant="ghost"
                size="sm"
                className="ml-2"
                @click="picture = ''"
              >
                Remove
              </Button>
            </div>
          </div>
        </div>

        <!-- Name -->
        <div className="space-y-2">
          <Label for="name">Name *</Label>
          <Input
            id="name"
            :value="name"
            placeholder="e.g., Classic Burger"
            @input="name = $event?.target?.value"
          />
        </div>

        <!-- Space -->
        <div className="space-y-2">
          <Label>Space</Label>

          <Button
            v-if="selectedSpaceIds.length === 0"
            type="button"
            variant="outline"
            className="w-full justify-start"
            @click="showSpaceSelector = true"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>

          <div
            v-else
            className="flex items-center justify-between p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          >
            <span className="text-sm">
              {{ selectedSpaceIds.length }}
              space{{ selectedSpaceIds.length !== 1 ? 's' : '' }} selected
            </span>
            <Button type="button" variant="ghost" size="sm" @click="showSpaceSelector = true">
              <Edit className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <!-- Type & Category - New Cascading System -->
        <TypeCategorySelector
          :typeId="typeId"
          :categoryId="categoryId"
          :onTypeChange="setTypeId"
          :onCategoryChange="setCategoryId"
        />

        <!-- Ready for Sale -->
        <div className="space-y-2">
          <Label for="ready">Ready for Sale *</Label>
          <Select v-model="readyForSale">
            <SelectTrigger id="ready">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Combo Item -->
        <div className="space-y-2">
          <Label for="combo">Combo Item *</Label>
          <Select v-model="comboItem">
            <SelectTrigger id="combo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            If Yes, this item can be reused in Menu category items
          </p>
        </div>

        <!-- Number of Pieces -->
        <div className="space-y-2">
          <Label for="pieces">Number of Pieces (Recipe) *</Label>
          <NumberField
            :model-value="numberOfPiecesRecipe"
            :decimals="3"
            :step="1"
            :min="0.001"
            :empty-value="0.001"
            @change="(val) => (numberOfPiecesRecipe = val)"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            How many pieces this recipe makes (e.g., 1.000 for single serving)
          </p>
        </div>

        <!-- Base Price & Space-Specific Pricing -->
        <SpaceSpecificPricing
          v-if="selectedSpaceIds.length > 0"
          :menuItemSpaceIds="selectedSpaceIds"
          :spaces="spaces"
          :basePrice="basePrice"
          :spaceSpecificPrices="spaceSpecificPrices"
          :onChange="setSpaceSpecificPrices"
          :onBasePriceChange="setBasePrice"
          :totalCost="totalCost"
        />

        <div v-else className="space-y-2">
          <Label for="price">Base Price (€) *</Label>
          <NumberField
            id="price"
            :model-value="basePrice"
            :decimals="2"
            :step="0.01"
            :min="0"
            steppers
            pad
            :empty-value="0"
            @change="(val) => (basePrice = val)"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Please select spaces above to set space-specific pricing
          </p>
        </div>

        <!-- Cost Display - Only shown when no spaces selected -->
        <div
          v-if="selectedSpaceIds.length === 0"
          className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2"
        >
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Total Cost per Piece:</span>
            <span>€{{ Number(totalCost).toFixed(2) }}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Base Price:</span>
            <span>€{{ parseFloat(basePrice || '0').toFixed(2) }}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span>Margin:</span>
            <span
              :class="margin < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'"
            >
              {{ Number(margin).toFixed(1) }}%
            </span>
          </div>
        </div>

        <!-- Storage Type (Multi-select) -->
        <div className="space-y-2">
          <Label>Storage Type</Label>
          <div className="space-y-2">
            <div v-for="type in ['Dry', 'Cold', 'Freezer']" :key="type" className="flex items-center space-x-2">
              <Checkbox
                :id="`storage-${type}`"
                :checked="storageType.includes(type)"
                @update:checked="toggleStorageType(type)"
              />
              <label :for="`storage-${type}`" className="text-sm cursor-pointer">
                {{ type }}
              </label>
            </div>
          </div>
        </div>

        <!-- Diet (Multi-select) -->
        <div className="space-y-2">
          <Label>Diet</Label>
          <div className="space-y-2">
            <div
              v-for="dietType in ['Vegan', 'Vegetarian', 'Halal', 'Kosher', 'Hot']"
              :key="dietType"
              className="flex items-center space-x-2"
            >
              <Checkbox
                :id="`diet-${dietType}`"
                :checked="diet.includes(dietType)"
                @update:checked="toggleDiet(dietType)"
              />
              <label :for="`diet-${dietType}`" className="text-sm cursor-pointer">
                {{ dietType }}
              </label>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div className="space-y-2">
          <Label for="description">Description</Label>
          <textarea :rows="4" id="description" :value="description" @input="description = $event?.target?.value"></textarea>
          
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="showEditDetailsDialog = false">
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Space Selection Dialog -->
  <SpaceSelectionDialog
    :open="showSpaceSelector"
    :spaces="spaces"
    :selectedSpaceIds="selectedSpaceIds"
    :onSave="setSelectedSpaceIds"
    :onClose="() => (showSpaceSelector = false)"
    :basePrice="basePrice"
    :spaceSpecificPrices="spaceSpecificPrices"
  />
</template>