<template>
  <div>
    <div class="space-y-4">
      <!-- Type Selector -->
      <div>
        <Label>Type *</Label>
        <Select
          :value="localTypeId || ''"
          :onValueChange="handleTypeChange"
        >
          <SelectTrigger @pointerdown.stop>
            <SelectValue placeholder="Select a type..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="type in types"
              :key="type.id"
              :value="type.id"
            >
              {{ type.name }}
            </SelectItem>
            <SelectItem
              value="create-new"
              class="text-blue-600 dark:text-blue-400"
            >
              <Plus class="w-4 h-4 inline mr-2" />
              Create New Type...
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Category Selector -->
      <div>
        <Label>Category *</Label>
        <div class="space-y-2">
          <Select
            :value="localCategoryId || ''"
            :onValueChange="handleCategoryChange"
            :disabled="!localTypeId"
          >
            <SelectTrigger @pointerdown.stop>
              <SelectValue
                :placeholder="
                  localTypeId
                    ? 'Select a category...'
                    : 'Select a type first'
                "
              />
            </SelectTrigger>
            <SelectContent>
              <!-- Search inside dropdown -->
              <div
                v-if="localTypeId && filteredCategories.length > 5"
                class="px-2 pb-2 pt-1 border-b sticky top-0 bg-white dark:bg-gray-950 z-10"
              >
                <div class="relative">
                  <Search class="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search categories..."
                    :value="categorySearch"
                    @input="e => categorySearch = e.target.value"
                    class="pl-8 h-9"
                    @keydown.stop
                  />
                </div>
              </div>

              <SelectItem
                v-for="category in filteredCategories"
                :key="category.id"
                :value="category.id"
              >
                {{ category.name }}
              </SelectItem>

              <SelectItem
                v-if="localTypeId"
                value="create-new"
                class="text-blue-600 dark:text-blue-400"
              >
                <Plus class="w-4 h-4 inline mr-2" />
                Create New Category...
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>

    <!-- Create Type Dialog -->
    <Dialog
      :open="showCreateType"
      :onOpenChange="val => (showCreateType = val)"
    >
      <DialogContent aria-describedby="create-type-description">
        <DialogHeader>
          <DialogTitle>Create New Type</DialogTitle>
          <DialogDescription id="create-type-description">
            Enter a name for the new type. Categories will be organized under
            this type.
          </DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <Label>Type Name</Label>
          <Input
            :value="newTypeName"
            @input="e => newTypeName = e.target.value"
            placeholder="e.g., Combo, Food, Beverage"
            @keydown.enter.prevent="handleCreateType"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            :disabled="creating"
            @click="
              showCreateType = false;
              newTypeName = '';
            "
          >
            Cancel
          </Button>
          <Button
            :disabled="creating || !newTypeName.trim()"
            @click="handleCreateType"
          >
            {{ creating ? 'Creating...' : 'Create Type' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Create Category Dialog -->
    <Dialog
      :open="showCreateCategory"
      :onOpenChange="val => (showCreateCategory = val)"
    >
      <DialogContent aria-describedby="create-category-description">
        <DialogHeader>
          <DialogTitle>Create New Category</DialogTitle>
          <DialogDescription id="create-category-description">
            Enter a name for the new category. It will be added to type:
            <span class="font-medium">{{ selectedType?.name }}</span>
          </DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <Label>Category Name</Label>
          <Input
            :value="newCategoryName"
            @input="e => newCategoryName = e.target.value"
            placeholder="e.g., Menu with Drink, Snack, Beer"
            @keydown.enter.prevent="handleCreateCategory"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            :disabled="creating"
            @click="
              showCreateCategory = false;
              newCategoryName = '';
            "
          >
            Cancel
          </Button>
          <Button
            :disabled="creating || !newCategoryName.trim()"
            @click="handleCreateCategory"
          >
            {{ creating ? 'Creating...' : 'Create Category' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script>
// Adapte les chemins d'import à ton projet Vue
import Label from '../ui/label.vue';
import Select from '../ui/select.vue';
import SelectTrigger from '../ui/selectTrigger.vue';
import SelectContent from '../ui/selectContent.vue';
import SelectItem from '../ui/selectItem.vue';
import SelectValue from '../ui/selectValue.vue';
import Button from '../ui/button.vue';
import Input from '../ui/input.vue';
import Dialog from '../ui/dialog.vue';
import DialogContent from '../ui/dialogContent.vue';
import DialogHeader from '../ui/dialogHeader.vue';
import DialogTitle from '../ui/dialogTitle.vue';
import DialogDescription from '../ui/dialogDescription.vue';
import DialogFooter from '../ui/dialogFooter.vue';
import { Plus, Search } from 'lucide-vue-next';
import * as api from '../utils/api';
// import { toast } from 'vue-sonner' // à adapter selon ta lib de toast

export default {
  name: 'TypeCategorySelector',

  components: {
    Label,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
    Button,
    Input,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Plus,
    Search,
  },

  props: {
    typeId: {
      type: String,
      default: undefined,
    },
    categoryId: {
      type: String,
      default: undefined,
    },
    onTypeChange: {
      type: Function,
      required: true,
    },
    onCategoryChange: {
      type: Function,
      required: true,
    },
  },

  data() {
    return {
      types: [],
      allCategories: [],
      categorySearch: '',
      showCreateType: false,
      showCreateCategory: false,
      newTypeName: '',
      newCategoryName: '',
      creating: false,
      localTypeId: this.typeId || '',
      localCategoryId: this.categoryId || '',
    };
  },

  computed: {
    filteredCategories() {
      if (!this.localTypeId) {
        return [];
      }
      let filtered = this.allCategories.filter(
        cat => cat.typeId === this.localTypeId,
      );

      if (this.categorySearch) {
        const q = this.categorySearch.toLowerCase();
        filtered = filtered.filter(cat =>
          cat.name.toLowerCase().includes(q),
        );
      }

      // tri Z -> A comme dans le TSX
      filtered.sort((a, b) => b.name.localeCompare(a.name));
      return filtered;
    },

    selectedType() {
      return this.types.find(t => t.id === this.localTypeId) || null;
    },

    selectedCategory() {
      return (
        this.allCategories.find(c => c.id === this.localCategoryId) || null
      );
    },
  },

  watch: {
    typeId: {
      immediate: true,
      handler(val) {
        this.localTypeId = val || '';
      },
    },
    categoryId: {
      immediate: true,
      handler(val) {
        this.localCategoryId = val || '';
      },
    },
  },

  mounted() {
    this.loadData();
  },

  methods: {
    async loadData() {
      try {
        const [typesData, categoriesData] = await Promise.all([
          api.getAllTypes(),
          api.getAllCategories(),
        ]);
        this.types = typesData;
        this.allCategories = categoriesData;
      } catch (error) {
        console.error('Error loading types/categories:', error);
        // toast.error?.('Failed to load types and categories');
      }
    },

    handleTypeChange(newTypeId) {
      if (newTypeId === 'create-new') {
        this.showCreateType = true;
        return;
      }

      this.localTypeId = newTypeId;
      this.onTypeChange(newTypeId);

      if (this.localCategoryId) {
        const category = this.allCategories.find(
          c => c.id === this.localCategoryId,
        );
        if (!category || category.typeId !== newTypeId) {
          this.localCategoryId = '';
          this.onCategoryChange(undefined);
        }
      }
    },

    handleCategoryChange(newCategoryId) {
      if (newCategoryId === 'create-new') {
        if (!this.localTypeId) {
          // toast.error?.('Please select a Type first');
          return;
        }
        this.showCreateCategory = true;
        return;
      }

      this.localCategoryId = newCategoryId;
      this.onCategoryChange(newCategoryId);
    },

    async handleCreateType() {
      if (!this.newTypeName.trim()) {
        // toast.error?.('Please enter a type name');
        return;
      }

      this.creating = true;
      try {
        const newType = await api.createType(this.newTypeName.trim());
        this.types = [...this.types, newType];
        this.localTypeId = newType.id;
        this.onTypeChange(newType.id);
        this.newTypeName = '';
        this.showCreateType = false;
        // toast.success?.(`Type "${newType.name}" created`);
      } catch (error) {
        console.error('Error creating type:', error);
        // toast.error?.('Failed to create type');
      } finally {
        this.creating = false;
      }
    },

    async handleCreateCategory() {
      if (!this.newCategoryName.trim()) {
        // toast.error?.('Please enter a category name');
        return;
      }
      if (!this.localTypeId) {
        // toast.error?.('Please select a Type first');
        return;
      }

      this.creating = true;
      try {
        const newCategory = await api.createCategory(
          this.newCategoryName.trim(),
          this.localTypeId,
        );
        this.allCategories = [...this.allCategories, newCategory];
        this.localCategoryId = newCategory.id;
        this.onCategoryChange(newCategory.id);
        this.newCategoryName = '';
        this.showCreateCategory = false;
        // toast.success?.(`Category "${newCategory.name}" created`);
      } catch (error) {
        console.error('Error creating category:', error);
        // toast.error?.('Failed to create category');
      } finally {
        this.creating = false;
      }
    },
  },
};
</script>