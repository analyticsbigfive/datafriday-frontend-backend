<script>

import Dialog from "../ui/dialog.vue";
import DialogContent from "../ui/dialogContent.vue";
import DialogDescription from "../ui/dialogDescription.vue"; 
import DialogFooter from "../ui/dialogFooter.vue";
import DialogHeader from "../ui/dialogHeader.vue";
import DialogTitle from "../ui/dialogTitle.vue";
import Button from "../ui/button.vue";
import { Building2, Filter, X } from "lucide-vue-next";
import Badge from "../ui/badge.vue";
import Checkbox from "../ui/checkbox.vue";
import Label from "../ui/label.vue";
import Select from "../ui/select.vue";
import SelectContent from "../ui/selectContent.vue";
import SelectItem from "../ui/selectItem.vue";
import SelectTrigger from "../ui/selectTrigger.vue";
import SelectValue from "../ui/selectValue.vue";
import Slider from "../ui/slider.vue";
import Separator from "../ui/separator.vue";

export default {
  name: "SpacePricingDialog",
  components: {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    Checkbox,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Slider,
    Building2,
    Filter,
    X,
    Badge,
    Separator,
  },
  props: {
    open: {
      type: Boolean,
      required: true,
    },
    onClose: {
      type: Function,
      required: true,
    },
    spaces: {
      type: Array,
      required: true,
    },
    selectedSpaceIds: {
      type: Array,
      required: true,
    },
    availableSpaceIds: {
      type: Array,
      required: true,
    },
    onSave: {
      type: Function,
      required: true,
    },
    isDefaultPrice: {
      type: Boolean,
      required: true,
    },
  },
  data() {
    return {
      tempSelectedIds: [...(this.selectedSpaceIds || [])],

      filterSpaceType: "all",
      filterDepartment: "all",
      capacityRange: [0, 100000],
      showFilters: false,
    };
  },
  computed: {
    // Get available spaces (for display purposes)
    availableSpaces() {
      return (this.spaces || []).filter((space) => this.availableSpaceIds.includes(space.id));
    },

    // Calculate min and max capacity from available spaces
    minCapacity() {
      const capacities = this.availableSpaces
        .map((s) => s.maxCapacity)
        .filter((c) => c !== undefined && c > 0);

      if (capacities.length === 0) return 0;
      return Math.min(...capacities);
    },
    maxCapacity() {
      const capacities = this.availableSpaces
        .map((s) => s.maxCapacity)
        .filter((c) => c !== undefined && c > 0);

      if (capacities.length === 0) return 100000;
      return Math.max(...capacities);
    },

    // Get unique space types and departments
    uniqueSpaceTypes() {
      const types = new Set();
      this.availableSpaces.forEach((space) => {
        if (space.spaceType) types.add(space.spaceType);
      });
      return Array.from(types).sort();
    },
    uniqueDepartments() {
      const depts = new Set();
      this.availableSpaces.forEach((space) => {
        if (space.department) depts.add(space.department);
      });
      return Array.from(depts).sort((a, b) => a - b);
    },

    // Filter spaces based on selected filters
    filteredSpaces() {
      return this.availableSpaces.filter((space) => {
        if (this.filterSpaceType !== "all" && space.spaceType !== this.filterSpaceType) {
          return false;
        }

        if (
          this.filterDepartment !== "all" &&
          (space.department ? space.department.toString() : "") !== this.filterDepartment
        ) {
          return false;
        }

        if (space.maxCapacity) {
          if (space.maxCapacity < this.capacityRange[0] || space.maxCapacity > this.capacityRange[1]) {
            return false;
          }
        }

        return true;
      });
    },

    allFilteredSelected() {
      return (
        this.filteredSpaces.length > 0 &&
        this.filteredSpaces.every((space) => this.tempSelectedIds.includes(space.id))
      );
    },

    someFilteredSelected() {
      return (
        this.filteredSpaces.some((space) => this.tempSelectedIds.includes(space.id)) &&
        !this.allFilteredSelected
      );
    },

    hasActiveFilters() {
      return (
        this.filterSpaceType !== "all" ||
        this.filterDepartment !== "all" ||
        this.capacityRange[0] !== this.minCapacity ||
        this.capacityRange[1] !== this.maxCapacity
      );
    },
  },
  watch: {
    // Reset capacity range when dialog opens or spaces change
    open: {
      handler(newVal) {
        if (newVal) {
          this.capacityRange = [this.minCapacity, this.maxCapacity];
        }
      },
      immediate: true,
    },
    minCapacity() {
      if (this.open) {
        this.capacityRange = [this.minCapacity, this.maxCapacity];
      }
    },
    maxCapacity() {
      if (this.open) {
        this.capacityRange = [this.minCapacity, this.maxCapacity];
      }
    },

    // Update temp selection when dialog opens with new selectedSpaceIds
    selectedSpaceIds: {
      handler(newVal) {
        if (this.open) {
          this.tempSelectedIds = [...(newVal || [])];
        }
      },
      deep: true,
      immediate: true,
    },
  },
  methods: {
    handleToggleSpace(spaceId) {
      const prev = this.tempSelectedIds;

      if (prev.includes(spaceId)) {
        this.tempSelectedIds = prev.filter((id) => id !== spaceId);
      } else {
        this.tempSelectedIds = [...prev, spaceId];
      }
    },

    handleSelectAll() {
      const filteredIds = this.filteredSpaces.map((space) => space.id);
      const allIds = new Set([...(this.tempSelectedIds || []), ...filteredIds]);
      this.tempSelectedIds = Array.from(allIds);
    },

    handleDeselectAll() {
      const filteredIds = new Set(this.filteredSpaces.map((space) => space.id));
      this.tempSelectedIds = (this.tempSelectedIds || []).filter((id) => !filteredIds.has(id));
    },

    handleSave() {
      this.onSave(this.tempSelectedIds);
      this.onClose();
    },

    handleCancel() {
      this.tempSelectedIds = [...(this.selectedSpaceIds || [])];
      this.onClose();
    },

    handleClearFilters() {
      this.filterSpaceType = "all";
      this.filterDepartment = "all";
      this.capacityRange = [this.minCapacity, this.maxCapacity];
    },
  },
};
</script>

<template>
  <Dialog :open="open" :onOpenChange="handleCancel">
    <DialogContent
      className="max-w-2xl flex flex-col max-h-[90vh]"
      aria-describedby="space-pricing-description"
    >
      <DialogHeader>
        <DialogTitle>
          {{ isDefaultPrice ? "Select Spaces for Default Price" : "Select Spaces for This Price" }}
        </DialogTitle>
        <DialogDescription id="space-pricing-description">
          {{
            isDefaultPrice
              ? "Choose which spaces use the default base price"
              : "Choose which spaces use this specific price"
          }}
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto space-y-4">
        <!-- Filter Section -->
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              @click="showFilters = !showFilters"
            >
              <Filter className="w-4 h-4" />
              Filters
              <Badge v-if="hasActiveFilters" variant="secondary" className="ml-1">
                Active
              </Badge>
            </Button>

            <Button
              v-if="hasActiveFilters"
              variant="ghost"
              size="sm"
              className="gap-2"
              @click="handleClearFilters"
            >
              <X className="w-4 h-4" />
              Clear Filters
            </Button>
          </div>

          <div v-if="showFilters" className="space-y-4 p-4 border rounded-lg bg-gray-50">
            <div className="grid grid-cols-2 gap-4">
              <!-- Space Type Filter -->
              <div className="space-y-2">
                <Label for="filter-space-type">Space Type</Label>
                <Select v-model="filterSpaceType">
                  <SelectTrigger id="filter-space-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem v-for="type in uniqueSpaceTypes" :key="type" :value="type">
                      {{ type }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Department Filter -->
              <div className="space-y-2">
                <Label for="filter-department">Department</Label>
                <Select v-model="filterDepartment">
                  <SelectTrigger id="filter-department">
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    <SelectItem
                      v-for="dept in uniqueDepartments"
                      :key="dept"
                      :value="dept.toString()"
                    >
                      {{ dept.toString().padStart(2, "0") }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <!-- Capacity Range Filter -->
            <div v-if="maxCapacity > 0" className="space-y-3">
              <Label>Capacity Range</Label>
              <div className="px-2">
                <Slider
                  :min="minCapacity"
                  :max="maxCapacity"
                  :step="1000"
                  :value="capacityRange"
                  className="w-full"
                  @valueChange="(value) => (capacityRange = value)"
                />
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>{{ capacityRange[0].toLocaleString() }}</span>
                <span>{{ capacityRange[1].toLocaleString() }}</span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <!-- Results Summary and Select All -->
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div v-if="filteredSpaces.length > 0" className="flex items-center space-x-2">
              <Checkbox
                id="select-all"
                :checked="allFilteredSelected"
                :indeterminate="someFilteredSelected"
                @update:checked="
                  (checked) => {
                    if (checked) {
                      handleSelectAll();
                    } else {
                      handleDeselectAll();
                    }
                  }
                "
              />
              <Label for="select-all" className="cursor-pointer text-sm font-medium">
                Select All
              </Label>
            </div>

            <span className="text-sm text-gray-600">
              Showing {{ filteredSpaces.length }} of {{ availableSpaces.length }} space{{
                availableSpaces.length !== 1 ? "s" : ""
              }}
            </span>
          </div>

          <span className="text-sm text-gray-600">
            {{ tempSelectedIds.length }} selected
          </span>
        </div>

        <!-- Spaces List -->
        <div className="space-y-3 pb-2">
          <div
            v-if="availableSpaces.length === 0"
            className="flex flex-col items-center justify-center py-8 text-gray-500"
          >
            <Building2 className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-sm text-center">No spaces available</p>
            <p className="text-xs text-center mt-1">All spaces are assigned to other prices</p>
          </div>

          <div
            v-else-if="filteredSpaces.length === 0"
            className="flex flex-col items-center justify-center py-8 text-gray-500"
          >
            <Filter className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-sm text-center">No spaces match your filters</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              @click="handleClearFilters"
            >
              Clear Filters
            </Button>
          </div>

          <div
            v-else
            v-for="space in filteredSpaces"
            :key="space.id"
            className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
          >
            <Checkbox
              :id="`space-${space.id}`"
              className="mt-0.5"
              :checked="tempSelectedIds.includes(space.id)"
              @update:checked="() => handleToggleSpace(space.id)"
            />

            <div className="flex-1 min-w-0">
              <Label :for="`space-${space.id}`" className="cursor-pointer block">
                <div className="font-medium">{{ space.name }}</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge v-if="space.spaceType" variant="outline" className="text-xs">
                    {{ space.spaceType }}
                  </Badge>

                  <Badge v-if="space.department" variant="outline" className="text-xs">
                    Dept. {{ space.department.toString().padStart(2, "0") }}
                  </Badge>

                  <Badge v-if="space.maxCapacity" variant="outline" className="text-xs">
                    {{ space.maxCapacity.toLocaleString() }} capacity
                  </Badge>
                </div>
              </Label>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="flex-shrink-0">
        <Button variant="outline" @click="handleCancel">
          Cancel
        </Button>
        <Button @click="handleSave">
          Save Selection ({{ tempSelectedIds.length }})
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>