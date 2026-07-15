<script>
import Dialog from "../ui/dialog.vue";
import DialogContent from "../ui/dialogContent.vue";
import DialogDescription from "../ui/dialogDescription.vue";
import DialogHeader from "../ui/dialogHeader.vue";
import DialogTitle from "../ui/dialogTitle.vue";
import Button from "../ui/button.vue";
import Input from "../ui/input.vue";    
import Table from "../ui/table.vue";
import TableBody from "../ui/tableBody.vue";
import TableCell from "../ui/tableCell.vue";
import TableHead from "../ui/tableHead.vue";
import TableHeader from "../ui/tableHeader.vue";
import TableRow from "../ui/tableRow.vue";
import Select from "../ui/select.vue";
import SelectContent from "../ui/selectContent.vue";
import SelectItem from "../ui/selectItem.vue";
import SelectTrigger from "../ui/selectTrigger.vue";
import SelectValue from "../ui/selectValue.vue";
import Badge from "../ui/badge.vue";
import ImageWithFallback from "../figma/ImageWithFallBack.vue";
import { Search, ImageIcon } from "lucide-vue-next";

export default {
  name: "ComboItemSelectorDialog",
  components: {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
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
    Search,
    ImageIcon,
    ImageWithFallback,
  },
  props: {
    menuItems: {
      type: Array,
      required: true,
    },
    excludeId: {
      type: String,
      required: false,
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
    };
  },
  computed: {
    comboItems() {
      return (this.menuItems || []).filter((item) => item.comboItem === "Yes");
    },
    filteredItems() {
      return this.comboItems.filter((item) => {
        if (this.excludeId && item.id === this.excludeId) return false;

        const matchesSearch =
          (item.name || "").toLowerCase().includes((this.searchQuery || "").toLowerCase()) ||
          (item.description || "")
            .toLowerCase()
            .includes((this.searchQuery || "").toLowerCase());

        const matchesCategory =
          this.categoryFilter === "all" || item.category === this.categoryFilter;

        return matchesSearch && matchesCategory;
      });
    },
  },
};
</script>

<template>
  <Dialog :open="true" :onOpenChange="onClose">
    <DialogContent
      className="max-w-5xl max-h-[85vh] flex flex-col"
      aria-describedby="combo-item-selector-description"
    >
      <DialogHeader>
        <DialogTitle>Select Combo Item</DialogTitle>
        <DialogDescription id="combo-item-selector-description">
          Choose a combo item to add to this menu item. Only items with "Combo Item" set to "Yes" are shown.
        </DialogDescription>
      </DialogHeader>

      <!-- Filters -->
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search combo items..."
            className="pl-9"
            :value="searchQuery"
            @input="searchQuery = $event?.target?.value"
          />
        </div>

        <Select v-model="categoryFilter">
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="Main">Main</SelectItem>
            <SelectItem value="Starter">Starter</SelectItem>
            <SelectItem value="Sides">Sides</SelectItem>
            <SelectItem value="Snack">Snack</SelectItem>
            <SelectItem value="Desert">Desert</SelectItem>
            <SelectItem value="Beer">Beer</SelectItem>
            <SelectItem value="Wine">Wine</SelectItem>
            <SelectItem value="Champagne">Champagne</SelectItem>
            <SelectItem value="Sparkling">Sparkling</SelectItem>
            <SelectItem value="Soft Drink">Soft Drink</SelectItem>
            <SelectItem value="Water">Water</SelectItem>
            <SelectItem value="Menu">Menu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Results Table -->
      <div className="flex-1 overflow-auto border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Picture</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Cost per Piece</TableHead>
              <TableHead className="text-right">Base Price</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow v-if="filteredItems.length === 0">
              <TableCell :colSpan="8" className="text-center text-gray-500 py-8">
                {{
                  comboItems.length === 0
                    ? 'No combo items available. Set "Combo Item" to "Yes" on menu items to use them here.'
                    : 'No combo items match your search criteria.'
                }}
              </TableCell>
            </TableRow>

            <TableRow v-else v-for="item in filteredItems" :key="item.id">
              <TableCell>
                <ImageWithFallback
                  v-if="item.picture"
                  :src="item.picture"
                  :alt="item.name"
                  className="w-12 h-12 rounded object-cover"
                />
                <div
                  v-else
                  className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center"
                >
                  <ImageIcon className="w-6 h-6 text-gray-400" />
                </div>
              </TableCell>

              <TableCell>
                <div>
                  <div>{{ item.name }}</div>
                  <div v-if="item.description" className="text-xs text-gray-500 line-clamp-1">
                    {{ item.description }}
                  </div>
                </div>
              </TableCell>

              <TableCell>
                <Badge variant="outline">{{ item.category }}</Badge>
              </TableCell>

              <TableCell>
                <Badge variant="secondary">{{ item.type || "Food" }}</Badge>
              </TableCell>

              <TableCell className="text-right">
                €{{ item.totalCost.toFixed(2) }}
              </TableCell>

              <TableCell className="text-right">
                €{{ item.basePrice.toFixed(2) }}
              </TableCell>

              <TableCell className="text-right">
                <span :class="item.margin < 0 ? 'text-red-600' : 'text-green-600'">
                  {{ item.margin.toFixed(1) }}%
                </span>
              </TableCell>

              <TableCell className="text-right">
                <Button
                  size="sm"
                  @click="
                    () => {
                      onSelect(item);
                      onClose();
                    }
                  "
                >
                  Add
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </DialogContent>
  </Dialog>
</template>