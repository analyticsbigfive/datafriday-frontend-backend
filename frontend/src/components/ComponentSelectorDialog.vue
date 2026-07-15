<script>
import Dialog from '../ui/dialog.vue';
import DialogContent from '../ui/dialogContent.vue';
import DialogDescription from '../ui/dialogDescription.vue';
import DialogHeader from '../ui/dialogHeader.vue';
import DialogTitle from '../ui/dialogTitle.vue';
import DialogFooter from '../ui/dialogFooter.vue';
import Button from '../ui/button.vue';
import Input from '../ui/input.vue';
import Table from '../ui/table.vue';
import TableBody from '../ui/tableBody.vue';
import TableCell from '../ui/tableCell.vue';
import TableHead from '../ui/tableHead.vue';
import TableHeader from '../ui/tableHeader.vue';
import TableRow from '../ui/tableRow.vue';
import Select from '../ui/select.vue';
import SelectContent from '../ui/selectContent.vue';
import SelectItem from '../ui/selectItem.vue';
import SelectTrigger from '../ui/selectTrigger.vue';
import SelectValue from '../ui/selectValue.vue';
import Badge from '../ui/badge.vue';
import Checkbox from '../ui/checkbox.vue';
import { Search } from 'lucide-vue-next';

export default {
  name: "ComponentSelectorDialog",
  components: {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Button,
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Badge,
    Checkbox,
    Search,
  },
  props: {
    components: {
      type: Array,
      required: true,
    },
    excludeId: {
      type: String,
      default: undefined, 
    },
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
      selectedComponents: new Set(),
    };
  },
 
  computed: {
    // Filter components
    filteredComponents() {
      return (this.components || []).filter((comp) => {
        // Exclude the current component being edited (prevent self-reference)
        if (this.excludeId && comp.id === this.excludeId) return false;
 
        const name = String(comp.name || "");
        const description = String(comp.description || "");
 
        const q = String(this.searchQuery || "").toLowerCase();
 
        const matchesSearch =
          name.toLowerCase().includes(q) || description.toLowerCase().includes(q);
 
        const matchesCategory =
          this.categoryFilter === "all" || comp.category === this.categoryFilter;
 
        return matchesSearch && matchesCategory;
      });
    },
  },
 
  methods: {
    // Toggle component selection
    toggleComponentSelection(componentId) {
      const newSet = new Set(this.selectedComponents);
      if (newSet.has(componentId)) {
        newSet.delete(componentId);
      } else {
        newSet.add(componentId);
      }
      this.selectedComponents = newSet;
    },
 
    // Handle add selected components
    handleAddSelected() {
      this.selectedComponents.forEach((componentId) => {
        const component = (this.components || []).find((c) => c.id === componentId);
        if (component) {
          this.onSelect(component);
        }
      });
 
      this.selectedComponents = new Set();
      this.onClose();
    },
  },
};
</script>

<template>
  <Dialog :open="true" :onOpenChange="onClose">
    <DialogContent
      class="max-w-4xl max-h-[85vh] flex flex-col"
      aria-describedby="component-selector-description"
    >
      <DialogHeader>
        <DialogTitle>Select Component</DialogTitle>
        <DialogDescription id="component-selector-description">
          Choose components to add as sub-items
        </DialogDescription>
      </DialogHeader>

      <!-- Filters -->
      <div class="flex gap-3">
        <div class="flex-1 relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search components..."
            v-model="searchQuery"
            class="pl-9"
          />
        </div>

        <Select :value="categoryFilter" :onValueChange="(v) => (categoryFilter = v)">
          <SelectTrigger class="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="Food">Food</SelectItem>
            <SelectItem value="Beverage">Beverage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Results Table -->
      <div class="flex-1 overflow-auto border rounded-lg">
        <Table>
          <TableHeader class="sticky top-0 bg-white dark:bg-gray-900">
            <TableRow>
              <TableHead class="w-10 bg-white dark:bg-gray-900"></TableHead>
              <TableHead class="bg-white dark:bg-gray-900">Component Name</TableHead>
              <TableHead class="bg-white dark:bg-gray-900">Category</TableHead>
              <TableHead class="bg-white dark:bg-gray-900">Type</TableHead>
              <TableHead class="bg-white dark:bg-gray-900">Unit</TableHead>
              <TableHead class="bg-white dark:bg-gray-900">Unit Cost</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow v-if="filteredComponents.length === 0">
              <TableCell
                :colSpan="6"
                class="text-center py-8 text-gray-500 dark:text-gray-400"
              >
                No components found
              </TableCell>
            </TableRow>

            <TableRow
              v-else
              v-for="component in filteredComponents"
              :key="component.id"
              :class="`cursor-pointer ${
                selectedComponents.has(component.id)
                  ? 'bg-blue-50 dark:bg-blue-950'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`"
              @click="toggleComponentSelection(component.id)"
            >
              <TableCell>
                <Checkbox
                  :checked="selectedComponents.has(component.id)"
                  :onCheckedChange="() => toggleComponentSelection(component.id)"
                />
              </TableCell>

              <TableCell>
                <div class="font-medium">{{ component.name }}</div>
                <div
                  v-if="component.description"
                  class="text-sm text-gray-500 dark:text-gray-400"
                >
                  {{ component.description }}
                </div>
              </TableCell>

              <TableCell>
                <Badge variant="secondary">{{ component.category }}</Badge>
              </TableCell>

              <TableCell>
                <Badge>{{ component.componentCategory }}</Badge>
              </TableCell>

              <TableCell>{{ component.unit }}</TableCell>

              <TableCell>€{{ component.unitCost.toFixed(2) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <DialogFooter>
        <div class="flex justify-between items-center w-full">
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{ selectedComponents.size }}
            component{{ selectedComponents.size !== 1 ? "s" : "" }} selected
          </span>

          <div class="flex gap-2">
            <Button variant="outline" @click="onClose">
              Cancel
            </Button>

            <Button
              class="dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white"
              :disabled="selectedComponents.size === 0"
              @click="handleAddSelected"
            >
              Add Selected ({{ selectedComponents.size }})
            </Button>
          </div>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>