<template>
  <div class="space-y-6">
    <Card class="p-6 dark:bg-gray-800 dark:border-gray-700">
      <div class="mb-4">
        <div
          class="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity"
          @click="setIsMenuMappingTipExpanded(!isMenuMappingTipExpanded)"
        >
          <h3 class="text-lg font-semibold dark:text-gray-100">Menu Mapping</h3>

          <ChevronDown
            :class="[
              'h-5 w-5 text-gray-600 dark:text-gray-400 transition-transform duration-200',
              isMenuMappingTipExpanded ? 'rotate-180' : ''
            ]"
          />
        </div>
      </div>

      <div
        v-if="isMenuMappingTipExpanded"
        class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg"
      >
        <p class="text-sm text-blue-800 dark:text-blue-300">
          Map F&amp;B items from your data to Menu Items in your library.
        </p>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-12">
        <Loader2 class="h-8 w-8 animate-spin text-blue-600" />
        <span class="ml-3">Loading menu mapping data...</span>
      </div>

      <template v-else>
        <!-- Staged Changes Alert -->
        <div
          v-if="Object.keys(stagedChanges).length > 0"
          class="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-semibold text-yellow-900 dark:text-yellow-100">
                {{ Object.keys(stagedChanges).length }} menu item(s) will be updated
              </div>
              <div class="text-sm text-yellow-700 dark:text-yellow-300">
                Changes will be applied when you complete the wizard
              </div>
            </div>

            <Button
              size="sm"
              :disabled="applyingChanges"
              @click="onApplyChanges"
            >
              <template v-if="applyingChanges">
                <Loader2 class="h-4 w-4 animate-spin mr-2" />
                Applying {{ applyProgress.current }}/{{ applyProgress.total }}
              </template>
              <template v-else>
                Apply Now
              </template>
            </Button>
          </div>
        </div>

        <!-- Search Filter -->
        <div class="mb-4">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search F&B items..."
              :value="searchTerm"
              class="pl-10"
              @input="(e) => setSearchTerm(e.target.value)"
            />
          </div>
        </div>

        <!-- F&B Items List -->
        <div class="space-y-6">
          <!-- Similar Menu Item Found Section -->
          <div v-if="mappedItems.length > 0 || unmappedWithSuggestions.length > 0">
            <div class="font-semibold text-green-900 dark:text-green-100 mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 rounded-lg">
              <div class="flex items-center gap-2 p-2 rounded-lg">
                <CheckCircle class="h-5 w-5" />
                Similar Menu Item Found ({{ mappedItems.length + unmappedWithSuggestions.length }})
              </div>

              <Button
                v-if="unmappedWithSuggestions.length > 0"
                variant="outline"
                size="sm"
                class="flex-1 text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-950/30 w-full sm:w-auto"
                @click="mapAllSuggestions"
              >
                Map All Suggestions ({{ unmappedWithSuggestions.length }})
              </Button>
            </div>

            <div v-if="isSimilarSectionExpanded" class="space-y-2">
              <div
                v-for="item in itemsWithSuggestions"
                :key="item.item"
                :class="[
                  'border rounded-lg p-4',
                  menuMappings[item.item]
                    ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                ]"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1">
                    <div class="font-semibold text-gray-900 dark:text-gray-100">{{ item.item }}</div>

                    <!-- mapped -->
                    <div v-if="menuMappings[item.item]" class="flex items-center gap-2 mt-2">
                      <span class="text-sm text-green-700 dark:text-green-300">
                        Mapped to:
                      </span>

                      <span class="text-sm font-semibold text-green-900 dark:text-green-100">
                        {{
                          (menuItems.find((m) => m.id === menuMappings[item.item]) || {}).name
                        }}
                      </span>

                      <span
                        v-if="stagedChanges[menuMappings[item.item]]"
                        class="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-1 rounded"
                      >
                        Will be updated
                      </span>
                    </div>

                    <!-- unmapped -->
                    <div v-else class="mt-2">
                      <Select
                        :value="menuMappings[item.item] || ((getSuggestedMenuItem(item.item) || {}).id || '')"
                        @update:value="(value) => handleMenuItemSelect(item.item, value)"
                      >
                        <SelectTrigger class="w-full">
                          <SelectValue placeholder="Select menu item..." />
                        </SelectTrigger>

                        <SelectContent>
                          <div class="p-2 border-b dark:border-gray-700">
                            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Suggested:</div>

                            <SelectItem
                              v-if="getSuggestedMenuItem(item.item)"
                              :value="getSuggestedMenuItem(item.item).id"
                            >
                              ⭐ {{ getSuggestedMenuItem(item.item).name }}
                            </SelectItem>
                          </div>

                          <div class="p-2 border-b dark:border-gray-700">
                            <SelectItem value="__create__" class="text-blue-600 dark:text-blue-400 font-semibold">
                              + Create New Menu Item
                            </SelectItem>
                          </div>

                          <div class="p-2 border-b dark:border-gray-700">
                            <div class="relative">
                              <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                              <Input
                                placeholder="Search menu items..."
                                :value="menuItemSearchTerm"
                                class="pl-8 h-8 text-sm"
                                @input="(e) => setMenuItemSearchTerm(e.target.value)"
                                @click.stop
                                @pointerdown.stop
                                @keydown.stop
                              />
                            </div>
                          </div>

                          <ScrollArea class="h-48">
                            <SelectItem
                              v-for="menuItem in sortedMenuItems
                                .filter((m) => m.id !== ((getSuggestedMenuItem(item.item) || {}).id))
                                .filter((m) => m.name.toLowerCase().includes(menuItemSearchTerm.toLowerCase()))"
                              :key="menuItem.id"
                              :value="menuItem.id"
                            >
                              {{ menuItem.name }}
                            </SelectItem>
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    v-if="menuMappings[item.item]"
                    variant="ghost"
                    size="sm"
                    @click="onUnmapMenuItem(item.item)"
                  >
                    <X class="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- No Similar Menu Item Found Section -->
          <div v-if="unmappedWithoutSuggestions.length > 0">
            <div class="font-semibold text-gray-700 dark:text-gray-300 mb-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-2 rounded-lg">
              <div
                class="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded-lg transition-colors flex-1"
                @click="setIsNoSimilarSectionExpanded(!isNoSimilarSectionExpanded)"
              >
                <ChevronDown v-if="isNoSimilarSectionExpanded" class="h-5 w-5" />
                <ChevronRight v-else class="h-5 w-5" />
                No Similar Menu Item Found ({{ unmappedWithoutSuggestions.length }})
              </div>

              <Button
                variant="outline"
                size="sm"
                class="flex-1 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 w-full sm:w-auto"
                @click="createNewItemForAll"
              >
                Create New Item for All
              </Button>
            </div>

            <div v-if="isNoSimilarSectionExpanded" class="space-y-2">
              <div
                v-for="item in unmappedWithoutSuggestions"
                :key="item.item"
                class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1">
                    <div class="font-semibold text-gray-900 dark:text-gray-100">{{ item.item }}</div>

                    <div class="mt-2">
                      <Select value="" @update:value="(value) => handleMenuItemSelect(item.item, value)">
                        <SelectTrigger class="w-full">
                          <SelectValue placeholder="Select menu item..." />
                        </SelectTrigger>

                        <SelectContent>
                          <div class="p-2 border-b dark:border-gray-700">
                            <SelectItem value="__create__" class="text-blue-600 dark:text-blue-400 font-semibold">
                              + Create New Menu Item
                            </SelectItem>
                          </div>

                          <div class="p-2 border-b dark:border-gray-700">
                            <div class="relative">
                              <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                              <Input
                                placeholder="Search menu items..."
                                :value="menuItemSearchTerm"
                                class="pl-8 h-8 text-sm"
                                @input="(e) => setMenuItemSearchTerm(e.target.value)"
                                @click.stop
                                @pointerdown.stop
                                @keydown.stop
                              />
                            </div>
                          </div>

                          <ScrollArea class="h-48">
                            <SelectItem
                              v-for="menuItem in sortedMenuItems
                                .filter((m) => m.name.toLowerCase().includes(menuItemSearchTerm.toLowerCase()))"
                              :key="menuItem.id"
                              :value="menuItem.id"
                            >
                              {{ menuItem.name }}
                            </SelectItem>
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="filteredItems.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>No F&amp;B items found matching your search</p>
          </div>
        </div>
      </template>
    </Card>

    <!-- Create New Menu Item Dialog -->
    <Dialog :open="createDialogOpen" @update:open="setCreateDialogOpen">
      <DialogContent class="sm:max-w-[425px]" aria-describedby="create-menu-item-description">
        <DialogHeader>
          <DialogTitle>Create New Menu Item</DialogTitle>
          <DialogDescription id="create-menu-item-description">
            Enter the details for the new menu item.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="name">Name</Label>
            <Input
              id="name"
              :value="newItemName"
              placeholder="Enter menu item name"
              class="col-span-3"
              @input="(e) => setNewItemName(e.target.value)"
            />
          </div>

          <TypeCategorySelector
            :typeId="newItemTypeId"
            :categoryId="newItemCategoryId"
            :onTypeChange="setNewItemTypeId"
            :onCategoryChange="setNewItemCategoryId"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="setCreateDialogOpen(false)">
            Cancel
          </Button>

          <Button type="button" :disabled="creatingItem" @click="handleCreateNewItem">
            <template v-if="creatingItem">
              <Loader2 class="h-4 w-4 animate-spin mr-2" />
              Creating...
            </template>
            <template v-else>
              Create
            </template>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script>
import Button from '../ui/button.vue'
import Card from '../ui/card.vue'
import ScrollArea from '../ui/scrollArea.vue'
import Input from '../ui/input.vue'
import Select from '../ui/select.vue'
import SelectContent from '../ui/selectContent.vue'
import SelectItem from '../ui/selectItem.vue'
import SelectTrigger from '../ui/selectTrigger.vue'
import SelectValue from '../ui/selectValue.vue'
import { Loader2, Search, CheckCircle, X, ChevronDown, ChevronRight } from 'lucide-vue-next'
import Dialog from '../ui/dialog.vue'
import DialogContent from '../ui/dialogContent.vue'
import DialogHeader from '../ui/dialogHeader.vue'
import DialogTitle from '../ui/dialogTitle.vue'
import DialogDescription from '../ui/dialogDescription.vue'
import DialogFooter from '../ui/dialogFooter.vue'
import Label from '../ui/label.vue'
import TypeCategorySelector from './TypeCategorySelector.vue'

export default {
  name: 'MenuMappingStep',

  components: {
    Button,
    Card,
    ScrollArea,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Loader2,
    Search,
    CheckCircle,
    X,
    ChevronDown,
    ChevronRight,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Label,
    TypeCategorySelector,
  },

  props: {
    loading: { type: Boolean, required: true },
    location: { type: String, required: true },
    fnbItems: { type: Array, required: true },
    menuItems: { type: Array, required: true },
    menuMappings: { type: Object, required: true },
    stagedChanges: { type: Object, required: true },
    applyingChanges: { type: Boolean, required: true },
    applyProgress: { type: Object, required: true },

    onMapMenuItem: { type: Function, required: true },
    onUnmapMenuItem: { type: Function, required: true },
    onCreateMenuItem: { type: Function, required: true },
    onApplyChanges: { type: Function, required: true },
    getSuggestedMenuItem: { type: Function, required: true },
  },

  data() {
    return {
      searchTerm: '',
      isSimilarSectionExpanded: true,
      isNoSimilarSectionExpanded: true,
      menuItemSearchTerm: '',
      isMenuMappingTipExpanded: false,

      createDialogOpen: false,
      newItemName: '',
      newItemFnbName: '',
      newItemTypeId: '',
      newItemCategoryId: '',
      creatingItem: false,
    }
  },

  computed: {
    sortedMenuItems() {
      return [...this.menuItems].sort((a, b) => b.name.localeCompare(a.name))
    },

    filteredItems() {
      const term = (this.searchTerm || '').toLowerCase()
      return this.fnbItems.filter((item) => (item.item || '').toLowerCase().includes(term))
    },

    mappedItems() {
      return this.filteredItems.filter((item) => this.menuMappings[item.item])
    },

    unmappedWithSuggestions() {
      return this.filteredItems
        .filter((item) => !this.menuMappings[item.item])
        .filter((item) => this.getSuggestedMenuItem(item.item) !== null)
    },

    unmappedWithoutSuggestions() {
      return this.filteredItems
        .filter((item) => !this.menuMappings[item.item])
        .filter((item) => this.getSuggestedMenuItem(item.item) === null)
    },

    itemsWithSuggestions() {
      return [...this.mappedItems, ...this.unmappedWithSuggestions]
    },
  },

  methods: {
    setSearchTerm(v) {
      this.searchTerm = v
    },
    setIsNoSimilarSectionExpanded(v) {
      this.isNoSimilarSectionExpanded = v
    },
    setMenuItemSearchTerm(v) {
      this.menuItemSearchTerm = v
    },
    setIsMenuMappingTipExpanded(v) {
      this.isMenuMappingTipExpanded = v
    },

    setCreateDialogOpen(v) {
      this.createDialogOpen = v
    },
    setNewItemName(v) {
      this.newItemName = v
    },
    setNewItemFnbName(v) {
      this.newItemFnbName = v
    },
    setNewItemTypeId(v) {
      this.newItemTypeId = v
    },
    setNewItemCategoryId(v) {
      this.newItemCategoryId = v
    },
    setCreatingItem(v) {
      this.creatingItem = v
    },

    openCreateDialog(fnbItemName) {
      this.setNewItemFnbName(fnbItemName)
      this.setNewItemName(fnbItemName)
      this.setNewItemTypeId('')
      this.setNewItemCategoryId('')
      this.setCreateDialogOpen(true)
    },

    mapAllSuggestions() {
      this.unmappedWithSuggestions.forEach((item) => {
        const suggestedMenuItem = this.getSuggestedMenuItem(item.item)
        if (suggestedMenuItem) {
          this.onMapMenuItem(item.item, suggestedMenuItem.id)
        }
      })
    },

    createNewItemForAll() {
      this.unmappedWithoutSuggestions.forEach((item) => {
        this.onCreateMenuItem(item.item)
      })
    },

    handleMenuItemSelect(fnbItemName, value) {
      if (value === '__create__') {
        this.openCreateDialog(fnbItemName)
      } else if (value) {
        this.onMapMenuItem(fnbItemName, value)
      }
      this.setMenuItemSearchTerm('')
    },

    handleCreateNewItem() {
      if (!this.newItemFnbName) return

      this.setCreatingItem(true)
      this.onCreateMenuItem(this.newItemFnbName, this.newItemTypeId, this.newItemCategoryId)
      this.setCreateDialogOpen(false)
      this.setCreatingItem(false)
    },
  },
}
</script>