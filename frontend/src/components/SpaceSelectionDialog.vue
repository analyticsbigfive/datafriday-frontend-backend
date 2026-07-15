<template>
  <Dialog
    :open="open"
    :onOpenChange="handleCancel"
  >
    <DialogContent
      class="max-w-2xl flex flex-col max-h-[90vh]"
      aria-describedby="space-selection-description"
    >
      <DialogHeader>
        <DialogTitle>Select Spaces</DialogTitle>
        <DialogDescription id="space-selection-description">
          Choose which spaces this menu item will be available in
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto space-y-4">
        <!-- Filter Section -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              class="gap-2"
              @click="showFilters = !showFilters"
            >
              <Filter class="w-4 h-4" />
              Filters
              <Badge
                v-if="hasActiveFilters"
                variant="secondary"
                class="ml-1"
              >
                Active
              </Badge>
            </Button>

            <Button
              v-if="hasActiveFilters"
              variant="ghost"
              size="sm"
              class="gap-2"
              @click="handleClearFilters"
            >
              <X class="w-4 h-4" />
              Clear Filters
            </Button>
          </div>

          <div
            v-if="showFilters"
            class="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          >
            <div class="grid grid-cols-2 gap-4">
              <!-- Space Type Filter -->
              <div class="space-y-2">
                <Label for="filter-space-type">Space Type</Label>
                <Select
                  :value="filterSpaceType"
                  :onValueChange="val => (filterSpaceType = val)"
                >
                  <SelectTrigger id="filter-space-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem
                      v-for="type in uniqueSpaceTypes"
                      :key="type"
                      :value="type"
                    >
                      {{ type }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Department Filter -->
              <div class="space-y-2">
                <Label for="filter-department">Department</Label>
                <Select
                  :value="filterDepartment"
                  :onValueChange="val => (filterDepartment = val)"
                >
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
                      {{ dept.toString().padStart(2, '0') }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <!-- Capacity Range Filter -->
            <div
              v-if="maxCapacity > 0"
              class="space-y-3"
            >
              <Label>Capacity Range</Label>
              <div class="px-2">
                <Slider
                  :min="minCapacity"
                  :max="maxCapacity"
                  :step="1000"
                  :value="capacityRange"
                  :onValueChange="value => (capacityRange = value)"
                  class="w-full"
                />
              </div>
              <div class="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>{{ capacityRange[0].toLocaleString() }}</span>
                <span>{{ capacityRange[1].toLocaleString() }}</span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <!-- Results Summary and Select All -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              v-if="filteredSpaces.length > 0"
              class="flex items-center space-x-2"
            >
              <Checkbox
                id="select-all"
                :model-value="allFilteredSelected"
                :indeterminate="someFilteredSelected"
                @update:modelValue="checked => { checked ? handleSelectAll() : handleDeselectAll() }"
              />
              <Label
                for="select-all"
                class="cursor-pointer text-sm font-medium"
              >
                Select All
              </Label>
            </div>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Showing {{ filteredSpaces.length }} of {{ spaces.length }}
              space<span v-if="spaces.length !== 1">s</span>
            </span>
          </div>
          <span class="text-sm text-gray-600 dark:text-gray-400">
            {{ tempSelectedIds.length }} selected
          </span>
        </div>

        <!-- Spaces List -->
        <div class="space-y-3 pb-2">
          <div
            v-if="spaces.length === 0"
            class="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400"
          >
            <Building2 class="w-12 h-12 mb-2 opacity-50" />
            <p class="text-sm text-center">No spaces available</p>
            <p class="text-xs text-center mt-1">Create a space first</p>
          </div>

          <div
            v-else-if="filteredSpaces.length === 0"
            class="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400"
          >
            <Filter class="w-12 h-12 mb-2 opacity-50" />
            <p class="text-sm text-center">No spaces match your filters</p>
            <Button
              variant="outline"
              size="sm"
              class="mt-2"
              @click="handleClearFilters"
            >
              Clear Filters
            </Button>
          </div>

          <template v-else>
            <!-- Ici, dans le script Vue, tu peux préparer:
                 - sortedSelectedSpaces: espaces filtrés et sélectionnés, triés par name
                 - sortedUnselectedSpaces: espaces filtrés non sélectionnés, triés par name
                 Pour le template, on part du principe que tu as ces deux tableaux. -->

            <!-- Sold at Section (Selected Spaces) -->
            <div
              v-if="sortedSelectedSpaces.length > 0"
              class="space-y-2"
            >
              <div class="text-sm font-semibold text-gray-700 dark:text-gray-300 px-1">
                Sold at ({{ sortedSelectedSpaces.length }})
              </div>
              <div
                v-for="space in sortedSelectedSpaces"
                :key="space.id"
                class="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Checkbox
                  :id="`space-${space.id}`"
                  :model-value="tempSelectedIds.includes(space.id)"
                  @update:modelValue="() => handleToggleSpace(space.id)"
                  class="mt-0.5"
                />
                <div class="flex-1 min-w-0">
                  <Label
                    :for="`space-${space.id}`"
                    class="cursor-pointer block"
                  >
                    <div class="font-medium">{{ space.name }}</div>
                    <div class="flex flex-wrap gap-2 mt-1">
                      <Badge
                        v-if="space.spaceType"
                        variant="outline"
                        class="text-xs"
                      >
                        {{ space.spaceType }}
                      </Badge>
                      <Badge
                        v-if="space.department"
                        variant="outline"
                        class="text-xs"
                      >
                        Dept. {{ space.department.toString().padStart(2, '0') }}
                      </Badge>
                      <Badge
                        v-if="space.maxCapacity"
                        variant="outline"
                        class="text-xs"
                      >
                        {{ space.maxCapacity.toLocaleString() }} capacity
                      </Badge>
                      <Badge
                        v-if="getPriceForSpace(space.id) !== undefined"
                        variant="outline"
                        class="text-xs"
                      >
                        €{{ getPriceForSpace(space.id).toFixed(2) }} base price
                      </Badge>
                    </div>
                  </Label>
                </div>
              </div>
            </div>

            <!-- Not Sold at Section (Unselected Spaces) -->
            <div
              v-if="sortedUnselectedSpaces.length > 0"
              class="space-y-2"
            >
              <div
                v-if="sortedSelectedSpaces.length > 0"
                class="pt-2"
              />
              <div class="text-sm font-semibold text-gray-700 dark:text-gray-300 px-1">
                Not Sold at ({{ sortedUnselectedSpaces.length }})
              </div>
              <div
                v-for="space in sortedUnselectedSpaces"
                :key="space.id"
                class="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Checkbox
                  :id="`space-${space.id}`"
                  :model-value="tempSelectedIds.includes(space.id)"
                  @update:modelValue="() => handleToggleSpace(space.id)"
                  class="mt-0.5"
                />
                <div class="flex-1 min-w-0">
                  <Label
                    :for="`space-${space.id}`"
                    class="cursor-pointer block"
                  >
                    <div class="font-medium">{{ space.name }}</div>
                    <div class="flex flex-wrap gap-2 mt-1">
                      <Badge
                        v-if="space.spaceType"
                        variant="outline"
                        class="text-xs"
                      >
                        {{ space.spaceType }}
                      </Badge>
                      <Badge
                        v-if="space.department"
                        variant="outline"
                        class="text-xs"
                      >
                        Dept. {{ space.department.toString().padStart(2, '0') }}
                      </Badge>
                      <Badge
                        v-if="space.maxCapacity"
                        variant="outline"
                        class="text-xs"
                      >
                        {{ space.maxCapacity.toLocaleString() }} capacity
                      </Badge>
                      <Badge
                        v-if="getPriceForSpace(space.id) !== undefined"
                        variant="outline"
                        class="text-xs"
                      >
                        €{{ getPriceForSpace(space.id).toFixed(2) }} base price
                      </Badge>
                    </div>
                  </Label>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <DialogFooter class="flex-shrink-0">
        <Button
          variant="outline"
          @click="handleCancel"
        >
          Cancel
        </Button>
        <Button @click="handleSave">
          Save Selection ({{ tempSelectedIds.length }})
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script>

import Dialog from '../ui/dialog.vue'
import DialogContent from '../ui/dialogContent.vue'
import DialogHeader from '../ui/dialogHeader.vue'
import DialogTitle from '../ui/dialogTitle.vue'
import DialogDescription from '../ui/dialogDescription.vue'
import DialogFooter from '../ui/dialogFooter.vue'
import Button from '../ui/button.vue'
import Select from '../ui/select.vue'   
import SelectTrigger from '../ui/selectTrigger.vue'
import SelectContent from '../ui/selectContent.vue'
import SelectItem from '../ui/selectItem.vue'
import Label from '../ui/label.vue'
import Checkbox from '../ui/checkbox.vue'
import Slider from '../ui/slider.vue'
import Badge from '../ui/badge.vue'
import Separator from '../ui/separator.vue'
import { Building2, Filter, X } from 'lucide-vue-next'
export default {
  name: 'SpaceSelectionDialog',
  components: {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Button,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    Label,
    Checkbox,
    Slider,
    Badge,
    Separator,
    Building2,
    Filter,
    X
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
    onSave: {
      type: Function,
      required: true,
    },
    basePrice: {
      type: Number,
      required: false,
    },
    spaceSpecificPrices: {
      type: Array,
      required: false,
      // [{ spaceIds: string[], price: number }]
    },
  },

  data() {
    return {
      tempSelectedIds: [...this.selectedSpaceIds],

      // Filtres
      filterSpaceType: 'all',
      filterDepartment: 'all',
      capacityRange: [0, 100000],
      showFilters: false,
    };
  },

  computed: {
    // Capacités min/max dérivées des espaces
    capacityStats() {
      const capacities = this.spaces
        .map(s => s.maxCapacity)
        .filter(c => c !== undefined && c > 0);

      if (capacities.length === 0) {
        return { minCapacity: 0, maxCapacity: 100000 };
      }

      return {
        minCapacity: Math.min(...capacities),
        maxCapacity: Math.max(...capacities),
      };
    },

    minCapacity() {
      return this.capacityStats.minCapacity;
    },

    maxCapacity() {
      return this.capacityStats.maxCapacity;
    },

    // Types d’espace et départements uniques
    uniqueSpaceTypes() {
      const types = new Set();
      this.spaces.forEach(space => {
        if (space.spaceType) {
          types.add(space.spaceType);
        }
      });
      return Array.from(types).sort();
    },

    uniqueDepartments() {
      const depts = new Set();
      this.spaces.forEach(space => {
        if (space.department) {
          depts.add(space.department);
        }
      });
      return Array.from(depts).sort((a, b) => a - b);
    },

    // Espaces filtrés
    filteredSpaces() {
      return this.spaces.filter(space => {
        // Space type
        if (this.filterSpaceType !== 'all' && space.spaceType !== this.filterSpaceType) {
          return false;
        }

        // Department
        if (
          this.filterDepartment !== 'all' &&
          space.department?.toString() !== this.filterDepartment
        ) {
          return false;
        }

        // Capacity
        if (space.maxCapacity) {
          if (
            space.maxCapacity < this.capacityRange[0] ||
            space.maxCapacity > this.capacityRange[1]
          ) {
            return false;
          }
        }

        return true;
      });
    },

    // Sélection globale sur la liste filtrée
    allFilteredSelected() {
      return (
        this.filteredSpaces.length > 0 &&
        this.filteredSpaces.every(space => this.tempSelectedIds.includes(space.id))
      );
    },

    someFilteredSelected() {
      const anySelected = this.filteredSpaces.some(space =>
        this.tempSelectedIds.includes(space.id),
      );
      return anySelected && !this.allFilteredSelected;
    },

    // Indicateur de filtres actifs
    hasActiveFilters() {
      return (
        this.filterSpaceType !== 'all' ||
        this.filterDepartment !== 'all' ||
        this.capacityRange[0] !== this.minCapacity ||
        this.capacityRange[1] !== this.maxCapacity
      );
    },

    // Groupes triés "Sold at" / "Not sold at"
    sortedSelectedSpaces() {
      const selectedSpaces = this.filteredSpaces.filter(space =>
        this.tempSelectedIds.includes(space.id),
      );
      return [...selectedSpaces].sort((a, b) => a.name.localeCompare(b.name));
    },

    sortedUnselectedSpaces() {
      const unselectedSpaces = this.filteredSpaces.filter(
        space => !this.tempSelectedIds.includes(space.id),
      );
      return [...unselectedSpaces].sort((a, b) => a.name.localeCompare(b.name));
    },
  },

  watch: {
    // Quand le dialog s’ouvre, on reset la plage de capacité et la sélection temporaire
    open(val) {
      if (val) {
        this.capacityRange = [this.minCapacity, this.maxCapacity];
        this.tempSelectedIds = [...this.selectedSpaceIds];
      }
    },

    // Si la sélection externe change pendant que le dialog est ouvert
    selectedSpaceIds(newVal) {
      if (this.open) {
        this.tempSelectedIds = [...newVal];
      }
    },

    // Si les capacités min/max changent (changement de spaces), on ajuste la plage si ouvert
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
  },

  methods: {
    // Prix pour un espace donné (base + overrides spécifiques)
    getPriceForSpace(spaceId) {
      if (this.basePrice == null && !this.spaceSpecificPrices) return undefined;

      const specificPrice = this.spaceSpecificPrices?.find(ssp =>
        ssp.spaceIds.includes(spaceId),
      );

      return specificPrice ? specificPrice.price : this.basePrice;
    },

    handleToggleSpace(spaceId) {
      if (this.tempSelectedIds.includes(spaceId)) {
        this.tempSelectedIds = this.tempSelectedIds.filter(id => id !== spaceId);
      } else {
        this.tempSelectedIds = [...this.tempSelectedIds, spaceId];
      }
    },

    handleSelectAll() {
      const filteredIds = this.filteredSpaces.map(space => space.id);
      const allIds = new Set([...this.tempSelectedIds, ...filteredIds]);
      this.tempSelectedIds = Array.from(allIds);
    },

    handleDeselectAll() {
      const filteredIds = new Set(this.filteredSpaces.map(space => space.id));
      this.tempSelectedIds = this.tempSelectedIds.filter(id => !filteredIds.has(id));
    },

    handleSave() {
      this.onSave(this.tempSelectedIds);
      this.onClose();
    },

    handleCancel() {
      // On remet la sélection temporaire à l’état externe, puis on ferme
      this.tempSelectedIds = [...this.selectedSpaceIds];
      this.onClose();
    },

    handleClearFilters() {
      this.filterSpaceType = 'all';
      this.filterDepartment = 'all';
      this.capacityRange = [this.minCapacity, this.maxCapacity];
    },
  },
};
</script>