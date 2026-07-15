<script>
import Button from '../ui/button.vue';
import Input from '../ui/input.vue';
import Label from '../ui/label.vue';
//import Textarea from '../ui/textarea.vue';

import Select from '../ui/select.vue';
import SelectContent from '../ui/selectContent.vue';
import SelectItem from '../ui/selectItem.vue';
import SelectTrigger from '../ui/selectTrigger.vue';
import SelectValue from '../ui/selectValue.vue';
import Table from '../ui/table.vue';
import TableBody from '../ui/tableBody.vue';
import TableCell from '../ui/tableCell.vue';
import TableHead from '../ui/tableHead.vue';
import TableHeader from '../ui/tableHeader.vue';
import TableRow from '../ui/tableRow.vue';
import Badge from '../ui/badge.vue';
import Card from '../ui/card.vue';
import CardContent from '../ui/cardContent.vue';
import CardHeader from '../ui/cardHeader.vue';
import CardTitle from '../ui/cardTitle.vue';
import Separator from '../ui/separator.vue';
import Sheet from '../ui/sheet.vue';
import SheetContent from '../ui/sheetContent.vue';
import SheetHeader from '../ui/sheetHeader.vue';
import SheetTitle from '../ui/sheetTitle.vue';
import SheetDescription from '../ui/sheetDescription.vue';

import { Trash2, Package, Leaf, Save, X, Edit  } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import MarketPriceSelector from './MarketPriceSelector.vue';
import ComponentSelectorDialog from './ComponentSelectorDialog.vue';
import useMobile from '../ui/useMobile';
import NumericInput from '../ui/numericInput.vue';
export default {
  name: "ComponentBuilderPanel",
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
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,

    Trash2,
    Package,
    Leaf,
    Save,
    X,
    Edit,

    MarketPriceSelector,
    ComponentSelectorDialog,

    NumericInput,
  },
  props: {
    component: {
      type: Object,
      default: null, // null for new component
    },

    components: {
      type: Array, // All components for nesting
      required: true,
    },

    ingredients: {
      type: Array, // LEGACY - kept for backward compatibility
      required: true,
    },

    marketPrices: {
      type: Array, // NEW - used for ingredient selection
      required: true,
    },

    onSave: {
      type: Function, // (component) => void
      required: true,
    },

    onCancel: {
      type: Function, // () => void
      required: true,
    },
  },

  data() {
    const component = this.component;
    return {
      name: (component && component.name) || "",
      category: (component && component.category) || "Food",
      componentCategory: (component && component.componentCategory) || "Sauce",
      unit: (component && component.unit) || "kg",
      numberOfUnitsRecipe: (component && component.numberOfUnitsRecipe) || 1.0,
      storageType: (component && component.storageType) || "Dry",
      description: (component && component.description) || "",

      subComponents:
        (component &&
          component.subComponents &&
          component.subComponents.map((sub) => {
            // Fix unitCost if missing
            const unitCost =
              sub.unitCost ??
              (sub.numberOfUnits > 0 ? sub.cost / sub.numberOfUnits : 0);

            // Fix numberOfUnits if missing or zero (but cost and unitCost are valid)
            let numberOfUnits = sub.numberOfUnits;
            if (
              (!numberOfUnits || numberOfUnits === 0) &&
              sub.cost > 0 &&
              unitCost > 0
            ) {
              numberOfUnits = sub.cost / unitCost;
              console.log(
                `Repaired numberOfUnits for "${sub.name}": ${numberOfUnits.toFixed(
                  3,
                )} (from cost: ${sub.cost}, unitCost: ${unitCost})`,
              );
            }

            return {
              ...sub,
              unitCost,
              numberOfUnits: numberOfUnits || 1.0, // Default to 1.0 if still invalid
            };
          })) ||
        [],

      // Dialog states
      showIngredientLibrary: false,
      showComponentLibrary: false,
      showDetailsSheet: false,
    };
  },

  methods: {
    fixSubComponentsUnitCostAndUnits() {
      const subComponents = this.subComponents || [];

      const needsFixing = subComponents.some(
        (sub) =>
          sub.unitCost === 0 ||
          sub.unitCost === undefined ||
          sub.numberOfUnits === 0 ||
          sub.numberOfUnits === undefined,
      );

      if (!needsFixing) return;

      console.log(
        "Fixing unitCost and numberOfUnits for existing subComponents",
      );

      const fixedSubComponents = subComponents.map((sub) => {
        let updatedSub = { ...sub };

        // Fix unitCost if needed
        if (!updatedSub.unitCost || updatedSub.unitCost === 0) {
          let foundMatch = false;

          // Try ingredients first (or if itemType is 'Ingredient' or undefined)
          if (!sub.itemType || sub.itemType === "Ingredient") {
            const matchingIngredient = (this.ingredients || []).find(
              (ing) => ing.name === sub.name,
            );

            if (matchingIngredient && matchingIngredient.costPerRecipeUnit) {
              const newUnitCost = matchingIngredient.costPerRecipeUnit;
              console.log(
                `Fixed ingredient "${sub.name}": unitCost = ${newUnitCost}`,
              );
              updatedSub = {
                ...updatedSub,
                itemType: "Ingredient",
                unitCost: newUnitCost,
              };
              foundMatch = true;
            }
          }

          // Try components if not found in ingredients
          if (!foundMatch && (!sub.itemType || sub.itemType === "Component")) {
            const matchingComponent = (this.components || []).find(
              (comp) => comp.name === sub.name,
            );

            if (matchingComponent && matchingComponent.unitCost) {
              const newUnitCost = matchingComponent.unitCost;
              console.log(
                `Fixed component "${sub.name}": unitCost = ${newUnitCost}`,
              );
              updatedSub = {
                ...updatedSub,
                itemType: "Component",
                unitCost: newUnitCost,
              };
              foundMatch = true;
            }
          }

          // If no match found, set itemType default
          if (!foundMatch) {
            updatedSub.itemType = updatedSub.itemType || "Ingredient";
          }
        }

        // Fix numberOfUnits if needed
        if (!updatedSub.numberOfUnits || updatedSub.numberOfUnits === 0) {
          if (updatedSub.cost > 0 && updatedSub.unitCost > 0) {
            updatedSub.numberOfUnits = updatedSub.cost / updatedSub.unitCost;
            console.log(
              `Repaired numberOfUnits for "${updatedSub.name}": ${updatedSub.numberOfUnits.toFixed(3)}`,
            );
          } else {
            updatedSub.numberOfUnits = 1.0;
            console.log(
              `Set default numberOfUnits for "${updatedSub.name}": 1.000`,
            );
          }
        }

        // Recalculate cost to ensure consistency
        updatedSub.cost =
          (updatedSub.unitCost || 0) * (updatedSub.numberOfUnits || 0);

        return updatedSub;
      });

      // Only update if we actually fixed something
      const hasChanges = fixedSubComponents.some(
        (fixed, idx) =>
          fixed.unitCost !== subComponents[idx].unitCost ||
          fixed.cost !== subComponents[idx].cost ||
          fixed.numberOfUnits !== subComponents[idx].numberOfUnits,
      );

      if (hasChanges) {
        console.log("Applying fixes to subComponents");
        this.subComponents = fixedSubComponents;
      }
    },

    // (Optionnel) si tu veux garder une fonction comme en React
    calculateUnitCost() {
      return this.totalSubCost * this.numberOfUnitsRecipe;
    },

    handleAddIngredients(selectedItems) {
      const newSubComponents = [];

      selectedItems.forEach((item) => {
        // Determine storage type based on category
        let storageType = "Dry";
        if (item.category) {
          const coldCategories = ["Fish", "Meat", "Cheese", "Dairy"];
          const freezerCategories = ["Ice Cream", "Frozen"];

          if (coldCategories.includes(item.category)) {
            storageType = "Cold";
          } else if (freezerCategories.includes(item.category)) {
            storageType = "Freezer";
          }
        }

        newSubComponents.push({
          id: Date.now().toString() + Math.random().toString(),
          itemType: "Ingredient",
          name: item.itemName,
          category: item.category || "Other",
          unit: item.recipeUnit || item.unit,
          numberOfUnits: 1.0,
          unitCost: item.costPerRecipeUnit,
          cost: item.costPerRecipeUnit,
          storageType: storageType,
          marketPriceId: item.marketPriceId,
          marketPriceItemName: item.itemName,
        });
      });

      this.subComponents = [...this.subComponents, ...newSubComponents];
      this.showIngredientLibrary = false;

      if (newSubComponents.length === 1) {
        toast.success(`Added ${newSubComponents[0].name}`);
      } else {
        toast.success(`Added ${newSubComponents.length} ingredients`);
      }
    },

    // Add component from library
    handleAddComponent(comp) {
      // Prevent circular reference
      if (this.component && comp.id === this.component.id) {
        toast.error("Cannot add a component to itself");
        return;
      }

      const componentUnitCost = comp.unitCost || 0;

      const newSubComponent = {
        id: Date.now().toString() + Math.random(),
        itemType: "Component",
        name: comp.name || "Unknown Component",
        category: comp.componentCategory || "Other",
        unit: comp.unit || "kg",
        numberOfUnits: 1.0,
        unitCost: componentUnitCost,
        cost: componentUnitCost * 1.0,
        storageType: comp.storageType || "Dry",
      };

      this.subComponents = [...this.subComponents, newSubComponent];
      this.showComponentLibrary = false;

      toast.success(`Added ${comp.name || "component"}`);
    },

    // Update sub-component quantity
    handleUpdateSubComponent(id, numberOfUnits) {
      this.subComponents = (this.subComponents || []).map((sub) => {
        if (sub.id === id) {
          // Recalculate cost based on new quantity using stored unitCost
          return {
            ...sub,
            numberOfUnits,
            cost: (sub.unitCost || 0) * numberOfUnits,
          };
        }
        return sub;
      });
    },

    // Delete sub-component
    handleDeleteSubComponent(id) {
      this.subComponents = (this.subComponents || []).filter(
        (sub) => sub.id !== id,
      );
      toast.success("Item removed");
    },

    // Delete sub-component
    handleDeleteSubComponent(id) {
      this.subComponents = (this.subComponents || []).filter(
        (sub) => sub.id !== id,
      );
      toast.success("Item removed");
    },

    // Save component
    handleSave() {
      // Validation
      if (!String(this.name || "").trim()) {
        toast.error("Component name is required");
        return;
      }

      if (this.numberOfUnitsRecipe <= 0) {
        toast.error("Number of units must be greater than 0");
        return;
      }

      if (!this.subComponents || this.subComponents.length === 0) {
        toast.error("Please add at least one ingredient or component");
        return;
      }

      // Validate that all subComponents have valid numberOfUnits
      const invalidSubComponents = this.subComponents.filter(
        (sub) =>
          !sub.numberOfUnits ||
          sub.numberOfUnits <= 0 ||
          isNaN(sub.numberOfUnits),
      );

      if (invalidSubComponents.length > 0) {
        toast.error(
          `Invalid quantity for: ${invalidSubComponents.map((s) => s.name).join(", ")}`,
        );
        return;
      }

      // Ensure all subComponents have complete data before saving
      const validatedSubComponents = this.subComponents.map((sub) => ({
        ...sub,
        numberOfUnits: sub.numberOfUnits || 1.0,
        unitCost: sub.unitCost || 0,
        cost: (sub.unitCost || 0) * (sub.numberOfUnits || 0),
      }));

      const newComponent = {
        id: (this.component && this.component.id) || Date.now().toString(),
        name: String(this.name || "").trim(),
        category: this.category,
        componentCategory: this.componentCategory,
        unit: this.unit,
        numberOfUnitsRecipe: this.numberOfUnitsRecipe,
        storageType: this.storageType,
        unitCost: this.unitCost, // en général computed
        description: String(this.description || "").trim(),
        subComponents: validatedSubComponents,
        allergens: (this.component && this.component.allergens) || [],
      };

      console.log(
        "Saving component with subComponents:",
        validatedSubComponents,
      );
      this.onSave(newComponent);
    },
  },

  computed: {
    totalSubCost() {
      return (this.subComponents || []).reduce(
        (sum, sub) => sum + (sub.cost || 0),
        0,
      );
    },

    unitCost() {
      return this.totalSubCost * this.numberOfUnitsRecipe;
    },
  },

  watch: {
    ingredients: {
      handler() {
        this.fixSubComponentsUnitCostAndUnits();
      },
      deep: true,
      immediate: true,
    },
    components: {
      handler() {
        this.fixSubComponentsUnitCostAndUnits();
      },
      deep: true,
      immediate: true,
    },
  },
};
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-900 border-b px-4 md:px-6 py-4">
      <div
        class="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <!-- Title and Subtitle -->
        <div>
          <h1 class="text-xl">
            {{ component ? `Edit ${component.name}` : "Create New Component" }}
          </h1>
          <p class="text-sm text-gray-500">
            Build a reusable component from ingredients and other components
          </p>
        </div>

        <!-- Action Buttons - Desktop -->
        <div class="hidden md:flex gap-3">
          <Button variant="outline" @click="onCancel">
            <X class="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button @click="handleSave">
            <Save class="w-4 h-4 mr-2" />
            {{ component ? "Update" : "Create" }} Component
          </Button>
        </div>
      </div>

      <!-- Mobile buttons row -->
      <div class="flex md:hidden gap-3 mt-4">
        <Button variant="outline" class="flex-1" @click="onCancel">
          <X class="w-4 h-4 mr-2" />
          Cancel
        </Button>
        <Button class="flex-1" @click="handleSave">
          <Save class="w-4 h-4 mr-2" />
          {{ component ? "Update" : "Create" }}
        </Button>
      </div>

      <!-- Edit Component Details button - Mobile only -->
      <div class="md:hidden mt-3">
        <Button
          variant="outline"
          class="w-full"
          @click="showDetailsSheet = true"
        >
          <Edit class="w-4 h-4 mr-2" />
          Edit Component Details
        </Button>
      </div>

      <!-- Summary Stats Widgets - Mobile only -->
      <div class="md:hidden mt-3 grid grid-cols-3 gap-2">
        <!-- Total Items Widget -->
        <div class="bg-white border rounded-lg p-3 text-center">
          <div class="text-xs text-gray-500 mb-1">Total Items</div>
          <div class="text-lg font-bold">{{ subComponents.length }}</div>
        </div>

        <!-- Sub-Items Cost Widget -->
        <div
          class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center"
        >
          <div class="text-xs text-blue-600 mb-1">Sub-Items</div>
          <div class="text-lg font-bold text-blue-600">
            €{{ totalSubCost.toFixed(2) }}
          </div>
        </div>

        <!-- Final Unit Cost Widget -->
        <div
          class="bg-green-50 border border-green-200 rounded-lg p-3 text-center"
        >
          <div class="text-xs text-green-600 mb-1">Unit Cost</div>
          <div class="text-lg font-bold text-green-600">
            €{{ unitCost.toFixed(2) }}
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Center - Sub-Components Table -->
      <main class="flex-1 overflow-auto p-4 md:p-6">
        <Card class="h-full flex flex-col">
          <CardHeader class="border-b dark:border-gray-700 p-2 md:p-6 md:pb-3">
            <!-- Title and subtitle - Desktop only -->
            <div class="hidden md:block mb-4">
              <CardTitle>Sub-Components &​amp; Ingredients</CardTitle>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Add ingredients and components that make up this component
              </p>
            </div>

            <!-- Add buttons -->
            <div class="flex gap-2">
              <Button
                variant="outline"
                class="flex-1"
                @click="showIngredientLibrary = true"
              >
                <Leaf class="w-4 h-4 mr-2" />
                Add Ingredient
              </Button>
              <Button
                variant="outline"
                class="flex-1"
                @click="showComponentLibrary = true"
              >
                <Package class="w-4 h-4 mr-2" />
                Add Component
              </Button>
            </div>

            <!-- Summary Stats - Desktop only -->
            <div
              class="hidden md:flex gap-6 pt-4 border-t dark:border-gray-700 mt-4"
            >
              <div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  Total Items
                </div>
                <div class="text-2xl font-bold">{{ subComponents.length }}</div>
              </div>
              <div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  Sub-Items Cost
                </div>
                <div
                  class="text-2xl font-bold text-blue-600 dark:text-blue-400"
                >
                  €{{ totalSubCost.toFixed(2) }}
                </div>
              </div>
              <div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  Final Unit Cost
                </div>
                <div
                  class="text-2xl font-bold text-green-600 dark:text-green-400"
                >
                  €{{ unitCost.toFixed(2) }}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent class="flex-1 overflow-auto p-0">
            <div
              v-if="subComponents.length === 0"
              class="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 p-8"
            >
              <Package class="w-16 h-16 mb-4 opacity-50" />
              <p class="font-medium text-lg mb-2">No items added yet</p>
              <p class="text-sm text-center max-w-md">
                Click "Add Ingredient" or "Add Component" above to start
                building this component
              </p>
            </div>

            <div v-else class="h-full overflow-auto">
              <Table>
                <TableHeader
                  class="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10"
                >
                  <TableRow>
                    <TableHead class="w-[120px] bg-gray-50 dark:bg-gray-900"
                      >Type</TableHead
                    >
                    <TableHead class="bg-gray-50 dark:bg-gray-900"
                      >Name</TableHead
                    >
                    <TableHead
                      class="w-[150px] hidden md:table-cell bg-gray-50 dark:bg-gray-900"
                    >
                      Category
                    </TableHead>
                    <TableHead class="w-[140px] bg-gray-50 dark:bg-gray-900">
                      Number of Units
                    </TableHead>
                    <TableHead
                      class="w-[100px] hidden sm:table-cell bg-gray-50 dark:bg-gray-900"
                    >
                      Unit
                    </TableHead>
                    <TableHead class="w-[120px] bg-gray-50 dark:bg-gray-900"
                      >Cost (€)</TableHead
                    >
                    <TableHead
                      class="w-[120px] hidden lg:table-cell bg-gray-50 dark:bg-gray-900"
                    >
                      Storage
                    </TableHead>
                    <TableHead
                      class="w-[80px] text-right bg-gray-50 dark:bg-gray-900"
                    >
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  <TableRow
                    v-for="(sub, index) in subComponents"
                    :key="sub.id"
                    :class="
                      index % 2 === 0
                        ? 'bg-white dark:bg-gray-950'
                        : 'bg-gray-50 dark:bg-gray-900'
                    "
                  >
                    <TableCell>
                      <Badge
                        :variant="
                          sub.itemType === 'Component' ? 'default' : 'secondary'
                        "
                        class="flex items-center gap-1 w-fit"
                      >
                        <Package
                          v-if="sub.itemType === 'Component'"
                          class="w-3 h-3"
                        />
                        <Leaf v-else class="w-3 h-3" />
                        <span class="hidden sm:inline">{{ sub.itemType }}</span>
                      </Badge>
                    </TableCell>

                    <TableCell class="font-medium">{{
                      sub.name || "Unknown"
                    }}</TableCell>

                    <TableCell class="hidden md:table-cell">
                      <Badge variant="outline">{{
                        sub.category || "N/A"
                      }}</Badge>
                    </TableCell>

                    <TableCell>
                      <NumericInput
                        :value="sub.numberOfUnits || 0"
                        :decimals="3"
                        :min="0.001"
                        class="w-full"
                        @change="
                          (value) => handleUpdateSubComponent(sub.id, value)
                        "
                      />
                    </TableCell>

                    <TableCell class="hidden sm:table-cell">{{
                      sub.unit || "N/A"
                    }}</TableCell>

                    <TableCell class="font-medium"
                      >€{{ (sub.cost || 0).toFixed(2) }}</TableCell
                    >

                    <TableCell class="hidden lg:table-cell">
                      <Badge variant="outline" class="text-xs">
                        {{ sub.storageType || "N/A" }}
                      </Badge>
                    </TableCell>

                    <TableCell class="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        @click="handleDeleteSubComponent(sub.id)"
                      >
                        <Trash2 class="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <!-- Right Sidebar - Component Details (Desktop Only) -->
      <aside
        class="hidden md:block w-[400px] border-l dark:border-gray-700 bg-white dark:bg-gray-900 overflow-auto"
      >
        <div class="p-6 border-b dark:border-gray-700">
          <h2 class="font-semibold text-lg">Component Details</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure the component properties
          </p>
        </div>

        <div class="p-6 space-y-6">
          <!-- Component Name -->
          <div>
            <Label for="name" class="text-sm font-medium"
              >Component Name *</Label
            >
            <Input
              id="name"
              v-model="name"
              placeholder="e.g., Burger Patty, Caesar Dressing"
              class="mt-2"
            />
          </div>

          <!-- Category -->
          <div>
            <Label for="category" class="text-sm font-medium">Category *</Label>
            <Select
              :value="category"
              :onValueChange="(value) => (category = value)"
            >
              <SelectTrigger id="category" class="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Food">Food</SelectItem>
                <SelectItem value="Beverage">Beverage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Component Category -->
          <div>
            <Label for="componentCategory" class="text-sm font-medium"
              >Component Type *</Label
            >
            <Select
              :value="componentCategory"
              :onValueChange="(value) => (componentCategory = value)"
            >
              <SelectTrigger id="componentCategory" class="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Sauce">Sauce</SelectItem>
                <SelectItem value="Meat">Meat</SelectItem>
                <SelectItem value="Fish">Fish</SelectItem>
                <SelectItem value="Veg">Veg</SelectItem>
                <SelectItem value="Salad">Salad</SelectItem>
                <SelectItem value="Biscuit">Biscuit</SelectItem>
                <SelectItem value="Jus">Jus</SelectItem>
                <SelectItem value="Juice">Juice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <!-- Unit -->
          <div>
            <Label for="unit" class="text-sm font-medium">Unit *</Label>
            <Select :value="unit" :onValueChange="(value) => (unit = value)">
              <SelectTrigger id="unit" class="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">kg (kilogram)</SelectItem>
                <SelectItem value="liter">liter</SelectItem>
                <SelectItem value="piece">piece</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Number of Units Recipe -->
          <div>
            <Label for="numberOfUnitsRecipe" class="text-sm font-medium">
              Number of Units per Recipe *
            </Label>
            <NumericInput
              :value="numberOfUnitsRecipe"
              :decimals="3"
              :min="0.001"
              class="mt-2"
              @change="(value) => (numberOfUnitsRecipe = value)"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              How many units this recipe makes
            </p>
          </div>

          <!-- Storage Type -->
          <div>
            <Label for="storageType" class="text-sm font-medium"
              >Storage Type *</Label
            >
            <Select
              :value="storageType"
              :onValueChange="(value) => (storageType = value)"
            >
              <SelectTrigger id="storageType" class="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Dry">Dry Storage</SelectItem>
                <SelectItem value="Cold"
                  >Cold Storage (Refrigerated)</SelectItem
                >
                <SelectItem value="Freezer">Freezer</SelectItem>
                <SelectItem value="Material">Material/Equipment</SelectItem>
                <SelectItem value="NA">Not Applicable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <!-- Unit Cost (Calculated) -->
          <div
            class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
          >
            <Label class="text-sm font-medium text-blue-900 dark:text-blue-100">
              Calculated Unit Cost
            </Label>
            <div
              class="text-3xl font-bold text-blue-700 dark:text-blue-300 mt-2"
            >
              €{{ unitCost.toFixed(2) }}
            </div>
            <div
              class="text-xs text-blue-600 dark:text-blue-400 mt-2 space-y-1"
            >
              <div>Sub-items total: €{{ totalSubCost.toFixed(2) }}</div>
              <div>× {{ numberOfUnitsRecipe.toFixed(3) }} units</div>
              <div
                class="font-medium pt-1 border-t border-blue-300 dark:border-blue-700"
              >
                = €{{ unitCost.toFixed(2) }} per unit
              </div>
            </div>
          </div>

          <Separator />

          <!-- Description -->
          <div>
            <Label for="description" class="text-sm font-medium"
              >Description (Optional)</Label
            >
            <textarea id="description"
              v-model="description"
              placeholder="Add preparation notes, storage instructions, or other details..."
              :rows="5"
              class="mt-2"></textarea>
            
          </div>

          <!-- Action Buttons - Bottom of form -->
          <div class="pt-6 border-t dark:border-gray-700 space-y-3">
            <Button class="w-full" size="lg" @click="handleSave">
              <Save class="w-4 h-4 mr-2" />
              {{ component ? "Update" : "Create" }} Component
            </Button>
            <Button variant="outline" class="w-full" @click="onCancel">
              Cancel
            </Button>
          </div>
        </div>
      </aside>
    </div>
  </div>

  <!-- Mobile Sheet - Component Details -->
  <Sheet :open="showDetailsSheet" :onOpenChange="(v) => (showDetailsSheet = v)">
    <SheetContent
      side="bottom"
      class="h-[90vh] overflow-auto"
      aria-describedby="component-details-description"
    >
      <SheetHeader class="px-4">
        <SheetTitle>Component Details</SheetTitle>
        <SheetDescription id="component-details-description">
          Configure the component properties
        </SheetDescription>
      </SheetHeader>

      <div class="mt-6 space-y-6 pb-6 px-4">
        <!-- Component Name -->
        <div>
          <Label for="name-mobile" class="text-sm font-medium"
            >Component Name *</Label
          >
          <Input
            id="name-mobile"
            v-model="name"
            placeholder="e.g., Burger Patty, Caesar Dressing"
            class="mt-2"
          />
        </div>

        <!-- Category -->
        <div>
          <Label for="category-mobile" class="text-sm font-medium"
            >Category *</Label
          >
          <Select
            :value="category"
            :onValueChange="(value) => (category = value)"
          >
            <SelectTrigger id="category-mobile" class="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Food">Food</SelectItem>
              <SelectItem value="Beverage">Beverage</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Component Category -->
        <div>
          <Label for="componentCategory-mobile" class="text-sm font-medium">
            Component Type *
          </Label>
          <Select
            :value="componentCategory"
            :onValueChange="(value) => (componentCategory = value)"
          >
            <SelectTrigger id="componentCategory-mobile" class="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Sauce">Sauce</SelectItem>
              <SelectItem value="Meat">Meat</SelectItem>
              <SelectItem value="Fish">Fish</SelectItem>
              <SelectItem value="Veg">Veg</SelectItem>
              <SelectItem value="Salad">Salad</SelectItem>
              <SelectItem value="Biscuit">Biscuit</SelectItem>
              <SelectItem value="Jus">Jus</SelectItem>
              <SelectItem value="Juice">Juice</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <!-- Unit -->
        <div>
          <Label for="unit-mobile" class="text-sm font-medium">Unit *</Label>
          <Select :value="unit" :onValueChange="(value) => (unit = value)">
            <SelectTrigger id="unit-mobile" class="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kg">kg (kilogram)</SelectItem>
              <SelectItem value="liter">liter</SelectItem>
              <SelectItem value="piece">piece</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Number of Units Recipe -->
        <div>
          <Label for="numberOfUnitsRecipe-mobile" class="text-sm font-medium">
            Number of Units per Recipe *
          </Label>
          <NumericInput
            :value="numberOfUnitsRecipe"
            :decimals="3"
            :min="0.001"
            class="mt-2"
            @change="(value) => (numberOfUnitsRecipe = value)"
          />
          <p class="text-xs text-gray-500 mt-1.5">
            How many units this recipe makes
          </p>
        </div>

        <!-- Storage Type -->
        <div>
          <Label for="storageType-mobile" class="text-sm font-medium"
            >Storage Type *</Label
          >
          <Select
            :value="storageType"
            :onValueChange="(value) => (storageType = value)"
          >
            <SelectTrigger id="storageType-mobile" class="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Dry">Dry Storage</SelectItem>
              <SelectItem value="Cold">Cold Storage (Refrigerated)</SelectItem>
              <SelectItem value="Freezer">Freezer</SelectItem>
              <SelectItem value="Material">Material/Equipment</SelectItem>
              <SelectItem value="NA">Not Applicable</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <!-- Unit Cost (Calculated) -->
        <div
          class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
        >
          <Label class="text-sm font-medium text-blue-900 dark:text-blue-100">
            Calculated Unit Cost
          </Label>
          <div class="text-3xl font-bold text-blue-700 dark:text-blue-300 mt-2">
            €{{ unitCost.toFixed(2) }}
          </div>
          <div class="text-xs text-blue-600 dark:text-blue-400 mt-2 space-y-1">
            <div>Sub-items total: €{{ totalSubCost.toFixed(2) }}</div>
            <div>× {{ numberOfUnitsRecipe.toFixed(3) }} units</div>
            <div
              class="font-medium pt-1 border-t border-blue-300 dark:border-blue-700"
            >
              = €{{ unitCost.toFixed(2) }} per unit
            </div>
          </div>
        </div>

        <Separator />

        <!-- Description -->
        <div>
          <Label for="description-mobile" class="text-sm font-medium"
            >Description (Optional)</Label
          >
          <textarea id="description-mobile"
            v-model="description"
            placeholder="Add preparation notes, storage instructions, or other details..."
            :rows="5"
            class="mt-2"></textarea>
          
        </div>

        <!-- Action Buttons -->
        <div class="pt-6 border-t space-y-3">
          <Button
            class="w-full"
            size="lg"
            @click="
              () => {
                handleSave();
                showDetailsSheet = false;
              }
            "
          >
            <Save class="w-4 h-4 mr-2" />
            {{ component ? "Update" : "Create" }} Component
          </Button>

          <Button
            variant="outline"
            class="w-full"
            @click="showDetailsSheet = false"
          >
            Close
          </Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>

  <!-- Ingredient Library Dialog -->
  <MarketPriceSelector
    :open="showIngredientLibrary"
    :onSelect="handleAddIngredients"
    :onClose="() => (showIngredientLibrary = false)"
    title="Select Ingredients"
    description="Choose ingredients from the Market Price List to add to your component"
  />

  <!-- Component Selector Dialog -->
  <ComponentSelectorDialog
    v-if="showComponentLibrary"
    :components="components"
    :excludeId="component ? component.id : undefined"
    :onSelect="handleAddComponent"
    :onClose="() => (showComponentLibrary = false)"
  />
</template>
